// Fresh full archive only. Application transaction is READ ONLY; no apply mode.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { readinessPlan, inspectReadiness } from "./readiness.mjs";
import { validateInput, connection } from "../phase6a-local/policy.mjs";
import { sterileEnvironment, protectOperatorFolder } from "../question-bank-disposable-access.mjs";
import { rowProof } from "../question-bank-upgrade-core.mjs";
let client,
  reportPath,
  stage = "offline-preflight";
const root = realpathSync(process.cwd()),
  env = sterileEnvironment(),
  bin = "C:/Program Files/PostgreSQL/18/bin/";
try {
  assert.equal(process.argv.length, 3);
  assert.equal(process.argv[2], "--backup");
  assert.equal(
    execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(),
    "main",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    "3c07b4bb7fe807e60dcbcd5539c046b919a9956f",
  );
  const plan = readinessPlan(root),
    chunks = [];
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
  stage = "postgres-connect";
  const require = createRequire(path.join(root, "lib/db/package.json"));
  client = new (require("pg").Client)({
    ...connection(config),
    application_name: "ccna-study-backup-read-only",
  });
  client.on("error", () => {});
  await client.connect();
  const result = await inspectReadiness(client, config, plan, root, async (readiness, ledger) => {
    await client.query(
      "SET LOCAL idle_in_transaction_session_timeout='5min'; SET LOCAL statement_timeout='30s'",
    );
    const folder = path.join(
      root,
      ".local/question-bank-upgrade",
      "study-" + new Date().toISOString().replaceAll(":", "-") + "-" + randomUUID(),
    );
    mkdirSync(folder);
    protectOperatorFolder(folder, env);
    reportPath = path.join(folder, "study-backup.json");
    const snapshot = JSON.parse(
      readFileSync(path.join(root, "lib/db/drizzle/meta/0013_snapshot.json"), "utf8"),
    );
    const tables = Object.values(snapshot.tables)
      .map((t) => t.name)
      .sort();
    stage = "snapshot-and-fingerprints";
    const proof = await rowProof(client, tables),
      sequences = {};
    for (const [schema, name] of [
      ["public", "question_code_seq"],
      ["drizzle", "__drizzle_migrations_id_seq"],
    ])
      sequences[schema + "." + name] = (
        await client.query(`SELECT last_value::text,is_called FROM ${schema}."${name}"`)
      ).rows[0];
    const snapshotId = (await client.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
    assert.match(snapshotId, /^[0-9A-F-]+$/);
    const archive = path.join(folder, "before-upgrade.dump");
    stage = "full-consistent-backup";
    execFileSync(
      bin + "pg_dump.exe",
      [
        "--host=127.0.0.1",
        "--port=5432",
        "--username=ccna_phase6a_migrator",
        "--dbname=ccna_phase6a_dev",
        "--no-password",
        "--format=custom",
        "--snapshot=" + snapshotId,
        "--file=" + archive,
      ],
      {
        env: {
          ...env,
          PGPASSWORD: config.password,
          PGCONNECT_TIMEOUT: "5",
          PGOPTIONS: "-c statement_timeout=120000 -c lock_timeout=5000",
        },
        stdio: "pipe",
        timeout: 150000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );
    stage = "offline-archive-verification";
    const bytes = statSync(archive).size;
    assert(bytes > 0);
    const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
    const toc = execFileSync(bin + "pg_restore.exe", ["--list", archive], {
      env,
      encoding: "utf8",
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    for (const table of tables)
      assert(toc.includes("TABLE DATA public " + table + " "), "Missing backup table");
    assert(toc.includes("TABLE DATA drizzle __drizzle_migrations "));
    execFileSync(bin + "pg_restore.exe", ["--file=NUL", archive], {
      env,
      stdio: "pipe",
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    for (const [qualified, before] of Object.entries(sequences)) {
      const [schema, name] = qualified.split(".");
      assert.deepEqual(
        (await client.query(`SELECT last_value::text,is_called FROM ${schema}."${name}"`)).rows[0],
        before,
        "A sequence changed during backup; stop for a new consistent capture",
      );
    }
    const report = {
      ...readiness,
      stage: "backup-complete",
      createdAt: new Date().toISOString(),
      proposal: plan.proposal,
      baselineLedger: ledger,
      rowProof: proof,
      sequences,
      backup: {
        path: archive,
        bytes,
        sha256,
        tocVerified: true,
        fullArchiveDecodeVerified: true,
        snapshotConsistent: true,
      },
      restorationVerified: false,
      rehearsalVerified: false,
      recommendation: "NO-GO",
      report: reportPath,
    };
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    return report;
  });
  console.log(JSON.stringify(result));
} catch (error) {
  const code = error?.code ?? error?.cause?.code;
  console.log(
    JSON.stringify({
      stage,
      databaseWrites: 0,
      recommendation: "NO-GO",
      report: reportPath ?? null,
      failure: {
        sqlState: typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? code : null,
        message:
          "Backup stopped; archive/logs preserved; credentials and raw output withheld. Do not retry automatically.",
      },
    }),
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
