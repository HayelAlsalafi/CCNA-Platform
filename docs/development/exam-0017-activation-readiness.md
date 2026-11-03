# Exam Simulator 0017 ? activated development milestone

2026-11-03 (Asia/Riyadh). **COMMITTED / DATABASE_VERIFIED ? 17 migrations, 24 tables.** The owner confirmed successful main activation, preservation of existing data/security, and browser acceptance: a 10-question exam submitted and graded with 2 correct, 8 incorrect and a 20% score. Results, answer review and submitted-exam history worked. This publication review did not reconnect to PostgreSQL or repeat browser testing.

## Publication verification and deferred technical debt

This is a working development milestone, not a production-readiness certification or a claim that every automated test passes. The owner explicitly approved publication with these two known focused failures deferred:

- `tools/exam-activation/activation.test.mjs`: module setup calls the pre-activation source plan against the already-promoted 17-entry journal; the exact 16-entry guard correctly rejects it (17 !== 16). Its tests do not run past that setup failure.
- `tools/exam-activation/migration-context.test.mjs`: its first staged-context fixture calls the same pre-activation plan against the promoted source and fails for the same reason. A later phase must isolate a valid pre-activation fixture while retaining the guard.

Latest review: Exam frontend tests 15 PASS; focused activation/context/diagnostic/safety/role tooling run 17 PASS, 2 FAIL. TypeScript and the production frontend build PASS; existing sourcemap and optional large-chunk warnings remain. No unrelated suites were rerun. Local backup archives, private receipts, credentials, logs and build artifacts are excluded from publication.

The two raw-byte integrity manifests retain their reviewed SHA-256 values and have explicit Git attributes preventing line-ending normalization. Historical activation commands below describe completed preparation, not instructions to reapply 0017.

## Historical preparation and rehearsal evidence

The following sections retain the pre-activation review chronology; their references to a 16-entry baseline, pending activation or future browser acceptance apply to that earlier stage. Current operational status is recorded above.

## Proposal and compatibility

- `lib/db/drizzle/proposed/0017_exam_simulator.sql`, SHA-256 `f7b14281a71a30dd9f61ae22b5be093ae8a7429e196ac01977182f48823ab481`.
- New timestamp `1793145600003`, strictly after 0016. Proposed snapshot derives from the exact 0016 snapshot, preserves all 22 existing table definitions and adds only `exam_sessions` and `exam_session_items`. Four indexes, RESTRICT foreign keys, bounded configuration/deadlines, immutable delivery/finalization guards and controlled question-removal tombstones reuse the historical reviewed implementation.
- `tools/exam-activation/pins.json` pins SQL, snapshot, journal, the exact raw-byte 16-entry manifest and baseline snapshot. Official journal, all applied SQL files and official snapshots remain unchanged. The historical 0012 proposal is retained unchanged; its journal must never be inserted retroactively or its old grant runner executed.
- The historical question-deletion extension remains necessary: exam revision foreign keys would otherwise block the existing controlled workflow. The current `execute_question_deletion` implementation is first verified against the 0016 baseline and then renamed to a private `execute_question_deletion_pre_exam` helper. The new wrapper calls that original implementation, adds explicit exam-history confirmation and recovery auditing, and preserves tombstones. Existing public deletion wrappers retain their reviewed EXECUTE ACL. No lesson-deletion function, published revision guard, media object or existing record is migrated or rewritten.
- Grants: SELECT/INSERT on the two new tables, column UPDATE only for session finalization and item answers/flags/version/grade. No direct DELETE, TRUNCATE, broad UPDATE, public access or application execution of internal functions. Exact table, column and function ACLs are checked, including unexpected other grantees.
- Existing Exam API contracts, randomization, server clock, grading and frontend are unchanged. Owner isolation continues through authenticated database actors and explicit API predicates, **not RLS on the new exam tables**. Existing study RLS remains exact and unchanged. Restored service tests must prove cross-owner denial and active-answer redaction; browser acceptance remains a later gate.

## Prepared workflow

New `tools/exam-activation/`: proposal/pins/baseline manifest, readiness/check wrapper, backup/backup verifier/wrapper, restored rehearsal/private role fixture/inert service bundle, activation helpers/dedicated executor/wrapper, runtime details and offline tests. Existing startup policy, snapshot/catalog selection, study/media and deletion validators recognize only the exact reviewed 17-entry chain after promotion; the current 16-entry path remains accepted. The legacy `upgrade-verify` HEAD pin is not changed or bypassed.

Executor stages one SQL file and one journal entry. Apply requires explicit flags plus exact fresh backup and successful matching restored rehearsal. It checks main identity, PostgreSQL 18.6, stable HEAD `848dfadf79397d0cc71e617ef76195fe2987bbf4`, branch/workspace, service identity, ports 3000/8080, guarded processes and zero competing DB clients. Under transaction-scoped advisory/table locks it rechecks ledger IDs/hashes, complete baseline catalog, UTC row fingerprints, both sequence states, ownership, privileges, RLS and immutable revisions. No automatic retry or main sequence reset exists.

The archive must be at most six hours old, snapshot-consistent, hash/TOC/full-decode verified and restored/rehearsed by the new workflow. Receipt/archive/tooling hashes are rechecked. Isolated rehearsal requires the already-running verified private cluster at 55440, creates only a fresh randomly named disposable database, restores exact archived function restrictions and ACLs, uses rollback-only main-equivalent NOLOGIN fixture roles, stages only 0017, tests repeat migrator no-op, real service save/resume/submit/history/privacy/ownership and constraints, then proves rollback, original fingerprints/sequences and role/HBA restoration. It never starts a cluster. Private HBA reload is part of the **future approved rehearsal**, not this preparation.

Precommit and postcommit verification require 17 ledger entries, exact 24-table catalog, check expressions/defaults/index order/validity, exact function bodies/ACLs, existing study policies, lesson protection, all original fingerprints, question-code sequence preservation and empty main exam tables. Postcommit uses `withReadOnlyUtc` (repeatable-read READ ONLY with transaction-local UTC). Failed/uncertain COMMIT or source promotion must leave services stopped for read-only diagnosis; no source repair or database recovery is automatic. PostgreSQL sequences are nontransactional; a failed attempted main migration may advance the ledger sequence even when other changes roll back. Never reset it speculatively.

## Approval gates and commands — NOT executed

Offline only, no credentials or database:

```powershell
powershell.exe -NoProfile -File tools/exam-activation/apply-exam.ps1 -Plan
node --test tools/exam-activation/activation.test.mjs
```

Next request approval for maintenance coordination, one fresh backup and one restored isolated rehearsal. Do not run any of the following just because they are documented. Keep all existing archives. After approval and the operator's maintenance shutdown:

```powershell
powershell.exe -NoProfile -File tools/exam-activation/check-readiness.ps1 -Check
powershell.exe -NoProfile -File tools/exam-activation/prepare-backup.ps1 -Backup
# Set $backupReceipt to the exact returned exam-0017-backup.json path, never a password.
node tools/exam-activation/rehearse-backup.mjs --rehearse $backupReceipt
```

Review receipts and any PostgreSQL deparse/ACL/ownership incompatibility revealed by the real rehearsal. A mocked PASS does not satisfy this gate. No existing archive/rehearsal is substituted. No active migration/grant/startup command is authorized by this document.

Only after successful restored evidence and **a separate explicit approval for main 0017 SQL/grants/source promotion**, set `$rehearsalReceipt` to that exact successful receipt:

```powershell
powershell.exe -NoProfile -File tools/exam-activation/apply-exam.ps1 -Apply -ConfirmReviewedExam -BackupReceipt $backupReceipt -RehearsalReceipt $rehearsalReceipt
```

No application records may be used for destructive acceptance. Authenticated exam creation/submission/deletion acceptance later needs separately authorized test data and service startup. No service start/restart, database backup/restore/connection, grant, migration, commit, tag or push occurred in preparation.

## Verification

Focused offline source/promotion/evidence/query fixtures and inert service bundling are covered by `tools/exam-activation/activation.test.mjs`. Tests operate only on disposable filesystem copies; the original 16-entry source is checked again afterward. Syntax and diff checks are also required. Final focused run: **8 tests passed, 0 skipped**. Twenty Node syntax checks, all three PowerShell parser checks and `git diff --check` passed. Offline Plan passed with `sourceEntries:16`, `databaseConnections:0`, `applyAllowed:false`. No TypeScript/API implementation changed in this preparation; no production build or unrelated suite was repeated. Actual database rehearsal, runtime permissions, PostgreSQL expression deparsing, concurrency and authenticated browser acceptance remain **PENDING**, not production-verified.

The existing question-deletion preview API has no exam-specific counts in source. The proposed SQL denies deletion without explicit history authorization and preserves exam recovery/tombstones when authorized; actual admin confirmation/error presentation and concurrent exam/deletion locking require isolated acceptance before activation approval. No question or lesson was deleted during preparation.


## Scoped files

- Added proposal: `lib/db/drizzle/proposed/0017_exam_simulator.sql`, `proposed/meta/0017_snapshot.json`, `proposed/meta/0017_journal.json`.
- Added tools under `tools/exam-activation/`: `proposal.mjs`, `pins.json`, `baseline-manifest.json`, `readiness.mjs`, `check-readiness.ps1`, `backup.mjs`, `prepare-backup.ps1`, `verify-backup.mjs`, `rehearse-backup.mjs`, `restore-roles.mjs`, `service-fixture.mjs`, `runtime-details.mjs`, `activation.mjs`, `apply.mjs`, `apply-exam.ps1`, `activation.test.mjs`.
- Modified startup validators: `tools/phase6a-local/{policy,run,upgrade}.mjs`, `tools/media-activation/{proposal,runtime}.mjs`, `tools/lesson-deletion/policy.mjs`, `tools/study-activation/{activation,proposal,proposed-runtime-guard}.mjs`.
- Added report: this document. Existing dirty frontend Exam UI files were not edited by this preparation.


## Mandatory safety coverage follow-up ? source only

The missing executable safety cases are now implemented in `tools/exam-activation/safety-assertions.mjs` and invoked by `rehearse-backup.mjs` inside the existing rollback-only fixture savepoint. Every mutation targets freshly generated fixture question, revision, lesson, session, item or audit IDs in the independently verified restored database. Existing admin/chapter records are referenced but never modified. Explicit fixture question codes avoid advancing the question-code sequence; a collision stops without retry.

Required evidence keys: `questionDeletionWithExamHistory`, `protectedLessonsAndRevisions`, `expiredDeadline`, `gradingAndRepeatSubmission`. Each must equal the exact string `PASS`. Missing, pending, skipped, false, unknown or failed cases block both final rehearsal classification and `assertRehearsal` in the activation executor. Older receipts without this evidence are not accepted. Tooling hashes include the new helper; no historical receipt is edited.

- Question deletion: a new question/revision/options and referencing session/item are created. History-unconfirmed deletion must fail with `23514/question_history_confirmation_required`, preserving the item/question and leaving no audit. Explicitly authorized fixture deletion must retain the session/tombstone and both audit payloads, validate their hashes, recover the original item/revision/options metadata, and satisfy immediate FK constraints. Submission of the removed-content session must fail.
- Lessons: new published and revision-bearing lessons must reject controlled deletion with their exact dependency constraints. Direct update/delete of the disposable immutable revisions must fail with `23001`; full before/after lesson/revision rows must match.
- Deadline: a valid five-minute session is created with only five seconds remaining, and its real item is delivered before expiry. The fixture waits on the PostgreSQL clock, then verifies actual expiry. Both service save and direct permitted-column update must fail; the complete saved item remains unchanged. It never changes server time, disables triggers or fabricates an expired delivery.
- Grading: five delivered disposable questions cover correct, incorrect, unanswered, complete multi-answer and incomplete multi-answer cases. Existing services must persist 2 correct / 2 incorrect / 1 unanswered, 40%, matching per-item outcomes and selections. Repeated submission must preserve the result, finalization timestamp and item versions.

The isolated role fixture now grants database-level CREATE/TEMP only to the disposable migrator on its verified new database, matching privileges implicit in main database ownership. TEMP is necessary for the existing audited-deletion definer's private permit table. The app receives no TEMP, broad DELETE, global CREATEDB or new privileges. Main roles/grants are untouched.

Final follow-up verification: **18 focused offline tests passed, 0 failed, 0 skipped** across `activation.test.mjs`, `safety-assertions.test.mjs` and `restore-roles.test.mjs`; Node syntax and diff checks passed. The tests use source copies, inert service bundling and query/orchestration mocks. New live SQL/service cases have not been executed; fresh backup, restored rehearsal and PostgreSQL acceptance remain pending. Source workflow is ready for that next controlled run, not for main activation. No backup, restore, database connection, service restart or main mutation occurred in this follow-up.

Follow-up changed: `rehearse-backup.mjs`, `activation.mjs`, `activation.test.mjs`, `restore-roles.mjs`; added `safety-assertions.mjs`, `safety-assertions.test.mjs`, `restore-roles.test.mjs`; updated this report. Migration SQL, snapshots, application backend/API and UI were not changed.


## Isolated search-path correction ? source only

The failed rehearsal `ccna_exam_0017_restore_0617db16305d4c92be8ce876` is retained unchanged. Its private PostgreSQL log identifies the first unqualified CREATE TABLE as the 42501 failure: the harness had selected pg_catalog as the creation schema.

`rehearse-backup.mjs` now initializes `isolatedMigrationClient` after SET LOCAL ROLE and before either Drizzle invocation. It requires the exact disposable database-name pattern, port 55440, intended migrator, public schema ownership and separate CREATE/USAGE checks. It then uses transaction-local `search_path = public, pg_catalog`, requires `current_schema() = public`, and rechecks the context before each forwarded Drizzle query on the same connection. Existing transaction/savepoint handling remains. Both the initial and repeat migrator use that client; the journal remains explicitly in drizzle. No schema privilege is granted by the correction. Function-local pg_catalog paths and migration SQL/checksum remain unchanged.

Focused verification: five new migration-context tests passed using actual installed Drizzle against a recording fake client; six mandatory-safety gate tests also passed (11 total, no skips). Node syntax and diff checks passed. No PostgreSQL connection, backup, restore, migration, role/grant change or service action was performed. No live correction/rehearsal is claimed. Files: modified `rehearse-backup.mjs`; added `migration-context.mjs` and `migration-context.test.mjs`; updated this report.

Source decision: GO for a new explicitly directed isolated rehearsal after revalidating backup freshness/integrity and private identity; NO-GO for main activation until that rehearsal succeeds. The earlier failed receipt is not upgraded or reused as success. Changed tooling hashes invalidate its use as activation evidence.


## Fast-track isolated verification ? 2026-11-02

Two automated restored rehearsals were used, within the authorized limit. Attempt 1 (`ccna_exam_0017_restore_28cbdf9c56a440b3ac2accb3`) captured `metadata.catalog.structure`: the proposed snapshot expected a 67-byte FK identifier. A READ ONLY query on the verified private cluster confirmed PostgreSQL's 63-byte identifier limit and its exact truncated name. Only the proposed 0017 snapshot FK key/name and dependent pins were corrected; SQL bytes, FK columns, target and RESTRICT behavior remain unchanged. No historical migration/snapshot was edited and no comparison was weakened.

Attempt 2 **PASS / READY FOR APPROVAL**: `.local/exam-0017-restored/ccna_exam_0017_restore_97caf895be6e4375a4508711/rehearsal.json`. It verifies the actual 17-entry/24-table state, exact metadata and grants, all four mandatory safety cases, session privacy/ownership, real save/resume/grading/history, repeat execution no-op, original 22-table fingerprints and sequences, complete rollback, rolled-back fixture roles and byte-identical HBA restoration. No main database connection occurred in either rehearsal; retained isolated databases and earlier receipts were not deleted or rewritten.

- Backup reused: `5adb22ff02462a2ae71115440aaebd811dedb8762ed62090a07951c735c77b3c`, full archive decoding and six-hour freshness rechecked before both attempts.
- SQL unchanged: `f7b14281a71a30dd9f61ae22b5be093ae8a7429e196ac01977182f48823ab481`.
- Successful tooling hash: `09ed355f560c753d8a64fef0f596cdaa947aed0a83f23643cc28e01bf91eb702`.
- Successful rehearsal receipt hash: `9fae670cf48d2de9e6e0210e30cc9e086fc24503d5c892eb441a11bf9714ce31`.
- Dedicated executor `preparedActivation` gates: PASS offline against this exact backup and successful receipt. Source remains at 16; no promotion/activation.
- Focused diagnostics, source-promotion, runtime-metadata and migration-context regression checks passed. The newly added per-assertion diagnostics withhold raw driver messages/private assertion values and retain named public-metadata differences. A final source/promotion/diagnostics run passed 11 tests without skips.

Final main verification uses the separate SELECT-only `tools/exam-final-read-only.{mjs,ps1}` utility: server default READ ONLY plus a repeatable-read READ ONLY UTC transaction, pinned identity/source/evidence, schema/security checks and all 22 original fingerprints/sequences compared with the backup. This utility does not change the rehearsed migration bundle or execute backup/migration SQL. Its live result is pending local hidden credential input; no operational activation approval is implied by the isolated PASS.

Fast-track changed files: added `tools/exam-activation/diagnostics.{mjs,test.mjs}`; modified dedicated runtime details/rehearsal, media runtime diagnostic wrappers, catalog mismatch diagnostics, proposed 0017 snapshot, pins and proposal pin; added the separate final read-only utility and updated this report. Existing frontend work is untouched.


## Final main READ ONLY verification and approval decision

Final main receipt: `.local/exam-0017-final-read-only/c7f0bd01-f975-4b8d-a29a-847adcda9a45/verification.json`, classification VERIFIED. Identity `127.0.0.1:5432/ccna_phase6a_dev`, PostgreSQL 180006, system identifier `7694701597474139084`; exactly 16 migrations / 22 tables. All 22 original fingerprints and both sequence states matched the existing verified backup; security guards passed and exam objects remain absent. Receipt reports databaseWrites=0, migrationExecuted=false, servicesChanged=false. Offline final binding rechecked the same fresh archive, source pins, successful rehearsal hash and tooling hash: PASS.

Decision: **GO to request explicit approval for this exact 0017 SQL, least-privilege grants and source promotion. Main activation NOT EXECUTED.** No production browser exam acceptance is claimed. Run the previously documented dedicated command only after explicit activation approval and a manually coordinated application maintenance shutdown; its quiescence, backup freshness and locked baseline gates still apply. Data changes or an expired archive invalidate this readiness and must stop execution rather than trigger a retry. All prior backups/failed rehearsals are retained.
