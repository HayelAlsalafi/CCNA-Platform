// Inert proposal/catalog validators. No connection is opened on import.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { assertNexusSource } from "./nexus-policy.mjs";
export const learningMigration = Object.freeze([
  "0008_learning_achievements",
  1792022401000,
  "b608cb80e72745c41904bdfa5292c74218b44f9a94c7d5975b3738e17a4010c4",
]);
const snapshotHash = "fe05a1bdc4a31e85f43aa2cccd0c5d48d5434d55baeaa140e6c3593a19434130";
const fail = (message) => {
  throw Error("Learning evidence invariant: " + message);
};
export function learningSnapshot(root) {
  const bytes = readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0008_snapshot.json"));
  if (createHash("sha256").update(bytes).digest("hex") !== snapshotHash) fail("snapshot changed");
  const official = path.join(root, "lib/db/drizzle/meta/0008_snapshot.json");
  if (existsSync(official) && !readFileSync(official).equals(bytes))
    fail("official snapshot differs from reviewed proposal");
  return JSON.parse(bytes);
}
export function assertLearningSource(root) {
  assertNexusSource(root);
  const bytes = readFileSync(
    path.join(root, "lib/db/drizzle/proposed/0008_learning_achievements.sql"),
  );
  if (createHash("sha256").update(bytes).digest("hex") !== learningMigration[2])
    fail("SQL changed");
  learningSnapshot(root);
  return bytes;
}
export function learningCatalog(root) {
  const source = assertLearningSource(root).toString("utf8");
  const rows = [...source.matchAll(/\('([^']+)','([^']+)','([^']+)','([^']+)','([^']+)'\)/g)]
    .map((m) => ({
      id: m[1],
      name: m[2],
      description: m[3],
      ruleKey: m[4],
      ruleVersion: 1,
      criteria: JSON.parse(m[5]),
      active: true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (rows.length !== 7) fail("catalog differs from reviewed seven rules");
  return rows;
}
export async function assertLearningPrivileges(client) {
  const r = (
    await client.query(
      "SELECT to_regclass('public.achievement_definitions') IS NOT NULL AS definitions,to_regclass('public.learner_achievements') IS NOT NULL AS awards",
    )
  ).rows[0];
  if (!r || r.definitions !== r.awards) fail("partial badge schema");
  if (!r.definitions) return { installed: false };
  const rows = (
    await client.query(
      `SELECT c.relname AS table,has_table_privilege('ccna_phase6a_app',c.oid,'SELECT') AS select,has_table_privilege('ccna_phase6a_app',c.oid,'INSERT') AS insert,has_table_privilege('ccna_phase6a_app',c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('ccna_phase6a_app',c.oid,'UPDATE,REFERENCES') OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS unsafe FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('achievement_definitions','learner_achievements') ORDER BY c.relname`,
    )
  ).rows;
  if (
    rows.length !== 2 ||
    JSON.stringify(rows.map((r) => r.table)) !==
      JSON.stringify(["achievement_definitions", "learner_achievements"])
  )
    fail("missing badge privilege evidence");
  for (const row of rows)
    if (
      row.select !== true ||
      row.unsafe !== false ||
      row.insert !== (row.table === "learner_achievements")
    )
      fail("badge privileges differ at " + row.table);
  return { installed: true, ready: true };
}
