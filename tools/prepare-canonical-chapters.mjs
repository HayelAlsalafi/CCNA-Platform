// Canonical chapter preparation ONLY. Application transaction is READ ONLY.
// No cleanup/apply mode exists in this entry point.
import assert from "node:assert/strict";
import { metadataDiagnostic } from "./canonical-diagnostics.mjs";
import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { policy, validateInput, connection, assertIdentity, migrationManifest } from "./phase6a-local/policy.mjs";
import { canonicalExecutionState } from './canonical-execution-state.mjs';
import { canonicalSources } from "./canonical-chapters-policy.mjs";
import {verifyResetBackup} from './canonical-chapters-reset.mjs';
import {compareUsersToBackup,readArchivedUsers} from './canonical-user-drift.mjs';
import {
  questionBankPlan,
  assertBankState,
  snapshotForCount,
  rowProof,
} from "./question-bank-upgrade-core.mjs";
import { restoreBackupProof } from "./question-bank-restore.mjs";
import { sterileEnvironment, protectOperatorFolder } from "./question-bank-disposable-access.mjs";
const root = realpathSync(process.cwd()),
  mode = process.argv[2],
  env = sterileEnvironment(),
  bin = "C:/Program Files/PostgreSQL/18/bin/";
let stage = "source-check",
  client,
  committed = false,
  commitAttempted = false,
  reportPath,
  result = {};
function record(value) {
  result = { ...result, ...value, stage, committed };
  if (reportPath) writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n");
}
async function sequence() {
  return (await client.query("SELECT last_value::text,is_called FROM public.question_code_seq"))
    .rows;
}
async function identity(config) {
  const r = (await client.query("SELECT local_runtime_guard.identity() AS identity")).rows[0]
    ?.identity;
  assertIdentity(r, config);
  assert.equal(r.versionNumber, 180006, "Expected PostgreSQL 18.6");
  return r;
}
async function roleChecks() {
  const rows = (
    await client.query(
      `SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
      [[policy.appRole, policy.migrationRole]],
    )
  ).rows;
  assert.equal(rows.length, 2, "Both reviewed roles are required");
  for (const { rolname, rolcanlogin, ...flags } of rows) {
    assert.equal(rolcanlogin, true);
    assert(
      Object.values(flags).every((v) => v === false),
      "Unexpected role attributes: " + rolname,
    );
  }
  assert.equal(
    (
      await client.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0]?.owner,
    policy.migrationRole,
  );
}
async function main() {
  assert.equal(root.replaceAll("\\", "/").toLowerCase(), policy.root.toLowerCase());
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
    "main",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    "3c07b4bb7fe807e60dcbcd5539c046b919a9956f",
  );
  assert(
    process.argv.length === 3 && ["--plan", "--prepare", "--diagnose", "--compare-users"].includes(mode),
    "Use --plan or --prepare; this entry point cannot apply changes",
  );
  const promotedStatus = mode === '--diagnose' && migrationManifest(root).length === 12;
  const plan = promotedStatus ? null : questionBankPlan(root);
  if (mode === "--plan") {
    const { plan: reset, catalog } = canonicalSources(root);
    console.log(
      JSON.stringify(
        {
          target:plan.target,
          baselineMigrations:plan.manifest.length,
          proposedMigration:"0011_canonical_book_chapters",
          clear:Object.fromEntries(reset.clearTables.map(t=>[t,reset.rowProof[t].count])),
          preserve:Object.fromEntries(reset.preservedTables.map(t=>[t,reset.rowProof[t].count])),
          initialize:{chapters:catalog.chapters.length,topics:48,questions:0,domains:6},
          backup:reset.backup,
          restoration:reset.restoration,
          databaseOperations:0,
          liveExecution:false,
          finalExecutionApprovalRequired:true,
        },
        null,
        2,
      ),
    );
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert(size <= 16384);
    chunks.push(chunk);
  }
  const config = validateInput(
    "upgrade-verify",
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  stage = "installed-service-identity";
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-File", "tools/phase6a-local/verify-service.ps1"],
    { env, stdio: "pipe", timeout: 15000, windowsHide: true },
  );
  for (const tool of ["pg_dump", "pg_restore"])
    assert.match(
      execFileSync(bin + tool + ".exe", ["--version"], {
        env,
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true,
      }),
      /18\.6/,
    );
  const require = createRequire(path.join(root, "lib/db/package.json")),
    { Client } = require("pg");
  client = new Client({
    ...connection(config),
    application_name: "ccna-question-bank-guarded-upgrade",
  });
  client.on("error", () => {});
  stage = "postgres-connect";
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query(
    "SET LOCAL TimeZone='UTC'; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='300s'",
  );
  stage = "identity-and-role-checks";
  const server = await identity(config);
  await roleChecks();
  stage = "ledger-schema-function-privilege-preflight";
  if(promotedStatus) {
    stage='select-only-canonical-execution-state';
    const status=await canonicalExecutionState(client,root);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({stage:'complete',databaseWrites:0,backupCreated:false,cleanupExecuted:false,identity:server,...status}));
    return;
  }
  let before = await assertBankState(client, root, plan);
  if(mode==='--compare-users') {
    stage='select-only-user-drift-comparison';
    const {plan:reviewed}=canonicalSources(root);
    verifyResetBackup(root,reviewed);
    assert.equal(before.count,11);assert.deepEqual(before.ledger,reviewed.baselineLedger);
    const rows=await rowProof(client,before.tables);
    const changedTables=before.tables.filter(t=>JSON.stringify(rows[t])!==JSON.stringify(reviewed.rowProof[t]));
    const archivedUsers=readArchivedUsers(reviewed.backup.path,env);
    const comparison=await compareUsersToBackup(client,archivedUsers,reviewed.rowProof.users);
    const codeSequenceUnchanged=JSON.stringify(await sequence())===JSON.stringify(reviewed.questionCodeSequence);
    const chapterTableAbsent=(await client.query("SELECT to_regclass('public.curriculum_chapters') AS relation")).rows[0].relation===null;
    await client.query('ROLLBACK');
    console.log(JSON.stringify({stage:'complete',databaseWrites:0,cleanupExecuted:false,migrationPromoted:false,identity:server,ledgerEntries:before.count,chapterTableAbsent,codeSequenceUnchanged,changedTables,users:{expected:reviewed.rowProof.users,current:rows.users,...comparison},allOtherTablesUnchanged:changedTables.every(t=>t==='users'),resetRetryAuthorizedByDiagnostic:false}));
    return;
  }
  if (mode === "--diagnose") {
    await client.query("ROLLBACK");
    console.log(
      JSON.stringify({
        stage: "complete",
        databaseWrites: 0,
        backupCreated: false,
        ledgerEntries: before.count,
        identity: server,
      }),
    );
    return;
  }
  assert.equal(before.count, 11, "Canonical reset requires exactly the reviewed eleven migrations");
  const catalog = {
    blueprints: (
      await client.query(
        "SELECT id,exam_code,version,title,status FROM public.exam_blueprints ORDER BY id",
      )
    ).rows,
    domains: (
      await client.query(
        "SELECT id,blueprint_id,code,name,weight_percent FROM public.exam_domains ORDER BY code,id",
      )
    ).rows,
    objectives: (
      await client.query(
        "SELECT id,blueprint_id,code,description FROM public.exam_objectives ORDER BY code,id",
      )
    ).rows,
  };
  const clearTables = [
    "learning_session_items",
    "learner_achievements",
    "practice_attempts",
    "practice_deliveries",
    "question_objectives",
    "question_options",
    "question_revisions",
    "learning_sessions",
    "question_deletion_audits",
    "questions",
    "exam_objectives",
    "topics",
  ];
  const preservedTables = ["users", "achievement_definitions", "exam_blueprints", "exam_domains"];
  assert.deepEqual(
    [...clearTables, ...preservedTables].sort(),
    [...before.tables].sort(),
    "Unexpected application table inventory",
  );
  const scope = {
    clearTables,
    preservedTables,
    catalog,
    applicationWrites: 0,
    executionApproved: false,
  };
  const snapshot = snapshotForCount(root, before.count),
    rows = await rowProof(client, before.tables),
    codeSequence = await sequence();
  const folder = path.join(
    root,
    ".local/question-bank-upgrade",
    new Date().toISOString().replaceAll(":", "-"),
  );
  mkdirSync(folder, { recursive: true });
  protectOperatorFolder(folder, env);
  reportPath = path.join(folder, "report.json");
  record({
    identity: server,
    baselineLedger: before.ledger,
    baselineCount: before.count,
    ...scope,
    rowProof: rows,
  });
  stage = "full-backup";
  const dump = path.join(folder, "before-upgrade.dump"),
    snapshotId = (await client.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
  assert(/^[0-9A-F-]+$/.test(snapshotId));
  execFileSync(
    bin + "pg_dump.exe",
    [
      "--host=127.0.0.1",
      "--port=5432",
      "--username=" + policy.migrationRole,
      "--dbname=" + policy.database,
      "--no-password",
      "--format=custom",
      "--snapshot=" + snapshotId,
      "--file=" + dump,
    ],
    {
      env: {
        ...env,
        PGPASSWORD: config.password,
        PGCONNECT_TIMEOUT: "5",
        PGOPTIONS: "-c statement_timeout=120000 -c lock_timeout=5000",
      },
      stdio: "pipe",
      windowsHide: true,
      timeout: 150000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert(statSync(dump).size > 0);
  const sha256 = createHash("sha256").update(readFileSync(dump)).digest("hex");
  const toc = execFileSync(bin + "pg_restore.exe", ["--list", dump], {
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert(
    toc.includes("TABLE DATA public questions") &&
      toc.includes("TABLE DATA drizzle __drizzle_migrations"),
    "Incomplete backup inventory",
  );
  execFileSync(bin + "pg_restore.exe", ["--file=NUL", dump], {
    env,
    stdio: "pipe",
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  const proofFile = path.join(folder, "restore-proof.json");
  writeFileSync(
    proofFile,
    JSON.stringify({ sha256, baselineCount: before.count, tables: rows }, null, 2) + "\n",
  );
  record({
    backup: {
      path: dump,
      sha256,
      bytes: statSync(dump).size,
      tocVerified: true,
      fullArchiveDecodeVerified: true,
    },
  });
  stage = "isolated-restoration-proof";
  const restoration = await restoreBackupProof(root, dump, proofFile);
  record({ restoration });
  assert.deepEqual(await rowProof(client, before.tables), rows);
  assert.deepEqual(await sequence(), codeSequence);
  await identity(config);
  await client.query("ROLLBACK");
  stage = "complete";
  record({
    ...scope,
    rowProof: rows,
    questionCodeSequence: codeSequence,
    databaseWrites: 0,
    note: "Preparation only. Review counts, taxonomy scope and verified backup; final execution approval is still required.",
  });
  console.log(JSON.stringify({ ...result, report: reportPath }));
}
try {
  await main();
} catch (error) {
  if (client && !committed) await client.query("ROLLBACK").catch(() => {});
  record({
    failure: {
      stage,
      invariant: metadataDiagnostic(error),
      sqlState: /^[A-Z0-9]{5}$/.test(error?.code) ? error.code : undefined,
      message: "Guarded operation stopped; credentials and raw driver output withheld.",
    },
    commitOutcome: committed
      ? "COMMITTED"
      : commitAttempted
        ? "UNKNOWN_VERIFY_DO_NOT_RETRY"
        : "NOT_COMMITTED",
  });
  console.log(JSON.stringify({ ...result, report: reportPath }));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
