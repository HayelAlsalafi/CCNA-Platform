-- PROPOSAL ONLY: separate backup/rehearsal/activation and grants approval required.
-- Additive. No existing records, tables, roles or migration ledger entries change.
CREATE TABLE public.lesson_annotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL CONSTRAINT lesson_annotations_user_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 lesson_id uuid NOT NULL,
 revision_id uuid NOT NULL,
 kind text NOT NULL CONSTRAINT lesson_annotations_kind_ck CHECK(kind IN ('NOTE','HIGHLIGHT','BOOKMARK')),
 anchor jsonb,
 body text NOT NULL DEFAULT '',
 color text CONSTRAINT lesson_annotations_color_ck CHECK(color IN ('yellow','green','blue','pink')),
 category text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1 CONSTRAINT lesson_annotations_version_ck CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT lesson_annotations_revision_fk FOREIGN KEY(revision_id,lesson_id) REFERENCES public.lesson_revisions(id,lesson_id) ON DELETE RESTRICT,
 CONSTRAINT lesson_annotations_body_ck CHECK(length(body)<=10000 AND length(category)<=80 AND (kind<>'NOTE' OR length(btrim(body))>0)),
 CONSTRAINT lesson_annotations_anchor_ck CHECK(anchor IS NULL OR (jsonb_typeof(anchor)='object' AND anchor ?& ARRAY['blockId','start','end','quote'] AND jsonb_typeof(anchor->'blockId')='string' AND (anchor->>'blockId') ~ '^[a-f0-9-]{36}$' AND jsonb_typeof(anchor->'quote')='string' AND length(anchor->>'quote')<=5000 AND jsonb_typeof(anchor->'start')='number' AND jsonb_typeof(anchor->'end')='number' AND (anchor->>'start') ~ '^[0-9]{1,6}$' AND (anchor->>'end') ~ '^[0-9]{1,6}$' AND (anchor->>'end')::integer >= (anchor->>'start')::integer)),
 CONSTRAINT lesson_annotations_highlight_ck CHECK(kind<>'HIGHLIGHT' OR (color IS NOT NULL AND anchor IS NOT NULL AND (anchor->>'end')::integer>(anchor->>'start')::integer AND length(anchor->>'quote')>0))
);
--> statement-breakpoint
CREATE INDEX lesson_annotations_owner_lesson_idx ON public.lesson_annotations(user_id,lesson_id,revision_id,created_at,id);
CREATE INDEX lesson_annotations_owner_kind_idx ON public.lesson_annotations(user_id,kind,updated_at,id);
CREATE UNIQUE INDEX lesson_bookmark_once_idx ON public.lesson_annotations(user_id,lesson_id,revision_id) WHERE kind='BOOKMARK' AND anchor IS NULL;
ALTER TABLE public.lesson_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_annotations_owner ON public.lesson_annotations USING(user_id=nullif(current_setting('app.study_user',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('app.study_user',true),'')::uuid);
--> statement-breakpoint
CREATE TABLE public.lesson_progress (
 user_id uuid NOT NULL CONSTRAINT lesson_progress_user_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 lesson_id uuid NOT NULL,revision_id uuid NOT NULL,
 state text NOT NULL CONSTRAINT lesson_progress_state_ck CHECK(state IN ('IN_PROGRESS','COMPLETED')),
 block_id uuid,
 version integer NOT NULL DEFAULT 1 CONSTRAINT lesson_progress_version_ck CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,lesson_id,revision_id),
 CONSTRAINT lesson_progress_revision_fk FOREIGN KEY(revision_id,lesson_id) REFERENCES public.lesson_revisions(id,lesson_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX lesson_progress_owner_state_idx ON public.lesson_progress(user_id,state,lesson_id,revision_id);
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_progress_owner ON public.lesson_progress USING(user_id=nullif(current_setting('app.study_user',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('app.study_user',true),'')::uuid);
--> statement-breakpoint
CREATE TABLE public.lesson_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by uuid NOT NULL CONSTRAINT lesson_media_creator_fk REFERENCES public.users(id) ON DELETE RESTRICT,
 storage_key text NOT NULL CONSTRAINT lesson_media_storage_key_uq UNIQUE CONSTRAINT lesson_media_key_ck CHECK(storage_key ~ '^[a-f0-9-]{36}\.(png|jpg|webp)$'),
 mime text NOT NULL CONSTRAINT lesson_media_mime_ck CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 bytes integer NOT NULL CONSTRAINT lesson_media_size_ck CHECK(bytes BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CONSTRAINT lesson_media_hash_ck CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX lesson_media_creator_idx ON public.lesson_media(created_by,created_at,id);
-- No runtime GRANTs, deletion of media, or storage configuration activation here.
