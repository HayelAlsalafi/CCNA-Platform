-- Additive proposal. Not in the live migration journal until explicitly approved.
CREATE TABLE public.learning_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL CONSTRAINT learning_sessions_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 auth_session_id varchar(255) NOT NULL,
 request_id uuid NOT NULL,
 mode varchar(20) NOT NULL CONSTRAINT learning_sessions_mode_ck CHECK (mode IN ('LEARN','PRACTICE','REVIEW_MISTAKES')),
 status varchar(20) NOT NULL DEFAULT 'ACTIVE' CONSTRAINT learning_sessions_status_ck CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED')),
 config jsonb NOT NULL CONSTRAINT learning_sessions_config_ck CHECK (jsonb_typeof(config)='object'),
 question_count integer NOT NULL CONSTRAINT learning_sessions_count_ck CHECK (question_count BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 CONSTRAINT learning_sessions_request_uq UNIQUE(user_id,request_id),
 CONSTRAINT learning_sessions_owner_uq UNIQUE(id,user_id),
 CONSTRAINT learning_sessions_completion_ck CHECK ((status='ACTIVE' AND completed_at IS NULL) OR (status<>'ACTIVE' AND completed_at IS NOT NULL AND completed_at>=created_at))
);
CREATE INDEX learning_sessions_user_history_idx ON public.learning_sessions(user_id,created_at DESC,id);
CREATE TABLE public.learning_session_items (
 session_id uuid NOT NULL,
 user_id uuid NOT NULL,
 position integer NOT NULL CONSTRAINT learning_session_items_position_ck CHECK (position BETWEEN 0 AND 99),
 question_id uuid NOT NULL,
 revision_id uuid NOT NULL,
 delivery_id uuid NOT NULL CONSTRAINT learning_session_items_delivery_id_unique UNIQUE,
 selected_option_key varchar(8),
 flagged boolean NOT NULL DEFAULT false,
 domain_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CONSTRAINT learning_session_items_domains_ck CHECK (jsonb_typeof(domain_snapshot)='array'),
 CONSTRAINT learning_session_items_session_id_position_pk PRIMARY KEY(session_id,position),
 CONSTRAINT learning_session_items_question_uq UNIQUE(session_id,question_id),
 CONSTRAINT learning_session_items_owner_fk FOREIGN KEY(session_id,user_id) REFERENCES public.learning_sessions(id,user_id) ON DELETE RESTRICT,
 CONSTRAINT learning_session_items_delivery_fk FOREIGN KEY(delivery_id,user_id,question_id,revision_id) REFERENCES public.practice_deliveries(id,user_id,question_id,revision_id) ON DELETE RESTRICT
);
CREATE INDEX learning_session_items_user_idx ON public.learning_session_items(user_id,session_id);
-- The legacy grading endpoint cannot reveal Practice-mode answers early.
CREATE FUNCTION public.nexus_guard_deferred_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE run_id uuid; run_mode varchar(20); run_status varchar(20);
BEGIN
 SELECT s.id,s.mode,s.status INTO run_id,run_mode,run_status FROM public.learning_session_items i JOIN public.learning_sessions s ON s.id=i.session_id AND s.user_id=i.user_id
 WHERE i.delivery_id=NEW.delivery_id AND i.user_id=NEW.user_id;
 IF run_id IS NOT NULL AND run_status<>'ACTIVE' THEN
  RAISE EXCEPTION 'Closed sessions cannot accept new attempts' USING ERRCODE='23514',CONSTRAINT='nexus_session_closed';
 END IF;
 IF run_id IS NOT NULL AND run_mode='PRACTICE' AND current_setting('ccna_nexus.finishing',true) IS DISTINCT FROM run_id::text THEN
  RAISE EXCEPTION 'Practice mode grades only through the owned Finish transaction' USING ERRCODE='23514',CONSTRAINT='nexus_deferred_grading';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.nexus_guard_deferred_attempt() FROM PUBLIC;
CREATE TRIGGER nexus_deferred_grading BEFORE INSERT ON public.practice_attempts FOR EACH ROW EXECUTE FUNCTION public.nexus_guard_deferred_attempt();
-- No historical rows are backfilled, changed, deleted or regrouped.
-- No grants are included: runtime permissions require separate guarded approval.
