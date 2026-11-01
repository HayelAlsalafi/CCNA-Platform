import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertExecutionIntent, promotionFiles, promoteSource, verifyRehearsal, rehearsalRelative } from "./activation.mjs";
import {
  assertLessonSource,
  assertLessonPrivileges,
  isLessonChain,
  lessonMigration,
} from "./policy.mjs";
import { preparedPlan, backupReceipt } from "./staging.mjs";
import { transactionClient } from "./transaction-client.mjs";
test("lesson-only metadata preserves the twelve existing entries and excludes exam", () => {
  assertLessonSource(process.cwd());
  const plan = preparedPlan(process.cwd());
  assert.equal(plan.manifest.length, 13);
  assert.equal(isLessonChain(plan.manifest), true);
  assert.equal(plan.manifest.at(-1).hash, lessonMigration[2]);
  assert(!plan.manifest.some((m) => m.tag === "0012_exam_simulator"));
  assert.equal(
    isLessonChain([...plan.manifest.slice(0, 12), { tag: "0012_exam_simulator" }]),
    false,
  );
});
test("activation refuses absent, partial or extra authorization before input or connection", () => {
  for (const args of [[], ["--apply"], ["--apply", "--confirm-reviewed-lessons", "--reset"]]) {
    assert.throws(() => assertExecutionIntent(args));
    const result = spawnSync(process.execPath, ["tools/lesson-activation/apply.mjs", ...args], {
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).stage, "explicit-approval-gates");
  }
});
test("actual Drizzle/service BEGIN variants map to savepoints without outer COMMIT", async () => {
  const queries = [],
    client = transactionClient({
      query: async (q, p) => {
        queries.push(q);
        return { rows: [] };
      },
    });
  for (const begin of [
    "begin",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "begin isolation level read committed read write",
  ]) {
    await client.query(begin);
    assert.throws(() => client.query("begin"), /nested/);
    await client.query("commit");
  }
  await client.query("begin");
  await client.query("rollback");
  assert(!queries.some((q) => /^(begin|commit|rollback)$/i.test(q)));
  assert.throws(() => client.query("commit"), /Unexpected/);
  const query = { text: "SELECT $1", values: [1] };
  await client.query(query);
  assert.equal(queries.at(-1), query);
});
test("runtime least-privilege policy rejects extra revision UPDATE and lesson DELETE", async () => {
  const rows = [
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
  ];
  await assertLessonPrivileges({ query: async () => ({ rows }) });
  for (const [i, key] of [
    [0, "update"],
    [1, "delete"],
    [1, "truncate"],
    [0, "maintain"],
    [0, "references"],
  ]) {
    const changed = structuredClone(rows);
    changed[i][key] = true;
    await assert.rejects(
      assertLessonPrivileges({ query: async () => ({ rows: changed }) }),
      /privileges/,
    );
  }
});
test("source promotion appends reviewed files and refuses overwrite or journal drift", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ccna-lesson-promotion-")),
    base = path.join(root, "lib/db/drizzle");
  try {
    mkdirSync(path.join(base, "proposed/meta"), { recursive: true });
    mkdirSync(path.join(base, "meta"));
    for (const [file, content] of [
      ["meta/_journal.json", "baseline"],
      ["proposed/0013_learning_lessons.sql", "sql"],
      ["proposed/meta/0013_snapshot.json", "snapshot"],
      ["proposed/meta/0013_journal.json", "new journal"],
    ])
      writeFileSync(path.join(base, file), content);
    const expected = promotionFiles(root);
    writeFileSync(path.join(base, "meta/_journal.json"), "drift");
    assert.throws(() => promoteSource(root, expected), /changed/);
    writeFileSync(path.join(base, "meta/_journal.json"), "baseline");
    promoteSource(root, expected);
    assert.equal(readFileSync(path.join(base, "meta/_journal.json"), "utf8"), "new journal");
    assert.equal(readFileSync(path.join(base, "0013_learning_lessons.sql"), "utf8"), "sql");
    assert.throws(() => promotionFiles(root), /already exists/);
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("hidden credential launcher requires both approval flags and scrubbed stdin", () => {
  const script = readFileSync("tools/lesson-activation/apply-lessons.ps1", "utf8");
  assert.match(script, /!\$Apply -or !\$ConfirmReviewedLessons/);
  assert.match(script, /-AsSecureString/);
  assert.match(script, /EnvironmentVariables.Clear\(\)/);
  assert.match(script, /--apply --confirm-reviewed-lessons/);
  assert.doesNotMatch(script, /PGPASSWORD|DATABASE_URL|\.env/);
});
test('activation requires the exact successful rehearsal and matching backup',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'ccna-lesson-receipt-'));
 const file=path.join(folder,rehearsalRelative);mkdirSync(path.dirname(file));
 const receipt={stage:'complete',backupHash:backupReceipt.hash,database:'ccna_drizzle_check_20261012_c08f12ad34b6',port:55440,rolledBack:true,isolatedSequencesRestored:true,lessonOnly:true,applicationDatabaseConnections:0,applicationWrites:0,outcomes:Object.fromEntries(['freshBackupRestored','migrationFailureRollback','migratorAndRepeat','constraintsAndTrigger','draftAndVisibility','publicationSnapshots','rejectsInvalidDependencies','leastPrivilege','applicationRowsPreserved','rollbackVerified','hbaRestored'].map(key=>[key,true]))};
 try{
  writeFileSync(file,JSON.stringify(receipt));verifyRehearsal(folder);
  for(const [field,value]of [['backupHash','wrong'],['port',5432],['lessonOnly',false],['applicationWrites',1],['rolledBack',false]]){
   writeFileSync(file,JSON.stringify({...receipt,[field]:value}));assert.throws(()=>verifyRehearsal(folder));
  }
  writeFileSync(file,JSON.stringify({...receipt,outcomes:{...receipt.outcomes,migrationFailureRollback:false}}));assert.throws(()=>verifyRehearsal(folder));
 }finally{rmSync(folder,{recursive:true});}
});
