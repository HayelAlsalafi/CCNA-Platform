-- PROPOSAL ONLY. Not registered in the journal and not applied.
-- Required for searchable metadata/variants in the existing media table.
ALTER TABLE public.lesson_media
  ADD COLUMN original_name text NOT NULL DEFAULT '',
  ADD COLUMN caption text NOT NULL DEFAULT '',
  ADD COLUMN width integer,
  ADD COLUMN height integer,
  ADD COLUMN thumbnail_key text,
  ADD COLUMN thumbnail_sha256 text,
  ADD COLUMN original_key text,
  ADD COLUMN edit jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.lesson_media ADD CONSTRAINT lesson_media_library_metadata_ck CHECK (
  length(original_name)<=255 AND length(caption)<=1000
  AND (width IS NULL OR width BETWEEN 1 AND 8192)
  AND (height IS NULL OR height BETWEEN 1 AND 8192)
  AND (thumbnail_key IS NULL OR thumbnail_key ~ '^thumbs/[a-f0-9-]{36}\.webp$')
  AND (thumbnail_sha256 IS NULL OR thumbnail_sha256 ~ '^[a-f0-9]{64}$')
  AND (original_key IS NULL OR original_key ~ '^originals/[a-f0-9-]{36}\.webp$')
  AND jsonb_typeof(edit)='object'
);
CREATE INDEX lesson_media_library_created_idx ON public.lesson_media(created_at DESC,id);
-- No data deletion, role change, grant, replacement table or mutation of revisions.
