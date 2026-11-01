-- PROPOSAL ONLY. Not in the official journal. Requires separate activation approval.
-- Additive: no existing row, question, topic, chapter, attempt or revision is changed.
CREATE TABLE public.lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 chapter_id uuid NOT NULL REFERENCES public.curriculum_chapters(id) ON DELETE RESTRICT,
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
 estimated_minutes integer NOT NULL DEFAULT 5,
 blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
 display_order integer NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 1,
 published_revision_id uuid,
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT lessons_bounds_ck CHECK(version>0 AND display_order>=0 AND estimated_minutes BETWEEN 1 AND 600),
 CONSTRAINT lessons_content_arrays_ck CHECK(jsonb_typeof(objectives)='array' AND jsonb_typeof(blocks)='array')
);
--> statement-breakpoint
CREATE INDEX lessons_chapter_order_idx ON public.lessons(chapter_id,display_order,id);
--> statement-breakpoint
CREATE TABLE public.lesson_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
 revision_number integer NOT NULL,
 snapshot jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT lesson_revisions_number_uq UNIQUE(lesson_id,revision_number),
 CONSTRAINT lesson_revisions_identity_uq UNIQUE(id,lesson_id),
 CONSTRAINT lesson_revisions_number_ck CHECK(revision_number>0),
 CONSTRAINT lesson_revisions_snapshot_ck CHECK(jsonb_typeof(snapshot)='object')
);
--> statement-breakpoint
CREATE INDEX lesson_revisions_lesson_idx ON public.lesson_revisions(lesson_id,revision_number);
--> statement-breakpoint
ALTER TABLE public.lessons ADD CONSTRAINT lessons_published_revision_fk
 FOREIGN KEY(published_revision_id,id) REFERENCES public.lesson_revisions(id,lesson_id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE FUNCTION public.reject_lesson_revision_mutation() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog AS $$ BEGIN
 RAISE EXCEPTION USING ERRCODE='23001', MESSAGE='Published lesson revisions are immutable';
 END $$;
--> statement-breakpoint
CREATE TRIGGER lesson_revisions_immutable BEFORE UPDATE OR DELETE ON public.lesson_revisions
 FOR EACH ROW EXECUTE FUNCTION public.reject_lesson_revision_mutation();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reject_lesson_revision_mutation() FROM PUBLIC;
-- Activation must separately verify ownership/runtime privileges. No GRANT is executed here.
