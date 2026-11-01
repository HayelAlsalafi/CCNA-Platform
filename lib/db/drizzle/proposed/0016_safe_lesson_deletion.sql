-- PROPOSAL ONLY: unregistered and unapplied. Separate activation approval required.
-- No direct DELETE privilege, revision mutation, learner cleanup or media deletion.
CREATE FUNCTION public.delete_never_published_lesson(selected_lesson uuid, admin_actor uuid, expected_version integer, confirmed_title text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor public.users%ROWTYPE; target public.lessons%ROWTYPE; reference_pattern text;
BEGIN
 IF selected_lesson IS NULL OR admin_actor IS NULL OR expected_version IS NULL OR expected_version<1 OR confirmed_title IS NULL THEN
  RAISE EXCEPTION 'Explicit deletion confirmation required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO actor FROM public.users WHERE id=admin_actor FOR SHARE;
 IF NOT FOUND OR actor.role::text<>'ADMIN' OR actor.status::text<>'ACTIVE' THEN
  RAISE EXCEPTION 'Active Admin required' USING ERRCODE='42501';
 END IF;
 -- JSON links have no FK: briefly serialize authoring writes during reference
 -- inspection. Row locks alone would not protect links in OTHER lesson rows.
 LOCK TABLE public.lessons,public.lesson_revisions IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO target FROM public.lessons WHERE id=selected_lesson FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lesson not found; reload the library' USING ERRCODE='P0002'; END IF;
 IF target.version<>expected_version THEN RAISE EXCEPTION 'Lesson changed; reload before deleting' USING ERRCODE='40001'; END IF;
 IF confirmed_title IS DISTINCT FROM target.title THEN RAISE EXCEPTION 'Lesson title confirmation does not match' USING ERRCODE='22023'; END IF;
 IF target.published_revision_id IS NOT NULL THEN
  RAISE EXCEPTION 'Published lessons cannot be deleted' USING ERRCODE='23514',CONSTRAINT='lesson_delete_published';
 END IF;
 -- Definer is the table owner: these checks see ALL learners despite owner RLS.
 IF EXISTS(SELECT 1 FROM public.lesson_progress WHERE lesson_id=selected_lesson) THEN
  RAISE EXCEPTION 'Learner progress protects this lesson' USING ERRCODE='23514',CONSTRAINT='lesson_delete_progress';
 END IF;
 IF EXISTS(SELECT 1 FROM public.lesson_annotations WHERE lesson_id=selected_lesson) THEN
  RAISE EXCEPTION 'Learner notes, highlights or bookmarks protect this lesson' USING ERRCODE='23514',CONSTRAINT='lesson_delete_annotations';
 END IF;
 IF EXISTS(SELECT 1 FROM public.lesson_revisions WHERE lesson_id=selected_lesson) THEN
  RAISE EXCEPTION 'Previously published revisions protect this lesson' USING ERRCODE='23514',CONSTRAINT='lesson_delete_revisions';
 END IF;
 -- Conservative: block any UUID mention in another draft or published snapshot,
 -- including links and lab references. Never rewrite authored content to proceed.
 -- Include case variants and percent-encoded UUID characters in supported links.
 SELECT string_agg('('||part||'|%'||to_hex(ascii(part))||'|%'||to_hex(ascii(upper(part)))||')','') INTO reference_pattern FROM regexp_split_to_table(selected_lesson::text,'') AS part;
 IF EXISTS(SELECT 1 FROM public.lessons WHERE id<>selected_lesson AND blocks::text ~* reference_pattern)
 OR EXISTS(SELECT 1 FROM public.lesson_revisions WHERE snapshot::text ~* reference_pattern) THEN
  RAISE EXCEPTION 'Other lesson content references this lesson' USING ERRCODE='23514',CONSTRAINT='lesson_delete_content_reference';
 END IF;
 -- New or changed FK dependencies must be reviewed, even if currently empty.
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE contype='f' AND confrelid='public.lessons'::regclass
  AND NOT(conrelid='public.lesson_revisions'::regclass AND conname='lesson_revisions_lesson_id_fkey' AND confdeltype='r')) THEN
  RAISE EXCEPTION 'Unreviewed lesson dependency' USING ERRCODE='23514',CONSTRAINT='lesson_delete_unknown_dependency';
 END IF;
 DELETE FROM public.lessons WHERE id=selected_lesson;
 RETURN jsonb_build_object('id',selected_lesson,'deleted',true);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_never_published_lesson(uuid,uuid,integer,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_never_published_lesson(uuid,uuid,integer,text) TO ccna_phase6a_app;
