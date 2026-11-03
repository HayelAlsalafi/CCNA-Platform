// Orchestration/error fixtures only. No real connection, SQL or sleep executes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requiredSafetyCases,assertSafetyCoverage,executeSafetyCases,expectSqlRejection,runSafetyAssertions} from './safety-assertions.mjs';

test('all four cases execute and only an explicit PASS becomes readiness evidence',async()=>{
 const calls=[],outcomes={},context={marker:1};
 const cases=Object.fromEntries(requiredSafetyCases.map(name=>[name,async c=>{assert.equal(c,context);calls.push(name);return 'PASS';}]));
 await executeSafetyCases(cases,context,outcomes);
 assert.deepEqual(calls,requiredSafetyCases);assertSafetyCoverage(outcomes);
});
test('each missing, skipped, inconclusive or failed case prevents readiness',async()=>{
 for(const name of requiredSafetyCases) {
  const valid=Object.fromEntries(requiredSafetyCases.map(n=>[n,'PASS']));
  const absent={...valid};delete absent[name];assert.throws(()=>assertSafetyCoverage(absent));
  for(const result of ['SKIPPED','PENDING','FAIL',false,true,null,undefined])assert.throws(()=>assertSafetyCoverage({...valid,[name]:result}));
  for(const result of ['SKIPPED',undefined]){
   const outcomes={},cases=Object.fromEntries(requiredSafetyCases.map(n=>[n,async()=>n===name?result:'PASS']));
   await assert.rejects(()=>executeSafetyCases(cases,{},outcomes));assert.equal(outcomes[name],'FAIL');assert.throws(()=>assertSafetyCoverage(outcomes));
  }
  const outcomes={},cases=Object.fromEntries(requiredSafetyCases.map(n=>[n,async()=>{if(n===name)throw Error('assertion failure');return 'PASS';}]));
  await assert.rejects(()=>executeSafetyCases(cases,{},outcomes));assert.equal(outcomes[name],'FAIL');
 }
});
test('missing executable case fails before running any case',async()=>{
 let calls=0;const cases=Object.fromEntries(requiredSafetyCases.slice(1).map(n=>[n,async()=>{calls++;return 'PASS';}]));
 await assert.rejects(()=>executeSafetyCases(cases,{}));assert.equal(calls,0);
 assert.throws(()=>assertSafetyCoverage({...Object.fromEntries(requiredSafetyCases.map(n=>[n,'PASS'])),unknown:'PASS'}));
});
test('SQL denial requires exact state/constraint and rolls back the attempted operation',async()=>{
 const calls=[],client={query:async sql=>{calls.push(sql);return {rows:[]};}};
 await expectSqlRejection(client,async()=>{throw Object.assign(Error('denied'),{code:'23514',constraint:'protected'});},'23514','protected');
 assert.equal(calls[0],'SAVEPOINT exam_safety_denial');assert.equal(calls.at(-1),'ROLLBACK TO SAVEPOINT exam_safety_denial');
 for(const operation of [async()=>{},async()=>{throw Object.assign(Error('wrong code'),{code:'42501'});},async()=>{throw Object.assign(Error('wrong constraint'),{code:'23514',constraint:'other'});}])await assert.rejects(()=>expectSqlRejection(client,operation,'23514','protected'));
});
test('main port/name fail before any role change or mutation',async()=>{
 const calls=[],client={query:async sql=>{calls.push(sql);return {rows:[{database:'ccna_phase6a_dev',port:5432}]};}};
 await assert.rejects(()=>runSafetyAssertions(client,null,null,{database:'ccna_phase6a_dev',directory:'unused'}));assert.equal(calls.length,0);
 await assert.rejects(()=>runSafetyAssertions(client,null,null,{database:'ccna_exam_0017_restore_'+'a'.repeat(24),directory:'unused'}));
 assert.equal(calls.length,1);assert(calls[0].startsWith('SELECT '));
});
test('runner and activation receipt both enforce complete safety evidence; migration remains pinned',()=>{
 const runner=readFileSync('tools/exam-activation/rehearse-backup.mjs','utf8'),activation=readFileSync('tools/exam-activation/activation.mjs','utf8');
 assert(runner.includes('await runSafetyAssertions(client,services,databaseApi,report.target,report.safetyAssertions)'));
 assert(runner.indexOf('assertSafetyCoverage(report.safetyAssertions);report.classification=')>runner.indexOf('report.rollbackVerified=true'));
 assert(activation.includes('assertSafetyCoverage(evidence.safetyAssertions)'));
 const source=readFileSync('tools/exam-activation/safety-assertions.mjs','utf8');
 assert(source.includes('pg_sleep(GREATEST(0,extract(epoch FROM deadline_at-clock_timestamp()))+0.05)'));
 assert(source.includes("'lesson_delete_published':'lesson_delete_revisions'"));
 assert(!source.includes('nextval('));
});
