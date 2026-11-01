import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {cleanEnvironment} from './policy.mjs';
test('only the six server media variables cross both API allowlists, never web or other modes',()=>{
  const names=['LESSON_MEDIA_PROVIDER','LESSON_MEDIA_S3_ENDPOINT','LESSON_MEDIA_S3_REGION','LESSON_MEDIA_S3_BUCKET','LESSON_MEDIA_S3_ACCESS_KEY_ID','LESSON_MEDIA_S3_SECRET_ACCESS_KEY'];
  const parent=Object.fromEntries(names.map(name=>[name,'isolated-configuration-fixture']));
  Object.assign(parent,{MINIO_ROOT_PASSWORD:'must-not-forward',AWS_SECRET_ACCESS_KEY:'must-not-forward',LESSON_MEDIA_EVIL:'must-not-forward'});
  const config={role:'ccna_phase6a_app',password:'fixture',publishableKey:'fixture',secretKey:'fixture'};
  const api=cleanEnvironment(parent,'api',config);
  for(const name of names)assert.equal(api[name],parent[name]);
  for(const name of ['MINIO_ROOT_PASSWORD','AWS_SECRET_ACCESS_KEY','LESSON_MEDIA_EVIL'])assert.equal(api[name],undefined);
  for(const mode of ['web','check','migrate','upgrade'])for(const name of names)assert.equal(cleanEnvironment(parent,mode,config)[name],undefined);
  const ps=readFileSync(new URL('./invoke.ps1',import.meta.url),'utf8');
  const forwarding=ps.slice(ps.indexOf("if ($Mode -eq 'api') {"));
  assert(forwarding.includes("api-credentials.xml"));for(const name of names)assert(forwarding.includes("'"+name+"'"));
  assert(forwarding.includes('Read-SeaweedMediaEnvironment'));
});

test('external Seaweed credentials are loaded without output; invalid/ambiguous files fail closed',()=>{
  const folder=path.resolve('.local/seaweed-config-fixtures');mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'credentials-fixture.json');
  const helper=path.resolve('tools/phase6a-local/seaweed-environment.ps1');
  const identity={credentials:[{accessKey:'fixture-access',secretKey:'fixture-secret'}]};
  const command=`$ErrorActionPreference='Stop'; . '${helper.replaceAll("'","''")}'; try { $v=Read-SeaweedMediaEnvironment -CredentialFile '${file.replaceAll("'","''")}'; if($v.Count -ne 6 -or $v.LESSON_MEDIA_S3_SECRET_ACCESS_KEY -ne 'fixture-secret' -or $v.LESSON_MEDIA_S3_BUCKET -ne 'ccna-lesson-media'){exit 3}; Write-Output 'PASS' } catch { Write-Output 'REJECTED'; exit 2 }`;
  try {
    for(const [document,status] of [[{identities:[identity]},0],[{identities:[identity,identity]},2],[{identities:[{credentials:[{accessKey:'fixture-access'}]}]},2]]){
      writeFileSync(file,JSON.stringify(document));
      const result=spawnSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8'});
      assert.equal(result.status,status,result.stderr);
      assert(!`${result.stdout}${result.stderr}`.includes('fixture-secret'));
    }
  } finally {unlinkSync(file);}
});
