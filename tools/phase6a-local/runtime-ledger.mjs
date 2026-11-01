// Import is inert. Ledger verification uses an explicitly supplied migrator
// credential for a short READ ONLY preflight, never the application's pool/env.
import {policy,LocalRuntimeError,validateInput,preflight} from './policy.mjs';
import {verifyUpgradeState} from './upgrade.mjs';
export async function verifyRuntimeLedger(mode,input,ledgerPassword,manifest,snapshots,deps,flags={}){
  if(!['api','web','check'].includes(mode))throw new LocalRuntimeError('Separate ledger verification is runtime-only.');
  const runtime=validateInput(mode,input,flags);
  if(typeof ledgerPassword!=='string'||!ledgerPassword.length||ledgerPassword.includes('\0'))throw new LocalRuntimeError('Known migrator password is required for read-only migration verification. No application-role ledger grant or credential fallback is allowed.');
  const migrationInput={host:runtime.host,port:runtime.port,database:runtime.database,role:policy.migrationRole,password:ledgerPassword,systemIdentifier:runtime.systemIdentifier};
  const checked=await preflight('upgrade-verify',migrationInput,{
    verifyLocalService:deps.verifyLocalService,createClient:deps.createClient,
    onStage:stage=>deps.onStage?.('runtime-ledger-'+stage),
    upgradeState:(client,phase)=>{
      deps.onStage?.('runtime-migration-ledger');
      return (deps.verifyState??verifyUpgradeState)(client,manifest,snapshots,phase,false);
    },
  },{});
  try{return{identity:checked.identity,ledgerEntries:manifest.length,readOnly:true};}
  finally{await checked.client.end();}
}
