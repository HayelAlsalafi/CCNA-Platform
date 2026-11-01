-- PROPOSAL ONLY: requires separate live approval and guarded metadata promotion.
-- Prerequisites: reviewed 0000-0008. No historical payloads or row values change.
-- New enum avoids PostgreSQL's unsafe-use restriction for ADD VALUE inside the
-- official transactional migrator. Retain the original enum for compatibility.
CREATE TYPE public.question_type_v2 AS ENUM ('MULTIPLE_CHOICE_SINGLE','MULTIPLE_CHOICE_MULTIPLE');
--> statement-breakpoint
ALTER TABLE public.questions ALTER COLUMN type DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE public.questions ALTER COLUMN type TYPE public.question_type_v2 USING type::text::public.question_type_v2;
--> statement-breakpoint
ALTER TABLE public.questions ALTER COLUMN type SET DEFAULT 'MULTIPLE_CHOICE_SINGLE'::public.question_type_v2;
--> statement-breakpoint
ALTER TABLE public.practice_attempts ALTER COLUMN selected_option_key TYPE varchar(128);
--> statement-breakpoint
ALTER TABLE public.learning_session_items ALTER COLUMN selected_option_key TYPE varchar(128);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_question_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s jsonb := NEW.snapshot; o jsonb; keys text[] := ARRAY[]::text[]; correct_count integer := 0;
BEGIN
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR coalesce(s->>'type','') NOT IN ('MULTIPLE_CHOICE_SINGLE','MULTIPLE_CHOICE_MULTIPLE')
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
       OR (s->>'type'='MULTIPLE_CHOICE_MULTIPLE' AND (o->>'optionKey') !~ '^[-_A-Z0-9]{1,8}$')
       OR o->>'optionKey' <> upper(btrim(o->>'optionKey')) OR (o->>'optionKey') = ANY(keys)
       OR jsonb_typeof(o->'text') IS DISTINCT FROM 'string' OR coalesce(o->>'text','') = ''
       OR jsonb_typeof(o->'isCorrect') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid revision option' USING ERRCODE = 'check_violation';
    END IF;
    keys := array_append(keys,o->>'optionKey');
    IF (o->>'isCorrect')::boolean THEN correct_count := correct_count+1; END IF;
  END LOOP;
  IF (s->>'type'='MULTIPLE_CHOICE_SINGLE' AND correct_count<>1) OR (s->>'type'='MULTIPLE_CHOICE_MULTIPLE' AND correct_count<2) THEN RAISE EXCEPTION 'Revision answer count does not match type' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.validate_revision_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s jsonb; expires timestamptz; delivered timestamptz; selected jsonb; chosen text[]; expected text[];
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
  IF s->>'type'='MULTIPLE_CHOICE_MULTIPLE' THEN
    BEGIN
      IF jsonb_typeof(NEW.selected_option_key::jsonb) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid answer set' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.selected_option_key::jsonb) v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'Invalid answer key type' USING ERRCODE='23514'; END IF;
      SELECT array_agg(v ORDER BY v) INTO chosen FROM jsonb_array_elements_text(NEW.selected_option_key::jsonb) v;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid answer set' USING ERRCODE='23514'; END;
    SELECT array_agg(o->>'optionKey' ORDER BY o->>'optionKey') INTO expected FROM jsonb_array_elements(s->'options') o WHERE (o->>'isCorrect')::boolean;
    IF cardinality(chosen) IS DISTINCT FROM cardinality(expected)
       OR cardinality(chosen)<>(SELECT count(DISTINCT v) FROM unnest(chosen) v)
       OR EXISTS(SELECT 1 FROM unnest(chosen) v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'options') o WHERE o->>'optionKey'=v))
       OR NEW.is_correct IS DISTINCT FROM (chosen=expected) THEN
      RAISE EXCEPTION 'Attempt grading differs from complete revision answer set' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT o INTO selected FROM jsonb_array_elements(s->'options') o WHERE o->>'optionKey'=NEW.selected_option_key;
    IF selected IS NULL OR NEW.is_correct IS DISTINCT FROM (selected->>'isCorrect')::boolean THEN
      RAISE EXCEPTION 'Attempt grading differs from revision' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
