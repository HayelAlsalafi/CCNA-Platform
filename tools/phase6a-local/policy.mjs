import {exam17Migration,assertExamProposal} from '../exam-activation/proposal.mjs';
import {portableRoot,workspaceRoot} from "../workspace-root.mjs";
import {deletionMigration,assertDeletionProposal} from '../lesson-deletion/policy.mjs';
import {mediaMigration,assertMediaProposal} from '../media-activation/proposal.mjs';
import {studyMigration,assertStudyProposal} from '../study-activation/proposal.mjs';
import {examMigration,assertExamSource} from '../exam-policy.mjs';
import {lessonMigration,assertLessonSource,isLessonChain} from '../lesson-activation/policy.mjs';
import {canonicalMigration,canonicalSources} from "../canonical-chapters-policy.mjs";
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {nexusMigration,assertNexusSource} from '../nexus-policy.mjs';
import {learningMigration,assertLearningSource} from '../learning-policy.mjs';
import {multipleAnswerMigration,universalDeleteMigration,assertQuestionBankSource} from '../question-bank-policy.mjs';

export const policy = Object.freeze({
  root: portableRoot,
  branch: 'main',
  upgradeSystemIdentifier: '7694701597474139084',
  host: '127.0.0.1', port: 5432, database: 'ccna_phase6a_dev',
  appRole: 'ccna_phase6a_app', migrationRole: 'ccna_phase6a_migrator',
  dataDirectory: 'C:/Program Files/PostgreSQL/18/data',
  clerkInstance: 'bursting-pangolin-4222.clerk.accounts.dev',
});
export class LocalRuntimeError extends Error {}
const fail = message => { throw new LocalRuntimeError(message); };
const normalizePath = value => String(value).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
export function assertWorkspace(root, cwd, branch) {
  if (normalizePath(root) !== normalizePath(policy.root) || normalizePath(cwd) !== normalizePath(root) ||
      branch !== policy.branch) fail('Wrong worktree or branch; stop.');
}
export function validateInput(mode, input, flags = {}) {
  if (!['check','migrate','upgrade','upgrade-check','upgrade-verify','api','web'].includes(mode)) fail('Invalid local operation.');
  if (['migrate','upgrade'].includes(mode) && flags.apply !== true) fail('Migrations require explicit --apply and separate approval.');
  if (['api','web'].includes(mode) && flags.start !== true) fail('Runtime requires explicit --start and separate approval.');
  if ((!['migrate','upgrade'].includes(mode) && flags.apply) || (!['api','web'].includes(mode) && flags.start)) fail('Unexpected operation flag.');
  if (!input || Array.isArray(input) || typeof input !== 'object') fail('Configuration must be an object.');
  const allowed = ['host','port','database','role','password','systemIdentifier','publishableKey','secretKey'];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('Unsupported configuration field; no connection URLs or overrides.');
  if (input.host !== policy.host || input.port !== policy.port || input.database !== policy.database)
    fail('Database must be the exact approved local target.');
  const migrationMode = mode === 'migrate' || mode.startsWith('upgrade');
  const role = migrationMode ? policy.migrationRole : policy.appRole;
  if (input.role !== role) fail('Wrong database role for this operation.');
  if (typeof input.password !== 'string' || !input.password.length || input.password.includes('\0'))
    fail('A privately supplied database password is required.');
  if (typeof input.systemIdentifier !== 'string' || !/^[0-9]{10,25}$/.test(input.systemIdentifier))
    fail('Confirmed local cluster fingerprint is required.');
  if (mode.startsWith('upgrade') && input.systemIdentifier !== policy.upgradeSystemIdentifier)
    fail('Upgrade requires the exact approved PostgreSQL system identifier.');
  if (!migrationMode) {
    if (typeof input.publishableKey !== 'string' || !/^pk_test_[A-Za-z0-9_-]+$/.test(input.publishableKey))
      fail('Clerk development publishable key is required.');
    let instance;
    try { instance = Buffer.from(input.publishableKey.slice(8), 'base64url').toString('utf8'); } catch {}
    if (instance !== policy.clerkInstance + '$') fail('Wrong Clerk development instance.');
    if (mode !== 'web' && (typeof input.secretKey !== 'string' || !/^sk_test_[A-Za-z0-9_-]+$/.test(input.secretKey)))
      fail('Clerk development secret key is required.');
    if (mode === 'web' && input.secretKey !== undefined) fail('Frontend must not receive a Clerk secret key.');
  } else if (input.publishableKey !== undefined || input.secretKey !== undefined) fail('Migration process must not receive Clerk credentials.');
  return Object.freeze({ ...input });
}
export function assertIdentity(identity, input) {
  if (!identity || identity.database !== policy.database || identity.sessionRole !== input.role ||
      identity.host !== policy.host || identity.port !== policy.port ||
      !Number.isInteger(identity.versionNumber) || identity.versionNumber < 180000 || identity.versionNumber >= 190000 ||
      normalizePath(identity.dataDirectory) !== normalizePath(policy.dataDirectory) ||
      identity.systemIdentifier !== input.systemIdentifier || (identity.neon !== null && identity.neon !== ''))
    fail('Actual PostgreSQL identity does not match the approved local cluster.');
  return identity;
}
export function connection(input) {
  return { host: policy.host, port: policy.port, database: policy.database, user: input.role,
    password: input.password, ssl: false, options: '-c statement_timeout=10000',
    application_name: 'ccna-phase6a-local', connectionTimeoutMillis: 5000, query_timeout: 10000 };
}
export function applicationUrl(input) {
  const url = new URL('postgresql://' + policy.host + ':' + policy.port + '/' + policy.database);
  url.username = encodeURIComponent(input.role); url.password = encodeURIComponent(input.password);
  return url.toString(); // Never log this return value.
}
export function cleanEnvironment(parent, mode, input) {
  const result = {};
  for (const name of ['SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'])
    if (typeof parent[name] === 'string') result[name] = parent[name];
  result.NODE_ENV = 'development'; result.RUN_DB_TESTS = '0'; result.NO_COLOR = '1';
  if (mode === 'api') {
    result.PORT = '3000'; result.DATABASE_URL = applicationUrl(input);
    result.CLERK_PUBLISHABLE_KEY = input.publishableKey; result.CLERK_SECRET_KEY = input.secretKey;
    result.LOG_LEVEL = 'warn';
    for (const name of ['LESSON_MEDIA_PROVIDER','LESSON_MEDIA_S3_ENDPOINT','LESSON_MEDIA_S3_REGION','LESSON_MEDIA_S3_BUCKET','LESSON_MEDIA_S3_ACCESS_KEY_ID','LESSON_MEDIA_S3_SECRET_ACCESS_KEY'])
      if (typeof parent[name] === 'string') result[name] = parent[name];
  }
  if (mode === 'web') {
    result.PORT = '8080'; result.BASE_PATH = '/';
    result.VITE_CLERK_PUBLISHABLE_KEY = input.publishableKey;
  }
  return result;
}
export const migrations = Object.freeze([
  ['0000_baseline', 1790841815042, '2a55dfb3f5baa120c73fafa108d32d409e9c3130e7e1470e42892e3bf0cd13b0'],
  ['0001_question_domain', 1791178791105, 'fc7800e87e44e3c680f6ca285fa9c00dd3c6a3d5aa0343f042bdd9e49f2b0607'],
  ['0002_question_code_immutable', 1791178792322, '42f3139c262d2b3435c622b06d92975eda86e37a483f9fc3109be5e53dc857ce'],
  ['0003_practice_attempts', 1791446400000, '3a2f14c26f815cae79e904c47e137758e7a8ece90de8567e3a5b30fb2800bec1'],
  ['0004_question_revisions', 1791694800000, '74584d593471b633abd8387f44d15c19b9cdd49b3fa54cfaa26712d1c043b495'],
  ['0005_exam_taxonomy', 1791808640068, 'd1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226'],
    ['0006_controlled_history_delete', 1791964800000, '2b77bb268d42f33d2fe24d0fb909939e8253a17e751c5b56beebb6332dfaf298'],
]);
export function migrationManifest(root) {
  const dir = path.join(root, 'lib/db/drizzle');
  const journal = JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8'));
  const lessonOnly=journal.entries.length===13&&journal.entries[12]?.tag===lessonMigration[0];
  const reviewed=journal.entries.length===17?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration,lessonMigration,studyMigration,mediaMigration,deletionMigration,exam17Migration]:journal.entries.length===16?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration,lessonMigration,studyMigration,mediaMigration,deletionMigration]:journal.entries.length===15?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration,lessonMigration,studyMigration,mediaMigration]:journal.entries.length===14?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration,lessonMigration,studyMigration]:journal.entries.length===13?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration,lessonOnly?lessonMigration:examMigration]:journal.entries.length===12?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration,canonicalMigration]:journal.entries.length===11?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration,universalDeleteMigration]:journal.entries.length===10?[...migrations,nexusMigration,learningMigration,multipleAnswerMigration]:journal.entries.length===9?[...migrations,nexusMigration,learningMigration]:journal.entries.length===8?[...migrations,nexusMigration]:migrations;
  if (journal.entries.length !== reviewed.length) fail('Migration inventory changed; review required.');
  if(reviewed.length>=8)assertNexusSource(root);
  if(reviewed.length>=9)assertLearningSource(root);
  if(reviewed.length>=10)assertQuestionBankSource(root,reviewed.length===10?9:10);
  if(reviewed.length>=12)canonicalSources(root);
  if(reviewed.length===13){if(lessonOnly)assertLessonSource(root);else assertExamSource(root);}
  if(reviewed.length>=14){assertLessonSource(root);assertStudyProposal(root);}
  if(reviewed.length>=15)assertMediaProposal(root);
  if(reviewed.length>=16)assertDeletionProposal(root);
  if(reviewed.length===17)assertExamProposal(root);
  return reviewed.map(([tag, when, expected], index) => {
    const entry = journal.entries[index];
    if (entry.tag !== tag || entry.when !== when || entry.idx !== index) fail('Migration journal changed; review required.');
    const sql = readFileSync(path.join(dir, tag + '.sql'), 'utf8');
    // Historical 0000-0006 policy pins normalized content; later proposals pin
    // exact reviewed bytes (including the existing CRLF bytes of 0007/0008).
    const digest = createHash('sha256').update(index>=7?sql:sql.replaceAll('\r\n', '\n')).digest('hex');
    if (digest !== expected) fail('Reviewed migration content changed; stop.');
    return { tag, when, hash: createHash('sha256').update(sql).digest('hex') };
  });
}
export function assertLedger(rows, manifest) {
  if (rows.length !== manifest.length || rows.some((row, index) =>
      String(row.created_at) !== String(manifest[index].when) || row.hash !== manifest[index].hash))
    fail('Migration ledger differs from reviewed migration files.');
}
export function runtimeTableInventory(manifest) {
  const inventory=manifest.length;
  const tables=['exam_blueprints','exam_domains','exam_objectives','practice_attempts','practice_deliveries','question_objectives','question_options','question_revisions','questions','topics','users'];
  if(inventory>=8)tables.push('learning_sessions','learning_session_items');
  if(inventory>=9)tables.push('achievement_definitions','learner_achievements');
  if(inventory>=11)tables.push('question_deletion_audits');
  if(inventory>=12)tables.push('curriculum_chapters');
  if(inventory===13){if(isLessonChain(manifest))tables.push('lessons','lesson_revisions');else if(manifest.at(-1)?.tag===examMigration[0])tables.push('exam_sessions','exam_session_items');else fail('Unrecognized runtime migration chain.');}
  if(inventory===14||inventory===15||inventory===16||inventory===17){if(manifest[12]?.tag!==lessonMigration[0]||manifest[13]?.tag!==studyMigration[0])fail('Unrecognized study migration chain.');tables.push('lessons','lesson_revisions','lesson_annotations','lesson_progress','lesson_media');}
  if(inventory>=15&&(manifest[14]?.tag!==mediaMigration[0]||manifest[14]?.when!==mediaMigration[1]||manifest[14]?.hash!==mediaMigration[2]))fail('Unreviewed media migration.');
  if(inventory>=16&&(manifest[15]?.tag!==deletionMigration[0]||manifest[15]?.when!==deletionMigration[1]||manifest[15]?.hash!==deletionMigration[2]))fail('Unreviewed deletion migration.');
  if(inventory===17){assertExamProposal(policy.root);if(manifest[16]?.tag!==exam17Migration[0]||manifest[16]?.when!==exam17Migration[1]||manifest[16]?.hash!==exam17Migration[2])fail('Unreviewed exam migration.');tables.push('exam_sessions','exam_session_items');}
  if(inventory>17)fail('Unreviewed runtime migration count.');
  return tables.sort();
}
export function assertRuntimePrivileges(p) {
  const required = ['catalog_select','catalog_insert','catalog_update','options_delete','attempt_select','attempt_insert','user_select','user_insert','profile_update','code_usage','revision_select','revision_insert','delivery_select','delivery_insert'];
  const forbidden = ['superuser','createdb','createrole','replication','bypassrls','inherited_membership','database_create','temp','schema_create','ledger_access','role_update','status_update','user_delete','history_update','history_delete','code_update','revision_update','revision_delete','revision_truncate','delivery_update','delivery_delete','delivery_truncate'];
  const missing = required.filter(k => p?.[k] !== true);
  const unexpected = forbidden.filter(k => p?.[k] !== false);
  // Staged rollout: retain the original no-DELETE profile, or accept only the
  // exact reviewed two-table grant. Partial/missing/nonboolean evidence fails.
  if(typeof p?.question_delete!=='boolean'||typeof p?.topic_delete!=='boolean'||p.question_delete!==p.topic_delete)
    unexpected.push('question_delete','topic_delete');
  if (missing.length || unexpected.length)
    fail('Application database privileges differ from the approved scope. Missing or unverified required checks: ' +
      (missing.join(', ') || 'none') + '. Unexpected or unverified forbidden checks: ' + (unexpected.join(', ') || 'none') + '.');
}
export async function preflight(mode, input, deps, flags) {
  const stage = name => deps.onStage?.(name);
  stage('configuration-validation');
  const config = validateInput(mode, input, flags);
  stage('postgres-service');
  await deps.verifyLocalService(); // Read-only OS service/listener check before any connection.
  stage('postgres-client');
  const client = deps.createClient(connection(config));
  try {
    stage('postgres-connect');
    await client.connect();
    stage('postgres-read-only');
    await client.query('BEGIN READ ONLY');
    stage('postgres-identity');
    const identity = (await client.query('SELECT local_runtime_guard.identity() AS identity')).rows[0]?.identity;
    assertIdentity(identity, config);
    stage('postgres-role');
    const attrs = (await client.query("SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls, EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS membership FROM pg_catalog.pg_roles r WHERE rolname=session_user")).rows[0];
    if (!attrs || ['rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls','membership'].some(key => attrs[key] !== false)) fail('Unexpected database role attributes or memberships.');
    if (mode === 'migrate') {
      stage('postgres-empty-schema');
      const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows;
      const ledger = (await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS ledger")).rows[0]?.ledger;
      if (tables.length || ledger !== null) fail('Initial migration requires an empty application schema and no ledger.');
    } else if (mode.startsWith('upgrade')) {
      stage('postgres-upgrade-state');
      if (!deps.upgradeState) fail('Upgrade state verifier is required.');
      await deps.upgradeState(client, mode === 'upgrade-verify' ? 'after' : 'before');
    } else {
      stage('postgres-table-inventory');
      // information_schema hides relations without caller privileges. The audit
      // table deliberately grants the runtime role no access; inventory must
      // inspect catalog metadata without granting access to its protected rows.
      const relations = (await client.query("SELECT c.relname AS table_name,c.relkind AS relation_kind FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','f') ORDER BY c.relname")).rows;
      const tables=relations.map(row=>row.table_name);
      const expectedTables=runtimeTableInventory(migrationManifest(policy.root));
      const safeName=value=>typeof value==='string'&&/^[a-z_][a-z_0-9]{0,62}$/.test(value)?value:'<invalid-identifier>';
      if (JSON.stringify(tables) !== JSON.stringify(expectedTables.sort())) {
        const missing=expectedTables.filter(name=>!tables.includes(name)).map(safeName);
        const unexpected=tables.filter(name=>!expectedTables.includes(name)).map(safeName);
        fail('Expected application tables are missing or unexpected. Missing: '+(missing.join(', ')||'none')+'. Unexpected: '+(unexpected.join(', ')||'none')+'.');
      }
      if(relations.some(row=>row.relation_kind!=='r'))
        fail('Unexpected application relation kind: '+relations.filter(row=>row.relation_kind!=='r').map(row=>safeName(row.table_name)).join(', ')+'. Ordinary tables are required.');
      stage('postgres-runtime-privileges');
      assertRuntimePrivileges(await deps.runtimePrivileges(client));
    }
    stage('postgres-read-only-finish');
    await client.query('ROLLBACK');
    return { client, config, identity };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    await client.end(); throw error;
  }
}
export function safeError(error) {
  return error instanceof LocalRuntimeError ? error.message : 'Local operation failed; no credentials or driver error details are printed.';
}
export function serviceFailureInvariant(error) {
  const known = ['postgres-service-inspection','postgres-service-identity','postgres-listener-inspection',
    'postgres-loopback-listener','postgres-listener-ownership','api-listener-inspection',
    'api-listener-identity','api-process-inspection','api-process-metadata','api-process-identity'];
  const match = String(error?.stderr ?? '').match(/Invariant: ([a-z-]+)/)?.[1];
  return known.includes(match) ? match : 'service-check';
}
