# Phase 8A.1 guarded cleanup and authentication recovery

**Completed and committed on 2026-10-13. Do not rerun cleanup.** The successful report is `.local/phase8a-cleanup/2026-10-13T15-59-16-134Z/report.json`. See [retained-content verification](phase-8a-1-retained-content-review.md) for the actual 135-question/102-topic inventory, history blockers, live endpoint limitations and narrowly scoped next corrections. Commands below document historical recovery steps, not a request to execute cleanup again.

Cleanup is explicitly authorized. Authorization is not a substitute for a valid database login. No password reset, role change, grant or authentication bypass is authorized.

## Recorded failure

The operator's actual execution stopped at `postgres-connect`, SQLSTATE `28P01`, `committed:false`, `report:null`. This occurred before any SQL, backup, output-directory creation or question/topic modification. No automatic retry was performed.

| Setting | Working guarded API | Guarded cleanup |
| --- | --- | --- |
| Host / port | 127.0.0.1:5432 | 127.0.0.1:5432 |
| Database | ccna_phase6a_dev | ccna_phase6a_dev |
| PostgreSQL role | ccna_phase6a_app | ccna_phase6a_migrator |
| System identifier | 7694701597474139084 | 7694701597474139084 |
| Private input | Hidden password prompt | Hidden password prompt |
| Initial connection | policy.connection → pg.Client options | Same policy.connection → pg.Client options |

`invoke.ps1` uses the same SecureString → BSTR → JSON stdin relay as the Phase 6A launcher. No password trimming or URI encoding is applied to that connection. The API's later pool URL is a separate step. Reserved-character tests verify that the direct client receives the exact password string. There is no demonstrated connection-string defect to fix.

The two LOGIN roles are separate PostgreSQL accounts. Their passwords were assigned independently during provisioning. Cleanup needs the migrator account's existing password, not the API account's password or the postgres administrator password. The actual values might happen to match; that cannot be established without credentials and is not assumed. Source originally provisioned both with PASSWORD NULL and documented private password assignment. That historical initial state does not establish today's live state.

PostgreSQL documents `28P01` as [invalid_password](https://www.postgresql.org/docs/18/errcodes-appendix.html). A supplied credential not accepted for that role, an absent/expired password, or unavailable role must be distinguished by nonsecret live metadata and a known credential—not by reading password catalogs or guessing. [Password authentication](https://www.postgresql.org/docs/18/auth-password.html) belongs to the selected database role.

## Read-only checks

The operator subsequently confirmed successful SELECT-only checks for both roles, `authenticated:true`, `stage:complete`, LOGIN allowed, and `databaseWrites:0` against the pinned local database. Authentication is resolved without password or role changes. The actual method value was not included in the operator's summary and is not inferred.

The next execution stopped before backup/deletion at `transaction-and-preservation`, SQLSTATE `42883`. Source diagnosis identified reuse of `$1` as a UUID comparison (`practice_attempts.topic_id`) and a text comparison (`snapshot->'topic'->>'id'`). PostgreSQL inferred UUID for the parameter and could not resolve text = UUID. `topic-dependencies.mjs` now casts both operands to UUID, preserving semantic UUID matching even for valid alternative spellings. Snapshot validation already requires a UUID topic ID. Invalid unexpected metadata fails closed rather than being ignored. Granular read stages identify subsequent failures without printing record contents or credentials. Static regression tests cover the casts and bound parameter; actual PostgreSQL execution is verified by the next guarded run, not claimed from static tests. The failed transaction was rolled back; its private report remains at `.local/phase8a-cleanup/2026-10-13T15-44-46-750Z/report.json`.

From the approved workspace:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase8a-cleanup/check-authentication.ps1 -Role ccna_phase6a_app
```

Enter only the known working API-role password locally. The check validates the installed local service before connecting, executes BEGIN READ ONLY, reads the pinned identity and `rolname/rolcanlogin/rolvaliduntil` for the two expected roles, then rolls back/closes. It observes the authentication protocol's method only; no challenges, responses, hashes or passwords are logged. `databaseWrites:0` is reported. The app password is never reused automatically for the migrator.

If the existing migrator password is known (the one used for the earlier guarded upgrade), perform one read-only check with that password:

```powershell
powershell.exe -NoProfile -File tools/phase8a-cleanup/check-authentication.ps1 -Role ccna_phase6a_migrator
```

Require `authenticated:true`, `stage:complete`, the exact pinned identity, LOGIN allowed and no expired validity. Stop on a mismatch or another 28P01. If the migrator credential is unavailable, credential recovery is blocked pending separate authorization. Do not reset it, change HBA, substitute the runtime/superuser role, or send secrets in chat.

Only after the migrator check succeeds, resume the already-authorized execution:

```powershell
powershell.exe -NoProfile -File tools/phase8a-cleanup/invoke.ps1
```

## Transaction safeguards and scope

The executor pins workspace/main/HEAD, local PostgreSQL identity, reviewed migration hashes/ledger/schema and the actual Sprint 7 UUID binding-file hash. It matches all 60 original questions by exact provenance marker plus text, choices/correctness, difficulty, explanation and topic. Missing, changed or duplicate matches stop execution; IDs are resolved from those unique original records rather than recreated.

Within a bounded, locked repeatable-read transaction it checks dependencies and protects users, all history, taxonomy, required topics, pilot options/mappings/status/IDs and the question sequence. Confirmed legacy names are Local interface demo, Disposable revision test, Disposable live race demo. The approved pilot-only topic scope also permits deletion of unused extra topics with zero question, attempt and snapshot references. Unrecognized question-bearing or history-bearing records remain unchanged and are reported as unresolved. Unreviewed incoming foreign keys or DELETE triggers stop execution.

Before changes, pg_dump 18.6 exports the transaction's consistent snapshot into a new, private `.local/phase8a-cleanup/<UTC timestamp>/before-cleanup.dump`. Existing paths are refused. Verification includes table-of-contents coverage, full archive decoding and SHA-256; no restore is executed or claimed. Recovery instructions and the report are written alongside it. Restore over the current database is not automatic: it could destroy subsequent user progress. A recovery target and procedure require review before restoring.

Dependency-free confirmed legacy questions/topics are deleted. Immutable revision/delivery/attempt records are never deleted or altered. Where RESTRICT/append-only history prevents removal, the confirmed legacy parent remains and is set DISABLED in PostgreSQL. This fulfills zero active confirmed legacy content while honestly reporting that an exactly-60 total/only-24-topics state may be impossible without changing the protected history model. No FK or trigger is disabled.

Before COMMIT, the executor rechecks the exact 60 preserved records, protected fingerprints, sequence, schema/ledger and referential integrity. Failures roll back. An uncertain COMMIT acknowledgement is reported UNKNOWN and must be inspected before any retry. Nothing is reset or automatically restored.

## Platform consistency

PostgreSQL remains authoritative. Public topic/dashboard question counts now aggregate ACTIVE questions on ACTIVE topics; private learner progress retains its existing historical semantics. Curriculum reports available versus mapped questions separately: the two AI pilot questions have no reviewed chapter binding, so 60 available and 58 mapped can be correct. The hierarchy remains six domains/33 chapters. Curriculum/mapping caches participate in existing Admin mutation invalidation; after external SQL cleanup, refresh all open application tabs.

New hardcoded demo Exam Simulator sessions are disabled. Existing in-memory session grading remains; no persistent backend exam service exists. Implementing one is outside cleanup scope. Admin question/topic editing, drafts, publication, CSV/XLSX import, authorization and objective associations retain their existing mechanisms. Chapter binding still uses the reviewed versioned configuration; no new chapter-management feature is introduced.

Offline results: 219 regression tests passed across 19 files, including three authentication diagnostic cases; all 116 existing Phase 6A guard tests passed. TypeScript and syntax checks passed. Production compilation passed with existing UI source-map warnings. Actual authentication method, role metadata, backup/deletion counts, integrity and tab/API results must come from live checks and the execution report; they are not inferred from source tests.
