# Phase 1.4A — Disposable PostgreSQL rehearsal preparation

Status: **Phase 1.4C stopped after four passed assertion groups. Recovery preparation only; further database execution requires separate approval.**
Date: 2026-10-12 (Asia/Riyadh). Verified workspace: `<repository-root>`; branch `main`; HEAD `03b14526aae448e49eacd602a43bfb0e355aca4d`.

The original creation/execution commands below document Phase 1.4A. Their target now exists and is populated; do not repeat them or reuse that database. See the recovery section for the failure, expected retained state and proposed fresh target. No database operations were performed during this recovery preparation.

## Prepared artifacts and verified local tools

- `tools/taxonomy-rehearsal/manifest.json`: exact target, baseline and SHA-256 hashes of six SQL files, the journal and four existing snapshots.
- `tools/taxonomy-rehearsal/rehearsal.mjs`: defaults to `--plan`; imports no PostgreSQL driver and performs no database/server operations in that mode. It accepts no arbitrary host, database, URL or port arguments. SQL execution requires `--execute-disposable`; dropping the target requires a different `--cleanup-disposable` flag. Flags are operator gates, not substitutes for explicit user approval.
- `tools/taxonomy-rehearsal/safety.mjs`: pure HBA generation, bounded session lifecycle and concurrency orchestration. No driver imports or network access at module load.
- `tools/taxonomy-rehearsal/safety.test.mjs`: offline policy and promise/session tests using fake objects only; no SQL execution or PostgreSQL connections.
- `tools/taxonomy-rehearsal/restrict-regression.test.mjs`: offline source checks that distinguish missing-reference INSERT errors (`23503`) from explicit RESTRICT DELETE errors (`23001`), preserve exact constraint names, and check rollback boundaries.
- This plan. No existing launcher, lockfile, schema, proposed migration or migration metadata was modified during preparation.

Installed binaries under `C:\Program Files\PostgreSQL\18\bin` report **PostgreSQL 18.6**. Only `postgres`, `initdb`, `pg_ctl` and `psql` `--version` calls were executed. Installed version does not establish any running server's version.

Safe preparation commands, executed successfully:

```powershell
node --check tools/taxonomy-rehearsal/rehearsal.mjs
node --check tools/taxonomy-rehearsal/safety.mjs
node --check tools/taxonomy-rehearsal/safety.test.mjs
node --test tools/taxonomy-rehearsal/safety.test.mjs
node tools/taxonomy-rehearsal/rehearsal.mjs --plan
node tools/taxonomy-rehearsal/rehearsal.mjs --print-hba
```

Plan mode validated 11 pinned input hashes and printed `databaseOperations: 0`; `--print-hba` emits the seven policy lines without loading the driver. All 35 offline safety tests passed. Database assertions, actual authentication, and real session teardown remain NOT RUN; these tests do not establish PostgreSQL enforcement.

## Exact target and isolation

| Item | Fixed value |
| --- | --- |
| Host / port | `127.0.0.1:55439` |
| Database | `ccna_taxonomy_rehearsal_20261012_31a7bc9d2e40` |
| Cluster owner | `ccna_taxonomy_rehearsal_owner_31a7bc9d2e40` |
| Run directory | `<workspace>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_31a7bc9d2e40` |
| Data directory | `<run directory>\data` |
| Ownership marker | `<run directory>\owner.json`, nonce `31a7bc9d2e40` |

This is a newly initialized private cluster, not the installed PostgreSQL service or its data directory. Existing local/remote databases, environment files, Neon, application launchers and credentials are not inputs. Initialization also creates its own standard maintenance/template databases; they are confined to the new private cluster.

Before connecting, the harness verifies canonical paths (rejects junction/symlink redirection), the exact marker, exact HBA policy, the postmaster PID/data directory/port, a single IPv4 loopback listener owned by that PID, and the installed executable. Extra, reordered, permissive or included HBA records cause a refusal before the driver is loaded. Immediately after connecting, it verifies server data directory, address, port, exact database/user and PostgreSQL `180006`. A changed branch, HEAD, source hash, occupied port, pre-existing run directory, unexpected listener or identity mismatch must stop the rehearsal without fallback.

## Proposed commands — do not execute before approval

Run from the exact verified workspace in PowerShell. These commands create and start a new cluster and database, so **approval point A** is required first. No existing server must be stopped or reconfigured to make the port available.

```powershell
$ErrorActionPreference = 'Stop'
$taxonomyWorkspace = '<repository-root>'
if ((Get-Location).Path -cne $taxonomyWorkspace) { throw 'Wrong workspace' }
node tools/taxonomy-rehearsal/rehearsal.mjs --plan
if ($LASTEXITCODE -ne 0) { throw 'Preparation checks failed' }

$taxonomyBin = 'C:\Program Files\PostgreSQL\18\bin'
$taxonomyDatabase = 'ccna_taxonomy_rehearsal_20261012_31a7bc9d2e40'
$taxonomyOwner = 'ccna_taxonomy_rehearsal_owner_31a7bc9d2e40'
$taxonomyRoot = Join-Path $taxonomyWorkspace ('.local\taxonomy-rehearsal\' + $taxonomyDatabase)
$taxonomyData = Join-Path $taxonomyRoot 'data'
foreach ($taxonomyParent in @($taxonomyWorkspace, (Join-Path $taxonomyWorkspace '.local'), (Join-Path $taxonomyWorkspace '.local\taxonomy-rehearsal'))) {
  if ((Test-Path -LiteralPath $taxonomyParent) -and ((Get-Item -LiteralPath $taxonomyParent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse-point parent refused' }
}
if (Test-Path -LiteralPath $taxonomyRoot) { throw 'Run directory already exists; do not reuse or delete it' }
if (@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 55439).Count -ne 0) { throw 'Port occupied; stop without touching the listener' }
New-Item -ItemType Directory -Path $taxonomyRoot -ErrorAction Stop | Out-Null

& "$taxonomyBin\initdb.exe" --pgdata=$taxonomyData --username=$taxonomyOwner --encoding=UTF8 --locale=C --auth=trust
if ($LASTEXITCODE -ne 0) { throw 'initdb failed; retain the new directory for review' }
@{nonce='31a7bc9d2e40';database=$taxonomyDatabase;owner=$taxonomyOwner;port=55439;dataDirectory=$taxonomyData} |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taxonomyRoot 'owner.json') -Encoding UTF8
$taxonomyHba = @(node tools/taxonomy-rehearsal/rehearsal.mjs --print-hba)
if ($LASTEXITCODE -ne 0) { throw 'HBA generation failed; do not start the server' }
$taxonomyHba | Set-Content -LiteralPath (Join-Path $taxonomyData 'pg_hba.conf') -Encoding ASCII
& "$taxonomyBin\pg_ctl.exe" -D $taxonomyData -l (Join-Path $taxonomyRoot 'postgres.log') -o '-h 127.0.0.1 -p 55439 -c ssl=off' -w start
if ($LASTEXITCODE -ne 0) { throw 'Private server startup failed; do not fall back to another server' }

$taxonomyPidLines = @(Get-Content -LiteralPath (Join-Path $taxonomyData 'postmaster.pid'))
$taxonomyListeners = @(Get-NetTCPConnection -LocalPort 55439 -State Listen -ErrorAction Stop)
if ($taxonomyListeners.Count -ne 1) { throw 'Expected one private listener' }
$taxonomyListener = $taxonomyListeners[0]
if ($taxonomyListener.LocalAddress -ne '127.0.0.1' -or $taxonomyListener.OwningProcess -ne [int]$taxonomyPidLines[0] -or [int]$taxonomyPidLines[3] -ne 55439) { throw 'Private listener identity mismatch' }
if ($taxonomyPidLines[1].Replace('/','\') -ine $taxonomyData) { throw 'Private data directory mismatch' }
if ((Get-Process -Id $taxonomyListener.OwningProcess -ErrorAction Stop).Path -ine (Join-Path $taxonomyBin 'postgres.exe')) { throw 'Unexpected server executable' }

# Clear connection overrides without reading existing secret values. Disable
# user psql startup/password/service files for the upcoming libpq command.
[Environment]::SetEnvironmentVariable('PGSERVICE', $null, 'Process')
[Environment]::SetEnvironmentVariable('PGPASSWORD', $null, 'Process')
$env:PGSERVICEFILE = Join-Path $taxonomyRoot 'absent-service.conf'
$env:PGPASSFILE = Join-Path $taxonomyRoot 'absent-password-file'
$env:PGSSLMODE = 'disable'
$env:PGOPTIONS = ''
& "$taxonomyBin\createdb.exe" --host=127.0.0.1 --port=55439 --username=$taxonomyOwner --owner=$taxonomyOwner --maintenance-db=postgres --template=template0 --no-password $taxonomyDatabase
if ($LASTEXITCODE -ne 0) { throw 'Disposable database creation failed' }
```

The generated HBA file replaces the fresh initdb defaults in full before startup. Its exact first-match order is:

```text
local all all reject
local replication all reject
host ccna_taxonomy_rehearsal_20261012_31a7bc9d2e40,postgres ccna_taxonomy_rehearsal_owner_31a7bc9d2e40 127.0.0.1/32 trust
host all all 0.0.0.0/0 reject
host replication all 0.0.0.0/0 reject
host all all ::/0 reject
host replication all ::/0 reject
```

Only the exact owner over IPv4 `127.0.0.1` can access the named rehearsal database or the private `postgres` maintenance database used by createdb/cleanup. Local sockets, other roles/databases/IPv4 addresses, all IPv6 addresses (including mapped IPv4), and physical replication are explicitly rejected. The allow record precedes the matching IPv4 catch-all rejection. Separate replication rejections are necessary because the database field `all` does not match physical replication. These rules follow [PostgreSQL's first-match semantics](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html). All intended commands use explicit IPv4 TCP; Windows normally creates no Unix-domain socket by default, and the local rejections do not block those commands. [PostgreSQL socket settings](https://www.postgresql.org/docs/18/runtime-config-connection.html)

Trust authentication avoids existing secrets, but other local processes can still claim the permitted owner name. Keep the rehearsal short and stop the private cluster afterwards. The command block checks the listener PID/address against the just-created `postmaster.pid` before `createdb`; the guarded harness repeats those identity checks before executing SQL. These HBA lines have not been loaded into a real server during preparation.

With **approval point B** for migrations, synthetic test fixtures and assertions in this exact database:

```powershell
node tools/taxonomy-rehearsal/rehearsal.mjs --execute-disposable
if ($LASTEXITCODE -ne 0) { throw 'Rehearsal failed; preserve the disposable database and logs' }
```

The harness runs the six pinned SQL files itself; no `DATABASE_URL`, `.env`, Drizzle config, seed command, package installation or existing integration-test configuration is loaded. It requires an empty database and will refuse a rerun over its fixtures. Failure rolls back the current migration or assertion transaction; earlier stages remain only in the disposable database for inspection.

## Test sequence and expected results

| Stage / assertion | Expected result |
| --- | --- |
| Apply `0000`–`0003` to fresh database | Successful application of the historical question/topic/user/attempt foundation |
| Insert synthetic legacy rows, then apply `0004` | Existing legacy attempt retained with NULL revision/delivery IDs; no disabled triggers or invented snapshots |
| Insert synthetic valid revision, delivery and bound attempt | Existing hash, snapshot, expiry, ownership and grading constraints accept valid single-answer fixtures |
| Capture all seven existing tables, question-code sequence state and columns/defaults/constraints/indexes/user triggers; apply proposed `0005` in one transaction | Exact before/after fixture, sequence and schema equality; four new empty taxonomy tables; no automatic classifications |
| Inspect new constraints and index | Constraints validated; primary index unique and valid on `(question_id, blueprint_id)` with exactly `is_primary` predicate |
| Map three objectives across two domains and two blueprint versions | Multiple secondary mappings accepted; separate question/blueprint primary mappings accepted |
| Promote a second primary within the same question/blueprint; duplicate mapping | SQLSTATE `23505`, exact partial-index / composite-primary-key name |
| Missing question/objective; wrong objective blueprint; wrong objective domain blueprint | SQLSTATE `23503`, exact relevant FK name |
| Delete mapped question, objective, domain or blueprint | SQLSTATE `23001` (`restrict_violation`), exact relevant FK name; all referenced rows remain intact |
| Modify existing history/revisions/deliveries, forge new unbound attempt, change question code | Existing triggers still reject with SQLSTATE `23514` |
| Two sessions promote different secondary objectives for one question/blueprint | Observe contender waiting on a lock, then first COMMIT causes contender `23505`; exactly one primary remains |
| Repeat the race with first ROLLBACK | Waiting contender succeeds; exactly one primary remains |
| Final comparison of all original synthetic application rows | Identical values, IDs, answer/history data and timestamps |

The harness reports nine groups of checks only after they actually execute successfully. Most rejection cases use SAVEPOINTs and outer ROLLBACKs. Concurrency cases require controlled commits between two dedicated connections; their only durable changes are mappings for the synthetic taxonomy question in the disposable database. Lock observation uses `pg_stat_activity`, not a fixed delay as proof.

### Bounded concurrency and session lifecycle

- Connections have a 5-second driver timeout and 6-second JavaScript deadline; race acquisition is bounded by 7 seconds and closes any late-returned session. Acquiring A and B occurs inside the protected try/finally, so B's failure still closes A.
- Server limits are `lock_timeout=10s`, `statement_timeout=15s`, and `idle_in_transaction_session_timeout=15s`. JavaScript queries are bounded by 17 seconds, independently of server responses.
- Lock observation is bounded by 2.5 seconds using a monotonic clock, including each observer query; first COMMIT/ROLLBACK has a 3-second deadline. The contender has a 12-second deadline. The COMMIT branch accepts only SQLSTATE `23505` from `question_objectives_primary_uq`; the ROLLBACK branch requires successful contender promotion. Lock timeout `55P03`, statement cancellation `57014`, JavaScript deadlines, session closure and unrelated uniqueness violations all fail the test.
- Pending operations acquire rejection handlers immediately. On failure, the contender wrapper is cancelled and both owned worker sessions start closing before either close is awaited. Each close is bounded by 1.5 seconds, aborts outstanding query wrappers and destroys only its own socket before awaiting the driver. No cleanup ROLLBACK is queued behind a blocked UPDATE, and no pending contender is awaited before releasing the lock holder. Both close attempts run even if one fails; cleanup failures are reported with the original failure in an AggregateError.
- The guarded connector owns clients still connecting and closes them on timeout/identity failure. Normal completion also closes both worker sessions. Observer/maintenance sessions use the same bounded wrapper and close path. Socket closure rolls back any unfinished transaction; no backend-termination SQL, database DROP or cluster shutdown is performed by these session helpers.

The 35 offline tests cover first-match allow/reject cases, physical replication, reserved/injected identifiers, exact target/hash guards, query/end deadlines, cancelled and late-rejected promises, partial/late acquisition, hung observation/release/contender/close operations, both required transaction outcomes and timeout/constraint discrimination. They use fake objects and never import a PostgreSQL driver. Real authentication, actual network failure behavior and server-side release of locks still require the separately approved rehearsal.

This rehearses SQL application and persistence compatibility. It does not prove real Clerk identity, learner HTTP DTOs, runtime application-role privileges, server hardware equivalence or a production deployment. Existing database-free practice tests provide separate contract evidence. No existing database-test file should be invoked generically because its guards may target pre-existing databases.

## Phase 1.4C failure and recovery preparation

The authorized rehearsal passed its preflight on PostgreSQL 18.6 at `127.0.0.1:55439` (PID `43232`), applied all six pinned SQL files, and passed groups 1–4. Group 5 stopped at `DELETE FROM questions WHERE id=$1` for synthetic question `id(4)`: PostgreSQL returned `23001` and the harness expected `23503`. The retained private `postgres.log` identifies the RESTRICT constraint as `question_objectives_question_id_questions_id_fk`. No rerun or migration SQL change followed the failure.

All four taxonomy parent-delete cases use explicit `ON DELETE RESTRICT` in the unchanged proposal:

| Deleted parent | Exact referencing constraint | Correct SQLSTATE |
| --- | --- | --- |
| `questions` | `question_objectives_question_id_questions_id_fk` | `23001` |
| `exam_objectives` | `question_objectives_objective_fk` | `23001` |
| `exam_domains` | `exam_objectives_domain_fk` | `23001` |
| `exam_blueprints` | `exam_domains_blueprint_id_exam_blueprints_id_fk` | `23001` |

Recovery changes only these four expected codes in the harness. Missing-reference and cross-blueprint INSERTs remain `23503` (`foreign_key_violation`), even on a FK declared `ON DELETE RESTRICT`; uniqueness remains `23505`, and immutable-history trigger checks remain `23514`. Exact constraint-name assertions and every connection/identity/hash safeguard are unchanged. The corrected database assertions have **not** been rerun. Groups 6–9 (immutability, both real concurrency outcomes, final preservation) remain NOT RUN.

### Expected retained state from transaction review

This is an inference from the source and the prior execution output, not a live database inspection during recovery. `id(n)` means `11111111-1111-4111-8111-` followed by the 12-digit zero-padded number.

- The database nonce comment `taxonomy-rehearsal:31a7bc9d2e40` and migrations `0000`–`0005` were committed. Each migration has its own BEGIN/COMMIT, not a single transaction covering the rehearsal. Raw SQL application did not populate a Drizzle migration ledger.
- Fixture INSERT statements outside `transaction()` are autocommitted. Expected application fixtures: one user `id(1)`, one topic `id(2)`, two questions `id(3)`/`id(4)`, two answer options for `id(3)`, legacy attempt `id(5)`, revision `id(6)`, delivery `id(7)`, and bound attempt `id(8)`. That is two attempts and one revision/delivery. Legacy bindings remain NULL; bound attempt `id(8)` references `id(6)`/`id(7)`. Option UUIDs and default timestamps were generated by PostgreSQL and were not saved in a durable checkpoint.
- The taxonomy fixture INSERTs also autocommitted: blueprints `id(101)`/`id(102)`, domains `id(111)`–`id(113)`, objectives `id(121)`–`id(123)`. Blueprint defaults are DRAFT with no verification/source URL.
- Group 3 mappings/promotions were inside `transaction()` and rolled back after the passing checks. Group 4 invalid INSERTs were rolled back to SAVEPOINTs and then the outer transaction was rolled back. Group 5's temporary mapping (`id(4)`, `id(121)`, `id(101)`) was rolled back: `reject()` rolls back/releases its SAVEPOINT before comparing the code, and `transaction()` executes outer ROLLBACK in `finally` after the assertion fails. Therefore `question_objectives` is expected to be empty; none of the temporary primary mappings is durable.
- Only the two question INSERTs consumed `question_code_seq`; expected state is `last_value=2`, `is_called=true`. Group 1 actually verified before/after-0005 sequence equality. No later reached stage inserts a question or consumes that sequence. Final comparison after all groups was not reached.
- The main session closes in `finally`. No concurrency sessions were acquired, because the failure precedes the race loop. Existing database files and logs are retained. Default question ACTIVE status belongs only to the isolated synthetic fixtures, not application data.

### Recommended continuation: a new uniquely named target

Do not add or run a resume mode in this recovery. The original `beforeRows`, `beforeSchema`, and `beforeSequence` are in-memory values lost on process exit; there is no persisted checkpoint or stage receipt tying exact generated UUIDs/timestamps, row contents and schema to that baseline. A fresh snapshot of today's populated database would only establish a new baseline. It cannot prove equality with the original baseline or exclude intervening changes. Delivery expiry is another reason not to silently reuse the old fixtures. These limits prevent a resume mode from meeting the requested exact-prior-state guarantee.

Proposed next target, **not created, not configured in the current harness, and not checked for availability**:

| Item | Proposed fixed value |
| --- | --- |
| Host / port | `127.0.0.1:55440` |
| Database | `ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170` |
| Owner | `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170` |
| Nonce | `8e6c4b9a2170` |
| Run directory | `<repository-root>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170` |
| Data directory | `<new run directory>\data` |

Proposed sequence and approval gates:

1. **Separate source-preparation approval:** prepare a new reviewed manifest and guarded entrypoint for these exact values, plus offline target-isolation tests. Preserve the original manifest, private cluster, ownership marker and logs. Reuse the same 11 pinned SQL/metadata hashes and hardened HBA generator; permit only the new owner/target over `127.0.0.1/32`. Do not weaken existing hard-coded guards or introduce arbitrary URL/host/port overrides. Today the current harness still accepts only the original target and will refuse a populated-database execution.
2. **Separate environment-creation approval:** reverify workspace/main/HEAD, hashes, binaries/version, canonical parents, new run-directory absence and unused port. If any check fails, stop without changing an existing listener or choosing a fallback. Create an entirely separate PostgreSQL 18.6 private cluster and empty database; verify exact identity/owner and authentication before proceeding. Do not change the original cluster's HBA to admit a second database.
3. **Separate execution approval:** run the newly reviewed guarded entrypoint once against the fresh empty target, applying `0000`–`0005` and all nine assertion groups with the corrected RESTRICT expectations. Stop on any failure; preserve both targets and their logs. No continuation over the old fixtures, migration replay there, resets or cleanup.
4. Only after a successful complete rehearsal consider separately approved Drizzle promotion and migrator/idempotence rehearsal. Cleanup of either exact target remains its own approval; the current task authorizes none.

Safe offline verification for this correction:

```powershell
node --check tools/taxonomy-rehearsal/rehearsal.mjs
node --check tools/taxonomy-rehearsal/restrict-regression.test.mjs
node --test tools/taxonomy-rehearsal/safety.test.mjs tools/taxonomy-rehearsal/restrict-regression.test.mjs .local/tests/phase1-4b-20261012/identity-regression.test.mjs
node tools/taxonomy-rehearsal/rehearsal.mjs --plan
```

Recovery verification results: **49 passed, 0 failed, 0 skipped** (39 existing offline tests plus 10 new regressions). Both syntax checks passed. Plan mode passed with all 11 unchanged input hashes and `databaseOperations: 0`. These are source/fake-session checks; they do not establish that the corrected RESTRICT, immutability or concurrency assertions pass on PostgreSQL. No resume mode or new execution profile was implemented.

## Cleanup and rollback — separate approval point C

On any failure, retain the private database, run directory and logs; report the exact failing assertion. Do not reverse migrations on an application database. Do not reuse this target for another run; approve a newly named/manifested target instead.

After explicit approval to remove this exact disposable database:

```powershell
node tools/taxonomy-rehearsal/rehearsal.mjs --cleanup-disposable
if ($LASTEXITCODE -ne 0) { throw 'Cleanup refused; preserve everything for review' }
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D '<repository-root>\.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_31a7bc9d2e40\data' -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'Private server stop failed; do not stop a Windows service' }
```

Cleanup repeats path/marker/PID/listener/server checks, connects only to the private cluster's new `postgres` maintenance database, verifies the target owner and database nonce comment, and refuses any extra non-template database. It drops only the fixed quoted target name, without FORCE or backend termination. Active connections cause a refusal. Standard private maintenance/template databases and files are retained; there is **no recursive filesystem deletion**. Stopping the marked private cluster is separate from deleting any files. If database creation or execution failed before the nonce comment was installed, automatic DROP is refused; separately review the marker/PID before approving a private-cluster stop.

## Drizzle promotion requirements — separate approval point D

- The current journal is version `7`, dialect PostgreSQL, indexes `0`–`4`, ending in `0004_question_revisions`. Existing snapshots are `0000`, `0001`, `0002`, `0004`; `0004.prevId` correctly points to `0002.id` (`0fd7cd78-ad27-45bd-94e0-b41430b3630c`). The handwritten `0003` is journaled without a snapshot; do not invent or renumber historical metadata.
- Reconfirm the next available migration number. Promote the exact reviewed proposal to `lib/db/drizzle/0005_exam_taxonomy.sql`; append an `idx: 5`, `version: "7"`, `tag: "0005_exam_taxonomy"`, `breakpoints: true` journal entry with a new timestamp greater than the `0004` timestamp.
- Add `lib/db/drizzle/meta/0005_snapshot.json` with a fresh snapshot ID, `prevId: 693798d6-1010-4990-bbd8-262ebec767fa`, version `7`, PostgreSQL dialect, all existing schema objects unchanged, and the new enum/four taxonomy tables/constraints/indexes. Use a separately reviewed database-free serializer or an isolated generation config without database credentials; do not invoke the current env-dependent config or generate over the handwritten history.
- Snapshot metadata does not encode every handwritten function/trigger; the SQL files remain essential. Inspect generated differences for unintended changes before accepting them.
- After promotion, update the static test that currently asserts the proposal is unjournaled, and approve a second rehearsal of the actual Drizzle migrator: it must record the six migration hashes and perform no changes on a second invocation. This prepared harness applies pinned SQL directly and does **not** prove Drizzle journal execution/idempotence.
- Promotion affects the journal, new root SQL, new snapshot, proposal location/status and its static test/documentation. No question/practice schema, lockfile or launcher change is required. Existing source hashes will change, so approve a revised rehearsal manifest rather than bypassing the hash guard.

## Remaining risks and approval summary

The first four assertion groups passed in Phase 1.4C; group 5 stopped on the SQLSTATE expectation mismatch. The corrected RESTRICT assertions and remaining groups still need a separately approved fresh-target execution. Any fixture, timing, permissions or platform issue must fail visibly and be corrected through source review. The installed Node dependencies and PostgreSQL utilities must remain available; missing tools do not authorize installation or changing existing launchers. The database source URL CHECK remains a scheme restriction, whereas application validation performs full parsing. Full catalog descriptions and runtime authorization are outside this rehearsal.

Required approvals: **A** private cluster/database creation; **B** migration/fixture/test execution; **C** exact-target DROP/private-cluster stop; **D** migration-chain promotion and its subsequent rehearsal. Approval for this preparation grants none of these execution permissions. No database connection, SQL execution, seed, create/drop operation or metadata promotion occurred in Phase 1.4A.
