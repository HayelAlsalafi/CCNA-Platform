-- Phase 5A: each valid submission is a distinct, server-graded attempt.
-- RESTRICT preserves history; disabling a referenced record does not delete it.
CREATE TABLE "practice_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "question_id" uuid NOT NULL,
  "topic_id" uuid NOT NULL,
  "selected_option_key" varchar(8) NOT NULL,
  "is_correct" boolean NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_question_id_questions_id_fk"
  FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_topic_id_topics_id_fk"
  FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "practice_attempts_user_history_idx" ON "practice_attempts" USING btree ("user_id", "submitted_at", "id");
--> statement-breakpoint
CREATE INDEX "practice_attempts_user_topic_idx" ON "practice_attempts" USING btree ("user_id", "topic_id", "submitted_at", "id");
--> statement-breakpoint
CREATE INDEX "practice_attempts_chronological_idx" ON "practice_attempts" USING btree ("submitted_at", "id");
--> statement-breakpoint
CREATE INDEX "practice_attempts_question_idx" ON "practice_attempts" USING btree ("question_id");
