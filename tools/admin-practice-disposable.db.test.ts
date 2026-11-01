import {portableRoot,workspaceRoot} from "./workspace-root.mjs";
/** Opt-in fixtures only in the named Drizzle-check database; always rolled back.
 * No database creation, grants, HBA setup or populated rehearsal DB access.
 * Only the separately enabled Nexus group migrates inside the rolled-back fixture. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {readSchemaCatalog,assertSchemaCatalog} from './phase6a-local/upgrade.mjs';
import {nexusSnapshot,assertNexusFunction} from './nexus-policy.mjs';
import {learningSnapshot,learningCatalog} from './learning-policy.mjs';
import {yearlyActivity,learnerProgress,awardAchievements,achievementRules} from '../artifacts/api-server/src/lib/learning-evidence';
import {nexusSubmitDeliveries} from '../artifacts/api-server/src/lib/nexus';
import {nexusAvailability,nexusStartSession,nexusSession,nexusSaveSelection,nexusLearnAnswer,nexusFinish,nexusAnalytics,nexusSessionHistory} from '../artifacts/api-server/src/lib/nexus';
import { createHash } from "node:crypto";
import { testBackupRestore } from "./phase8a-cleanup/backup-disposable-test.mjs";
import { eq, sql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
vi.mock("@workspace/db", async () => ({
  ...(await import("@workspace/db/schema")),
  db: undefined,
}));
import { deleteAdminRecords } from "../artifacts/api-server/src/lib/admin-delete";
import {
  previewHistoryDeletion,
  confirmHistoryDeletion,
  historyDeleteConfirmation,
} from "../artifacts/api-server/src/lib/admin-history-delete";
import { startPracticeBatch } from "../artifacts/api-server/src/lib/practice-batch";
import { submitPracticeAnswer } from "../artifacts/api-server/src/lib/practice";
import {
  listStudioQuestions,
  studioQuestionDetails,
  saveStudioQuestion,
  studioReadiness,
  bulkStudioQuestions,
} from "../artifacts/api-server/src/lib/question-studio";
import {
  listManagedTopics,
  topicDetails,
  createManagedTopic,
  updateManagedTopic,
  previewTopicDependencies,
  bulkTopicStatus,
} from "../artifacts/api-server/src/lib/topics-management";
const enabled = process.env.RUN_ADMIN_PRACTICE_DISPOSABLE_TESTS === "1";
const root = portableRoot,
  database = "ccna_drizzle_check_20261012_c08f12ad34b6",
  owner = "ccna_taxonomy_rehearsal_owner_8e6c4b9a2170";
const directory =
  root + "/.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data";
const canonical = (s: string) => s.replaceAll("\\", "/").toLowerCase();
const emptyDataCheck =
  "SELECT (SELECT count(*) FROM public.questions)+(SELECT count(*) FROM public.topics)+(SELECT count(*) FROM public.users)+(SELECT count(*) FROM public.practice_attempts)+(SELECT count(*) FROM public.question_revisions)+(SELECT count(*) FROM public.practice_deliveries)+(SELECT count(*) FROM public.question_options)+(SELECT count(*) FROM public.question_objectives)+(SELECT count(*) FROM public.exam_blueprints)+(SELECT count(*) FROM public.exam_domains)+(SELECT count(*) FROM public.exam_objectives) AS n";
let client: Client, db: ReturnType<typeof drizzle<typeof schema>>, originalLedger: unknown;
async function isolated(fn: (tx: typeof db) => Promise<void>) {
  const rollback = Error("FIXTURE_ROLLBACK_ONLY");
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as typeof db);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
const topic = async (tx: typeof db) =>
  (
    await tx
      .insert(schema.topicsTable)
      .values({
        slug: "delete-practice-fixture-" + randomUUID(),
        name: "Isolated deletion/practice fixture",
      })
      .returning()
  )[0]!;
const question = async (tx: typeof db, topicId: string) =>
  (
    await tx
      .insert(schema.questionsTable)
      .values({
        topicId,
        text: "Isolated fixture: choose A.",
        type: "MULTIPLE_CHOICE_SINGLE",
        difficulty: "EASY",
        explanation: "Isolated explanation",
        status: "ACTIVE",
      })
      .returning()
  )[0]!;
describe.skipIf(!enabled)("isolated PostgreSQL deletion and practice persistence", () => {
  it.skipIf(process.env.RUN_EDITOR_DISPOSABLE_TESTS!=='1')('Admin editor: transactional multiple-answer migration, mappings, original revisions and complete-set grading',async()=>isolated(async tx=>{
    const t=await topic(tx),q=await question(tx,t.id);
    await tx.insert(schema.questionOptionsTable).values([{questionId:q.id,optionKey:'A',text:'Old single correct',isCorrect:true,displayOrder:0},{questionId:q.id,optionKey:'B',text:'Old single distractor',isCorrect:false,displayOrder:1}]);
    const [actor]=await tx.insert(schema.usersTable).values({clerkUserId:'editor-'+randomUUID(),email:'editor@example.invalid',displayName:'Synthetic editor learner'}).returning();
    const oldDelivery=(await startPracticeBatch({topicId:t.id,count:1},actor.id,'sess_editor',tx)).questions[0];
    const oldRevisions=(await tx.execute(sql`SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) AS rows FROM public.question_revisions r`)).rows[0];
    const before=(await tx.execute(sql`SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) AS rows FROM public.questions q`)).rows[0];
    const adapter:any={dialect:(db as any).dialect,session:{execute:(v:any)=>tx.execute(v),all:async(v:any)=>(await tx.execute(v)).rows,transaction:(fn:any)=>tx.transaction(fn)}};
    await migrate(adapter,{migrationsFolder:root+'/.local/editor-migration'});
    await migrate(adapter,{migrationsFolder:root+'/.local/editor-migration'});
    expect((await tx.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n).toBe(10);
    expect((await tx.execute(sql`SELECT jsonb_agg(to_jsonb(q) ORDER BY q.id) AS rows FROM public.questions q`)).rows[0]).toEqual(before);
    expect((await tx.execute(sql`SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) AS rows FROM public.question_revisions r`)).rows[0]).toEqual(oldRevisions);
    const catalog=await readSchemaCatalog(client),snapshot=JSON.parse(readFileSync(root+'/lib/db/drizzle/proposed/meta/0009_snapshot.json','utf8'));
    expect(catalog.tables.every((r:any)=>r.owner===owner)).toBe(true);
    assertSchemaCatalog({...catalog,tables:catalog.tables.map((r:any)=>({...r,owner:'ccna_phase6a_migrator'}))},snapshot);
    const inline=await createManagedTopic({name:'Inline synthetic transport',description:'Synthetic, rollback only',slug:'inline-synthetic-transport',displayOrder:0,status:'ACTIVE',autoSlug:true,rejectDuplicateName:true},tx);
    await expect(createManagedTopic({name:' Inline synthetic transport ',slug:'other-inline',autoSlug:false,rejectDuplicateName:true},tx)).rejects.toMatchObject({status:409});
    const [blueprint]=await tx.insert(schema.examBlueprintsTable).values({examCode:'fixture-'+randomUUID().slice(0,8),version:'fixture',title:'Isolated editor blueprint'}).returning();
    const [domain]=await tx.insert(schema.examDomainsTable).values({blueprintId:blueprint.id,code:'1.0',name:'Synthetic domain',weightPercent:100,displayOrder:0}).returning();
    const objectives=await tx.insert(schema.examObjectivesTable).values(['1.1','1.2','1.3'].map((code,i)=>({blueprintId:blueprint.id,domainId:domain.id,domainCode:'1.0',code,description:'Synthetic objective '+code,displayOrder:i}))).returning();
    const detail=await studioQuestionDetails(q.id,1,tx);
    const {id:unused,questionCode,createdAt,updatedAt,...fields}=detail.question;
    const draft={question:{...fields,topicId:inline.id,type:'MULTIPLE_CHOICE_MULTIPLE',text:'Which two synthetic transport protocols?',explanation:'Synthetic UDP and TCP fixture.',options:[{optionKey:'A',text:'UDP',isCorrect:true},{optionKey:'B',text:'TCP',isCorrect:true},{optionKey:'C',text:'Ethernet',isCorrect:false},{optionKey:'D',text:'IP',isCorrect:false}]},assignments:objectives.map((o,i)=>({objectiveId:o.id,blueprintId:blueprint.id,isPrimary:i===0})),expectedToken:detail.editToken};
    expect(await studioReadiness({draft,questionId:q.id},tx)).toMatchObject({ready:true});
    await saveStudioQuestion(draft,q.id,tx);
    let saved=await studioQuestionDetails(q.id,1,tx);
    expect(saved.question).toMatchObject({id:q.id,questionCode,type:'MULTIPLE_CHOICE_MULTIPLE',topicId:inline.id});
    expect(saved.assignments).toHaveLength(3);expect(saved.assignments.find(a=>a.isPrimary)?.objectiveId).toBe(objectives[0].id);
    // Explicit removal, primary change and untouched remaining mapping persist together.
    const changed={...draft,expectedToken:saved.editToken,assignments:draft.assignments.filter(a=>a.objectiveId!==objectives[0].id).map(a=>({...a,isPrimary:a.objectiveId===objectives[1].id}))};
    await saveStudioQuestion(changed,q.id,tx);saved=await studioQuestionDetails(q.id,1,tx);
    expect(saved.assignments.map(a=>a.objectiveId).sort()).toEqual([objectives[1].id,objectives[2].id].sort());expect(saved.assignments.find(a=>a.isPrimary)?.objectiveId).toBe(objectives[1].id);
    await expect(saveStudioQuestion({...changed,expectedToken:draft.expectedToken},q.id,tx)).rejects.toMatchObject({status:409});
    const invalid={...changed,expectedToken:saved.editToken,question:{...draft.question,text:'Must roll back'},assignments:[{objectiveId:randomUUID(),blueprintId:blueprint.id,isPrimary:true}]};
    await expect(saveStudioQuestion(invalid,q.id,tx)).rejects.toBeDefined();
    expect((await studioQuestionDetails(q.id,1,tx)).editToken).toBe(saved.editToken);
    expect(await submitPracticeAnswer(q.id,'A',actor.id,tx,oldDelivery.deliveryId,'sess_editor')).toMatchObject({isCorrect:true});
    const batch=await startPracticeBatch({topicId:inline.id,count:1},actor.id,'sess_editor',tx),delivered=batch.questions[0];
    expect(delivered).toMatchObject({type:'MULTIPLE_CHOICE_MULTIPLE',requiredSelectionCount:2});expect(JSON.stringify(delivered)).not.toMatch(/isCorrect|correctOption|explanation/);
    for(const keys of [['A'],['A','A'],['A','Z']])await expect(submitPracticeAnswer(q.id,keys,actor.id,tx,delivered.deliveryId,'sess_editor')).rejects.toMatchObject({code:'INVALID_OPTION'});
    expect(await submitPracticeAnswer(q.id,['B','A'],actor.id,tx,delivered.deliveryId,'sess_editor')).toMatchObject({isCorrect:true,correctOptions:[{optionKey:'A'},{optionKey:'B'}]});
    expect(await submitPracticeAnswer(q.id,['A','B'],actor.id,tx,delivered.deliveryId,'sess_editor')).toMatchObject({isCorrect:true});
    await expect(submitPracticeAnswer(q.id,['C','D'],actor.id,tx,delivered.deliveryId,'sess_editor')).rejects.toMatchObject({status:409});
    const wrong=(await startPracticeBatch({topicId:inline.id,count:1},actor.id,'sess_editor',tx)).questions[0];
    expect(await submitPracticeAnswer(q.id,['A','C'],actor.id,tx,wrong.deliveryId,'sess_editor')).toMatchObject({isCorrect:false});
    const forged=(await startPracticeBatch({topicId:inline.id,count:1},actor.id,'sess_editor',tx)).questions[0];
    await expect(tx.transaction(child=>child.insert(schema.practiceAttemptsTable).values({userId:actor.id,questionId:q.id,topicId:inline.id,revisionId:forged.revisionId,deliveryId:forged.deliveryId,selectedOptionKey:'["A","C"]',isCorrect:true}))).rejects.toMatchObject({cause:{code:'23514'}});
    await expect(tx.transaction(child=>child.execute(sql`UPDATE public.question_revisions SET snapshot=snapshot WHERE id=${oldDelivery.revisionId}::uuid`))).rejects.toMatchObject({cause:{code:'23514'}});
    const run=await nexusStartSession({topicId:inline.id,count:1,mode:'PRACTICE',requestId:randomUUID()},actor.id,'sess_editor',tx);
    await nexusSaveSelection(run.id,{questionId:q.id,optionKey:'["A"]',flagged:true},actor.id,'sess_editor',tx);
    await expect(nexusFinish(run.id,actor.id,'sess_editor',false,tx)).rejects.toMatchObject({code:'INVALID_OPTION'});
    await nexusSaveSelection(run.id,{questionId:q.id,optionKey:'["B","A"]',flagged:false},actor.id,'sess_editor',tx);
    const finished=await nexusFinish(run.id,actor.id,'sess_editor',false,tx);expect(finished.questions[0].result).toMatchObject({isCorrect:true});
    expect((await tx.select().from(schema.practiceAttemptsTable)).length).toBe(4);
    expect((await tx.execute(sql`SELECT snapshot FROM public.question_revisions WHERE id=${oldDelivery.revisionId}::uuid`)).rows[0].snapshot).toEqual((oldRevisions.rows as any[])[0].snapshot);
  }));
  it.skipIf(process.env.RUN_LEARNING_DISPOSABLE_TESTS!=='1')('Learning evidence: atomic final grading, calendar boundaries and idempotent learner awards',async()=>isolated(async tx=>{
    const t=await topic(tx),q1=await question(tx,t.id),q2=await question(tx,t.id);
    for(const q of [q1,q2])await tx.insert(schema.questionOptionsTable).values([{questionId:q.id,optionKey:'A',text:'Correct fixture route',isCorrect:true,displayOrder:0},{questionId:q.id,optionKey:'B',text:'Other fixture route',isCorrect:false,displayOrder:1}]);
    const [actor,other,calendarActor]=await tx.insert(schema.usersTable).values(['learner','other','calendar'].map(label=>({clerkUserId:'isolated-learning-'+label+'-'+randomUUID(),email:label+'@example.invalid',displayName:'Isolated '+label}))).returning();
    const delivered=await nexusStartSession({topicId:t.id,count:2,mode:'PRACTICE',requestId:randomUUID()},actor.id,'sess_learning',tx);
    expect(delivered.id).toBeNull();expect(delivered.persistence).toBe(false);
    const answers=delivered.questions.map(q=>({questionId:q.id,deliveryId:q.deliveryId,optionKey:'A',flagged:false}));
    // A syntactically valid but absent revision option cannot partly grade a batch.
    await expect(nexusSubmitDeliveries({answers:[answers[0],{...answers[1],optionKey:'Z'}]},actor.id,'sess_learning',tx)).rejects.toMatchObject({code:'INVALID_OPTION',status:400});
    expect(await tx.select().from(schema.practiceAttemptsTable)).toHaveLength(0);
    await expect(nexusSubmitDeliveries({answers},other.id,'sess_learning',tx)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(nexusSubmitDeliveries({answers},actor.id,'changed_signin',tx)).rejects.toMatchObject({code:'NOT_FOUND'});
    const final=await nexusSubmitDeliveries({answers},actor.id,'sess_learning',tx);expect(final.status).toBe('COMPLETED');expect(final.questions.every(q=>q.result?.isCorrect)).toBe(true);
    await nexusSubmitDeliveries({answers:[...answers].reverse()},actor.id,'sess_learning',tx);expect(await tx.select().from(schema.practiceAttemptsTable)).toHaveLength(2);
    await expect(nexusSubmitDeliveries({answers:[{...answers[0],optionKey:'B'},answers[1]]},actor.id,'sess_learning',tx)).rejects.toMatchObject({code:'SUBMISSION_CONFLICT'});
    const preserved=(await tx.execute(sql`SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) AS rows FROM public.practice_attempts a`)).rows[0];
    const adapter:any={dialect:(db as any).dialect,session:{execute:(q:any)=>tx.execute(q),all:async(q:any)=>(await tx.execute(q)).rows,transaction:(fn:any)=>tx.transaction(fn)}};
    await migrate(adapter,{migrationsFolder:root+'/.local/learning-migration'});
    expect((await tx.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n).toBe(9);
    await migrate(adapter,{migrationsFolder:root+'/.local/learning-migration'});
    expect((await tx.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n).toBe(9);
    expect((await tx.execute(sql`SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) AS rows FROM public.practice_attempts a`)).rows[0]).toEqual(preserved);
    const catalog=await readSchemaCatalog(client);expect(catalog.tables.every((t:any)=>t.owner===owner)).toBe(true);assertSchemaCatalog({...catalog,tables:catalog.tables.map((t:any)=>({...t,owner:'ccna_phase6a_migrator'}))},learningSnapshot(root));await assertNexusFunction(client,root,owner);
    const definitions=(await tx.execute(sql`SELECT id,name,description,rule_key AS "ruleKey",rule_version AS "ruleVersion",criteria,active FROM public.achievement_definitions ORDER BY id`)).rows;expect(definitions).toEqual(learningCatalog(root));
    expect(definitions.map((d:any)=>({id:d.id,criteria:d.criteria}))).toEqual([...achievementRules].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>({id:d.id,criteria:d.criteria})));
    expect((await tx.execute(sql`SELECT count(*)::int AS n FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('achievement_definitions','learner_achievements') AND a.grantee=0`)).rows[0].n).toBe(0);
    expect(await tx.select().from(schema.learnerAchievementsTable)).toHaveLength(0);
    const run=await nexusStartSession({topicId:t.id,count:2,mode:'PRACTICE',requestId:randomUUID()},actor.id,'sess_learning',tx);
    await expect(nexusSubmitDeliveries({answers:run.questions.map(q=>({questionId:q.id,deliveryId:q.deliveryId,optionKey:'A'}))},actor.id,'sess_learning',tx)).rejects.toMatchObject({code:'TRACKED_SESSION_REQUIRED'});
    for(const q of run.questions)await nexusSaveSelection(run.id,{questionId:q.id,optionKey:'A',flagged:false},actor.id,'sess_learning',tx);
    await nexusFinish(run.id,actor.id,'sess_learning',false,tx);
    expect((await awardAchievements({timezone:'UTC'},actor.id,tx)).awarded.map(a=>a.id)).toEqual(['first-packet.v1']);
    expect((await awardAchievements({timezone:'UTC'},actor.id,tx)).awarded).toHaveLength(0);
    expect((await awardAchievements({timezone:'UTC'},other.id,tx)).awarded).toHaveLength(0);
    expect((await learnerProgress({timezone:'UTC'},actor.id,tx)).badges.find(b=>b.id==='first-packet.v1').awardedAt).toBeTruthy();
    expect((await learnerProgress({timezone:'UTC'},other.id,tx)).badges.every(b=>b.awardedAt===null)).toBe(true);
    await expect(tx.transaction(async inner=>inner.insert(schema.learnerAchievementsTable).values({userId:actor.id,achievementId:'first-packet.v1',evidence:{test:true}}))).rejects.toMatchObject({cause:{code:'23505',constraint:'learner_achievements_user_badge_uq'}});
    const utc=await yearlyActivity({year:new Date().getUTCFullYear(),timezone:'UTC'},actor.id,tx);
    expect(utc.totals).toMatchObject({answers:4,sessions:1,activeDays:1});
    expect((await yearlyActivity({year:2024,timezone:'UTC'},other.id,tx)).days).toHaveLength(366);
    expect((await yearlyActivity({year:2025,timezone:'America/New_York'},other.id,tx)).days).toHaveLength(365);
    const leap=await yearlyActivity({year:2024,timezone:'Asia/Riyadh'},other.id,tx);expect(leap.days.find(d=>d.date==='2024-02-29')?.total).toBe(0);
    const now=new Date((await tx.execute<{now:string}>(sql`SELECT clock_timestamp() AS now`)).rows[0].now),timestamps:Date[]=[];
    const revision=delivered.questions[0].revisionId;
    for(let hours=1;hours<=12;hours++){
      const submittedAt=new Date(now.getTime()-hours*3600000);timestamps.push(submittedAt);
      const [d]=await tx.insert(schema.practiceDeliveriesTable).values({userId:calendarActor.id,questionId:delivered.questions[0].id,revisionId:revision,sessionId:'sess_calendar',deliveredAt:new Date(now.getTime()-14*3600000),expiresAt:new Date(now.getTime()+3600000)}).returning();
      await tx.insert(schema.practiceAttemptsTable).values({userId:calendarActor.id,topicId:t.id,questionId:d.questionId,deliveryId:d.id,revisionId:revision,selectedOptionKey:'A',isCorrect:true,submittedAt});
    }
    for(const timezone of ['UTC','Asia/Tokyo','America/New_York']){
      const actual=await yearlyActivity({year:now.getUTCFullYear(),timezone},calendarActor.id,tx),expected=new Map<string,number>();
      for(const timestamp of timestamps){const parts=new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp),value=(type:string)=>parts.find(p=>p.type===type)!.value,date=value('year')+'-'+value('month')+'-'+value('day');expected.set(date,(expected.get(date)||0)+1);}
      for(const day of actual.days)expect(day.answers).toBe(expected.get(day.date)||0);
    }
    await expect(yearlyActivity({year:2024,timezone:'Invalid/Timezone'},actor.id,tx)).rejects.toMatchObject({status:400});
    expect((await learnerProgress({timezone:'UTC'},actor.id,tx)).framework.id).toBe('ccna-practice-evidence.v1');
  }));
  it.skipIf(process.env.RUN_NEXUS_DISPOSABLE_TESTS!=='1')('Nexus sessions: additive migration, repeat execution, modes, ownership, persistence and immutable revisions',async()=>isolated(async tx=>{
    const staging=root+'/.local/nexus-migration';
    // Official migrator, with transaction calls explicitly routed to nested
    // SAVEPOINTs so its inner commit can never commit the fixture transaction.
    const adapter:any={dialect:(db as any).dialect,session:{execute:(q:any)=>tx.execute(q),all:async(q:any)=>(await tx.execute(q)).rows,transaction:(fn:any)=>tx.transaction(fn)}};
    await migrate(adapter,{migrationsFolder:staging});
    expect((await tx.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n).toBe(8);
    const catalog=await readSchemaCatalog(client);
    expect(catalog.tables.every((t:any)=>t.owner===owner)).toBe(true);
    // Only owner names are translated for this intentionally different private
    // cluster; every table/column/constraint/index/enum is validated unchanged.
    assertSchemaCatalog({...catalog,tables:catalog.tables.map((t:any)=>({...t,owner:'ccna_phase6a_migrator'}))},nexusSnapshot(root));
    await assertNexusFunction(client,root,owner);
    await migrate(adapter,{migrationsFolder:staging});
    expect((await tx.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows[0].n).toBe(8);
    const t=await topic(tx), q=await question(tx,t.id);
    await tx.insert(schema.questionOptionsTable).values([{questionId:q.id,optionKey:'A',text:'Correct route',isCorrect:true,displayOrder:0},{questionId:q.id,optionKey:'B',text:'Other route',isCorrect:false,displayOrder:1}]);
    const [actor,other]=await tx.insert(schema.usersTable).values([{clerkUserId:'nexus-'+randomUUID(),email:'nexus@example.invalid',displayName:'Nexus fixture'},{clerkUserId:'nexus-'+randomUUID(),email:'nexus-other@example.invalid',displayName:'Other fixture'}]).returning();
    expect(await nexusAvailability({topicId:t.id},actor.id,tx)).toMatchObject({available:1,persistence:true});
    const request={topicId:t.id,count:1,mode:'LEARN',requestId:randomUUID()};
    const learn=await nexusStartSession(request,actor.id,'sess_nexus',tx);
    expect(learn).toMatchObject({persistence:true,canResume:true});
    expect(JSON.stringify(learn)).not.toMatch(/isCorrect|correctOption|Isolated explanation/);
    expect((await nexusStartSession(request,actor.id,'sess_nexus',tx)).id).toBe(learn.id);
    await expect(nexusStartSession({...request,count:2},actor.id,'sess_nexus',tx)).rejects.toMatchObject({code:'REQUEST_CONFLICT'});
    await expect(nexusSession(learn.id,other.id,'sess_nexus',tx)).rejects.toMatchObject({status:404});
    expect((await nexusSession(learn.id,actor.id,'different_session',tx)).canResume).toBe(false);
    await nexusSaveSelection(learn.id,{questionId:q.id,optionKey:'B',flagged:true},actor.id,'sess_nexus',tx);
    expect((await nexusSession(learn.id,actor.id,'sess_nexus',tx)).questions[0]).toMatchObject({selected:'B',flagged:true,result:null});
    await tx.update(schema.questionsTable).set({text:'Changed current catalog text',explanation:'Changed catalog explanation'}).where(eq(schema.questionsTable.id,q.id));
    expect(await nexusLearnAnswer(learn.id,q.id,actor.id,'sess_nexus',tx)).toMatchObject({isCorrect:false});
    const complete=await nexusFinish(learn.id,actor.id,'sess_nexus',false,tx);
    expect(complete.status).toBe('COMPLETED');expect(complete.questions[0].text).toBe(q.text);expect(complete.questions[0].result.explanation).toBe(q.explanation);
    await nexusFinish(learn.id,actor.id,'sess_nexus',false,tx);
    expect(await nexusAvailability({topicId:t.id,mode:'REVIEW_MISTAKES'},actor.id,tx)).toMatchObject({available:1});
    expect(await nexusAvailability({topicId:t.id,mode:'REVIEW_MISTAKES'},other.id,tx)).toMatchObject({available:0});
    // Independent simulated HTTP transactions normally have different now().
    // The rollback wrapper deliberately shares one transaction; use a known
    // older revision-bound fixture to test ordering without UUID ties.
    const [priorDelivery]=await tx.insert(schema.practiceDeliveriesTable).values({userId:other.id,questionId:q.id,revisionId:learn.questions[0].revisionId,sessionId:'sess_prior',deliveredAt:new Date(Date.now()-120000),expiresAt:new Date(Date.now()+3600000)}).returning();
    await tx.insert(schema.practiceAttemptsTable).values({userId:other.id,questionId:q.id,topicId:t.id,revisionId:priorDelivery.revisionId,deliveryId:priorDelivery.id,selectedOptionKey:'B',isCorrect:false,submittedAt:new Date(Date.now()-60000)});
    expect(await nexusAvailability({topicId:t.id,mode:'REVIEW_MISTAKES'},other.id,tx)).toMatchObject({available:1});
    const practice=await nexusStartSession({...request,mode:'PRACTICE',requestId:randomUUID()},other.id,'sess_nexus',tx);
    await nexusSaveSelection(practice.id,{questionId:q.id,optionKey:'A',flagged:false},other.id,'sess_nexus',tx);
    await expect(tx.transaction(async inner=>submitPracticeAnswer(q.id,'A',other.id,inner as any,practice.questions[0].deliveryId,'sess_nexus'))).rejects.toMatchObject({cause:{code:'23514',constraint:'nexus_deferred_grading'}});
    await expect(nexusLearnAnswer(practice.id,q.id,other.id,'sess_nexus',tx)).rejects.toMatchObject({code:'DEFERRED_GRADING'});
    expect((await nexusSession(practice.id,other.id,'sess_nexus',tx)).questions[0].result).toBeNull();
    expect((await nexusFinish(practice.id,other.id,'sess_nexus',false,tx)).questions[0].result.isCorrect).toBe(true);
    expect(await nexusAvailability({topicId:t.id,mode:'REVIEW_MISTAKES'},other.id,tx)).toMatchObject({available:0});
    const stats:any=await nexusAnalytics(other.id,'sess_nexus','all',tx);
    expect(stats.totals).toMatchObject({attempts:2,correct:1,unique:1,available:1,unmapped:1});expect(stats.granularity).toBe('month');expect(stats.studyTime).toBeNull();
    // Two objectives in one domain must not double-count one question or answer.
    const [blueprint]=await tx.insert(schema.examBlueprintsTable).values({examCode:'200-301',version:'1.1',title:'Isolated taxonomy fixture',status:'ACTIVE',sourceUrl:'https://example.invalid/isolated-blueprint',verifiedAt:new Date()}).returning();
    const domains=await tx.insert(schema.examDomainsTable).values(['Network Fundamentals','Network Access','IP Connectivity','IP Services','Security Fundamentals','Automation and Programmability'].map((name,i)=>({blueprintId:blueprint.id,code:(i+1)+'.0',name,weightPercent:[20,20,25,10,15,10][i],displayOrder:i}))).returning();
    const objectives=await tx.insert(schema.examObjectivesTable).values([1,2].map(n=>({blueprintId:blueprint.id,domainId:domains[0].id,domainCode:'1.0',code:'1.'+n,description:'Isolated objective '+n,displayOrder:n}))).returning();
    await tx.insert(schema.questionObjectivesTable).values(objectives.map((o,i)=>({questionId:q.id,blueprintId:blueprint.id,objectiveId:o.id,isPrimary:i===0})));
    const mapped:any=await nexusAnalytics(other.id,'sess_nexus','7',tx);
    expect(mapped.domains).toHaveLength(6);expect(mapped.domains[0]).toMatchObject({available:1,attempted:1,attempts:2,correct:1,covered_objectives:2});expect(mapped.domains[0].recommendedTopic.id).toBe(t.id);
    expect(mapped.totals.unmapped).toBe(0);expect(mapped.totals.unmappedAttempts).toBe(0);
    expect(await nexusAvailability({domainId:domains[0].id},actor.id,tx)).toMatchObject({available:1});
    expect(await nexusAvailability({domainId:domains[1].id},actor.id,tx)).toMatchObject({available:0});
    expect(await nexusSessionHistory(actor.id,{page:1,pageSize:10,search:t.name},tx)).toMatchObject({total:1});
    expect(await nexusSessionHistory(other.id,{},tx)).toMatchObject({total:1});
    const abandoned=await nexusStartSession({...request,requestId:randomUUID()},actor.id,'sess_nexus',tx);
    expect((await nexusFinish(abandoned.id,actor.id,'sess_nexus',true,tx)).status).toBe('ABANDONED');
    await expect(tx.transaction(async inner=>submitPracticeAnswer(q.id,'A',actor.id,inner as any,abandoned.questions[0].deliveryId,'sess_nexus'))).rejects.toMatchObject({cause:{code:'23514',constraint:'nexus_session_closed'}});
    // The supported original answer endpoint can still grade a Learn delivery;
    // Finish uses that immutable stored choice even without a prior draft PATCH.
    const compatible=await nexusStartSession({...request,requestId:randomUUID()},actor.id,'sess_nexus',tx);
    expect(await submitPracticeAnswer(q.id,'A',actor.id,tx,compatible.questions[0].deliveryId,'sess_nexus')).toMatchObject({isCorrect:true});
    expect((await nexusFinish(compatible.id,actor.id,'sess_nexus',false,tx)).status).toBe('COMPLETED');
    const old=await startPracticeBatch({topicId:t.id,count:1},other.id,'sess_legacy',tx);
    expect(await submitPracticeAnswer(q.id,'A',other.id,tx,old.questions[0].deliveryId,'sess_legacy')).toMatchObject({isCorrect:true});
    expect((await tx.select().from(schema.practiceAttemptsTable))).toHaveLength(5);
  }));
  it("question studio SQL and transactions preserve revisions, identifiers, mappings and stale-edit safety", async () =>
    isolated(async (tx) => {
      const t = await topic(tx),
        q = await question(tx, t.id);
      await tx.insert(schema.questionOptionsTable).values([
        {
          questionId: q.id,
          optionKey: "A",
          text: "Correct fixture choice",
          isCorrect: true,
          displayOrder: 0,
        },
        {
          questionId: q.id,
          optionKey: "B",
          text: "Other fixture choice",
          isCorrect: false,
          displayOrder: 1,
        },
      ]);
      const [blueprint] = await tx
        .insert(schema.examBlueprintsTable)
        .values({
          examCode: "200-301",
          version: "isolated-studio",
          title: "Isolated studio fixture",
          status: "DRAFT",
        })
        .returning();
      const [domain] = await tx
        .insert(schema.examDomainsTable)
        .values({
          blueprintId: blueprint.id,
          code: "1.0",
          name: "Isolated domain",
          weightPercent: 20,
          displayOrder: 0,
        })
        .returning();
      const objectives = await tx
        .insert(schema.examObjectivesTable)
        .values([
          {
            blueprintId: blueprint.id,
            domainId: domain.id,
            domainCode: "1.0",
            code: "1.1",
            description: "Isolated objective one",
            displayOrder: 0,
          },
          {
            blueprintId: blueprint.id,
            domainId: domain.id,
            domainCode: "1.0",
            code: "1.2",
            description: "Isolated objective two",
            displayOrder: 1,
          },
        ])
        .returning();
      const detail = await studioQuestionDetails(q.id, 1, tx);
      await tx.execute(sql`SET LOCAL TIME ZONE 'UTC'`);
      expect((await studioQuestionDetails(q.id,1,tx)).editToken).toBe(detail.editToken);
      await tx.execute(sql`SET LOCAL TIME ZONE 'Asia/Riyadh'`);
      expect((await studioQuestionDetails(q.id,1,tx)).editToken).toBe(detail.editToken);
      const page = await listStudioQuestions({ search: q.questionCode, pageSize: 10 }, tx);
      expect(page.items.find((r) => r.id === q.id)?.editToken).toBe(detail.editToken);
      const { id, questionCode, createdAt, updatedAt, ...body } = detail.question;
      const input = {
        question: {
          ...body,
          text: "Updated isolated fixture text",
          options: body.options.map(({ optionKey, text, isCorrect }) => ({
            optionKey,
            text,
            isCorrect,
          })),
        },
        expectedToken: detail.editToken,
        assignments: [
          { objectiveId: objectives[0].id, blueprintId: blueprint.id, isPrimary: true },
        ],
      };
      await saveStudioQuestion(input, q.id, tx);
      const changed = await studioQuestionDetails(q.id, 1, tx);
      expect(changed.question.id).toBe(q.id);
      expect(changed.question.questionCode).toBe(q.questionCode);
      expect(changed.assignments).toHaveLength(1);
      expect(changed.revisionCount).toBeGreaterThan(0);
      await expect(saveStudioQuestion(input, q.id, tx)).rejects.toMatchObject({ status: 409 });
      try {
        await tx.transaction(async (child) => {
          await saveStudioQuestion(
            {
              ...input,
              expectedToken: changed.editToken,
              question: { ...input.question, text: "Must roll back" },
              assignments: objectives.map((o) => ({
                objectiveId: o.id,
                blueprintId: blueprint.id,
                isPrimary: true,
              })),
            },
            q.id,
            child as unknown as typeof db,
          );
        });
        throw Error("Invalid primary mappings were accepted");
      } catch (e) {
        expect(e).toMatchObject({ status: 400 });
      }
      expect((await studioQuestionDetails(q.id, 1, tx)).editToken).toBe(changed.editToken);
      const bulk = await bulkStudioQuestions(
        { items: [{ id: q.id, editToken: changed.editToken }], change: { difficulty: "HARD" } },
        tx,
      );
      expect(bulk.updated).toBe(1);
      expect((await studioQuestionDetails(q.id, 1, tx)).question.difficulty).toBe("HARD");
      expect(
        (await listStudioQuestions({ mapping: "objective", pageSize: 10 }, tx)).items.some(
          (r) => r.id === q.id,
        ),
      ).toBe(false);
    }));
  it("topics management SQL: bounded pages, exact search, counts, optimistic edits, bulk status and real permanent deletion", async () =>
    isolated(async (tx) => {
      const first = await createManagedTopic(
        {
          name: "Éthernet fixture",
          description: "literal 100%_ routing",
          displayOrder: 1,
          status: "ACTIVE",
          autoSlug: true,
        },
        tx,
      );
      const second = await createManagedTopic(
        {
          name: "Éthernet fixture",
          description: "other",
          displayOrder: 2,
          status: "ACTIVE",
          autoSlug: true,
        },
        tx,
      );
      expect(first.slug).not.toBe(second.slug);
      const q = await question(tx, first.id);
      const before = await tx
        .select()
        .from(schema.questionsTable)
        .where(eq(schema.questionsTable.id, q.id));
      const list = await listManagedTopics(
        { page: 1, pageSize: 10, search: "100%_", sort: "updatedAt", direction: "desc" },
        tx,
      );
      expect(list.total).toBe(1);
      expect(list.items[0].questionCount).toBe(1);
      expect(list.items[0].publishedQuestionCount).toBe(1);
      const detail = await topicDetails(first.id, 1, tx);
      expect(detail.questions).toHaveLength(1);
      expect(JSON.stringify(detail.questions)).not.toContain("explanation");
      await updateManagedTopic(
        first.id,
        { expectedVersion: detail.topic.version, name: "Edited fixture" },
        tx,
      );
      await expect(
        updateManagedTopic(
          first.id,
          { expectedVersion: detail.topic.version, name: "Stale edit" },
          tx,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const fresh = await topicDetails(first.id, 1, tx),
        other = await topicDetails(second.id, 1, tx);
      const bulk = await bulkTopicStatus(
        {
          status: "DISABLED",
          items: [
            { id: first.id, version: detail.topic.version },
            { id: second.id, version: other.topic.version },
          ],
        },
        tx,
      );
      expect(bulk.updated).toBe(1);
      expect(bulk.blocked).toBe(1);
      const preview = await previewTopicDependencies({ ids: [first.id, second.id] }, tx);
      expect(preview.items.find((t) => t.id === first.id)?.blocked).toBe(true);
      expect(preview.items.find((t) => t.id === second.id)?.blocked).toBe(false);
      expect(await deleteAdminRecords("topics", { ids: [first.id, second.id] }, tx)).toMatchObject({
        deleted: 1,
        blocked: 1,
      });
      expect(
        await tx.select().from(schema.topicsTable).where(eq(schema.topicsTable.id, second.id)),
      ).toHaveLength(0);
      expect(
        await tx.select().from(schema.questionsTable).where(eq(schema.questionsTable.id, q.id)),
      ).toEqual(before);
      expect((await topicDetails(first.id, 1, tx)).topic.name).toBe(fresh.topic.name);
    }));
  beforeAll(async () => {
    expect(canonical(realpathSync(process.cwd()))).toBe(canonical(root));
    expect(execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim()).toBe(
      "main",
    );
    expect(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()).toBe(
      "03b14526aae448e49eacd602a43bfb0e355aca4d",
    );
    expect(canonical(realpathSync(directory))).toBe(canonical(directory));
    const marker = JSON.parse(
      readFileSync(directory + "/../owner.json", "utf8").replace(/^\uFEFF/, ""),
    );
    expect(marker).toMatchObject({
      nonce: "8e6c4b9a2170",
      port: 55440,
      owner,
      database: "ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170",
    });
    const pid = readFileSync(directory + "/postmaster.pid", "utf8")
      .trim()
      .split(/\r?\n/);
    expect(canonical(pid[1]!)).toBe(canonical(directory));
    expect(Number(pid[3])).toBe(55440);
    const listener = JSON.parse(
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          "$x=@(Get-NetTCPConnection -LocalPort 55440 -State Listen -ErrorAction Stop); if($x.Count -ne 1){throw 'Unexpected listener'}; [pscustomobject]@{host=$x[0].LocalAddress;pid=$x[0].OwningProcess;exe=(Get-Process -Id $x[0].OwningProcess).Path}|ConvertTo-Json -Compress",
        ],
        { encoding: "utf8" },
      ),
    );
    expect(listener.host).toBe("127.0.0.1");
    expect(listener.pid).toBe(Number(pid[0]));
    expect(canonical(listener.exe)).toBe("c:/program files/postgresql/18/bin/postgres.exe");
    client = new Client({
      host: "127.0.0.1",
      port: 55440,
      database,
      user: owner,
      ssl: false,
      connectionTimeoutMillis: 5000,
      options:
        "-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=20000",
      application_name: "isolated-admin-practice-tests",
    });
    client.on("error", () => {});
    await client.connect();
    const row = (
      await client.query(
        "SELECT current_database() AS database,current_user AS owner,host(inet_server_addr()) AS host,inet_server_port() AS port,current_setting('data_directory') AS directory,current_setting('server_version_num')::int AS version,pg_postmaster_start_time() AS started,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner",
      )
    ).rows[0];
    expect(row).toMatchObject({
      database,
      owner,
      host: "127.0.0.1",
      port: 55440,
      version: 180006,
      database_owner: owner,
    });
    expect(canonical(row.directory)).toBe(canonical(directory));
    expect(Math.abs(Date.parse(row.started) - Number(pid[2]) * 1000)).toBeLessThan(1500);
    const journal = JSON.parse(readFileSync(root + "/lib/db/drizzle/meta/_journal.json", "utf8"));
    // Exact reviewed ledger for this dedicated earlier Drizzle check (0004 was
    // CRLF then). This does not alter/relax the application database's LF guard.
    const hashes = [
      "b39fe82f5797542f49912d07408d96f8bac49a592263dde8082505ccea8d9bd4",
      "b3fee57baf66f4cb0d3cd27efee61d5508e93123b4ea6f42b120a78173a88a58",
      "63dd70e696142401560e5d5063ca39d0498107b9e67ae8cdf2756c352709b28f",
      "0117dfe4623e214b59f806b70dc684bdc963c25bb83895c327ea86b10fbc6a3d",
      "5c6614d26e7d37171fb66f86c05d646ce83b81861a0c4f964c720b2f193abcd5",
      "d1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226",
    ];
    const ledger = (
      await client.query(
        "SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
      )
    ).rows;
    const sixth = hashes.map((hash, i) => ({ hash, created_at: String(journal.entries[i].when) }));
    const migrationBytes = readFileSync(
      root + "/lib/db/drizzle/0006_controlled_history_delete.sql",
    );
    const next = {
      hash: createHash("sha256").update(migrationBytes).digest("hex"),
      created_at: "1791964800000",
    };
    expect(next.hash).toBe("2b77bb268d42f33d2fe24d0fb909939e8253a17e751c5b56beebb6332dfaf298");
    expect(journal.entries[6]).toMatchObject({
      idx: 6,
      tag: "0006_controlled_history_delete",
      when: 1791964800000,
    });
    expect(ledger).toEqual([...sixth, next]);
    // This dedicated migrator-test database must still contain no application records.
    const counts = (await client.query(emptyDataCheck)).rows[0];
    expect(String(counts.n)).toBe("0");
    db = drizzle(client, { schema });
    // Test execution never runs migrations. The exact seven-entry fixture
    // schema must already exist; any pending migration is a preflight blocker.
    originalLedger = (
      await client.query(
        "SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
      )
    ).rows;
    expect(originalLedger).toEqual([...sixth, next]);
  });
  it("requires explicit session-bound history confirmation; deletes only selected history and keeps direct mutation blocked", async () =>
    isolated(async (tx) => {
      const t = await topic(tx),
        q = await question(tx, t.id),
        other = await question(tx, t.id);
      const admin = (
        await tx
          .insert(schema.usersTable)
          .values({
            clerkUserId: "history-admin-" + randomUUID(),
            displayName: "Isolated Admin",
            email: "history-admin-" + randomUUID() + "@example.test",
            role: "ADMIN",
            status: "ACTIVE",
          })
          .returning()
      )[0]!;
      const actor = { actorId: admin.id, sessionId: "isolated-history-admin-session" };
      for (const item of [q, other]) {
        const snapshot = {
          questionCode: item.questionCode,
          topic: { id: t.id, slug: t.slug, name: t.name },
          text: item.text,
          type: item.type,
          difficulty: item.difficulty,
          explanation: item.explanation,
          imageKey: null,
          referenceNotes: null,
          options: [
            { optionKey: "A", text: "A", isCorrect: true },
            { optionKey: "B", text: "B", isCorrect: false },
          ],
        };
        await tx.insert(schema.questionRevisionsTable).values({
          questionId: item.id,
          snapshot,
          contentHash: sql`encode(sha256(convert_to(${JSON.stringify(snapshot)}::jsonb::text,'UTF8')),'hex')`,
        });
      }
      for (const query of [
        sql`DELETE FROM public.question_revisions WHERE question_id=${q.id}::uuid`,
        sql`UPDATE public.question_revisions SET snapshot=snapshot WHERE question_id=${q.id}::uuid`,
        sql`TRUNCATE public.question_revisions,public.practice_deliveries,public.practice_attempts`,
      ]) {
        await expect(
          tx.transaction(async (child) => {
            await child.execute(query);
          }),
        ).rejects.toMatchObject({ cause: { code: "23514" } });
      }
      const preview = await previewHistoryDeletion({ ids: [q.id] }, actor, tx);
      expect(preview.records[0]!.revisions).toHaveLength(1);
      const input = {
        token: preview.token,
        confirmation: historyDeleteConfirmation,
        acknowledgeHistoryLoss: true,
      };
      await expect(
        confirmHistoryDeletion(input, { ...actor, sessionId: "another-session" }, tx),
      ).rejects.toThrow("different Admin session");
      const learner = (
        await tx
          .insert(schema.usersTable)
          .values({
            clerkUserId: "history-learner-" + randomUUID(),
            displayName: "Isolated learner",
            email: "history-learner-" + randomUUID() + "@example.test",
          })
          .returning()
      )[0]!;
      await expect(
        tx.transaction((child) =>
          child.execute(
            sql`SELECT public.delete_question_with_history(${q.id}::uuid,${learner.id}::uuid)`,
          ),
        ),
      ).rejects.toMatchObject({ cause: { code: "42501" } });
      const result = await confirmHistoryDeletion(input, actor, tx);
      expect(result).toMatchObject({ deleted: 1, blocked: 0 });
      expect(
        (await tx.execute(sql`SELECT id FROM public.questions WHERE id=${q.id}::uuid`)).rows,
      ).toHaveLength(0);
      expect(
        (
          await tx.execute(
            sql`SELECT id FROM public.question_revisions WHERE question_id=${q.id}::uuid`,
          )
        ).rows,
      ).toHaveLength(0);
      expect(
        (
          await tx.execute(
            sql`SELECT id FROM public.question_revisions WHERE question_id=${other.id}::uuid`,
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (await tx.execute(sql`SELECT record_id FROM pg_temp.ccna_history_delete_permits LIMIT 1`))
          .rows,
      ).toHaveLength(0);
      await expect(confirmHistoryDeletion(input, actor, tx)).rejects.toThrow("expired");
      await expect(
        tx.transaction((child) =>
          child.execute(
            sql`DELETE FROM public.question_revisions WHERE question_id=${other.id}::uuid`,
          ),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
    }));
  afterAll(async () => {
    if (client) {
      try {
        if (db) {
          expect((await client.query(emptyDataCheck)).rows[0].n).toBe("0");
          expect(
            (
              await client.query(
                "SELECT hash,created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
              )
            ).rows,
          ).toEqual(originalLedger);
          expect((await client.query("SELECT to_regclass('public.learning_sessions') AS sessions,to_regclass('public.learning_session_items') AS items")).rows[0]).toEqual({sessions:null,items:null});
          expect((await client.query("SELECT to_regclass('public.achievement_definitions') AS definitions,to_regclass('public.learner_achievements') AS awards")).rows[0]).toEqual({definitions:null,awards:null});
        }
      } finally {
        await client.end();
      }
    }
  });
  it("restores all eleven application tables from the verified original full archive and rolls back twice", () => {
    expect(testBackupRestore()).toMatchObject({ rows: 135, topics: 102, rollback: true });
  }, 180000);
  it("physically removes an unreferenced fixture question and then its empty topic", async () =>
    isolated(async (tx) => {
      const t = await topic(tx),
        q = await question(tx, t.id);
      await tx.insert(schema.questionOptionsTable).values([
        { questionId: q.id, optionKey: "A", text: "A", isCorrect: true, displayOrder: 0 },
        { questionId: q.id, optionKey: "B", text: "B", isCorrect: false, displayOrder: 1 },
      ]);
      const blueprint = (
        await tx
          .insert(schema.examBlueprintsTable)
          .values({
            examCode: "isolated-" + randomUUID().slice(0, 8),
            version: "test",
            title: "Disposable taxonomy",
          })
          .returning()
      )[0]!;
      const domain = (
        await tx
          .insert(schema.examDomainsTable)
          .values({
            blueprintId: blueprint.id,
            code: "1.0",
            name: "Disposable domain",
            weightPercent: 100,
            displayOrder: 0,
          })
          .returning()
      )[0]!;
      const objective = (
        await tx
          .insert(schema.examObjectivesTable)
          .values({
            blueprintId: blueprint.id,
            domainId: domain.id,
            domainCode: "1.0",
            code: "1.1",
            description: "Disposable objective",
            displayOrder: 0,
          })
          .returning()
      )[0]!;
      await tx.insert(schema.questionObjectivesTable).values({
        questionId: q.id,
        blueprintId: blueprint.id,
        objectiveId: objective.id,
        isPrimary: true,
      });
      expect(await deleteAdminRecords("questions", { ids: [q.id] }, tx)).toMatchObject({
        deleted: 1,
        blocked: 0,
      });
      expect(
        await tx.select().from(schema.questionsTable).where(eq(schema.questionsTable.id, q.id)),
      ).toHaveLength(0);
      expect(
        await tx
          .select()
          .from(schema.questionOptionsTable)
          .where(eq(schema.questionOptionsTable.questionId, q.id)),
      ).toHaveLength(0);
      expect(
        await tx
          .select()
          .from(schema.questionObjectivesTable)
          .where(eq(schema.questionObjectivesTable.questionId, q.id)),
      ).toHaveLength(0);
      expect(await deleteAdminRecords("topics", { ids: [t.id] }, tx)).toMatchObject({
        deleted: 1,
        blocked: 0,
      });
      expect(
        await tx.select().from(schema.topicsTable).where(eq(schema.topicsTable.id, t.id)),
      ).toHaveLength(0);
    }));
  it("refuses the application grant procedure on this isolated target before granting anything", async () => {
    const script = readFileSync(
      root + "/tools/phase6a-local/08-grant-admin-catalog-delete.sql",
      "utf8",
    );
    try {
      await expect(client.query(script)).rejects.toMatchObject({
        code: "P0001",
        message: "Wrong approved local administrator identity; stop",
      });
    } finally {
      await client.query("ROLLBACK");
    }
  });
  it("blocks history-bound question/topic without changing status, timestamps or history", async () =>
    isolated(async (tx) => {
      const t = await topic(tx),
        q = await question(tx, t.id);
      expect(await deleteAdminRecords("topics", { ids: [t.id] }, tx)).toMatchObject({ blocked: 1 });
      const snapshot = {
        questionCode: q.questionCode,
        topic: { id: t.id, slug: t.slug, name: t.name },
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        explanation: q.explanation,
        imageKey: null,
        referenceNotes: null,
        options: [
          { optionKey: "A", text: "A", isCorrect: true },
          { optionKey: "B", text: "B", isCorrect: false },
        ],
      };
      await tx.insert(schema.questionRevisionsTable).values({
        questionId: q.id,
        snapshot,
        contentHash: sql`encode(sha256(convert_to(${JSON.stringify(snapshot)}::jsonb::text,'UTF8')),'hex')`,
      });
      const historyBefore = await tx
        .select()
        .from(schema.questionRevisionsTable)
        .where(eq(schema.questionRevisionsTable.questionId, q.id));
      const blockedQuestion = await deleteAdminRecords("questions", { ids: [q.id] }, tx);
      expect(blockedQuestion).toMatchObject({ deleted: 0, blocked: 1 });
      expect(blockedQuestion.items[0]!.dependencies).toEqual({
        revisions: 1,
        deliveries: 0,
        attempts: 0,
      });
      expect(await deleteAdminRecords("topics", { ids: [t.id] }, tx)).toMatchObject({
        deleted: 0,
        blocked: 1,
      });
      expect(
        await tx
          .select()
          .from(schema.questionRevisionsTable)
          .where(eq(schema.questionRevisionsTable.questionId, q.id)),
      ).toEqual(historyBefore);
      expect(
        (
          await tx.select().from(schema.questionsTable).where(eq(schema.questionsTable.id, q.id))
        )[0]!.status,
      ).toBe("ACTIVE");
      expect(
        (await tx.select().from(schema.topicsTable).where(eq(schema.topicsTable.id, t.id)))[0]!
          .status,
      ).toBe("ACTIVE");
      expect(
        (
          await tx.select().from(schema.questionsTable).where(eq(schema.questionsTable.id, q.id))
        )[0],
      ).toEqual(q);
      expect(
        (await tx.select().from(schema.topicsTable).where(eq(schema.topicsTable.id, t.id)))[0],
      ).toEqual(t);
    }));
  it("reports DELETED/BLOCKED for real bulk operations without removing dependent questions", async () =>
    isolated(async (tx) => {
      const t = await topic(tx),
        q = await question(tx, t.id);
      const empty = await topic(tx);
      const draftTopic = await topic(tx),
        draft = await question(tx, draftTopic.id);
      await tx
        .update(schema.questionsTable)
        .set({ status: "DISABLED" })
        .where(eq(schema.questionsTable.id, draft.id));
      expect(
        await deleteAdminRecords(
          "topics",
          { ids: [t.id, empty.id, draftTopic.id, randomUUID()] },
          tx,
        ),
      ).toMatchObject({ deleted: 1, blocked: 3 });
      expect(
        await tx.select().from(schema.topicsTable).where(eq(schema.topicsTable.id, empty.id)),
      ).toHaveLength(0);
      expect(
        await tx.select().from(schema.topicsTable).where(eq(schema.topicsTable.id, draftTopic.id)),
      ).toHaveLength(1);
      expect(
        await tx.select().from(schema.questionsTable).where(eq(schema.questionsTable.id, q.id)),
      ).toHaveLength(1);
    }));
  it("issues unique deliveries, grades once and persists immutable attempts for only the synthetic actor", async () =>
    isolated(async (tx) => {
      const t = await topic(tx),
        actor = (
          await tx
            .insert(schema.usersTable)
            .values({
              clerkUserId: "isolated-" + randomUUID(),
              email: "isolated@example.invalid",
              displayName: "Isolated fixture",
            })
            .returning()
        )[0]!;
      for (let i = 0; i < 2; i++) {
        const q = await question(tx, t.id);
        await tx.insert(schema.questionOptionsTable).values([
          { questionId: q.id, optionKey: "A", text: "A", isCorrect: true, displayOrder: 0 },
          { questionId: q.id, optionKey: "B", text: "B", isCorrect: false, displayOrder: 1 },
        ]);
      }
      const batch = await startPracticeBatch(
        { topicId: t.id, count: 2 },
        actor.id,
        "sess_isolated",
        tx,
      );
      expect(new Set(batch.questions.map((q) => q.id)).size).toBe(2);
      expect(JSON.stringify(batch)).not.toMatch(/isCorrect|explanation|referenceNotes/);
      const q = batch.questions[0]!;
      expect(
        await submitPracticeAnswer(q.id, "A", actor.id, tx, q.deliveryId, "sess_isolated"),
      ).toMatchObject({ isCorrect: true });
      expect(
        await submitPracticeAnswer(q.id, "A", actor.id, tx, q.deliveryId, "sess_isolated"),
      ).toMatchObject({ isCorrect: true });
      expect(
        await tx
          .select()
          .from(schema.practiceAttemptsTable)
          .where(eq(schema.practiceAttemptsTable.userId, actor.id)),
      ).toHaveLength(1);
      // Explicit bulk history workflow handles real revision/delivery/attempt chains.
      await tx
        .update(schema.usersTable)
        .set({ role: "ADMIN" })
        .where(eq(schema.usersTable.id, actor.id));
      const identity = { actorId: actor.id, sessionId: "sess_isolated" };
      const preview = await previewHistoryDeletion(
        { ids: batch.questions.map((q) => q.id) },
        identity,
        tx,
      );
      expect(preview.records.reduce((n, r) => n + r.attempts.length, 0)).toBe(1);
      expect(preview.records.reduce((n, r) => n + r.deliveries.length, 0)).toBe(2);
      expect(
        await confirmHistoryDeletion(
          {
            token: preview.token,
            confirmation: historyDeleteConfirmation,
            acknowledgeHistoryLoss: true,
          },
          identity,
          tx,
        ),
      ).toMatchObject({ deleted: 2, blocked: 0 });
      for (const table of [
        schema.questionsTable,
        schema.questionRevisionsTable,
        schema.practiceDeliveriesTable,
        schema.practiceAttemptsTable,
      ])
        expect(await tx.select().from(table)).toHaveLength(0);
      expect(await deleteAdminRecords("topics", { ids: [t.id] }, tx)).toMatchObject({
        deleted: 1,
        blocked: 0,
      });
    }));
});
