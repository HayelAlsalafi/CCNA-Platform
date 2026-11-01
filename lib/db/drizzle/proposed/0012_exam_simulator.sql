-- PROPOSAL ONLY. Apply only through a separately approved guarded migration.
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"auth_session_id" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"config" jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"result" jsonb,
	CONSTRAINT "exam_sessions_request_uq" UNIQUE("user_id","request_id"),
	CONSTRAINT "exam_sessions_owner_uq" UNIQUE("id","user_id"),
	CONSTRAINT "exam_sessions_count_ck" CHECK ("exam_sessions"."question_count" BETWEEN 1 AND 100),
	CONSTRAINT "exam_sessions_config_ck" CHECK (jsonb_typeof("exam_sessions"."config")='object'),
	CONSTRAINT "exam_sessions_deadline_ck" CHECK ("exam_sessions"."deadline_at" BETWEEN "exam_sessions"."started_at"+interval '5 minutes' AND "exam_sessions"."started_at"+interval '180 minutes'),
	CONSTRAINT "exam_sessions_state_ck" CHECK (("exam_sessions"."status"='ACTIVE' AND "exam_sessions"."finalized_at" IS NULL AND "exam_sessions"."result" IS NULL) OR ("exam_sessions"."status" IN ('SUBMITTED','EXPIRED') AND "exam_sessions"."finalized_at" IS NOT NULL AND "exam_sessions"."result" IS NOT NULL AND "exam_sessions"."finalized_at">="exam_sessions"."started_at" AND jsonb_typeof("exam_sessions"."result")='object'))
);

--> statement-breakpoint
CREATE TABLE "exam_session_items" (
	"delivery_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid,
	"revision_id" uuid,
	"mapping_snapshot" jsonb NOT NULL,
	"selected_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"answer_version" integer DEFAULT 0 NOT NULL,
	"graded_result" jsonb,
	"deleted_question_code" varchar(32),
	"deleted_at" timestamp with time zone,
	"deletion_audit_id" uuid,
	CONSTRAINT "exam_items_position_uq" UNIQUE("session_id","position"),
	CONSTRAINT "exam_items_question_uq" UNIQUE("session_id","question_id"),
	CONSTRAINT "exam_items_position_ck" CHECK ("exam_session_items"."position" BETWEEN 0 AND 99),
	CONSTRAINT "exam_items_version_ck" CHECK ("exam_session_items"."answer_version">=0),
	CONSTRAINT "exam_items_json_ck" CHECK (jsonb_typeof("exam_session_items"."mapping_snapshot")='object' AND jsonb_typeof("exam_session_items"."selected_keys")='array' AND jsonb_array_length("exam_session_items"."selected_keys")<=10),
	CONSTRAINT "exam_items_tombstone_ck" CHECK (("exam_session_items"."question_id" IS NOT NULL AND "exam_session_items"."revision_id" IS NOT NULL AND "exam_session_items"."deleted_question_code" IS NULL AND "exam_session_items"."deleted_at" IS NULL AND "exam_session_items"."deletion_audit_id" IS NULL) OR ("exam_session_items"."question_id" IS NULL AND "exam_session_items"."revision_id" IS NULL AND "exam_session_items"."deleted_question_code" IS NOT NULL AND "exam_session_items"."deleted_at" IS NOT NULL AND "exam_session_items"."deletion_audit_id" IS NOT NULL AND "exam_session_items"."selected_keys"='[]'::jsonb AND NOT "exam_session_items"."flagged" AND "exam_session_items"."graded_result" IS NULL))
);

--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "exam_session_items" ADD CONSTRAINT "exam_session_items_deletion_audit_id_question_deletion_audits_id_fk" FOREIGN KEY ("deletion_audit_id") REFERENCES "public"."question_deletion_audits"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "exam_session_items" ADD CONSTRAINT "exam_items_owner_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."exam_sessions"("id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "exam_session_items" ADD CONSTRAINT "exam_items_revision_fk" FOREIGN KEY ("revision_id","question_id") REFERENCES "public"."question_revisions"("id","question_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "exam_sessions_history_idx" ON "exam_sessions" USING btree ("user_id","started_at" DESC NULLS LAST,"id");
--> statement-breakpoint
CREATE INDEX "exam_sessions_deadline_idx" ON "exam_sessions" USING btree ("status","deadline_at");
--> statement-breakpoint
CREATE INDEX "exam_items_question_idx" ON "exam_session_items" USING btree ("question_id","revision_id");
--> statement-breakpoint
CREATE INDEX "exam_items_user_idx" ON "exam_session_items" USING btree ("user_id","session_id","position");
--> statement-breakpoint
CREATE FUNCTION public.guard_exam_state() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s public.exam_sessions%ROWTYPE; snap jsonb; required integer; valid integer;
BEGIN
 IF TG_TABLE_NAME='exam_sessions' THEN
  IF TG_OP='INSERT' THEN
   IF NEW.status<>'ACTIVE' OR NEW.result IS NOT NULL THEN RAISE EXCEPTION 'Exam must start active' USING ERRCODE='23514'; END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['status','finalized_at','result']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','finalized_at','result']) OR OLD.status<>'ACTIVE' OR current_setting('ccna_exam.finalizing',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Immutable exam state' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO s FROM public.exam_sessions WHERE id=NEW.session_id AND user_id=NEW.user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Exam owner mismatch' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND current_setting('ccna_exam.deleting',true)=OLD.question_id::text AND NEW.question_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['selected_keys','flagged','answer_version','graded_result']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['selected_keys','flagged','answer_version','graded_result']) THEN RAISE EXCEPTION 'Immutable exam delivery' USING ERRCODE='23514'; END IF;
 IF s.status<>'ACTIVE' THEN RAISE EXCEPTION 'Exam closed' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND current_setting('ccna_exam.finalizing',true)=s.id::text THEN
  IF (to_jsonb(NEW)-'graded_result') IS DISTINCT FROM (to_jsonb(OLD)-'graded_result') THEN RAISE EXCEPTION 'Finalization cannot alter answers' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF clock_timestamp()>=s.deadline_at OR NEW.graded_result IS NOT NULL THEN RAISE EXCEPTION 'Exam deadline reached or protected result' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.answer_version<>OLD.answer_version+1 THEN RAISE EXCEPTION 'Answer version mismatch' USING ERRCODE='23514'; END IF;
 SELECT snapshot INTO snap FROM public.question_revisions WHERE id=NEW.revision_id AND question_id=NEW.question_id;
 SELECT count(*) FILTER(WHERE (o->>'isCorrect')::boolean) INTO required FROM jsonb_array_elements(snap->'options') o;
 SELECT count(DISTINCT k) INTO valid FROM jsonb_array_elements_text(NEW.selected_keys) k WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'options') o WHERE o->>'optionKey'=k);
 IF required IS NULL OR required<1 OR (snap->>'type'='MULTIPLE_CHOICE_SINGLE' AND required<>1) OR (snap->>'type'='MULTIPLE_CHOICE_MULTIPLE' AND required<2) OR valid<>jsonb_array_length(NEW.selected_keys) OR valid>required THEN RAISE EXCEPTION 'Invalid exam selection' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_exam_state() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER exam_sessions_guard BEFORE INSERT OR UPDATE ON public.exam_sessions FOR EACH ROW EXECUTE FUNCTION public.guard_exam_state();
--> statement-breakpoint
CREATE TRIGGER exam_items_guard BEFORE INSERT OR UPDATE ON public.exam_session_items FOR EACH ROW EXECUTE FUNCTION public.guard_exam_state();
--> statement-breakpoint
REVOKE ALL ON public.exam_sessions,public.exam_session_items FROM PUBLIC;
--> statement-breakpoint
-- Extend, rather than bypass, the existing audited deletion architecture.
ALTER FUNCTION public.execute_question_deletion(uuid,uuid,boolean) RENAME TO execute_question_deletion_pre_exam;
--> statement-breakpoint
CREATE FUNCTION public.execute_question_deletion(selected_question uuid,admin_actor uuid,allow_history boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE payload jsonb; audit uuid; code text; receipt jsonb; n integer;
BEGIN
 IF allow_history IS NULL OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=admin_actor AND role::text='ADMIN' AND status::text='ACTIVE') THEN RAISE EXCEPTION 'Active Admin required' USING ERRCODE='42501'; END IF;
 PERFORM s.id FROM public.exam_sessions s WHERE EXISTS(SELECT 1 FROM public.exam_session_items i WHERE i.session_id=s.id AND i.question_id=selected_question) ORDER BY s.id FOR UPDATE;
 SELECT count(*) INTO n FROM public.exam_session_items WHERE question_id=selected_question;
 IF n>0 AND NOT allow_history THEN RAISE EXCEPTION 'Separate exam history confirmation required' USING ERRCODE='23514',CONSTRAINT='question_history_confirmation_required'; END IF;
 IF n>0 THEN
  SELECT question_code INTO code FROM public.questions WHERE id=selected_question FOR UPDATE;
  SELECT jsonb_build_object('examItems',(SELECT jsonb_agg(to_jsonb(i) ORDER BY delivery_id) FROM public.exam_session_items i WHERE question_id=selected_question),'examSessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.exam_sessions s WHERE EXISTS(SELECT 1 FROM public.exam_session_items i WHERE i.session_id=s.id AND i.question_id=selected_question))) INTO payload;
  INSERT INTO public.question_deletion_audits(question_id,question_code,admin_actor,history_authorized,recovery_payload,payload_hash) VALUES(selected_question,code,admin_actor,true,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex')) RETURNING id INTO audit;
  PERFORM set_config('ccna_exam.deleting',selected_question::text,true);
  UPDATE public.exam_session_items SET question_id=NULL,revision_id=NULL,selected_keys='[]'::jsonb,flagged=false,graded_result=NULL,mapping_snapshot='{}'::jsonb,deleted_question_code=code,deleted_at=clock_timestamp(),deletion_audit_id=audit WHERE question_id=selected_question;
  PERFORM set_config('ccna_exam.deleting','',true);
 END IF;
 receipt:=public.execute_question_deletion_pre_exam(selected_question,admin_actor,allow_history);
 RETURN receipt||jsonb_build_object('examItems',n,'examAuditId',audit);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.execute_question_deletion(uuid,uuid,boolean),public.execute_question_deletion_pre_exam(uuid,uuid,boolean) FROM PUBLIC;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_question_with_history(selected_question uuid, admin_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN public.execute_question_deletion(selected_question,admin_actor,true); END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_question_with_history(uuid,uuid) FROM PUBLIC;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.delete_question_without_learner_history(selected_question uuid, admin_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN public.execute_question_deletion(selected_question,admin_actor,false); END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_question_without_learner_history(uuid,uuid) FROM PUBLIC;
