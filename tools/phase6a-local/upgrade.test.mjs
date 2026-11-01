import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  policy,
  validateInput,
  migrationManifest,
  preflight,
  LocalRuntimeError,
  safeError,
} from "./policy.mjs";
import {
  upgradeSnapshots,
  legacyTables,
  taxonomyTables,
  assertOnlyTaxonomyPending,
  assertSchemaCatalog,
  executeUpgrade,
  migratorClient,
  assessTaxonomyPrivileges,
  verifyUpgradeState,
  readSchemaCatalog,
} from "./upgrade.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Preserve coverage of the original five-to-six upgrade; current seven-file
// source inventory must refuse that operation, as independently checked below.
const manifest = migrationManifest(root).slice(0,6),
  snapshots = [upgradeSnapshots(root)[0],JSON.parse(readFileSync(path.join(root,"lib/db/drizzle/meta/0005_snapshot.json"),"utf8"))];
const config = {
  host: policy.host,
  port: 5432,
  database: policy.database,
  role: policy.migrationRole,
  systemIdentifier: policy.upgradeSystemIdentifier,
  password: "offline fixture only",
};
const identity = {
  database: policy.database,
  host: policy.host,
  port: 5432,
  sessionRole: policy.migrationRole,
  versionNumber: 180006,
  dataDirectory: policy.dataDirectory,
  systemIdentifier: policy.upgradeSystemIdentifier,
  neon: null,
};
const ledger = () =>
  manifest.slice(0, 5).map((m, i) => ({ id: i + 1, hash: m.hash, created_at: String(m.when) }));
const attrs = {
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolinherit: false,
  rolreplication: false,
  rolbypassrls: false,
  membership: false,
};
const permissions = () =>
  taxonomyTables.map((name) => ({
    name,
    select: true,
    insert: true,
    update: true,
    delete: name === "question_objectives",
    truncate: false,
    references: false,
    trigger: false,
  }));
const other = { schema_usage: true, type_usage: true, code_usage: true, code_update: false };
function catalog(snapshot) {
  const tables = Object.values(snapshot.tables).sort((a, b) => a.name.localeCompare(b.name));
  const constraints = tables
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
        onDelete: c.onDelete === "cascade" ? "c" : "r",
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
  return {
    tables: tables.map((t) => ({ name: t.name, kind: "r", owner: policy.migrationRole })),
    columns: tables.flatMap((t) =>
      Object.values(t.columns).map((c) => ({
        table: t.name,
        name: c.name,
        type: c.type,
        notNull: c.notNull,
      })),
    ),
    constraints,
    indexes: tables
      .flatMap((t) => [
        ...Object.entries(t.indexes).map(([name, i]) => ({
          table: t.name,
          name,
          unique: i.isUnique,
          columns: i.columns.map((c) => c.expression),
          where: (i.where ?? "")
            .replace(/"[^"]+"\./g, "")
            .replaceAll('"', "")
            .replace(/\s|[()]/g, ""),
        })),
        ...constraints
          .filter((c) => c.table === t.name && ["p", "u"].includes(c.kind))
          .map((c) => ({
            table: t.name,
            name: c.name,
            unique: true,
            columns: c.columns,
            where: "",
          })),
      ])
      .sort((a, b) => (a.table + "/" + a.name).localeCompare(b.table + "/" + b.name)),
    enums: Object.values(snapshot.enums)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ name: e.name, values: [...e.values] })),
    sequences: ["question_code_seq"],
  };
}
function mock() {
  const calls = [],
    state = {
      rows: ledger(),
      catalog: catalog(snapshots[0]),
      data: "existing application content",
      seq: "108",
      fetch: 0,
      ended: 0,
      grants: permissions(),
      other: { ...other },
    };
  const client = {
    connect: async () => calls.push("connect"),
    end: async () => {
      state.ended++;
    },
    query: async (q, params) => {
      const text = typeof q === "string" ? q : q.text;
      calls.push(text);
      if (text === "BEGIN")
        state.baseline = structuredClone({ rows: state.rows, catalog: state.catalog });
      if (text === "ROLLBACK" && state.baseline) {
        state.rows = state.baseline.rows;
        state.catalog = state.baseline.catalog;
      }
      if (text.includes("identity()")) return { rows: [{ identity: state.identity ?? identity }] };
      if (text.includes("pg_auth_members")) return { rows: [attrs] };
      if (text.includes("pg_try_advisory")) return { rows: [{ acquired: state.acquired ?? true }] };
      if (text.includes("SELECT n.nspname,r.rolname"))
        return {
          rows: [
            { nspname: "drizzle", owner: policy.migrationRole },
            { nspname: "public", owner: policy.migrationRole },
          ],
        };
      if (text.includes("SELECT id,hash,created_at")) return { rows: structuredClone(state.rows) };
      if (text.startsWith("SELECT c.relname AS name,c.relkind"))
        return { rows: state.catalog.tables };
      if (text.startsWith("SELECT c.relname AS table,a.attname"))
        return { rows: state.catalog.columns };
      if (text.startsWith("SELECT t.relname AS table,c.conname"))
        return {
          rows: [
            ...state.catalog.constraints.map((c) => ({
              ...c,
              valid: true,
              enforced: state.enforced ?? true,
              deferrable: false,
              deferred: false,
              targetSchema: c.kind === "f" ? "public" : null,
            })),
            ...(state.notNullConstraints ?? []),
          ],
        };
      if (text.startsWith("SELECT t.relname AS table,i.relname"))
        return { rows: state.catalog.indexes.map((i) => ({ ...i, valid: true, ready: true })) };
      if (text.startsWith("SELECT t.typname")) return { rows: state.catalog.enums };
      if (text.startsWith("SELECT sequencename"))
        return { rows: state.catalog.sequences.map((sequencename) => ({ sequencename })) };
      if (text.startsWith("SELECT EXISTS"))
        return { rows: [{ populated: state.populated ?? false }] };
      if (text.startsWith("DECLARE")) state.fetch = 0;
      if (text.startsWith("FETCH")) return { rows: state.fetch++ ? [] : [{ data: state.data }] };
      if (text.startsWith("SELECT last_value"))
        return { rows: [{ last_value: state.seq, is_called: true }] };
      if (text.includes('AS "select"')) return { rows: state.grants };
      if (text.includes("AS schema_usage")) return { rows: [state.other] };
      if (text.trim().startsWith("select id, hash, created_at"))
        return { rows: [state.rows.at(-1)] };
      if (text.trim().startsWith('insert into "drizzle"')) {
        state.rows.push({ id: 6, hash: params[0], created_at: String(params[1]) });
        state.catalog = catalog(snapshots[1]);
      }
      return { rows: [] };
    },
  };
  const apply = async (bound) => {
    await bound.query("begin");
    state.rows.push({ id: 6, hash: manifest[5].hash, created_at: String(manifest[5].when) });
    state.catalog = catalog(snapshots[1]);
    await bound.query("commit");
  };
  return { client, calls, state, apply };
}
for (const mode of ["upgrade", "upgrade-check", "upgrade-verify"])
  test(mode + " uses only the pinned migrator target and no Clerk credentials", () => {
    assert.equal(
      validateInput(mode, config, mode === "upgrade" ? { apply: true } : {}).role,
      policy.migrationRole,
    );
    for (const change of [
      { systemIdentifier: "7694701597474139085" },
      { role: policy.appRole },
      { host: "localhost" },
      { port: 55440 },
      { database: "postgres" },
      { publishableKey: "not allowed" },
    ])
      assert.throws(
        () =>
          validateInput(mode, { ...config, ...change }, mode === "upgrade" ? { apply: true } : {}),
        LocalRuntimeError,
      );
  });
test("upgrade flags reject absent authorization and read-only Apply/Start", () => {
  assert.throws(() => validateInput("upgrade", config, {}), LocalRuntimeError);
  for (const mode of ["upgrade-check", "upgrade-verify"])
    for (const flags of [{ apply: true }, { start: true }])
      assert.throws(() => validateInput(mode, config, flags), LocalRuntimeError);
});
test("only an exact five-entry ledger leaves exactly 0005 pending", () => {
  assertOnlyTaxonomyPending(ledger(), manifest);
  for (const rows of [
    [],
    ledger().slice(1),
    [...ledger(), { id: 6, ...ledger()[0] }],
    ledger().reverse(),
    ledger().map((r, i) => (i ? r : { ...r, hash: "changed" })),
    ledger().map((r, i) => (i ? r : { ...r, created_at: "0" })),
    ledger().map((r) => ({ ...r, id: 1 })),
  ])
    assert.throws(() => assertOnlyTaxonomyPending(rows, manifest), LocalRuntimeError);
  assert.throws(() => assertOnlyTaxonomyPending(ledger(), manifest.slice(0, 5)), LocalRuntimeError);
});
test("schema accepts physical column reordering and PostgreSQL varchar spelling", () => {
  const actual = catalog(snapshots[0]);
  actual.columns.reverse();
  actual.columns = actual.columns.map((c) => ({
    ...c,
    type: c.type.replace("varchar", "character varying"),
  }));
  assertSchemaCatalog(actual, snapshots[0]);
});
for (const [name, change] of [
  ["owner", (c) => (c.tables[0].owner = "postgres")],
  [
    "extra table",
    (c) => c.tables.push({ name: "unexpected", kind: "r", owner: policy.migrationRole }),
  ],
  ["column", (c) => c.columns.pop()],
  ["nullability", (c) => (c.columns[0].notNull = false)],
  ["type", (c) => (c.columns[0].type = "text")],
  ["foreign-key delete", (c) => (c.constraints.find((k) => k.kind === "f").onDelete = "a")],
  ["unique index", (c) => (c.indexes[0].unique = !c.indexes[0].unique)],
  ["extra sequence", (c) => c.sequences.push("unexpected")],
  ["enum", (c) => c.enums[0].values.push("UNREVIEWED")],
])
  test("schema refuses unexpected " + name, () => {
    const c = catalog(snapshots[0]);
    change(c);
    assert.throws(() => assertSchemaCatalog(c, snapshots[0]), LocalRuntimeError);
  });
test("partial primary uniqueness predicate cannot be missing", () => {
  const c = catalog(snapshots[1]);
  c.indexes.find((i) => i.name === "question_objectives_primary_uq").where = "";
  assert.throws(() => assertSchemaCatalog(c, snapshots[1]), LocalRuntimeError);
});
test("PostgreSQL unqualified partial predicate matches the reviewed qualified Drizzle predicate", () => {
  const c = catalog(snapshots[1]);
  c.indexes.find((i) => i.name === "question_objectives_primary_uq").where = "is_primary";
  assertSchemaCatalog(c, snapshots[1]);
});
test("read-only preflight closes on ledger failure and invokes no migrator", async () => {
  const m = mock();
  m.state.rows.pop();
  await assert.rejects(
    () =>
      preflight(
        "upgrade-check",
        config,
        {
          verifyLocalService: async () => {},
          createClient: () => m.client,
          upgradeState: (c, p) => verifyUpgradeState(c, manifest, snapshots, p, false),
        },
        {},
      ),
    LocalRuntimeError,
  );
  assert.equal(m.state.ended, 1);
  assert(!m.calls.some((s) => /^(CREATE|INSERT|LOCK|SAVEPOINT)/.test(s)));
});
test("upgrade rechecks identity after preflight before any migration", async () => {
  const m = mock();
  m.state.identity = { ...identity, systemIdentifier: "9999999999999999999" };
  await assert.rejects(
    () => executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply }),
    LocalRuntimeError,
  );
  assert.equal(m.calls.at(-1), "ROLLBACK");
  assert(!m.calls.includes("SAVEPOINT ccna_upgrade_migrator"));
});
test("second concurrent upgrade refuses immediately", async () => {
  const m = mock();
  m.state.acquired = false;
  await assert.rejects(
    () => executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply }),
    LocalRuntimeError,
  );
  assert.equal(m.calls.at(-1), "ROLLBACK");
});
test("successful upgrade commits only after preservation and six-entry checks", async () => {
  const m = mock();
  const result = await executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply });
  assert.equal(result.committed, true);
  assert.equal(m.calls.at(-1), "COMMIT");
  assert(m.calls.some((s) => s.startsWith("LOCK TABLE")));
  assert(m.calls.includes("RELEASE SAVEPOINT ccna_upgrade_migrator"));
  assert.equal(m.calls.filter((s) => s === "COMMIT").length, 1);
  assert.equal(result.existingDataPreserved, true);
});
for (const [name, change] of [
  ["data", (m) => (m.state.data = "changed")],
  ["sequence", (m) => (m.state.seq = "109")],
  ["historical ledger", (m) => (m.state.rows[0].id = 123)],
  ["post-ledger", (m) => m.state.rows.pop()],
  ["populated taxonomy", (m) => (m.state.populated = true)],
  ["unsafe privilege", (m) => (m.state.grants[0].delete = true)],
])
  test(name + " mismatch rolls back instead of committing", async () => {
    const m = mock();
    await assert.rejects(
      () =>
        executeUpgrade(m.client, config, manifest, snapshots, {
          migrate: async (bound) => {
            await m.apply(bound);
            change(m);
          },
        }),
      LocalRuntimeError,
    );
    assert.equal(m.calls.at(-1), "ROLLBACK");
    assert(!m.calls.includes("COMMIT"));
    assert.equal(m.state.rows.length, 5);
  });
test("migrator failure rolls back, with no automatic retry", async () => {
  const m = mock();
  let attempts = 0;
  await assert.rejects(() =>
    executeUpgrade(m.client, config, manifest, snapshots, {
      migrate: async () => {
        attempts++;
        throw Error("simulated SQLSTATE 23505");
      },
    }),
  );
  assert.equal(attempts, 1);
  assert.equal(m.calls.at(-1), "ROLLBACK");
});
test("missing privileges are reported without performing grants or aborting a valid schema upgrade", async () => {
  const m = mock();
  m.state.grants[0].insert = false;
  m.state.other.type_usage = false;
  const r = await executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply });
  assert.equal(r.runtimePrivileges.ready, false);
  assert.deepEqual(r.runtimePrivileges.missing, [
    "exam_blueprints:INSERT",
    "exam_blueprint_status:USAGE",
  ]);
  assert(!m.calls.some((s) => /GRANT|REVOKE/.test(s)));
});
test("runtime privileges require association DELETE and forbid other DELETE/TRUNCATE/sequence UPDATE", () => {
  assert.equal(assessTaxonomyPrivileges(permissions(), other).ready, true);
  for (const change of [
    (rows) => (rows[3].delete = false),
    (rows) => (rows[0].truncate = true),
    (rows) => (rows[0].references = true),
    (rows) => (rows[0].trigger = true),
  ]) {
    const rows = permissions();
    change(rows);
    assert.equal(assessTaxonomyPrivileges(rows, other).ready, false);
  }
  assert.equal(
    assessTaxonomyPrivileges(permissions(), { ...other, code_update: true }).ready,
    false,
  );
});
test("transaction adapter refuses unexpected boundaries and never forwards a nested COMMIT", async () => {
  const calls = [],
    bound = migratorClient({ query: async (sql) => calls.push(sql) });
  await assert.rejects(() => bound.query("commit"), LocalRuntimeError);
  await bound.query({ text: "begin" });
  await assert.rejects(() => bound.query("begin"), LocalRuntimeError);
  await bound.query("rollback");
  assert.deepEqual(calls, [
    "SAVEPOINT ccna_upgrade_migrator",
    "ROLLBACK TO SAVEPOINT ccna_upgrade_migrator",
  ]);
});
test("original taxonomy-only upgrade refuses the new seven-file chain before invoking any migrator", async () => {
  const m = mock();
  let called=false;
  await assert.rejects(()=>executeUpgrade(m.client,config,migrationManifest(root),snapshots,{migrate:async()=>{called=true;}}),LocalRuntimeError);
  assert.equal(called,false);assert.equal(m.state.rows.length,5);
  assert(!m.calls.some(s=>s.startsWith('SAVEPOINT')));
  assert.equal(m.calls.at(-1),'ROLLBACK');
});
test("an already upgraded database is refused without rerunning the migrator", async () => {
  const m = mock();
  await m.apply(migratorClient(m.client));
  let called = false;
  await assert.rejects(
    () =>
      executeUpgrade(m.client, config, manifest, snapshots, {
        migrate: async () => {
          called = true;
        },
      }),
    LocalRuntimeError,
  );
  assert.equal(called, false);
  assert.equal(m.state.rows.length, 6);
  assert.equal(m.calls.at(-1), "ROLLBACK");
});
test("table-lock timeout rolls back without invoking migrations", async () => {
  const m = mock(),
    query = m.client.query;
  let called = false;
  m.client.query = async (q, p) => {
    if (typeof q === "string" && q.startsWith("LOCK TABLE"))
      throw Object.assign(Error("offline lock timeout"), { code: "55P03" });
    return query(q, p);
  };
  await assert.rejects(
    () =>
      executeUpgrade(m.client, config, manifest, snapshots, {
        migrate: async () => {
          called = true;
        },
      }),
    { code: "55P03" },
  );
  assert.equal(called, false);
  assert.equal(m.calls.at(-1), "ROLLBACK");
});
test("new internal FK triggers do not invalidate preservation of existing user triggers", async () => {
  const m = mock();
  await executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply });
  const queries = m.calls.filter((s) => s.includes("pg_get_triggerdef"));
  assert.equal(queries.length, 2);
  assert(queries.every((s) => s.includes("NOT t.tgisinternal")));
});
test("narrow grant script pins the actual six raw Drizzle ledger hashes, not normalized source hashes", () => {
  const sql = readFileSync(
    path.join(root, "tools/phase6a-local/07-grant-taxonomy-runtime.sql"),
    "utf8",
  );
  const entries = [...sql.matchAll(/\('([a-f0-9]{64})',(\d+)::bigint\)/g)].map((m) => ({
    hash: m[1],
    when: Number(m[2]),
  }));
  assert.deepEqual(
    entries,
    manifest.map((m) => ({ hash: m.hash, when: m.when })),
  );
  assert(sql.includes(policy.upgradeSystemIdentifier));
  assert(sql.includes("session_user <> 'postgres'"));
  assert(sql.includes("host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'"));
  const grants = sql.match(/^GRANT [^;]+;/gm);
  assert.equal(grants.length, 4);
  assert(grants.every((s) => !s.includes("ALL ") && !s.includes("WITH GRANT OPTION")));
  assert(!sql.match(/^(?:CREATE|ALTER|REVOKE|DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/m));
});
test("PowerShell gate includes separate upgrade modes and pinned identifier before credential prompts", () => {
  const ps = readFileSync(path.join(root, "tools/phase6a-local/invoke.ps1"), "utf8");
  for (const mode of ["upgrade", "upgrade-check", "upgrade-verify"])
    assert(ps.includes("'" + mode + "'"));
  assert(ps.indexOf(policy.upgradeSystemIdentifier) < ps.indexOf("Read-PrivateValue"));
  assert(ps.includes("$Mode -in @('migrate','upgrade') -and !$Apply"));
});
test("PostgreSQL 18 NOT NULL catalog entries are validated through column nullability", async () => {
  const m = mock();
  m.state.notNullConstraints = [
    {
      table: "questions",
      name: "questions_id_not_null",
      kind: "n",
      columns: ["id"],
      valid: true,
      enforced: true,
      deferrable: false,
      deferred: false,
    },
  ];
  await executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply });
  assert.equal(m.calls.at(-1), "COMMIT");
});
test("NOT NULL catalog entry targeting a nullable column is refused", async () => {
  const m = mock();
  m.state.notNullConstraints = [
    {
      table: "questions",
      name: "unexpected",
      kind: "n",
      columns: ["image_key"],
      valid: true,
      enforced: true,
      deferrable: false,
      deferred: false,
    },
  ];
  await assert.rejects(
    () => executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply }),
    LocalRuntimeError,
  );
  assert.equal(m.calls.at(-1), "ROLLBACK");
});
test("PostgreSQL 18 NOT ENFORCED constraints are refused before migrations", async () => {
  const m = mock();
  m.state.enforced = false;
  let called = false;
  await assert.rejects(
    () =>
      executeUpgrade(m.client, config, manifest, snapshots, {
        migrate: async () => {
          called = true;
        },
      }),
    LocalRuntimeError,
  );
  assert.equal(called, false);
  assert.equal(m.calls.at(-1), "ROLLBACK");
});

const validNotNull = () => ({
  table: "questions",
  name: "questions_id_not_null",
  kind: "n",
  columns: ["id"],
  valid: true,
  enforced: true,
  deferrable: false,
  deferred: false,
});
test("installed pg decoder leaves name[] as a string and decodes text[] as an array", () => {
  const require = createRequire(path.join(root, "lib/db/package.json"));
  const { types } = require("pg");
  assert.equal(types.getTypeParser(1003, "text")("{id}"), "{id}");
  assert.deepEqual(types.getTypeParser(1009, "text")("{id}"), ["id"]);
});
test("catalog queries round-trip through installed pg array decoders for NOT NULL, PK, FK, indexes and enums", async () => {
  const require = createRequire(path.join(root, "lib/db/package.json"));
  const { types } = require("pg"),
    m = mock(),
    query = m.client.query;
  m.state.notNullConstraints = [validNotNull()];
  const decode = (values, cast) =>
    types.getTypeParser(
      cast ? 1009 : 1003,
      "text",
    )(
      "{" +
        values.map((v) => '"' + v.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"').join(",") +
        "}",
    );
  m.client.query = async (q, params) => {
    const text = typeof q === "string" ? q : q.text,
      result = await query(q, params);
    if (text.startsWith("SELECT t.relname AS table,c.conname"))
      return {
        rows: result.rows.map((r) => ({
          ...r,
          columns: decode(r.columns ?? [], text.includes("a.attname::text FROM unnest(c.conkey)")),
          targetColumns: decode(
            r.targetColumns ?? [],
            text.includes("a.attname::text FROM unnest(c.confkey)"),
          ),
        })),
      };
    if (text.startsWith("SELECT t.relname AS table,i.relname"))
      return {
        rows: result.rows.map((r) => ({
          ...r,
          columns: decode(r.columns, text.includes("a.attname::text FROM unnest(x.indkey")),
        })),
      };
    if (text.startsWith("SELECT t.typname"))
      return {
        rows: result.rows.map((r) => ({
          ...r,
          values: decode(r.values, text.includes("array_agg(e.enumlabel::text")),
        })),
      };
    return result;
  };
  const result = await executeUpgrade(m.client, config, manifest, snapshots, { migrate: m.apply });
  assert.equal(result.committed, true);
  assert.equal(m.calls.at(-1), "COMMIT");
});
for (const [name, columns, invariant] of [
  ["undecoded name array", "{id}", "CONSTRAINT_COLUMNS_NOT_ARRAY"],
  ["empty binding", [], "NOT_NULL_SINGLE_COLUMN_REQUIRED"],
  ["multi-column binding", ["id", "text"], "NOT_NULL_SINGLE_COLUMN_REQUIRED"],
  ["missing column", ["unknown_column"], "NOT_NULL_COLUMN_NOT_FOUND"],
  ["nullable column", ["image_key"], "NOT_NULL_ATTNOTNULL_REQUIRED"],
])
  test("NOT NULL refuses " + name + " with a sanitized invariant diagnostic", async () => {
    const m = mock();
    m.state.notNullConstraints = [{ ...validNotNull(), columns }];
    await assert.rejects(
      () => readSchemaCatalog(m.client),
      (error) => {
        assert.equal(error.code, "UPGRADE_CATALOG_BINDING");
        assert(safeError(error).includes(invariant));
        assert(safeError(error).includes("table=public.questions"));
        assert(safeError(error).includes("constraint=questions_id_not_null"));
        assert(!safeError(error).includes("{id}"));
        return true;
      },
    );
  });
test("constraint diagnostics never emit raw array payloads, URLs or unsafe metadata identifiers", async () => {
  const m = mock(),
    sensitive = "postgresql://operator:fixture-secret@remote.invalid/db";
  m.state.notNullConstraints = [
    { ...validNotNull(), table: sensitive, name: sensitive, columns: [sensitive] },
  ];
  await assert.rejects(
    () => readSchemaCatalog(m.client),
    (error) => {
      const message = safeError(error);
      assert(message.includes("NOT_NULL_COLUMN_NOT_FOUND"));
      assert(message.includes("<invalid-identifier>"));
      assert(!message.includes("fixture-secret"));
      assert(!message.includes("postgresql:"));
      assert(!message.includes("remote.invalid"));
      return true;
    },
  );
});
