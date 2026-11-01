-- MUTATING: separate approval. Run only after guarded Drizzle migrations.
-- Database ccna_phase6a_dev, role postgres, confirmed fingerprint pinned.
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'ccna_phase6a_dev' OR session_user <> 'postgres'
     OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = session_user)
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5432
     OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
     OR lower(rtrim(replace(current_setting('data_directory'), chr(92), '/'), '/')) <> 'c:/program files/postgresql/18/data'
     OR coalesce(current_setting('neon.branch_id', true), '') <> '' THEN
    RAISE EXCEPTION 'Wrong local PostgreSQL administrator target; stop';
  END IF;
  IF coalesce(current_setting('ccna.bootstrap_system_identifier', true), '') !~ '^[0-9]{10,25}$'
     OR current_setting('ccna.bootstrap_system_identifier', true) <>
        (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) THEN
    RAISE EXCEPTION 'Confirmed cluster fingerprint is missing or mismatched; stop';
  END IF;
END
$guard$;

DO $schema$
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 5
     OR (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') <> 7
     OR (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
         AND table_name IN ('users','topics','questions','question_options','practice_attempts','question_revisions','practice_deliveries')) <> 7 THEN
    RAISE EXCEPTION 'Expected five migrations and seven application tables missing; stop';
  END IF;
END
$schema$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, ccna_phase6a_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, ccna_phase6a_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ccna_phase6a_app;
GRANT SELECT, INSERT, UPDATE ON public.topics, public.questions TO ccna_phase6a_app;
-- Existing editor replaces question options in a transaction.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO ccna_phase6a_app;
GRANT SELECT, INSERT ON public.practice_attempts TO ccna_phase6a_app;
GRANT SELECT, INSERT ON public.question_revisions, public.practice_deliveries TO ccna_phase6a_app;
GRANT SELECT, INSERT ON public.users TO ccna_phase6a_app;
GRANT UPDATE (email, display_name, updated_at, last_login_at) ON public.users TO ccna_phase6a_app;
GRANT USAGE ON SEQUENCE public.question_code_seq TO ccna_phase6a_app;
GRANT USAGE ON TYPE public.topic_status, public.user_role, public.user_status,
  public.question_difficulty, public.question_status, public.question_type TO ccna_phase6a_app;
GRANT EXECUTE ON FUNCTION public.prevent_question_code_update() TO ccna_phase6a_app;
COMMIT;
-- INSERT is needed by existing provisioning, which explicitly inserts USER/ACTIVE.
-- Column ACLs prevent UPDATE(role/status), not arbitrary INSERT values by someone
-- possessing DB credentials. Those credentials remain server/operator-only.
