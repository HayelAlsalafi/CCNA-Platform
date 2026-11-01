# Command Center navigation regression fix

## Diagnosis and evidence

The source-level failure was reproduced offline before the fix. It affects
`GET /api/nexus/analytics`, implemented by `nexusAnalytics()` in
`artifacts/api-server/src/lib/nexus.ts`, consumed by `NexusOverview` through
`useNexusAnalytics()`.

The Phase 1 response validator checks the complete analytics response. The
installed Drizzle node-postgres raw executor deliberately returns TIMESTAMPTZ
(OID 1184) values as strings. Session history and the resumable-session query
selected bare timestamp columns. For example, the resulting value can be
`2026-10-26 12:00:00.123456+03`, whereas the API contract requires an ISO
date-time such as `2026-10-26T12:00:00.123456+03:00`. JSON.stringify does not
normalize an existing string.

An empty history has no session timestamp to validate and passes. After starting
practice, validation rejects `sessions.items[0].createdAt` and, for an active
session, `resume.createdAt`. After completing practice, it also rejects
`sessions.items[0].completedAt`. The uncaught validation error previously became
the generic HTTP 500 that triggers the full dashboard error state.

Before the source correction, the two new ACTIVE/COMPLETED regression cases
failed at exactly those paths: 139 tests passed and 2 failed. A separate test
uses the installed Drizzle executor with an in-memory fake client to verify its
actual timestamp and JSON type-parser behavior without opening a connection.
This establishes the source defect; it does not establish the exact HTTP status
or catalog state of a particular running application process.

## Workflow traced

1. `progressIdentity()` waits for loaded, signed-in Clerk user/session IDs.
   Analytics query keys include that identity, range and timezone.
2. The generated analytics fetcher uses `customFetch`, which awaits the existing
   token getter. The server verifies Clerk authentication and the PostgreSQL
   user; the client cannot choose another learner ID.
3. `nexus-practice.tsx` initializes persisted sessions, saves selections, and
   submits answers/final completion through the existing authenticated routes.
   Its existing `refresh()` invalidates Nexus analytics after successful actions.
4. Leaving Command Center unmounts its observers; query cancellation consumes
   the AbortSignal. Returning mounts a fresh query (`gcTime: 0`, no automatic
   retry), which now sees the persisted session rows.
5. That response, rather than navigation itself, triggered the timestamp
   validation failure. The existing real Retry request cannot correct malformed
   server serialization, so an authentication/cache workaround was not added.

## Minimal correction

Use `to_json(s.created_at)` in the resumable-session query and
`to_json(s.created_at)` / `to_json(s.completed_at)` in session history. PostgreSQL
serializes these as ISO JSON timestamps, retaining timezone offset, microseconds
and null completion timestamps. JSON output follows PostgreSQL's JSON conversion
rules ([documentation](https://www.postgresql.org/docs/18/functions-json.html));
timestamp examples are also covered by PostgreSQL's own
[regression fixtures](https://github.com/postgres/postgres/blob/master/src/test/regress/expected/json.out).

The complete generated response validator remains strict and unchanged. Invalid
analytics now produces a sanitized `ANALYTICS_RESPONSE_INVALID` error code, which
the route also logs without row values, credentials, SQL or connection details.
Other unexpected failures still return the existing sanitized error. No error
is converted to a successful response, fake zero counts or stale-as-fresh data.

No UI layout, authentication, grading, submission, migration or cache policy
change was needed. Session-history consumers now receive ISO timestamps too.

## Files changed

- `artifacts/api-server/src/lib/nexus.ts`: three timestamp projections and
  identifiable sanitized response-validation failure.
- `artifacts/api-server/src/routes/nexus.ts`: sanitized code logging for server
  errors represented by the existing API error types.
- `artifacts/api-server/src/lib/command-center.test.ts`: installed-driver parser
  evidence; active/completed session response assembly; UTC, positive and
  negative offsets; microsecond/null handling; strict invalid-date rejection.
- `artifacts/api-server/src/routes/command-center.test.ts`: sanitized validation
  diagnostic HTTP/log behavior.
- `artifacts/ccna-learning/src/components/command-center.test.tsx`: auth and token
  readiness; unmount/remount with and without newly committed answer fixtures;
  active invalidation; persistent failure and bounded manual retry; navigation
  abort and late-response isolation; GET-only dashboard requests.
- This report.

## Verification

| Check | Actual result |
| --- | --- |
| `node tools/run-curriculum-tests.mjs --command-center` | PASS: 152 tests, 9 files, 0 failures |
| `node tools/check-admin.mjs` | PASS: API, frontend, schema and API-client TypeScript |
| `node tools/build-admin-ui.mjs` | PASS: 1,954 modules; output `.local/admin-ui-production-build/1793042115941` |
| `git diff --check` | PASS; existing Git line-ending warnings only |
| Browser availability | No apps or browsers exposed; live reproduction NOT PERFORMED |
| PostgreSQL connections / SQL execution | NOT PERFORMED |

The final focused selection includes existing initial-load, five-tab interaction,
learner-isolation, transient-error/retry and learning-progress cache tests.
Fourteen tests were added to the previous 138-test selection. Navigation tests
exercise dashboard lifecycle and mocked committed server responses; they do not
claim a real PostgreSQL practice submission or full browser route journey. The
late-response test deliberately uses a transport that ignores cancellation to
ensure the old observer cannot replace newly fetched metrics. Dashboard reads
remain GET-only; submission implementation was not changed.

The production build retained its existing UI sourcemap and large-chunk warnings.
No unrelated baseline failing tests were run or investigated. No database data,
services, stored secrets, migration files or dependency versions were modified.
Existing uncommitted work was retained. Nothing was committed or pushed.

## Local verification still required

Restart the API using its normal guarded launcher so it loads the corrected
source. Stop only its own terminal process with Ctrl+C first, if already running:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Keep that terminal open. If the frontend is not running, use a second terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Enter existing credentials only at the launcher's hidden local prompts. In the
signed-in site, inspect the Network panel while opening Command Center,
navigating to Challenge Arena and returning. Test once after starting a session
without an answer and once after an intentionally submitted practice answer.
Confirm analytics returns HTTP 200, the three timestamp fields use ISO format,
committed counts update, and all five tabs remain usable. No reset, seed or
migration is needed. A genuine remaining failure must be reported with its
sanitized diagnostic code; do not bypass validation or assume a saved answer
failed merely because the dashboard could not load.
