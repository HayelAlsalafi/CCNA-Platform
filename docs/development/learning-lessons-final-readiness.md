# Phase 2A.3 — final lesson activation readiness

## Activation continuation evidence — 28 October 2026

The first approved activation stopped before migration/grants/source promotion:
only the users fingerprint had changed. A SELECT-only diagnostic confirmed zero
other clients, the exact 12-entry ledger/schema and unchanged remaining tables and
sequences. No field-level cause is inferred from the users hash alone.

The operator created a new consistent backup without overwriting the original:
`.local/question-bank-upgrade/lessons-2026-10-27T21-10-38.180Z-0491c14c-c71d-44c5-9cda-ab24e32aeadf/before-upgrade.dump`.
Size: 130948 bytes; SHA-256:
`ef4e8eb7dd4d734f929d8d80990c0839d7553d5df6ea057f12c559a65c40bc1a`.
Its full inventory, identity, roles, ledger, proposal and sequences were compared
with the original. Only the users fingerprint changed, to
`60be418540bb26eedc34063465d861ef3daccf4348d707848bd39b2a3a39af84`;
all 10 current accounts are preserved by the refreshed baseline.

The existing isolated lesson test passed all 11 groups against this new archive,
including exact restoration, migration/repeat/failure rollback, lesson services,
permissions and old-data preservation. Receipt beneath the new backup directory:
`lesson-rehearsal-859695b9-9d30-4450-96c2-f52289a42ecb/rehearsal.json`.
Private schema/data/sequences and HBA were restored; application connections/writes
were zero. Only `staging.mjs` backup pins and `activation.mjs` rehearsal receipt
were refreshed. No fingerprint tolerance or migration SQL was changed. These pins
supersede the original backup/rehearsal references below. The approved activation
command remains the same; live activation is still pending operator execution.

Assessment: 27 October 2026. **GO for requesting the exact activation approval;
application activation has NOT been performed.** The application remains on the
12-entry migration chain. No application grants, lessons, question data or learner
data were changed during this preparation. This document supersedes the open
backup/rehearsal blockers in the Phase 2A.2 assessment.

## Exact reviewed target and source

| Item | Verified value |
| --- | --- |
| Workspace | `<repository-root>` |
| Branch / HEAD | `main` / `3c07b4bb7fe807e60dcbcd5539c046b919a9956f` |
| Application target | `127.0.0.1:5432/ccna_phase6a_dev` |
| PostgreSQL / system identifier | 18.6 / `7694701597474139084` |
| Data directory | `C:/Program Files/PostgreSQL/18/data` |
| Migrator / database owner | `ccna_phase6a_migrator` |
| Runtime role | `ccna_phase6a_app` |
| Proposed SQL | `lib/db/drizzle/proposed/0013_learning_lessons.sql` |
| SQL SHA-256 | `e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3` |

The operator's fresh-backup command verified exact identity, 12 ledger hashes,
timestamps and IDs, baseline schema/ownership, restricted login roles and required
schema permissions. Lesson objects were absent. Existing rows: 16 questions,
76 options, 16 revisions, 6 attempts, 28 deliveries, 6 learning sessions,
28 session items, 48 topics, 48 chapters, 6 domains, 10 users, 7 achievement
definitions and 3 learner achievements. Other baseline tables were empty.

## Fresh backup: PASS

Directory relative to the project:

`.local/question-bank-upgrade/lessons-2026-10-27T20-47-18.713Z-a19fd42b-6230-46ce-a0b8-ec1f1b609e4c/`

- Archive: `before-upgrade.dump`, 130949 bytes.
- SHA-256: `8825a80aae9500cd7989c45e0180830ddaaa8a4a45b742eb04af22d3792b394e`.
- Receipt: `lesson-backup.json`; captured at `2026-10-27T20:47:19.655Z`.
- Full custom archive, exported repeatable-read READ ONLY snapshot, no overwrite
  of previous backups; Windows operator-only ACL protection.
- TOC checks cover all 17 application tables and migration ledger. Full archive
  decoding passed. Both sequence values were stable during capture.
- Application writes: zero. Password supplied only through the hidden operator
  prompt and child stdin, never a stored environment file or command argument.

## Isolated restoration and migration: PASS

Only `127.0.0.1:55440/ccna_drizzle_check_20261012_c08f12ad34b6` was connected.
The existing PostgreSQL 18.6 private cluster was started after checking its
canonical path, ownership marker, configuration, unused port and installed binary.
Verified startup PID: 44268; listener: `127.0.0.1:55440`.
The cluster is left running. Its private system identifier differs from the
application's. Neither populated rehearsal database was connected or modified.

Latest successful receipt beneath the backup directory:

`lesson-rehearsal-d19e4ef4-a411-4b20-b281-c4d9b92b1a73/rehearsal.json`

The harness verified the existing disposable database was empty, staged the
reviewed baseline through the real Drizzle migrator, and restored every archived
public-table row. All 17 table counts and SHA-256 fingerprints matched the fresh
backup. This is a transactional logical restore onto the reviewed baseline schema;
it does not claim a standalone cluster/global-role restore. Archive SQL was not
executed. Table/column names and decoded data were strictly checked before inserts.
Two INSERT-only attempt policies were temporarily disabled solely inside the
private restore transaction to load historical rows, then reenabled. Foreign keys,
CHECK constraints and immutable UPDATE/DELETE guards stayed enabled throughout.

Actual PostgreSQL results:

| Assertion group | Result |
| --- | --- |
| Fresh backup restoration, all row fingerprints | PASS |
| Deliberate migration error and partial-DDL rollback | PASS, server SQLSTATE `22012`; no lesson tables or ledger row survived |
| Official Drizzle lesson migration and repeat execution | PASS; 13 ledger rows, no duplicate on repeat |
| Table/column/NOT NULL/FK/CHECK/index/trigger/function metadata | PASS |
| Draft create, retrieve, edit, stale-version conflict | PASS |
| Draft unavailable to learner; published revision readable | PASS |
| Working-copy changes preserve published snapshot; unpublish hides it | PASS |
| Revision mutation rejection | PASS, SQLSTATE `23001` |
| Invalid chapter and cross-lesson published revision | PASS, SQLSTATE `23503` |
| Least-privilege role and forbidden DELETE/revision UPDATE | PASS, SQLSTATE `42501` |
| Existing application-table fingerprints and question-code sequence | PASS |
| Outer rollback, original disposable schema/ledger/data/sequences | PASS |
| Temporary exact-owner HBA allowance restored byte-for-byte | PASS |

The synthetic NOLOGIN privilege-probe role was transactional and disappeared on
rollback. Existing private sequence values were explicitly restored and verified.
No application connection was made by the rehearsal.

Two preparation defects were corrected transparently: Windows command-line
quoting initially prevented private-cluster startup; then a restore ordering error
correctly raised `23503` when questions preceded their chapters. The failed
restoration rolled back. Chapter-first restoration passed without relaxing FKs.
The later deliberate `22012` is a successful negative test, not an unexpected
migration failure. All archives and receipts were retained.

## Lesson-only promotion and runtime permissions

Official journal and existing SQL files remain unchanged. Prepared metadata:

- `lib/db/drizzle/proposed/meta/0013_journal.json`: existing entries unchanged,
  appended index 12, tag `0013_learning_lessons`, timestamp `1793059200000`.
- `lib/db/drizzle/proposed/meta/0013_snapshot.json`: predecessor is 0011; old
  table metadata unchanged, only the two lesson tables added.
- Drizzle schema FK names now explicitly match the existing proposal SQL names.
  No SQL statement or migration checksum was changed.

The installed Drizzle migrator's actual execution passed with 0013 after 0011.
It follows journal ordering rather than requiring consecutive filename numbers.
**Exam proposal 0012 is excluded.** Any future exam promotion needs a fresh
review relative to the resulting lesson schema; do not append its older snapshot
or timestamp automatically.

Runtime launcher checks now distinguish the lesson-only 13-entry chain from the
separate exam chain, enforcing the correct inventory, exact migration pins and
immutable-revision function/trigger. Existing baseline checks remain active.

Future activation grants only:

```sql
GRANT SELECT, INSERT, UPDATE ON public.lessons TO ccna_phase6a_app;
GRANT SELECT, INSERT ON public.lesson_revisions TO ccna_phase6a_app;
```

No new sequences exist. No role changes, schema CREATE grants, ledger access,
history UPDATE/DELETE, TRUNCATE, REFERENCES, TRIGGER or MAINTAIN privileges are
granted. The migrator already has required schema creation and ownership rights.
The revision trigger function remains invoker-security with fixed search path,
PUBLIC privileges revoked, and exact source/owner/trigger checks.

## Exact future activation command — do not run before approval

Explicit approval must name migration 0013 (hash above), the exact application
database/system identifier and the two new-table runtime grants. Stop API and
frontend and close other application-database clients first; leave PostgreSQL
running. Then, **only after that approval**, run once:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/lesson-activation/apply-lessons.ps1 -Apply -ConfirmReviewedLessons
```

Enter the known migrator credential only at the hidden local prompt. The command
requires the exact reviewed backup and passing rehearsal receipt, installed service
identity, workspace/HEAD, 12-entry ledger/schema and unchanged table fingerprints
and sequence state. It locks baseline tables with bounded waits, rejects other
clients, applies only 0013 with the official Drizzle migrator in its outer
transaction, grants the two precise privileges, verifies full catalog/permissions
and old data, promotes only reviewed source metadata, then commits.

Expected result: `stage:complete`, `committed:true`, `commitOutcome:COMMITTED`,
`sourcePromoted:true`, `ledgerEntries:13`, `existingRowsPreserved:true`,
`questionCodeSequencePreserved:true`, `lessonsActivated:true`, plus a receipt path.
The complete application executor has **not** been run. Its intent refusals and
source-promotion helpers were tested offline; the actual migration, repeat-run,
failure rollback, services and privilege primitives passed on PostgreSQL in isolation.

## Risks and recovery

- Activation briefly SHARE-locks baseline tables and takes FK locks. Lock and
  statement timeouts fail closed. Stop clients before execution; there is no
  background termination of other sessions.
- Any data change since this backup, including login timestamps, stops activation.
  Obtain a new verified backup/rehearsal and review the changed baseline rather
  than bypassing it. Do not blindly rerun a stopped command.
- PostgreSQL DDL/grants/ledger inserts are transactional; sequence increments are
  not. A late failed activation can advance the migration ledger's internal ID
  sequence. The tool will not reset an application sequence automatically. The
  question-code sequence is never intentionally advanced.
- Filesystem promotion and PostgreSQL COMMIT cannot form one atomic transaction.
  A source-write or commit failure may leave reviewed source files promoted but
  the database rolled back, or an unknown commit outcome. The command retains
  receipts and fails closed; inspect exact source/ledger state before any recovery.
  No automatic file rollback, application restore, SQL retry or down migration is
  attempted. Windows journal replacement may also fail if another tool holds it.
- Preserve this full backup. A disaster recovery restore requires separately
  reviewed identity, outage and recovery approval; never restore blindly over the
  live database. The exercised restore path is isolated and rollback-only.
- New lesson revisions are immutable; do not promise a destructive down migration
  after lessons have been authored. Forward correction is preferred.

## Verification performed

| Command | Actual result |
| --- | --- |
| Operator `prepare-backup.ps1 -Backup` | PASS; fresh consistent archive above |
| `node tools/run-curriculum-tests.mjs --lesson-db` | PASS, 1 PostgreSQL test with 11 assertion groups |
| `node --test tools/lesson-activation/readiness.test.mjs tools/lesson-activation/activation.test.mjs` | PASS, 13 offline tests |
| Selected `policy`, `runtime-startup`, `runtime-ledger` Node tests | PASS, 172 tests |
| `node tools/run-curriculum-tests.mjs --lessons` | PASS, 173 tests / 10 files |
| `node tools/check-admin.mjs` | PASS, API/frontend/schema/client TypeScript |
| `node tools/build-admin-ui.mjs` | PASS, production compilation |

Build emitted existing UI source-map notices and a >500 kB bundle warning; these
were not investigated as unrelated work. No unrelated failing suites were run.
PowerShell parsing, JS syntax and scoped diff checks are recorded with the final
verification. No secret files were read, dependencies installed or commits created.

## Post-activation acceptance

After a successful activation receipt, restart the guarded API and frontend using
their usual hidden prompts:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
# In another terminal in the same project:
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

At `http://localhost:8080/admin/lessons`, sign in as a real Admin, select a chapter,
create a draft, save, reopen it and verify content persisted. Preview unsaved
changes; publish a valid revision, edit the working copy and confirm the learner
still sees the published snapshot. Unpublish and confirm learner access is denied.
Inspect authenticated `/api/admin/lessons`, `/api/admin/lessons/:id`, revision and
learner `/api/lessons/:id` responses; unauthorized callers must remain rejected.
Do not place credentials or Clerk tokens in commands or chat.

Real HTTP authentication/Admin authorization is covered by database-free route
tests; PostgreSQL services and least-privilege behavior were exercised in isolation.
Signed-in browser execution against the intended activated application is still
**NOT VERIFIED**, because activation is intentionally withheld and browser access
is unavailable. Do not claim application end-to-end saving until those checks pass.

## Changed files for this preparation

New activation directory contains `backup.mjs`, `prepare-backup.ps1`,
`start-private.ps1`, `staging.mjs`, `transaction-client.mjs`, `policy.mjs`,
`activation.mjs`, `apply.mjs`, `apply-lessons.ps1`, `activation.test.mjs`, and
`isolated.db.test.ts`. Existing `readiness.mjs` gains an optional read-only snapshot
callback. Added `tools/lesson-db.config.mjs` and the two proposed metadata files.
Updated `tools/run-curriculum-tests.mjs`, `tools/phase6a-local/policy.mjs`,
`tools/phase6a-local/run.mjs`, and `lib/db/src/schema/lessons.ts`. No existing
migration SQL or official migration journal/snapshot was changed.
