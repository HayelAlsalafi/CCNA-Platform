// Inert source/catalog validators; no connection or credential handling.
import { readFileSync,existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
export const nexusMigration = Object.freeze([
  "0007_nexus_sessions",
  1792022400000,
  "b2578800031d07e81297591577b862cfe3952a0955cfc8f1af204637be088b40",
]);
export const nexusTables = Object.freeze(["learning_sessions", "learning_session_items"]);
const snapshotHash = "4bd1841a43a2cda70cf93c0c2b59ee1912985943697f2cf789221a77187be173";
const fail = (message) => {
  throw Error("Nexus invariant: " + message);
};
export function nexusSnapshot(root) {
  const bytes = readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0007_snapshot.json"));
  if (createHash("sha256").update(bytes).digest("hex") !== snapshotHash)
    fail("reviewed snapshot changed");
  const official=path.join(root,'lib/db/drizzle/meta/0007_snapshot.json');
  if(existsSync(official)&&!readFileSync(official).equals(bytes))fail('official snapshot differs from reviewed proposal');
  return JSON.parse(bytes);
}
export function assertNexusSource(root) {
  const source = readFileSync(path.join(root, "lib/db/drizzle/proposed/0007_nexus_sessions.sql"));
  if (createHash("sha256").update(source).digest("hex") !== nexusMigration[2])
    fail("reviewed SQL changed");
  nexusSnapshot(root);
  return source.toString("utf8");
}
export async function assertNexusFunction(client, root, owner) {
  const source = assertNexusSource(root),
    body = source.match(/AS \$\$([\s\S]*?)\$\$;/)?.[1];
  const row = (
    await client.query(
      `SELECT p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,pg_get_userbyid(p.proowner) AS owner,p.prorettype::regtype::text AS result,p.pronargs AS arguments,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='nexus_guard_deferred_attempt'`,
    )
  ).rows;
  if (
    row.length !== 1 ||
    row[0].body !== body ||
    row[0].definer !== false ||
    row[0].owner !== owner ||
    row[0].result !== "trigger" ||
    row[0].arguments !== 0 ||
    row[0].public_execute !== false ||
    JSON.stringify(row[0].config) !== JSON.stringify(["search_path=pg_catalog, public"])
  )
    fail("deferred-grading function differs from reviewed definition");
  const trigger = (
    await client.query(
      `SELECT t.tgname,t.tgenabled,t.tgtype,p.proname,t.tgqual IS NULL AS no_condition,t.tgnargs,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgname='nexus_deferred_grading' AND c.relnamespace='public'::regnamespace`,
    )
  ).rows;
  if (
    trigger.length !== 1 ||
    JSON.stringify(trigger[0]) !==
      JSON.stringify({
        tgname: "nexus_deferred_grading",
        tgenabled: "O",
        tgtype: 7,
        proname: "nexus_guard_deferred_attempt",
        no_condition: true,
        tgnargs: 0,
        relname: "practice_attempts",
      })
  )
    fail("deferred-grading trigger differs from reviewed binding");
}
export async function assertNexusPrivileges(client) {
  const exists = (
    await client.query(
      "SELECT to_regclass('public.learning_sessions') IS NOT NULL AS sessions,to_regclass('public.learning_session_items') IS NOT NULL AS items",
    )
  ).rows[0];
  if (exists.sessions !== exists.items) fail("partial session schema");
  if (!exists.sessions) return { installed: false };
  const columns = (
    await client.query(
      `SELECT c.relname AS table,a.attname AS column,has_column_privilege('ccna_phase6a_app',c.oid,a.attnum,'UPDATE') AS update,has_table_privilege('ccna_phase6a_app',c.oid,'SELECT') AS select,has_table_privilege('ccna_phase6a_app',c.oid,'INSERT') AS insert,has_table_privilege('ccna_phase6a_app',c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS unsafe FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,
      [nexusTables],
    )
  ).rows;
  if (!columns.length) fail("missing privilege evidence");
  for (const c of columns) {
    const allowed = (
      c.table === "learning_sessions"
        ? ["status", "completed_at"]
        : ["selected_option_key", "flagged"]
    ).includes(c.column);
    if (c.select !== true || c.insert !== true || c.unsafe !== false || c.update !== allowed)
      fail("runtime privileges differ at " + c.table + "." + c.column);
  }
  return { installed: true, ready: true };
}
