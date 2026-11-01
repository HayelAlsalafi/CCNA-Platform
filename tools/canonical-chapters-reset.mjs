// Inert transaction body; caller must verify exact target, backup and approval.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { canonicalSources } from "./canonical-chapters-policy.mjs";
import { assertTimestampOnlyRefresh } from "./canonical-baseline-refresh.mjs";
import { rowProof } from "./question-bank-upgrade-core.mjs";
import {
  migratorClient,
  readSchemaCatalog,
  assertSchemaCatalog,
} from "./phase6a-local/upgrade.mjs";

export function assertResetScope(plan, catalog) {
  assert.equal(plan.baselineCount, 11);
  assert.deepEqual(plan.preservedTables, [
    "users",
    "achievement_definitions",
    "exam_blueprints",
    "exam_domains",
  ]);
  assert.deepEqual(plan.clearTables, [
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
  ]);
  assert.equal(plan.catalog.blueprints.length, 1, "Unrelated blueprint requires scope review");
  const b = plan.catalog.blueprints[0];
  assert.deepEqual(
    { exam_code: b.exam_code, version: b.version, status: b.status },
    { exam_code: "200-301", version: "1.1", status: "ACTIVE" },
  );
  assert.equal(plan.catalog.domains.length, 6);
  assert.deepEqual(
    plan.catalog.domains.map((d) => ({ code: d.code, name: d.name, examWeight: d.weight_percent })),
    catalog.domains.map(({ chapterCount, ...d }) => d),
  );
  assert(plan.catalog.domains.every((d) => d.blueprint_id === b.id));
  assert.equal(plan.catalog.objectives.length, 53);
  assert(plan.catalog.objectives.every((o) => o.blueprint_id === b.id));
  assert.equal(catalog.chapters.length, 48);
  assert.equal(new Set(catalog.chapters.map((c) => c.topicId)).size, 48);
  assert.equal(
    plan.backup.sha256,
    "4be6e58e7e37bedf4c48387b2a0c1bcaa7418a3cc0747279c3c26759f0408ed0",
  );
  assert.equal(plan.restoration.restoreVerified, true);
  assert.equal(plan.restoration.allRowsAndHashesMatched, true);
  assert.equal(plan.restoration.rolledBack, true);
  assert.equal(plan.restoration.tablesVerified, 16);
}
export function verifyResetBackup(root, plan) {
  const originalBytes = readFileSync(path.join(root, "tools/canonical-chapters-original-approval.json"));
  assert.equal(createHash("sha256").update(originalBytes).digest("hex"),
    "6bcdefc3636b8cb3ff23f96f49743a3e3121720630220765c1ec91293eb84c7f",
    "Original approval drift");
  const original = JSON.parse(originalBytes.toString("utf8"));
  verifyBackupEvidence(root, original);
  const refreshed = verifyBackupEvidence(root, plan);
  assertTimestampOnlyRefresh(original, refreshed);
}
function verifyBackupEvidence(root, plan) {
  const report = path.join(root, plan.reportPath);
  assert.equal(
    createHash("sha256").update(readFileSync(report)).digest("hex"),
    plan.reportSha256,
    "Backup report drift",
  );
  assert.equal(
    createHash("sha256").update(readFileSync(plan.backup.path)).digest("hex"),
    plan.backup.sha256,
    "Backup bytes drift",
  );
  const r = JSON.parse(readFileSync(report, "utf8"));
  assert.equal(r.stage, "complete");
  assert.equal(r.databaseWrites, 0);
  assert.equal(r.executionApproved, false);
  for (const key of [
    "rowProof",
    "catalog",
    "backup",
    "restoration",
    "baselineLedger",
    "questionCodeSequence",
  ])
    assert.deepEqual(r[key], plan[key], "Backup/approval inventory drift: " + key);
  return r;
}
export function stageCanonicalMigration(root) {
  const source = canonicalSources(root),
    folder = path.join(root, ".local/canonical-chapter-migration");
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  for (const e of source.journal.entries)
    writeFileSync(
      path.join(folder, e.tag + ".sql"),
      readFileSync(
        path.join(
          root,
          "lib/db/drizzle",
          e.idx === 11 ? "proposed/" + e.tag + ".sql" : e.tag + ".sql",
        ),
      ),
    );
  writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify(source.journal));
  return folder;
}
export function promoteCanonicalMigration(root) {
  const { journal } = canonicalSources(root);
  const official = JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/meta/_journal.json"), "utf8"),
  );
  assert.deepEqual(official.entries, journal.entries.slice(0, 11), "Only 0011 may be pending");
  for (const relative of ["0011_canonical_book_chapters.sql", "meta/0011_snapshot.json"]) {
    const bytes = readFileSync(path.join(root, "lib/db/drizzle/proposed", relative)),
      target = path.join(root, "lib/db/drizzle", relative);
    if (existsSync(target)) assert(readFileSync(target).equals(bytes));
    else writeFileSync(target, bytes, { flag: "wx" });
  }
  // Journal last; source promotion itself never applies a database migration.
  writeFileSync(
    path.join(root, "lib/db/drizzle/meta/_journal.json"),
    JSON.stringify(journal, null, 2) + "\n",
  );
}
export async function resetCanonicalTransaction(
  client,
  root,
  { owner, grantRuntime = false, privateRehearsal = false },
) {
  const { plan, catalog, snapshot } = canonicalSources(root);
  assertResetScope(plan, catalog);
  assert(
    privateRehearsal
      ? owner === "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170" && !grantRuntime
      : owner === "ccna_phase6a_migrator" && grantRuntime,
    "Unexpected reset owner/mode",
  );
  // Access-exclusive locks make this a maintenance operation. Bounded waits fail
  // closed if any API activity remains; no force-termination of other sessions.
  const tables = Object.keys(plan.rowProof).sort();
  assert(tables.every((t) => /^[a-z_]+$/.test(t)));
  const unexpectedReferences = (
    await client.query(
      `SELECT ns.nspname AS schema,child.relname AS relation,f.conname AS constraint FROM pg_constraint f JOIN pg_class child ON child.oid=f.conrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN pg_class parent ON parent.oid=f.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace WHERE f.contype='f' AND pn.nspname='public' AND parent.relname=ANY($1::text[]) AND NOT (ns.nspname='public' AND child.relname=ANY($2::text[]))`,
      [plan.clearTables, tables],
    )
  ).rows;
  assert.deepEqual(
    unexpectedReferences,
    [],
    "Unreviewed external dependency requires scope review",
  );
  await client.query(
    "LOCK TABLE " +
      tables
        .map((t) => 'public."' + t + '"')
        .concat("drizzle.__drizzle_migrations")
        .join(",") +
      " IN ACCESS EXCLUSIVE MODE",
  );
  assert.deepEqual(
    await rowProof(client, tables),
    plan.rowProof,
    "Approved data changed; obtain a new inventory/backup and scope review",
  );
  const codeSequence = (
    await client.query("SELECT last_value::text,is_called FROM public.question_code_seq")
  ).rows;
  if (!privateRehearsal)
    assert.deepEqual(codeSequence, plan.questionCodeSequence, "Question sequence changed");
  assert.equal(
    (await client.query("SELECT to_regclass('public.curriculum_chapters') AS relation")).rows[0]
      .relation,
    null,
    "Already initialized; refuse duplicate reset",
  );
  assert.equal(
    (await client.query("SELECT to_regclass('pg_temp.ccna_history_delete_permits') AS relation"))
      .rows[0].relation,
    null,
    "Unexpected existing permit table",
  );
  await client.query(
    "CREATE TEMP TABLE ccna_history_delete_permits(transaction_id text NOT NULL,relation_id oid NOT NULL,record_id uuid NOT NULL,PRIMARY KEY(transaction_id,relation_id,record_id)) ON COMMIT DROP",
  );
  await client.query("REVOKE ALL ON pg_temp.ccna_history_delete_permits FROM PUBLIC");
  // Existing immutable guards require exact transaction/relation/row permits.
  // No FK or trigger is disabled, and no runtime privilege is broadened.
  for (const t of [
    "practice_attempts",
    "practice_deliveries",
    "question_revisions",
    "question_deletion_audits",
  ])
    await client.query(
      `INSERT INTO pg_temp.ccna_history_delete_permits SELECT pg_current_xact_id()::text,'public.${t}'::regclass,id FROM public.${t}`,
    );
  const deleted = {};
  for (const table of plan.clearTables) {
    const result = await client.query('DELETE FROM public."' + table + '"');
    assert.equal(
      result.rowCount,
      plan.rowProof[table].count,
      "Unexpected deletion count: " + table,
    );
    deleted[table] = result.rowCount;
  }
  await client.query("DELETE FROM pg_temp.ccna_history_delete_permits");
  const req = createRequire(path.join(root, "lib/db/package.json")),
    { drizzle } = req("drizzle-orm/node-postgres"),
    { migrate } = req("drizzle-orm/node-postgres/migrator");
  const folder = stageCanonicalMigration(root);
  await migrate(drizzle(migratorClient(client)), { migrationsFolder: folder });
  const blueprint = plan.catalog.blueprints[0].id;
  for (const [order, c] of catalog.chapters.entries()) {
    const domain = plan.catalog.domains.find((d) => d.code === c.primaryDomain);
    assert(domain);
    await client.query(
      "INSERT INTO public.topics(id,slug,name,description,display_order,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')",
      [
        c.topicId,
        c.slug,
        c.title,
        `${c.volume} Chapter ${c.chapterNumber} · ${domain.name}`,
        order,
      ],
    );
    await client.query(
      "INSERT INTO public.curriculum_chapters(id,blueprint_id,domain_id,domain_code,code,volume,chapter_number) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [c.topicId, blueprint, domain.id, domain.code, c.code, c.volume, c.chapterNumber],
    );
  }
  if (grantRuntime)
    await client.query(
      "GRANT SELECT,INSERT,UPDATE ON public.curriculum_chapters TO ccna_phase6a_app",
    );
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  assertSchemaCatalog(
    {
      ...(await readSchemaCatalog(client)),
      tables: (await readSchemaCatalog(client)).tables.map((t) => ({
        ...t,
        owner: "ccna_phase6a_migrator",
      })),
    },
    snapshot,
  );
  const preserved = await rowProof(client, plan.preservedTables);
  assert.deepEqual(
    preserved,
    Object.fromEntries(plan.preservedTables.map((t) => [t, plan.rowProof[t]])),
    "Unrelated data was changed",
  );
  const after = await rowProof(client, [...plan.clearTables, "curriculum_chapters"]);
  for (const table of plan.clearTables)
    assert.equal(after[table].count, table === "topics" ? 48 : 0, "Reset postcondition: " + table);
  assert.equal(after.curriculum_chapters.count, 48);
  const actual = (
    await client.query(
      'SELECT c.id AS "topicId",c.code,c.volume,c.chapter_number AS "chapterNumber",c.domain_code AS "primaryDomain",t.name AS title,t.slug FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id ORDER BY c.code',
    )
  ).rows;
  assert.deepEqual(
    actual,
    catalog.chapters.map(({ id, ...c }) => c).sort((a, b) => a.code.localeCompare(b.code)),
    "Canonical chapter data mismatch",
  );
  assert.deepEqual(
    (await client.query("SELECT last_value::text,is_called FROM public.question_code_seq")).rows,
    codeSequence,
    "Question code sequence must not reset",
  );
  const ledger = (
    await client.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
    )
  ).rows;
  assert.equal(ledger.length, 12);
  const beforeRepeat = ledger;
  await migrate(drizzle(migratorClient(client)), { migrationsFolder: folder });
  assert.deepEqual(
    (
      await client.query(
        "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
      )
    ).rows,
    beforeRepeat,
    "Migrator repeat changed ledger",
  );
  return {
    deleted,
    topics: 48,
    chapters: 48,
    domains: 6,
    questions: 0,
    legacyObjectives: 0,
    usersPreserved: preserved.users.count,
    achievementDefinitionsPreserved: preserved.achievement_definitions.count,
    ledgerEntries: 12,
    questionCodeSequencePreserved: true,
  };
}
