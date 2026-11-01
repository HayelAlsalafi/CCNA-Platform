import {it,expect} from 'vitest';
import {reviewedInventory,finalPlan,verifyDisposableOwnership,orderedRestoreSql,decodeArchiveTables} from './final-planner.mjs';
import {sprint7QuestionIds,sprint7TopicIds} from '../../artifacts/api-server/src/lib/pilot-content-protection';
function planFixture(){const inventory=reviewedInventory(),preserved=sprint7QuestionIds.map((id,i)=>({id,topicId:sprint7TopicIds[i%24],questionCode:'PILOT-'+i,status:'ACTIVE'}));
  const questions=[...preserved,...inventory.questions.map(q=>({...q}))],topics=[...sprint7TopicIds.map(id=>({id})),...inventory.topics];return{inventory,preserved,questions,topics};}
it('pins disjoint exact 60/24 pilot and 75/78 obsolete UUID sets',()=>{
  const f=planFixture(),p=finalPlan(f.preserved,f.questions,f.topics);expect(p.deleteQuestionIds).toHaveLength(75);expect(p.deleteTopicIds).toHaveLength(78);expect(p.preservedIds).toHaveLength(60);expect(p.requiredTopicIds).toHaveLength(24);
});
it('rejects extra records, missing pilot identities, provenance changes and overlap',()=>{
  const f=planFixture();expect(()=>finalPlan(f.preserved,[...f.questions,{id:'unexpected'}],f.topics)).toThrow('identity set');
  expect(()=>finalPlan(f.preserved,f.questions.slice(1),f.topics)).toThrow('identity set');
  const changed=structuredClone(f);changed.questions[60].questionCode='CCNA-Q-CHANGED';expect(()=>finalPlan(changed.preserved,changed.questions,changed.topics)).toThrow('provenance');
  const overlapping=structuredClone(f.inventory);overlapping.questions[0].id=f.preserved[0].id;expect(()=>finalPlan(f.preserved,f.questions,f.topics,overlapping)).toThrow('overlap');
});
function ownership(){const q='obsolete',t='obsolete-topic',r='revision';const plan={deleteQuestionIds:[q],deleteTopicIds:[t]};const inventory={questions:[{id:q,status:'DISABLED'}],topics:[{id:t,status:'DISABLED'}]};
  const rows={questions:[{id:q,status:'DISABLED'}],topics:[{id:t,status:'DISABLED'}],question_options:[],question_objectives:[],question_revisions:[{id:r,question_id:q,snapshot:{topic:{id:t}},created_at:'2026-10-01T00:00:00Z'}],practice_deliveries:[],practice_attempts:[]};return {plan,inventory,rows};}
it('requires every disposable row to match the archived baseline, with timestamp/JSON normalization',()=>{
  const f=ownership(),archived=structuredClone(f.rows);archived.question_revisions[0].created_at='2026-10-01 00:00:00+00';
  expect(verifyDisposableOwnership(f.plan,f.rows,archived,f.inventory)).toEqual({question_revisions:1,practice_deliveries:0,practice_attempts:0});
  f.rows.question_revisions.push({...f.rows.question_revisions[0],id:'new-history'});expect(()=>verifyDisposableOwnership(f.plan,f.rows,archived,f.inventory)).toThrow('differ from verified backup');
});
it('rejects any obsolete history that refers to a required pilot topic, or vice versa',()=>{
  const f=ownership();f.rows.question_revisions[0].snapshot.topic.id='pilot-topic';expect(()=>verifyDisposableOwnership(f.plan,f.rows,structuredClone(f.rows),f.inventory)).toThrow('Shared pilot/obsolete');
});
it('orders unchanged COPY data by dependencies and rejects missing/duplicate/unreviewed blocks',()=>{
  const raw='COPY public.questions (id) FROM stdin;\nquestion\n\\.\nCOPY public.topics (id) FROM stdin;\ntopic\n\\.\n';
  const ordered=orderedRestoreSql(raw,['topics','questions']);expect(ordered.indexOf('COPY public.topics')).toBeLessThan(ordered.indexOf('COPY public.questions'));expect(decodeArchiveTables(ordered)).toEqual({topics:[{id:'topic'}],questions:[{id:'question'}]});
  expect(()=>orderedRestoreSql(raw,['questions'])).toThrow('inventory');expect(()=>orderedRestoreSql(raw+raw,['topics','questions'])).toThrow('inventory');
});
