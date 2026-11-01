// Offline proposed metadata only. No SQL execution, official promotion or DB import.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),req=createRequire(path.join(root,'lib/db/package.json'));
process.env.ESBUILD_BINARY_PATH=path.join(root,'.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
mkdirSync('.local/study-metadata',{recursive:true});
req(path.join(root,'node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/lib/main.js')).buildSync({entryPoints:['lib/db/src/schema/index.ts'],bundle:true,platform:'node',format:'cjs',outfile:'.local/study-metadata/schema.cjs',logLevel:'silent'});
const schema=req(path.join(root,'.local/study-metadata/schema.cjs'));
const {generateDrizzleJson}=req(path.join(root,'node_modules/.pnpm/drizzle-kit@0.31.10/node_modules/drizzle-kit/api.js'));
const old=JSON.parse(readFileSync('lib/db/drizzle/meta/0013_snapshot.json','utf8')),generated=generateDrizzleJson(schema,old.id),next=structuredClone(old);
next.id='ecf20014-ccaa-4000-8000-000000000014';next.prevId=old.id;
for(const name of ['lesson_annotations','lesson_progress','lesson_media']){assert(generated.tables['public.'+name]);next.tables['public.'+name]=generated.tables['public.'+name];}
const journal=JSON.parse(readFileSync('lib/db/drizzle/meta/_journal.json','utf8'));assert.equal(journal.entries.length,13);assert.equal(journal.entries.at(-1).tag,'0013_learning_lessons');
journal.entries.push({idx:13,version:'7',when:1793145600000,tag:'0014_interactive_study',breakpoints:true});
writeFileSync('lib/db/drizzle/proposed/meta/0014_snapshot.json',JSON.stringify(next,null,2)+'\n',{flag:'wx'});
writeFileSync('lib/db/drizzle/proposed/meta/0014_journal.json',JSON.stringify(journal,null,2)+'\n',{flag:'wx'});
console.log('Prepared study proposal metadata only; no official files or database changed.');
