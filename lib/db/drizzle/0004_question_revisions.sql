-- Additive: no legacy content inference, score recalculation or attempt rewrite.
CREATE TABLE public.question_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL CONSTRAINT question_revisions_question_id_questions_id_fk REFERENCES public.questions(id) ON DELETE RESTRICT,
  content_hash varchar(64) NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_revisions_content_uq UNIQUE(question_id, content_hash),
  CONSTRAINT question_revisions_binding_uq UNIQUE(id, question_id),
  CONSTRAINT question_revisions_hash_ck CHECK(content_hash = encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex'))
);
--> statement-breakpoint
CREATE TABLE public.practice_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL CONSTRAINT practice_deliveries_user_id_users_id_fk REFERENCES public.users(id) ON DELETE RESTRICT,
  session_id varchar(255),
  question_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  CONSTRAINT practice_deliveries_revision_fk FOREIGN KEY(revision_id,question_id) REFERENCES public.question_revisions(id,question_id) ON DELETE RESTRICT,
  CONSTRAINT practice_deliveries_binding_uq UNIQUE(id,user_id,question_id,revision_id),
  CONSTRAINT practice_deliveries_expiry_ck CHECK(expires_at > delivered_at AND expires_at <= delivered_at + interval '24 hours')
);
--> statement-breakpoint
CREATE INDEX practice_deliveries_user_idx ON public.practice_deliveries(user_id,delivered_at);
--> statement-breakpoint
CREATE INDEX practice_deliveries_revision_idx ON public.practice_deliveries(revision_id,question_id);
--> statement-breakpoint
ALTER TABLE public.practice_attempts ADD COLUMN revision_id uuid, ADD COLUMN delivery_id uuid;
--> statement-breakpoint
ALTER TABLE public.practice_attempts ADD CONSTRAINT practice_attempts_revision_fk FOREIGN KEY(revision_id,question_id) REFERENCES public.question_revisions(id,question_id) ON DELETE RESTRICT,
  ADD CONSTRAINT practice_attempts_delivery_fk FOREIGN KEY(delivery_id,user_id,question_id,revision_id) REFERENCES public.practice_deliveries(id,user_id,question_id,revision_id) ON DELETE RESTRICT,
  ADD CONSTRAINT practice_attempts_revision_pair_ck CHECK((revision_id IS NULL) = (delivery_id IS NULL)),
  ADD CONSTRAINT practice_attempts_delivery_uq UNIQUE(delivery_id);
--> statement-breakpoint
CREATE INDEX practice_attempts_revision_idx ON public.practice_attempts(revision_id,question_id);
--> statement-breakpoint
CREATE FUNCTION public.reject_revision_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Revision, delivery and attempt records are append-only' USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_revisions_immutable BEFORE UPDATE OR DELETE ON public.question_revisions FOR EACH ROW EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE TRIGGER question_revisions_no_truncate BEFORE TRUNCATE ON public.question_revisions FOR EACH STATEMENT EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE TRIGGER practice_deliveries_immutable BEFORE UPDATE OR DELETE ON public.practice_deliveries FOR EACH ROW EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE TRIGGER practice_deliveries_no_truncate BEFORE TRUNCATE ON public.practice_deliveries FOR EACH STATEMENT EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE TRIGGER practice_attempts_immutable BEFORE UPDATE OR DELETE ON public.practice_attempts FOR EACH ROW EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE TRIGGER practice_attempts_no_truncate BEFORE TRUNCATE ON public.practice_attempts FOR EACH STATEMENT EXECUTE FUNCTION public.reject_revision_history_change();
--> statement-breakpoint
CREATE FUNCTION public.validate_question_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s jsonb := NEW.snapshot; o jsonb; keys text[] := ARRAY[]::text[]; correct_count integer := 0;
BEGIN
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'type' IS DISTINCT FROM 'MULTIPLE_CHOICE_SINGLE'
     OR coalesce(s->>'difficulty','') NOT IN ('EASY','MEDIUM','HARD')
     OR coalesce(s->>'text','') = '' OR coalesce(s->>'questionCode','') = ''
     OR jsonb_typeof(s->'explanation') IS DISTINCT FROM 'string'
     OR jsonb_typeof(s->'topic') IS DISTINCT FROM 'object'
     OR coalesce(s->'topic'->>'name','') = '' OR coalesce(s->'topic'->>'slug','') = ''
     OR jsonb_typeof(s->'options') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid revision snapshot' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM (s->'topic'->>'id')::uuid;
  IF s->'topic'->>'id' IS NULL OR jsonb_array_length(s->'options') NOT BETWEEN 2 AND 10 THEN
    RAISE EXCEPTION 'Invalid revision options/topic' USING ERRCODE = 'check_violation';
  END IF;
  FOR o IN SELECT value FROM jsonb_array_elements(s->'options') LOOP
    IF jsonb_typeof(o->'optionKey') IS DISTINCT FROM 'string' OR length(o->>'optionKey') NOT BETWEEN 1 AND 8
       OR o->>'optionKey' <> upper(btrim(o->>'optionKey')) OR (o->>'optionKey') = ANY(keys)
       OR jsonb_typeof(o->'text') IS DISTINCT FROM 'string' OR coalesce(o->>'text','') = ''
       OR jsonb_typeof(o->'isCorrect') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid revision option' USING ERRCODE = 'check_violation';
    END IF;
    keys := array_append(keys,o->>'optionKey');
    IF (o->>'isCorrect')::boolean THEN correct_count := correct_count+1; END IF;
  END LOOP;
  IF correct_count <> 1 THEN RAISE EXCEPTION 'Revision requires one correct answer' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_revisions_validate BEFORE INSERT ON public.question_revisions FOR EACH ROW EXECUTE FUNCTION public.validate_question_snapshot();
--> statement-breakpoint
CREATE FUNCTION public.validate_revision_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s jsonb; expires timestamptz; delivered timestamptz; selected jsonb;
BEGIN
  -- Existing legacy NULL rows remain untouched; all NEW attempts must be bound.
  IF NEW.revision_id IS NULL OR NEW.delivery_id IS NULL THEN
    RAISE EXCEPTION 'New attempt requires immutable delivery' USING ERRCODE = 'check_violation';
  END IF;
  SELECT r.snapshot,d.expires_at,d.delivered_at INTO s,expires,delivered FROM public.practice_deliveries d
    JOIN public.question_revisions r ON r.id=d.revision_id AND r.question_id=d.question_id
    WHERE d.id=NEW.delivery_id AND d.user_id=NEW.user_id AND d.question_id=NEW.question_id AND d.revision_id=NEW.revision_id;
  IF s IS NULL OR expires <= clock_timestamp() OR NEW.submitted_at < delivered OR NEW.submitted_at > clock_timestamp() OR NEW.topic_id IS DISTINCT FROM (s->'topic'->>'id')::uuid THEN
    RAISE EXCEPTION 'Invalid or expired attempt binding' USING ERRCODE = 'check_violation';
  END IF;
  SELECT o INTO selected FROM jsonb_array_elements(s->'options') o WHERE o->>'optionKey'=NEW.selected_option_key;
  IF selected IS NULL OR NEW.is_correct IS DISTINCT FROM (selected->>'isCorrect')::boolean THEN
    RAISE EXCEPTION 'Attempt grading differs from revision' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER practice_attempts_validate_revision BEFORE INSERT ON public.practice_attempts FOR EACH ROW EXECUTE FUNCTION public.validate_revision_attempt();
