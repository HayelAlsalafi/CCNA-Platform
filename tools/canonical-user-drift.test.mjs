import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeUserDrift,compareUsersToBackup,userDriftSql,userArchiveArgs,readArchivedUsers} from './canonical-user-drift.mjs';
const ref='a'.repeat(64);
test('identifies only routine timestamp changes without changing any approved hash',()=>{
 const rows=['updated_at','last_login_at'].map(field=>({accountReference:ref,kind:'CHANGED',field,expected:'2026-10-17T10:00:00+00:00',actual:'2026-10-17T11:00:00+00:00'}));
 assert.equal(summarizeUserDrift(rows).routineTimestampFieldsOnly,true);assert.equal(summarizeUserDrift(rows).changedAccounts,1);
});
for(const field of ['role','status','created_at','email','display_name','clerk_user_id'])test('does not treat '+field+' changes as routine timestamps',()=>{
 assert.equal(summarizeUserDrift([{accountReference:ref,kind:'CHANGED',field,expected:ref,actual:'b'.repeat(64)}]).routineTimestampFieldsOnly,false);
});
for(const kind of ['ADDED','REMOVED'])test('account membership change is never routine: '+kind,()=>{
 assert.equal(summarizeUserDrift([{accountReference:ref,kind,field:'last_login_at',expected:null,actual:null}]).routineTimestampFieldsOnly,false);
});
test('rejects raw personal values in diagnostic results',()=>{
 assert.throws(()=>summarizeUserDrift([{accountReference:ref,kind:'CHANGED',field:'email',expected:'private@example.invalid',actual:null}]));
});
test('empty delta is not claimed as a verified timestamp drift',()=>assert.equal(summarizeUserDrift([]).routineTimestampFieldsOnly,false));
test('requires archived fingerprint equality before requesting a live field comparison',async()=>{
 let queries=0;const client={query:async()=>{queries++;return{rows:[{count:0,hash:'wrong'}]};}};
 await assert.rejects(compareUsersToBackup(client,[],{count:9,hash:ref}));assert.equal(queries,1);
});
test('query normalizes timestamps through PostgreSQL types and never writes data',()=>{
 assert.match(userDriftSql,/jsonb_populate_recordset\(NULL::public.users/);assert.match(userDriftSql,/FULL JOIN/);
 assert.doesNotMatch(userDriftSql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|GRANT)\b/i);
});
test('pg_restore uses separate exact schema and bare relation filters, and emits SQL without executing it',()=>{
 const args=userArchiveArgs('verified.dump');assert(args.includes('--schema=public'));assert(args.includes('--table=users'));
 assert(!args.includes('--table=public.users'));assert(args.includes('--file=-'));
 assert(!args.some(arg=>/^--(dbname|clean|create|disable-triggers|connection)/.test(arg)));
});
test('the operator archive helper decodes the exact selected COPY data',()=>{
 let argumentsUsed;
 const users=readArchivedUsers('verified.dump',{},(_exe,args)=>{argumentsUsed=args;return 'COPY public.users (id, role) FROM stdin;\nfixture\tADMIN\n\\.\n';});
 assert.deepEqual(argumentsUsed,userArchiveArgs('verified.dump'));assert.deepEqual(users,[{id:'fixture',role:'ADMIN'}]);
});
test('the operator archive helper still refuses missing or unexpected COPY tables',()=>{
 assert.throws(()=>readArchivedUsers('verified.dump',{},()=>''));
 assert.throws(()=>readArchivedUsers('verified.dump',{},()=> 'COPY public.questions (id) FROM stdin;\nfixture\n\\.\n'));
});
