-- MUTATING: requires separate approval. Pin the confirmed fingerprint in this
-- SAME Query Tool connection using the procedure in the preparation document.
BEGIN;
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
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('ccna_phase6a_app','ccna_phase6a_migrator'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'ccna_phase6a_dev') THEN
    RAISE EXCEPTION 'A proposed role or database already exists; stop without modifying it';
  END IF;
END
$collision$;
-- No passwords in SQL. Password authentication fails until NEW-role passwords
-- are set manually through pgAdmin after separate approval.
CREATE ROLE ccna_phase6a_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD NULL;
CREATE ROLE ccna_phase6a_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 15 PASSWORD NULL;
COMMIT;
