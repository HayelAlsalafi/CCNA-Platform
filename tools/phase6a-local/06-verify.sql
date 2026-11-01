-- READ ONLY, database ccna_phase6a_dev, role postgres, fingerprint pinned.
BEGIN READ ONLY;
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

SELECT local_runtime_guard.identity() AS identity;
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit
FROM pg_catalog.pg_roles WHERE rolname IN ('ccna_phase6a_app','ccna_phase6a_migrator');
SELECT r.rolname AS database_owner, d.datallowconn
FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba
WHERE d.datname='ccna_phase6a_dev';
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
SELECT has_database_privilege('ccna_phase6a_app',current_database(),'CREATE') AS app_database_create,
       has_database_privilege('ccna_phase6a_app',current_database(),'TEMP') AS app_temp,
       has_schema_privilege('ccna_phase6a_app','public','CREATE') AS app_schema_create,
       has_schema_privilege('ccna_phase6a_app','drizzle','USAGE') AS app_ledger_access,
       has_column_privilege('ccna_phase6a_app','users','role','UPDATE') AS app_role_update,
       has_column_privilege('ccna_phase6a_app','users','status','UPDATE') AS app_status_update,
       has_table_privilege('ccna_phase6a_app','users','DELETE') AS app_user_delete,
       has_table_privilege('ccna_phase6a_app','practice_attempts','UPDATE') AS app_history_update,
       has_table_privilege('ccna_phase6a_app','practice_attempts','DELETE') AS app_history_delete;
-- All nine privilege results above must be false.
SELECT count(*) AS users, count(*) FILTER (WHERE role='ADMIN') AS admins FROM public.users;
ROLLBACK;
