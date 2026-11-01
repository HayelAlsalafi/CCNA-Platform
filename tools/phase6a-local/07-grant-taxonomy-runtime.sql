-- INERT until separately approved and explicitly executed by a local administrator.
-- Run only after a successful upgrade, in ccna_phase6a_dev as postgres.
-- No role creation, default privileges, blanket grants or existing-data writes.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '3s';
DO $guard$
BEGIN
  IF current_database() <> 'ccna_phase6a_dev' OR session_user <> 'postgres'
     OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
     OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
     OR inet_server_port() IS DISTINCT FROM 5432
     OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999
     OR lower(rtrim(replace(current_setting('data_directory'),chr(92),'/'),'/')) <> 'c:/program files/postgresql/18/data'
     OR (SELECT system_identifier::text FROM pg_control_system()) <> '7694701597474139084'
     OR coalesce(current_setting('neon.branch_id',true),'') <> '' THEN
    RAISE EXCEPTION 'Wrong approved local administrator identity; stop';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ccna_phase6a_app'
     AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls)
     OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='ccna_phase6a_app') THEN
    RAISE EXCEPTION 'Unexpected application role attributes or memberships; stop';
  END IF;
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 6 OR EXISTS (
    -- Compare multisets in both directions; duplicates must also match exactly.
    WITH expected(hash,created_at) AS (VALUES
      ('b39fe82f5797542f49912d07408d96f8bac49a592263dde8082505ccea8d9bd4',1790841815042::bigint),
      ('b3fee57baf66f4cb0d3cd27efee61d5508e93123b4ea6f42b120a78173a88a58',1791178791105::bigint),
      ('63dd70e696142401560e5d5063ca39d0498107b9e67ae8cdf2756c352709b28f',1791178792322::bigint),
      ('0117dfe4623e214b59f806b70dc684bdc963c25bb83895c327ea86b10fbc6a3d',1791446400000::bigint),
      ('74584d593471b633abd8387f44d15c19b9cdd49b3fa54cfaa26712d1c043b495',1791694800000::bigint),
      ('d1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226',1791808640068::bigint)
    ), actual AS (
      SELECT hash,created_at FROM drizzle.__drizzle_migrations
    ), discrepancies AS (
      (SELECT hash,created_at FROM actual
       EXCEPT ALL SELECT hash,created_at FROM expected)
      UNION ALL
      (SELECT hash,created_at FROM expected
       EXCEPT ALL SELECT hash,created_at FROM actual)
    )
    SELECT 1 FROM discrepancies
  ) OR (SELECT count(DISTINCT created_at) FROM drizzle.__drizzle_migrations) <> 6 THEN
    RAISE EXCEPTION 'Expected six reviewed migration ledger entries missing; stop';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('exam_blueprints','exam_domains','exam_objectives','question_objectives')
      AND c.relkind='r' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname='ccna_phase6a_migrator')) <> 4 THEN
    RAISE EXCEPTION 'Expected migrator-owned taxonomy tables missing; stop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('exam_blueprints','exam_domains','exam_objectives','question_objectives') AND (
      (c.relname <> 'question_objectives' AND has_table_privilege('ccna_phase6a_app',c.oid,'DELETE'))
      OR has_table_privilege('ccna_phase6a_app',c.oid,'TRUNCATE')
      OR has_table_privilege('ccna_phase6a_app',c.oid,'REFERENCES')
      OR has_table_privilege('ccna_phase6a_app',c.oid,'TRIGGER')))
     OR has_sequence_privilege('ccna_phase6a_app','public.question_code_seq','UPDATE')
     OR has_database_privilege('ccna_phase6a_app',current_database(),'CREATE')
     OR has_database_privilege('ccna_phase6a_app',current_database(),'TEMP')
     OR has_schema_privilege('ccna_phase6a_app','public','CREATE')
     OR has_schema_privilege('ccna_phase6a_app','drizzle','USAGE') THEN
    RAISE EXCEPTION 'Unsafe runtime privileges; stop without revoking or repairing automatically';
  END IF;
END
$guard$;
GRANT SELECT, INSERT, UPDATE ON public.exam_blueprints, public.exam_domains, public.exam_objectives, public.question_objectives TO ccna_phase6a_app;
-- Required only by explicit association replacement, which deletes mapping rows.
GRANT DELETE ON public.question_objectives TO ccna_phase6a_app;
GRANT USAGE ON TYPE public.exam_blueprint_status TO ccna_phase6a_app;
-- Existing question import uses the existing code allocator, not a new sequence.
GRANT USAGE ON SEQUENCE public.question_code_seq TO ccna_phase6a_app;
COMMIT;
