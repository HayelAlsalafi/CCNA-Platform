# Phase 9E — enrollment and learning analytics source

2026-11-06 (Asia/Riyadh). Work began on `main` at
`debda491d157fb56a792daafa6a11206e0428303`, retaining the 9C/9D tree. The owner
then intentionally created checkpoint `aa5d1867bc5823b10f60673f596495c77f6fc396`
on `backup/phase9-source-wip` and explicitly confirmed this as the correct
development branch. Completion continues there, preserving that commit and all
remaining local changes. No branch switch, reset or Git publication was performed
by this implementation task. **SOURCE COMPLETE for this minimal foundation; runtime/SQL execution NOT
VERIFIED. DATABASE ACTIVATION NOT AUTHORIZED.**

## Files and behavior

Phase 9E files (partly included in the owner's WIP checkpoint, with the remaining
work left uncommitted):

- `lib/db/src/schema/course-enrollments.ts`
- `lib/db/drizzle/proposed/0022_course_enrollment_analytics.sql`
- `artifacts/api-server/src/lib/course-enrollments.ts`, its `.test.ts`
- `artifacts/api-server/src/lib/course-learning-analytics.ts`, its `.test.ts`
- `artifacts/api-server/src/routes/course-enrollments.ts`, its `.test.ts`
- This report.

Only shared registration changes: append schema export in `lib/db/src/schema/index.ts`
and mount enrollment router in `artifacts/api-server/src/routes/index.ts`, after
the existing **unchanged 503 activation barrier**. Existing 9C/9D work is preserved.

### Enrollment is learning intent

One stable enrollment per learner/version, with course derived through the real
version FK. `ACTIVE` means tracking intent, not payment, entitlement, authority or
verified completion. No existing user is auto-enrolled. No catalog/content/user
or historical record is modified by this package.

Lifecycle: initial ACTIVE; ACTIVE → PAUSED/WITHDRAWN; PAUSED → ACTIVE/WITHDRAWN;
WITHDRAWN → ACTIVE through an explicit new request. The original enrollment ID
survives withdrawal/resumption. Same-state requests with new request IDs conflict;
an exact authorized retry returns its original result. No self-asserted COMPLETED
or certificate state is introduced; future completion policy is deferred.

`ENROLLMENT_ENABLED` must equal `true`, otherwise service returns 503 before reads
or changes. No flag was set/forwarded. Starting/resuming also calls the existing
central `canAccess` evaluator for VERSION `metadata.read` in **forced protected
mode**, independent of whether unfinished global entitlement enforcement is on.
Missing policy/functions/rights deny; enrollment never provides those rights.
Pause/withdraw does not require continued purchase or catalog publication.

Authenticated API, no-store, no UI added:

| API | Behavior |
| --- | --- |
| GET `/api/enrollments?page=1` | Only caller's records; fixed 20/page, max page 10000; IDs, status/version and timestamps only |
| POST `/api/enrollments` | Strict `{courseId,versionId,status,expectedVersion,requestId}`; requires `X-Enrollment-Session` equal to the verified session; actor comes from Clerk-derived local ACTIVE user |
| GET `/api/enrollments/:courseId/versions/:versionId/analytics` | Exact owned enrollment and course/version; any retained lifecycle permits reading personal historical metrics |

No caller-supplied learner/actor UUID or role is accepted. No Admin shortcut or
staff analytics endpoint. API responses are schema-checked; unexpected mutation
outcomes are explicitly unverified, not automatically retried. Raw SQL/provider
diagnostics are never returned. These are standalone additive source APIs; no
existing generated contract was changed and no generated client/UI was added.

### Narrow proposed SQL operations

0022 defines `course_enrollments`, append-only `course_enrollment_events`, and
`course_attribution_epochs`. No rows are seeded. Existing ordered journal,
snapshots, historical SQL and protected manifests are unchanged.

Only narrow read/change functions receive app EXECUTE. Change independently
rechecks ACTIVE actor, exact parent context and ownership. It uses transaction
advisory locks for actor/request and actor/version, expected-version checks,
canonical request digest and same-transaction immutable event insertion. Failure
to record the event aborts the state change. Different payloads for a reused key
conflict. Concurrent stale writers/serialization failures stop without retries;
real concurrency and SQL compilation still require an isolated rehearsal.

Ordinary analytics SELECT on the **new** enrollment table is protected by its
owner-only SELECT RLS policy using the existing actor-local `app.study_user`
mechanism. Existing lesson policies/grants are not changed. Epoch SELECT is
column-limited; operator approval references are not exposed to the app. No
application INSERT/UPDATE/DELETE, no event-table SELECT, role change, entitlement
write, bootstrap or management credential is added. Definer functions trust the
verified API to supply actor UUIDs; this is not independent DB proof of Clerk.

## Attribution and analytics

Today's chapter binding alone does **not** prove a historical course. An empty-on-
installation epoch table records the earliest reviewed scope boundary for a
version. A future separately approved migrator insertion must verify immutable
binding guards; its trigger captures **server clock** and hashes sorted bound
chapter/blueprint tuples. It rejects an empty chapter binding, and epochs cannot
be updated/deleted/truncated. No insertion/approval reference has been supplied
or executed here. Correct trigger body/owners and binding immutability must be
verified as part of activation, not inferred from a mere function name.

The ordinary app-role read-only REPEATABLE READ analytics transaction sets its
own verified actor context and first confirms exact enrollment/course/version
ownership. It reads no annotations, note bodies, selected answers or educational
text into responses. No RLS bypass or security-definer learner analytics function.

Attribution requires a still-matching epoch hash and captured identities:

- Lessons: immutable revision's captured `chapterId`, revision creation and saved
  progress update at/after epoch. Counts are **progress records**, not distinct
  completed courses or a guessed course-completion percentage.
- Practice: immutable captured topic/chapter ID, matching attempt topic and
  revision/delivery owner bindings, revision creation, delivery and submission
  all at/after the epoch. Never infer through today's mutable question row.
- Exams: every original item must resolve from its immutable revision/captured
  chapter mapping, all question revisions and session start at/after the epoch,
  exact item count and exactly one provable version. Missing/tombstoned revisions,
  mixed-version or incomplete sessions remain UNKNOWN. Existing results and
  mapping JSON are not rewritten or regraded. Mean uses only valid stored terminal
  `percentage` values; missing/invalid values are not invented as zero.

Response `attribution: UNKNOWN, scoped: null` means no valid proof epoch for the
requested version. With an epoch, `EPOCH_BOUND` gives only the provable subset.
`unattributedOwnerHistory` is explicitly the caller's **unattributed history across
all courses**, not assigned to the requested course and never included in its
totals. Proven records from another version are excluded from both the requested
scope and UNKNOWN counts. No inferred purchases, demographics, time-spent,
completion denominator, official score or missing historical attribution.

## Offline results and remaining gates

Focused tests: **17 PASS / 0 FAIL in three files** (8 enrollment/lifecycle/schema,
5 analytics/ownership/proof/UNKNOWN, 4 route/auth/session/error tests).
Root `pnpm run typecheck`: **PASS**. SQL-source/fixture tests do not prove query
execution, actual PostgreSQL permissions/concurrency or live attribution. No full
suite, build, real Clerk or storage/database operation was run.

After the owner confirmed the new branch, a targeted final source review required
no further implementation changes. The successful 17-test and TypeScript results
above are reused rather than rerun. The final SQL ownership/column-grant tightening
was already checked by the focused eight-test enrollment rerun, not counted again.
Final `git diff --check` passes. The global 503 barrier and feature-flag defaults
remain unchanged; no entitlement-management decision or 9F scope was introduced.

Pending activation: current read-only 0017 identity/ledger/schema/security/data
inventory; verified post-0017 backup and isolated restore; exact ordering/promotion
of proposed 0018–0022 with reviewed metadata/executor/startup guards; separate
approval for new table RLS/function/column grants and any epoch initialization;
SQL compilation, idempotency/rollback/concurrency/RLS/attribution and full data
preservation rehearsal. New 9E FKs target users/version/enrollment only, adding no
lesson-deletion dependency. The separate 9D lesson-policy FK/deletion review is
still pending, as are its deferred question/exam enforcement and grant-management
APIs. Enrollment does not complete or activate those features.

All 16 owner-designated real questions/dependencies, experimental lessons/exams
and all other data remain preserved. No migration, enrollment, epoch, event or
analytics snapshot was executed/persisted. No UI, billing, entitlement management,
service change, Git staging/commit/push by this implementation task, or further
phase work. The owner's separate backup checkpoint is acknowledged above.

**Minimal Phase 9E source foundation: COMPLETE. Activation/Public Beta: NO-GO.**
