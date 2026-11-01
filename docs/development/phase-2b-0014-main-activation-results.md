# Phase 2B — migration 0014 main activation

29 October 2026. **COMPLETE for the authorized verifier correction, read-only
database verification and normal guarded application startup.** The fixed verifier
passed, both guarded services started successfully, and independent OS/HTTP checks
passed. Migration 0014 was **not replayed**. Original PARTIAL and diagnostic
receipts remain unchanged as historical evidence. Authenticated browser/lesson/
study interaction testing remains explicitly pending; this is not a claim that
notes/highlights/bookmarks/progress CRUD was tested through a real Clerk session.

## Approval and exact target

The user explicitly authorized only `0014_interactive_study`, source promotion,
startup integration and the three reviewed study-table privilege profiles.

| Property | Approved / fresh-backup verified value |
| --- | --- |
| Workspace / branch / HEAD | `<repository-root>` / `main` / `3c07b4bb7fe807e60dcbcd5539c046b919a9956f` |
| Main database | `127.0.0.1:5432/ccna_phase6a_dev` |
| Main system identifier | `7694701597474139084` |
| Database / object owner | `ccna_phase6a_migrator` |
| Application role | `ccna_phase6a_app` |
| PostgreSQL | 18.6, `C:/Program Files/PostgreSQL/18/data` |
| SQL SHA-256 | `c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893` |
| Before / required after | 13 ledger entries, 19 tables / 14 entries, 22 tables |

No exam migration 0012, media-storage activation, reset, application restore,
historical content change, role elevation, commit or push is authorized or performed
by preparation. Application services must remain stopped during activation.

## Checkpoint A — startup integration PASS

Integrated the reviewed proposal into:

- `tools/phase6a-local/policy.mjs`: explicit 14-entry chain and exact table inventory;
  extracted `runtimeTableInventory` for direct offline checks. The 13-entry lesson
  state remains valid. Unknown chains/tables are rejected.
- `tools/phase6a-local/upgrade.mjs`: selects the exact reviewed 0014 snapshot for
  the 14-entry chain; preserves 0013 snapshot selection before activation.
- `tools/phase6a-local/run.mjs`: retains lesson immutability/privilege checks and
  invokes exact study RLS/privilege checks after activation. Other identity,
  credential, role and question-bank checks remain.
- `tools/study-activation/proposed-runtime-guard.mjs`: the rehearsed validators
  are now shared by the guarded launcher, not a disconnected candidate.
- `tools/study-activation/proposal.mjs`: promoted journal and snapshot must exactly
  match their reviewed proposal when official source has fourteen entries.

No wildcard acceptance or permission fallback was added. Ledger verification still
uses the separate read-only migrator credential; application execution continues
using the restricted application role.

## Checkpoint B — fresh main backup PASS

Operator receipt:

`.local/question-bank-upgrade/study-2026-10-29T11-49-36.238Z-85fd0de3-470d-4f3e-ba95-4f76a4b7554d/study-backup.json`

Receipt SHA-256:
`90a802ca839cef92bfcaeffe709f15ea182a0e01052e96cbcfb61cf4ff042000`.

New archive: `before-upgrade.dump` alongside that receipt, **146,783 bytes**.
SHA-256:
`2029f3409f2f89ff6227eb6a6a491fef56419c9938d15c983606cd135ece679d`.

The fresh READ ONLY consistent-snapshot backup passed identity, thirteen ledger
entries, 19-table schema/coverage, role and lesson-privilege checks. TOC/full archive
decoding and the raw archive/receipt hashes were independently reverified offline.
No application writes occurred. Old archives and rehearsal receipts remain intact.

Current captured records include: 16 questions, 16 question revisions, 76 options,
3 lessons, 6 lesson revisions, 48 chapters, 48 topics, 6 domains, 10 users,
6 attempts, 28 deliveries, 6 learning sessions and 28 session items. All nineteen
table counts and fingerprints are pinned in the protected receipt.
Question code sequence is `152/called`; ledger sequence is `13/called`.

Recovery/rehearsal evidence is reused from:

`.local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5/rehearsal.json`

Its completed/final-read-only/restore/data-preservation/HBA-restoration gates and
real persistence/RLS/repeat/failure checks passed. The original 28 October archive
actually restored in isolation. **The new 29 October archive was not restored
again**: its readability, coverage and consistency were verified; the completed
same-schema restoration/migration rehearsal was reused as requested. These are
distinct evidence claims. No new rehearsal environment was created.

## Checkpoint C — dedicated executor PASS (offline)

Added inert helpers `tools/study-activation/activation.mjs`, guarded entry point
`apply.mjs` and hidden-prompt `apply-study.ps1`. New focused tests are
`startup.test.mjs` and `activation.test.mjs`.

Inert plan passed with zero database connections/writes and only pending 0014:

```powershell
node tools/study-activation/apply.mjs --plan
```

The executor pins the exact new receipt/archive and completed rehearsal, enforces
a six-hour fresh-backup execution window and refuses source-promotion destination
reuse. It checks service identity and stopped application listeners/processes,
uses the exact host/role/identifier through hidden stdin, and performs read-only
main readiness checks first. Within one bounded transaction it acquires a
nonblocking advisory lock and SHARE locks on all original tables/ledger, refuses
other database connections, and compares every original row fingerprint, sequence,
schema, ledger and existing role/function/privilege guard.

It stages exactly fourteen pinned SQL files. The **official Drizzle migrator**
sees only pending 0014; its nested transaction is bound to a savepoint on the
same verified connection. The exact three study grants and precommit validation
remain in the outer transaction. No generic migration CLI or manual migration SQL
is substituted.

| New table | Application privileges |
| --- | --- |
| `lesson_annotations` | SELECT, INSERT, UPDATE, DELETE; owner RLS |
| `lesson_progress` | SELECT, INSERT, UPDATE; owner RLS |
| `lesson_media` | SELECT, INSERT only; no storage/upload activation |

After DDL/grants, it verifies 14 exact ledger IDs/hashes/timestamps, 22 ordinary
tables and owners, expected schema/keys/indexes/constraints, RLS policies, existing
immutable guards and privileges, all original fingerprints and original question
code sequence. New study tables must be empty. Only reviewed 0014 SQL/snapshot/
journal are promoted. The live checks repeat in a new READ ONLY transaction after
an acknowledged COMMIT.

**Atomicity boundary:** DDL, ledger row and grants are in the same PostgreSQL
transaction. Filesystem source promotion is not transactional with PostgreSQL.
Source-attempt/source-completion and `NOT_COMMITTED` / `UNKNOWN` / `COMMITTED` are
recorded separately. Ledger sequence `nextval` is nontransactional: a failed attempt
may advance it even if DDL rolls back. No automatic sequence reset, source reversal
or retry occurs. An unknown outcome requires diagnosis, never a second Apply.

Authorized operator execution (credentials stay in the hidden local prompt):

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/study-activation/apply-study.ps1 -Apply -ConfirmReviewedStudy
```

Keep API/frontend and other main-database clients closed, PostgreSQL running.
If any gate stops execution, preserve the receipt and do not retry.

## Checkpoints D / E — first stopped attempt (historical)

- Main migration execution: **NOT ATTEMPTED**, `NOT_COMMITTED`.
- Source promotion: **NOT ATTEMPTED**; official source remains thirteen entries.
- Ledger sequence effects: **NONE from this attempt**; migration was not reached.
- Actual 14-entry ledger / 22-table main schema: **NOT APPLIED**.
- Main post-migration RLS, ACL and data-preservation verification: **PENDING**.
- API/frontend restart and HTTP checks: **NOT RUN** pending successful activation.
- Real signed-in Clerk/browser study persistence: **NOT RUN**.

The operator ran the approved hidden-prompt command once. Its sanitized result:
`stage: installed-service-and-quiescence`, `committed: false`,
`commitOutcome: NOT_COMMITTED`, `sourcePromotionAttempted: false`,
`sourcePromoted: false`, `migrationAttempted: false`, `report: null`.
No DB client had been constructed/connected at this stage; no migration, grants
or promotion ran. No receipt directory was created yet. The sanitized operator
result in the conversation is retained evidence of this stop.

Independent **OS-only, read-only** diagnosis found:

| Check | Actual result |
| --- | --- |
| Guarded PostgreSQL service/listener verifier | PASS, exit 0 |
| `127.0.0.1:3000` | LISTEN, guarded API Node PID **25284** |
| `127.0.0.1:8080` | LISTEN, guarded frontend Node PID **36660** |
| Exact project guarded application processes | **2**, matching those PIDs |

Process identity was checked against the exact project's `run.mjs api/web --start`
command pattern without exposing raw command lines. No process was terminated and
no service was changed. Sandbox denial on the first OS check was resolved by an
approved read-only check outside the sandbox; no database was accessed.

The executor's combined stage was split into
`installed-postgres-service-identity` and `application-quiescence`, with fixed,
sanitized invariant labels for active listeners/processes. This diagnostic-only
source correction does not weaken the refusal. **Activation was not retried.**

Required continuation: the operator must stop the two services with Ctrl+C in
their existing terminals and close other main-database clients, leaving PostgreSQL
running. Then reverify quiescence and the pinned fresh backup's live fingerprints
before any further execution. Running services could have changed timestamps or
other records after backup: no unchanged-live-data claim is made following this
stop. The six-hour backup gate still applies. Do not blindly rerun Apply, refresh
the preservation baseline or create another rehearsal cycle. Existing narrow
approval remains recorded; the blocker is the failed safety prerequisite.

## Focused verification

**38 tests passed, zero failed** across:

```text
tools/study-activation/startup.test.mjs
tools/study-activation/activation.test.mjs
tools/study-activation/backup.test.mjs
tools/study-activation/readiness.test.mjs
tools/study-activation/isolated-policy.test.mjs
tools/phase6a-local/runtime-ledger.test.mjs
```

Includes actual Drizzle control flow against a **recording, database-free client**:
only 0014 is selected, an injected SQL failure rolls back its savepoint, and the
inner migrator cannot commit the outer transaction. This does not claim fresh
PostgreSQL execution or replace the completed real isolated rehearsal.

JavaScript syntax checks, PowerShell AST parsing, backup verification, inert Plan
and scoped diff whitespace checks passed. The 236-test suite/rehearsal was not
repeated. Frontend source is unchanged by this activation task; the preceding P1
TypeScript/production build results remain the baseline, not a new live test.

## Recovery / remaining limits

Never run a restore over the populated main database or drop study tables as an
automatic rollback. Preserve the new dump, previous dump and activation receipts.
After a committed change, prefer a reviewed forward correction; a replacement
restore needs a separately authorized empty isolated target and explicit review.
Database archives do not include future media binaries; media remains disabled.

The first attempt was **NO-GO / BLOCKED** because application quiescence failed.
It was not retried automatically. No cleanup, permission repair, process
termination, media activation, commit or push occurred.

## Authorized resume after manual shutdown

The user confirmed Ctrl+C shutdown and requested controlled resumption.
Independent read-only Windows checks then verified **zero listeners on 3000 and
8080**, **zero matching project guarded API/web processes**, and successful exact
local PostgreSQL service/listener verification. No process was terminated.

The inert executor Plan passed again with **zero database connections/writes**.
It reverified the pinned fresh archive/receipt, completed rehearsal evidence,
workspace/branch/HEAD, unchanged 0014 checksum, thirteen-entry official source
chain and 0014-only staging plan. No integration tests or rehearsal were repeated.

These OS/offline checks were followed by the actual executor result below. They
were not used as a substitute for its authenticated live preflight.

## Actual resumed execution — COMMITTED / PARTIAL

The operator supplied and the agent independently read this protected receipt:

`.local/question-bank-upgrade/study-2026-10-29T11-49-36.238Z-85fd0de3-470d-4f3e-ba95-4f76a4b7554d/study-activation-d93ef695-b3c7-4dda-b74f-1601809a8355/activation.json`

Receipt SHA-256:
`ddc23d8ea914940ea7df6a6f31d097bd815803686e0daebdc1b706132c6e7c95`.

| Result | Actual evidence / limit |
| --- | --- |
| Main activation | `committed:true`, `commitOutcome:COMMITTED` — acknowledged COMMIT |
| Source promotion | `sourcePromotionAttempted:true`, `sourcePromoted:true` |
| Failing stage | `postcommit-read-only-verification` |
| PostgreSQL error code | `sqlState:null`; no specific PostgreSQL error is established |
| Detailed failed assertion | Not retained in the sanitized receipt; do not guess |
| Classification | **PARTIAL**, not COMPLETE and not an unapplied migration |

The executor could reach COMMIT only after its live identity, stopped-client,
13-entry ledger/19-table schema, backup/fingerprint/sequence and runtime-privilege
preconditions passed. It then performed the official 0014 Drizzle migration and
the three approved grants in the same transaction. Before commit, verification
ran twice, including after source promotion: 14 ledger IDs/hashes/timestamps,
22-table schema/ownership/constraints/indexes, exact RLS/privileges, existing lesson
and question guards, all nineteen original table fingerprints, question-code
sequence `152/called`, ledger sequence `14/called`, and empty new study tables.
This conclusion follows the verified executor control flow and the acknowledged
COMMIT; **it does not claim the subsequent read-only check succeeded**. The catch
receipt overwrote its earlier precommit verification summary, so that intermediate
summary is not independently available as a separate retained JSON receipt.

Independent post-stop **offline source verification** passed:

- Official source manifest: **14** exact entries, last `0014_interactive_study`.
- Last timestamp: `1793145600000`; SQL hash matches the approved `c61edf…` value.
- Promoted snapshot: **22** expected tables, exact reviewed proposal match.
- No unrelated 0012 migration in the chain.
- These checks made **zero database connections**.

Files promoted by the approved executor:
`lib/db/drizzle/0014_interactive_study.sql`,
`lib/db/drizzle/meta/0014_snapshot.json`, and the official
`lib/db/drizzle/meta/_journal.json`. Historical migration SQL was not changed.

The live postcommit schema/data/security verification is **incomplete**. The
failure could not be localized from the sanitized receipt alone; no schema drift,
data loss, specific PostgreSQL fault or validator defect is asserted without
evidence. Do not conflate the offline 22-table snapshot with a fresh live catalog
inspection.

Following the user's stop-on-failure instruction, no further database operations,
activation retry, source reversal, permission changes, service restart, learner
test writes or media activation were attempted. API/browser/study-persistence
verification remains **NOT RUN**. No production frontend rebuild or completed test
suite was repeated during this resume.

At that checkpoint the status was **PARTIAL**, pending the separately authorized
diagnosis below. The original receipt was not rewritten to make it report success.

## Final one-pass post-COMMIT diagnosis — VERIFIED

Performed only after the user's explicit SELECT-only diagnostic instruction.
Added `tools/study-activation/diagnose-postcommit.mjs` and its hidden-prompt
`diagnose-postcommit.ps1` wrapper. These are diagnostic tooling, not repairs to the
activator or runtime guards. JavaScript syntax and PowerShell AST checks passed;
no full test suite, migration, grant, restore or service operation was run.

The operator ran **one** diagnostic connection. The connection defaults to read
only and opens `REPEATABLE READ READ ONLY`; helper SQL is restricted to SELECT.
The exact main identity is checked before any application-table read. The same
MVCC snapshot was used for the original-timezone and UTC comparisons. The sole
rendering control was `SELECT set_config('TimeZone','UTC',true)`: transaction-local,
not a persistent database/role setting, and removed by ROLLBACK. No rows changed.

Protected diagnostic receipt:

`.local/question-bank-upgrade/study-2026-10-29T11-49-36.238Z-85fd0de3-470d-4f3e-ba95-4f76a4b7554d/study-activation-d93ef695-b3c7-4dda-b74f-1601809a8355/postcommit-diagnosis.json`

SHA-256:
`41f80ef82b40bc43160bdb8acafebf537dba76030ae7631bd214a8cc5b9cddf0`.

The agent independently read this existing receipt and its checksum without
opening another database connection. It reports `stage:complete`,
`classification:VERIFIED`, `databaseWrites:0`, `repairsPerformed:false`,
`activationRetried:false`, `servicesChanged:false`.

### Actual live results

| Check | Result |
| --- | --- |
| Identity | Exact `127.0.0.1:5432/ccna_phase6a_dev`, identifier `7694701597474139084`, migrator role, PostgreSQL 18.6 and approved directory |
| Database/schema/table ownership | Expected migrator ownership |
| Transaction | Read only `on`; isolation `repeatable read`; original timezone `Asia/Riyadh` |
| Migration ledger | Exactly **14** entries; all IDs, ordering, raw hashes and timestamps match the official reviewed manifest |
| Live table inventory | Exactly **22** ordinary tables; no missing/unexpected relation; all owned by `ccna_phase6a_migrator` |
| New tables | `lesson_annotations`, `lesson_progress`, `lesson_media`, all empty |
| Schema/constraints/indexes | Existing strict catalog/snapshot validator passed columns/types/NOT NULL, PK/unique/FK structure and RESTRICT behavior metadata, CHECK inventory/validation and index structure/validity |
| Runtime grants | Exact three study-table privilege profiles passed; existing application/chapter/taxonomy/question/lesson privileges passed |
| RLS | Both exact owner policies and table RLS flags passed, including expected owner setting and USING/WITH CHECK expressions |
| Roles | App/migrator LOGIN profiles passed; no elevated capabilities, inheritance or memberships |
| Immutable lesson history | Exact revision function body, owner, security/search-path/ACL profile and enabled trigger binding passed |
| Original counts | All **19** original table counts unchanged, including 16 questions, 3 lessons, 6 lesson revisions, 10 users and existing learner history |
| Original hashes in UTC | **19/19 match** the pinned pre-activation backup; zero differences |
| Question-code sequence | **152 / called**, unchanged |
| Ledger sequence | **14 / called**, expected migration effect |
| Complete `verifyActivated(...,true)` under UTC | **PASS**, including promoted-source SQL/snapshot/journal checks |

CHECK-expression bodies/default expressions were not separately re-exported by
this pass; the reused strict catalog validator checks their existing documented
inventory/binding/validation scope. The completed isolated rehearsal remains the
prior evidence for their SQL semantics. No destructive enforcement tests, synthetic
learner writes, real Clerk session or browser workflow was performed here.

### Confirmed root cause and exact subcheck

This is **verification logic/session-context mismatch**, not observed schema/data
drift, a privilege failure, or a broken PostgreSQL installation.

1. `tools/study-activation/apply.mjs:49` sets **LOCAL UTC** in the migration
   transaction, matching the backup's UTC fingerprint capture.
2. After COMMIT, `apply.mjs:70` begins a new READ ONLY transaction without setting
   its timezone. PostgreSQL restores the session's **Asia/Riyadh** setting when the
   earlier transaction-local setting ends.
3. `tools/question-bank-upgrade-core.mjs:285` (`rowProof`), especially line 296,
   hashes `jsonb_agg(to_jsonb(t))::text`. Timestamptz JSON strings therefore render
   differently under UTC and Asia/Riyadh even when the stored instants are identical.
4. The exact failure is `tools/study-activation/activation.mjs:131`, inside
   `verifyActivated`: **originalRowFingerprints / `Existing rows changed`**.
   It is a JavaScript assertion, explaining the original `sqlState:null`.
5. Reproducing the original verifier in Asia/Riyadh produced differences for
   **13 tables**, with **identical counts**. Running the same unchanged verifier
   under transaction-local UTC in the **same snapshot** passed all checks. All
   nineteen original hashes then matched exactly. No baseline was relaxed or updated.

PostgreSQL documents that [SET LOCAL ends with the transaction](https://www.postgresql.org/docs/18/sql-set.html)
and that [timestamp-with-time-zone output uses the current TimeZone](https://www.postgresql.org/docs/18/datatype-datetime.html).
The live same-snapshot comparison confirms that mechanism in this database.

### Minimum safe next action — approval required, not performed

Approve a **source-only verifier correction**: establish UTC immediately after
opening the postcommit READ ONLY transaction, before fingerprint comparison, and
add a focused regression for an Asia/Riyadh session across COMMIT. Preserve exact
hash validation and all identity/schema/role/RLS guards. No data repair, new backup
baseline, grants, migration replay or restore is needed to address this defect.

**Never rerun Apply.** Migration 0014 is already committed and the database is now
verified correct. Services remain stopped as required by this diagnostic task.
Service startup and authenticated application/study smoke tests need their own
authorized continuation; they are not claimed complete by database verification.
No actual verifier repair was made during that diagnosis. The user subsequently
approved the narrowly scoped source correction and startup, documented below.

## Approved finalization — UTC fix and actual re-verification

The user separately authorized the verifier fix, focused regressions, read-only
reverification and normal guarded API/frontend startup, expressly forbidding
another Apply or database change.

### Exact correction

Added `tools/study-activation/read-only-utc.mjs::withReadOnlyUtc`. It opens
`REPEATABLE READ READ ONLY`, establishes **transaction-local UTC** with
`SELECT set_config('TimeZone','UTC',true)`, verifies UTC and read-only settings,
executes the complete existing callback, and always ends with ROLLBACK. The local
timezone cannot persist after that transaction or change another connection.

`tools/study-activation/apply.mjs` now wraps its existing
`verifyActivated(client,config,root,plan,true)` postcommit call in that helper.
No comparison, fingerprint SQL, identity/schema/security validator, baseline,
backup receipt or migration definition changed. **Apply was not invoked again.**

Added `verify-postcommit.mjs` / `verify-postcommit.ps1`: an independent, hidden-input,
strictly read-only command calling the same corrected wrapper and full verifier.
The connection defaults to read-only and the verifier callback accepts SELECTs
only. It neither imports/runs the Apply entry point nor invokes Drizzle or grants.
Inert helper imports perform no DB work, source promotion or repair.

### Focused tests — 7 passed, 0 failed

`node --test tools/study-activation/read-only-utc.test.mjs` passed:

1. Matching fingerprint under an initially UTC session.
2. Matching fingerprint under an initially Asia/Riyadh session, with local setting
   restored after verification.
3. A genuine original-fingerprint mismatch still fails and rolls back.
4. Missing UTC or read-only proof prevents verification from running.
5. Wrong identity, ledger hashes/count and table count failures still propagate.
6. Unsafe/unverified study grants remain rejected.
7. The actual activator still calls the entire existing verification pipeline
   inside the UTC wrapper, retaining identity/catalog/grant/RLS/fingerprint checks.

These are database-free sequencing/guard regressions, not mocked claims of live
persistence. Syntax/PowerShell parsing and scoped diff checks also passed. The
completed broad suites were not repeated. No frontend/TypeScript/build inputs
changed in this finalization, so another production build was unnecessary; the
earlier successful build remains the baseline, not a newly executed build.

### Actual corrected read-only verification — PASS

Operator ran once:

```powershell
powershell.exe -NoProfile -File tools/study-activation/verify-postcommit.ps1 -Verify
```

The agent independently read the existing protected result without making a second
DB connection. Receipt:

`.local/question-bank-upgrade/study-2026-10-29T11-49-36.238Z-85fd0de3-470d-4f3e-ba95-4f76a4b7554d/final-verification-a8cf9857-b70d-4fff-a7a1-96ddb6136c45/verification.json`

SHA-256:
`387f808d5d132daa03378c6a26d5d538b9c02f8d23bfd982b8ca7d79c44c13f2`.

Result: `stage:complete`, **14 ledger entries**, **22 tables**, **2 RLS policies**,
correct ownership, exact study privileges, existing lesson-revision protections,
**19/19 original fingerprints matched**, question code **152/called**, ledger
sequence **14/called**, and empty study tables. Exact main identifier remains
`7694701597474139084`, address `127.0.0.1:5432/ccna_phase6a_dev`, PostgreSQL 18.6.
Settings: **UTC / read_only:on / repeatable read**. Receipt explicitly records
`databaseWrites:0`, `migrationExecuted:false`, `grantsExecuted:false`,
`servicesChanged:false`.

### Guarded application startup — PASS

After successful verification, operator handoff uses only existing launchers with
known credentials/Clerk development keys entered in local hidden prompts:

```powershell
# Terminal 1, keep open
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
# Terminal 2, only after API reports port 3000; keep open
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

The operator reported: **“API & web mode it work now”**. Independent OS-only
verification then matched both actual listeners to the exact project's guarded
`run.mjs api/web --start` command pattern without printing raw command lines:

| Service | Listener | Actual PID | Guarded launcher |
| --- | --- | --- | --- |
| API | `127.0.0.1:3000` | **31260** | Verified |
| Frontend | `127.0.0.1:8080` | **39668** | Verified |

`verify-service.ps1 -CheckApi` passed. The current official source manifest is
**14 migrations**, last `0014_interactive_study`, and its exact runtime inventory
is **22 tables**. Because the existing launcher completes its separate read-only
migration/schema/ownership verifier and restricted application-role privilege/RLS
checks before listening, both successful guarded starts confirm acceptance of the
post-0014 state. Identity/security checks were not bypassed.

No PostgreSQL restart, process termination, credential-file access, Clerk setting
change or new database operation was performed to start the services. Credentials
and existing Clerk keys stayed in the operator's local hidden prompts. The two
existing terminals must remain open to keep the development services running.

### Independent actual HTTP verification — 9/9 PASS

Requests were unauthenticated, GET-only and made by the agent against loopback
after startup. Evidence:
`.local/study-finalization/http-verification-20261029.json`.
Checked at **15:42:42 Asia/Riyadh**, 29 October 2026
(`2026-10-29T12:42:42.812Z` in the machine-readable receipt).

| URL / request | Actual result | What it proves |
| --- | --- | --- |
| `http://127.0.0.1:3000/api/healthz` | **200**, JSON `status:ok` | API running |
| `http://127.0.0.1:8080/api/healthz` | **200**, JSON `status:ok` | Frontend proxy reaches API |
| API `/api/admin/lessons/library` | **401**, JSON | Authentication enforced |
| Proxy `/api/admin/lessons/library` | **401**, JSON | Same protected lesson route through Vite |
| API `/api/study/workspace` | **401**, JSON | Study route registered; authentication enforced |
| API `/api/study/progress` | **401**, JSON | Progress route registered; authentication enforced |
| Frontend `/admin/lessons` | **200**, HTML root and Vite module | Lesson Studio SPA entry served |
| Frontend `/topics` | **200**, HTML root and Vite module | Curriculum SPA entry served |
| Frontend `/` | **200**, HTML root and Vite module | Website reachable |

Both library responses included `X-Lesson-Api-Contract: discovery-library-v2`
and `Cache-Control: private, no-store`; neither was a stale route/404 response.
An HTML 200 confirms delivery of the SPA entry, **not** authenticated component
rendering or lesson content retrieval. A protected 401 confirms rejection, **not**
successful signed-in admin/learner authorization.

### Study functionality and remaining limits

- Database study foundation/readiness: **PASS** — all three tables present, exact
  grants, both RLS policies and existing immutable lesson-revision guards verified.
- Existing lessons, revisions, questions and history: **preserved**, nineteen
  original fingerprints matched in the corrected read-only verification before
  application startup; no published content was edited.
- Existing Lesson Studio/student route registration and frontend delivery: **PASS**
  to the unauthenticated HTTP/entry-point extent above.
- Actual signed-in lesson reading, draft save/reopen/publication and study
  notes/highlights/bookmarks/progress persistence: **PENDING**, not performed.
  Browser discovery returned **“The browser access host is unavailable.”** No
  authorized authenticated test session or explicitly identified disposable test
  records were available. No fake tokens/auth bypass or writes to real learners
  were used. No browser screenshots or rendered UI verification are claimed.
- Persistent media storage/uploads: **not activated**, still outside this scope.
- No migration, GRANT, ALTER, restore, reset, dependency update, commit or push was
  executed in finalization. No existing backup/baseline/receipt was modified.

Files changed during this finalization only:
`tools/study-activation/apply.mjs`, new `read-only-utc.mjs`,
`read-only-utc.test.mjs`, `verify-postcommit.mjs`, `verify-postcommit.ps1`, and this
report. Existing unrelated frontend/backend work was preserved.

**Final classification: COMPLETE for this requested finalization** — verifier
fix/regressions passed, actual read-only main verification passed and both guarded
services started with live health/frontend checks. Real authenticated browser
workflows remain the separate, stated limitation. Never rerun Apply to reproduce
verification; use the dedicated read-only verifier only when separately needed.
