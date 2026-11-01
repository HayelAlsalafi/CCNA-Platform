import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareState} from './diagnose-state.mjs';
test('state comparison identifies exact table and sequence drift without exposing rows',()=>{
 const expected={rowProof:{users:{count:10,hash:'before'},questions:{count:16,hash:'unchanged'}},sequences:{'public.question_code_seq':{last_value:'152',is_called:true}},baselineLedger:[{id:1,hash:'h',created_at:'1'}]};
 const actual={rowProof:{users:{count:10,hash:'after'},questions:expected.rowProof.questions},sequences:expected.sequences,ledger:expected.baselineLedger,otherDatabaseConnections:2};
 assert.deepEqual(compareState(expected,actual),{otherDatabaseConnections:2,ledgerMatchesBackup:true,tableDifferences:[{table:'users',expected:expected.rowProof.users,actual:actual.rowProof.users}],sequenceDifferences:[]});
 assert.equal(compareState(expected,{...actual,ledger:[]}).ledgerMatchesBackup,false);
 assert.equal(compareState(expected,{...actual,sequences:{'public.question_code_seq':{last_value:'153',is_called:true}}}).sequenceDifferences.length,1);
});
test('missing table metadata is refused rather than interpreted as unchanged',()=>{
 assert.throws(()=>compareState({rowProof:{users:{}},sequences:{},baselineLedger:[]},{rowProof:{},sequences:{},ledger:[],otherDatabaseConnections:0}));
});
