-- PROPOSAL ONLY / UNREGISTERED. Requires separate activation and bootstrap approval.
-- No legacy user role/status, learner, question, lesson, revision or media row is changed.
-- Dedicated manager LOGIN must be provisioned separately; no CREATE ROLE here.
DO $$ BEGIN
 IF current_user<>'ccna_phase6a_migrator' THEN RAISE EXCEPTION 'Reviewed migrator required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ccna_rbac_manager' AND rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=to_regrole('ccna_rbac_manager') OR roleid=to_regrole('ccna_rbac_manager')) THEN
  RAISE EXCEPTION 'Separately reviewed least-privilege manager required';
 END IF;
 IF has_schema_privilege('ccna_rbac_manager','public','CREATE') OR has_database_privilege('ccna_rbac_manager',current_database(),'CREATE,TEMP')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
  (has_table_privilege('ccna_rbac_manager',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('ccna_rbac_manager',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' AND has_sequence_privilege('ccna_rbac_manager',c.oid,'USAGE,SELECT,UPDATE')) THEN
  RAISE EXCEPTION 'Manager has unexpected existing authority';
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE public.global_rbac_guard (
 singleton boolean PRIMARY KEY,
 revision integer NOT NULL DEFAULT 0,
 CONSTRAINT global_rbac_guard_singleton_ck CHECK(singleton AND revision>=0)
);
--> statement-breakpoint
INSERT INTO public.global_rbac_guard(singleton) VALUES(true);
--> statement-breakpoint
CREATE TABLE public.global_role_assignments (
 user_id uuid PRIMARY KEY CONSTRAINT global_role_assignments_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 scope text NOT NULL DEFAULT 'GLOBAL' CONSTRAINT global_roles_scope_ck CHECK(scope='GLOBAL'),
 role text NOT NULL CONSTRAINT global_roles_role_ck CHECK(role IN ('OWNER','ADMIN','CONTENT_MANAGER','STUDENT')),
 version integer NOT NULL DEFAULT 1 CONSTRAINT global_roles_version_ck CHECK(version>0),
 revoked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX global_roles_active_idx ON public.global_role_assignments(role,revoked_at,user_id);
--> statement-breakpoint
CREATE TABLE public.admin_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL CONSTRAINT admin_audit_request_uq UNIQUE,
 actor_id uuid CONSTRAINT admin_audit_events_actor_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 target_id uuid NOT NULL CONSTRAINT admin_audit_events_target_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 action text NOT NULL, scope text NOT NULL DEFAULT 'GLOBAL', reason text NOT NULL,
 approval_ref text, before_state jsonb, after_state jsonb NOT NULL,
 request_hash text NOT NULL, result jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT admin_audit_shape_ck CHECK(scope='GLOBAL' AND length(reason) BETWEEN 5 AND 500 AND request_hash ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(after_state)='object' AND jsonb_typeof(result)='object' AND (before_state IS NULL OR jsonb_typeof(before_state)='object')
  AND ((action='ROLE_CHANGE' AND actor_id IS NOT NULL AND approval_ref IS NULL)
   OR (action='OWNER_BOOTSTRAP' AND actor_id IS NULL AND approval_ref IS NOT NULL AND length(approval_ref) BETWEEN 5 AND 200)))
);
--> statement-breakpoint
CREATE INDEX admin_audit_time_idx ON public.admin_audit_events(occurred_at,id);
--> statement-breakpoint
CREATE FUNCTION public.global_rbac_context(actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE assigned text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND status::text='ACTIVE') THEN RAISE EXCEPTION 'Inactive actor' USING ERRCODE='42501'; END IF;
 SELECT role INTO assigned FROM public.global_role_assignments WHERE user_id=actor AND revoked_at IS NULL AND scope='GLOBAL';
 RETURN jsonb_build_object('role',assigned,'scope','GLOBAL');
END $$;
--> statement-breakpoint
CREATE FUNCTION public.global_rbac_read(actor uuid, section text, page_number integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' AS $$
DECLARE assigned text; items jsonb; total bigint;
BEGIN
 assigned:=public.global_rbac_context(actor)->>'role';
 IF assigned IS NULL OR assigned NOT IN ('OWNER','ADMIN') THEN RAISE EXCEPTION 'RBAC read denied' USING ERRCODE='42501'; END IF;
 IF page_number IS NULL OR page_number NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 IF section='users' THEN
  SELECT count(*) INTO total FROM public.users;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) INTO items FROM
   (SELECT u.id,u.display_name AS "displayName",u.status,u.role AS "legacyRole",CASE WHEN a.revoked_at IS NULL THEN a.role END AS role,coalesce(a.version,0) AS version
    FROM public.users u LEFT JOIN public.global_role_assignments a ON a.user_id=u.id ORDER BY u.id LIMIT 20 OFFSET (page_number-1)*20) p;
 ELSIF section='audit' THEN
  SELECT count(*) INTO total FROM public.admin_audit_events;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p."occurredAt" DESC,p.id DESC),'[]'::jsonb) INTO items FROM
   (SELECT id,actor_id AS "actorId",target_id AS "targetId",action,reason,before_state AS "beforeState",after_state AS "afterState",occurred_at AS "occurredAt"
    FROM public.admin_audit_events ORDER BY occurred_at DESC,id DESC LIMIT 20 OFFSET (page_number-1)*20) p;
 ELSE RAISE EXCEPTION 'Unknown section' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('items',items,'total',total,'page',page_number,'pageSize',20);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.global_rbac_change(actor uuid, target uuid, next_role text, expected_version integer, request uuid, change_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET statement_timeout='10s' SET lock_timeout='3s' AS $$
DECLARE actor_role text; old public.global_role_assignments%ROWTYPE; prior public.admin_audit_events%ROWTYPE;
 before_value jsonb; after_value jsonb; answer jsonb; digest text; event uuid:=gen_random_uuid(); next_version integer;
BEGIN
 IF session_user<>'ccna_rbac_manager' THEN RAISE EXCEPTION 'Dedicated manager required' USING ERRCODE='42501'; END IF;
 IF actor IS NULL OR target IS NULL OR request IS NULL OR expected_version IS NULL OR expected_version NOT BETWEEN 0 AND 2147483646
 OR change_reason IS NULL OR length(btrim(change_reason)) NOT BETWEEN 5 AND 500
 OR (next_role IS NOT NULL AND next_role NOT IN ('OWNER','ADMIN','CONTENT_MANAGER','STUDENT')) THEN RAISE EXCEPTION 'Invalid role change' USING ERRCODE='22023'; END IF;
 IF actor=target THEN RAISE EXCEPTION 'Self role changes denied' USING ERRCODE='42501'; END IF;
 -- A real write serializes authority AND forces stale repeatable-read transactions to fail.
 UPDATE public.global_rbac_guard SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authority guard missing' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.users WHERE id IN(actor,target) ORDER BY id FOR SHARE;
 actor_role:=public.global_rbac_context(actor)->>'role';
 IF actor_role IS NULL OR actor_role NOT IN ('OWNER','ADMIN') THEN RAISE EXCEPTION 'Delegation denied' USING ERRCODE='42501'; END IF;
 digest:=encode(sha256(convert_to(jsonb_build_object('actor',actor,'target',target,'role',next_role,'version',expected_version,'reason',btrim(change_reason))::text,'UTF8')),'hex');
 SELECT * INTO prior FROM public.admin_audit_events WHERE request_id=request;
 IF FOUND THEN
  IF prior.action<>'ROLE_CHANGE' OR prior.request_hash<>digest THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=target) THEN RAISE EXCEPTION 'Target missing' USING ERRCODE='P0002'; END IF;
 IF next_role IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE id=target AND status::text='ACTIVE') THEN RAISE EXCEPTION 'Target inactive' USING ERRCODE='23514'; END IF;
 SELECT * INTO old FROM public.global_role_assignments WHERE user_id=target FOR UPDATE;
 IF coalesce(old.version,0)<>expected_version THEN RAISE EXCEPTION 'Stale assignment' USING ERRCODE='40001'; END IF;
 IF actor_role='ADMIN' AND (next_role IN ('OWNER','ADMIN') OR (old.revoked_at IS NULL AND old.role IN ('OWNER','ADMIN'))) THEN RAISE EXCEPTION 'Delegation ceiling exceeded' USING ERRCODE='42501'; END IF;
 IF next_role IS NULL AND (old.user_id IS NULL OR old.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'No active assignment' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.global_role_assignments a JOIN public.users u ON u.id=a.user_id
  WHERE a.role='OWNER' AND a.revoked_at IS NULL AND u.status::text='ACTIVE' AND (a.user_id<>target OR next_role='OWNER')) THEN
  RAISE EXCEPTION 'Last active Owner protected' USING ERRCODE='23514',CONSTRAINT='global_rbac_last_owner';
 END IF;
 before_value:=CASE WHEN old.user_id IS NULL THEN NULL ELSE jsonb_build_object('role',old.role,'version',old.version,'revoked',old.revoked_at IS NOT NULL) END;
 next_version:=coalesce(old.version,0)+1;
 INSERT INTO public.global_role_assignments(user_id,role,version,revoked_at)
 VALUES(target,coalesce(next_role,old.role),next_version,CASE WHEN next_role IS NULL THEN clock_timestamp() END)
 ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,version=excluded.version,revoked_at=excluded.revoked_at,updated_at=clock_timestamp();
 after_value:=jsonb_build_object('role',next_role,'version',next_version,'revoked',next_role IS NULL);
 answer:=jsonb_build_object('eventId',event,'targetId',target,'role',next_role,'version',next_version);
 INSERT INTO public.admin_audit_events(id,request_id,actor_id,target_id,action,reason,before_state,after_state,request_hash,result)
 VALUES(event,request,actor,target,'ROLE_CHANGE',btrim(change_reason),before_value,after_value,digest,answer);
 RETURN answer;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.global_rbac_bootstrap(target uuid, confirmation text, approval_reference text, request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='3s' AS $$
DECLARE event uuid:=gen_random_uuid(); answer jsonb; digest text;
BEGIN
 IF session_user<>'ccna_phase6a_migrator' OR target IS NULL OR request IS NULL
 OR confirmation IS DISTINCT FROM 'BOOTSTRAP GLOBAL OWNER '||target::text
 OR approval_reference IS NULL OR length(btrim(approval_reference)) NOT BETWEEN 5 AND 200 THEN
  RAISE EXCEPTION 'Separate explicit bootstrap approval required' USING ERRCODE='42501';
 END IF;
 UPDATE public.global_rbac_guard SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authority guard missing' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.global_role_assignments) OR EXISTS(SELECT 1 FROM public.admin_audit_events) THEN RAISE EXCEPTION 'Bootstrap already consumed' USING ERRCODE='23514'; END IF;
 PERFORM id FROM public.users WHERE id=target AND status::text='ACTIVE' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active approved target required' USING ERRCODE='23514'; END IF;
 INSERT INTO public.global_role_assignments(user_id,role) VALUES(target,'OWNER');
 answer:=jsonb_build_object('eventId',event,'targetId',target,'role','OWNER','version',1);
 digest:=encode(sha256(convert_to(jsonb_build_object('target',target,'approval',approval_reference)::text,'UTF8')),'hex');
 INSERT INTO public.admin_audit_events(id,request_id,target_id,action,reason,approval_ref,after_state,request_hash,result)
 VALUES(event,request,target,'OWNER_BOOTSTRAP','Explicit separately approved bootstrap',btrim(approval_reference),jsonb_build_object('role','OWNER','version',1),digest,answer);
 RETURN answer;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.global_rbac_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Administrative audit is append only' USING ERRCODE='42501'; END $$;
--> statement-breakpoint
CREATE TRIGGER admin_audit_no_mutation BEFORE UPDATE OR DELETE ON public.admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.global_rbac_audit_immutable();
--> statement-breakpoint
CREATE TRIGGER admin_audit_no_truncate BEFORE TRUNCATE ON public.admin_audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.global_rbac_audit_immutable();
--> statement-breakpoint
CREATE FUNCTION public.global_rbac_owner_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='3s' AS $$
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 UPDATE public.global_rbac_guard SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'Authority guard missing' USING ERRCODE='42501'; END IF;
 IF NEW.status::text<>'ACTIVE' AND EXISTS(SELECT 1 FROM public.global_role_assignments WHERE user_id=OLD.id AND role='OWNER' AND revoked_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.global_role_assignments a JOIN public.users u ON u.id=a.user_id WHERE a.role='OWNER' AND a.revoked_at IS NULL AND u.status::text='ACTIVE' AND u.id<>OLD.id) THEN
  RAISE EXCEPTION 'Last active Owner protected' USING ERRCODE='23514',CONSTRAINT='global_rbac_last_owner';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER global_rbac_owner_status_guard BEFORE UPDATE OF status ON public.users FOR EACH ROW EXECUTE FUNCTION public.global_rbac_owner_status();
--> statement-breakpoint
REVOKE ALL ON public.global_rbac_guard,public.global_role_assignments,public.admin_audit_events FROM PUBLIC,ccna_phase6a_app,ccna_rbac_manager;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.global_rbac_context(uuid),public.global_rbac_read(uuid,text,integer),public.global_rbac_change(uuid,uuid,text,integer,uuid,text),public.global_rbac_bootstrap(uuid,text,text,uuid),public.global_rbac_audit_immutable(),public.global_rbac_owner_status() FROM PUBLIC,ccna_phase6a_app,ccna_rbac_manager;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.global_rbac_context(uuid),public.global_rbac_read(uuid,text,integer) TO ccna_phase6a_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO ccna_rbac_manager;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.global_rbac_change(uuid,uuid,text,integer,uuid,text) TO ccna_rbac_manager;
