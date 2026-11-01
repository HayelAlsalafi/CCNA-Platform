-- This is not a migration runner or backup workflow. Exact schema verification is also required before any approval to execute.
-- PROPOSAL ONLY. Do not execute until isolated PostgreSQL verification and separate active-database approval.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE mismatch boolean; identity jsonb; item record;
BEGIN
 identity:=local_runtime_guard.identity();
 IF current_database()<>'ccna_phase6a_dev' OR current_user<>'ccna_phase6a_migrator' OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5432 OR current_setting('server_version_num')::int<>180006 OR (identity->>'systemIdentifier') IS DISTINCT FROM '7694701597474139084' OR current_setting('data_directory')<>'C:/Program Files/PostgreSQL/18/data' THEN RAISE EXCEPTION 'Wrong approved local identity'; END IF;
 IF (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>current_user THEN RAISE EXCEPTION 'Wrong database owner'; END IF;
 IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('ccna_phase6a_app','ccna_phase6a_migrator') AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls)<>2 OR EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname IN ('ccna_phase6a_app','ccna_phase6a_migrator')) THEN RAISE EXCEPTION 'Unexpected role attributes'; END IF;
 WITH expected(hash,created_at) AS (VALUES ('b39fe82f5797542f49912d07408d96f8bac49a592263dde8082505ccea8d9bd4',1790841815042::bigint),
('b3fee57baf66f4cb0d3cd27efee61d5508e93123b4ea6f42b120a78173a88a58',1791178791105::bigint),
('63dd70e696142401560e5d5063ca39d0498107b9e67ae8cdf2756c352709b28f',1791178792322::bigint),
('0117dfe4623e214b59f806b70dc684bdc963c25bb83895c327ea86b10fbc6a3d',1791446400000::bigint),
('74584d593471b633abd8387f44d15c19b9cdd49b3fa54cfaa26712d1c043b495',1791694800000::bigint),
('d1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226',1791808640068::bigint),
('2b77bb268d42f33d2fe24d0fb909939e8253a17e751c5b56beebb6332dfaf298',1791964800000::bigint),
('b2578800031d07e81297591577b862cfe3952a0955cfc8f1af204637be088b40',1792022400000::bigint),
('b608cb80e72745c41904bdfa5292c74218b44f9a94c7d5975b3738e17a4010c4',1792022401000::bigint),
('cd2ea484ba1b6f850eb1f64b95fbe91869deecd2093061e05336588819492cef',1792108800000::bigint),
('31d30aba74261ab2cdcf3e1bc5298fab4b9fd3e7743f1f1659255a4a26fd7b5f',1792108801000::bigint),
('27dd0aaa98728d0bcc20ba07b1e5ce92bc6f914a5f04549d503f61ddb2699316',1792195200000::bigint),
('a371c060f9d712c1ea00934f01d7ff2899af370c7ab216b009bdd0610c1291ea',1792368000000::bigint))
 SELECT EXISTS((SELECT hash,created_at FROM drizzle.__drizzle_migrations EXCEPT ALL SELECT * FROM expected) UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT hash,created_at FROM drizzle.__drizzle_migrations)) INTO mismatch;
 IF mismatch OR (SELECT count(*) FROM drizzle.__drizzle_migrations)<>13 OR (SELECT count(DISTINCT id) FROM drizzle.__drizzle_migrations)<>13 THEN RAISE EXCEPTION 'Exact thirteen-entry ledger mismatch'; END IF;
 FOR item IN SELECT * FROM (VALUES ('guard_exam_state','26f8c4225e4cf92cddaf95488c020704dbc9671a0249df48a3dd93a4b446621a'),('execute_question_deletion','120310c1864ae4a10e91bdfb20381119c5e0db31fd78ef81453869ffdaf2d2ba'),('execute_question_deletion_pre_exam','1c3ab3e7851500d89af51a1a87bf24a4fea8b735c7b23160561e6ad1848efd21')) f(name,hash) LOOP
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=item.name AND pg_get_userbyid(proowner)=current_user AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=item.hash AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))<>1 THEN RAISE EXCEPTION 'Exam function identity mismatch'; END IF;
 END LOOP;
 FOR item IN SELECT c.* FROM pg_class c WHERE c.oid IN ('public.exam_sessions'::regclass,'public.exam_session_items'::regclass) LOOP
  IF pg_get_userbyid(item.relowner)<>current_user OR item.relkind<>'r' OR has_table_privilege('ccna_phase6a_app',item.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege('ccna_phase6a_app',item.oid,'REFERENCES') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(item.relacl,acldefault('r',item.relowner))) a WHERE a.grantee=0) THEN RAISE EXCEPTION 'Unsafe exam table ownership/privileges'; END IF;
 END LOOP;
END $$;
GRANT SELECT,INSERT ON public.exam_sessions,public.exam_session_items TO ccna_phase6a_app;
GRANT UPDATE(status,finalized_at,result) ON public.exam_sessions TO ccna_phase6a_app;
GRANT UPDATE(selected_keys,flagged,answer_version,graded_result) ON public.exam_session_items TO ccna_phase6a_app;
DO $$
DECLARE c record; expected boolean;
BEGIN
 FOR c IN SELECT a.attname,c.relname,a.attrelid,a.attnum FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE a.attrelid IN ('public.exam_sessions'::regclass,'public.exam_session_items'::regclass) AND a.attnum>0 AND NOT a.attisdropped LOOP
  expected:=(c.relname='exam_sessions' AND c.attname=ANY(ARRAY['status','finalized_at','result'])) OR (c.relname='exam_session_items' AND c.attname=ANY(ARRAY['selected_keys','flagged','answer_version','graded_result']));
  IF has_column_privilege('ccna_phase6a_app',c.attrelid,c.attnum,'UPDATE')<>expected THEN RAISE EXCEPTION 'Unexpected exam column privilege'; END IF;
 END LOOP;
END $$;
COMMIT;
