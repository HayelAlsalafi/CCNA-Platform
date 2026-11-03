import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileKeys} from './media-reconciliation.mjs';
test('compares shared delivery/thumbnail/original references without counting duplicates',()=>{
 assert.deepEqual(reconcileKeys([{key:'ccna-lessons/a.webp',thumbnail_key:'ccna-lessons/t.webp',original_key:null},{key:'ccna-lessons/a.webp',original_key:'ccna-lessons/o.webp'}],['ccna-lessons/a.webp','ccna-lessons/t.webp','ccna-lessons/orphan.webp']),{
  referenced:3,objects:3,missing:['ccna-lessons/o.webp'],orphanCandidates:['ccna-lessons/orphan.webp']});
});
test('rejects traversal and unexpected namespaces; code has no storage mutations',()=>{
 assert.throws(()=>reconcileKeys([{key:'ccna-lessons/../secret'}],[]));assert.throws(()=>reconcileKeys([],['other/key']));
 const source=readFileSync(new URL('./media-reconciliation.mjs',import.meta.url),'utf8');
 assert(!/PutObject|DeleteObject|CreateBucket|pg_restore|pg_dump|\bGRANT\b/.test(source));
 assert(source.includes('REPEATABLE READ READ ONLY'));assert(source.includes("maxAttempts:1"));
});
test('maps database-relative storage keys to the same S3 prefix as the delivery adapter',()=>{
 assert.deepEqual(reconcileKeys([{key:'a.webp',thumbnail_key:'thumbs/a.webp',original_key:'originals/a.webp'}],['ccna-lessons/a.webp','ccna-lessons/thumbs/a.webp','ccna-lessons/originals/a.webp']).missing,[]);
});
