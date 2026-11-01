// Inert exact source/snapshot/privilege checks. No automatic database actions.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
export const examMigration = Object.freeze([
  "0012_exam_simulator",
  1792368000000,
  "a371c060f9d712c1ea00934f01d7ff2899af370c7ab216b009bdd0610c1291ea",
]);
const pins = {
  "lib/db/drizzle/proposed/0012_exam_simulator.sql":
    "a371c060f9d712c1ea00934f01d7ff2899af370c7ab216b009bdd0610c1291ea",
  "lib/db/drizzle/proposed/meta/0012_snapshot.json":
    "2c441a4e5417a2e51b6c0a2d4716bcdbcfc302a26f58b480615a2a1ce3f20d30",
  "lib/db/drizzle/proposed/meta/0012_journal.json":
    "5e7f8b8aebb65c8c538210c3bc42b58d6830c87207a6a6e52989118818e33fbc",
};
export function assertExamSource(root) {
  for (const [file, digest] of Object.entries(pins))
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(root, file)))
        .digest("hex"),
      digest,
      "Exam source drift: " + file,
    );
  for (const file of ["0012_exam_simulator.sql", "meta/0012_snapshot.json"]) {
    const official = path.join(root, "lib/db/drizzle", file);
    if (existsSync(official))
      assert(
        readFileSync(official).equals(
          readFileSync(path.join(root, "lib/db/drizzle/proposed", file)),
        ),
        "Promoted exam source differs",
      );
  }
}
export function examSnapshot(root) {
  assertExamSource(root);
  return JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0012_snapshot.json"), "utf8"),
  );
}
export async function assertExamPrivileges(client, role = "ccna_phase6a_app") {
  assert.equal(role,'ccna_phase6a_app','Only the reviewed exam runtime role is accepted');
  assertExamSource(process.cwd());
  const tables = ["exam_sessions", "exam_session_items"];
  const updates = {
    exam_sessions: ["status", "finalized_at", "result"],
    exam_session_items: ["selected_keys", "flagged", "answer_version", "graded_result"],
  };
  for (const table of tables) {
    const r = (
      await client.query(
        "SELECT has_table_privilege($1,c.oid,'SELECT') AS select,has_table_privilege($1,c.oid,'INSERT') AS insert,has_table_privilege($1,c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS unsafe,EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_access FROM pg_class c WHERE c.oid=to_regclass($2)",
        [role, "public." + table],
      )
    ).rows;
    assert.deepEqual(
      r,
      [{ select: true, insert: true, unsafe: false, public_access: false }],
      "Exam runtime table grant mismatch: " + table,
    );
    const cols = (
      await client.query(
        "SELECT a.attname AS name,has_column_privilege($1,a.attrelid,a.attnum,'UPDATE') AS update,has_column_privilege($1,a.attrelid,a.attnum,'REFERENCES') AS references,EXISTS(SELECT 1 FROM aclexplode(a.attacl) acl WHERE acl.grantee=0) AS public_access FROM pg_attribute a WHERE a.attrelid=to_regclass($2) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum",
        [role, "public." + table],
      )
    ).rows;
    assert(cols.length > 0);
    for (const c of cols) {
      assert.equal(
        c.update,
        updates[table].includes(c.name),
        "Unexpected exam column UPDATE: " + c.name,
      );
      assert.equal(c.references, false);
      assert.equal(c.public_access, false, "Public exam column privilege");
    }
  }
  const source = readFileSync(
    path.join(process.cwd(), "lib/db/drizzle/proposed/0012_exam_simulator.sql"),
    "utf8",
  );
  const body = [
    ...source.matchAll(/CREATE FUNCTION public\.guard_exam_state\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g),
  ][0]?.[1];
  assert(body);
  const rows = (
    await client.query(
      "SELECT prosrc AS body,prosecdef AS definer,proconfig AS config,pg_get_userbyid(proowner) AS owner,proargtypes::text AS arguments,prorettype::regtype::text AS result,has_function_privilege($1,oid,'EXECUTE') AS runtime_execute,EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='guard_exam_state'",
      [role],
    )
  ).rows;
  assert.deepEqual(
    rows,
    [
      {
        body,
        definer: false,
        config: ["search_path=pg_catalog"],
        owner: "ccna_phase6a_migrator",
        arguments: "",
        result: "trigger",
        runtime_execute: false,
        public_execute: false,
      },
    ],
    "Exam guard function drift",
  );
  const triggers = (
    await client.query(
      "SELECT c.relname AS table,t.tgname AS name,t.tgtype AS kind,t.tgenabled AS enabled,t.tgdeferrable AS deferrable,t.tginitdeferred AS deferred,t.tgnargs AS arguments,t.tgqual IS NULL AS unconditional,p.proname AS function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN ('public.exam_sessions'::regclass,'public.exam_session_items'::regclass) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    )
  ).rows;
  assert.deepEqual(
    triggers,
    [
      ["exam_session_items", "exam_items_guard"],
      ["exam_sessions", "exam_sessions_guard"],
    ].map(([table, name]) => ({
      table,
      name,
      kind: 23,
      enabled: "O",
      deferrable: false,
      deferred: false,
      arguments: 0,
      unconditional: true,
      function: "guard_exam_state",
    })),
    "Exam enforcement trigger drift",
  );
}
