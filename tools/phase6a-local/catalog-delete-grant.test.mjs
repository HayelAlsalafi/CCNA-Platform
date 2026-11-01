import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sql=readFileSync(new URL('./08-grant-admin-catalog-delete.sql',import.meta.url),'utf8');
test('new grant is limited to DELETE on questions/topics with no data or history writes',()=>{
 assert.deepEqual(sql.match(/^GRANT .*;$/gm),['GRANT DELETE ON public.questions, public.topics TO ccna_phase6a_app;']);
 assert(!/^(DELETE|UPDATE|INSERT|TRUNCATE|ALTER|CREATE|DROP|REVOKE)\b/m.test(sql));
 for(const guard of ['7694701597474139084','ccna_phase6a_dev','127.0.0.1','5432',"c.confdeltype='r'",'reject_revision_history_change','Unsafe runtime privileges'])assert(sql.includes(guard));
 assert(sql.includes('BEGIN;')&&sql.endsWith('COMMIT;\n'));
});
test('grant ledger multiset exactly matches current six raw migration hashes and timestamps',()=>{
 const root=new URL('../../',import.meta.url),journal=JSON.parse(readFileSync(new URL('lib/db/drizzle/meta/_journal.json',root),'utf8'));
 // This already-applied historical grant deliberately refuses the new seven-entry state.
 const expected=journal.entries.slice(0,6).map(e=>({hash:createHash('sha256').update(readFileSync(new URL('lib/db/drizzle/'+e.tag+'.sql',root))).digest('hex'),when:e.when}));
 const pairs=[...sql.matchAll(/'([0-9a-f]{64})',(\d+)::bigint/g)].map(m=>({hash:m[1],when:Number(m[2])}));
 assert.deepEqual(pairs,expected);assert.equal((sql.match(/EXCEPT ALL/g)??[]).length,2);
});
