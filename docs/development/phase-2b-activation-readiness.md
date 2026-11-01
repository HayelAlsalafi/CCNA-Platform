# Phase 2B activation readiness — NO-GO

Update, 28 October 2026: the follow-up review and fresh backup evidence are in
`phase-2b-migration-0014-readiness.md`, with media details in
`phase-2b-media-storage-readiness.md` and actual check results in
`phase-2b-verification-results.md`. Those reports supersede this document's
pending backup/metadata statements. Application activation remains NO-GO.

28 October 2026. This is a review/preparation report, not execution approval.
Migration 0014 is proposed only. Current app data, roles, official migration chain,
backups and services were not modified by this task.

## Intended target and proposal

The established development target is `127.0.0.1:5432/ccna_phase6a_dev`, PostgreSQL
18.6, system identifier `7694701597474139084`, migrator/database owner
`ccna_phase6a_migrator`, API role `ccna_phase6a_app`. **This task made no live
database connection, so current identity/ledger/counts are not newly verified.**

Proposal: `lib/db/drizzle/proposed/0014_interactive_study.sql`.
SHA-256: `c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893`.
It adds only annotations, progress and media metadata. Existing users, lessons,
revision snapshots, chapters, questions, exam/practice history are referenced or
read, never updated/deleted by the migration. No grants or cleanup are embedded.

Source-level checks and 217 scoped tests pass, including SQL constraint/FK names,
owner predicates, current-revision checks, explicit completion and filesystem
safety. This does not prove actual PostgreSQL constraints, RLS or concurrent
behavior. No official 0014 journal/snapshot promotion or activation executor is
provided as ready to run.

## Required before a GO decision

1. Obtain an operator-run SELECT-only identity, complete 13-entry ledger/source
   checksum, schema/ownership/role and exact row/sequence inventory. Detect any
   unrelated pending migration; do not activate exam proposal 0012 implicitly.
2. Create a new consistent full backup using the established hidden-credential
   snapshot procedure. Keep old backups. Verify SHA-256, archive TOC/full decoding
   and a complete isolated restoration with row/sequence preservation. The old
   0013 activation backup is not a current baseline for 0014.
3. Verify authorization, identity and empty/baseline state of an existing disposable
   environment before any connection. Do not reset a populated database. Rehearse
   only in a separately authorized isolated database; startup/HBA changes need their
   own authorization if not already available. Leave the application untouched.
4. Exercise real Drizzle migration application/repeat/failure rollback; PK/FK/CHECK/
   unique constraints, RLS enabled/policies, restricted app role and no-owner/BYPASSRLS
   attributes. Verify explicit owner context fails closed when absent, spoofed owner
   bodies fail and guessed foreign IDs cannot read/update/delete another learner's
   data. Verify revision mismatch, overlap concurrency, progress version races and
   transaction rollback. Preserve all pre-existing row hashes and code sequences.
5. Prepare exact proposed Drizzle journal/snapshot metadata based on official 0013;
   review schema/SQL/RLS consistency. Add reviewed runtime source/hash, table/
   ownership/constraint/RLS and exact permission guards before promotion. Current
   guards deliberately reject an unexpected 14-entry inventory; do not bypass them.
6. Rehearse storage together with metadata: upload → save draft → publish → read,
   unpublish → deny learner read, ADMIN preview, replacement/shared-image retention,
   orphan/unknown commit failure and backup restoration. Rehearse actual app-role
   permissions rather than only a privileged owner.
7. Verify actual signed-in browser desktop/mobile workflows with test-only data,
   then present the exact target, reviewed hash, backup/restore evidence, scope and
   narrow privileges for explicit application activation approval.

## Required narrow runtime privileges — proposal, NOT EXECUTED

After schema/role/RLS verification, the minimum proposed additions for
`ccna_phase6a_app` are:

| Table | Proposed permissions |
| --- | --- |
| `lesson_annotations` | SELECT, INSERT, UPDATE, DELETE, constrained by owner RLS and owner-scoped API |
| `lesson_progress` | SELECT, INSERT, UPDATE, constrained by owner RLS and owner-scoped API |
| `lesson_media` | SELECT, INSERT; upload requires DB ADMIN, learner reads require published reference |

No new sequences, schema CREATE, database CREATE, role membership, BYPASSRLS,
superuser, TRUNCATE, history DELETE or unrestricted official-content permissions
are required. No SECURITY DEFINER function is introduced. Session intent headers
remain preconditions only; existing Clerk verification/PostgreSQL user status
and role remain authoritative.

## Smallest safe storage proposal — not provisioned

For single-machine development, use one dedicated private directory outside Vite
public assets, with NTFS ACLs limited to the runtime/operator account and approved
backup operator. A candidate is
`%LOCALAPPDATA%/CCNA-NEXUS\lesson-media`; it is a **proposal**, not
an existing verified or created directory. No existing shared directory should be
repurposed automatically. Verify canonical non-reparse path, ownership, free space,
quota/monitoring and access before enabling it.

The optional `LESSON_MEDIA_ROOT` is unset by default. The current guarded launcher
does not pass it through; a narrowly scoped, separately reviewed configuration/
allowlist change is needed after the exact directory is approved. Do not weaken
the environment/service/identity guards to make upload work. No dependency or
external provider is assumed.

Storage uses opaque UUID keys, exclusive creation, bounded image/MIME/dimension
checks and metadata hashes. It serves only through the authenticated media API,
never an unrestricted static directory or tokens in URLs. The filesystem adapter
is suitable only for an intentionally configured single-instance environment;
production/multiple instances require a separately approved durable object-store
adapter and backup policy.

## Recovery and cleanup rules

- Back up the PostgreSQL metadata and the complete referenced media object set,
  with a key/size/SHA-256 manifest. A database dump alone does not recover binaries.
- Preserve all objects referenced by **any draft or immutable revision**, including
  unpublished revisions. Removal/replacement of a block does not authorize deletion.
- A failed or uncertain metadata insert can leave a private orphan. Retain it for
  review; do not delete automatically on an unknown commit outcome.
- Any future prune operation must independently prove no draft/revision reference,
  enforce canonical key/root/hash/age and receive separate cleanup approval. No
  cleanup endpoint/job was activated or supplied as an operational command here.
- Restore the database and media into isolation first, verify all hashes and
  real authenticated image reads. Do not restore or reset the live application
  automatically. A successful future activation should be forward-recovered if
  private records have subsequently been created; do not casually drop them.

## Remaining blockers

No fresh 0014 baseline/backup, PostgreSQL rehearsal, RLS integration verification,
proposed promotion metadata/executor, expanded startup permission inventory,
approved/provisioned media root, complete database+media recovery rehearsal or real
browser verification exists yet for Phase 2B. Accordingly **NO-GO for activation**.

Authoring and reading-comfort source enhancements can use the existing schema once
the updated API/frontend are manually loaded. Private study APIs and direct image
uploads must continue to report not-activated states until the gates above pass.
Do not run migrations, grants or storage provisioning based solely on this report.
