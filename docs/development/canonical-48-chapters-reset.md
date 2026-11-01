# Canonical 48-chapter development reset

Status: implementation and isolated verification prepared; **application reset requires final execution approval**. No production or remote target is supported. The official journal remains at eleven migrations until the approved reset promotes 0011.

## Educational model

`lib/ccna-book-chapters.ts` is the shared source of the exact user-supplied Book chapters classification. V1 has 29 chapters; V2 has 19. Titles and numbering are unchanged. No particular book edition is claimed. This educational chapter catalog is distinct from Cisco's official objective codes.

| Domain | Weight | Chapters |
| --- | ---: | ---: |
| Network Fundamentals | 20% | 12 |
| Network Access | 20% | 10 |
| IP Connectivity | 25% | 9 |
| IP Services | 10% | 6 |
| Security Fundamentals | 15% | 7 |
| Automation and Programmability | 10% | 4 |

Every chapter has a stable code, e.g. `CCNA-V1-08`, and a UUIDv5 generated from the fixed URL namespace and exam/version/volume/number. Titles and display order are not identity inputs. `curriculum_chapters.id` is also its backing `topics.id`. `questions.topic_id` references both topics and chapters with RESTRICT. The composite domain FK and canonical tuple CHECK prevent wrong-domain bindings, invented chapters, changed volume/number and random chapter IDs. Maximum catalog cardinality is 48 because only those 48 UUIDs are valid.

Questions have one primary educational chapter. Practice, exam selection, revisions, results and progress retain the existing topic UUID relationship, now identifying that chapter. Domain analytics and the VLAN achievement rule join chapters directly. Future lessons should reference `curriculum_chapters.id` with RESTRICT, independently of questions; no lesson table, UI or authoring system is introduced.

The reset removes all 53 objective rows and all question-objective mappings. The old empty tables remain for existing versioned SQL and controlled-deletion functions. They are retired infrastructure, not another educational catalog: objective writes return 410 and no educational UI or domain report classifies by objectives. Empty legacy DTO arrays remain temporarily for API compatibility.

## Admin and import behavior

- `/admin/taxonomy`: Chapters & domains, six weighted domain summaries, search, domain/volume/status filters, metadata editing, concurrency tokens and unsaved-change confirmation. Titles, stable codes and primary domains are fixed. Create missing chapter can recreate an absent canonical entry; it cannot invent a 49th chapter.
- `/admin/topics`: existing paginated topic manager edits chapter descriptions, order and availability; title/slug are readonly. Creation links to canonical management.
- `/admin/questions`: choose a canonical chapter, optionally filtered by domain. Saves continue through revision-aware writers. No objective guessing or objective assignment controls.
- `/admin/import`: download fresh CSV/XLSX templates. Required classification is `chapterCode` or its exact stable `topicId`; both must agree if supplied. Retired objective columns are rejected. Existing preview, duplicate checks, session-bound confirmation, draft defaults and transactional writes remain.
- For multiple answers, set `questionType=MULTIPLE_CHOICE_MULTIPLE` and `correctOption=A;C` (at least two). The default is `MULTIPLE_CHOICE_SINGLE`, with exactly one correct option. Every correct key must identify a supplied option.
- `/topics`: the same exact 48 titles in the six existing domain sections, with counts from PostgreSQL. An empty question bank shows zero questions and disabled practice entry points. Questions are never generated or published by reset.

## Verified target and approval inventory

Application target: `127.0.0.1:5432/ccna_phase6a_dev`, owner/operator `ccna_phase6a_migrator`, PostgreSQL **18.6**, system identifier **7694701597474139084**, data directory `C:/Program Files/PostgreSQL/18/data`. The user confirmed that this is disposable development data and not a student production/shared environment. The guard additionally verifies the installed local service, live server identity, schema, functions, role attributes, migration hashes/timestamps and ownership. No target overrides, environment-file credentials or remote URLs are accepted.

Read-only inventory and backup completed on 2026-10-17. The following complete-table row sets are proposed for deletion, in FK-safe order:

| Table | Approved inventory rows |
| --- | ---: |
| learning_session_items | 5 |
| learner_achievements | 2 |
| practice_attempts | 1 |
| practice_deliveries | 2 |
| question_objectives | 2 |
| question_options | 13 |
| question_revisions | 5 |
| learning_sessions | 3 |
| question_deletion_audits | 59 |
| questions | 2 |
| exam_objectives | 53 |
| topics | 24 |

Preserve all **9 users** (including administrators), **7 achievement definitions**, **1 active CCNA v1.1 blueprint** and **6 matching domains**, byte-equivalent row fingerprints. Authentication configuration, roles, historical migration files and unrelated schemas are not cleared. Keep `question_code_seq` unchanged; do not recycle old question codes. Existing six domain UUIDs, names and weights are reused. Seed 48 new chapter/topic pairs, all ACTIVE, and no questions.

The inventory differs from the former pilot count: there are now two questions and 59 deletion audit receipts. The plan uses the actual current rows, not a hardcoded assumption of 60 questions.

Backup:

```text
<repository-root>\.local\question-bank-upgrade\2026-10-17T14-05-43.705Z\before-upgrade.dump
SHA256 4be6e58e7e37bedf4c48387b2a0c1bcaa7418a3cc0747279c3c26759f0408ed0
157055 bytes
```

The protected `report.json` beside it has SHA256 `cf15ef669a932c61895a3ffaa7e3b6304d3ff830e646a2cff0e2bf05f12be6a7`. TOC and full archive decoding passed. Restoration into the existing disposable database on port 55440 matched every count/hash across all 16 public tables and rolled back. This proves restoration of application rows under the reviewed schema, not restoration of Windows services or global PostgreSQL roles. The full archive retains database DDL/ACL information; the existing roles and authentication configuration remain prerequisites for recovery. The disposable sequence may advance during tests and is deliberately not rewound.

## Guarded execution — only after final approval

1. Stop API/web terminals with Ctrl+C and close other database clients. Do not stop PostgreSQL Windows services. The operator rejects other connections to this application database.
2. Obtain final approval for the exact target, inventory above, backup and new-table grant. Do not run the following command before approval:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/apply-canonical-chapters.ps1 -Apply -ConfirmReviewedDevelopmentReset
```

Enter only the known migrator password at the hidden local prompt. No Clerk keys or passwords belong in chat or arguments.

The command pins workspace/main/current reviewed HEAD, report and backup hashes, all eleven baseline migration entries and every table's row fingerprint. It refuses any stale inventory, changed backup, unexpected external FK or already-initialized catalog. An advisory lock plus ACCESS EXCLUSIVE table locks and bounded timeouts prevent concurrent writes. Exact row permits use the existing owner-controlled immutable-history mechanism; no FK or history trigger is disabled. Each DELETE count must equal the approved count.

After clearing, the official Drizzle migrator applies staged 0011 inside the same outer transaction. It seeds 48 chapter/topic pairs, verifies canonical identities and all constraints, preserved rows, empty history/question tables and unchanged code sequence, then checks repeat migration is a no-op. It grants only `SELECT, INSERT, UPDATE` on the new `curriculum_chapters` table to `ccna_phase6a_app`; no new sequence or DELETE/history privileges are granted. That narrow new-table grant is part of the final approval scope.

Only after postchecks does it promote 0011 SQL/snapshot/journal, verify runtime schema compatibility and commit. Pre-commit failure rolls back database changes. Its own journal write is restored only after a definite pre-commit rollback and only if no other source writer changed it. Unreferenced identical 0011 SQL/snapshot files may remain; no source work is deleted. An uncertain COMMIT or post-commit failure reports its status and requires inspection, never automatic retry/reset.

Expected result: `committed:true`, `questions:0`, `topics:48`, `chapters:48`, `domains:6`, `legacyObjectives:0`, `usersPreserved:9`, `achievementDefinitionsPreserved:7`, `ledgerEntries:12`, `questionCodeSequencePreserved:true`. A protected result file is written beside the backup. If anything differs, stop and send the sanitized result.

If data changed since this inventory, do not weaken hashes or counts. Stop, take a fresh verified backup and review a revised exact plan. Do not reset the database or run the old cleanup tools.

### Stopped execution: preserved users fingerprint changed

The approved execution stopped at `approved-development-reset-transaction`, before the first DELETE, with `NOT_COMMITTED`. Only the reported users hash differed: expected `241929147565d00a30c7f4590aee5799da8b845e899f9819cc93fb16198ee9a1`, actual `bc49b64353bebb78e5e68975fb0704a51ee14582bc83f2beb076ffc6679bba83`. The approval plan and preservation checks remain unchanged.

`resolveDatabaseUser` updates existing accounts' `updated_at` and `last_login_at` during authenticated requests. This is a possible cause, not proof of the actual changed fields. Keep the API/web stopped and run the separate SELECT-only diagnostic:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/invoke-canonical-chapters.ps1 -CompareUsers
```

Use the known migrator credential only at its hidden prompt. The diagnostic verifies the original backup bytes/report, exact database identity, eleven-entry ledger/schema/functions, every current table fingerprint and code sequence. It compares user fields in PostgreSQL against the verified archived users, preserving timestamp precision. Account references and personal-field values are hashed; only timestamps, role and status values are shown directly. It does not execute reset, grant, migration, source promotion or backup replacement, and does not authorize a retry. Send its sanitized JSON result for review. Any role/status, identity, account membership, creation timestamp or personal-field changes must be reviewed rather than assumed to be routine activity.

Diagnostic validation: 13 offline tests passed, PowerShell/Node syntax passed, and the actual PostgreSQL comparison passed against an unchanged restored copy and a one-microsecond timestamp-change probe in the existing disposable transaction; all probe changes rolled back.

The first live diagnostic then exposed an archive-filter defect: `pg_restore --table=public.users` emitted no COPY data. PostgreSQL 18 requires the separate filters `--schema=public --table=users`. Offline inspection of the pinned backup reproduced zero selected rows with the old filter and all nine users with the corrected filter. The diagnostic now shares its exact archive reader with the isolated PostgreSQL test. Sixteen offline regression tests cover filter syntax, missing/unexpected COPY refusal, archived fingerprint verification and redaction. The reset's original approval inventory and preservation checks remain unchanged; no application reset was rerun.

The corrected SELECT-only diagnostic completed successfully. Exactly one hashed account reference had two changed fields: `last_login_at` and `updated_at`, both from `2026-10-17T10:34:11.059+00:00` to `2026-10-17T13:46:17.753+00:00`. All nine accounts remain; identity, email/name, role, status and creation fields are unchanged. All fifteen other table fingerprints and the question-code sequence are unchanged. The ledger still contains eleven entries, and the chapter table remains absent.

A fresh full backup and isolated restore proof are required before updating the preservation baseline. The unchanged original plan is retained as `tools/canonical-chapters-original-approval.json`, pinned to SHA256 `6bcdefc3636b8cb3ff23f96f49743a3e3121720630220765c1ec91293eb84c7f`. The inert baseline-review helper accepts only the exact confirmed users hash `bc49b64353bebb78e5e68975fb0704a51ee14582bc83f2beb076ffc6679bba83`, with every other count/hash, deletion set, catalog, identity and ledger unchanged. It does not ignore timestamps or automatically amend an execution plan. Fourteen additional offline tests exercise acceptance and refusal of scope/data/backup changes. The approved destructive scope is unchanged; further application activity requires fresh evidence rather than accepting arbitrary new user hashes.

## Verified baseline refresh (2026-10-17)

The fresh report at `.local/question-bank-upgrade/2026-10-17T14-05-43.705Z/report.json` and its 157056-byte archive were independently hash-verified. Report SHA256: `c5311a971da15c4987aa881b31487c858e3fa0cc5ddc802d53853778700a42ec`. Full restoration verified all 16 table fingerprints in the existing disposable database and rolled back. The disposable sequence is not restored; application sequence remains 136/called.

The active plan now pins this fresh archive and the exact confirmed users fingerprint. Plan SHA256: `48927e5ad6ba275f6ec2f4a6d7ef4827b8a596cad9c80e7379db7ac71ac44381`. Original approval, backup and report remain unchanged. `verifyResetBackup` verifies both sets of backup/report bytes and calls `assertTimestampOnlyRefresh` to reject any scope, non-user data, account-count or unreviewed users-hash change. The transaction still compares every current row fingerprint, including timestamps, without exceptions.

Validation after refresh: **44 offline tests passed, zero failed**; **one isolated PostgreSQL application workflow test passed**, with all restored data, reset, migration and fixture writes rolled back and temporary HBA restored. The application database was not connected to by these checks. Existing pg queued-query deprecation warning remains. No migration SQL, official migration journal or permissions were changed during this refresh.

The exact deletion scope remains approved. Keep API/frontend stopped and execute the previously approved command once using the known migrator password only at its hidden local prompt. If another guard stops execution, do not retry automatically or accept a new fingerprint without evidence review.

## Validation and recovery

### Promoted source / unknown database execution state

A later invocation stopped at `explicit-execution-gates`: `questionBankPlan` accepts only source inventories of 7–11, whereas the official source journal now contains the exact reviewed 12-entry canonical chain. Official 0011 SQL and snapshot match the proposal hashes. This particular invocation stopped before credential input or a database connection. No success report was found at the pinned refreshed backup location; source files alone cannot establish whether an earlier database transaction committed. Do not remove the promoted files, revert the journal or retry the reset based on source state.

`-Diagnose` now handles this exact promoted-source state in a SELECT-only transaction. It verifies the full pinned twelve-file chain, accepts only the exact reviewed eleven-entry ledger prefix or exact twelve-entry ledger, validates the corresponding schema, and reports counts, changed table names, preserved-table fingerprints and sequence equality. An eleven-entry database also receives the existing full pre-reset function/privilege checks. A twelve-entry database receives full migration-ledger/schema verification; this status report does not independently certify every application workflow or authorize another reset.

```powershell
powershell.exe -NoProfile -File tools/invoke-canonical-chapters.ps1 -Diagnose
```

Keep API/frontend stopped and send only the sanitized result. `SOURCE_PROMOTED_DATABASE_BASELINE` requires review before correcting the execution path; `MIGRATION_APPLIED_REVIEW_RESET_STATE` requires post-execution verification rather than replay. Neither result authorizes a reset retry. No database operations were performed while implementing this diagnostic. Offline regression tests cover both ledger states and refusal of hash, timestamp, ID, ordering and inventory drift.

Actual preparation results (2026-10-17):

- Full database-free application suite: **686 passed, 0 failed**, 48 files.
- Launcher, ledger, catalog, grant and reset-safety unit suites: **236 passed, 0 failed** (includes the 14 new reset-safety tests).
- Final focused chapter/import regression suite: **227 passed, 0 failed**, a subset of the application tests.
- Isolated PostgreSQL application workflow test: **1 passed**, with backup restoration, reset, Admin create/edit, immutable revision preservation, canonical lookup/filtering, draft CSV import, single/multiple answer grading, session history and domain progress; all changes rolled back.
- Separate isolated SQL rehearsal passed canonical binding and exact RESTRICT constraint-name checks, original-account/definition preservation, empty bank, twelve-entry ledger and repeat-migrator no-op.
- API/frontend/schema/client TypeScript, frontend production compilation, both PowerShell parsers, Node syntax checks and inert plan mode passed.
- The production build retains existing UI source-map and chunk-size warnings. The isolated single-connection test emits an existing pg queued-query deprecation warning; no dependency upgrades were performed.
- Application reset, new runtime grant, official 0011 promotion and post-reset live UI verification: **NOT EXECUTED**, approved and awaiting manual hidden-credential execution. No commits or pushes.

Changes are concentrated in the shared chapter catalog and exported Drizzle chapter schema; proposed 0011 SQL/snapshot/journal; Admin chapter, topic, question and import interfaces; chapter-based curriculum/domain reporting; corresponding API-client types; guarded reset/backup/rehearsal tools; and focused tests. The launcher recognizes the reviewed future twelve-entry catalog and exact new-table privileges. Existing historical migration bytes and the current eleven-entry official journal were not changed by this task. Prior uncommitted work is retained.

```powershell
node tools/run-curriculum-tests.mjs --canonical
node --test tools/canonical-chapters.test.mjs
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

Isolated-only verification (explicit existing disposable target; restored data and DDL roll back, HBA restored byte-for-byte):

```powershell
node tools/rehearse-canonical-chapters.mjs
node tools/run-curriculum-tests.mjs --canonical-db
```

Both run against `ccna_drizzle_check_20261012_c08f12ad34b6` at `127.0.0.1:55440`, never either populated taxonomy rehearsal database or the application database. Do not run these after application promotion without updating the explicitly reviewed baseline tooling. Never substitute targets or create another environment automatically.

Recovery after a committed reset is a separate explicit operation: retain the verified archive, first restore it into an approved isolated target and verify the saved counts/hashes and original eleven-entry ledger, then agree a guarded application restore plan. Do not overwrite the application database automatically or replay only selected history rows into a changed schema. Existing isolated recovery verification must not be described as a production restore execution.

After successful reset, restart in two terminals using the existing hidden-prompt launcher:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Verify `/admin/taxonomy` has 48 chapters, `/admin/questions` is empty, `/topics` has six domains and 48 chapters, and practice/exam availability is zero. Sign in normally as an existing administrator; no bypass tokens are used. Creating new content requires explicit chapter selection and the existing publication controls.
