// PREPARATION ONLY. Default mode performs no database or server operations.
// Verification/execution modes require separate, explicit user authorization.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateHba, protectedSession, bounded, disconnect, runPrimaryRace } from "../../safety.mjs";
import { decodeProfile, validateSourceHashes, assertRunIdentity, connectionConfig, assertServerIdentity } from "./profile.mjs";

const manifest = decodeProfile(readFileSync(new URL("./manifest.json", import.meta.url)));
const workspace = path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const runRoot = path.join(workspace, ".local", "taxonomy-rehearsal", manifest.database);
const dataDirectory = path.join(runRoot, "data");
const canonical = (value) => value.replaceAll("\\", "/").toLowerCase();
const markerValue = `taxonomy-rehearsal:${manifest.nonce}`;
const id = (number) => `11111111-1111-4111-8111-${String(number).padStart(12, "0")}`;
const baselineTables = ["users", "topics", "questions", "question_options", "practice_attempts", "question_revisions", "practice_deliveries"];
const modes = ["--plan", "--print-hba", "--verify-maintenance", "--verify-empty", "--execute-disposable"];
const mode = process.argv[2] ?? "--plan";
assert(process.argv.length <= 3 && modes.includes(mode), "Use exactly one supported mode; no arbitrary database/host arguments are accepted.");
assert.equal(canonical(workspace), canonical(manifest.workspace));
assert.equal(execFileSync("git", ["--no-optional-locks", "branch", "--show-current"], { cwd: workspace, encoding: "utf8" }).trim(), manifest.branch);
assert.equal(execFileSync("git", ["--no-optional-locks", "rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim(), manifest.head);
validateSourceHashes(manifest, relative => readFileSync(path.join(workspace, relative)));
const journal = JSON.parse(readFileSync(path.join(workspace, "lib/db/drizzle/meta/_journal.json"), "utf8"));
assert.equal(journal.entries.at(-1).tag, "0004_question_revisions");
assert.equal(journal.entries.length, 5);
assert.equal(manifest.host, "127.0.0.1");
assert.equal(manifest.port, 55440);
assert.equal(manifest.database, "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170");
assert.equal(manifest.owner, "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170");
assert.equal(manifest.nonce, "8e6c4b9a2170");

if (mode === "--print-hba") {
  console.log(privateHba(manifest.database, manifest.owner).join("\n"));
} else if (mode === "--plan") {
  console.log(JSON.stringify({ status: "PREPARATION_ONLY", databaseOperations: 0,
    postgresVersion: manifest.postgresVersion, database: manifest.database, host: manifest.host,
    port: manifest.port, owner: manifest.owner, runRoot, dataDirectory,
    profileId: manifest.profileId, validatedInputs: manifest.inputs.length, validatedSourceInputs: manifest.sourceInputs.length,
    manifestImmutable: true, execution: "Fresh empty database only; no resume or cleanup mode.",
    privateHba: privateHba(manifest.database, manifest.owner),
    stages: ["apply 0000..0003", "synthetic legacy fixtures", "apply 0004", "synthetic revision/delivery fixtures", "capture rows and schema", "apply proposed 0005", "assert compatibility and taxonomy constraints", "two-session primary-update races"],
    assertionGroups: ["SQL application and original row/schema/sequence preservation","Validated constraints and exact partial primary index","Multiple objectives and independent blueprint primaries","Missing references and cross-blueprint rejection","RESTRICT deletion rejection (23001, exact FK)","Original revision/delivery/attempt and question-code rules","Concurrent promotions: first COMMIT, contender 23505","Concurrent promotions: first ROLLBACK, contender succeeds","Final original rows and question-code sequence preservation"],
    approvalRequired: "Separate explicit approval for cluster creation, execution, cleanup and migration promotion.",
  }, null, 2));
} else {
  // Do not load the PostgreSQL driver until an explicit execution flag is supplied.
  assert.equal(canonical(realpathSync(runRoot)), canonical(runRoot), "Run directory must not resolve through a junction/symlink.");
  assert.equal(canonical(realpathSync(dataDirectory)), canonical(dataDirectory));
  const hbaRules = readFileSync(path.join(dataDirectory, "pg_hba.conf"), "utf8").replace(/^\uFEFF/, "")
    .split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim().replace(/\s+/g, " ")).filter(Boolean);
  assert.deepEqual(hbaRules, privateHba(manifest.database, manifest.owner), "Private HBA policy changed; refuse connection.");
  const marker = JSON.parse(readFileSync(path.join(runRoot, "owner.json"), "utf8").replace(/^\uFEFF/, ""));
  assert.deepEqual(marker, { nonce: manifest.nonce, database: manifest.database, owner: manifest.owner, port: manifest.port, dataDirectory });
  const pidLines = readFileSync(path.join(dataDirectory, "postmaster.pid"), "utf8").trim().split(/\r?\n/);
  assert.equal(canonical(pidLines[1]), canonical(dataDirectory));
  assert.equal(Number(pidLines[3]), manifest.port);
  const pid = Number(pidLines[0]);
  assert(Number.isSafeInteger(pid) && pid > 0);
  const powershell = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const listener = JSON.parse(execFileSync(powershell, ["-NoProfile", "-Command",
    `$rehearsalListeners = @(Get-NetTCPConnection -LocalPort ${manifest.port} -State Listen -ErrorAction Stop); if ($rehearsalListeners.Count -ne 1) { throw 'Expected one private listener' }; $rehearsalListener = $rehearsalListeners[0]; [pscustomobject]@{Address=$rehearsalListener.LocalAddress;Pid=$rehearsalListener.OwningProcess;Executable=(Get-Process -Id $rehearsalListener.OwningProcess -ErrorAction Stop).Path} | ConvertTo-Json -Compress`,
  ], { encoding: "utf8" }));
  assert.equal(listener.Address, manifest.host);
  assert.equal(listener.Pid, pid);
  assert.equal(canonical(listener.Executable), canonical(path.join(manifest.postgresBin, "postgres.exe")));
  assertRunIdentity(manifest, { root: runRoot, realRoot: realpathSync(runRoot), dataDirectory, realDataDirectory: realpathSync(dataDirectory),
    marker, pidLines, listener, executableVersion: execFileSync(path.join(manifest.postgresBin, "postgres.exe"), ["--version"], { encoding: "utf8" }).trim() });
  // Delete process-level overrides without inspecting their secret values.
  for (const name of ["DATABASE_URL", "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGOPTIONS", "PGSSLMODE", "PGREPLICATION", "PGCLIENT_ENCODING", "PGAPPNAME", "PGSSLNEGOTIATION"]) delete process.env[name];
  const { Client } = createRequire(path.join(workspace, "artifacts/api-server/package.json"))("pg");
  async function connect(database = manifest.database, readOnly = false) {
    const client = new Client(connectionConfig(manifest, database, readOnly));
    const session = protectedSession(client);
    client.on("error", () => disconnect(client));
    try {
      await bounded(client.connect(), 6000, "connection", { onTimeout: () => disconnect(client) });
      const identity = (await session.query("SELECT current_database() AS database, current_user AS owner, current_setting('data_directory') AS directory, host(inet_server_addr()) AS host, inet_server_port() AS port, current_setting('server_version_num')::int AS version")).rows[0];
      assertServerIdentity(manifest, identity, database, dataDirectory);
      return session;
    } catch (error) {
      try { await session.close(); } catch (closeError) { throw new AggregateError([error, closeError], "Connection/session cleanup failed"); }
      throw error;
    }
  }
  if (mode === "--verify-maintenance" || mode === "--verify-empty") {
    const database = mode === "--verify-maintenance" ? "postgres" : manifest.database;
    const client = await connect(database, true);
    const probes = [];
    async function rejection(name, override, code) {
      const raw = new Client({ ...connectionConfig(manifest, database, true), ...override });
      const session = protectedSession(raw);
      raw.on("error", () => disconnect(raw));
      let error;
      try {
        try { await bounded(raw.connect(), 6000, name, { onTimeout: () => disconnect(raw) }); } catch (value) { error = value; }
        assert(error, name + ": unauthorized connection accepted; STOP");
        assert.equal(error.code, code, name + ": unexpected failure");
        if (code === "28000") assert.match(error.message, /pg_hba.conf rejects/);
        probes.push({ name, result: "REJECTED_AS_EXPECTED", code });
      } finally { await session.close(); }
    }
    try {
      const settings = (await client.query("SELECT current_setting('hba_file') AS hba_file,current_setting('listen_addresses') AS listen_addresses,current_setting('unix_socket_directories') AS unix_socket_directories,current_setting('default_transaction_read_only') AS read_only")).rows[0];
      assert.equal(canonical(settings.hba_file), canonical(path.join(dataDirectory, "pg_hba.conf")));
      assert.equal(settings.listen_addresses, manifest.host); assert.equal(settings.unix_socket_directories, ""); assert.equal(settings.read_only, "on");
      const rules = (await client.query("SELECT type,database,user_name,address,netmask,auth_method,error FROM pg_hba_file_rules ORDER BY line_number")).rows;
      assert.equal(rules.length, 7); assert(rules.every(rule => rule.error === null));
      assert.deepEqual(rules.map(rule => [rule.type,rule.database,rule.user_name,rule.auth_method]), [
        ["local",["all"],["all"],"reject"], ["local",["replication"],["all"],"reject"],
        ["host",[manifest.database,"postgres"],[manifest.owner],"trust"],
        ["host",["all"],["all"],"reject"], ["host",["replication"],["all"],"reject"],
        ["host",["all"],["all"],"reject"], ["host",["replication"],["all"],"reject"],
      ]);
      assert.equal(rules[2].address, "127.0.0.1"); assert.equal(rules[2].netmask, "255.255.255.255");
      for (const i of [3,4]) { assert.equal(rules[i].address, "0.0.0.0"); assert.equal(rules[i].netmask, "0.0.0.0"); }
      for (const i of [5,6]) { assert.equal(rules[i].address, "::"); assert.equal(rules[i].netmask, "::"); }
      const databases = (await client.query("SELECT datname,pg_get_userbyid(datdba) AS owner FROM pg_database ORDER BY datname")).rows;
      const expected = ["postgres","template0","template1", ...(mode === "--verify-empty" ? [manifest.database] : [])].sort();
      assert.deepEqual(databases.map(row => row.datname).sort(), expected);
      assert(databases.every(row => row.owner === manifest.owner));
      let empty;
      if (mode === "--verify-empty") {
        empty = (await client.query("SELECT (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%') AS user_relations,(SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS public_types,(SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS public_functions")).rows[0];
        assert.deepEqual(empty, { user_relations: 0, public_types: 0, public_functions: 0 });
      }
      await rejection("unauthorized role", { user: "postgres" }, "28000");
      await rejection("unauthorized database", { database: "template1" }, "28000");
      await rejection("physical replication", { replication: "true" }, "28000");
      await rejection("IPv6 loopback", { host: "::1" }, "ECONNREFUSED");
      console.log(JSON.stringify({ status: "PASS", mode, profileId: manifest.profileId, database, owner: manifest.owner, host: manifest.host, port: manifest.port, dataDirectory, listener, postgresVersion: manifest.postgresVersion, hardenedHba: "7 exact rules", databases, empty, probes, localSocketProbe: "NOT_RUN_NO_SOCKET_ENDPOINT" }, null, 2));
    } finally { await client.close(); }
  } else {
    const client = await connect();
    let passes = 0;
    const pass = (name) => { passes += 1; console.log(`PASS: ${name}`); };
    async function migrate(relative) {
      await client.query("BEGIN");
      try { await client.query(readFileSync(path.join(workspace, relative), "utf8")); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    async function snapshotRows() {
      const rows = {};
      for (const table of baselineTables) rows[table] = (await client.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id), '[]'::jsonb) AS value FROM public.${table} t`)).rows[0].value;
      return rows;
    }
    async function snapshotSchema() {
      const rows = await client.query(`SELECT kind, name, definition FROM (
        SELECT 'column' AS kind, table_name || '.' || column_name AS name, concat_ws('|',data_type,udt_name,is_nullable,column_default,character_maximum_length) AS definition FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])
        UNION ALL SELECT 'constraint', conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid=ANY(SELECT ('public.' || unnest($1::text[]))::regclass)
        UNION ALL SELECT 'index', indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=ANY($1::text[])
        UNION ALL SELECT 'trigger', tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid=ANY(SELECT ('public.' || unnest($1::text[]))::regclass)
      ) s ORDER BY kind,name`, [baselineTables]);
      return rows.rows;
    }
    async function reject(sql, params, code, constraint) {
      await client.query("SAVEPOINT expected_rejection");
      let error;
      try { await client.query(sql, params); } catch (value) { error = value; }
      await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
      await client.query("RELEASE SAVEPOINT expected_rejection");
      assert(error, "Expected PostgreSQL rejection, but statement succeeded");
      assert.equal(error.code, code);
      if (constraint) assert.equal(error.constraint, constraint);
    }
    async function transaction(test) {
      await client.query("BEGIN");
      try { await test(); } finally { await client.query("ROLLBACK"); }
    }
    try {
      const existing = await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','S','v','m')");
      assert.equal(existing.rows[0].count, 0, "Execution requires a fresh empty disposable database.");
      await client.query(`COMMENT ON DATABASE "${manifest.database}" IS '${markerValue}'`);
      for (const entry of manifest.inputs.slice(0, 4)) await migrate(entry.path);
      // Synthetic test-only rows. Legacy attempts are inserted BEFORE 0004,
      // rather than disabling the current append-only/binding triggers.
      await client.query("INSERT INTO users(id,clerk_user_id,email,display_name) VALUES($1,'rehearsal-synthetic-user','rehearsal@example.invalid','Synthetic test user')", [id(1)]);
      await client.query("INSERT INTO topics(id,slug,name) VALUES($1,'rehearsal-synthetic-topic','Synthetic test topic')", [id(2)]);
      await client.query("INSERT INTO questions(id,topic_id,text,difficulty) VALUES($1,$3,'Synthetic legacy question','EASY'),($2,$3,'Synthetic taxonomy question','EASY')", [id(3), id(4), id(2)]);
      await client.query("INSERT INTO question_options(question_id,option_key,display_order,text,is_correct) VALUES($1,'A',0,'Synthetic A',false),($1,'B',1,'Synthetic B',true)", [id(3)]);
      await client.query("INSERT INTO practice_attempts(id,user_id,question_id,topic_id,selected_option_key,is_correct) VALUES($1,$2,$3,$4,'B',true)", [id(5), id(1), id(3), id(2)]);
      await migrate(manifest.inputs[4].path);
      await client.query(`WITH s AS (SELECT jsonb_build_object('questionCode',q.question_code,'topic',jsonb_build_object('id',t.id,'slug',t.slug,'name',t.name),'text',q.text,'type',q.type,'difficulty',q.difficulty,'explanation',q.explanation,'imageKey',q.image_key,'referenceNotes',q.reference_notes,'options',jsonb_build_array(jsonb_build_object('optionKey','A','text','Synthetic A','isCorrect',false),jsonb_build_object('optionKey','B','text','Synthetic B','isCorrect',true))) AS snapshot FROM questions q JOIN topics t ON t.id=q.topic_id WHERE q.id=$1)
        INSERT INTO question_revisions(id,question_id,snapshot,content_hash) SELECT $2,$1,snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') FROM s`, [id(3), id(6)]);
      await client.query("INSERT INTO practice_deliveries(id,user_id,session_id,question_id,revision_id) VALUES($1,$2,'synthetic-session',$3,$4)", [id(7), id(1), id(3), id(6)]);
      await client.query("INSERT INTO practice_attempts(id,user_id,question_id,topic_id,revision_id,delivery_id,selected_option_key,is_correct) VALUES($1,$2,$3,$4,$5,$6,'B',true)", [id(8), id(1), id(3), id(2), id(6), id(7)]);
      const beforeRows = await snapshotRows(), beforeSchema = await snapshotSchema();
      const beforeSequence = (await client.query("SELECT last_value,is_called FROM question_code_seq")).rows;
      await migrate(manifest.inputs[5].path);
      assert.deepEqual(await snapshotRows(), beforeRows);
      assert.deepEqual(await snapshotSchema(), beforeSchema);
      assert.deepEqual((await client.query("SELECT last_value,is_called FROM question_code_seq")).rows, beforeSequence);
      const legacy = (await client.query("SELECT revision_id,delivery_id FROM practice_attempts WHERE id=$1", [id(5)])).rows[0];
      assert.deepEqual(legacy, { revision_id: null, delivery_id: null });
      for (const table of ["exam_blueprints", "exam_domains", "exam_objectives", "question_objectives"]) assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
      pass("fresh SQL application; exact pre-existing row/schema preservation; legacy NULL bindings; no automatic classification");
      const primary = (await client.query("SELECT indisunique,indisvalid,pg_get_expr(indpred,indrelid) AS predicate,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid='question_objectives_primary_uq'::regclass")).rows[0];
      assert(primary.indisunique && primary.indisvalid);
      assert.equal(primary.predicate, "is_primary");
      assert(primary.definition.includes("(question_id, blueprint_id)"));
      assert((await client.query("SELECT convalidated FROM pg_constraint WHERE conrelid IN ('exam_domains'::regclass,'exam_objectives'::regclass,'question_objectives'::regclass)")).rows.every((row) => row.convalidated));
      pass("live validated constraints and exact partial primary index");
      await client.query("INSERT INTO exam_blueprints(id,exam_code,version,title) VALUES($1,'200-301','1.1','Synthetic v1.1'),($2,'200-301','future-test','Synthetic future version')", [id(101), id(102)]);
      await client.query("INSERT INTO exam_domains(id,blueprint_id,code,name,weight_percent,display_order) VALUES($1,$4,'1.0','Synthetic domain one',20,1),($2,$4,'2.0','Synthetic domain two',20,2),($3,$5,'1.0','Synthetic future domain',20,1)", [id(111), id(112), id(113), id(101), id(102)]);
      await client.query("INSERT INTO exam_objectives(id,domain_id,blueprint_id,domain_code,code,description,display_order) VALUES($1,$4,$7,'1.0','1.1','Synthetic objective one',1),($2,$5,$7,'2.0','2.1','Synthetic objective two',1),($3,$6,$8,'1.0','1.1','Synthetic future objective',1)", [id(121), id(122), id(123), id(111), id(112), id(113), id(101), id(102)]);
      await transaction(async () => {
        await client.query("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$5),($1,$3,$5),($1,$4,$6)", [id(4), id(121), id(122), id(123), id(101), id(102)]);
        assert.equal((await client.query("SELECT count(*)::int AS count FROM question_objectives WHERE question_id=$1", [id(4)])).rows[0].count, 3);
        await client.query("UPDATE question_objectives SET is_primary=true WHERE objective_id IN ($1,$2)", [id(121), id(123)]);
        await reject("UPDATE question_objectives SET is_primary=true WHERE objective_id=$1", [id(122)], "23505", "question_objectives_primary_uq");
        await client.query("INSERT INTO question_objectives(question_id,objective_id,blueprint_id,is_primary) VALUES($1,$2,$3,true)", [id(3), id(121), id(101)]);
        await reject("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$3)", [id(4), id(121), id(101)], "23505", "question_objectives_question_id_objective_id_pk");
      });
      pass("multiple objectives, cross-domain primary uniqueness, independent blueprint primaries");
      await transaction(async () => {
        await reject("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$3)", [id(4), id(121), id(102)], "23503", "question_objectives_objective_fk");
        await reject("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$3)", [id(999), id(121), id(101)], "23503", "question_objectives_question_id_questions_id_fk");
        await reject("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$3)", [id(4), id(999), id(101)], "23503", "question_objectives_objective_fk");
        await reject("INSERT INTO exam_objectives(domain_id,blueprint_id,domain_code,code,description,display_order) VALUES($1,$2,'1.0','1.2','Synthetic invalid binding',2)", [id(111), id(102)], "23503", "exam_objectives_domain_fk");
      });
      pass("missing references and cross-blueprint bindings rejected");
      await transaction(async () => {
        await client.query("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$3)", [id(4), id(121), id(101)]);
        await reject("DELETE FROM questions WHERE id=$1", [id(4)], "23001", "question_objectives_question_id_questions_id_fk");
        await reject("DELETE FROM exam_objectives WHERE id=$1", [id(121)], "23001", "question_objectives_objective_fk");
        await reject("DELETE FROM exam_domains WHERE id=$1", [id(111)], "23001", "exam_objectives_domain_fk");
        await reject("DELETE FROM exam_blueprints WHERE id=$1", [id(101)], "23001", "exam_domains_blueprint_id_exam_blueprints_id_fk");
      });
      pass("RESTRICT preserves mapped question, objective, domain and blueprint");
      await transaction(async () => {
        await reject("UPDATE question_revisions SET content_hash=content_hash WHERE id=$1", [id(6)], "23514");
        await reject("DELETE FROM practice_deliveries WHERE id=$1", [id(7)], "23514");
        await reject("UPDATE practice_attempts SET is_correct=false WHERE id=$1", [id(8)], "23514");
        await reject("INSERT INTO practice_attempts(user_id,question_id,topic_id,selected_option_key,is_correct) VALUES($1,$2,$3,'B',true)", [id(1), id(3), id(2)], "23514");
        await reject("UPDATE questions SET question_code='CCNA-Q-999999' WHERE id=$1", [id(3)], "23514");
      });
      pass("existing revision/delivery/attempt immutability, new-attempt binding and question-code rules retained");
      for (const commitFirst of [true, false]) {
        await client.query("DELETE FROM question_objectives WHERE question_id=$1", [id(4)]);
        await client.query("INSERT INTO question_objectives(question_id,objective_id,blueprint_id) VALUES($1,$2,$4),($1,$3,$4)", [id(4), id(121), id(122), id(101)]);
        await runPrimaryRace({ connect, observer: client, commitFirst, questionId: id(4), blueprintId: id(101), firstObjectiveId: id(121), secondObjectiveId: id(122) });
        pass(commitFirst ? "concurrent promotions: committed winner, rejected contender" : "concurrent promotions: rollback releases contender");
      }
      assert.deepEqual(await snapshotRows(), beforeRows);
      assert.deepEqual((await client.query("SELECT last_value,is_called FROM question_code_seq")).rows, beforeSequence);
      pass("all original fixture rows still unchanged after constraint/concurrency tests");
      console.log(`${passes} rehearsal checks passed. Disposable database retained for review; no cleanup performed.`);
    } finally { await client.close(); }
  }
}
