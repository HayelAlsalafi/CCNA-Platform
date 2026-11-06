-- SOURCE ONLY / UNREGISTERED / UNAPPLIED. No seed, backfill or existing-row writes.
DO $$ BEGIN
 IF current_user<>'ccna_phase6a_migrator' THEN RAISE EXCEPTION 'Reviewed migrator required' USING ERRCODE='42501'; END IF;
END $$;
CREATE TABLE public.course_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 course_version_id uuid NOT NULL REFERENCES public.course_versions(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'ACTIVE', version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT course_enrollments_owner_version_uq UNIQUE(user_id,course_version_id),
 CONSTRAINT course_enrollments_state_ck CHECK(status IN ('ACTIVE','PAUSED','WITHDRAWN') AND version>0)
);
CREATE INDEX course_enrollments_owner_idx ON public.course_enrollments(user_id,id);
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY course_enrollments_owner_read ON public.course_enrollments FOR SELECT TO ccna_phase6a_app
 USING(user_id=nullif(current_setting('app.study_user',true),'')::uuid);
CREATE TABLE public.course_enrollment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES public.course_enrollments(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,request_hash text NOT NULL,
 before_status text,after_status text NOT NULL,result jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT course_enrollment_events_request_uq UNIQUE(user_id,request_id),
 CONSTRAINT course_enrollment_events_shape_ck CHECK(request_hash ~ '^[a-f0-9]{64}$'
  AND (before_status IS NULL OR before_status IN ('ACTIVE','PAUSED','WITHDRAWN'))
  AND after_status IN ('ACTIVE','PAUSED','WITHDRAWN') AND jsonb_typeof(result)='object')
);
CREATE TABLE public.course_attribution_epochs (
 course_version_id uuid PRIMARY KEY REFERENCES public.course_versions(id) ON DELETE RESTRICT,
 valid_from timestamptz NOT NULL DEFAULT now(),binding_hash text NOT NULL,approval_ref text NOT NULL,
 CONSTRAINT course_attribution_epoch_shape_ck CHECK(binding_hash ~ '^[a-f0-9]{64}$' AND length(trim(approval_ref)) BETWEEN 5 AND 200)
);
CREATE FUNCTION public.course_enrollment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Enrollment evidence must be retained' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='course_enrollment_events' OR TG_TABLE_NAME='course_attribution_epochs' THEN
  RAISE EXCEPTION 'Immutable enrollment evidence' USING ERRCODE='23514';
 END IF;
 IF (NEW.id,NEW.user_id,NEW.course_version_id,NEW.created_at) IS DISTINCT FROM
    (OLD.id,OLD.user_id,OLD.course_version_id,OLD.created_at) OR NEW.version<>OLD.version+1 OR
    NEW.status=OLD.status OR NOT((OLD.status='ACTIVE' AND NEW.status IN ('PAUSED','WITHDRAWN')) OR
      (OLD.status='PAUSED' AND NEW.status IN ('ACTIVE','WITHDRAWN')) OR (OLD.status='WITHDRAWN' AND NEW.status='ACTIVE')) THEN
  RAISE EXCEPTION 'Invalid enrollment transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER course_enrollments_guard BEFORE UPDATE OR DELETE ON public.course_enrollments FOR EACH ROW EXECUTE FUNCTION public.course_enrollment_guard();
CREATE TRIGGER course_enrollments_truncate_guard BEFORE TRUNCATE ON public.course_enrollments FOR EACH STATEMENT EXECUTE FUNCTION public.course_enrollment_guard();
CREATE TRIGGER course_enrollment_events_guard BEFORE UPDATE OR DELETE ON public.course_enrollment_events FOR EACH ROW EXECUTE FUNCTION public.course_enrollment_guard();
CREATE TRIGGER course_enrollment_events_truncate_guard BEFORE TRUNCATE ON public.course_enrollment_events FOR EACH STATEMENT EXECUTE FUNCTION public.course_enrollment_guard();
CREATE TRIGGER course_attribution_epochs_guard BEFORE UPDATE OR DELETE ON public.course_attribution_epochs FOR EACH ROW EXECUTE FUNCTION public.course_enrollment_guard();
CREATE TRIGGER course_attribution_epochs_truncate_guard BEFORE TRUNCATE ON public.course_attribution_epochs FOR EACH STATEMENT EXECUTE FUNCTION public.course_enrollment_guard();

CREATE FUNCTION public.course_epoch_capture() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user<>'ccna_phase6a_migrator' OR to_regprocedure('public.catalog_chapter_binding_guard()') IS NULL THEN
  RAISE EXCEPTION 'Reviewed immutable catalog binding required' USING ERRCODE='42501'; END IF;
 LOCK TABLE public.curriculum_chapters,public.course_versions IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.curriculum_chapters WHERE course_version_id=NEW.course_version_id) THEN
  RAISE EXCEPTION 'A verified bound curriculum is required' USING ERRCODE='23514'; END IF;
 NEW.valid_from:=clock_timestamp();
 SELECT encode(sha256(convert_to(string_agg(id::text||':'||blueprint_id::text,',' ORDER BY id),'UTF8')),'hex')
  INTO NEW.binding_hash FROM public.curriculum_chapters WHERE course_version_id=NEW.course_version_id;
 RETURN NEW;
END $$;
CREATE TRIGGER course_epoch_capture BEFORE INSERT ON public.course_attribution_epochs FOR EACH ROW EXECUTE FUNCTION public.course_epoch_capture();

CREATE FUNCTION public.course_enrollment_read(actor uuid,page_number integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE items jsonb;total bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND status::text='ACTIVE') THEN RAISE EXCEPTION 'Active learner required' USING ERRCODE='42501'; END IF;
 IF page_number IS NULL OR page_number NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO total FROM public.course_enrollments WHERE user_id=actor;
 SELECT coalesce(jsonb_agg(to_jsonb(entry) ORDER BY entry.id),'[]'::jsonb) INTO items FROM
  (SELECT e.id,v.course_id AS "courseId",e.course_version_id AS "versionId",e.status,e.version,
    e.created_at AS "createdAt",e.updated_at AS "updatedAt"
   FROM public.course_enrollments e JOIN public.course_versions v ON v.id=e.course_version_id
   WHERE e.user_id=actor ORDER BY e.id LIMIT 20 OFFSET (page_number-1)*20) entry;
 RETURN jsonb_build_object('items',items,'total',total,'page',page_number,'pageSize',20);
END $$;

-- Self-service learning intent only. No entitlement/policy/role writes or grants.
CREATE FUNCTION public.course_enrollment_change(actor uuid,selected_course uuid,selected_version uuid,next_status text,expected_version integer,request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' SET lock_timeout='3s' AS $$
DECLARE before_row public.course_enrollments%ROWTYPE;after_row public.course_enrollments%ROWTYPE;
 prior public.course_enrollment_events%ROWTYPE;digest text;answer jsonb;has_enrollment boolean;
BEGIN
 IF actor IS NULL OR selected_course IS NULL OR selected_version IS NULL OR request IS NULL OR
    expected_version IS NULL OR expected_version NOT BETWEEN 0 AND 2147483646 OR
    next_status IS NULL OR next_status NOT IN ('ACTIVE','PAUSED','WITHDRAWN') THEN
  RAISE EXCEPTION 'Invalid enrollment input' USING ERRCODE='22023'; END IF;
 -- One request lock plus one learner/version lock. Repeated-request payloads
 -- conflict rather than create multiple events; no automatic retry.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':enrollment-request:'||request::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':enrollment-version:'||selected_version::text,0));
 PERFORM 1 FROM public.users WHERE id=actor AND status::text='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active learner required' USING ERRCODE='42501'; END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(actor,selected_course,selected_version,next_status,expected_version)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM public.course_enrollment_events WHERE user_id=actor AND request_id=request;
 IF FOUND THEN
  IF prior.request_hash<>digest THEN RAISE EXCEPTION 'Enrollment request conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO before_row FROM public.course_enrollments WHERE user_id=actor AND course_version_id=selected_version FOR UPDATE;
 has_enrollment:=FOUND;
 IF NOT has_enrollment AND next_status<>'ACTIVE' THEN
  RAISE EXCEPTION 'Owned enrollment required' USING ERRCODE='42501'; END IF;
 -- Exact belonging context even for pause/withdraw; never rebind an enrollment.
 IF NOT EXISTS(SELECT 1 FROM public.course_versions WHERE id=selected_version AND course_id=selected_course) THEN
  RAISE EXCEPTION 'Course/version mismatch' USING ERRCODE='22023'; END IF;
 -- Leaving/pausing remains possible after retirement; new/reopened intent needs
 -- a published catalog, but enrollment itself still grants no content access.
 IF next_status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
  JOIN public.tracks t ON t.id=c.track_id JOIN public.exam_blueprints b ON b.id=v.blueprint_id
  WHERE v.id=selected_version AND c.id=selected_course AND v.status='ACTIVE' AND c.status='ACTIVE' AND t.status='ACTIVE' AND b.status='ACTIVE') THEN
  RAISE EXCEPTION 'Catalog version unavailable' USING ERRCODE='23514'; END IF;
 IF NOT has_enrollment THEN
  IF expected_version<>0 OR next_status<>'ACTIVE' THEN RAISE EXCEPTION 'Initial enrollment must be ACTIVE' USING ERRCODE='40001'; END IF;
  INSERT INTO public.course_enrollments(user_id,course_version_id) VALUES(actor,selected_version) RETURNING * INTO after_row;
 ELSE
  IF before_row.version<>expected_version THEN RAISE EXCEPTION 'Stale enrollment version' USING ERRCODE='40001'; END IF;
  UPDATE public.course_enrollments SET status=next_status,version=version+1,updated_at=clock_timestamp()
   WHERE id=before_row.id AND user_id=actor RETURNING * INTO after_row;
 END IF;
 answer:=jsonb_build_object('id',after_row.id,'courseId',selected_course,'versionId',selected_version,'status',after_row.status,'version',after_row.version);
 INSERT INTO public.course_enrollment_events(enrollment_id,user_id,request_id,request_hash,before_status,after_status,result)
  VALUES(after_row.id,actor,request,digest,before_row.status,after_row.status,answer);
 RETURN answer;
END $$;
REVOKE ALL ON TABLE public.course_enrollments,public.course_enrollment_events,public.course_attribution_epochs FROM PUBLIC,ccna_phase6a_app;
REVOKE ALL ON FUNCTION public.course_enrollment_guard(),public.course_epoch_capture(),public.course_enrollment_read(uuid,integer),public.course_enrollment_change(uuid,uuid,uuid,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.course_enrollment_read(uuid,integer),public.course_enrollment_change(uuid,uuid,uuid,text,integer,uuid) TO ccna_phase6a_app;
-- Ordinary API analytics stay non-definer under app.study_user RLS. They need
-- only owner-filtered enrollment existence plus public proof metadata, not events.
GRANT SELECT ON TABLE public.course_enrollments TO ccna_phase6a_app;
GRANT SELECT(course_version_id,valid_from,binding_hash) ON TABLE public.course_attribution_epochs TO ccna_phase6a_app;
-- No existing table grants/RLS changed. No epoch is inserted or history relabeled.
