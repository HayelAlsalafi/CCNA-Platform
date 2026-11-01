// Canonical checkout location, independent of the operator's Windows profile.
// Database identities, roles, ports, SQL hashes and approval checks remain pinned.
import {realpathSync,readFileSync as rawReadFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const workspaceRoot=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
export const portableRoot=workspaceRoot.replaceAll('\\','/');
export function applicationQuiescenceScript(){
 const quoted=workspaceRoot.replaceAll("'","''");
 return `$ErrorActionPreference='Stop'; if(@(Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -in @(3000,8080)}).Count){throw 'Invariant: application-listeners'}; $script=Join-Path '${quoted}' 'tools/phase6a-local/run.mjs'; $pattern='*'+[System.Management.Automation.WildcardPattern]::Escape($script)+'*'; if(@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -like $pattern -and $_.CommandLine -match '\\s(api|web)\\s+--start'}).Count){throw 'Invariant: guarded-application-processes'}`;
}
export function readEvidenceFileSync(file,...options){
 try{return rawReadFileSync(file,...options);}catch(error){
  if(error?.code==='ENOENT'&&/[\\/]\.local[\\/]|canonical-chapters-(?:original-approval|plan)\.json$/.test(String(file))){
   const missing=new Error('Approved local evidence is missing. Restore it locally from the protected operator archive; see docs/maintenance/milestone-local-evidence.md. Never reconstruct receipts or bypass guards.');
   missing.code='LOCAL_EVIDENCE_REQUIRED';throw missing;
  }
  throw error;
 }
}
