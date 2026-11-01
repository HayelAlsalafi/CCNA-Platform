import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readinessPlan, inspectReadiness, proposal } from './readiness.mjs';
const root = process.cwd();
const plan = readinessPlan(root);
test('offline plan pins the exact target and migration while refusing apply support', () => {
  assert.equal(plan.applySupported, false);
  assert.equal(plan.databaseWrites, 0);
  assert.equal(plan.target.database, 'ccna_phase6a_dev');
  assert.equal(plan.target.systemIdentifier, '7694701597474139084');
  assert.equal(plan.manifest.length, 12);
  assert.equal(proposal.sha256, 'e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3');
});
test('plan command runs without a database URL or password input', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/DATABASE|CLERK|NEON|^PG|DOTENV|NODE_OPTIONS/i.test(key)));
  const output = execFileSync(process.execPath, ['tools/lesson-activation/readiness.mjs', '--plan'], {env, encoding:'utf8', timeout:15000});
  assert.equal(JSON.parse(output).databaseWrites, 0);
});
test('unknown and apply flags are refused before PostgreSQL or credential processing', () => {
  for (const flag of ['--apply','--rehearse','--cleanup']) {
    const result = spawnSync(process.execPath, ['tools/lesson-activation/readiness.mjs', flag], {encoding:'utf8',timeout:15000});
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).stage, 'offline-preflight');
    assert.equal(JSON.parse(result.stdout).recommendation, 'NO-GO');
  }
});
test('a wrong server identity stops the read-only transaction before catalog or row reads', async () => {
  const queries=[];
  const client={query:async(query)=>{queries.push(query);return {rows:[{identity:{database:'another_database'}}]};}};
  await assert.rejects(inspectReadiness(client,{role:'ccna_phase6a_migrator',systemIdentifier:plan.target.systemIdentifier},plan,root));
  assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1),'ROLLBACK');
  assert(!queries.some(query=>query.includes('FROM public.')));
});
test('ledger drift is refused and transaction rolled back before schema inspection', async () => {
  const queries=[];
  const identity={database:plan.target.database,sessionRole:plan.target.owner,host:plan.target.host,port:5432,versionNumber:180006,dataDirectory:'C:/Program Files/PostgreSQL/18/data',systemIdentifier:plan.target.systemIdentifier,neon:null};
  const client={query:async(query)=>{queries.push(query);return {rows:query.includes('identity()')?[{identity}]:[]};}};
  await assert.rejects(inspectReadiness(client,{role:plan.target.owner,systemIdentifier:plan.target.systemIdentifier},plan,root),/ledger/);
  assert.equal(queries.at(-1),'ROLLBACK');
  assert(!queries.some(query=>query.includes('FROM pg_roles')));
});
test('operator launcher carries credentials through hidden stdin, without an apply switch', () => {
  const script=readFileSync('tools/lesson-activation/check-readiness.ps1','utf8');
  assert.match(script,/-AsSecureString/);
  assert.match(script,/RedirectStandardInput = \$true/);
  assert.match(script,/EnvironmentVariables.Clear\(\)/);
  assert.doesNotMatch(script,/\[switch\]\$Apply|PGPASSWORD|DATABASE_URL|\.env/);
});
