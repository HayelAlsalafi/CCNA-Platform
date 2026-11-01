# Phase 2B migration 0014 readiness — NO-GO

Follow-up, 29 October 2026: authorized isolated restoration, migration and real
study persistence checks passed. See `phase-2b-0014-isolated-rehearsal-results.md`
for actual evidence, corrected proposed metadata checksums and remaining main
startup/activation gates. The blocked rehearsal status below is historical.

28 October 2026. Preparation only. Supersedes the pending-evidence sections of
`phase-2b-activation-readiness.md`; that report and
`phase-2b-interactive-study-and-authoring.md` were reviewed. No activation approval
is implied. No application records, permissions, official migrations or services
were changed during this review.

## Verified application baseline and fresh backup

The operator ran the new guarded, hidden-prompt backup once. Its transaction was
`REPEATABLE READ READ ONLY`, with exported snapshot and final ROLLBACK.

| Check | Actual result |
| --- | --- |
| Target | `127.0.0.1:5432/ccna_phase6a_dev` |
| PostgreSQL | 18.6; system identifier `7694701597474139084` |
| Directory / owner | `C:/Program Files/PostgreSQL/18/data` / `ccna_phase6a_migrator` |
| Ledger | Exactly 13 entries, IDs 1–13; every raw SQL hash and timestamp matched the reviewed manifest |
| Last migration | `0013_learning_lessons`, SHA-256 `e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3` |
| Schema | Existing 19-table 0013 snapshot matched table inventory/kinds/owners, columns, constraints, indexes, enums and sequences |
| Lessons | 2 lessons, 6 immutable revisions; revision function/trigger matched; exact existing lesson runtime privileges matched |
| Other content | 16 questions, 16 question revisions, 76 options, 48 chapters, 48 topics, 6 domains, 10 users |
| History | 6 attempts, 28 deliveries, 6 learning sessions, 28 session items, 3 learner achievements |
| Roles | App and migrator LOGIN; no superuser, CREATEDB, CREATEROLE, inheritance, replication, BYPASSRLS or memberships |
| Study objects | All three proposed tables absent |
| Application writes | 0 |

Fresh receipt:

`.local/question-bank-upgrade/study-2026-10-28T13-00-40.345Z-fab6cddb-244f-4569-a35b-be3b582e25f7/study-backup.json`

Archive: `before-upgrade.dump` in that directory, **145,546 bytes**, created from a
consistent snapshot on 28 October at 16:00 Riyadh time. SHA-256:

`adbf25e98a8f9473251a86d1c8e2e5fcd2b1ad77c345b6d0c26e92458193eaf8`

Independent offline verification re-read the protected receipt and archive,
matched size/hash, required all 19 `TABLE DATA` entries and the Drizzle ledger,
listed the archive and fully decoded it with `pg_restore --file=NUL`.
No decoded application rows or credentials were printed. Question-code sequence
was 152/called, ledger sequence 13/called, unchanged across backup capture.

**Readable backup is PASS; restoration is NOT VERIFIED.** The receipt's
`backupVerified:false` is retained because full recovery/rehearsal gates are not
complete; its `tocVerified`, `fullArchiveDecodeVerified` and `snapshotConsistent`
flags are true. Neither the operator result nor the independent verifier claims
a restore or migration rehearsal occurred.

## Migration and metadata review

Proposal: `lib/db/drizzle/proposed/0014_interactive_study.sql`.
Exact raw SHA-256:

`c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893`

No migration SQL was edited. It adds:

| Table | Keys / constraints / indexes | Proposed app privileges, NOT GRANTED |
| --- | --- | --- |
| `lesson_annotations` | UUID PK; user RESTRICT FK; composite `(revision_id,lesson_id)` RESTRICT FK; kind, color, body/category length, version, JSON anchor and highlight CHECKs; owner/lesson and owner/kind indexes; partial unique unanchored bookmark index; owner RLS USING/WITH CHECK | SELECT, INSERT, UPDATE, DELETE |
| `lesson_progress` | `(user_id,lesson_id,revision_id)` PK; user RESTRICT FK; composite revision RESTRICT FK; state/version CHECKs; owner/state index; owner RLS USING/WITH CHECK | SELECT, INSERT, UPDATE |
| `lesson_media` | UUID PK; creator RESTRICT FK; unique storage key; filename/MIME/size/hash CHECKs; creator/time index | SELECT, INSERT |

No existing table changes, data updates, sequences, GRANTs, SECURITY DEFINER
functions, DROP or TRUNCATE statements occur in the proposal. Additive DDL still
requires short locks, including referenced tables; future execution must bound
lock/statement waits and run with the API stopped. Do not assume a lock-free
migration. Migration 0012 (exam proposal) is unrelated and excluded.

Prepared **proposed only** metadata using installed Drizzle tooling:

- `proposed/meta/0014_snapshot.json`: SHA-256 `c5df2cd19a477f2dbb71fb24fc4f4a8340618e06af6499912fde56edf246307d`.
- `proposed/meta/0014_journal.json`: SHA-256 `e8132f0677ae5d0069d298c3a2b49c4ce9399b6203dd3600612411f6ae5feb6e`.
- Existing 19 tables and all other snapshot metadata unchanged; exactly 3 tables
  added. Previous snapshot ID chained to official 0013. Proposed journal copies
  the 13 existing entries and adds only index 13 / `0014_interactive_study` /
  timestamp `1793145600000`. The official journal remains at 13 entries.

`tools/study-activation/proposal.mjs` pins all three files and checks that exact
delta. Metadata generation is offline and write-once; do not rerun it over these
files or use it as a promotion command.

## Authentication, isolation and compatibility review

Source flow: registered Express study routes → existing Clerk/active PostgreSQL
user middleware → strict input schemas → owner-scoped service transaction →
Drizzle/SQL. Actor identity comes from the verified database user, never request
body/query ownership. Mutation session intent must match the verified Clerk
session. All personal reads/mutations include owner predicates and set
transaction-local `app.study_user`; the two RLS policies provide an additional
boundary for the non-owner, non-BYPASSRLS API role. Table owners bypass ordinary
RLS: privileged-owner tests alone would not establish learner isolation. The
custom setting is service-owned context, not an independent authentication token.

Revision and exact-text anchors are validated before inserts. Personal updates
require versions; completion is explicit; old-revision annotations are retained,
not silently moved. Draft/unpublished lesson access remains restricted. Study
writes do not modify official lessons or immutable revision snapshots. The
composite FKs prohibit mismatched lesson/revision pairs. Missing tables return
not-activated errors. Old lesson block contracts remain supported by current
schemas; generated contracts reproduce byte-for-byte. These are source and mocked
test findings, not PostgreSQL persistence evidence.

No real authenticated HTTP check was made: authentication middleware can update
login metadata, and this task forbids application writes. No browser verification
was performed.

## Isolated rehearsal — BLOCKED, not executed

Read-only OS listener inspection succeeded and found **zero listeners on 55440**.
The existing private cluster was left stopped. No connection, HBA change, restore,
SQL fixture, migration or permission change was attempted in isolation.

Existing candidate is `127.0.0.1:55440/ccna_drizzle_check_20261012_c08f12ad34b6`,
private owner `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170`, under
`.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data`.
Current database contents/emptiness/identity cannot be certified while stopped.
Do not reset it, create another environment, touch populated rehearsal databases,
or start services based on this document. The earlier 0013 rehearsal is not
evidence for 0014; its harness pins a pre-0013 backup and must not be reused
unchanged for this 19-table archive.

Required next isolated run, after explicit permission to start the private cluster
and verify its identity/state:

1. Reuse the exact-owner/loopback access helper with byte-for-byte HBA restoration;
   verify canonical directory, ownership marker, PostgreSQL binary/version, PID,
   exact listener and database owner before any test connection.
2. Refuse any unexpected/populated target state. Use the established outer-rollback
   restoration strategy only after adapting it for existing lessons/revisions.
   Handle their publication-pointer FK cycle explicitly; never disable FKs or
   immutable revision protections to force a restore. Compare all 19 restored
   table hashes, ledger and both sequences with this exact receipt.
3. Stage only the 13 pinned baseline files and proposed 0014 for the official
   Drizzle migrator. Verify the baseline through 0013, then apply 0014 within the
   disposable transaction. Verify all columns/defaults/keys/check expressions,
   valid indexes, owners, RLS enabled flags and exact policy expressions.
4. Verify repeat migrator execution changes no ledger/data; force a controlled
   migration failure in a savepoint and prove no partial DDL/ledger remains.
5. Exercise a restricted test role matching runtime privileges, two distinct
   synthetic learners and published/draft revisions. Persist/reopen notes,
   highlights/bookmarks and progress; prove owner isolation, missing-context denial,
   spoofed-owner rejection, stale-version rejection, mismatched-revision rejection,
   duplicate bookmark enforcement, overlap serialization and rollback preservation.
6. Confirm existing lesson reading/publication behavior and all original hashes;
   roll back fixtures/DDL/role changes, restore nontransactional sequence values,
   then independently verify the private baseline and HBA restoration. Never roll
   back/reset the application database.

All six items above are **NOT RUN**. Real RLS, PostgreSQL constraints, persistence,
concurrency, repeat execution, restoration and failure rollback remain unverified.

## Startup guards and activation command status

Current `phase6a-local/policy.mjs::migrationManifest` accepts the exact reviewed
13-entry lesson chain and verifies every source hash/timestamp.
`upgrade.mjs::upgradeSnapshots` selects the exact 0013 lesson snapshot.
`run.mjs::runtimePrivileges` validates lesson permissions and revision immutability.
These existing guards passed the operator's baseline inspection, and remain intact.

They **do not yet accept 14 entries**: the inventory and snapshot selection need an
explicit study-chain branch, plus exact three-table privilege/RLS-policy checks.
No wildcard acceptance or permission bypass was introduced to make readiness green.
That guard change must be prepared/tested with the isolated rehearsal before source
promotion; applying 0014 now would leave the guarded launcher refusing startup.

Exact commands available now (preparation only):

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/study-activation/readiness.mjs --plan
node tools/study-activation/verify-backup.mjs '.local/question-bank-upgrade/study-2026-10-28T13-00-40.345Z-fab6cddb-244f-4569-a35b-be3b582e25f7/study-backup.json'
```

The completed backup command was:

```powershell
powershell.exe -NoProfile -File tools/study-activation/prepare-backup.ps1 -Backup
```

Do not rerun it merely because restoration is blocked. Existing evidence is
retained; future activation must revalidate freshness/data drift and obtain a new
backup if necessary.

**No ready-to-run application activation command is supplied.** A guarded 0014-only
executor is not yet rehearsed or available. Do not substitute an unrestricted
`pnpm db:migrate`, manual SQL, an old lesson activator, or a fabricated apply command.
After the blocked gates pass, its exact PowerShell command must be presented with
the checksum, target and narrow privileges for separate explicit approval. It must
stage only approved 0014, validate all 13 prerequisites, use Drizzle, verify the
14-entry ledger/schema/RLS/permissions and compare preserved data before commit.
Existing approval for 0013 does not authorize 0014.

## Recovery and final decision

Before commit, migration/grants belong in one controlled transaction; a failure
must roll back without modifying the application baseline. Source promotion must
have a recorded outcome and must not be retried blindly after an unknown commit.
After a committed activation, do not drop study tables or erase newly created
personal data as a rollback. Stop relevant services, retain receipts and media,
prefer a reviewed forward correction, or test full database+media restoration in
isolation before requesting approval for any application restore. A dump without
proven restoration is insufficient recovery evidence.

**NO-GO for application activation.** Baseline and readable fresh backup passed;
isolated restoration/rehearsal, 14-entry startup compatibility and persistent media
configuration are still blocked/incomplete. See `phase-2b-media-storage-readiness.md`
for media safeguards and `phase-2b-verification-results.md` for actual commands and
test results. No application changes or service starts are authorized by this report.
