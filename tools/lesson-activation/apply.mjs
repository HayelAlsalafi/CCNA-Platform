// FUTURE operator entry point. Do not invoke before exact application approval.
import assert from "node:assert/strict";
import { realpathSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import {
  assertExecutionIntent,
  verifyRehearsal,
  promotionFiles,
  promoteSource,
} from "./activation.mjs";
import { preparedPlan, verifyFreshBackup, stageMigrations } from "./staging.mjs";
import { inspectReadiness } from "./readiness.mjs";
import {
  connection,
  validateInput,
  assertLedger,
  assertIdentity,
} from "../phase6a-local/policy.mjs";
import { sterileEnvironment, protectOperatorFolder } from "../question-bank-disposable-access.mjs";
import { rowProof } from "../question-bank-upgrade-core.mjs";
import { readSchemaCatalog, assertSchemaCatalog } from "../phase6a-local/upgrade.mjs";
import { lessonSnapshot, assertLessonPrivileges, assertLessonRevisionGuard } from "./policy.mjs";
import { transactionClient } from "./transaction-client.mjs";
let client,
  stage = "explicit-approval-gates",
  reportPath,
  commitOutcome = "NOT_COMMITTED",
  sourcePromoted = false,
  sourcePromotionAttempted = false;
try {
  assertExecutionIntent(process.argv.slice(2));
  const root = realpathSync(process.cwd()),
    env = sterileEnvironment();
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
    "main",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    "3c07b4bb7fe807e60dcbcd5539c046b919a9956f",
  );
  const plan = preparedPlan(root),
    fresh = verifyFreshBackup(root),
    promotion = promotionFiles(root);
  verifyRehearsal(fresh.folder);
  stage = "installed-postgresql-service-identity";
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-File", path.join(root, "tools/phase6a-local/verify-service.ps1")],
    { env, stdio: "pipe", timeout: 30000, windowsHide: true },
  );
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
  const require = createRequire(path.join(root, "lib/db/package.json"));
  const { drizzle } = require("drizzle-orm/node-postgres"),
    { migrate } = require("drizzle-orm/node-postgres/migrator");
  client = new (require("pg").Client)({
    ...connection(config),
    application_name: "ccna-approved-lesson-activation",
  });
  client.on("error", () => {});
  stage = "identity-ledger-schema-preflight";
  await client.connect();
  await inspectReadiness(client, config, { ...plan, manifest: plan.manifest.slice(0, 12) }, root);
  const run = path.join(fresh.folder, "activation-" + randomUUID());
  mkdirSync(run);
  protectOperatorFolder(run, env);
  reportPath = path.join(run, "activation.json");
  stageMigrations(root, path.join(run, "migrations"));
  stage = "locked-backup-state-verification";
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  await client.query(
    "SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'",
  );
  await client.query("SELECT pg_advisory_xact_lock(7130013)");
  const tables = Object.keys(fresh.report.rowProof).sort();
  assert(tables.every((t) => /^[a-z_]+$/.test(t)));
  await client.query(
    "LOCK TABLE " +
      tables.map((t) => 'public."' + t + '"').join(",") +
      ", drizzle.__drizzle_migrations IN SHARE MODE",
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
      )
    ).rows[0].n,
    0,
    "Stop API/frontend and other database clients before activation",
  );
  assertIdentity(
    (await client.query("SELECT local_runtime_guard.identity() AS identity")).rows[0].identity,
    config,
  );
  assertSchemaCatalog(
    await readSchemaCatalog(client),
    JSON.parse(readFileSync(path.join(root, "lib/db/drizzle/meta/0011_snapshot.json"), "utf8")),
  );
  const ledger = (
    await client.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
    )
  ).rows;
  assert.deepEqual(ledger, fresh.report.baselineLedger);
  assertLedger(ledger, plan.manifest.slice(0, 12));
  assert.deepEqual(
    await rowProof(client, tables),
    fresh.report.rowProof,
    "Application data changed since backup; prepare and rehearse a new backup",
  );
  for (const [qualified, expected] of Object.entries(fresh.report.sequences))
    assert.deepEqual(
      (await client.query(`SELECT last_value::text,is_called FROM ${qualified}`)).rows[0],
      expected,
    );
  stage = "lesson-only-official-drizzle-migration";
  await migrate(drizzle(transactionClient(client)), {
    migrationsFolder: path.join(run, "migrations"),
  });
  stage = "exact-lesson-runtime-grants";
  await client.query(
    "GRANT SELECT,INSERT,UPDATE ON public.lessons TO ccna_phase6a_app; GRANT SELECT,INSERT ON public.lesson_revisions TO ccna_phase6a_app",
  );
  stage = "post-migration-preservation-verification";
  const next = (
    await client.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
    )
  ).rows;
  assertLedger(next, plan.manifest);
  assert.deepEqual(
    next.map((r) => r.id),
    Array.from({ length: 13 }, (_, i) => i + 1),
  );
  assertSchemaCatalog(await readSchemaCatalog(client), lessonSnapshot(root));
  await assertLessonPrivileges(client);
  await assertLessonRevisionGuard(client, root);
  assert.deepEqual(await rowProof(client, tables), fresh.report.rowProof);
  assert.deepEqual(
    (await client.query("SELECT last_value::text,is_called FROM public.question_code_seq")).rows[0],
    fresh.report.sequences["public.question_code_seq"],
  );
  stage = "guarded-source-promotion";
  preparedPlan(root);
  sourcePromotionAttempted = true;
  promoteSource(root, promotion);
  sourcePromoted = true;
  writeFileSync(
    reportPath,
    JSON.stringify({
      stage: "verified-before-commit",
      committed: false,
      sourcePromoted,
      backupHash: fresh.report.backup.sha256,
    }) + "\n",
    { flag: "wx" },
  );
  stage = "commit";
  commitOutcome = "UNKNOWN";
  await client.query("COMMIT");
  commitOutcome = "COMMITTED";
  const result = {
    stage: "complete",
    committed: true,
    commitOutcome,
    sourcePromoted,
    ledgerEntries: 13,
    existingRowsPreserved: true,
    questionCodeSequencePreserved: true,
    lessonsActivated: true,
    report: reportPath,
  };
  writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} catch (error) {
  if (client && commitOutcome !== "COMMITTED") await client.query("ROLLBACK").catch(() => {});
  const code = error?.code ?? error?.cause?.code;
  const result = {
    stage,
    committed: commitOutcome === "COMMITTED",
    commitOutcome,
    sourcePromoted,
    sourcePromotionAttempted,
    report: reportPath ?? null,
    failure: {
      sqlState: typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : null,
      message:
        "Stopped; credentials, row data and raw driver output withheld. Preserve receipts and do not retry automatically.",
    },
  };
  if (reportPath)
    try {
      writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n");
    } catch {}
  console.log(JSON.stringify(result));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
