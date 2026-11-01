import {assertExamSource} from './exam-policy.mjs';
// Exact source/function validators. Import has no database or filesystem writes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
export const multipleAnswerMigration = Object.freeze([
  '0009_multiple_answer_questions',
  1792108800000,
  'cd2ea484ba1b6f850eb1f64b95fbe91869deecd2093061e05336588819492cef',
]);
export const universalDeleteMigration = Object.freeze([
  '0010_universal_question_deletion',
  1792108801000,
  '31d30aba74261ab2cdcf3e1bc5298fab4b9fd3e7743f1f1659255a4a26fd7b5f',
]);
const snapshotHashes = {
  9: '10f211d40144383d46846ea84cb9ee3141fbe06732035318f6bc842011947fa6',
  10: 'f681ae60d268a89d789d163bda80730f096e97a4bb16d3acaa15975dbc6d73c6',
};
export function questionBankSnapshot(root, index = 10) {
  assert([9, 10].includes(index));
  const tag = String(index).padStart(4, '0'),
    bytes = readFileSync(path.join(root, 'lib/db/drizzle/proposed/meta/' + tag + '_snapshot.json'));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    snapshotHashes[index],
    'Question bank snapshot changed',
  );
  const official = path.join(root, 'lib/db/drizzle/meta/' + tag + '_snapshot.json');
  if (existsSync(official))
    assert(readFileSync(official).equals(bytes), 'Official/proposed snapshot mismatch');
  return JSON.parse(bytes);
}
export function assertQuestionBankSource(root, index = 10) {
  for (const [i, m] of [
    [9, multipleAnswerMigration],
    [10, universalDeleteMigration],
  ]) {
    if (i > index) continue;
    const bytes = readFileSync(path.join(root, 'lib/db/drizzle/proposed/' + m[0] + '.sql'));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      m[2],
      'Question bank SQL changed',
    );
    questionBankSnapshot(root, i);
  }
  const nine = questionBankSnapshot(root, 9);
  if (index === 10) assert.equal(questionBankSnapshot(root, 10).prevId, nine.id);
}
function bodies(source) {
  return new Map(
    [
      ...source.matchAll(
        /CREATE(?: OR REPLACE)? FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g,
      ),
    ].map((m) => [m[1], m[2]]),
  );
}
export async function assertQuestionBankFunctions(
  client,
  root,
  index = 10,
  owner = 'ccna_phase6a_migrator',
  runtimeRole = 'ccna_phase6a_app',
) {
  assertQuestionBankSource(root, index===12?10:index);
  if(index===12)assertExamSource(root);
  if (runtimeRole === null)
    assert.equal(
      owner,
      'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170',
      'Only exact disposable owner may omit live-role privilege assertions',
    );
  const definitions = new Map();
  for (const name of [
    '0004_question_revisions',
    '0006_controlled_history_delete',
    multipleAnswerMigration[0],
    ...(index >= 10 ? [universalDeleteMigration[0]] : []),
  ]) {
    const file =
      name.startsWith('0004') || name.startsWith('0006')
        ? 'lib/db/drizzle/'
        : 'lib/db/drizzle/proposed/';
    for (const [n, b] of bodies(readFileSync(path.join(root, file + name + '.sql'), 'utf8')))
      definitions.set(n, b);
  }
  if(index===12){
    definitions.set('execute_question_deletion_pre_exam',definitions.get('execute_question_deletion'));
    for(const [name,body] of bodies(readFileSync(path.join(root,'lib/db/drizzle/proposed/0012_exam_simulator.sql'),'utf8')))definitions.set(name,body);
  }
  const names = [
    'validate_question_snapshot',
    'validate_revision_attempt',
    'reject_revision_history_change',
    'delete_question_with_history',
    ...(index >= 10
      ? ['execute_question_deletion', 'delete_question_without_learner_history',...(index===12?['execute_question_deletion_pre_exam']:[])]
      : []),
  ];
  const rows = (
    await client.query(
      `SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,pg_get_userbyid(p.proowner) AS owner,p.proargtypes::text AS arguments,p.prorettype::regtype::text AS result,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
 CASE WHEN $2::text IS NULL THEN NULL ELSE has_function_privilege($2,p.oid,'EXECUTE') END AS runtime_execute
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1::text[]) ORDER BY p.proname`,
      [names, runtimeRole],
    )
  ).rows;
  assert.equal(rows.length, names.length, 'Missing or overloaded question functions');
  for (const r of rows) {
    const grading = r.name.startsWith('validate_'),
      wrapper = [
        'delete_question_with_history',
        'delete_question_without_learner_history',
      ].includes(r.name);
    assert.equal(r.owner, owner, 'Unexpected function owner');
    assert.equal(r.body, definitions.get(r.name), 'Question function body drift: ' + r.name);
    assert.equal(r.definer, !grading);
    assert.deepEqual(r.config, [
      grading ? 'search_path=pg_catalog, public' : 'search_path=pg_catalog',
    ]);
    assert.equal(
      r.arguments,
      grading || r.name === 'reject_revision_history_change'
        ? ''
        : ['execute_question_deletion','execute_question_deletion_pre_exam'].includes(r.name)
          ? '2950 2950 16'
          : '2950 2950',
    );
    assert.equal(
      r.result,
      grading || r.name === 'reject_revision_history_change' ? 'trigger' : 'jsonb',
    );
    // The real application's reviewed bootstrap revokes PUBLIC execution on
    // every trigger function. The private fixture owner predates that bootstrap.
    assert.equal(r.public_execute, grading && runtimeRole===null, 'Unexpected public execution');
    if (runtimeRole !== null)
      assert.equal(r.runtime_execute, wrapper, 'Unexpected runtime function privilege');
  }
  if(runtimeRole!==null)assert.equal((await client.query("SELECT has_type_privilege($1,'public.question_type_v2','USAGE') AS type_usage",[runtimeRole])).rows[0]?.type_usage,true,'Missing runtime usage on reviewed question enum');
  if (index >= 10) {
    const denied = (
      await client.query(
        `SELECT CASE WHEN $1::text IS NULL THEN false ELSE has_table_privilege($1,'public.question_deletion_audits','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.question_deletion_audits'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege($1,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')) END AS unsafe,
 EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid='public.question_deletion_audits'::regclass),acldefault('r',(SELECT relowner FROM pg_class WHERE oid='public.question_deletion_audits'::regclass)))) a WHERE a.grantee=0) AS public_access`,
        [runtimeRole],
      )
    ).rows[0];
    assert(
      denied && denied.unsafe === false && denied.public_access === false,
      'Recovery/audit table must be operator-restricted',
    );
  }
}
