/** Explicit opt-in LOCAL persistence tests. Never consume DATABASE_URL.
 * Writes only newly-created disposable fixtures; preserves their append-only
 * history and disables their catalog at teardown. No existing account touched. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray, sql } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import * as schema from "@workspace/db/schema";
vi.mock("@workspace/db", async () => ({ ...(await import("@workspace/db/schema")), db: undefined }));
const { createQuestion } = await import("./questions");
const { updateAdminQuestion, disableAdminQuestion } = await import("./questions-admin");
const { getPracticeQuestionForTopic, submitPracticeAnswer, getPracticeHistory } = await import("./practice");
const { getLearningProgress } = await import("./learning-progress");
const enabled = process.env["RUN_REVISION_DB_TESTS"] === "1";
const session = "sess_local_revision_test";
const identifier = process.env["REVISION_DB_CLUSTER_ID"] ?? "7694701597474139084";
const legacyBaseline = process.env["REVISION_LEGACY_BASELINE"] ?? path.resolve(process.cwd(), "../../.local/tests/phase6a5/backup-result.json");
const rootGuard = { database: "ccna_phase6a_dev", host: "127.0.0.1", port: 5432 };
let pool: Pool, appPool: Pool, db: ReturnType<typeof drizzle<typeof schema>>, app: typeof db;
let userId: string, otherUserId: string, topicId: string;
const questions: string[] = [];
const run = randomUUID();
const input = () => ({ topicId, text: "Disposable original content", type: "MULTIPLE_CHOICE_SINGLE", difficulty: "EASY",
  explanation: "Original explanation", referenceNotes: "Synthetic demo, not an exam question", imageKey: null,
  options: [{ optionKey: "A", text: "Original A", isCorrect: false }, { optionKey: "B", text: "Original B", isCorrect: true }] });
const edited = { text: "Disposable edited content", explanation: "New explanation", options: [{ optionKey: "A", text: "New A", isCorrect: true }, { optionKey: "B", text: "New B", isCorrect: false }] };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function fresh() {
  const q = await createQuestion(input(), app); questions.push(q.question.id);
  // A dedicated new topic per question keeps randomized delivery deterministic.
  const [t] = await app.insert(schema.topicsTable).values({ slug: "revision-q-" + randomUUID(), name: "Disposable revision test" }).returning();
  await updateAdminQuestion(q.question.id, { topicId: t!.id }, app);
  const delivery = await getPracticeQuestionForTopic(t!.id, app, userId, session);
  expect(delivery?.id).toBe(q.question.id);
  return delivery!;
}
async function answer(q: Awaited<ReturnType<typeof fresh>>, key: string, actor = userId, sessionId = session) {
  return submitPracticeAnswer(q.id, key, actor, app, q.deliveryId, sessionId);
}
async function assertRejected(statement: ReturnType<typeof sql>, code = "23514") {
  try { await db.execute(statement); throw Error("Statement unexpectedly succeeded"); }
  catch(error) { const e = error as { code?: string; cause?: { code?: string } }; expect(e.code ?? e.cause?.code).toBe(code); }
}

describe.skipIf(!enabled)("immutable revisions LOCAL PostgreSQL persistence", () => {
  beforeAll(async () => {
    if (!process.env["REVISION_DB_PASSWORD"] || !process.env["REVISION_APP_PASSWORD"]) throw Error("Private local credentials required");
    const cfg = { ...rootGuard, ssl: false, max: 6, connectionTimeoutMillis: 5000, options: "-c statement_timeout=10000 -c lock_timeout=5000" };
    pool = new Pool({ ...cfg, user: "ccna_phase6a_migrator", password: process.env["REVISION_DB_PASSWORD"] });
    appPool = new Pool({ ...cfg, user: "ccna_phase6a_app", password: process.env["REVISION_APP_PASSWORD"] });
    for (const [p, role] of [[pool, "ccna_phase6a_migrator"], [appPool, "ccna_phase6a_app"]] as const) {
      const row = (await p.query("SELECT local_runtime_guard.identity() AS identity")).rows[0].identity;
      expect(row).toMatchObject({ database: rootGuard.database, host: rootGuard.host, port: rootGuard.port, sessionRole: role, systemIdentifier: identifier });
      expect(row.versionNumber).toBeGreaterThanOrEqual(180000); expect(row.versionNumber).toBeLessThan(190000);
      expect(row.dataDirectory.replaceAll("\\", "/").toLowerCase()).toBe("c:/program files/postgresql/18/data");
      expect(row.neon || null).toBeNull();
    }
    db = drizzle(pool, { schema }); app = drizzle(appPool, { schema });
    const users = await app.insert(schema.usersTable).values([0,1].map(i => ({ clerkUserId: `local-revision-test-${run}-${i}`, email: `revision-test-${run}-${i}@example.invalid`, displayName: "Disposable persistence fixture" }))).returning();
    userId = users[0]!.id; otherUserId = users[1]!.id;
    const [topic] = await app.insert(schema.topicsTable).values({ slug: "revision-test-" + run, name: "Disposable revision integrity fixtures" }).returning(); topicId = topic!.id;
  });
  afterAll(async () => {
    // Soft-disable only catalog rows owned by this test run; immutable attempts remain.
    try { if (app && questions.length) {
      for (const id of questions) await disableAdminQuestion(id, app);
      const rows = await app.select({ topicId: schema.questionsTable.topicId }).from(schema.questionsTable).where(inArray(schema.questionsTable.id, questions));
      for (const row of rows) await app.update(schema.topicsTable).set({ status: "DISABLED" }).where(eq(schema.topicsTable.id, row.topicId));
      await app.update(schema.topicsTable).set({ status: "DISABLED" }).where(eq(schema.topicsTable.id, topicId));
    }
    } finally { await appPool?.end(); await pool?.end(); }
  });
  it("delivers safe immutable content without the key or explanation", async () => {
    const q=await fresh(); expect(q.deliveryId).toMatch(/^[0-9a-f-]{36}$/);expect(q.revisionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(q)).not.toMatch(/isCorrect|explanation|referenceNotes/);
    const row=await app.select().from(schema.questionRevisionsTable).where(eq(schema.questionRevisionsTable.id,q.revisionId));expect(row[0]!.snapshot.options[1]!.isCorrect).toBe(true);
  });
  it("grades a late submission using the old key after a committed admin edit", async () => {
    const q=await fresh();await updateAdminQuestion(q.id,edited,app);
    expect(await answer(q,"B")).toEqual({isCorrect:true,correctOption:{optionKey:"B",text:"Original B"},explanation:"Original explanation"});
    const newer=await getPracticeQuestionForTopic(q.topic.id,app,userId,session);expect(newer!.revisionId).not.toBe(q.revisionId);
    expect(await answer(newer!,"B")).toMatchObject({isCorrect:false,correctOption:{optionKey:"A",text:"New A"}});
  });
  it("preserves the original score and full review after later question/options/topic edits", async () => {
    const q=await fresh();await answer(q,"B");await updateAdminQuestion(q.id,edited,app);
    await app.update(schema.topicsTable).set({name:"Renamed after attempt"}).where(eq(schema.topicsTable.id,q.topic.id));
    const history=await getPracticeHistory(userId,100,undefined,app,true);const item=history.items.find(i=>i.questionId===q.id)!;
    expect(item).toMatchObject({isCorrect:true,revisionId:q.revisionId,topicName:q.topic.name,historicalContentStatus:"VERIFIED_SNAPSHOT",review:{text:"Disposable original content",explanation:"Original explanation",correctOption:{optionKey:"B",text:"Original B"}}});
    expect(JSON.stringify(item)).not.toContain("New A");expect(JSON.stringify(item)).not.toContain("Renamed after attempt");
  });
  it("deduplicates concurrent same-answer retries into one persisted attempt", async () => {
    const q=await fresh();const values=await Promise.all([answer(q,"B"),answer(q,"B")]);expect(values[0]).toEqual(values[1]);
    const rows=await app.select().from(schema.practiceAttemptsTable).where(eq(schema.practiceAttemptsTable.deliveryId,q.deliveryId));expect(rows).toHaveLength(1);
  });
  it("rejects a concurrent conflicting answer without changing the first result", async () => {
    const q=await fresh();const values=await Promise.allSettled([answer(q,"A"),answer(q,"B")]);expect(values.filter(v=>v.status==="fulfilled")).toHaveLength(1);
    const rejected=values.find(v=>v.status==="rejected") as PromiseRejectedResult;expect(rejected.reason).toMatchObject({status:409,code:"SUBMISSION_CONFLICT"});
    const rows=await app.select().from(schema.practiceAttemptsTable).where(eq(schema.practiceAttemptsTable.deliveryId,q.deliveryId));expect(rows).toHaveLength(1);
  });
  it("rejects another actor and same-user different session without leaking feedback", async () => {
    const q=await fresh();expect(await answer(q,"B",otherUserId)).toBeNull();expect(await answer(q,"B",userId,"sess_other")).toBeNull();
    await answer(q,"B");expect(await answer(q,"B",otherUserId)).toBeNull();expect(await answer(q,"B",userId,"sess_other")).toBeNull();
  });
  it("rejects wrong-question delivery binding and unknown option", async () => {
    const q=await fresh();expect(await submitPracticeAnswer(randomUUID(),"B",userId,app,q.deliveryId,session)).toBeNull();
    await expect(answer(q,"Z")).rejects.toMatchObject({code:"INVALID_OPTION"});
    expect(await app.select().from(schema.practiceAttemptsTable).where(eq(schema.practiceAttemptsTable.deliveryId,q.deliveryId))).toHaveLength(0);
  });
  it("rejects a genuinely expired delivery without writing an attempt", async () => {
    const q=await fresh();const [d]=await app.insert(schema.practiceDeliveriesTable).values({userId,sessionId:session,questionId:q.id,revisionId:q.revisionId,deliveredAt:new Date(Date.now()-25*3600000),expiresAt:new Date(Date.now()-3600000)}).returning();
    await expect(answer({...q,deliveryId:d!.id},"B")).rejects.toMatchObject({status:409,code:"DELIVERY_EXPIRED"});
  });
  it("rejects a disabled question and replays only already accepted feedback", async () => {
    const q=await fresh();await answer(q,"B");const pending=await getPracticeQuestionForTopic(q.topic.id,app,userId,session);await disableAdminQuestion(q.id,app);
    expect(await answer(pending!,"B")).toBeNull();expect(await answer(q,"B")).toMatchObject({isCorrect:true});
  });
  it("retains the delivered topic when the question is moved", async () => {
    const q=await fresh();await updateAdminQuestion(q.id,{topicId},app);await answer(q,"B");
    const [attempt]=await app.select().from(schema.practiceAttemptsTable).where(eq(schema.practiceAttemptsTable.deliveryId,q.deliveryId));expect(attempt!.topicId).toBe(q.topic.id);
  });
  it("does not deliver torn content during a blocked concurrent admin edit", async () => {
    const q=await fresh(),locked=deferred(),release=deferred();
    const editing=db.transaction(async tx=>{await updateAdminQuestion(q.id,edited,tx as unknown as typeof db);locked.resolve();await release.promise;});
    await locked.promise;let delivered=false;
    const reading=getPracticeQuestionForTopic(q.topic.id,app,userId,session).then(value=>{delivered=true;return value;});
    try {await new Promise(r=>setTimeout(r,50));expect(delivered).toBe(false);} finally {release.resolve();}
    await editing;const result=await reading;expect(result).toMatchObject({text:edited.text,options:[{optionKey:"A",text:"New A"},{optionKey:"B",text:"New B"}]});
    expect(await answer(result!,"A")).toMatchObject({isCorrect:true,explanation:"New explanation"});
  });
  it("serializes two administrator edits and captures both complete revisions", async () => {
    const q=await fresh(),locked=deferred(),release=deferred();
    const first=db.transaction(async tx=>{await updateAdminQuestion(q.id,edited,tx as unknown as typeof db);locked.resolve();await release.promise;});await locked.promise;
    const second=updateAdminQuestion(q.id,{text:"Second concurrent complete edit"},app);
    release.resolve();await Promise.all([first,second]);
    const revisions=await app.select().from(schema.questionRevisionsTable).where(eq(schema.questionRevisionsTable.questionId,q.id));
    expect(revisions.some(r=>r.snapshot.text===edited.text&&r.snapshot.options[0]!.text==="New A")).toBe(true);
    expect(revisions.some(r=>r.snapshot.text==="Second concurrent complete edit"&&r.snapshot.options[0]!.text==="New A")).toBe(true);
    const current=await getPracticeQuestionForTopic(q.topic.id,app,userId,session);expect(current!.text).toBe("Second concurrent complete edit");
  });
  it("enforces immutable UPDATE/DELETE and TRUNCATE at the database boundary", async () => {
    const q=await fresh();await answer(q,"B");
    await assertRejected(sql`UPDATE question_revisions SET snapshot=snapshot WHERE id=${q.revisionId}`);
    await assertRejected(sql`DELETE FROM question_revisions WHERE id=${q.revisionId}`);
    await assertRejected(sql`UPDATE practice_deliveries SET expires_at=expires_at WHERE id=${q.deliveryId}`);
    await assertRejected(sql`DELETE FROM practice_deliveries WHERE id=${q.deliveryId}`);
    await assertRejected(sql`UPDATE practice_attempts SET is_correct=false WHERE delivery_id=${q.deliveryId}`);
    await assertRejected(sql`DELETE FROM practice_attempts WHERE delivery_id=${q.deliveryId}`);
    // Never truncate real relations, even for a negative test: trigger is inspected instead.
    const triggers=(await pool.query("SELECT tgname FROM pg_trigger WHERE tgname LIKE '%no_truncate' AND NOT tgisinternal")).rows;expect(triggers).toHaveLength(3);
  });
  it("enforces the captured key, topic and delivery owner independently of application code", async () => {
    const q=await fresh();
    await assertRejected(sql`INSERT INTO practice_attempts(user_id,question_id,topic_id,selected_option_key,is_correct,revision_id,delivery_id) VALUES(${userId},${q.id},${q.topic.id},'B',false,${q.revisionId},${q.deliveryId})`);
    await assertRejected(sql`INSERT INTO practice_attempts(user_id,question_id,topic_id,selected_option_key,is_correct,revision_id,delivery_id) VALUES(${otherUserId},${q.id},${q.topic.id},'B',true,${q.revisionId},${q.deliveryId})`);
    await assertRejected(sql`INSERT INTO practice_attempts(user_id,question_id,topic_id,selected_option_key,is_correct,revision_id,delivery_id) VALUES(${userId},${q.id},${topicId},'B',true,${q.revisionId},${q.deliveryId})`);
    await assertRejected(sql`INSERT INTO practice_attempts(user_id,question_id,topic_id,selected_option_key,is_correct) VALUES(${userId},${q.id},${q.topic.id},'B',true)`);
  });
  it("enforces composite revision FKs and pair-null constraints", async () => {
    const q=await fresh(),other=await fresh();
    await assertRejected(sql`INSERT INTO practice_deliveries(user_id,question_id,revision_id) VALUES(${userId},${q.id},${other.revisionId})`,"23503");
    const constraints=(await pool.query("SELECT conname,convalidated FROM pg_constraint WHERE conname IN ('practice_attempts_revision_fk','practice_attempts_delivery_fk','practice_attempts_revision_pair_ck','practice_attempts_delivery_uq','practice_deliveries_revision_fk')")).rows;
    expect(constraints).toHaveLength(5);expect(constraints.every(c=>c.convalidated)).toBe(true);
  });
  it("rejects inconsistent snapshots and forged content hashes", async () => {
    const q=await fresh();const [revision]=await app.select().from(schema.questionRevisionsTable).where(eq(schema.questionRevisionsTable.id,q.revisionId));
    const invalid={...revision!.snapshot,options:revision!.snapshot.options.map(o=>({...o,isCorrect:false}))};
    await assertRejected(sql`INSERT INTO question_revisions(question_id,snapshot,content_hash) VALUES(${q.id},${JSON.stringify(invalid)}::jsonb,encode(sha256(convert_to(${JSON.stringify(invalid)}::jsonb::text,'UTF8')),'hex'))`);
    await assertRejected(sql`INSERT INTO question_revisions(question_id,snapshot,content_hash) VALUES(${q.id},${JSON.stringify(revision!.snapshot)}::jsonb,${"0".repeat(64)})`);
  });
  it("indexes FK lookup paths and grants no runtime history/revision update permissions", async () => {
    const indexes=(await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('practice_attempts_delivery_uq','practice_attempts_revision_idx','practice_deliveries_revision_idx','practice_deliveries_user_idx','question_revisions_content_uq')")).rows;expect(indexes).toHaveLength(5);
    const privileges=(await appPool.query("SELECT has_table_privilege(current_user,'question_revisions','UPDATE') AS revision_update,has_table_privilege(current_user,'practice_deliveries','DELETE') AS delivery_delete,has_table_privilege(current_user,'practice_attempts','UPDATE') AS attempt_update")).rows[0];expect(privileges).toEqual({revision_update:false,delivery_delete:false,attempt_update:false});
  });
  it("keeps progress totals stable across duplicate retries and later edits", async () => {
    const q=await fresh();const before=await getLearningProgress(userId,app);await answer(q,"B");await answer(q,"B");await updateAdminQuestion(q.id,edited,app);
    const after=await getLearningProgress(userId,app);expect(after.summary.totalAttempts).toBe(before.summary.totalAttempts+1);expect(after.summary.correctAttempts).toBe(before.summary.correctAttempts+1);
  });
  it("keeps historical review private to its authenticated owner", async () => {
    const q=await fresh();await answer(q,"B");const other=await getPracticeHistory(otherUserId,100,undefined,app,true);expect(other.items.some(i=>i.questionId===q.id)).toBe(false);
  });
  it.skipIf(!existsSync(legacyBaseline))("preserves exact pre-migration legacy values and labels their content unavailable", async () => {
    const baseline = JSON.parse(readFileSync(legacyBaseline, 'utf8')) as { oldAttempts: { id: string; hash: string }[] };
    for (const old of baseline.oldAttempts) {
      const result = await pool.query(`SELECT a.user_id,a.revision_id,a.delivery_id,md5(row_to_json(old)::text) AS row_hash,md5(row_to_json(old)::jsonb::text) AS canonical_hash FROM practice_attempts a CROSS JOIN LATERAL (SELECT a.id,a.user_id,a.question_id,a.topic_id,a.selected_option_key,a.is_correct,a.submitted_at) old WHERE a.id=$1`, [old.id]);
      const row=result.rows[0];expect(row).toBeDefined();expect([row.row_hash,row.canonical_hash]).toContain(old.hash);expect(row.revision_id).toBeNull();expect(row.delivery_id).toBeNull();
      const history=await getPracticeHistory(row.user_id,100,undefined,app,true);expect(history.items.find(i=>i.id===old.id)).toMatchObject({ historicalContentStatus:"LEGACY_UNAVAILABLE",review:null,revisionId:null });
    }
  });
  it("allows already-dispatched verified actor work to finish without transferring its result to a new session", async () => {
    const q=await fresh();const held=await pool.connect();
    try {
      await held.query("BEGIN");await held.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))",[q.deliveryId]);
      // Represents captured request context; browser changes cannot rewrite it.
      const pending=answer(q,"B",userId,session);await held.query("COMMIT");expect(await pending).toMatchObject({isCorrect:true});
      expect(await answer(q,"B",userId,"sess_browser_switched")).toBeNull();
    } finally { await held.query("ROLLBACK").catch(()=>{});held.release(); }
  });

});
