-- SOURCE PROPOSAL ONLY. No registration, activation, seed or manual grant.
-- Requires separately reviewed catalog activation and lesson-deletion dependency
-- handling BEFORE installation. Do not run with unrestricted migrate.
DO $$ BEGIN
  IF current_user <> 'ccna_phase6a_migrator' THEN
    RAISE EXCEPTION 'Reviewed migrator required' USING ERRCODE='42501';
  END IF;
END $$;
CREATE TABLE public.content_access_policies (
  id uuid PRIMARY KEY,
  kind varchar(10) NOT NULL,
  course_id uuid UNIQUE REFERENCES public.courses(id) ON DELETE RESTRICT,
  course_version_id uuid UNIQUE REFERENCES public.course_versions(id) ON DELETE RESTRICT,
  lesson_id uuid UNIQUE REFERENCES public.lessons(id) ON DELETE RESTRICT,
  policy varchar(20) NOT NULL DEFAULT 'ENTITLED',
  free_actions jsonb NOT NULL DEFAULT '[]', preview_actions jsonb NOT NULL DEFAULT '[]',
  preview_revision_id uuid,
  CONSTRAINT content_access_resource_ck CHECK (
    (kind='COURSE' AND course_id IS NOT NULL AND course_version_id IS NULL AND lesson_id IS NULL) OR
    (kind='VERSION' AND course_id IS NULL AND course_version_id IS NOT NULL AND lesson_id IS NULL) OR
    (kind='LESSON' AND course_id IS NULL AND course_version_id IS NULL AND lesson_id IS NOT NULL)),
  CONSTRAINT content_access_policy_ck CHECK (policy IN ('FREE_OPEN','FREE_PREVIEW','ENTITLED')),
  CONSTRAINT content_access_actions_ck CHECK (jsonb_typeof(free_actions)='array' AND jsonb_typeof(preview_actions)='array'
    AND free_actions <@ '["metadata.read","lesson.read","media.read","practice.start","exam.start"]'::jsonb
    AND preview_actions <@ '["metadata.read","lesson.read","media.read"]'::jsonb),
  CONSTRAINT content_access_preview_ck CHECK (
    (preview_revision_id IS NULL OR (kind='LESSON' AND policy='FREE_PREVIEW')) AND
    (policy='FREE_OPEN' OR free_actions='[]'::jsonb) AND (policy='FREE_PREVIEW' OR preview_actions='[]'::jsonb)),
  CONSTRAINT content_access_preview_revision_fk FOREIGN KEY(preview_revision_id,lesson_id)
    REFERENCES public.lesson_revisions(id,lesson_id) ON DELETE RESTRICT
);
CREATE TABLE public.manual_entitlements (
  id uuid PRIMARY KEY,
  resource_id uuid NOT NULL REFERENCES public.content_access_policies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actions jsonb NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz,
  granted_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL, request_id uuid NOT NULL UNIQUE,
  revoked_at timestamptz, revoked_by uuid REFERENCES public.users(id) ON DELETE RESTRICT, revoke_reason text,
  CONSTRAINT manual_entitlements_window_ck CHECK (ends_at IS NULL OR ends_at>starts_at),
  CONSTRAINT manual_entitlements_actions_ck CHECK (jsonb_typeof(actions)='array' AND jsonb_array_length(actions) BETWEEN 1 AND 5
    AND actions <@ '["metadata.read","lesson.read","media.read","practice.start","exam.start"]'::jsonb),
  CONSTRAINT manual_entitlements_reason_ck CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  CONSTRAINT manual_entitlements_revocation_ck CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL AND length(trim(revoke_reason)) BETWEEN 5 AND 500))
);
CREATE INDEX manual_entitlements_user_resource_idx ON public.manual_entitlements(user_id,resource_id);

CREATE FUNCTION public.content_access_identity_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Access records must be retained' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='content_access_policies' THEN
    IF (NEW.id,NEW.kind,NEW.course_id,NEW.course_version_id,NEW.lesson_id) IS DISTINCT FROM
       (OLD.id,OLD.kind,OLD.course_id,OLD.course_version_id,OLD.lesson_id) THEN
      RAISE EXCEPTION 'Resource identity is immutable' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.revoked_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['revoked_at','revoked_by','revoke_reason']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['revoked_at','revoked_by','revoke_reason']) THEN
      RAISE EXCEPTION 'Entitlement is immutable except one revocation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER content_access_identity_guard BEFORE UPDATE OR DELETE ON public.content_access_policies
  FOR EACH ROW EXECUTE FUNCTION public.content_access_identity_guard();
CREATE TRIGGER content_access_truncate_guard BEFORE TRUNCATE ON public.content_access_policies
  FOR EACH STATEMENT EXECUTE FUNCTION public.content_access_identity_guard();
CREATE TRIGGER manual_entitlements_identity_guard BEFORE UPDATE OR DELETE ON public.manual_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.content_access_identity_guard();
CREATE TRIGGER manual_entitlements_truncate_guard BEFORE TRUNCATE ON public.manual_entitlements
  FOR EACH STATEMENT EXECUTE FUNCTION public.content_access_identity_guard();

-- Narrow app read only. Identity is supplied by trusted, verified API middleware,
-- not independently proved by PostgreSQL; no role is interpreted as a purchase.
CREATE FUNCTION public.content_access_context(actor uuid, resource_kind text, target uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
SET statement_timeout='5000' SET lock_timeout='2000' AS $$
  SELECT jsonb_build_object(
    'actorActive',EXISTS(SELECT 1 FROM public.users u WHERE u.id=actor AND u.status='ACTIVE'),
    'resource',jsonb_build_object('kind',p.kind,'id',target,'policy',p.policy,
      'freeActions',p.free_actions,'previewActions',p.preview_actions,
      'publishedRevisionId',r.id,'previewRevisionId',p.preview_revision_id,
      'available',COALESCE(c.status='ACTIVE' AND t.status='ACTIVE' AND
        (p.kind='COURSE' OR (v.status='ACTIVE' AND b.status='ACTIVE')) AND
        (p.kind<>'LESSON' OR (tp.status='ACTIVE' AND r.id IS NOT NULL AND r.snapshot->>'chapterId'=ch.id::text)),false)),
    'grants',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',e.user_id,'resourceId',target,'actions',e.actions,
       'startsAt',e.starts_at,'endsAt',e.ends_at,'revokedAt',e.revoked_at))
       FROM (SELECT * FROM public.manual_entitlements WHERE resource_id=p.id AND user_id=actor
         AND revoked_at IS NULL AND starts_at<=statement_timestamp() AND (ends_at IS NULL OR ends_at>statement_timestamp())
         ORDER BY id LIMIT 1001) e),'[]'::jsonb))
  FROM public.content_access_policies p
  LEFT JOIN public.lessons l ON l.id=p.lesson_id
  LEFT JOIN public.lesson_revisions r ON r.id=l.published_revision_id AND r.lesson_id=l.id
  LEFT JOIN public.curriculum_chapters ch ON ch.id=l.chapter_id
  LEFT JOIN public.topics tp ON tp.id=ch.id
  LEFT JOIN public.course_versions v ON v.id=COALESCE(p.course_version_id,ch.course_version_id)
    AND (p.kind<>'LESSON' OR v.blueprint_id=ch.blueprint_id)
  LEFT JOIN public.courses c ON c.id=COALESCE(p.course_id,v.course_id)
  LEFT JOIN public.tracks t ON t.id=c.track_id
  LEFT JOIN public.exam_blueprints b ON b.id=v.blueprint_id
  WHERE p.kind=resource_kind AND CASE p.kind WHEN 'COURSE' THEN p.course_id WHEN 'VERSION' THEN p.course_version_id WHEN 'LESSON' THEN p.lesson_id END=target
$$;
REVOKE ALL ON TABLE public.content_access_policies, public.manual_entitlements FROM PUBLIC, ccna_phase6a_app;
REVOKE ALL ON FUNCTION public.content_access_identity_guard(), public.content_access_context(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.content_access_context(uuid,text,uuid) TO ccna_phase6a_app;
-- No management EXECUTE, no API INSERT/UPDATE, no RBAC permission invented.
-- Separate reviewed/audited management operations are an activation dependency.
