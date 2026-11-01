// Inert source/catalog/least-privilege validators. No connections on import.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
export const lessonMigration = Object.freeze([
  "0013_learning_lessons",
  1793059200000,
  "e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3",
]);
export const isLessonChain = (manifest) =>
  manifest.length === 13 && manifest.at(-1).tag === lessonMigration[0];
export function assertLessonSource(root) {
  for (const [file, hash] of [
    ["meta/0013_snapshot.json", "2095073547386f2a2fd1e873dfff9b4033c3a0f08012786227036b4988988827"],
    ["meta/0013_journal.json", "e249136731f65881dcc6c0a9991a3a8dbb0baaef5d90f3784b5ca727df14521a"],
  ])
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(root, "lib/db/drizzle/proposed", file)))
        .digest("hex"),
      hash,
      "Lesson metadata drift",
    );
  const sql = readFileSync(path.join(root, "lib/db/drizzle/proposed/0013_learning_lessons.sql"));
  assert.equal(
    createHash("sha256").update(sql).digest("hex"),
    lessonMigration[2],
    "Lesson SQL drift",
  );
  const journal = JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0013_journal.json"), "utf8"),
  );
  assert.deepEqual(journal.entries.at(-1), {
    idx: 12,
    version: "7",
    when: lessonMigration[1],
    tag: lessonMigration[0],
    breakpoints: true,
  });
  assert.equal(journal.entries.length, 13);
  assert(
    !journal.entries.some((e) => e.tag === "0012_exam_simulator"),
    "Unrelated exam migration is forbidden",
  );
  const base = JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/meta/0011_snapshot.json"), "utf8"),
  );
  const next = lessonSnapshot(root);
  assert.equal(next.prevId, base.id);
  const previous = {
    ...next,
    tables: Object.fromEntries(
      Object.entries(next.tables).filter(
        ([name]) => !["public.lessons", "public.lesson_revisions"].includes(name),
      ),
    ),
  };
  assert.deepEqual(
    { ...previous, id: base.id, prevId: base.prevId },
    base,
    "Existing snapshot metadata changed",
  );
  for (const name of ["public.lessons", "public.lesson_revisions"]) assert(next.tables[name]);
}
export function lessonSnapshot(root) {
  return JSON.parse(
    readFileSync(path.join(root, "lib/db/drizzle/proposed/meta/0013_snapshot.json"), "utf8"),
  );
}
export async function assertLessonPrivileges(client, role = "ccna_phase6a_app") {
  const rows = (
    await client.query(
      `SELECT v.name,
    has_table_privilege($1,v.name,'SELECT') AS select,
    has_table_privilege($1,v.name,'INSERT') AS insert,
    CASE WHEN v.name='public.lessons' THEN has_table_privilege($1,v.name,'UPDATE')
      ELSE has_any_column_privilege($1,v.name,'UPDATE') END AS update,
    has_table_privilege($1,v.name,'DELETE') AS delete,
    has_table_privilege($1,v.name,'TRUNCATE') AS truncate,
    has_any_column_privilege($1,v.name,'REFERENCES') AS references,
    has_table_privilege($1,v.name,'TRIGGER') AS trigger,
    has_table_privilege($1,v.name,'MAINTAIN') AS maintain
    FROM (VALUES('public.lessons'),('public.lesson_revisions')) v(name) ORDER BY v.name`,
      [role],
    )
  ).rows;
  assert.deepEqual(
    rows,
    [
      {
        name: "public.lesson_revisions",
        select: true,
        insert: true,
        update: false,
        delete: false,
        truncate: false,
        references: false,
        trigger: false,
        maintain: false,
      },
      {
        name: "public.lessons",
        select: true,
        insert: true,
        update: true,
        delete: false,
        truncate: false,
        references: false,
        trigger: false,
        maintain: false,
      },
    ],
    "Lesson runtime privileges differ from the exact policy",
  );
}
export async function assertLessonRevisionGuard(client, root, owner = "ccna_phase6a_migrator") {
  const functionRow = (
    await client.query(`SELECT p.prosrc,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,
    l.lanname AS language,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS extra_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname='reject_lesson_revision_mutation' AND p.pronargs=0`)
  ).rows;
  assert.equal(functionRow.length, 1);
  const expected = readFileSync(
    path.join(root, "lib/db/drizzle/proposed/0013_learning_lessons.sql"),
    "utf8",
  ).match(/AS \$\$([\s\S]*?)\$\$/)?.[1];
  const f = functionRow[0];
  assert.equal(f.prosrc.trim(), expected.trim());
  assert.equal(f.owner, owner);
  assert.equal(f.prosecdef, false);
  assert.deepEqual(f.proconfig, ["search_path=pg_catalog"]);
  assert.equal(f.language, "plpgsql");
  assert.equal(f.extra_acl, false);
  const triggers = (
    await client.query(`SELECT t.tgname AS name,t.tgenabled AS enabled,t.tgtype AS kind,p.proname AS function
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.lesson_revisions'::regclass AND NOT t.tgisinternal`)
  ).rows;
  assert.deepEqual(triggers, [
    {
      name: "lesson_revisions_immutable",
      enabled: "O",
      kind: 27,
      function: "reject_lesson_revision_mutation",
    },
  ]);
}
