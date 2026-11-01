CREATE TYPE "public"."question_difficulty" AS ENUM('EASY', 'MEDIUM', 'HARD');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('MULTIPLE_CHOICE_SINGLE');--> statement-breakpoint
CREATE SEQUENCE "public"."question_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_key" varchar(8) NOT NULL,
	"display_order" integer NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_options_question_key_uq" UNIQUE("question_id","option_key"),
	CONSTRAINT "question_options_question_order_uq" UNIQUE("question_id","display_order")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_code" varchar(32) DEFAULT ('CCNA-Q-' || lpad(nextval('question_code_seq')::text, 6, '0')) NOT NULL,
	"topic_id" uuid NOT NULL,
	"text" text NOT NULL,
	"type" "question_type" DEFAULT 'MULTIPLE_CHOICE_SINGLE' NOT NULL,
	"difficulty" "question_difficulty" NOT NULL,
	"explanation" text DEFAULT '' NOT NULL,
	"image_key" varchar(512),
	"reference_notes" text,
	"status" "question_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questions_question_code_unique" UNIQUE("question_code")
);
--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_topic_status_idx" ON "questions" USING btree ("topic_id","status");--> statement-breakpoint
CREATE INDEX "questions_status_idx" ON "questions" USING btree ("status");