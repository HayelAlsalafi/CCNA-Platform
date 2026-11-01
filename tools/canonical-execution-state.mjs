// SELECT-only diagnosis. Source promotion is not proof of database execution.
import assert from 'node:assert/strict';
import {canonicalSources} from './canonical-chapters-policy.mjs';
import {migrationManifest,assertLedger} from './phase6a-local/policy.mjs';
import {verifyUpgradeState,upgradeSnapshots} from './phase6a-local/upgrade.mjs';
import {assertBankState,rowProof} from './question-bank-upgrade-core.mjs';

export function assertCanonicalExecutionLedger(ledger,manifest,baseline) {
  assert.equal(manifest.length,12,'Status requires the exact reviewed promoted canonical chain');
  assert([11,12].includes(ledger.length),'Unexpected canonical execution ledger inventory');
  assertLedger(ledger,manifest.slice(0,ledger.length));
  assert(ledger.every(r=>Number.isSafeInteger(r.id)&&r.id>0),'Invalid migration ledger identity');
  assert.equal(new Set(ledger.map(r=>r.id)).size,ledger.length,'Duplicate migration ledger identity');
  assert.deepEqual(ledger.slice(0,11),baseline,'Reviewed baseline ledger changed');
}

export async function canonicalExecutionState(client,root) {
  const {plan}=canonicalSources(root),manifest=migrationManifest(root);
  assert.equal(manifest.length,12,'Status requires the exact reviewed promoted canonical chain');
  const ledger=(await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
  assertCanonicalExecutionLedger(ledger,manifest,plan.baselineLedger);
  if(ledger.length===11) {
    // Retain the complete pre-reset schema/function/privilege checks. Only the
    // source planner is omitted: the full twelve-file source chain was checked above.
    await assertBankState(client,root,{manifest:manifest.slice(0,11)});
  } else {
    await verifyUpgradeState(client,manifest,upgradeSnapshots(root),'after',false);
  }
  const tables=[...plan.clearTables,...plan.preservedTables,...(ledger.length===12?['curriculum_chapters']:[])];
  const proof=await rowProof(client,tables);
  const changedTables=Object.keys(plan.rowProof).filter(t=>
    proof[t].count!==plan.rowProof[t].count||proof[t].hash!==plan.rowProof[t].hash);
  const codeSequence=(await client.query('SELECT last_value::text,is_called FROM public.question_code_seq')).rows;
  return {
    sourceEntries:12,ledgerEntries:ledger.length,
    state:ledger.length===11?'SOURCE_PROMOTED_DATABASE_BASELINE':'MIGRATION_APPLIED_REVIEW_RESET_STATE',
    counts:Object.fromEntries(Object.entries(proof).map(([t,p])=>[t,p.count])),
    changedTables,
    preservedTablesUnchanged:plan.preservedTables.every(t=>!changedTables.includes(t)),
    codeSequenceUnchanged:JSON.stringify(codeSequence)===JSON.stringify(plan.questionCodeSequence),
    resetRetryAuthorizedByDiagnostic:false,
  };
}
