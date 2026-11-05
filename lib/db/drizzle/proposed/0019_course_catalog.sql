-- SOURCE PROPOSAL ONLY. Not registered/applied. Dedicated reviewed executor required.
-- No replacement of existing CCNA CHECKs, IDs, RLS, or content permissions.
DO $$ BEGIN
  IF current_user <> 'ccna_phase6a_migrator' THEN
    RAISE EXCEPTION 'Catalog proposal requires reviewed migrator' USING ERRCODE='42501';
  END IF;
END $$;
CREATE TABLE public.tracks (
  id uuid PRIMARY KEY,
  slug varchar(100) NOT NULL UNIQUE CONSTRAINT tracks_slug_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title varchar(180) NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar(10) NOT NULL DEFAULT 'DRAFT' CONSTRAINT tracks_status_ck CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.courses (
  id uuid PRIMARY KEY,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE RESTRICT,
  slug varchar(100) NOT NULL UNIQUE CONSTRAINT courses_slug_ck CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title varchar(180) NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar(10) NOT NULL DEFAULT 'DRAFT' CONSTRAINT courses_status_ck CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.course_versions (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  blueprint_id uuid NOT NULL UNIQUE REFERENCES public.exam_blueprints(id) ON DELETE RESTRICT,
  version_key varchar(100) NOT NULL,
  catalog_key varchar(160) NOT NULL UNIQUE,
  title varchar(180) NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar(10) NOT NULL DEFAULT 'DRAFT' CONSTRAINT course_versions_status_ck CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_versions_course_key_uq UNIQUE(course_id,version_key),
  CONSTRAINT course_versions_blueprint_binding_uq UNIQUE(id,blueprint_id),
  CONSTRAINT course_versions_keys_ck CHECK (length(trim(version_key))>0 AND length(trim(catalog_key))>0)
);
ALTER TABLE public.curriculum_chapters ADD COLUMN course_version_id uuid;
ALTER TABLE public.curriculum_chapters ADD CONSTRAINT curriculum_chapters_course_version_fk
  FOREIGN KEY(course_version_id,blueprint_id) REFERENCES public.course_versions(id,blueprint_id) ON DELETE RESTRICT;
CREATE INDEX curriculum_chapters_course_version_idx ON public.curriculum_chapters(course_version_id,id);

-- The existing app has table-level chapter INSERT/UPDATE. A column REVOKE alone
-- cannot protect the new binding. Legacy NULL inserts remain valid.
CREATE FUNCTION public.catalog_chapter_binding_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.course_version_id IS NOT NULL AND
    (NEW.course_version_id IS DISTINCT FROM OLD.course_version_id OR NEW.blueprint_id IS DISTINCT FROM OLD.blueprint_id) THEN
    RAISE EXCEPTION 'Catalog binding is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.course_version_id IS NOT NULL AND
    (TG_OP='INSERT' OR OLD.course_version_id IS NULL) AND current_user <> 'ccna_phase6a_migrator' THEN
    RAISE EXCEPTION 'Catalog binding requires reviewed migration' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_chapter_binding_guard BEFORE INSERT OR UPDATE ON public.curriculum_chapters
  FOR EACH ROW EXECUTE FUNCTION public.catalog_chapter_binding_guard();

CREATE FUNCTION public.catalog_identity_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['title','description','status','display_order','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['title','description','status','display_order','updated_at']) THEN
    RAISE EXCEPTION 'Catalog identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tracks_identity_guard BEFORE UPDATE ON public.tracks FOR EACH ROW EXECUTE FUNCTION public.catalog_identity_guard();
CREATE TRIGGER courses_identity_guard BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.catalog_identity_guard();
CREATE TRIGGER course_versions_identity_guard BEFORE UPDATE ON public.course_versions FOR EACH ROW EXECUTE FUNCTION public.catalog_identity_guard();
REVOKE ALL ON FUNCTION public.catalog_identity_guard(), public.catalog_chapter_binding_guard() FROM PUBLIC;
REVOKE ALL ON TABLE public.tracks, public.courses, public.course_versions FROM PUBLIC, ccna_phase6a_app;
GRANT SELECT ON TABLE public.tracks, public.courses, public.course_versions TO ccna_phase6a_app;
-- No manager/role-assignment grant, no entitlement and no catalog publication API.
