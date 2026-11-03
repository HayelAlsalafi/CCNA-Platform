// Inert forward-only proposal and promotion validation. Never connects on import.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {assertExamSource} from '../exam-policy.mjs';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const exam17Migration=Object.freeze(['0017_exam_simulator',1793145600003,'f7b14281a71a30dd9f61ae22b5be093ae8a7429e196ac01977182f48823ab481']);
export const baselineChainHash='673b6c93ecdc80aa7fb2383349abe56430a6975810219b7728f12728b4b95be0';
export function assertExamProposal(root) {
 const read=n=>readFileSync(path.join(root,n));
 assert.equal(digest(read('tools/exam-activation/pins.json')),'45c009f7f05464837548b4631a69057c8af8d17454ccf32b1717d1be20fb275f','0017 integrity manifest drift');
 const pins=JSON.parse(read('tools/exam-activation/pins.json'));
 for(const [file,hash] of Object.entries(pins))assert.equal(digest(read(file)),hash,'0017 source drift: '+file);
 assertExamSource(root); // Historical function bodies are reused exactly, never regenerated.
 const baselineManifest=JSON.parse(read('tools/exam-activation/baseline-manifest.json'));
 assert.equal(digest(JSON.stringify(baselineManifest)),baselineChainHash);
 for(const [i,m] of baselineManifest.entries()) {
   const sql=read('lib/db/drizzle/'+m.tag+'.sql');
   assert.equal(digest(sql),m.hash,'Applied migration drift: '+m.tag);
 }
 const baseline=JSON.parse(read('lib/db/drizzle/meta/0016_snapshot.json'));
 const snapshot=JSON.parse(read('lib/db/drizzle/proposed/meta/0017_snapshot.json'));
 const journal=JSON.parse(read('lib/db/drizzle/proposed/meta/0017_journal.json'));
 const official=JSON.parse(read('lib/db/drizzle/meta/_journal.json'));
 assert([16,17].includes(official.entries.length),'Only exact 16 baseline or promoted 17 accepted');
 assert.equal(journal.entries.length,17);assert.deepEqual(journal.entries.slice(0,16),official.entries.slice(0,16));
 for(const [i,m] of baselineManifest.entries())assert.deepEqual(journal.entries[i],{idx:i,version:'7',when:m.when,tag:m.tag,breakpoints:true});
 assert.deepEqual(journal.entries[16],{idx:16,version:'7',when:exam17Migration[1],tag:exam17Migration[0],breakpoints:true});
 assert.equal(snapshot.prevId,baseline.id);assert.equal(Object.keys(baseline.tables).length,22);assert.equal(Object.keys(snapshot.tables).length,24);
 const before=structuredClone(snapshot);delete before.tables['public.exam_sessions'];delete before.tables['public.exam_session_items'];
 assert.deepEqual({...before,id:baseline.id,prevId:baseline.prevId},baseline,'Existing 0016 definitions changed');
 for(const name of ['public.exam_sessions','public.exam_session_items'])assert(snapshot.tables[name]);
 if(official.entries.length===17){assert.deepEqual(official,journal);for(const file of ['0017_exam_simulator.sql','meta/0017_snapshot.json'])assert(read('lib/db/drizzle/'+file).equals(read('lib/db/drizzle/proposed/'+file)),'Partial/changed promotion');}
 return {baseline,snapshot,journal,baselineManifest,proposal:{file:'lib/db/drizzle/proposed/0017_exam_simulator.sql',sha256:exam17Migration[2]}};
}
