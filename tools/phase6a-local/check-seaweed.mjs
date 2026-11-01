// Minimal object-only check: execute the existing adapter, without importing a DB pool.
import {createRequire, Module} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const req=createRequire(path.join(root,'artifacts/api-server/package.json'));
try {
  const ts=req('typescript');
  const source=path.join(root,'artifacts/api-server/src/lib/lesson-media-storage.ts');
  const compiled=ts.transpileModule(readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const isolated=new Module(source);
  // Only replace the two application dependencies; actual S3 implementation/SDK run unchanged.
  isolated.require=name=> {
    if(name==='./lessons')return {LessonError:class extends Error {constructor(status,code,message){super(message);this.code=code;}}};
    if(name==='./lesson-media')return {mediaLimit:5*1024*1024,LocalLessonMedia:class {constructor(){throw Error('Local fallback forbidden');}}};
    return req(name);
  };
  isolated._compile(compiled,source);
  process.env.NODE_ENV='development';
  assert.equal(process.env.LESSON_MEDIA_S3_ENDPOINT,'http://127.0.0.1:9000');
  assert.equal(process.env.LESSON_MEDIA_S3_BUCKET,'ccna-lesson-media');
  const store=isolated.exports.configuredMediaStore();
  const key=`${randomUUID()}.png`;
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  await store.put(key,bytes);
  assert.deepEqual(await store.get(key),bytes);
  console.log(JSON.stringify({status:'PASS',adapter:'configuredMediaStore',endpoint:'http://127.0.0.1:9000',bucket:'ccna-lesson-media',bytes:bytes.length,putGetMatched:true,retainedTestObject:`ccna-lessons/${key}`,databaseConnections:0,servicesRestarted:false}));
} catch(error) {
  console.log(JSON.stringify({status:'BLOCKED',stage:'adapter-connectivity',httpStatus:error?.$metadata?.httpStatusCode??null,details:'Withheld; no credentials or raw provider output printed.',databaseConnections:0}));
  process.exitCode=1;
}
