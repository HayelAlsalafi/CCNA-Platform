-- MUTATING: separate approval. Still connected to postgres, role postgres.
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

DO $database$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba
                 WHERE d.datname='ccna_phase6a_dev' AND r.rolname='ccna_phase6a_migrator'
                   AND NOT d.datallowconn) THEN
    RAISE EXCEPTION 'Expected newly created, connection-disabled database missing; stop';
  END IF;
END
$database$;
REVOKE ALL ON DATABASE ccna_phase6a_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE ccna_phase6a_dev TO ccna_phase6a_app, ccna_phase6a_migrator;
ALTER DATABASE ccna_phase6a_dev ALLOW_CONNECTIONS true;
COMMIT;
