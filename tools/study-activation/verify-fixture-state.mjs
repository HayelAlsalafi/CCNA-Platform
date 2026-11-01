// SELECT-only provenance recovery after the isolated test-role omission.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  withPrivateTarget,
  privateConnection,
  isolated,
  assertPrivateIdentity,
  backupRelative,
  bin,
} from "./isolated-policy.mjs";
import { decodeArchiveTables } from "../phase8a-cleanup/final-planner.mjs";
import { rowProof } from "../question-bank-upgrade-core.mjs";
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
  const c = new Client(privateConnection(isolated.database));
  c.on("error", () => {});
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL TIME ZONE 'UTC'");
    await assertPrivateIdentity(c, isolated.database, state.data);
    await assertStudyRuntimeCatalog(c, root, isolated.owner);
    const decoded = decodeArchiveTables(
      execFileSync(
        bin + "pg_restore.exe",
        [
          "--data-only",
          "--schema=public",
          "--no-owner",
          "--no-privileges",
          "--file=-",
          receipt.backup.path,
        ],
        {
          env: state.env,
          encoding: "utf8",
          timeout: 120000,
          maxBuffer: 64 * 1024 * 1024,
          windowsHide: true,
        },
      ),
    );
    const fresh = {};
    for (const table of ["users", "lessons", "lesson_revisions"]) {
      const ids = decoded[table].map((r) => r.id);
      fresh[table] = (
        await c.query(`SELECT * FROM public.${table} WHERE id<>ALL($1::uuid[]) ORDER BY id`, [ids])
      ).rows;
    }
    assert.equal(fresh.users.length, 3);
    assert.equal(fresh.lessons.length, 1);
    assert.equal(fresh.lesson_revisions.length, 1);
    const admin = fresh.users.filter((u) => u.role === "ADMIN"),
      learners = fresh.users.filter((u) => u.role === "USER");
    assert.equal(admin.length, 1);
    assert.equal(learners.length, 2);
    for (const u of fresh.users) {
      assert.equal(u.clerk_user_id, "isolated-study-" + u.id);
      assert.equal(u.email, u.id + "@example.invalid");
      assert.equal(u.display_name, "Isolated study fixture");
      assert.equal(u.status, "ACTIVE");
      assert.equal(u.last_login_at, null);
    }
    const l = fresh.lessons[0],
      r = fresh.lesson_revisions[0],
      blockId = l.blocks[0].id;
    const input = {
      chapterId: l.chapter_id,
      title: "Isolated migration 0014 fixture",
      description: "Disposable verification only",
      objectives: ["Verify private study persistence"],
      estimatedMinutes: 2,
      displayOrder: 999999,
      blocks: [
        {
          id: blockId,
          type: "paragraph",
          text: "TCP provides reliable delivery. UDP provides datagrams.",
        },
      ],
    };
    for (const [name, value] of Object.entries({
      title: input.title,
      description: input.description,
      objectives: input.objectives,
      estimated_minutes: 2,
      display_order: 999999,
      blocks: input.blocks,
      created_by: admin[0].id,
      updated_by: admin[0].id,
      version: 2,
      published_revision_id: r.id,
    }))
      assert.deepEqual(l[name], value);
    assert.equal(r.lesson_id, l.id);
    assert.equal(r.created_by, admin[0].id);
    assert.equal(r.revision_number, 1);
    assert.deepEqual(r.snapshot, input);
    const excluded = Object.fromEntries(
      Object.entries(fresh).map(([table, rows]) => [table, rows.map((r) => r.id)]),
    );
    const originalRows = {
      query: (q, p) => {
        const m = q.match(/FROM public\."([a-z_]+)" t$/);
        return m && excluded[m[1]]
          ? c.query(q + " WHERE t.id<>ALL($1::uuid[])", [excluded[m[1]]])
          : c.query(q, p);
      },
    };
    assert.deepEqual(await rowProof(originalRows, Object.keys(receipt.rowProof)), receipt.rowProof);
    for (const table of ["lesson_annotations", "lesson_progress", "lesson_media"])
      assert.equal((await c.query(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0].n, 0);
    const privileges = (
      await c.query(
        "SELECT has_table_privilege('pg_read_all_settings','public.lessons','SELECT') AS select,has_table_privilege('pg_read_all_settings','public.lessons','UPDATE') AS update",
      )
    ).rows[0];
    assert.deepEqual(privileges, { select: true, update: false });
    const evidence = {
      database: isolated.database,
      port: 55440,
      databaseWrites: 0,
      allOriginalRowsMatched: true,
      studyTablesEmpty: true,
      fixtureUsersVerified: 3,
      fixtureLessonsVerified: 1,
      fixtureRevisionsVerified: 1,
      actor: admin[0].id,
      a: learners[0].id,
      b: learners[1].id,
      blockId,
      input,
      lessonId: l.id,
      revisionId: r.id,
      lessonVersion: 2,
      excluded,
      missingTestLessonUpdateConfirmed: true,
    };
    writeFileSync(
      path.join(folder, "fixture-state.json"),
      JSON.stringify(evidence, null, 2) + "\n",
      { flag: "wx" },
    );
    console.log(
      JSON.stringify({
        databaseWrites: 0,
        allOriginalRowsMatched: true,
        studyTablesEmpty: true,
        fixtureUsersVerified: 3,
        fixtureLessonsVerified: 1,
        fixtureRevisionsVerified: 1,
        missingTestLessonUpdateConfirmed: true,
        report: path.join(folder, "fixture-state.json"),
      }),
    );
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end().catch(() => {});
  }
});
