-- MUTATING: requires separate approval.
-- pgAdmin auto-commit must be ON. Execute SECTION A first.
-- Then select ONLY the single CREATE DATABASE statement in SECTION B and execute.
-- NEVER execute this whole file as one multi-statement request/transaction.

-- SECTION A: guard, in the same postgres Query Tool connection as Section B.
DO $guard$
BEGIN
  IF current_database() <> 'postgres' OR session_user <> 'postgres'
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

DO $collision$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'ccna_phase6a_dev')
     OR (SELECT count(*) FROM pg_catalog.pg_roles
         WHERE rolname IN ('ccna_phase6a_app','ccna_phase6a_migrator')
           AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
           AND NOT rolreplication AND NOT rolbypassrls AND NOT rolinherit AND rolcanlogin) <> 2 THEN
    RAISE EXCEPTION 'Database collision or unexpected new-role attributes; stop';
  END IF;
END
$collision$;

-- SECTION B: SELECT AND EXECUTE ONLY THIS STATEMENT, outside a transaction.
CREATE DATABASE ccna_phase6a_dev OWNER ccna_phase6a_migrator
  TEMPLATE template0 ENCODING 'UTF8' ALLOW_CONNECTIONS false;
