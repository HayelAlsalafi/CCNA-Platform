import test from 'node:test';
import assert from 'node:assert/strict';
import {Module,createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {configureFrontendNativePaths,loadFrontendDependencies} from './frontend.mjs';
import {LocalRuntimeError} from './policy.mjs';

const root=process.cwd();
test('refreshes Node native lookup from existing workspace packages without preserving arbitrary NODE_PATH',()=>{
  const previous=process.env.NODE_PATH;
  try {
    process.env.NODE_PATH='UNTRUSTED-LOOKUP';
    const paths=configureFrontendNativePaths(root);
    assert(paths.length>1);
    assert(paths.every(p=>p.startsWith(path.join(root,'.local/native-deps/node_modules'))&&existsSync(p)));
    assert.equal(process.env.NODE_PATH,paths.join(path.delimiter));
    assert(paths.every(p=>Module.globalPaths.includes(p)));
    const require=createRequire(path.join(root,'artifacts/ccna-learning/package.json'));
    for(const name of ['@rollup/rollup-win32-x64-msvc','lightningcss-win32-x64-msvc','@tailwindcss/oxide-win32-x64-msvc'])
      assert(require.resolve(name).startsWith(root));
  } finally {
    if(previous===undefined)delete process.env.NODE_PATH;else process.env.NODE_PATH=previous;
    Module._initPaths();
  }
});
test('imports the exact guarded Vite/React/Tailwind startup dependencies without DB or env files',async()=>{
  const stages=[];
  const deps=await loadFrontendDependencies(root,s=>stages.push(s));
  assert.deepEqual(stages,['frontend-import-vite','frontend-import-react','frontend-import-tailwind']);
  for(const fn of Object.values(deps))assert.equal(typeof fn,'function');
});
test('dependency diagnostic omits raw loader errors and paths',async()=>{
  await assert.rejects(loadFrontendDependencies(path.join(root,'.local/nonexistent-frontend-fixture')),
    error=>error instanceof LocalRuntimeError&&error.message.includes('vite')&&!error.message.includes(root));
});
test('Vite creates and closes with the guarded plugins without listening or loading environment files',async()=>{
  const {createServer,react,tailwindcss}=await loadFrontendDependencies(root);
  const server=await createServer({configFile:false,envDir:false,
    root:path.join(root,'artifacts/ccna-learning'),
    cacheDir:path.join(root,'.local/phase6a-runtime/frontend-smoke-cache'),
    plugins:[react(),tailwindcss()],logLevel:'silent',
    server:{middlewareMode:true,hmr:false,watch:null}});
  try {assert.equal(server.httpServer,null);assert.equal(server.config.envDir,false);}
  finally {await server.close();}
});
