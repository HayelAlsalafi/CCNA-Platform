// Offline reproducibility check using installed tools only. No database or env files.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const files=['lib/api-spec/openapi.yaml','lib/api-spec/study.openapi.json',...['lesson','study'].flatMap(name=>[`lib/api-client-react/src/${name}-api/api.ts`,`lib/api-client-react/src/${name}-api/api.schemas.ts`,`lib/api-zod/src/${name==='lesson'?'lessons':'study'}/api.ts`])];
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const before=Object.fromEntries(files.map(file=>[file,digest(file)]));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/DATABASE|CLERK|NEON|^PG|DOTENV|NODE_OPTIONS|^VITE_/i.test(key)));
env.ESBUILD_BINARY_PATH=path.resolve('.local/native-deps/node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe');
const run=args=>execFileSync(process.execPath,args,{env,stdio:'pipe',timeout:120000,windowsHide:true,maxBuffer:1024*1024});
run(['tools/prepare-phase2b-contracts.mjs']);run(['tools/prepare-study-spec.mjs']);
for(const config of ['lessons','study'])run(['node_modules/.pnpm/orval@8.30.0_prettier@3.9.6_typescript@5.9.3/node_modules/orval/dist/bin/orval.mjs','--config',`lib/api-spec/orval.${config}.config.ts`]);
assert.deepEqual(Object.fromEntries(files.map(file=>[file,digest(file)])),before,'Generated contracts are not reproducible');
console.log(JSON.stringify({codegen:'PASS',files:files.length,databaseConnections:0,dependencyInstallations:0}));
