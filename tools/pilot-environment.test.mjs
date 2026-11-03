import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanEnvironment} from './phase6a-local/policy.mjs';
test('pilot security settings cross API-only allowlists without inheriting arbitrary variables',()=>{
 const names=['ALLOWED_ORIGINS','API_TRUST_PROXY','API_RATE_WINDOW_MS','API_RATE_GLOBAL','API_RATE_ADMIN','API_RATE_UPLOADS','API_RATE_EXAM_START','API_RATE_PRACTICE_SUBMIT'];
 const parent=Object.fromEntries(names.map(n=>[n,'fixture']));parent.UNREVIEWED='never-forward';
 const config={role:'ccna_phase6a_app',password:'fixture',publishableKey:'fixture',secretKey:'fixture'};
 for(const name of names){assert.equal(cleanEnvironment(parent,'api',config)[name],'fixture');for(const mode of ['web','check'])assert.equal(cleanEnvironment(parent,mode,config)[name],undefined);}
 assert.equal(cleanEnvironment(parent,'api',config).UNREVIEWED,undefined);
 const ps=readFileSync(new URL('./phase6a-local/invoke.ps1',import.meta.url),'utf8');
 const api=ps.slice(ps.indexOf("if ($Mode -eq 'api') {"));for(const name of names)assert(api.includes("'"+name+"'"));
});
