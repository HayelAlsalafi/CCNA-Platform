// SELECT-only diagnosis of the single stopped rehearsal. No migrator/fixture import.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  withPrivateTarget,
  privateConnection,
  isolated,
  assertPrivateIdentity,
  backupRelative,
} from "./isolated-policy.mjs";
import { rowProof } from "../question-bank-upgrade-core.mjs";
import { readSchemaCatalog, assertSchemaCatalog } from "../phase6a-local/upgrade.mjs";
import { assertStudyProposal } from "./proposal.mjs";
import { assertStudyRuntimeCatalog } from "./proposed-runtime-guard.mjs";
const root = process.cwd(),
  req = createRequire(path.join(root, "lib/db/package.json")),
  { Client } = req("pg");
const receipt = JSON.parse(readFileSync(path.join(root, backupRelative), "utf8"));
const folder = path.join(
  root,
  ".local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5",
);
await withPrivateTarget(root, async (state) => {
  const client = new Client(privateConnection(isolated.database));
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const identity = await assertPrivateIdentity(client, isolated.database, state.data);
    const catalog = await readSchemaCatalog(client),
      { snapshot } = assertStudyProposal(root);
    assert(catalog.tables.every((t) => t.owner === isolated.owner));
    let invariant;
    try {
      assertSchemaCatalog(
        {
          ...catalog,
          tables: catalog.tables.map((t) => ({ ...t, owner: "ccna_phase6a_migrator" })),
        },
        snapshot,
      );
    } catch (e) {
      invariant = /^(Application|Unexpected|Reviewed|Catalog invariant)/.test(e.message)
        ? e.message
        : "Catalog comparison failed";
    }
    const proof = await rowProof(client, Object.keys(receipt.rowProof));
    const counts = {};
    for (const name of ["lesson_annotations", "lesson_progress", "lesson_media"])
      counts[name] = (
        await client.query(`SELECT count(*)::int AS n FROM public.${name}`)
      ).rows[0].n;
    const report = {
      identity,
      databaseWrites: 0,
      migrationRetried: false,
      originalRowsMatched: JSON.stringify(proof) === JSON.stringify(receipt.rowProof),
      ledger: (
        await client.query(
          "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
        )
      ).rows,
      studyCounts: counts,
      invariant,
      indexes: catalog.indexes.filter(
        (i) => i.table.startsWith("lesson_") && i.table !== "lesson_revisions",
      ),
      constraints: catalog.constraints.filter((i) =>
        ["lesson_annotations", "lesson_progress", "lesson_media"].includes(i.table),
      ),
    };
    let candidateFailure;
    try {
      await assertStudyRuntimeCatalog(client, root, isolated.owner);
    } catch (e) {
      candidateFailure = {
        actual:
          typeof e.actual === "string" ||
          typeof e.actual === "boolean" ||
          typeof e.actual === "number"
            ? e.actual
            : "non-scalar metadata",
        expected:
          typeof e.expected === "string" ||
          typeof e.expected === "boolean" ||
          typeof e.expected === "number"
            ? e.expected
            : "non-scalar metadata",
        source: e.stack
          ?.split("\n")
          .filter((l) => l.includes("proposed-runtime-guard.mjs"))
          .slice(0, 1),
      };
    }
    report.candidateFailure = candidateFailure;
    report.sequences = {};
    for (const name of ["public.question_code_seq", "drizzle.__drizzle_migrations_id_seq"])
      report.sequences[name] = (
        await client.query(`SELECT last_value::text,is_called FROM ${name}`)
      ).rows[0];
    writeFileSync(
      path.join(folder, "diagnosis-" + Date.now() + ".json"),
      JSON.stringify(report, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        databaseWrites: 0,
        originalRowsMatched: report.originalRowsMatched,
        ledgerEntries: report.ledger.length,
        studyCounts: counts,
        candidateFailure,
        sequences: report.sequences,
      }),
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
});
