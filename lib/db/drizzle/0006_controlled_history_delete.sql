-- Explicit, atomic question/history deletion. No table permissions or FK changes.
-- Permits exist only in a definer-owned private temporary relation in this session.
CREATE OR REPLACE FUNCTION public.reject_revision_history_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE allowed boolean := false; permits oid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    permits := to_regclass('pg_temp.ccna_history_delete_permits');
    IF permits IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
      WHERE c.oid=permits AND c.relpersistence='t' AND r.rolname=current_user
    ) THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM pg_temp.ccna_history_delete_permits WHERE transaction_id=$1 AND relation_id=$2 AND record_id=$3)'
        INTO allowed USING pg_current_xact_id()::text,TG_RELID,OLD.id;
    END IF;
    IF allowed THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'Revision, delivery and attempt records are append-only outside an explicitly confirmed deletion'
    USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.delete_question_with_history(selected_question uuid, admin_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE permits oid; counts jsonb; affected integer; actor public.users%ROWTYPE;
BEGIN
  -- NULL is reserved for the owner-operated, independently guarded local cleanup.
  IF admin_actor IS NULL THEN
    IF session_user <> current_user THEN
      RAISE EXCEPTION 'Owner-operated cleanup identity required' USING ERRCODE='insufficient_privilege';
    END IF;
  ELSE
    SELECT * INTO actor FROM public.users WHERE id=admin_actor FOR SHARE;
    IF NOT FOUND OR actor.role::text <> 'ADMIN' OR actor.status::text <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Active Admin identity required' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;
  PERFORM 1 FROM public.questions WHERE id=selected_question FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected question not found' USING ERRCODE='no_data_found'; END IF;
  -- Reject corrupt/shared references; never broaden the selected question set.
  IF EXISTS (SELECT 1 FROM public.practice_attempts a
    LEFT JOIN public.question_revisions r ON r.id=a.revision_id
    LEFT JOIN public.practice_deliveries d ON d.id=a.delivery_id
    WHERE (a.question_id=selected_question OR r.question_id=selected_question OR d.question_id=selected_question)
      AND (a.question_id<>selected_question OR (r.id IS NOT NULL AND r.question_id<>selected_question)
           OR (d.id IS NOT NULL AND d.question_id<>selected_question)))
    OR EXISTS (SELECT 1 FROM public.practice_deliveries d JOIN public.question_revisions r ON r.id=d.revision_id
      WHERE (d.question_id=selected_question OR r.question_id=selected_question) AND d.question_id<>r.question_id) THEN
    RAISE EXCEPTION 'Shared historical dependency' USING ERRCODE='check_violation';
  END IF;
  permits := to_regclass('pg_temp.ccna_history_delete_permits');
  IF permits IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner
    WHERE c.oid=permits AND c.relpersistence='t' AND r.rolname=current_user
  ) THEN RAISE EXCEPTION 'Unexpected deletion permit owner' USING ERRCODE='insufficient_privilege'; END IF;
  IF permits IS NULL THEN
    CREATE TEMP TABLE ccna_history_delete_permits (
      transaction_id text NOT NULL, relation_id oid NOT NULL, record_id uuid NOT NULL,
      PRIMARY KEY(transaction_id,relation_id,record_id)
    ) ON COMMIT DROP;
    REVOKE ALL ON TABLE pg_temp.ccna_history_delete_permits FROM PUBLIC;
  END IF;
  INSERT INTO pg_temp.ccna_history_delete_permits
    SELECT pg_current_xact_id()::text,'public.practice_attempts'::regclass,id FROM public.practice_attempts WHERE question_id=selected_question
    UNION ALL SELECT pg_current_xact_id()::text,'public.practice_deliveries'::regclass,id FROM public.practice_deliveries WHERE question_id=selected_question
    UNION ALL SELECT pg_current_xact_id()::text,'public.question_revisions'::regclass,id FROM public.question_revisions WHERE question_id=selected_question;
  counts := jsonb_build_object(
    'attempts',(SELECT count(*) FROM public.practice_attempts WHERE question_id=selected_question),
    'deliveries',(SELECT count(*) FROM public.practice_deliveries WHERE question_id=selected_question),
    'revisions',(SELECT count(*) FROM public.question_revisions WHERE question_id=selected_question));
  DELETE FROM public.practice_attempts WHERE question_id=selected_question;
  DELETE FROM public.practice_deliveries WHERE question_id=selected_question;
  DELETE FROM public.question_revisions WHERE question_id=selected_question;
  DELETE FROM public.question_objectives WHERE question_id=selected_question;
  DELETE FROM public.questions WHERE id=selected_question;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 OR EXISTS (SELECT 1 FROM public.questions WHERE id=selected_question) THEN
    RAISE EXCEPTION 'Physical deletion verification failed' USING ERRCODE='check_violation';
  END IF;
  DELETE FROM pg_temp.ccna_history_delete_permits WHERE transaction_id=pg_current_xact_id()::text;
  RETURN counts;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_question_with_history(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reject_revision_history_change() FROM PUBLIC;
