// Test-only historical checkout. All guards run unmodified against its own
// workspace root. No database, .local archive, credential or real promotion.
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export async function examSourceFixture(repository=process.cwd()) {
  const work=mkdtempSync(path.join(tmpdir(),'ccna-exam-source-test-'));
  const root=path.join(work,'baseline');mkdirSync(root);
  const files=execFileSync('git',['ls-files','-z','--cached','--',
    'tools','lib/db','lib/ccna-book-chapters.ts','lib/canonical-chapters.json','lib/lesson-study.ts',
    'artifacts/api-server/src/lib/exams.ts','artifacts/api-server/src/lib/question-revisions.ts',
    'artifacts/api-server/src/routes/exams.ts'],{cwd:repository}).toString().split('\0').filter(Boolean);
  // Explicit owner authorization covers only these two local source proofs.
  files.push('tools/canonical-chapters-original-approval.json','tools/canonical-chapters-plan.json');
  for(const relative of new Set(files)) {
    assert(!/(^|\/)(\.local|node_modules)(\/|$)|(^|\/)\.env(?:\.|$)|\.(dump|log|bak)$/.test(relative));
    if(['lib/db/drizzle/0017_exam_simulator.sql','lib/db/drizzle/meta/0017_snapshot.json','lib/db/drizzle/meta/_journal.json'].includes(relative))continue;
    const target=path.join(root,relative);mkdirSync(path.dirname(target),{recursive:true});
    cpSync(path.join(repository,relative),target);
  }
  cpSync(path.join(root,'lib/db/drizzle/proposed/meta/0016_journal.json'),path.join(root,'lib/db/drizzle/meta/_journal.json'));
  const load=relative=>import(pathToFileURL(path.join(root,relative)).href);
  const activation=await load('tools/exam-activation/activation.mjs');
  const policy=await load('tools/phase6a-local/policy.mjs');
  const plan=activation.sourcePlan(root);
  assert.equal(plan.manifest.length,17);assert.equal(policy.migrationManifest(root).length,16);
  // Preserve evidence that setup never rewinds/promotes the real checkout.
  assert.equal(JSON.parse(readFileSync(path.join(repository,'lib/db/drizzle/meta/_journal.json'))).entries.length,17);
  return {root,work,plan,activation,policy};
}

// The operational service-fixture helper still supports its historical native
// installation. Unit tests use the installed compiler instead, without reading
// .local or changing the helper/DB-shim/metafile safety assertions.
export function installedServiceRequire(repository) {
  const req=createRequire(path.join(repository,'artifacts/api-server/package.json'));
  const compiler=req('esbuild');
  const adapter=id=>id.replaceAll('\\','/').endsWith('/esbuild/lib/main.js')?{
    buildSync(options) {
      const previous=process.env.ESBUILD_BINARY_PATH;
      delete process.env.ESBUILD_BINARY_PATH;
      try {return compiler.buildSync({...options,nodePaths:[path.join(repository,'artifacts/api-server/node_modules'),path.join(repository,'lib/db/node_modules'),path.join(repository,'node_modules')]});}
      finally {if(previous===undefined)delete process.env.ESBUILD_BINARY_PATH;else process.env.ESBUILD_BINARY_PATH=previous;}
    }
  }:req(id);
  return adapter;
}
