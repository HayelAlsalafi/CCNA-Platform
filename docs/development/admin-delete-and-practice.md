# Admin deletion and finite Practice sessions

Implemented in the approved CCNA-Platform workspace on `main`, HEAD `03b1452`. Existing uncommitted work, Add/Edit interfaces, Clerk configuration, migration SQL/metadata and Exam Simulator are preserved. No schema migration is required.

## Admin usage and backend behavior

Visit `/admin/questions` or `/admin/topics` in a real signed-in Admin session. Every row has a selection checkbox and Delete button. The bulk toolbar offers Select All, selection count, Delete Selected and Clear Selection. Confirmation explains permanent deletion and blocking; the result summary lists each record UUID and its outcome/reason. Delete returns only **DELETED** or **BLOCKED**. It never archives, disables or updates a selected record.

- Questions: Select All selects only the current filtered **page**, not unseen pages. Changing pagination, search, topic, status or difficulty clears selection.
- Topics: Select All selects the current filtered topic list. Maximum 500 records per operation; refine the filter for larger lists.
- Dependency-free questions/topics are permanently deleted. Question options use their existing cascade; mutable objective links are explicitly removed inside the same savepoint. No revision, attempt or delivery is deleted.
- History-protected questions and topics are BLOCKED and retain their existing status, timestamps and data. Responses expose exact revision/delivery/attempt counts or topic question/attempt/snapshot counts. Foreign-key race failures identify the sanitized constraint name when PostgreSQL supplies it.
- A topic with any question, ACTIVE or DISABLED, is BLOCKED. Its questions must be separately and explicitly handled first; deleting a topic never implicitly deletes its questions.
- All 60 reviewed Sprint 7 question UUIDs and 24 required topic UUIDs are hard-protected server-side, independently of editable notes/names/status. Case-normalized matching prevents uppercase UUID bypass. These records are BLOCKED even if an Admin selects them.
- Missing records, dependency races, lock conflicts and missing DELETE privileges are reported as BLOCKED per item. Unexpected SQL failures roll back the entire batch. The UI does not claim an entire batch succeeded merely because HTTP 200 was returned.

Endpoints: `DELETE /api/admin/questions/:id`, `DELETE /api/admin/topics/:id`, and `POST /api/admin/{questions|topics}/bulk-delete` with `{ "ids": ["uuid", ...] }`. Payloads are strict: 1–500 unique UUIDs, no client outcome/identity fields. Existing Clerk authentication, PostgreSQL-user ADMIN authorization and the Admin session precondition run before services. Anonymous callers receive 401; authenticated non-Admins receive 403. The frontend managers mount only after the existing authoritative Admin gate.

One PostgreSQL transaction locks selected parents in UUID order. Per-item savepoints allow accurate mixed outcomes while preserving foreign keys. SQL uses bound `inArray()` conditions, not interpolated UUID tuples. A DELETED outcome requires exactly one UUID returned by DELETE and a follow-up SELECT confirming its absence, followed by successful transaction completion. Catalog invalidation cancels stale reads and refetches Admin lists/taxonomy, topics, curriculum/mapping, Practice projections, dashboard and the current identity's progress/history. It never copies Admin answer keys into learner caches or invalidates another user's private cache.

## Required local DELETE permissions

The original application runtime intentionally lacks DELETE on `questions`/`topics`. Permanent deletion reports BLOCKED if the approved two-table grant is absent; there is no UPDATE/archiving fallback. The operator confirmed completion of the grant procedure below during the preceding implementation.

The user explicitly approved `tools/phase6a-local/08-grant-admin-catalog-delete.sql`. It grants **only DELETE on public.questions and public.topics** to the existing `ccna_phase6a_app` PostgreSQL role. It checks local server identity, system identifier `7694701597474139084`, expected database/owner/role attributes, exact six-entry migration multiset, RESTRICT dependencies and six append-only history triggers. It changes no application records or user Admin roles, grants no history deletion, and does not change Add/Edit permissions.

`assertRuntimePrivileges()` now accepts either the original no-catalog-DELETE profile or this exact paired two-table DELETE profile. Missing, nonboolean or partial evidence is rejected; existing elevated-role, user-role/status-write, history UPDATE/DELETE/TRUNCATE, schema, ledger and sequence restrictions remain enforced. No automatic grant occurs at startup.

After approval, run once locally using the known postgres account password only at its hidden prompt:

```powershell
Set-Location -LiteralPath '<repository-root>'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' --host=127.0.0.1 --port=5432 --username=postgres --dbname=ccna_phase6a_dev --password --no-psqlrc --set=ON_ERROR_STOP=1 --file=tools/phase6a-local/08-grant-admin-catalog-delete.sql
```

Expected successful output: `BEGIN`, three `SET` confirmations, `DO`, `GRANT`, `DO`, `COMMIT`. Stop on any error; do not guess credentials, change passwords, broaden grants or bypass guards. The operator subsequently reported **Done** after executing this approved command. That is recorded as operator-confirmed completion; raw COMMIT output/live privileges were not independently inspected by the agent, which did not connect to the application database. Do not rerun it merely for this documentation.

## Practice usage

Visit `/practice`. Choose a topic, inspect its available count and mapped domain where available, choose 1–100 questions up to the topic's available count, then Start Practice. The server rechecks availability and atomically issues a distinct question set; no delivery is created before Start. Unknown chapter mappings remain topic-specific; no domain/objective mapping is guessed.

`POST /api/practice/sessions` accepts only `{ topicId, count }`; actor/session come from verified Clerk/server context. It captures existing immutable revisions and deliveries inside one transaction, using the existing schema. The response contains only the existing learner-safe question DTO fields—no answer keys, explanations or author notes. The old single-question API remains compatible. The new UI sends `X-Practice-Session` on session creation and grading, so stale browser intent cannot silently act under a switched Clerk session; omission remains compatible for older clients.

The session provides question position, answered-based progress, answered/unanswered/remaining/flagged counts, numbered navigator, Previous/Next, flags, Submit Answer and Finish Practice. Selections and flags survive navigation. Grading remains server-side using the exact delivery UUID; accepted answers are persisted in PostgreSQL through the existing immutable attempt mechanism. Duplicate in-flight submissions are suppressed. Old-account callbacks cannot populate a new account's session.

Finishing with unanswered questions requires the accessible confirmation dialog. Results show correct, incorrect, unanswered, total and `correct / total` score. Merely choosing an option does not count as a submitted answer. Review includes server-returned explanations/correct choices for submitted answers; unanswered items do not expose an unsubmitted answer key. Browser navigation/flags/results are in memory and cleared on reload/sign-out; accepted PostgreSQL history remains available at `/practice/history`.

## Run the updated application

Restart the existing API session to load current source (the guarded API launcher is not a backend watcher). Stop the API/frontend through Ctrl+C in their owning terminals. Do not kill an unidentified listener, reset data or reseed.

In one PowerShell terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

In another:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Enter existing app-role credentials and Clerk development keys only at the launcher's private prompts. No stored secrets are read by the implementation/test workflow. Open `http://localhost:8080/admin/questions`, `/admin/topics` and `/practice`. No migration or seed command is needed.

Read-only service checks:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/healthz'
Invoke-RestMethod -Uri 'http://localhost:8080/api/topics' | Measure-Object -Property questionCount -Sum
```

After the updated API is loaded, the published pilot topic counts should total 60. Do not test deletion by selecting those 60 pilot questions. Authentication and Admin operations must use the real signed-in UI, not fake tokens.

## Validation and isolated test target

Offline suite: `node tools/run-curriculum-tests.mjs`. Runtime/grant checks: `node --test tools/phase6a-local/policy.test.mjs tools/phase6a-local/catalog-delete-grant.test.mjs tools/phase6a-local/runtime-startup.test.mjs tools/phase6a-local/upgrade.test.mjs`. TypeScript: `node tools/check-admin.mjs`. Production compilation: `node tools/build-admin-ui.mjs` (installed tooling, environment-file loading disabled; existing UI source-map warnings).

The explicitly approved PostgreSQL fixture runner uses only **ccna_drizzle_check_20261012_c08f12ad34b6**, owner `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170`, `127.0.0.1:55440`. It verifies workspace/Git identity, canonical directory/ownership marker, PID/executable/listener, PostgreSQL 18.6, database identity/owner, exact reviewed ledger and empty application records. It creates no database, migrates nothing and connects to neither populated rehearsal database nor the application database. Its ledger reflects the previously reviewed Drizzle run's original CRLF 0004 hash; this does not change the application LF ledger guard.

The existing private cluster was found stopped. After separate explicit approval it was started at loopback port 55440 (PID 31876 at startup); no new environment or Windows service change occurred. Each authorized test run temporarily permits only the exact test database and owner over IPv4 loopback, before the reject rules, then restores the original HBA bytes. Fixture transactions always roll back, even on failed assertions. Final checks require no fixture rows and an unchanged ledger. Only this disposable database's nontransactional question sequence may advance.

```powershell
node tools/run-admin-practice-disposable.mjs --plan
# Execute only under the explicitly approved isolated-test scope:
node tools/run-admin-practice-disposable.mjs --execute-isolated
```

The initial implementation's validation preceded the permanent-only correction. The correction passed **340 offline regression tests across 28 files and 5 isolated PostgreSQL tests**. Database tests verify physical absence of parent/options/objective-link rows, mixed bulk outcomes, and unchanged status/timestamps/history for BLOCKED records. Pilot UUID protection, stale-server refusal and no-archive behavior are covered by focused unit tests. TypeScript and final build/diff results are recorded in [the permanent-delete review](permanent-admin-delete.md).

The first implementation's real run exposed the UUID-array SQL defect; it was corrected. Current tests pass without an archive path. Fixture transactions roll back, and HBA is restored byte-for-byte. Signed-in production browser actions are not claimed from automated tests; existing production questions/topics were not deleted during verification.

## Files

New implementation files: API `lib/admin-delete.ts`, `lib/pilot-content-protection.ts`, `lib/practice-batch.ts`; frontend `components/admin-delete-controls.tsx`, `components/practice-run-workspace.tsx`, `lib/practice-run.ts`, `practice-run.css`.

Modified integration points: API `routes/admin-questions.ts`, `routes/admin-topics.ts`, `routes/practice.ts`; existing Admin question/topic managers; `practice-workspace.tsx` now exports the finite-session implementation; catalog cache invalidation; scoped runtime privilege validation. Existing Add/Edit implementations are retained.

New/updated tests cover service transactions, parameterization, protection, mixed outcomes, authorization, selection/filter/pagination behavior, confirmation, duplicate suppression, account lifetimes, availability, navigation, flags, grading payloads and results. New isolated-test runner/config/tests are under `tools/admin-practice-disposable*` and `tools/run-admin-practice-disposable.mjs`; the existing offline runner includes the focused regressions. New inert permission procedure/static tests are `tools/phase6a-local/08-grant-admin-catalog-delete.sql` and `catalog-delete-grant.test.mjs`.
