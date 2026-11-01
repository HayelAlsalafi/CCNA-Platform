-- PROPOSAL ONLY. No existing content is deleted by this migration.
-- Existing append-only/FK enforcement remains enabled. Deletions require Admin action.
CREATE TABLE public.question_deletion_audits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 question_id uuid NOT NULL,
 question_code varchar(32) NOT NULL,
 admin_actor uuid NOT NULL,
 deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 history_authorized boolean NOT NULL,
 recovery_payload jsonb NOT NULL,
 payload_hash varchar(64) NOT NULL,
 CONSTRAINT question_deletion_audits_payload_ck CHECK (jsonb_typeof(recovery_payload)='object' AND payload_hash=encode(sha256(convert_to(recovery_payload::text,'UTF8')),'hex'))
);
--> statement-breakpoint
CREATE INDEX question_deletion_audits_question_idx ON public.question_deletion_audits(question_id,deleted_at);
--> statement-breakpoint
REVOKE ALL ON public.question_deletion_audits FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER question_deletion_audits_immutable BEFORE UPDATE OR DELETE ON public.question_deletion_audits FOR EACH ROW EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE TRIGGER question_deletion_audits_no_truncate BEFORE TRUNCATE ON public.question_deletion_audits FOR EACH STATEMENT EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
ALTER TABLE public.learning_session_items
 ALTER COLUMN question_id DROP NOT NULL, ALTER COLUMN revision_id DROP NOT NULL, ALTER COLUMN delivery_id DROP NOT NULL,
 ADD COLUMN deleted_question_code varchar(32), ADD COLUMN deleted_at timestamptz,
 ADD COLUMN deletion_audit_id uuid CONSTRAINT learning_session_items_deletion_audit_fk REFERENCES public.question_deletion_audits(id) ON DELETE RESTRICT,
 ADD CONSTRAINT learning_session_items_tombstone_ck CHECK (
   (question_id IS NOT NULL AND revision_id IS NOT NULL AND delivery_id IS NOT NULL AND deleted_question_code IS NULL AND deleted_at IS NULL AND deletion_audit_id IS NULL)
   OR (question_id IS NULL AND revision_id IS NULL AND delivery_id IS NULL AND deleted_question_code IS NOT NULL AND deleted_at IS NOT NULL AND deletion_audit_id IS NOT NULL AND selected_option_key IS NULL AND flagged=false AND domain_snapshot='[]'::jsonb)
 );
--> statement-breakpoint
CREATE FUNCTION public.execute_question_deletion(selected_question uuid, admin_actor uuid, allow_history boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public.users%ROWTYPE; q public.questions%ROWTYPE; payload jsonb; counts jsonb; audit uuid; digest text; permits oid; affected integer;
BEGIN
 IF selected_question IS NULL OR admin_actor IS NULL OR allow_history IS NULL THEN RAISE EXCEPTION 'Explicit active Admin required' USING ERRCODE='42501'; END IF;
 SELECT * INTO actor FROM public.users WHERE id=admin_actor FOR SHARE;
 IF NOT FOUND OR actor.role::text<>'ADMIN' OR actor.status::text<>'ACTIVE' THEN RAISE EXCEPTION 'Active Admin required' USING ERRCODE='42501'; END IF;
 -- Same order as grading: sessions first, then question. Shared parents are never changed.
 PERFORM s.id FROM public.learning_sessions s WHERE EXISTS(SELECT 1 FROM public.learning_session_items i WHERE i.session_id=s.id AND i.question_id=selected_question) ORDER BY s.id FOR UPDATE;
 SELECT * INTO q FROM public.questions WHERE id=selected_question FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Selected question not found' USING ERRCODE='P0002'; END IF;
 IF NOT allow_history AND (EXISTS(SELECT 1 FROM public.practice_attempts WHERE question_id=q.id) OR EXISTS(SELECT 1 FROM public.practice_deliveries WHERE question_id=q.id) OR EXISTS(SELECT 1 FROM public.learning_session_items WHERE question_id=q.id)) THEN
   RAISE EXCEPTION 'Separate history confirmation required' USING ERRCODE='23514',CONSTRAINT='question_history_confirmation_required';
 END IF;
 IF EXISTS(SELECT 1 FROM public.practice_attempts a LEFT JOIN public.question_revisions r ON r.id=a.revision_id LEFT JOIN public.practice_deliveries d ON d.id=a.delivery_id
   WHERE (a.question_id=q.id OR r.question_id=q.id OR d.question_id=q.id) AND (a.question_id<>q.id OR (r.id IS NOT NULL AND r.question_id<>q.id) OR (d.id IS NOT NULL AND d.question_id<>q.id)))
 OR EXISTS(SELECT 1 FROM public.practice_deliveries d JOIN public.question_revisions r ON r.id=d.revision_id WHERE (d.question_id=q.id OR r.question_id=q.id) AND d.question_id<>r.question_id) THEN
   RAISE EXCEPTION 'Unowned historical dependency' USING ERRCODE='23514',CONSTRAINT='question_delete_unowned_dependency';
 END IF;
 SELECT jsonb_build_object('question',to_jsonb(q),
 'options',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.question_options o WHERE o.question_id=q.id),'[]'::jsonb),
 'mappings',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.blueprint_id,m.objective_id) FROM public.question_objectives m WHERE m.question_id=q.id),'[]'::jsonb),
 'revisions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.question_revisions r WHERE r.question_id=q.id),'[]'::jsonb),
 'deliveries',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.practice_deliveries d WHERE d.question_id=q.id),'[]'::jsonb),
 'attempts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.practice_attempts a WHERE a.question_id=q.id),'[]'::jsonb),
 'sessionItems',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.session_id,i.position) FROM public.learning_session_items i WHERE i.question_id=q.id),'[]'::jsonb)) INTO payload;
 counts:=jsonb_build_object('attempts',jsonb_array_length(payload->'attempts'),'deliveries',jsonb_array_length(payload->'deliveries'),'revisions',jsonb_array_length(payload->'revisions'),'sessionItems',jsonb_array_length(payload->'sessionItems'),'options',jsonb_array_length(payload->'options'),'mappings',jsonb_array_length(payload->'mappings'));
 digest:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 INSERT INTO public.question_deletion_audits(question_id,question_code,admin_actor,history_authorized,recovery_payload,payload_hash) VALUES(q.id,q.question_code,admin_actor,allow_history,payload,digest) RETURNING id INTO audit;
 permits:=to_regclass('pg_temp.ccna_history_delete_permits');
 IF permits IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid=permits AND c.relpersistence='t' AND r.rolname=current_user) THEN RAISE EXCEPTION 'Unexpected permit owner' USING ERRCODE='42501'; END IF;
 IF permits IS NULL THEN
   CREATE TEMP TABLE ccna_history_delete_permits(transaction_id text NOT NULL,relation_id oid NOT NULL,record_id uuid NOT NULL,PRIMARY KEY(transaction_id,relation_id,record_id)) ON COMMIT DROP;
   REVOKE ALL ON pg_temp.ccna_history_delete_permits FROM PUBLIC;
 END IF;
 INSERT INTO pg_temp.ccna_history_delete_permits
   SELECT pg_current_xact_id()::text,'public.practice_attempts'::regclass,id FROM public.practice_attempts WHERE question_id=q.id
   UNION ALL SELECT pg_current_xact_id()::text,'public.practice_deliveries'::regclass,id FROM public.practice_deliveries WHERE question_id=q.id
   UNION ALL SELECT pg_current_xact_id()::text,'public.question_revisions'::regclass,id FROM public.question_revisions WHERE question_id=q.id;
 UPDATE public.learning_session_items SET question_id=NULL,revision_id=NULL,delivery_id=NULL,selected_option_key=NULL,flagged=false,domain_snapshot='[]'::jsonb,deleted_question_code=q.question_code,deleted_at=clock_timestamp(),deletion_audit_id=audit WHERE question_id=q.id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>(counts->>'sessionItems')::integer THEN RAISE EXCEPTION 'Session membership changed' USING ERRCODE='23514'; END IF;
 DELETE FROM public.practice_attempts WHERE question_id=q.id;
 DELETE FROM public.practice_deliveries WHERE question_id=q.id;
 DELETE FROM public.question_revisions WHERE question_id=q.id;
 DELETE FROM public.question_objectives WHERE question_id=q.id;
 DELETE FROM public.questions WHERE id=q.id;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 OR EXISTS(SELECT 1 FROM public.questions WHERE id=q.id) OR EXISTS(SELECT 1 FROM public.practice_attempts WHERE question_id=q.id) OR EXISTS(SELECT 1 FROM public.practice_deliveries WHERE question_id=q.id) OR EXISTS(SELECT 1 FROM public.question_revisions WHERE question_id=q.id) OR EXISTS(SELECT 1 FROM public.learning_session_items WHERE question_id=q.id) THEN RAISE EXCEPTION 'Physical deletion verification failed' USING ERRCODE='23514'; END IF;
 DELETE FROM pg_temp.ccna_history_delete_permits WHERE transaction_id=pg_current_xact_id()::text;
 RETURN counts||jsonb_build_object('auditId',audit,'recoveryHash',digest,'questionCode',q.question_code);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.execute_question_deletion(uuid,uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_question_with_history(selected_question uuid, admin_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN public.execute_question_deletion(selected_question,admin_actor,true); END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_question_with_history(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION public.delete_question_without_learner_history(selected_question uuid, admin_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN public.execute_question_deletion(selected_question,admin_actor,false); END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_question_without_learner_history(uuid,uuid) FROM PUBLIC;
-- Runtime EXECUTE is granted only by the separately approved guarded activation.
