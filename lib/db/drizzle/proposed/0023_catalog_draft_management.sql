-- SOURCE ONLY / UNREGISTERED. No seed, publication, identity backfill or activation.
DO $$ BEGIN
 IF current_user<>'ccna_phase6a_migrator' THEN RAISE EXCEPTION 'Reviewed migrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ccna_rbac_manager' AND rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=to_regrole('ccna_rbac_manager') OR roleid=to_regrole('ccna_rbac_manager')) THEN
  RAISE EXCEPTION 'Reviewed dedicated manager required' USING ERRCODE='42501'; END IF;
 IF has_schema_privilege('ccna_rbac_manager','public','CREATE') OR has_database_privilege('ccna_rbac_manager',current_database(),'CREATE,TEMP')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
  (has_table_privilege('ccna_rbac_manager',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('ccna_rbac_manager',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) THEN
  RAISE EXCEPTION 'Unexpected manager table/schema authority' USING ERRCODE='42501'; END IF;
END $$;
CREATE TABLE public.catalog_draft_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL,request_hash text NOT NULL,
 kind text NOT NULL,target_id uuid NOT NULL,reason text NOT NULL,before_state jsonb,result jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT catalog_draft_events_request_uq UNIQUE(actor_id,request_id),
 CONSTRAINT catalog_draft_events_shape_ck CHECK(kind IN ('tracks','courses','versions') AND request_hash ~ '^[a-f0-9]{64}$'
  AND length(trim(reason)) BETWEEN 5 AND 500 AND (before_state IS NULL OR jsonb_typeof(before_state)='object') AND jsonb_typeof(result)='object')
);
CREATE FUNCTION public.catalog_draft_evidence_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable catalog operation evidence' USING ERRCODE='23514'; END $$;
CREATE TRIGGER catalog_draft_evidence_guard BEFORE UPDATE OR DELETE ON public.catalog_draft_events FOR EACH ROW EXECUTE FUNCTION public.catalog_draft_evidence_guard();
CREATE TRIGGER catalog_draft_evidence_truncate_guard BEFORE TRUNCATE ON public.catalog_draft_events FOR EACH STATEMENT EXECUTE FUNCTION public.catalog_draft_evidence_guard();

-- Forward protection; never replace the historical identity guard.
CREATE FUNCTION public.catalog_published_version_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.status<>'DRAFT' THEN RAISE EXCEPTION 'Published/retired version is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_published_version_guard BEFORE UPDATE ON public.course_versions FOR EACH ROW EXECUTE FUNCTION public.catalog_published_version_guard();

CREATE FUNCTION public.catalog_draft_read(actor uuid,kind text,parent uuid,page_number integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='5s' AS $$
DECLARE assigned text;items jsonb;total bigint;
BEGIN
 assigned:=public.global_rbac_context(actor)->>'role';
 IF assigned IS NULL OR assigned NOT IN ('OWNER','ADMIN') THEN RAISE EXCEPTION 'GLOBAL draft authority required' USING ERRCODE='42501'; END IF;
 IF page_number IS NULL OR page_number NOT BETWEEN 1 AND 10000 OR kind IS NULL OR kind NOT IN ('tracks','courses','versions')
  OR (kind='tracks' AND parent IS NOT NULL) OR (kind<>'tracks' AND parent IS NULL) THEN RAISE EXCEPTION 'Invalid draft context' USING ERRCODE='22023'; END IF;
 IF (kind='courses' AND NOT EXISTS(SELECT 1 FROM public.tracks WHERE id=parent)) OR
    (kind='versions' AND NOT EXISTS(SELECT 1 FROM public.courses WHERE id=parent)) THEN
  RAISE EXCEPTION 'Catalog parent unavailable' USING ERRCODE='P0002'; END IF;
 WITH drafts AS (
  SELECT id,title,description,display_order,updated_at FROM public.tracks WHERE kind='tracks' AND status='DRAFT'
  UNION ALL SELECT id,title,description,display_order,updated_at FROM public.courses WHERE kind='courses' AND status='DRAFT' AND track_id=parent
  UNION ALL SELECT id,title,description,display_order,updated_at FROM public.course_versions WHERE kind='versions' AND status='DRAFT' AND course_id=parent
 ), paged AS (SELECT * FROM drafts ORDER BY id LIMIT 20 OFFSET (page_number-1)*20)
 SELECT (SELECT count(*) FROM drafts),coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,
  'displayOrder',display_order,'status','DRAFT','version',to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY id),'[]'::jsonb)
 INTO total,items FROM paged;
 RETURN jsonb_build_object('items',items,'page',page_number,'pageSize',20,'total',total);
END $$;

CREATE FUNCTION public.catalog_draft_change(actor uuid,kind text,target uuid,expected_version text,request uuid,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='8s' SET lock_timeout='3s' AS $$
DECLARE assigned text;digest text;prior public.catalog_draft_events%ROWTYPE;before_row jsonb;after_row jsonb;
 selected uuid;parent uuid;blueprint uuid;title_value text;description_value text;order_value integer;new_time timestamptz;answer jsonb;
BEGIN
 IF actor IS NULL OR request IS NULL OR kind IS NULL OR kind NOT IN ('tracks','courses','versions') OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid draft request' USING ERRCODE='22023'; END IF;
 -- Same authority serialization as 0018: stale repeatable-read authority writers
 -- fail, rather than authorize using an obsolete assignment snapshot.
 UPDATE public.global_rbac_guard SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authority guard unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.users WHERE id=actor AND status::text='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active actor required' USING ERRCODE='42501'; END IF;
 assigned:=public.global_rbac_context(actor)->>'role';
 IF assigned IS NULL OR assigned NOT IN ('OWNER','ADMIN') THEN RAISE EXCEPTION 'GLOBAL draft authority required' USING ERRCODE='42501'; END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(actor,kind,target,expected_version,payload)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM public.catalog_draft_events WHERE actor_id=actor AND request_id=request;
 IF FOUND THEN
  IF prior.request_hash<>digest THEN RAISE EXCEPTION 'Draft request conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 IF jsonb_typeof(payload->'title') IS DISTINCT FROM 'string' OR length(trim(payload->>'title')) NOT BETWEEN 1 AND 180
 OR jsonb_typeof(payload->'description') IS DISTINCT FROM 'string' OR length(trim(payload->>'description'))>4000
 OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR length(trim(payload->>'reason')) NOT BETWEEN 5 AND 500
 OR jsonb_typeof(payload->'displayOrder') IS DISTINCT FROM 'number' OR (payload->>'displayOrder') !~ '^[0-9]{1,6}$'
 OR (payload->>'displayOrder')::integer NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid draft metadata' USING ERRCODE='22023'; END IF;
 title_value:=trim(payload->>'title');description_value:=trim(payload->>'description');order_value:=(payload->>'displayOrder')::integer;
 IF target IS NULL THEN
  IF expected_version IS NOT NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN
   ('title','description','displayOrder','reason','slug','trackId','courseId','blueprintId','versionKey','catalogKey')) THEN RAISE EXCEPTION 'Invalid creation fields' USING ERRCODE='22023'; END IF;
  IF kind IN ('tracks','courses') THEN
   IF jsonb_typeof(payload->'slug') IS DISTINCT FROM 'string' OR length(payload->>'slug')>100 OR (payload->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('title','description','displayOrder','reason','slug','trackId'))
    OR (kind='tracks' AND payload ? 'trackId') THEN RAISE EXCEPTION 'Invalid draft slug/identity' USING ERRCODE='22023'; END IF;
  END IF;
  selected:=gen_random_uuid();
  IF kind='tracks' THEN
   INSERT INTO public.tracks(id,slug,title,description,display_order,status) VALUES(selected,payload->>'slug',title_value,description_value,order_value,'DRAFT') RETURNING to_jsonb(tracks.*) INTO after_row;
  ELSIF kind='courses' THEN
   IF jsonb_typeof(payload->'trackId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Track identity required' USING ERRCODE='22023'; END IF;
   parent:=(payload->>'trackId')::uuid;
   PERFORM 1 FROM public.tracks WHERE id=parent AND status IN ('DRAFT','ACTIVE') FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Track unavailable' USING ERRCODE='23514'; END IF;
   INSERT INTO public.courses(id,track_id,slug,title,description,display_order,status) VALUES(selected,parent,payload->>'slug',title_value,description_value,order_value,'DRAFT') RETURNING to_jsonb(courses.*) INTO after_row;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('title','description','displayOrder','reason','courseId','blueprintId','versionKey','catalogKey'))
    OR jsonb_typeof(payload->'versionKey') IS DISTINCT FROM 'string' OR (payload->>'versionKey') !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
    OR jsonb_typeof(payload->'catalogKey') IS DISTINCT FROM 'string' OR length(payload->>'catalogKey')>100 OR (payload->>'catalogKey') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid version identity' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(payload->'courseId') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'blueprintId') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Course/blueprint identity required' USING ERRCODE='22023'; END IF;
   parent:=(payload->>'courseId')::uuid;blueprint:=(payload->>'blueprintId')::uuid;
   PERFORM 1 FROM public.courses c JOIN public.tracks t ON t.id=c.track_id WHERE c.id=parent AND c.status IN ('DRAFT','ACTIVE') AND t.status IN ('DRAFT','ACTIVE') FOR SHARE OF c,t;
   IF NOT FOUND THEN RAISE EXCEPTION 'Course unavailable' USING ERRCODE='23514'; END IF;
   PERFORM 1 FROM public.exam_blueprints WHERE id=blueprint AND status::text='DRAFT' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Dedicated draft blueprint required' USING ERRCODE='23514'; END IF;
   INSERT INTO public.course_versions(id,course_id,blueprint_id,version_key,catalog_key,title,description,display_order,status)
    VALUES(selected,parent,blueprint,payload->>'versionKey',payload->>'catalogKey',title_value,description_value,order_value,'DRAFT') RETURNING to_jsonb(course_versions.*) INTO after_row;
  END IF;
 ELSE
  IF expected_version IS NULL OR expected_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('title','description','displayOrder','reason')) THEN RAISE EXCEPTION 'Exact draft version and metadata only required' USING ERRCODE='22023'; END IF;
  selected:=target;
  IF kind='tracks' THEN SELECT to_jsonb(t.*) INTO before_row FROM public.tracks t WHERE t.id=target FOR UPDATE;
  ELSIF kind='courses' THEN SELECT to_jsonb(c.*) INTO before_row FROM public.courses c WHERE c.id=target FOR UPDATE;
  ELSE SELECT to_jsonb(v.*) INTO before_row FROM public.course_versions v WHERE v.id=target FOR UPDATE; END IF;
  IF before_row IS NULL THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='P0002'; END IF;
  IF before_row->>'status'<>'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT may be edited' USING ERRCODE='23514'; END IF;
  IF (before_row->>'updated_at')::timestamptz<>expected_version::timestamptz THEN RAISE EXCEPTION 'Stale draft' USING ERRCODE='40001'; END IF;
  IF kind='courses' THEN
   PERFORM 1 FROM public.tracks WHERE id=(before_row->>'track_id')::uuid AND status IN ('DRAFT','ACTIVE') FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Track unavailable' USING ERRCODE='23514'; END IF;
  ELSIF kind='versions' THEN
   PERFORM 1 FROM public.courses c JOIN public.tracks t ON t.id=c.track_id
    WHERE c.id=(before_row->>'course_id')::uuid AND c.status IN ('DRAFT','ACTIVE') AND t.status IN ('DRAFT','ACTIVE') FOR SHARE OF c,t;
   IF NOT FOUND THEN RAISE EXCEPTION 'Course unavailable' USING ERRCODE='23514'; END IF;
   PERFORM 1 FROM public.exam_blueprints WHERE id=(before_row->>'blueprint_id')::uuid AND status::text='DRAFT' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Draft blueprint required' USING ERRCODE='23514'; END IF;
  END IF;
  -- Prevent a new binding/enrollment/epoch from racing the protected-use check.
  LOCK TABLE public.curriculum_chapters,public.course_enrollments,public.course_attribution_epochs IN SHARE MODE;
  IF EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
    WHERE ((kind='versions' AND v.id=target) OR (kind='courses' AND c.id=target) OR (kind='tracks' AND c.track_id=target))
    AND (EXISTS(SELECT 1 FROM public.curriculum_chapters ch WHERE ch.course_version_id=v.id)
      OR EXISTS(SELECT 1 FROM public.course_enrollments en WHERE en.course_version_id=v.id)
      OR EXISTS(SELECT 1 FROM public.course_attribution_epochs e WHERE e.course_version_id=v.id))) THEN
    RAISE EXCEPTION 'Bound/used catalog metadata is protected' USING ERRCODE='23514'; END IF;
  new_time:=greatest(clock_timestamp(),(before_row->>'updated_at')::timestamptz+interval '1 microsecond');
  IF kind='tracks' THEN UPDATE public.tracks SET title=title_value,description=description_value,display_order=order_value,updated_at=new_time WHERE id=target RETURNING to_jsonb(tracks.*) INTO after_row;
  ELSIF kind='courses' THEN UPDATE public.courses SET title=title_value,description=description_value,display_order=order_value,updated_at=new_time WHERE id=target RETURNING to_jsonb(courses.*) INTO after_row;
  ELSE UPDATE public.course_versions SET title=title_value,description=description_value,display_order=order_value,updated_at=new_time WHERE id=target RETURNING to_jsonb(course_versions.*) INTO after_row; END IF;
 END IF;
 answer:=jsonb_build_object('id',selected,'title',after_row->>'title','description',after_row->>'description','displayOrder',(after_row->>'display_order')::integer,
  'status','DRAFT','version',to_char((after_row->>'updated_at')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 INSERT INTO public.catalog_draft_events(actor_id,request_id,request_hash,kind,target_id,reason,before_state,result)
  VALUES(actor,request,digest,kind,selected,trim(payload->>'reason'),before_row,answer);
 RETURN answer;
END $$;
REVOKE ALL ON TABLE public.catalog_draft_events FROM PUBLIC,ccna_phase6a_app,ccna_rbac_manager;
REVOKE ALL ON FUNCTION public.catalog_draft_evidence_guard(),public.catalog_published_version_guard(),public.catalog_draft_read(uuid,text,uuid,integer),public.catalog_draft_change(uuid,text,uuid,text,uuid,jsonb) FROM PUBLIC,ccna_phase6a_app,ccna_rbac_manager;
GRANT EXECUTE ON FUNCTION public.catalog_draft_read(uuid,text,uuid,integer) TO ccna_phase6a_app;
GRANT EXECUTE ON FUNCTION public.catalog_draft_change(uuid,text,uuid,text,uuid,jsonb) TO ccna_rbac_manager;
-- Existing catalog identity/CCNA/deletion/RLS guards and application grants stay intact.
