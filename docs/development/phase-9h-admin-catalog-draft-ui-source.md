# Phase 9H — admin catalog draft UI integration (source only)

2026-11-10 (Asia/Riyadh). Extends the existing `/admin/catalog` interface and
uncommitted Phase 9G contracts without changing backend authorization or SQL.
**SOURCE COMPLETE for the approved limited frontend scope. Runtime/database and
interactive visual acceptance NOT VERIFIED. DATABASE ACTIVATION NOT AUTHORIZED.**

## Implemented interface

The existing read-only active catalog and `/admin` dashboard remain intact. A
separate **Open draft management** control mounts the draft workspace only after
the existing server-reported GLOBAL OWNER/ADMIN UI admission. No learner-private
analytics, legacy ADMIN fallback or COURSE assignment shortcut was added.

The draft workspace independently checks readiness through actual Phase 9G GET
responses. Inactive/denied/unavailable responses do not become empty inventories
or local demo data. Create controls require successful readiness reads. Existing
AdminPanel/AdminButton, AdminSessionBoundary/useAdminSession, adminQueryKey,
React Query, AlertDialog and centralized typed localization are reused.

- Draft tracks list and Track creation.
- Course lists/creation under an explicitly selected draft track or the known
  active track selected in the separate read-only pane.
- Version lists under an explicitly selected draft/known active course; no raw
  parent UUID input or automatic parent inference.
- Metadata editing for all three DRAFT kinds: title, description, displayOrder and
  required reason. Backend remains authoritative about protected/bound resources.
- CourseVersion creation **stays disabled** until an appropriately authorized DRAFT
  blueprint picker is approved. No taxonomy API/legacy privilege is reused for it.
- Editor shows captured target and parent, locks draft scope selection while open,
  and never converts a changed parent/selection into a different mutation target.
- There is no publishing, retirement, deletion, entitlement, billing or staff
  analytics operation. Existing UNKNOWN analytics placeholders are retained.

## Exact contracts and transport

`catalog-drafts-client.ts` is a frontend-only adapter; it imports no server service,
database schema or credential transport. It reuses authenticated `lessonRequest`
with `no-store` and existing `adminMutationOptions` for `X-Admin-Session`.
The header is session consistency evidence, never authentication/authorization.

| Operation | Actual Phase 9G request |
| --- | --- |
| List tracks | GET `/api/admin/catalog/tracks?page=N` |
| List courses | GET `/api/admin/catalog/courses?page=N&parentId=<track>` |
| List versions | GET `/api/admin/catalog/versions?page=N&parentId=<course>` |
| Create track/course | POST `/api/admin/catalog/tracks` or `/courses` |
| Edit metadata | PATCH `/api/admin/catalog/{tracks,courses,versions}/:id` |

Reads validate page 1–10000, pageSize 20, safe nonnegative totals, at most 20
unique UUID records, DRAFT state and metadata bounds. All read query keys include
kind/parent/page and authenticated user/session. New `/api/admin/catalog` family
is registered in existing session cleanup, independently of `/api/catalog`.
Read requests consume AbortSignal; no automatic query/mutation retries are enabled.

POST/PATCH payloads are constructed explicitly, never by spreading API records or
untrusted form objects. Common fields: requestId, trimmed title/description/reason
and integer displayOrder; creation adds slug and, for courses, captured trackId.
Edits add **only** expectedVersion. Identity, status, scope, actor and parent edits
are not serialized. Frontend bounds match 9G: title 1–180, description ≤4000,
reason 5–500, order 0–100000, lowercase hyphenated slug ≤100. Empty/fractional
orders are rejected rather than coerced or truncated.

Version tokens remain exact opaque UTC strings with **all six fractional digits**.
No Date conversion, locale formatting or rounding is used in comparison/storage/
serialization. Locale changes do not alter form values, operation IDs or query keys.
Server receipts must be DRAFT and match resource/metadata and an advancing version
for edits. An unexpected receipt is unresolved, never a success message.

## Mutation state, conflicts and uncertain outcomes

Each logical operation captures a frozen body, target, kind, parent and expected
token with one crypto.randomUUID requestId. An unchanged known-rejected intent
keeps its ID; a deliberately revised payload or explicitly reviewed new version
creates a new logical operation. There is no timer/refetch-driven write.

A synchronous ref lock prevents duplicate clicks before React state settles.
Pending dialogs/scopes cannot be closed or changed through the draft controls.
Responses are checked against both mounted-editor lifetime and the existing
captured authenticated session generation. Late responses from a departing user/
session cannot produce success notices, change selections or invalidate another
session's cache. Successful verified saves invalidate only current-session draft
queries; subsequent read failures do not turn a confirmed save into a replay.

| Failure | Frontend behavior |
| --- | --- |
| 400 | Keep inputs, show validation notice; no retry. User can correct fields and explicitly submit. |
| 401 / ADMIN_SESSION_CHANGED | Block writes and replay, preserve current form for review. |
| 403 | Block further draft writes; retain form until deliberate cancellation/navigation. No legacy fallback. |
| 404 | Keep form, disable saving that target; do not create a replacement or retarget to another row. |
| 409 | Pause saving. Existing resource requires manual GET refresh, side-by-side server values and explicit adoption of a newer token; local fields are not overwritten. Protected-resource errors are not mislabeled as only stale versions. For rejected creates, an explicit review action starts a revised intent, not an automatic retry. |
| 503 / network / malformed mutation receipt | **Unresolved**, even when an error might indicate feature unavailability. Keep original frozen request visible; disable save/cancel/replacement writes. No automatic retry or new request ID. |

Conflict refresh uses the originally captured parent/page, never a different target.
If the target moved off that page, report that fact without claiming deletion or
scanning the whole catalog. If refresh fails, saving remains blocked. An unchanged
token cannot be silently adopted to retry a protected draft.

Unresolved requests are shown as escaped JSON for **manual review**, containing
kind/target/parent/body/requestId, not authorization headers or credentials. A
beforeunload warning discourages losing an in-flight/unresolved request. No raw
driver message/stack/response body is rendered, and no request is logged or written
to localStorage/sessionStorage. Preservation is **in page memory**, not guaranteed
across reload, route departure, sign-out or browser termination. Record the visible
request before leaving; this scope adds no persistence queue, operator receipt
endpoint or replay button. It cannot determine an uncertain database commit.

## Files

Added:

- `artifacts/ccna-learning/src/lib/catalog-drafts-client.ts`, its `.test.ts`.
- `artifacts/ccna-learning/src/components/catalog-draft-manager.tsx`, its `.test.tsx`.
- `artifacts/ccna-learning/src/i18n/catalog-draft-messages.ts`.
- This report.

Scoped edits: `components/course-catalog-admin.tsx` (separate opt-in section),
`lib/admin-session.ts` (draft cache family), `i18n/messages.ts` (dictionary merge).
No backend, schema, historical/proposed SQL, feature flag or dependency change.
Earlier 9G working-tree changes remain preserved; this phase does not commit them.

## Offline verification

Final focused run: **61 PASS / 0 FAIL in five files**:

- New adapter: 12 tests; exact routes/payloads/tokens, validation, error categories,
  receipt verification and no retries.
- New manager: 17 tests; creation, version editing, disabled version creation,
  duplicate click lock, original request IDs, error/uncertainty handling, explicit
  conflict review, captured scope, failed refresh, session-switch late responses,
  cache invalidation/cleanup and Arabic state preservation.
- Existing read-only catalog: 12 tests.
- Existing GLOBAL user administration: 5 tests.
- Existing localization: 15 tests.

Final root `pnpm run typecheck`: **PASS**. An initial adapter test hook accidentally
returned its mock as a cleanup function, causing five cleanup failures; corrected
to a block-bodied setup hook, preserving every assertion. Focused rerun and final
combined run passed. No database/full suite, production build, service or browser
test was executed. Identity/transport fixtures do not verify real Clerk/DB behavior.

## Future visual acceptance — instructions only, NOT EXECUTED

1. Obtain separate authorization for an isolated/staging deployment with verified
   schema, manager ACLs, GLOBAL roles and Phase 9G operations. Do not enable main
   flags or remove the global 503 barrier to perform this checklist. Resolving the
   barrier and deployment activation is outside 9H source authorization.
2. At `/admin` and `/admin/catalog`, inspect the unchanged dashboard/active catalog
   first. Verify denied/signed-out/legacy-only/CONTENT_MANAGER identities do not
   obtain draft controls, and disabled backend remains unavailable rather than zero.
3. At **1600×900, 900×1000 and 390×844**, in English and Arabic, open draft management.
   Check wrapping/overflow, list pagination, RTL ordering, visible focus/tab order,
   dialog scroll/escape behavior, reason fields and long mixed-language titles.
4. In that separately authorized disposable environment only, exercise Track/Course
   creation and metadata editing, exact token handling, confirmations, parent locks,
   duplicate clicks and explicit conflict comparison. Do not edit canonical/bound
   CCNA metadata; no production record is a test fixture. Version creation must
   remain disabled; do not substitute the ACTIVE CCNA blueprint.
5. Use an approved fixture/proxy to simulate 400/403/404/409/503, lost response and
   session switch. Confirm unresolved JSON preservation, no replay/replacement,
   no stale-user success/cache update, and accessible Arabic error messages.
6. Confirm no publishing, retirement, deletion, entitlement or staff-analytics
   request exists. Reinspect both legacy panes after locale changes and navigation.

**Visual acceptance: NOT VERIFIED.** Remaining dependencies: approved blueprint
selection for version creation, manual uncertain-outcome diagnosis/receipt lookup,
live isolated SQL/concurrency/security/recovery evidence and explicit activation
authorization. Existing Phase 9D limitations remain; this UI does not finish them.

**SOURCE COMPLETE for approved 9H frontend scope. DATABASE ACTIVATION NOT AUTHORIZED.
Public Beta: NO-GO.** No database/storage operations, live content changes, service
starts/restarts, Git staging/commit/push, or migration execution occurred.
