import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {check,checked,sanitizedFailure} from './diagnostics.mjs';
import {assertExamProposal} from './proposal.mjs';
test('dedicated 0017 snapshot names match PostgreSQL 63-byte identifiers without weakening catalog comparison',()=>{
 const {snapshot}=assertExamProposal(process.cwd());
 const f=snapshot.tables['public.exam_session_items'].foreignKeys;
 const name='exam_session_items_deletion_audit_id_question_deletion_audits_i';
 assert.equal(Buffer.byteLength(name),63);assert.equal(f[name].name,name);
 assert.deepEqual(f[name].columnsFrom,['deletion_audit_id']);assert.equal(f[name].tableTo,'question_deletion_audits');assert.equal(f[name].onDelete,'restrict');
 for(const table of Object.values(snapshot.tables))for(const n of Object.keys(table.foreignKeys))assert(Buffer.byteLength(n)<=63);
 assert(readFileSync('lib/db/drizzle/proposed/0017_exam_simulator.sql','utf8').includes(name+'d_fk'));
});
test('nested diagnostic identifies the exact metadata assertion and first scalar difference',async()=>{
 let error;try{await checked('metadata.catalog.all',()=>check('metadata.exam.defaults',()=>assert.deepEqual([{value:'expected'}],[{value:'actual'}])));}catch(e){error=e;}
 const d=sanitizedFailure(error);assert.equal(d.subcheck,'metadata.exam.defaults');assert.equal(d.difference.path,'$.0.value');assert.equal(d.difference.expected,'actual');assert.equal(d.difference.actual,'expected');
});
test('private assertion values and arbitrary driver messages are withheld',()=>{
 const secret='DO_NOT_PRINT_TEST_TOKEN';const e=Object.assign(Error(secret),{ccnaCheck:'safety.private',expected:secret,actual:'other'});
 const d=sanitizedFailure(e);assert(!JSON.stringify(d).includes(secret));assert.equal(d.reason,null);assert.equal(d.difference.expected.length,secret.length);assert(d.difference.expected.sha256);
});
