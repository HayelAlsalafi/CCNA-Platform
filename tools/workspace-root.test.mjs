import test from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {workspaceRoot,portableRoot,readEvidenceFileSync,applicationQuiescenceScript} from './workspace-root.mjs';
import {policy,assertWorkspace,assertIdentity,migrationManifest,LocalRuntimeError} from './phase6a-local/policy.mjs';
test('canonical repository binding replaces personal paths without accepting another checkout',()=>{
 assert.equal(workspaceRoot,realpathSync(process.cwd()));assert.equal(policy.root,portableRoot);
 assertWorkspace(workspaceRoot,workspaceRoot,policy.branch);
 assert.throws(()=>assertWorkspace(workspaceRoot,path.join(workspaceRoot,'wrong-checkout'),policy.branch),LocalRuntimeError);
 assert.throws(()=>assertWorkspace(workspaceRoot,workspaceRoot,'other'),LocalRuntimeError);
 assert.equal(migrationManifest(workspaceRoot).length,16);
});
test('database identity and migration guards remain pinned',()=>{
 const config={role:policy.migrationRole,systemIdentifier:policy.upgradeSystemIdentifier};
 const identity={host:policy.host,port:policy.port,database:policy.database,sessionRole:config.role,systemIdentifier:config.systemIdentifier,dataDirectory:policy.dataDirectory,versionNumber:180006,neon:null};
 assertIdentity(identity,config);
 for(const change of [{database:'other'},{port:55440},{systemIdentifier:'0'},{dataDirectory:'other'}])assert.throws(()=>assertIdentity({...identity,...change},config));
});
test('missing evidence is explicit, fails closed and does not create or substitute receipts',()=>{
 assert.throws(()=>readEvidenceFileSync(path.join(workspaceRoot,'.local','absent-milestone-evidence.json')),e=>e.code==='LOCAL_EVIDENCE_REQUIRED'&&e.message.includes('Never reconstruct receipts'));
 assert.deepEqual(readEvidenceFileSync(path.join(workspaceRoot,'package.json')),readFileSync(path.join(workspaceRoot,'package.json')));
});
test('quiescence script retains application ports and exact checkout process matching',()=>{
 const script=applicationQuiescenceScript();assert(script.includes('@(3000,8080)'));assert(script.includes(workspaceRoot.replaceAll("'","''")));assert(script.includes('WildcardPattern'));assert(script.includes('guarded-application-processes'));
});
