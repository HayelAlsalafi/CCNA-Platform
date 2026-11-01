-- MUTATING: separate approval. NEW Query Tool: database ccna_phase6a_dev,
-- role postgres; pin the confirmed fingerprint again in this connection.
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

DO $empty$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN ('local_runtime_guard','drizzle'))
     OR EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') THEN
    RAISE EXCEPTION 'New database is not empty as expected; stop';
  END IF;
END
$empty$;
ALTER SCHEMA public OWNER TO ccna_phase6a_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ccna_phase6a_app;
CREATE SCHEMA drizzle AUTHORIZATION ccna_phase6a_migrator;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC;

-- Operational identity helper only; no application tables or migrations here.
-- Owned by postgres, fixed pg_catalog search path, read-only expression.
CREATE SCHEMA local_runtime_guard AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA local_runtime_guard FROM PUBLIC;
CREATE FUNCTION local_runtime_guard.identity() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $identity$
  SELECT jsonb_build_object(
    'database', current_database(), 'sessionRole', session_user,
    'host', host(inet_server_addr()), 'port', inet_server_port(),
    'versionNumber', current_setting('server_version_num')::integer,
    'dataDirectory', current_setting('data_directory'),
    'systemIdentifier', (SELECT system_identifier::text FROM pg_control_system()),
    'neon', current_setting('neon.branch_id', true));
$identity$;
REVOKE ALL ON FUNCTION local_runtime_guard.identity() FROM PUBLIC;
GRANT USAGE ON SCHEMA local_runtime_guard TO ccna_phase6a_app, ccna_phase6a_migrator;
GRANT EXECUTE ON FUNCTION local_runtime_guard.identity() TO ccna_phase6a_app, ccna_phase6a_migrator;
-- Future objects must receive reviewed explicit grants, not blanket app access.
ALTER DEFAULT PRIVILEGES FOR ROLE ccna_phase6a_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE ccna_phase6a_migrator REVOKE USAGE ON TYPES FROM PUBLIC;
COMMIT;
