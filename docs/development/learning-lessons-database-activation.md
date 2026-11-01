# Phase 2A.2 — lesson database activation assessment

**Recommendation: NO-GO. Migration 0013 has not been applied or promoted.**

Assessed 27 October 2026. The target, existing ledger, baseline schema and role
capabilities have been verified through the operator-run SELECT-only diagnostic.
There is no verified current restore point or completed lesson PostgreSQL rehearsal.
Application activation approval has not been requested because these prerequisites
are still incomplete. No application data, role privileges or migrations changed.

## Database readiness: verified evidence

The operator ran:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/lesson-activation/check-readiness.ps1 -Check
```

The sanitized result confirms:

| Invariant | Actual result |
| --- | --- |
| Workspace / branch / HEAD | Exact project path; `main`; `3c07b4bb7fe807e60dcbcd5539c046b919a9956f` |
| Host / port / database | `127.0.0.1:5432/ccna_phase6a_dev` |
| PostgreSQL / system identifier | 18.6 (`180006`); `7694701597474139084` |
| Data directory | `C:/Program Files/PostgreSQL/18/data` |
| Session and database owner | `ccna_phase6a_migrator` |
| Ledger | Exactly 12 entries, IDs 1–12; hashes/timestamps match reviewed 0000–0011 source |
| Schema | Matches official 0011 snapshot, including table ownership, columns and constraints |
| Lesson tables/function | Absent |
| Role capabilities | App/migrator can login; neither has superuser, createdb, createrole, inheritance, replication, bypass-RLS or role-membership capabilities |
| Schema permissions | Migrator CREATE/USAGE on public, USAGE on drizzle; API role USAGE on public |
| Diagnostic writes | Zero; repeatable-read READ ONLY transaction followed by ROLLBACK |

Current counts, not deletion targets:

| Table | Rows |
| --- | ---: |
| users | 10 |
| topics / curriculum_chapters | 48 / 48 |
| exam_blueprints / exam_domains | 1 / 6 |
| questions / question_options / question_revisions | 16 / 76 / 16 |
| practice_attempts / practice_deliveries | 6 / 28 |
| learning_sessions / learning_session_items | 6 / 28 |
| achievement_definitions / learner_achievements | 7 / 3 |
| exam_objectives / question_objectives / question_deletion_audits | 0 / 0 / 0 |

Exam persistence proposal 0012 is absent from the official chain and baseline
schema. No PostgreSQL exam tables are present in this verified baseline. This
does not authorize deleting browser state, activating the separate exam proposal,
or assuming that future exam history is disposable.

## Migration review

Exact proposal:
`lib/db/drizzle/proposed/0013_learning_lessons.sql`

SHA-256:
`e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3`

It creates only `public.lessons`, `public.lesson_revisions`, their indexes,
`public.reject_lesson_revision_mutation()` and its trigger. It does not change
existing question, answer, practice, topic, chapter, user or exam rows. There are
no DROP, TRUNCATE, seed, reset or existing-table data-update operations.

- Chapter FK targets existing `curriculum_chapters.id`; author/editor FKs target
  `users.id`. All are RESTRICT.
- `(published_revision_id, lessons.id)` references
  `(lesson_revisions.id, lesson_id)`, preventing cross-lesson publication.
- Revision numbers are unique per lesson. IDs are UUIDs; there are no new sequences.
- Revision UPDATE/DELETE is rejected by a trigger with SQLSTATE 23001.
- The trigger function fixes its search path to `pg_catalog` and revokes PUBLIC
  privileges. No grants are embedded in the proposal.
- API validation additionally bounds content size and block structure. SQL checks
  do not themselves validate every semantic block; supported writes must continue
  through authenticated Admin APIs.

Source/Drizzle consistency is covered by the existing focused tests. PostgreSQL
execution of these new constraints/triggers remains **NOT VERIFIED**.

### Dependency and ordering decision

0013 depends semantically on the existing 0011 chapter schema and users. It has
no SQL dependency on exam proposal 0012. Inspection of the installed Drizzle
`readMigrationFiles()` and PostgreSQL dialect confirms that execution follows
journal entries and their `when` values; consecutive numeric filename prefixes
are not enforced by the migrator.

Therefore a **lesson-only** promotion after 0011 is technically possible, leaving
0012 unapplied. It must be explicitly designed and rehearsed: append an entry at
journal index 12 with the reviewed 0013 tag and a strictly newer timestamp; create
a snapshot whose predecessor is 0011. Do not insert 0012 into the application
chain merely to fill a filename gap. Any future exam proposal would then need
its own reviewed rebasing/promotion plan; its current files remain unchanged.

The guarded launcher currently treats a 13-entry source chain as the exam chain.
Consequently **source promotion alone is unsafe**: the exact migration manifest,
expected table inventory and runtime privilege checks must be extended for the
reviewed lesson-only chain. No launcher protections were weakened or changed here.
The lesson journal/snapshot and guarded application executor are not yet prepared.

## Backup verification

The original sandbox inventory could not access protected backup directories.
An approved read-only check then verified these actual archives without database
connections. `pg_restore --list` and full `pg_restore --file=NUL` decoding passed:

| Backup date (UTC) | Size | SHA-256 |
| --- | ---: | --- |
| 2026-10-17 14:05:43.960 | 157056 | `4be6e58e7e37bedf4c48387b2a0c1bcaa7418a3cc0747279c3c26759f0408ed0` |
| 2026-10-17 10:35:48.930 | 157055 | `c5d15cc020e0fdb0cc83194b32c1a933287aa48bd8d465e103c3ade36399dabc` |
| 2026-10-15 17:20:39.963 | 132847 | `8b033b7008e630d1ea04f6a44ccbe2e407b93d6604a46cd8d8583ea79124497c` |

Paths follow `.local/question-bank-upgrade/<timestamp>/before-upgrade.dump`.
No backup contents, credentials or learner-identifying values were printed.

These archives predate the current application state by at least ten days.
They are **not a sufficient current recovery point**. Offline decoding establishes
archive readability, not a newly verified restore. Historical restoration claims
do not substitute for restoring the current pre-activation backup.

Required before GO:

1. Capture a fresh full custom-format dump of the verified application target with
   the known migrator credential supplied locally. Protect its directory ACL.
2. Record backup path, timestamp, bytes and SHA-256; verify TOC and complete decode.
3. Capture all existing table row counts/fingerprints, schema/ledger and sequence
   states consistently with that backup. Use a shared exported snapshot or pause
   application writes rather than comparing unrelated live moments.
4. Restore that backup in an explicitly approved isolated environment and compare
   all schema/row hashes and sequence states. Never restore over the application
   or either populated original rehearsal database.

No fresh backup or restoration was performed during this task.

## Isolated rehearsal status

Read-only Windows listener inventory returned:

```json
{"Port":55440,"ListenerCount":0,"Listening":false,"ClusterStarted":false,"DatabaseConnections":0}
```

The existing private cluster is stopped. The earlier explicit instruction to leave
it stopped has not been overridden by a specific restart authorization here.
The existing disposable candidate is:

- `127.0.0.1:55440/ccna_drizzle_check_20261012_c08f12ad34b6`
- Owner `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170`
- Cluster `.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data`

The existing `withDisposableAccess()` helper changes HBA temporarily and reloads
the private cluster. Earlier permission for other tests is not treated as blanket
permission for a new HBA change. Neither that helper nor old exam/reset runners
were executed. Existing runners target older baseline ledgers and some planner
functions explicitly reject the current 12-entry chain; they must not be reused
by bypassing those checks.

**Lesson rehearsal: NOT RUN / BLOCKED.** There is no passing lesson database
rehearsal receipt. Do not describe the mocked lesson tests as PostgreSQL evidence.

Before a rehearsal can run:

1. Obtain specific permission to start only the existing private cluster and,
   if required, add and restore the exact-owner test-database HBA allowance.
2. Verify ownership marker, canonical path, installed executable, PID, version,
   exact loopback listener and authentication policy. Stop on mismatch.
3. Verify the disposable database ledger, schema and emptiness. Do not reset or
   overwrite a populated target or reuse either populated rehearsal database.
4. Prepare a pinned lesson-only staging journal and test runner using the actual
   Drizzle migrator. Its outer transaction must remain under a rollback wrapper;
   it must never inherit application credentials or connection URLs.
5. Rehearse fresh/upgrade application and repeat-run behavior, FKs, publication
   ownership, immutable revisions, stale-version conflicts and permissions.
6. Create synthetic question/attempt/session history in isolation before the lesson
   step; prove its fingerprints and all sequences remain unchanged after lesson
   create/edit/publish/read/unpublish operations and rollback/recovery checks.
7. Restore HBA byte-for-byte and preserve sanitized results. No automatic new
   environment, cluster restart, database creation or cleanup is authorized.

## Permissions and locking risks

| Object | Required API-role permissions after approved activation |
| --- | --- |
| `public` | Existing USAGE |
| `public.lessons` | SELECT, INSERT, UPDATE |
| `public.lesson_revisions` | SELECT, INSERT |

The verified migrator has public-schema CREATE/USAGE and owns the database;
new objects must be owned by `ccna_phase6a_migrator`. Existing parent-table reads
remain required. No runtime DELETE, TRUNCATE, revision UPDATE, ownership,
CREATEROLE, CREATEDB, role membership or superuser capability is needed. No new
sequence or unrestricted function grants are required. New-object grants cannot
be verified until the objects exist in rehearsal; none were executed here.

New-table creation has no existing-row rewrite. FK creation still takes locks
on parent relations, so use bounded lock/statement timeouts and a planned quiet
window. Parent RESTRICT references will intentionally prevent later chapter/user
deletion while lessons reference them. Publication locks one lesson row; reorder
locks lesson IDs deterministically. Test conflicts and rollback in PostgreSQL.

## Exact activation command — currently unavailable, do not apply

**There is not yet a verified executable application activation command.** The
only new command provided here is SELECT-only. It deliberately rejects `--apply`,
`--rehearse` and `--cleanup`; it cannot be repurposed into a migration executor.
Do not run 0013 with `psql -f`, use `db:push`, or invoke an older upgrade/reset
runner. Giving an apply command before promotion metadata, recovery/rehearsal
evidence and strict runtime guards exist would bypass the requested safety gate.

Once those blockers are resolved, the reviewed command must use a hidden local
credential prompt and pin this exact target and migration hash. Its single
approved operation must apply only the intended pending lesson migration through
the official Drizzle migrator, compare preservation proofs, verify the resulting
ledger/schema/privileges and produce a sanitized committed/not-committed receipt.
It must stop on drift and never retry, reset or repair automatically.

**Explicit application approval is still required** for
`127.0.0.1:5432/ccna_phase6a_dev`, system identifier `7694701597474139084`, and the
exact 0013 checksum above. Do not request approval to execute until the current
NO-GO blockers have been resolved and the concrete command has been reviewed.

## Post-activation verification plan — not executed

- Verify exact new ledger entry/hash/timestamp, owner, indexes, FKs and trigger.
- Compare every existing table fingerprint and sequence against the current
  approved baseline, including all 16 questions, 6 answers and 6 learning sessions.
- Test Admin draft creation, GET/reopen, PUT to the same stable ID, unsaved preview,
  publish, subsequent draft edit without changing the published snapshot, and
  unpublish without deleting revisions.
- Verify signed-out/ordinary learner authoring is denied, unpublished IDs are 404,
  active learners read only published snapshots and chapter ordering is correct.
- Verify existing practice and exam behavior is unchanged. Do not infer exam
  persistence from a lesson migration or silently activate proposal 0012.
- Use approved synthetic content for real workflow checks; no fixture deletion or
  application data cleanup is authorized by this assessment.

## Files and checks completed

Created `tools/lesson-activation/readiness.mjs`, its hidden-prompt
`check-readiness.ps1`, six database-free tests and this report. The diagnostic
pins source hashes, target, branch/HEAD, version and baseline schema; it has no
database-changing mode and discards raw driver errors.

- Offline `--plan`: PASS, all 12 reviewed source migrations and proposal hash.
- `node --test tools/lesson-activation/readiness.test.mjs`: **6 passed, 0 failed**.
- JavaScript syntax and PowerShell AST parsing: PASS.
- Operator SELECT-only application diagnostic: PASS as recorded above.
- Three known backup hashes, TOCs and full offline archive decode: PASS.
- Fresh backup restore, lesson migration rehearsal and application activation:
  **NOT RUN**.

No existing migrations, journal entries, runtime guards, roles, application data,
services or original rehearsal environments were modified. No commits or pushes.
