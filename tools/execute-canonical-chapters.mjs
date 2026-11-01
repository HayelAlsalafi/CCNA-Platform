// Separate final-approval entry point. Never invoked by preparation or the UI.
import assert from "node:assert/strict";
import { realpathSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import {
  policy,
  validateInput,
  connection,
  assertIdentity,
  migrationManifest,
} from "./phase6a-local/policy.mjs";
import { questionBankPlan, assertBankState, rowProof } from "./question-bank-upgrade-core.mjs";
import { canonicalSources, assertCanonicalPrivileges } from "./canonical-chapters-policy.mjs";
import {
  assertResetScope,
  verifyResetBackup,
  resetCanonicalTransaction,
  promoteCanonicalMigration,
} from "./canonical-chapters-reset.mjs";
import { sterileEnvironment } from "./question-bank-disposable-access.mjs";
import { verifyUpgradeState, upgradeSnapshots } from "./phase6a-local/upgrade.mjs";
import { metadataDiagnostic } from "./canonical-diagnostics.mjs";
const root = realpathSync(process.cwd());
let stage = "explicit-execution-gates",
  client,
  committed = false,
  commitAttempted = false,
  reportPath,
  originalJournal,
  promotedJournal;
try {
  assert.deepEqual(
    process.argv.slice(2),
    ["--apply", "--confirm-reviewed-development-reset"],
    "Final reviewed development-reset approval flag required",
  );
  assert.equal(root.replaceAll("\\", "/").toLowerCase(), policy.root.toLowerCase());
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
    "main",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    "3c07b4bb7fe807e60dcbcd5539c046b919a9956f",
  );
  const { plan, catalog } = canonicalSources(root);
  assertResetScope(plan, catalog);
  verifyResetBackup(root, plan);
  const originalPlan = questionBankPlan(root);
  assert.equal(originalPlan.sourceCount, 11, "Refuse repeat execution");
  stage = "credential-input";
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert(size <= 16384);
    chunks.push(chunk);
  }
  const config = validateInput(
    "upgrade-verify",
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  stage = "installed-service";
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-File", "tools/phase6a-local/verify-service.ps1"],
    { env: sterileEnvironment(), stdio: "pipe", timeout: 15000, windowsHide: true },
  );
  const req = createRequire(path.join(root, "lib/db/package.json")),
    { Client } = req("pg");
  client = new Client({
    ...connection(config),
    application_name: "ccna-canonical-chapters-approved-reset",
  });
  client.on("error", () => {});
  stage = "postgres-connect";
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    "SET LOCAL TimeZone='UTC';SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';SET LOCAL idle_in_transaction_session_timeout='120s'",
  );
  stage = "exact-local-development-identity";
  const identity = (await client.query("SELECT local_runtime_guard.identity() AS identity")).rows[0]
    ?.identity;
  assertIdentity(identity, config);
  assert.equal(identity.versionNumber, 180006);
  assert.deepEqual(identity, plan.identity, "Approved target identity drift");
  const roles = (
    await client.query(
      `SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS membership FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
      [[policy.appRole, policy.migrationRole]],
    )
  ).rows;
  assert.equal(roles.length, 2);
  for (const { rolname, rolcanlogin, ...flags } of roles) {
    assert.equal(rolcanlogin, true);
    assert(
      Object.values(flags).every((v) => v === false),
      "Unexpected privileged role " + rolname,
    );
  }
  assert.equal(
    (
      await client.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()",
      )
    ).rows[0].n,
    0,
    "Stop the API and other application-database clients before the maintenance reset",
  );
  stage = "reviewed-ledger-schema-and-privileges";
  const before = await assertBankState(client, root, originalPlan);
  assert.equal(before.count, 11);
  assert.deepEqual(before.ledger, plan.baselineLedger);
  assert.equal(
    (await client.query("SELECT pg_try_advisory_xact_lock(20261017,48) AS locked")).rows[0].locked,
    true,
  );
  stage = "approved-development-reset-transaction";
  const result = await resetCanonicalTransaction(client, root, {
    owner: policy.migrationRole,
    grantRuntime: true,
  });
  await assertCanonicalPrivileges(client);
  stage = "migration-source-promotion";
  originalJournal = readFileSync(path.join(root, "lib/db/drizzle/meta/_journal.json"));
  promoteCanonicalMigration(root);
  promotedJournal = readFileSync(path.join(root, "lib/db/drizzle/meta/_journal.json"));
  stage = "full-runtime-ledger-and-schema-verification";
  await verifyUpgradeState(client, migrationManifest(root), upgradeSnapshots(root), "after", false);
  verifyResetBackup(root, plan);
  stage = "commit";
  commitAttempted = true;
  await client.query("COMMIT");
  committed = true;
  stage = "post-commit-select-only";
  await client.query("BEGIN READ ONLY");
  assert.deepEqual(
    (await client.query("SELECT local_runtime_guard.identity() AS identity")).rows[0].identity,
    identity,
  );
  await verifyUpgradeState(client, migrationManifest(root), upgradeSnapshots(root), "after", false);
  const counts = await rowProof(client, [
    ...plan.clearTables,
    "curriculum_chapters",
    ...plan.preservedTables,
  ]);
  for (const t of plan.clearTables) assert.equal(counts[t].count, t === "topics" ? 48 : 0);
  assert.equal(counts.curriculum_chapters.count, 48);
  for (const t of plan.preservedTables) assert.deepEqual(counts[t], plan.rowProof[t]);
  await client.query("ROLLBACK");
  stage = "complete";
  reportPath = path.join(path.dirname(plan.backup.path), "canonical-reset-result.json");
  const output = { stage, committed, identity, backup: plan.backup, ...result, report: reportPath };
  writeFileSync(reportPath, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output));
} catch (error) {
  if (client && !committed) await client.query("ROLLBACK").catch(() => {});
  // Undo only this command's own journal write after a definite pre-commit
  // rollback. Never touch concurrent work or guess after an uncertain COMMIT.
  if (
    !commitAttempted &&
    originalJournal &&
    promotedJournal &&
    readFileSync(path.join(root, "lib/db/drizzle/meta/_journal.json")).equals(promotedJournal)
  )
    writeFileSync(path.join(root, "lib/db/drizzle/meta/_journal.json"), originalJournal);
  const output = {
    stage,
    committed,
    commitOutcome: committed
      ? "COMMITTED"
      : commitAttempted
        ? "UNKNOWN_VERIFY_DO_NOT_RETRY"
        : "NOT_COMMITTED",
    failure: {
      sqlState: /^[A-Z0-9]{5}$/.test(error?.code) ? error.code : undefined,
      invariant: metadataDiagnostic(error),
      message: "Stopped; credentials and raw driver output withheld. Do not retry automatically.",
    },
  };
  console.log(JSON.stringify(output));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
