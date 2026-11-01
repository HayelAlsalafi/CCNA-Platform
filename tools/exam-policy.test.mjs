import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertExamSource, examSnapshot, examMigration } from "./exam-policy.mjs";
import { migrationManifest } from "./phase6a-local/policy.mjs";
const root = process.cwd(),
  proposal = readFileSync("lib/db/drizzle/proposed/0012_exam_simulator.sql", "utf8");
test("pins exact exam proposal while leaving official migration chain at twelve", () => {
  assertExamSource(root);
  assert.equal(migrationManifest(root).length, 12);
  const j = JSON.parse(readFileSync("lib/db/drizzle/proposed/meta/0012_journal.json", "utf8"));
  assert.deepEqual(
    j.entries.slice(0, 12),
    JSON.parse(readFileSync("lib/db/drizzle/meta/_journal.json", "utf8")).entries,
  );
  assert.equal(j.entries[12].tag, examMigration[0]);
});
test("proposed snapshot adds only two exam tables and does not alter existing schema", () => {
  const next = examSnapshot(root),
    old = JSON.parse(readFileSync("lib/db/drizzle/meta/0011_snapshot.json", "utf8"));
  delete next.tables["public.exam_sessions"];
  delete next.tables["public.exam_session_items"];
  next.id = old.id;
  next.prevId = old.prevId;
  assert.deepEqual(next, old);
});
test("proposal keeps exact RESTRICT FKs and database guards without reset or disabled integrity", () => {
  assert(!proposal.includes("\uFEFF"));
  assert(!/\b(DROP TABLE|TRUNCATE|DISABLE TRIGGER|session_replication_role)\b/i.test(proposal));
  assert(proposal.includes("ON DELETE restrict"));
  assert(proposal.includes("CREATE TRIGGER exam_items_guard"));
  assert(proposal.includes("clock_timestamp()>=s.deadline_at"));
  assert(proposal.includes("OLD.status<>'ACTIVE'"));
  assert(
    proposal.includes("REVOKE ALL ON public.exam_sessions,public.exam_session_items FROM PUBLIC"),
  );
});
test("exam-only deliveries and deletion recovery preserve existing Practice and shared exams", () => {
  const next = examSnapshot(root);
  const fk = Object.values(next.tables["public.exam_session_items"].foreignKeys);
  assert(fk.some((f) => f.tableTo === "question_revisions"));
  assert(!fk.some((f) => f.tableTo === "practice_deliveries"));
  assert(proposal.includes("question_history_confirmation_required"));
  assert(proposal.includes("'examItems'"));
  assert(proposal.includes("public.execute_question_deletion_pre_exam"));
  assert(!/DELETE FROM public\.exam_sessions/i.test(proposal));
});
function sourceFixture() {
  const folder = path.join(root, ".local/exam-source-tests");
  mkdirSync(folder, { recursive: true });
  const target = mkdtempSync(path.join(folder, "fixture-"));
  for (const f of [
    "lib/db/drizzle",
    "tools/canonical-chapters-original-approval.json",
    "tools/canonical-chapters-plan.json",
    "lib/ccna-book-chapters.ts",
    "lib/canonical-chapters.json",
  ]) {
    const dst = path.join(target, f);
    mkdirSync(path.dirname(dst), { recursive: true });
    cpSync(path.join(root, f), dst, { recursive: true });
  }
  return target;
}
test("future thirteen-file source chain is accepted only when every pinned file and metadata entry match", () => {
  const target = sourceFixture();
  for (const f of ["0012_exam_simulator.sql", "meta/0012_snapshot.json"])
    cpSync(path.join(target, "lib/db/drizzle/proposed", f), path.join(target, "lib/db/drizzle", f));
  cpSync(
    path.join(target, "lib/db/drizzle/proposed/meta/0012_journal.json"),
    path.join(target, "lib/db/drizzle/meta/_journal.json"),
  );
  assert.equal(migrationManifest(target).length, 13);
  writeFileSync(path.join(target, "lib/db/drizzle/0012_exam_simulator.sql"), "UNREVIEWED");
  assert.throws(() => migrationManifest(target));
});

test('unexecuted grant proposal has exact duplicate-sensitive ledger equality and only the reviewed permissions',()=>{
 const text=readFileSync('tools/exam-runtime-grants.sql','utf8');
 assert.equal((text.match(/EXCEPT ALL/g)||[]).length,2);assert(text.includes('count(*) FROM drizzle.__drizzle_migrations)<>13'));
 assert(text.includes(examMigration[2]));assert(text.includes('7694701597474139084'));
 const grants=text.split(/\r?\n/).filter(line=>line.startsWith('GRANT '));
 assert.deepEqual(grants,[
 'GRANT SELECT,INSERT ON public.exam_sessions,public.exam_session_items TO ccna_phase6a_app;',
 'GRANT UPDATE(status,finalized_at,result) ON public.exam_sessions TO ccna_phase6a_app;',
 'GRANT UPDATE(selected_keys,flagged,answer_version,graded_result) ON public.exam_session_items TO ccna_phase6a_app;']);
 assert(!/ALTER ROLE|CREATE ROLE|GRANT .*DELETE|GRANT .*TRUNCATE/.test(text));
});

test('exam runtime preflight refuses broad DELETE/UPDATE grants before reading any answers',async()=>{
 const {assertExamPrivileges}=await import('./exam-policy.mjs');let calls=0;
 await assert.rejects(assertExamPrivileges({query:async()=>{calls++;return {rows:[{select:true,insert:true,unsafe:true,public_access:false}]};}}),/grant mismatch/);
 assert.equal(calls,1);
});
test('exam runtime preflight refuses PUBLIC table access',async()=>{
 const {assertExamPrivileges}=await import('./exam-policy.mjs');
 await assert.rejects(assertExamPrivileges({query:async()=>({rows:[{select:true,insert:true,unsafe:false,public_access:true}]})}),/grant mismatch/);
});
test('exam runtime preflight refuses another role without issuing a catalog query',async()=>{
 const {assertExamPrivileges}=await import('./exam-policy.mjs');let called=false;
 await assert.rejects(assertExamPrivileges({query:async()=>{called=true;}},'postgres'),/reviewed exam runtime role/);assert.equal(called,false);
});
