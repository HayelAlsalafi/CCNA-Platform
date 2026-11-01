# Critical lesson discovery and API contract repair

28 October 2026. Source repair complete; manual API restart and authenticated
acceptance remain pending. No migrations, database writes, grants, automatic
service restarts, commits or pushes were performed.

## Evidence and confirmed failing layer

The current source was inspected before edits: service DTOs, publication queries,
actual Express registration, strict request/response validators, generated lesson
schemas/client URLs, Admin filters/pagination and session-scoped React Query keys.

The running backend was outdated:

| Evidence | Observed result |
| --- | --- |
| Guarded API listener | PID 20000, `127.0.0.1:3000` |
| API creation time | `2026-10-28T06:48:06.2832930Z` |
| Guarded frontend listener | PID 30620, `127.0.0.1:8080` |
| Frontend creation time | `2026-10-28T06:48:57.0033310Z` |
| Lesson service/route/validation source modification | `2026-10-28T07:25:17Z` |
| Direct API `/api/healthz` | HTTP 200, `{"status":"ok"}` |
| Proxied frontend `/api/healthz` | HTTP 200, same JSON |
| Unauthenticated `/api/admin/lessons/library?page=1&pageSize=25` | HTTP 401, JSON code `UNAUTHENTICATED` |
| Unauthenticated chapter lesson GET for canonical V1-1 | HTTP 401, JSON code `UNAUTHENTICATED` |

The launcher imports the Express application once using tsx's registration API;
it does not run a watcher. Vite can update frontend modules while that backend
retains its older imported routes and services. Browser refresh/cache clearing
cannot update those server modules. The proxy correctly reaches Express; health
success by itself does not prove the latest lesson API is loaded.

Two known pre-update behaviors explain the reported screenshots:

1. The earlier API has `/admin/lessons/:id` but not the new static `/library`
   endpoint. The literal `library` is parsed as a UUID; its GET error was reported
   as “Review the lesson fields.” The current source already registers the static
   route before the dynamic ID route and validates page/query filters separately.
2. The earlier chapter service omits `revisionId`/`revisionNumber` from non-empty
   lesson summaries. The generated response contract requires both, so its route
   emits `LESSON_RESPONSE_INVALID`. The prior source correction already adds both
   from the immutable published revision, but the older process never loaded it.

The process/source version mismatch is confirmed. The exact authenticated failing
payload was not captured during this repair; the legacy route/DTO explanations
are supported by the inspected earlier implementation and current source. No
claim is made to have inspected the user's published PostgreSQL row directly.

## Minimal changes

- `artifacts/api-server/src/routes/lessons.ts`: lesson responses now identify the
  loaded route contract with `X-Lesson-Api-Contract: discovery-library-v2` (including
  authentication failures). Response-contract failures retain HTTP 500 and strict
  validation, with bounded structural diagnostic paths/codes. GET validation errors
  describe invalid filters/identifiers rather than incorrectly suggesting content
  edits. Mutation field validation remains separate. Invalid mutation responses
  never claim that a save did or did not commit.
- `artifacts/api-server/src/lib/lesson-validation.ts`: bounded safe issue formatter;
  it omits received values, authored content, raw errors and unsafe identifiers.
- `artifacts/api-server/src/lib/lessons.ts`: invalid stored published snapshots now
  produce HTTP 500 / `LESSON_PUBLISHED_DATA_INVALID`, not HTTP 400 blaming user
  request fields. Existing strict snapshot validation is preserved; no stored
  field is dropped, rewritten or silently defaulted to make invalid data pass.
- `artifacts/ccna-learning/src/pages/lesson-reader.tsx`: actionable distinctions
  between an older library-as-UUID API, rejected filters, missing endpoints and
  server publication/response-contract failures. Safe diagnostic field paths are
  shown where supplied.
- `artifacts/ccna-learning/src/components/admin-lessons.tsx`: inventory errors use
  library context; create/edit errors keep authoring context.
- `artifacts/api-server/src/routes/lessons.test.ts`,
  `artifacts/api-server/src/lib/lessons.test.ts`,
  `artifacts/ccna-learning/src/components/lessons.test.tsx`: focused regression
  additions described below.
- This report.

No generated files were edited or regenerated: current learner success contracts
already match the corrected source DTO. Existing error envelopes permit additive
diagnostics. Admin library retains its explicit Zod validator and typed client
response. The header is diagnostic only and never authenticates/authorizes users.

## Data flow and integrity preserved

Publication discovery still joins `lessons.published_revision_id` to a revision of
that same lesson, checks active chapter topic/blueprint and the snapshot's exact
chapter UUID, and serializes published snapshot metadata. Drafts and working-copy
fields are excluded. List order remains `(display_order,id)`. Questions/practice
availability do not gate published lesson availability.

Admin metadata search/count/filter/pagination remains parameter-bound and READ
ONLY; it selects metadata rather than all lesson bodies/history. The existing
database ADMIN boundary protects it before any service access. Revision immutability,
authorization, session preconditions, query identity scoping, no-store headers,
curriculum UUIDs and runtime safeguards are unchanged.

## Verification

| Check | Actual result |
| --- | --- |
| `node tools/run-curriculum-tests.mjs --lessons` | **190 passed**, 10 files |
| `node tools/check-admin.mjs` | PASS: API/frontend/schema/client TypeScript |
| `node tools/build-admin-ui.mjs` | PASS: production frontend build, 1962 modules |
| Existing local API/proxy health GETs | HTTP 200 |
| Unauthenticated real lesson endpoints | HTTP 401, `UNAUTHENTICATED` |
| Current running lesson contract header | Absent; restart pending |

Tests use database-free fixtures. New integration coverage runs actual service
output through the actual route and response validator for a non-empty canonical
chapter and published Admin library item. Canonical UUID v5 placement, publication
ID/number, domain metadata and pagination totals are included. Reader service output
also passes its generated response validator. Negative cases retain strict failures
for malformed publication snapshots, incorrect successful service responses and
invalid page sizes. Tests verify safe diagnostic paths without authored values.
Existing coverage for search/filters, paging, draft isolation, learner navigation,
Admin authorization and session binding continues to pass.

Build emitted the existing UI source-map notices and >500 kB chunk warning. No
unrelated tests were run or investigated. No actual signed-in browser verification
was performed. The agent has no authenticated browser/session credential; none was
read, requested or fabricated. In addition, existing authenticated middleware can
update account login timestamps, so no authenticated live request was initiated
under this task's no-database-write requirement.

## Previously published lesson and remaining blockers

Current source correctly discovers valid published revisions under their exact
canonical chapter, proven by the service-to-route regression. The running older
API must be restarted to load it. **The user's particular published lesson has
not yet been verified as discoverable through the authenticated running app.**
No content, chapter association or revision needs changing based on the evidence
currently available. If a fresh API still rejects metadata, preserve the sanitized
error code and structural diagnostic paths; investigate that precise invariant
before proposing any separately approved data correction. Do not republish/edit
existing lessons to conceal a contract error.

## Exact manual restart and acceptance

Do not run migrations or activation again. Restart only the API first: Ctrl+C in
its existing terminal, then run from the project directory:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Enter the existing app and migrator passwords and Clerk keys only at hidden local
prompts. No credentials belong in chat. The running Vite frontend can remain up;
if a frontend restart is needed, Ctrl+C only in that terminal and run separately:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

After handling any unsaved editor changes, reload `/admin/lessons` and `/topics`
or use Retry. In the existing signed-in browser Network panel verify:

1. `GET /api/admin/lessons/library?page=1&pageSize=25` returns HTTP 200 with
   `{items,total,page,pageSize,summary}` and correct published lesson metadata.
2. The selected chapter lesson GET returns HTTP 200; every published item includes
   its exact chapter ID, `revisionId` and `revisionNumber`.
3. Both lesson responses contain `X-Lesson-Api-Contract: discovery-library-v2`.
4. Start Learning opens that chapter's published lesson; reader ordering works,
   drafts remain excluded, and Start Practice remains independent.

If a request still fails, copy only its status, safe error code/diagnostic paths
and whether the contract header is present. Never copy request cookies, bearer
tokens, Clerk keys or complete authenticated request headers.
