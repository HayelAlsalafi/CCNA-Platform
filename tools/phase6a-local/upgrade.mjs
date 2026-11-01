import {assertDeletionProposal,assertDeletionFunction} from '../lesson-deletion/policy.mjs';
import {assertMediaProposal} from '../media-activation/proposal.mjs';
import {assertMediaRuntimeCatalog} from '../media-activation/runtime.mjs';
import {assertStudyProposal} from '../study-activation/proposal.mjs';
import {examSnapshot} from '../exam-policy.mjs';
import {isLessonChain,lessonSnapshot} from '../lesson-activation/policy.mjs';
import {canonicalSnapshot} from "../canonical-chapters-policy.mjs";
// No connections on import. All database work requires an injected, verified client.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {nexusSnapshot,assertNexusFunction} from '../nexus-policy.mjs';
import {questionBankSnapshot} from '../question-bank-policy.mjs';
import {learningSnapshot} from '../learning-policy.mjs';
import { policy, LocalRuntimeError, assertIdentity, assertLedger, migrationManifest } from "./policy.mjs";

const fail = (message) => {
  throw new LocalRuntimeError(message);
};
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const diagnosticIdentifier = (value) =>
  typeof value === "string" && /^[a-z_][a-z_0-9]{0,62}$/i.test(value)
    ? value
    : "<invalid-identifier>";
function constraintFailure(invariant, constraint, field, column) {
  // Only validated metadata identifiers and fixed invariant names are emitted.
  // Never include raw driver messages, array payloads, SQL or connection input.
  const error = new LocalRuntimeError(
    `Catalog invariant ${invariant}: table=public.${diagnosticIdentifier(constraint.table)}; constraint=${diagnosticIdentifier(constraint.name)}; field=${field}${column === undefined ? "" : "; column=" + diagnosticIdentifier(column)}.`,
  );
  error.code = "UPGRADE_CATALOG_BINDING";
  throw error;
}
export const upgradeHead = "03b14526aae448e49eacd602a43bfb0e355aca4d";
export const legacyTables = Object.freeze([
  "practice_attempts",
  "practice_deliveries",
  "question_options",
  "question_revisions",
  "questions",
  "topics",
  "users",
]);
export const taxonomyTables = Object.freeze([
  "exam_blueprints",
  "exam_domains",
  "exam_objectives",
  "question_objectives",
]);
export const ledgerSql =
  "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id";
export function upgradeSnapshots(root) {
  const result = [
    ["0004", "c7ccd4836383d4962c7c46ff61147c417c32b4826c08cba34c05b021711fb60c"],
    ["0005", "c2f5a9f9a2d0b010d329982085d2595c87be7d962b17038acbd2bc3024876ded"],
  ].map(([tag, hash]) => {
    const text = readFileSync(
      path.join(root, "lib/db/drizzle/meta", tag + "_snapshot.json"),
      "utf8",
    );
    if (createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex") !== hash)
      fail("Reviewed upgrade snapshot changed; stop.");
    return JSON.parse(text);
  });
  const journal=JSON.parse(readFileSync(path.join(root,'lib/db/drizzle/meta/_journal.json'),'utf8'));
  if(journal.entries.length===8)result[1]=nexusSnapshot(root);
  if(journal.entries.length===9)result[1]=learningSnapshot(root);
  if(journal.entries.length>=10)result[1]=questionBankSnapshot(root,journal.entries.length===10?9:10);
  if(journal.entries.length>=12)result[1]=canonicalSnapshot(root);
  if(journal.entries.length===13)result[1]=isLessonChain(migrationManifest(root))?lessonSnapshot(root):examSnapshot(root);
  if(journal.entries.length===14)result[1]=assertStudyProposal(root).snapshot;
  if(journal.entries.length===15)result[1]=assertMediaProposal(root).snapshot;
  if(journal.entries.length===16)result[1]=assertDeletionProposal(root).snapshot;
  return result;
}
export function assertOnlyTaxonomyPending(rows, manifest) {
  if (manifest.length !== 6 || manifest[5].tag !== "0005_exam_taxonomy")
    fail("Only reviewed 0005 may be pending.");
  assertLedger(rows, manifest.slice(0, 5));
  if (
    new Set(rows.map((r) => String(r.id))).size !== 5 ||
    rows.some((r) => !/^\d+$/.test(String(r.id)))
  )
    fail("Unexpected existing migration ledger identities.");
}
const typeName = (value) =>
  value.replaceAll("character varying", "varchar").replaceAll("public.", "").replaceAll('"', "");
const predicate = (value) =>
  (value ?? "")
    .replace(/(?:"[^"]+"|[a-z_][a-z_0-9]*)\./gi, "")
    .replaceAll('"', "")
    .replace(/\s|[()]/g, "");
export function assertSchemaCatalog(actual, snapshot) {
  const tables = Object.values(snapshot.tables).sort((a, b) => a.name.localeCompare(b.name));
  if (
    !equal(
      actual.tables,
      tables.map((t) => ({ name: t.name, kind: "r", owner: policy.migrationRole })),
    )
  )
    fail("Unexpected application table inventory, kind or ownership.");
  const columns = tables.flatMap((t) =>
    Object.values(t.columns).map((c) => ({
      table: t.name,
      name: c.name,
      type: typeName(c.type),
      notNull: c.notNull,
    })),
  );
  const columnOrder = (a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name);
  if (
    !equal(
      actual.columns.map((c) => ({ ...c, type: typeName(c.type) })).sort(columnOrder),
      columns.sort(columnOrder),
    )
  )
    fail("Application columns differ from reviewed snapshot.");
  const expectedConstraints = tables
    .flatMap((t) => [
      ...Object.entries(t.uniqueConstraints).map(([name, c]) => ({
        table: t.name,
        name,
        kind: "u",
        columns: c.columns,
      })),
      ...Object.entries(t.foreignKeys).map(([name, c]) => ({
        table: t.name,
        name,
        kind: "f",
        columns: c.columnsFrom,
        target: c.tableTo,
        targetColumns: c.columnsTo,
        onDelete: {
          restrict: "r",
          cascade: "c",
          "no action": "a",
          "set null": "n",
          "set default": "d",
        }[c.onDelete],
      })),
      ...Object.keys(t.checkConstraints).map((name) => ({ table: t.name, name, kind: "c" })),
      ...Object.entries(t.compositePrimaryKeys).map(([name, c]) => ({
        table: t.name,
        name,
        kind: "p",
        columns: c.columns,
      })),
      ...Object.values(t.columns)
        .filter((c) => c.primaryKey)
        .map((c) => ({ table: t.name, name: t.name + "_pkey", kind: "p", columns: [c.name] })),
    ])
    .sort((a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name));
  if (!equal(actual.constraints, expectedConstraints))
    fail("Application constraints differ from reviewed snapshot or are unvalidated.");
  const expectedIndexes = tables
    .flatMap((t) => [
      ...Object.entries(t.indexes).map(([name, i]) => ({
        table: t.name,
        name,
        unique: i.isUnique,
        columns: i.columns.map((c) => c.expression),
        where: predicate(i.where),
      })),
      ...expectedConstraints
        .filter((c) => c.table === t.name && ["p", "u"].includes(c.kind))
        .map((c) => ({ table: t.name, name: c.name, unique: true, columns: c.columns, where: "" })),
    ])
    .sort((a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name));
  if (!equal(actual.indexes, expectedIndexes))
    fail("Application indexes differ from reviewed snapshot or are invalid.");
  const enums = Object.values(snapshot.enums)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, values: e.values }));
  if (!equal(actual.enums, enums))
    fail("Application enum inventory differs from reviewed snapshot.");
  if (
    !equal(
      actual.sequences,
      Object.values(snapshot.sequences)
        .map((s) => s.name)
        .sort(),
    )
  )
    fail("Unexpected application sequences.");
}
export async function readSchemaCatalog(client) {
  const tables = (
    await client.query(
      "SELECT c.relname AS name,c.relkind AS kind,r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','c') ORDER BY c.relname",
    )
  ).rows;
  const columns = (
    await client.query(
      "SELECT c.relname AS table,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS \"notNull\" FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum",
    )
  ).rows;
  const rawConstraints = (
    await client.query(`SELECT t.relname AS table,c.conname AS name,c.contype AS kind,c.convalidated AS valid,c.conenforced AS enforced,c.condeferrable AS deferrable,c.condeferred AS deferred,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.num ORDER BY k.pos) AS columns,
    target.relname AS target,tn.nspname AS "targetSchema",
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.num ORDER BY k.pos) AS "targetColumns",c.confdeltype AS "onDelete"
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_class target ON target.oid=c.confrelid LEFT JOIN pg_namespace tn ON tn.oid=target.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname`)
  ).rows;
  const constraints = rawConstraints.flatMap((c) => {
    if (
      c.valid !== true ||
      c.enforced !== true ||
      c.deferrable !== false ||
      c.deferred !== false ||
      !["u", "f", "p", "c", "n"].includes(c.kind)
    )
      constraintFailure(
        "CONSTRAINT_ENFORCEMENT",
        c,
        "contype/convalidated/conenforced/condeferrable/condeferred",
      );
    if (c.kind !== "c" && !Array.isArray(c.columns))
      constraintFailure("CONSTRAINT_COLUMNS_NOT_ARRAY", c, "columns");
    // PostgreSQL 18 records NOT NULL in pg_constraint. Drizzle serializes it
    // as column.notNull, not a separately named table constraint.
    if (c.kind === "n") {
      if (c.columns.length !== 1)
        constraintFailure("NOT_NULL_SINGLE_COLUMN_REQUIRED", c, "conkey/columns");
      const column = columns.find((a) => a.table === c.table && a.name === c.columns[0]);
      if (!column)
        constraintFailure("NOT_NULL_COLUMN_NOT_FOUND", c, "conkey/attname", c.columns[0]);
      if (column.notNull !== true)
        constraintFailure("NOT_NULL_ATTNOTNULL_REQUIRED", c, "attnotnull", c.columns[0]);
      return [];
    }
    const out = { table: c.table, name: c.name, kind: c.kind };
    if (c.kind !== "c") out.columns = c.columns;
    if (c.kind === "f") {
      if (!Array.isArray(c.targetColumns))
        constraintFailure("FOREIGN_KEY_COLUMNS_NOT_ARRAY", c, "targetColumns");
      if (c.targetSchema !== "public") fail("Unexpected foreign-key schema.");
      Object.assign(out, {
        target: c.target,
        targetColumns: c.targetColumns,
        onDelete: c.onDelete,
      });
    }
    return [out];
  });
  const indexes = (
    await client.query(`SELECT t.relname AS table,i.relname AS name,x.indisunique AS unique,x.indisvalid AS valid,x.indisready AS ready,
    ARRAY(SELECT a.attname::text FROM unnest(x.indkey::smallint[]) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.pos) AS columns,pg_get_expr(x.indpred,x.indrelid) AS "where"
    FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname`)
  ).rows.map(({ valid, ready, ...i }) => {
    if (!valid || !ready) fail("Invalid application index.");
    return { ...i, where: predicate(i.where) };
  });
  const enums = (
    await client.query(
      "SELECT t.typname AS name,array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' AND t.typtype IN ('e','d') GROUP BY t.typname ORDER BY t.typname",
    )
  ).rows;
  const sequences = (
    await client.query(
      "SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename",
    )
  ).rows.map((r) => r.sequencename);
  return { tables, columns, constraints, indexes, enums, sequences };
}
export async function verifyUpgradeState(
  client,
  manifest,
  snapshots,
  phase,
  requireEmpty = phase === "after",
) {
  const namespace = (
    await client.query(
      "SELECT n.nspname,r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname IN ('public','drizzle') ORDER BY n.nspname",
    )
  ).rows;
  if (
    !equal(namespace, [
      { nspname: "drizzle", owner: policy.migrationRole },
      { nspname: "public", owner: policy.migrationRole },
    ])
  )
    fail("Unexpected migration schema ownership.");
  const rows = (await client.query(ledgerSql)).rows;
  if (phase === "before") assertOnlyTaxonomyPending(rows, manifest);
  else assertLedger(rows, manifest);
  assertSchemaCatalog(await readSchemaCatalog(client), snapshots[phase === "before" ? 0 : 1]);
  if(phase==='after'&&manifest.length>=15){await assertMediaRuntimeCatalog(client,policy.root,manifest);if(manifest.length===16)await assertDeletionFunction(client,policy.root);}
  if(phase==='after'&&manifest.length>=8)await assertNexusFunction(client,policy.root,policy.migrationRole);
  if (requireEmpty)
    for (const table of taxonomyTables)
      if (
        (await client.query('SELECT EXISTS (SELECT 1 FROM public."' + table + '") AS populated'))
          .rows[0]?.populated !== false
      )
        fail("Taxonomy must be empty immediately after schema upgrade.");
  return rows;
}
export async function dataFingerprint(client) {
  const result = {};
  for (const table of legacyTables) {
    const hash = createHash("sha256");
    let count = 0;
    await client.query(
      'DECLARE ccna_upgrade_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS data FROM public."' +
        table +
        '" t ORDER BY id',
    );
    try {
      while (true) {
        const rows = (await client.query("FETCH FORWARD 1000 FROM ccna_upgrade_rows")).rows;
        if (!rows.length) break;
        for (const row of rows) {
          hash.update(row.data + "\n");
          count++;
        }
      }
    } finally {
      await client.query("CLOSE ccna_upgrade_rows");
    }
    result[table] = { count, hash: hash.digest("hex") };
  }
  result.sequence = (
    await client.query("SELECT last_value::text,is_called FROM public.question_code_seq")
  ).rows;
  // Include definitions/defaults/triggers/functions so migration cannot silently change old behavior.
  result.schema = (
    await client.query(
      `SELECT c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) AS definition FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum JOIN pg_class c ON c.oid=d.adrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname,a.attnum`,
      [legacyTables],
    )
  ).rows;
  // New FKs legitimately add internal RI triggers to the referenced questions
  // table; compare existing user triggers, while FK bindings are checked above.
  result.triggers = (
    await client.query(
      "SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname=ANY($1::text[]) ORDER BY c.relname,t.tgname",
      [legacyTables],
    )
  ).rows;
  result.functions = (
    await client.query(
      "SELECT p.oid,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.oid",
    )
  ).rows;
  return result;
}
// The official migrator issues its own BEGIN/COMMIT. Bind those boundaries to a
// savepoint on this same verified connection so postchecks precede the outer COMMIT.
export function migratorClient(client) {
  let active = false;
  return {
    async query(query, params) {
      const command = (typeof query === "string" ? query : query.text).trim().toLowerCase();
      if (command === "begin") {
        if (active) fail("Unexpected nested migration transaction.");
        active = true;
        return client.query("SAVEPOINT ccna_upgrade_migrator");
      }
      if (command === "commit") {
        if (!active) fail("Unexpected migration commit.");
        active = false;
        return client.query("RELEASE SAVEPOINT ccna_upgrade_migrator");
      }
      if (command === "rollback") {
        if (!active) fail("Unexpected migration rollback.");
        active = false;
        return client.query("ROLLBACK TO SAVEPOINT ccna_upgrade_migrator");
      }
      return client.query(query, params);
    },
  };
}
export async function executeUpgrade(client, config, manifest, snapshots, deps) {
  let committed = false;
  await client.query("BEGIN");
  try {
    await client.query(
      "SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='10s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL TIME ZONE 'UTC'",
    );
    assertIdentity(
      (await client.query("SELECT local_runtime_guard.identity() AS identity")).rows[0]?.identity,
      config,
    );
    if (config.systemIdentifier !== policy.upgradeSystemIdentifier)
      fail("Upgrade cluster fingerprint changed.");
    if (
      (await client.query("SELECT pg_try_advisory_xact_lock(20261012,5005) AS acquired")).rows[0]
        ?.acquired !== true
    )
      fail("Another guarded upgrade is running; stop.");
    await client.query(
      "LOCK TABLE " +
        [...legacyTables.map((t) => 'public."' + t + '"'), "drizzle.__drizzle_migrations"].join(
          ",",
        ) +
        " IN SHARE MODE",
    );
    const beforeLedger = await verifyUpgradeState(client, manifest, snapshots, "before");
    const before = await dataFingerprint(client);
    await deps.migrate(migratorClient(client));
    const afterLedger = await verifyUpgradeState(client, manifest, snapshots, "after");
    if (!equal(afterLedger.slice(0, 5), beforeLedger))
      fail("Historical migration ledger changed; upgrade rolled back.");
    if (!equal(await dataFingerprint(client), before))
      fail("Existing data, sequence or behavior changed; upgrade rolled back.");
    const privileges = await taxonomyPrivileges(client);
    if (privileges.unsafe.length)
      fail("Unexpected taxonomy runtime privileges; upgrade rolled back.");
    await client.query("COMMIT");
    committed = true;
    return {
      applied: ["0005_exam_taxonomy"],
      ledgerEntries: 6,
      existingDataPreserved: true,
      taxonomyTablesVerified: true,
      taxonomyEmpty: true,
      runtimePrivileges: privileges,
      committed: true,
    };
  } finally {
    if (!committed) await client.query("ROLLBACK");
  }
}
export async function taxonomyPrivileges(client) {
  const rows = (
    await client.query(
      `SELECT c.relname AS name,
    has_table_privilege($1,c.oid,'SELECT') AS "select",has_table_privilege($1,c.oid,'INSERT') AS "insert",has_table_privilege($1,c.oid,'UPDATE') AS "update",
    has_table_privilege($1,c.oid,'DELETE') AS "delete",has_table_privilege($1,c.oid,'TRUNCATE') AS "truncate",has_table_privilege($1,c.oid,'REFERENCES') AS "references",has_table_privilege($1,c.oid,'TRIGGER') AS "trigger"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($2::text[]) ORDER BY c.relname`,
      [policy.appRole, taxonomyTables],
    )
  ).rows;
  return assessTaxonomyPrivileges(
    rows,
    (
      await client.query(
        "SELECT has_schema_privilege($1,'public','USAGE') AS schema_usage,has_type_privilege($1,'public.exam_blueprint_status','USAGE') AS type_usage,has_sequence_privilege($1,'public.question_code_seq','USAGE') AS code_usage,has_sequence_privilege($1,'public.question_code_seq','UPDATE') AS code_update",
        [policy.appRole],
      )
    ).rows[0],
  );
}
export function assessTaxonomyPrivileges(rows, other) {
  if (
    !equal(
      rows.map((r) => r.name),
      taxonomyTables,
    ) ||
    !other
  )
    fail("Taxonomy privilege inventory missing.");
  const missing = [],
    unsafe = [];
  for (const row of rows)
    for (const key of [
      "select",
      "insert",
      "update",
      "delete",
      "truncate",
      "references",
      "trigger",
    ]) {
      const required =
        ["select", "insert", "update"].includes(key) ||
        (key === "delete" && row.name === "question_objectives");
      if (typeof row[key] !== "boolean") fail("Unverified taxonomy privilege.");
      if (required && !row[key]) missing.push(row.name + ":" + key.toUpperCase());
      if (!required && row[key]) unsafe.push(row.name + ":" + key.toUpperCase());
    }
  for (const key of ["schema_usage", "type_usage", "code_usage", "code_update"]) {
    if (typeof other[key] !== "boolean") fail("Unverified taxonomy type/sequence privilege.");
    if (key === "code_update") {
      if (other[key]) unsafe.push("question_code_seq:UPDATE");
    } else if (!other[key])
      missing.push(
        {
          schema_usage: "public:USAGE",
          type_usage: "exam_blueprint_status:USAGE",
          code_usage: "question_code_seq:USAGE",
        }[key],
      );
  }
  return { ready: !missing.length && !unsafe.length, missing, unsafe };
}
