import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertNexusSource, nexusSnapshot, assertNexusPrivileges } from "./nexus-policy.mjs";
const root = portableRoot,
  snapshot = nexusSnapshot(root);
const rows = () =>
  Object.values(snapshot.tables)
    .filter((t) => t.name.startsWith("learning_"))
    .flatMap((t) =>
      Object.values(t.columns).map((c) => ({
        table: t.name,
        column: c.name,
        select: true,
        insert: true,
        unsafe: false,
        update: (t.name === "learning_sessions"
          ? ["status", "completed_at"]
          : ["selected_option_key", "flagged"]
        ).includes(c.name),
      })),
    );
const client = (columns = rows(), exist = { sessions: true, items: true }) => ({
  query: async (sql) => ({ rows: sql.includes("to_regclass") ? [exist] : columns }),
});
test("pins proposed SQL and snapshot while retaining all historical tables", () => {
  assertNexusSource(root);
  const old = JSON.parse(readFileSync(root + "/lib/db/drizzle/meta/0006_snapshot.json", "utf8"));
  for (const [key, value] of Object.entries(old.tables))
    assert.deepEqual(snapshot.tables[key], value);
  assert.equal(Object.keys(snapshot.tables).length, 13);
  assert.equal(snapshot.prevId, old.id);
});
test("accepts only the exact new column-level update profile", async () => {
  assert.deepEqual(await assertNexusPrivileges(client()), { installed: true, ready: true });
});
test("retains an explicitly absent schema without requiring new grants", async () => {
  assert.deepEqual(await assertNexusPrivileges(client([], { sessions: false, items: false })), {
    installed: false,
  });
});
test("rejects a partially installed schema", async () => {
  await assert.rejects(
    assertNexusPrivileges(client([], { sessions: true, items: false })),
    /partial/,
  );
});
for (const field of ["select", "insert", "unsafe", "update"])
  test("rejects changed " + field + " privilege evidence", async () => {
    const r = rows();
    r[0][field] = !r[0][field];
    await assert.rejects(assertNexusPrivileges(client(r)), /runtime privileges/);
  });
test("rejects identity/history membership updates even while required columns work", async () => {
  const r = rows();
  const identity = r.find((c) => c.table === "learning_sessions" && c.column === "user_id");
  identity.update = true;
  await assert.rejects(assertNexusPrivileges(client(r)), /learning_sessions.user_id/);
});
test("rejects missing privilege evidence", async () => {
  await assert.rejects(assertNexusPrivileges(client([])), /missing privilege/);
});
test("upgrade has an explicit apply gate and no role reset or destructive statements", () => {
  const source = readFileSync(root + "/tools/execute-nexus-upgrade.mjs", "utf8");
  assert.match(source, /assert.equal\(process.argv\[2\],\s*["']--apply["']\)/);
  assert.match(source, /assertLedger\(beforeLedger,\s*manifest.slice\(0,\s*7\)\)/);
  assert.match(source, /assert.deepEqual\(await fingerprints\(\),\s*before\)/);
  assert.doesNotMatch(source, /DROP DATABASE|TRUNCATE|ALTER ROLE|RESET ROLE|DELETE FROM/);
});
