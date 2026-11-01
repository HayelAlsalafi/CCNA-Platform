import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {normalizedProvenanceRow,disposableDifferences,verifyDisposableOwnership,reviewedProvenanceAmendments,applyProvenanceAmendments} from './final-planner.mjs';
import {safeDifference,pilotContentFingerprint} from './provenance-diagnostics.mjs';
it('compares timezone representations exactly while retaining all microseconds',()=>{
  expect(normalizedProvenanceRow({updated_at:'2026-10-13 18:59:16.123456+03'})).toEqual(normalizedProvenanceRow({updated_at:'2026-10-13T15:59:16.123456+00:00'}));
  expect(normalizedProvenanceRow({updated_at:'2026-10-13T15:59:16.123456Z'})).not.toEqual(normalizedProvenanceRow({updated_at:'2026-10-13T15:59:16.123457Z'}));
});
it('identifies every changed UUID/field using the unchanged cleanup guard comparison',()=>{
  const archived={questions:[{id:'fixture',status:'ACTIVE',updated_at:'2026-10-13 15:59:16.123456+00',text:'Disposable fixture'}],topics:[],question_options:[],question_objectives:[],question_revisions:[],practice_deliveries:[],practice_attempts:[]};
  const current=structuredClone(archived);current.questions[0].status='DISABLED';current.questions[0].updated_at='2026-10-14T08:00:00.123456Z';
  const plan={deleteQuestionIds:['fixture'],deleteTopicIds:[]},inventory={questions:[{id:'fixture',status:'DISABLED'}],topics:[]};
  const result=disposableDifferences(plan,current,archived,inventory);
  expect(result).toEqual([{table:'questions',id:'fixture',field:'updated_at',expected:'2026-10-13 15:59:16.123456+00',actual:'2026-10-14T08:00:00.123456Z',normalizedExpected:'2026-10-13T15:59:16.123456Z',normalizedActual:'2026-10-14T08:00:00.123456Z'}]);
  expect(()=>verifyDisposableOwnership(plan,current,archived,inventory)).toThrow('differ from verified backup');
});
it('redacts arbitrary content and learner identifiers but exposes safe timestamp metadata',()=>{
  for(const field of ['text','snapshot','user_id','session_id','selected_option_key']){
    const safe=safeDifference({table:'questions',id:'fixture',field,expected:'Sensitive learner@example.test',actual:'Other private content'});
    expect(safe.expected.redacted).toBe(true);expect(JSON.stringify(safe)).not.toMatch(/learner@example|Other private/);
  }
  expect(safeDifference({table:'questions',id:'fixture',field:'updated_at',expected:'2026-10-13T00:00:00Z',actual:'2026-10-14T00:00:00Z'}).actual).toBe('2026-10-14T00:00:00Z');
});
it('fingerprints all educational content and answers without including arbitrary metadata',()=>{
  const row={topicId:'topic',text:'Question',type:'MULTIPLE_CHOICE_SINGLE',difficulty:'EASY',explanation:'Why',imageKey:null,referenceNotes:'Original pack',options:[{optionKey:'A',text:'Yes',isCorrect:true},{optionKey:'B',text:'No',isCorrect:false}]};
  expect(pilotContentFingerprint(row)).toBe(pilotContentFingerprint({...row,id:'some-id',status:'ACTIVE',options:[...row.options].reverse()}));
  expect(pilotContentFingerprint(row)).not.toBe(pilotContentFingerprint({...row,text:'Changed'}));
  expect(pilotContentFingerprint(row)).not.toBe(pilotContentFingerprint({...row,options:row.options.map(o=>({...o,isCorrect:!o.isCorrect}))}));
});
it('diagnostic source uses a read-only transaction and cannot invoke migration/cleanup functions',()=>{
  const source=readFileSync(new URL('./diagnose-provenance.mjs',import.meta.url),'utf8');
  expect(source).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  expect(source).not.toMatch(/client\.query\(['"`](?:DELETE|UPDATE|INSERT|ALTER|CREATE|DROP|TRUNCATE|GRANT|LOCK)/i);
  expect(source).not.toContain('delete_question_with_history');expect(source).not.toMatch(/import.*execute-final/);
  const wrapper=readFileSync(new URL('./diagnose-provenance.ps1',import.meta.url),'utf8');expect(wrapper).toContain('diagnose-provenance.mjs');expect(wrapper).not.toContain('--execute-');
});
it('pins exactly twenty disposable question and three obsolete topic updated_at pairs',()=>{
  const amendments=reviewedProvenanceAmendments();expect(amendments).toHaveLength(23);expect(amendments.filter(e=>e.table==='questions')).toHaveLength(20);expect(amendments.filter(e=>e.table==='topics')).toHaveLength(3);expect(amendments.every(e=>e.field==='updated_at')).toBe(true);
});
it('accepts only each exact reviewed new timestamp and still rejects subsequent metadata or content drift',()=>{
  const entry=reviewedProvenanceAmendments().find(e=>e.table==='questions')!,plan={deleteQuestionIds:[entry.id],deleteTopicIds:[]},inventory={questions:[{id:entry.id,status:'DISABLED'}],topics:[]};
  const archived={questions:[{id:entry.id,status:'DISABLED',updated_at:entry.expected,text:'Disposable fixture'}],topics:[],question_options:[],question_objectives:[],question_revisions:[],practice_deliveries:[],practice_attempts:[]};
  const current=structuredClone(archived);current.questions[0].updated_at=entry.actual;
  expect(disposableDifferences(plan,current,archived,inventory)).toHaveLength(1);
  expect(disposableDifferences(plan,current,archived,inventory,[entry])).toHaveLength(0);
  expect(verifyDisposableOwnership(plan,current,archived,inventory,[entry])).toEqual({question_revisions:0,practice_deliveries:0,practice_attempts:0});
  current.questions[0].updated_at='2026-10-14T09:00:00Z';expect(()=>verifyDisposableOwnership(plan,current,archived,inventory,[entry])).toThrow('differ from verified backup');
  current.questions[0].updated_at=entry.actual;current.questions[0].text='Changed content';expect(()=>verifyDisposableOwnership(plan,current,archived,inventory,[entry])).toThrow('differ from verified backup');
  expect(()=>applyProvenanceAmendments('questions',[{id:entry.id,updated_at:'2026-01-01T00:00:00Z'}],plan,[entry])).toThrow('Original archive');
});
