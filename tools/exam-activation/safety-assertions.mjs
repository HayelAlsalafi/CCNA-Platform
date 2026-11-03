// Inert checks; no connections, pool imports or database actions on import.
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import {assertPrivateIdentity} from '../study-activation/isolated-policy.mjs';

export const requiredSafetyCases=Object.freeze([
  'questionDeletionWithExamHistory','protectedLessonsAndRevisions',
  'expiredDeadline','gradingAndRepeatSubmission',
]);
export function assertSafetyCoverage(outcomes) {
  assert(outcomes && typeof outcomes==='object','Missing safety evidence');
  assert.deepEqual(Object.keys(outcomes).sort(),[...requiredSafetyCases].sort(),'Missing/unknown safety cases');
  for(const name of requiredSafetyCases)assert.equal(outcomes[name],'PASS','Required safety case did not pass: '+name);
}
export async function executeSafetyCases(cases,context,outcomes={}) {
  assert.deepEqual(Object.keys(cases).sort(),[...requiredSafetyCases].sort());
  for(const name of requiredSafetyCases)assert.equal(typeof cases[name],'function');
  for(const name of requiredSafetyCases)outcomes[name]='PENDING';
  for(const name of requiredSafetyCases) {
    try {assert.equal(await cases[name](context),'PASS','Inconclusive safety case: '+name);outcomes[name]='PASS';}
    catch(error){outcomes[name]='FAIL';throw error;}
  }
  assertSafetyCoverage(outcomes);return outcomes;
}
export async function expectSqlRejection(client,operation,code,constraint) {
  await client.query('SAVEPOINT exam_safety_denial');let error;
  try {await operation();}catch(e){error=e;}
  finally {await client.query('ROLLBACK TO SAVEPOINT exam_safety_denial');}
  assert(error,'Protected operation unexpectedly succeeded');
  assert.equal(error.code??error.cause?.code,code,'Unexpected rejection SQLSTATE');
  if(constraint)assert.equal(error.constraint??error.cause?.constraint,constraint);
}
async function role(c,name) {
  assert(['ccna_phase6a_app','ccna_phase6a_migrator'].includes(name));
  await c.query('RESET ROLE');await c.query('SET LOCAL ROLE '+name);
}
async function read(c,text,values=[]) {return (await c.query(text,values)).rows;}
async function question(ctx,multi=false) {
  const {client:c,chapter}=ctx,id=randomUUID(),revision=randomUUID();
  // Explicit fixture code avoids advancing the nontransactional question-code sequence.
  const code='CCNA-Q-'+String(randomInt(100000,1000000));
  await role(c,'ccna_phase6a_migrator');
  assert.equal((await read(c,'SELECT count(*)::int AS n FROM public.questions WHERE question_code=$1',[code]))[0].n,0,'Fixture code collision; stop without retry');
  await c.query("INSERT INTO public.questions(id,question_code,topic_id,text,type,difficulty,explanation) VALUES($1,$2,$3,'Isolated exam safety fixture',$4,'MEDIUM','Disposable explanation')",[id,code,chapter.id,multi?'MULTIPLE_CHOICE_MULTIPLE':'MULTIPLE_CHOICE_SINGLE']);
  const options=[{optionKey:'A',text:'First',isCorrect:true},{optionKey:'B',text:'Second',isCorrect:multi},{optionKey:'C',text:'Third',isCorrect:false}];
  for(const [order,o] of options.entries())await c.query('INSERT INTO public.question_options(question_id,option_key,display_order,text,is_correct) VALUES($1,$2,$3,$4,$5)',[id,o.optionKey,order,o.text,o.isCorrect]);
  const snapshot={questionCode:code,topic:{id:chapter.id,slug:chapter.slug,name:chapter.title},text:'Isolated exam safety fixture',type:multi?'MULTIPLE_CHOICE_MULTIPLE':'MULTIPLE_CHOICE_SINGLE',difficulty:'MEDIUM',explanation:'Disposable explanation',imageKey:null,referenceNotes:null,options};
  await c.query("INSERT INTO public.question_revisions(id,question_id,snapshot,content_hash) VALUES($1,$2,$3::jsonb,encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex'))",[revision,id,JSON.stringify(snapshot)]);
  return {id,revision,code,options};
}
async function session(ctx,questions,nearExpiry=false) {
  const {client:c,owner,chapter}=ctx,id=randomUUID(),items=[];
  await role(c,'ccna_phase6a_app');
  await c.query("INSERT INTO public.exam_sessions(id,user_id,request_id,auth_session_id,config,question_count,started_at,deadline_at) SELECT $1,$2,$3,'isolated-safety','{}',$4,t,t+interval '5 minutes' FROM (SELECT clock_timestamp()-CASE WHEN $5 THEN interval '5 minutes'-interval '5 seconds' ELSE interval '0 minutes' END AS t) clock",[id,owner,randomUUID(),questions.length,nearExpiry]);
  const mapping={chapter:{id:chapter.id,code:chapter.code,title:chapter.title,volume:chapter.volume,chapterNumber:chapter.chapter_number},domain:{id:chapter.domain_id,code:chapter.domain_code,name:chapter.domain_name}};
  for(const [position,q] of questions.entries()){
    const delivery=randomUUID();await c.query('INSERT INTO public.exam_session_items(delivery_id,session_id,user_id,position,question_id,revision_id,mapping_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)',[delivery,id,owner,position,q.id,q.revision,JSON.stringify(mapping)]);items.push({...q,delivery});
  }
  return {id,items};
}
async function questionDeletion(ctx) {
  const {client:c,admin,services,db,owner}=ctx,q=await question(ctx),s=await session(ctx,[q]);
  await services.examSave(s.id,s.items[0].delivery,{selectedOptionKeys:['A'],flagged:true,expectedVersion:0},owner,db);
  const before=(await read(c,'SELECT to_jsonb(i) AS item FROM public.exam_session_items i WHERE delivery_id=$1',[s.items[0].delivery]))[0].item;
  await expectSqlRejection(c,()=>c.query('SELECT public.delete_question_without_learner_history($1,$2)',[q.id,admin]),'23514','question_history_confirmation_required');
  assert.deepEqual((await read(c,'SELECT to_jsonb(i) AS item FROM public.exam_session_items i WHERE delivery_id=$1',[s.items[0].delivery]))[0].item,before);
  assert.equal((await read(c,'SELECT count(*)::int AS n FROM public.questions WHERE id=$1',[q.id]))[0].n,1);
  await role(c,'ccna_phase6a_migrator');
  assert.equal((await read(c,'SELECT count(*)::int AS n FROM public.question_deletion_audits WHERE question_id=$1',[q.id]))[0].n,0,'Denied deletion must not leave audit side effects');
  await role(c,'ccna_phase6a_app');
  const receipt=(await read(c,'SELECT public.delete_question_with_history($1,$2) AS receipt',[q.id,admin]))[0].receipt;
  assert.equal(receipt.examItems,1);assert(receipt.examAuditId&&receipt.auditId);
  await role(c,'ccna_phase6a_migrator');
  const audits=await read(c,"SELECT id,admin_actor,history_authorized,recovery_payload,payload_hash,encode(sha256(convert_to(recovery_payload::text,'UTF8')),'hex') AS computed_hash FROM public.question_deletion_audits WHERE question_id=$1 ORDER BY id",[q.id]);
  assert.equal(audits.length,2);for(const a of audits){assert.equal(a.admin_actor,admin);assert.equal(a.history_authorized,true);assert.equal(a.payload_hash,a.computed_hash);}
  const examAudit=audits.find(a=>a.id===receipt.examAuditId),baseAudit=audits.find(a=>a.id===receipt.auditId);
  assert(examAudit&&baseAudit);assert.deepEqual(examAudit.recovery_payload.examItems,[before]);
  assert.equal(examAudit.recovery_payload.examSessions[0].id,s.id);
  assert.equal(baseAudit.recovery_payload.revisions[0].id,q.revision);assert.equal(baseAudit.recovery_payload.options.length,3);
  const tombstone=(await read(c,'SELECT * FROM public.exam_session_items WHERE delivery_id=$1',[s.items[0].delivery]))[0];
  assert.equal(tombstone.question_id,null);assert.equal(tombstone.revision_id,null);assert.equal(tombstone.deletion_audit_id,receipt.examAuditId);assert.equal(tombstone.deleted_question_code,q.code);assert(tombstone.deleted_at);assert.deepEqual(tombstone.selected_keys,[]);assert.equal(tombstone.graded_result,null);assert.equal(tombstone.flagged,false);
  for(const table of ['questions','question_options','question_revisions'])assert.equal((await read(c,'SELECT count(*)::int AS n FROM public.'+table+' WHERE '+(table==='questions'?'id':'question_id')+'=$1',[q.id]))[0].n,0);
  assert.equal((await read(c,'SELECT count(*)::int AS n FROM public.exam_sessions WHERE id=$1',[s.id]))[0].n,1);
  await c.query('SET CONSTRAINTS ALL IMMEDIATE');
  await role(c,'ccna_phase6a_app');assert.equal((await services.examSession(s.id,owner,db)).contentRemoved,true);
  await assert.rejects(()=>services.examSubmit(s.id,owner,db),e=>e.code==='CONTENT_REMOVED');
  return 'PASS';
}
async function lessons(ctx) {
  const {client:c,admin,chapter}=ctx,ids=[];
  await role(c,'ccna_phase6a_migrator');
  for(const published of [true,false]){
    const id=randomUUID(),revision=randomUUID(),title='Isolated protected lesson '+id;ids.push(id);
    await c.query('INSERT INTO public.lessons(id,chapter_id,title,created_by,updated_by) VALUES($1,$2,$3,$4,$4)',[id,chapter.id,title,admin]);
    await c.query('INSERT INTO public.lesson_revisions(id,lesson_id,revision_number,snapshot,created_by) VALUES($1,$2,1,$3,$4)',[revision,id,JSON.stringify({chapterId:chapter.id,title,blocks:[]}),admin]);
    if(published)await c.query('UPDATE public.lessons SET published_revision_id=$1 WHERE id=$2',[revision,id]);
    const before=(await read(c,'SELECT to_jsonb(l) AS row FROM public.lessons l WHERE id=$1',[id]))[0].row;
    const revisionBefore=(await read(c,'SELECT to_jsonb(r) AS row FROM public.lesson_revisions r WHERE id=$1',[revision]))[0].row;
    await role(c,'ccna_phase6a_app');
    await expectSqlRejection(c,()=>c.query('SELECT public.delete_never_published_lesson($1,$2,1,$3)',[id,admin,title]),'23514',published?'lesson_delete_published':'lesson_delete_revisions');
    await role(c,'ccna_phase6a_migrator');
    await expectSqlRejection(c,()=>c.query("UPDATE public.lesson_revisions SET snapshot='{}' WHERE id=$1",[revision]),'23001');
    await expectSqlRejection(c,()=>c.query('DELETE FROM public.lesson_revisions WHERE id=$1',[revision]),'23001');
    assert.deepEqual((await read(c,'SELECT to_jsonb(l) AS row FROM public.lessons l WHERE id=$1',[id]))[0].row,before);
    assert.deepEqual((await read(c,'SELECT to_jsonb(r) AS row FROM public.lesson_revisions r WHERE id=$1',[revision]))[0].row,revisionBefore);
  }
  assert.equal(ids.length,2);return 'PASS';
}
async function expired(ctx) {
  const {client:c,owner,services,db}=ctx,q=await question(ctx),s=await session(ctx,[q],true);
  // Deliver while ACTIVE, then let the actual PostgreSQL clock expire it.
  await c.query("SELECT pg_sleep(GREATEST(0,extract(epoch FROM deadline_at-clock_timestamp()))+0.05) FROM public.exam_sessions WHERE id=$1",[s.id]);
  assert.equal((await read(c,'SELECT clock_timestamp()>=deadline_at AS expired FROM public.exam_sessions WHERE id=$1',[s.id]))[0].expired,true);
  const delivery=s.items[0].delivery;
  const before=(await read(c,'SELECT to_jsonb(i) AS row FROM public.exam_session_items i WHERE delivery_id=$1',[delivery]))[0].row;
  await assert.rejects(()=>services.examSave(s.id,delivery,{selectedOptionKeys:['A'],flagged:false,expectedVersion:0},owner,db),e=>e.code==='EXAM_CLOSED');
  await expectSqlRejection(c,()=>c.query("UPDATE public.exam_session_items SET selected_keys='[\"A\"]',answer_version=answer_version+1 WHERE delivery_id=$1",[delivery]),'23514');
  assert.deepEqual((await read(c,'SELECT to_jsonb(i) AS row FROM public.exam_session_items i WHERE delivery_id=$1',[delivery]))[0].row,before);
  assert.deepEqual(before.selected_keys,[]);assert.equal(before.answer_version,0);
  return 'PASS';
}
async function grading(ctx) {
  const {client:c,owner,services,db}=ctx,qs=[];
  for(const multi of [false,false,false,true,true])qs.push(await question(ctx,multi));
  const s=await session(ctx,qs),answers=[['A'],['C'],[],['A','B'],['A']];
  for(const [i,item] of s.items.entries())if(answers[i].length)await services.examSave(s.id,item.delivery,{selectedOptionKeys:answers[i],flagged:false,expectedVersion:0},owner,db);
  const expected=['CORRECT','INCORRECT','UNANSWERED','CORRECT','INCORRECT'];
  const finished=await services.examSubmit(s.id,owner,db);
  assert.equal(finished.status,'SUBMITTED');assert.equal(finished.result.total,5);assert.equal(finished.result.correct,2);assert.equal(finished.result.incorrect,2);assert.equal(finished.result.unanswered,1);assert.equal(finished.result.percentage,40);
  assert.deepEqual(finished.questions.map(q=>q.result.outcome),expected);
  const persisted=(await read(c,'SELECT result,finalized_at,status FROM public.exam_sessions WHERE id=$1',[s.id]))[0];
  assert.deepEqual(persisted.result,finished.result);assert.equal(persisted.status,'SUBMITTED');assert(persisted.finalized_at);
  const items=await read(c,'SELECT graded_result,selected_keys,answer_version FROM public.exam_session_items WHERE session_id=$1 ORDER BY position',[s.id]);
  assert.deepEqual(items.map(i=>i.graded_result.outcome),expected);assert.deepEqual(items.map(i=>i.selected_keys),answers);
  assert.deepEqual((await services.examSubmit(s.id,owner,db)).result,finished.result);
  assert.deepEqual((await read(c,'SELECT result,finalized_at,status FROM public.exam_sessions WHERE id=$1',[s.id]))[0],persisted);
  assert.deepEqual(await read(c,'SELECT graded_result,selected_keys,answer_version FROM public.exam_session_items WHERE session_id=$1 ORDER BY position',[s.id]),items);
  return 'PASS';
}
export async function runSafetyAssertions(client,services,db,target,outcomes={}) {
  // Refuse the main port/database before even changing the fixture role.
  assert.match(target.database,/^ccna_exam_0017_restore_[a-f0-9]{24}$/);
  const first=(await read(client,'SELECT current_database() AS database,inet_server_port() AS port'))[0];
  assert.deepEqual(first,{database:target.database,port:55440});
  await client.query('RESET ROLE');await assertPrivateIdentity(client,target.database,target.directory);
  await role(client,'ccna_phase6a_migrator');
  const admin=(await read(client,"SELECT id FROM public.users WHERE role::text='ADMIN' AND status::text='ACTIVE' ORDER BY id LIMIT 1"))[0]?.id;
  const chapter=(await read(client,"SELECT c.*,t.slug,t.name AS title,d.name AS domain_name FROM public.curriculum_chapters c JOIN public.topics t ON t.id=c.id JOIN public.exam_domains d ON d.id=c.domain_id WHERE t.status='ACTIVE' ORDER BY c.id LIMIT 1"))[0];
  assert(admin&&chapter,'Restored active admin and chapter required');
  const context={client,services,db,admin,owner:admin,chapter};
  await executeSafetyCases({questionDeletionWithExamHistory:questionDeletion,protectedLessonsAndRevisions:lessons,expiredDeadline:expired,gradingAndRepeatSubmission:grading},context,outcomes);
  await role(client,'ccna_phase6a_migrator');return outcomes;
}
