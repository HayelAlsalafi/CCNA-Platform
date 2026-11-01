// Operator-only live upgrade. Never runs on import; requires --apply plus
// separately approved source promotion and a hidden stdin-only credential.
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  policy,
  validateInput,
  connection,
  assertIdentity,
  migrationManifest,
  assertLedger,
  cleanEnvironment,
} from "./phase6a-local/policy.mjs";
import {
  verifyUpgradeState,
  upgradeSnapshots,
  legacyTables,
  taxonomyTables,
  migratorClient,
  readSchemaCatalog,
  assertSchemaCatalog,
} from "./phase6a-local/upgrade.mjs";
import { assertControlledDeleteState } from "./phase8a-cleanup/controlled-delete.mjs";
import {
  assertNexusSource,
  nexusSnapshot,
  assertNexusFunction,
  assertNexusPrivileges,
} from "./nexus-policy.mjs";
const root = realpathSync(process.cwd()),
  require = createRequire(path.join(root, "lib/db/package.json"));
let stage = "source-check",
  client,
  committed = false;
async function fingerprints() {
  const result = {};
  for (const table of [...legacyTables, ...taxonomyTables]) {
    const hash = createHash("sha256");
    let count = 0;
    await client.query(
      'DECLARE nexus_preserve NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS row FROM public."' +
        table +
        '" t ORDER BY ' +
        (table === "question_objectives" ? "question_id,objective_id" : "id"),
    );
    try {
      while (true) {
        const rows = (await client.query("FETCH FORWARD 1000 FROM nexus_preserve")).rows;
        if (!rows.length) break;
        for (const r of rows) {
          hash.update(r.row + "\n");
          count++;
        }
      }
    } finally {
      await client.query("CLOSE nexus_preserve");
    }
    result[table] = { count, hash: hash.digest("hex") };
  }
  result.sequence = (
    await client.query("SELECT last_value::text,is_called FROM public.question_code_seq")
  ).rows;
  return result;
}
async function main() {
  assert.equal(root.replaceAll("\\", "/").toLowerCase(), policy.root.toLowerCase());
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
    "main",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    "03b14526aae448e49eacd602a43bfb0e355aca4d",
  );
  assert.equal(process.argv.length, 3);
  assert.equal(process.argv[2], "--apply");
  assertNexusSource(root);
  const manifest = migrationManifest(root);
  assert.equal(manifest.length, 8, "Explicit approved source promotion is required first");
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert(size <= 16384, "Input too large");
    chunks.push(chunk);
  }
  const config = validateInput(
    "upgrade-verify",
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
  assert.equal(config.systemIdentifier, policy.upgradeSystemIdentifier);
  stage = "service-identity";
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-File", "tools/phase6a-local/verify-service.ps1"],
    {
      env: cleanEnvironment(process.env, "check", {}),
      windowsHide: true,
      stdio: "pipe",
      timeout: 15000,
    },
  );
  const { Client } = require("pg");
  client = new Client(connection(config));
  client.on("error", () => {});
  stage = "connect";
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='60s'; SET LOCAL TIME ZONE 'UTC'",
  );
  stage = "identity";
  assertIdentity(
    (await client.query("SELECT local_runtime_guard.identity() AS identity")).rows[0]?.identity,
    config,
  );
  const attrs = (
    await client.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS membership FROM pg_roles r WHERE rolname=session_user",
    )
  ).rows[0];
  assert(attrs && Object.values(attrs).every((v) => v === false), "Unexpected migrator privileges");
  assert.equal(
    (await client.query("SELECT pg_try_advisory_xact_lock(20261014,7007) AS locked")).rows[0]
      .locked,
    true,
  );
  await client.query(
    "LOCK TABLE " +
      [...legacyTables, ...taxonomyTables]
        .map((t) => 'public."' + t + '"')
        .concat("drizzle.__drizzle_migrations")
        .join(",") +
      " IN SHARE MODE",
  );
  await assertControlledDeleteState(client, false);
  stage = "seven-entry-baseline";
  const beforeLedger = (
    await client.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
    )
  ).rows;
  assertLedger(beforeLedger, manifest.slice(0, 7));
  // Sequence gaps from rolled-back inserts are legitimate. Hashes/timestamps
  // must still match every reviewed entry in order, with unique positive IDs.
  assert.equal(new Set(beforeLedger.map(r=>String(r.id))).size,7);
  assert(beforeLedger.every(r=>Number.isSafeInteger(r.id)&&r.id>0));
  const old = JSON.parse(readFileSync("lib/db/drizzle/meta/0005_snapshot.json", "utf8"));
  await verifyUpgradeState(client, manifest.slice(0, 7), [old, old], "after", false);
  const before = await fingerprints();
  const oldFunctions = (
    await client.query(
      "SELECT p.oid,pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p') ORDER BY p.oid",
    )
  ).rows;
  stage = "official-drizzle-migrator";
  const { drizzle } = require("drizzle-orm/node-postgres"),
    { migrate } = require("drizzle-orm/node-postgres/migrator");
  await migrate(drizzle(migratorClient(client)), {
    migrationsFolder: path.join(root, "lib/db/drizzle"),
  });
  stage = "post-migration-schema";
  await verifyUpgradeState(client, manifest, upgradeSnapshots(root), "after", false);
  await assertNexusFunction(client, root, policy.migrationRole);
  for (const table of ["learning_sessions", "learning_session_items"])
    assert.equal(
      (await client.query('SELECT count(*)::int AS n FROM public."' + table + '"')).rows[0].n,
      0,
    );
  stage = "least-privilege-grants";
  await client.query(
    "GRANT SELECT, INSERT ON public.learning_sessions, public.learning_session_items TO ccna_phase6a_app",
  );
  await client.query(
    "GRANT UPDATE(status,completed_at) ON public.learning_sessions TO ccna_phase6a_app",
  );
  await client.query(
    "GRANT UPDATE(selected_option_key,flagged) ON public.learning_session_items TO ccna_phase6a_app",
  );
  await assertNexusPrivileges(client);
  stage = "data-preservation";
  assert.deepEqual(await fingerprints(), before);
  const afterLedger = (
    await client.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
    )
  ).rows;
  assert.deepEqual(afterLedger.slice(0, 7), beforeLedger);
  assertLedger(afterLedger, manifest);
  const afterFunctions = (
    await client.query(
      "SELECT p.oid,pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p') AND p.proname<>'nexus_guard_deferred_attempt' ORDER BY p.oid",
    )
  ).rows;
  assert.deepEqual(afterFunctions, oldFunctions);
  await client.query("COMMIT");
  committed = true;
  console.log(
    JSON.stringify({
      committed: true,
      stage: "complete",
      ledgerEntries: 8,
      preserved: before,
      sessionTablesEmpty: true,
      runtimePrivileges: "SELECT/INSERT on two new tables; UPDATE only four mutable columns",
      applicationDataWrites: 0,
    }),
  );
}
try {
  await main();
} catch (e) {
  if (client && !committed) await client.query("ROLLBACK").catch(() => {});
  console.log(
    JSON.stringify({
      committed,
      stage,
      failure: "Guarded Nexus upgrade stopped; raw driver output and credentials withheld.",
      sqlState: /^[A-Z0-9]{5}$/.test(e?.code) ? e.code : undefined,
    }),
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
