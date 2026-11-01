-- Phase 3A: question_code is immutable once created.
CREATE OR REPLACE FUNCTION "public"."prevent_question_code_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."question_code" IS DISTINCT FROM OLD."question_code" THEN
    RAISE EXCEPTION 'question_code is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "questions_question_code_immutable" ON "public"."questions";--> statement-breakpoint
CREATE TRIGGER "questions_question_code_immutable"
  BEFORE UPDATE OF "question_code" ON "public"."questions"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_question_code_update"();
