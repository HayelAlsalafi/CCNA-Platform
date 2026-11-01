import {assertDeletionProposal,assertDeletionFunction} from '../lesson-deletion/policy.mjs';
import {assertMediaProposal} from '../media-activation/proposal.mjs';
import {assertMediaRuntimeCatalog} from '../media-activation/runtime.mjs';
// Reviewed study validators, shared by isolated verification and the guarded launcher.
import assert from "node:assert/strict";
import { readSchemaCatalog, assertSchemaCatalog } from "../phase6a-local/upgrade.mjs";
import { assertLedger, migrationManifest } from "../phase6a-local/policy.mjs";
import { assertStudyProposal, studyMigration } from "./proposal.mjs";
export const canonicalOwnerPolicy = (s) =>
  s
    .replace(/\bNULLIF(?=\s*\()/g, "nullif")
    .replace(/::text\b/g, "")
    .replace(/[()\s"]/g, "");
export function proposedStudyManifest(root) {
  const baseline = migrationManifest(root);
  assertStudyProposal(root);
  if(baseline.length===16){assertDeletionProposal(root);return baseline;}
  if (baseline.length === 15) {assertMediaProposal(root);return baseline;}
  if (baseline.length === 14) {
    assert.equal(baseline.at(-1).tag, studyMigration[0]);
    return baseline;
  }
  assert.equal(baseline.length, 13);
  assert.equal(baseline.at(-1).tag, "0013_learning_lessons");
  return [
    ...baseline,
    { tag: studyMigration[0], when: studyMigration[1], hash: studyMigration[2] },
  ];
}
export async function assertStudyRuntimeCatalog(client, root, owner) {
  const promoted=migrationManifest(root);
  if(promoted.length>=15){const checked=await assertMediaRuntimeCatalog(client,root,promoted,owner);if(promoted.length===16)await assertDeletionFunction(client,root,owner);return checked;}
  const { snapshot } = migrationManifest(root).length===15?assertMediaProposal(root):assertStudyProposal(root),
    actual = await readSchemaCatalog(client);
  assert(
    actual.tables.every((t) => t.owner === owner),
    "Unexpected real table ownership",
  );
  assertSchemaCatalog(
    { ...actual, tables: actual.tables.map((t) => ({ ...t, owner: "ccna_phase6a_migrator" })) },
    snapshot,
  );
  const ledger = (
    await client.query(
      "SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id",
    )
  ).rows;
  assertLedger(ledger, proposedStudyManifest(root));
  assert.deepEqual(
    ledger.map((r) => r.id),
    Array.from({ length: proposedStudyManifest(root).length }, (_, i) => i + 1),
  );
  await assertStudyPolicies(client);
  return {
    ledgerEntries: ledger.length,
    tables: actual.tables.length,
    rlsPolicies: 2,
    ownershipMatched: true,
  };
}
export async function assertStudyPolicies(client) {
  const rls = (
    await client.query(
      "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.lesson_annotations'::regclass,'public.lesson_progress'::regclass,'public.lesson_media'::regclass]) ORDER BY relname",
    )
  ).rows;
  assert.deepEqual(rls, [
    { relname: "lesson_annotations", relrowsecurity: true, relforcerowsecurity: false },
    { relname: "lesson_media", relrowsecurity: false, relforcerowsecurity: false },
    { relname: "lesson_progress", relrowsecurity: true, relforcerowsecurity: false },
  ]);
  const policies = (
    await client.query(
      "SELECT c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text,pg_get_expr(p.polqual,p.polrelid) AS using,pg_get_expr(p.polwithcheck,p.polrelid) AS check FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE p.polrelid=ANY(ARRAY['public.lesson_annotations'::regclass,'public.lesson_progress'::regclass,'public.lesson_media'::regclass]) ORDER BY c.relname,p.polname",
    )
  ).rows;
  assert.equal(policies.length, 2);
  const normalized = canonicalOwnerPolicy;
  const expected = normalized("user_id=nullif(current_setting('app.study_user',true),'')::uuid");
  for (const [i, name] of ["lesson_annotations", "lesson_progress"].entries()) {
    const p = policies[i];
    assert.equal(p.relname, name);
    assert.equal(p.polname, name + "_owner");
    assert.equal(p.polcmd, "*");
    assert.equal(p.polpermissive, true);
    assert.equal(p.polroles, "{0}");
    assert.equal(normalized(p.using), expected);
    assert.equal(normalized(p.check), expected);
  }
}
export async function assertStudyPrivileges(client, role) {
  const rows = (
    await client.query(
      `SELECT n.name,has_table_privilege($1,n.name,'SELECT') AS select,has_table_privilege($1,n.name,'INSERT') AS insert,has_any_column_privilege($1,n.name,'UPDATE') AS update,has_table_privilege($1,n.name,'DELETE') AS delete,has_table_privilege($1,n.name,'TRUNCATE') AS truncate,has_any_column_privilege($1,n.name,'REFERENCES') AS references,has_table_privilege($1,n.name,'TRIGGER') AS trigger,has_table_privilege($1,n.name,'MAINTAIN') AS maintain FROM (VALUES('public.lesson_annotations'),('public.lesson_media'),('public.lesson_progress')) n(name) ORDER BY n.name`,
      [role],
    )
  ).rows;
  assert.deepEqual(
    rows,
    ["lesson_annotations", "lesson_media", "lesson_progress"].map((name) => ({
      name: "public." + name,
      select: true,
      insert: true,
      update: name !== "lesson_media",
      delete: name === "lesson_annotations",
      truncate: false,
      references: false,
      trigger: false,
      maintain: false,
    })),
  );
}
