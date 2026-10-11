# Phase 6A release readiness validation

Validation date: 2026-10-11. This review extends the immutable revision milestone;
its schema, migrations, grading service and server RBAC were not reimplemented.

## Confirmed authentication race and focused fix

Real continuous Clerk switching reproduced an identity discrepancy: the active
SDK user was the owner ADMIN, but a cookie-authenticated `/api/auth/me` returned
the other local USER. A shared browser cookie is not a reliable binding between
an asynchronous query's session identity and its authenticated request.

`ClerkRequestAuth` installs the request source before mounting query consumers.
API requests use only the genuine active Clerk session token with cookies omitted.
The token getter captures user, session and listener generation before awaiting
Clerk. Loading, missing tokens and transitions (including A/B/A) stop dispatch;
signed-out public requests remain anonymous. No tokens are persisted or logged.
The transport captures its configuration before awaiting authentication.

The server still verifies Clerk authentication and derives role/status from
PostgreSQL. Client identity, role flags and `X-Admin-Session` never authorize a
request. Existing mutation preconditions, query/editor lifetimes, immutable
revisions, ownership and delivery/session binding remain in place. Already
verified and dispatched requests may legitimately finish as their original actor.
Unconfigured clients retain their previous transport behavior; HTTP contracts and
OpenAPI/generated operation definitions did not change.

## Automated evidence

| Check | Result |
| --- | --- |
| Focused auth/session/catalog/practice frontend tests | 67 passed, 0 failed |
| New token/transport and React lifecycle regression cases | 18 passed, included above |
| Full frontend suite | 151 passed, 0 failed, 11 files |
| Full non-database API suite | 219 passed, 0 failed, 11 files |
| Actual local PostgreSQL revision integration | 21 passed, 0 failed |
| Workspace and Orval typechecks | Passed |
| API and configured frontend production builds | Passed |

Commands executed from the Phase 6A worktree:

```text
pnpm --filter @workspace/ccna-learning exec vitest run src/lib/clerk-request-auth.test.ts src/components/clerk-request-auth.test.tsx src/lib/catalog-cache.test.ts src/components/admin-session.test.tsx src/components/practice-workspace.test.tsx --reporter=verbose
pnpm --filter @workspace/ccna-learning test
pnpm --filter @workspace/api-server exec vitest run --exclude "**/*.db.test.ts"
pnpm run typecheck
pnpm exec tsc -p lib/api-spec/tsconfig.codegen.json
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/ccna-learning run build
pnpm --filter @workspace/api-server exec vitest run src/lib/question-revisions.db.test.ts --reporter=verbose
```

The database suite used explicit write-test opt-in and private credentials on
verified local PostgreSQL 18, `127.0.0.1:5432/ccna_phase6a_dev`. Disposable fixtures
were isolated/cleaned; existing attempts and account roles were preserved. This
persistence evidence is separate from mocked tests and GitHub CI. The unchanged
server/database implementation was tested before the frontend transport fix.
The configured build received only a verified DEVELOPMENT publishable key in
memory. Existing sourcemap/chunk-size warnings did not fail the build.

## Genuine browser/session evidence

The user-assisted run at 12:36:17Z reported **9 passed, 0 failed, 0 blocked**,
with two distinct active real Clerk DEVELOPMENT accounts. Every tested session
switch preserved the route, document and performance time origin (no reload).
Navigation was used only to prepare different route-specific cases.

Verified editor draft/disable-intent cleanup; delayed admin query isolation;
delayed practice grading against the original revision without USER feedback
leakage; delayed history isolation; delayed admin write feedback isolation;
A/B/A stale mutation callbacks; delayed question/deliveryId isolation; genuine
old-actor token ownership/idempotency; and separate historical accuracy.
The genuine USER received 403 for admin reads. Prior real tests also verified
403 on all six mutation routes and rejection of another/new session's deliveries.

These tests held actual API responses in the browser until after SDK switching,
including deliberately ignoring transport abort. They did not fabricate tokens,
responses or roles, and did not delay server execution. A write authorized as A
was allowed to persist as A; B never received its UI result or ownership. Matching
A retries persisted once and conflicting retries returned 409. Two attempts per
account were preserved; only the disposable question/topic were soft-disabled.

Earlier failing invocations are not counted as passes. They exposed the cookie
identity race, then a helper setup issue: direct API fixture creation while its
old list remained mounted. The helper now unmounts that route before setup.
A regression test also caught a mutable generation capture; the getter now
captures scalar identity/generation values before awaiting the token.

## Isolated deployment and recovery

A checksum-verified pre-migration archive was restored transactionally into two
new databases on the verified local PostgreSQL 18 cluster only:
`ccna_phase6a_release_20261011` and `ccna_phase6a_recovery_20261011`.
No existing database was replaced, and no role/status or role attribute changed.

The release database upgraded its four-entry ledger using versioned Drizzle
`migrate`. All five migrations, five validated revision constraints and five
required indexes were verified. Both legacy attempts remained unbound and
unchanged, without invented snapshots or score recalculation. Restored and source
records matched after canonical UTC timestamp rendering; an initial digest
comparison used differing timestamp representations and stopped safely.

The migration role verified the ledger. The restricted runtime role has only
required grants, no ledger access, role/status updates or immutable history edits.
The API production artifact and configured built frontend run on loopback-only
ports 3100/8180. Health/proxy responses and unauthenticated ADMIN 401 passed.
The recovery database independently preserved the pre-migration four-entry
ledger, original attempts and role/status mappings.

Authenticated production-artifact workflow and post-smoke persistence evidence:
**12 passed, 0 failed** at 12:41:43Z on the isolated built frontend/API.
Verified ADMIN/unauthenticated authorization, topic/question/options edits,
old/new revision grading, concurrent idempotent retries, conflict/legacy-client
409, exact history, progress and soft-disable retention. These are authenticated
API workflows; this helper does not independently test production editor/cache
callbacks. The genuine continuous UI race run above is separate evidence.

A subsequent read-only database check confirmed both newly accepted rehearsal
attempts persisted and both original legacy attempts remained unchanged. The
separate recovery database retained only the original pre-backup history,
confirming that restoring it would omit later accepted attempts.

Separate genuine USER authorization on the isolated runtime at 12:44:10Z:
**11 passed, 0 failed, 0 blocked**. Verified normal USER provisioning, HTTP 403
for admin access/topics/questions and all six mutation routes, and absence of the
owner attempts from USER history. Both accounts retained their original roles.
No blocked authentication/infrastructure requirement remains for these scoped
local tests. Production operations and the separate historical test below remain
outside this evidence.

## Coordinated merge/deployment procedure and limitations

1. Obtain human approval after the final browser rehearsal and CI on the new HEAD.
   Keep PR #12 Draft until review is complete; never merge automatically.
2. Select one matching migration/API/frontend release. Quiesce admin and practice
   writes; verify an independently restorable backup plus role/grant configuration.
3. Apply versioned additive migrations with `migrate`, not `push`. Verify the
   ledger, constraints/indexes and canonical legacy hashes. Preserve NULL legacy
   bindings and recorded scores.
4. Verify restricted runtime grants, then deploy the matching API and configured
   frontend together. Do not mix old and new grading servers.
5. Require old browser clients to reload: missing `deliveryId` intentionally
   returns 409 `DELIVERY_REQUIRED`. Old APIs cannot create unbound new attempts.
6. Run real ADMIN/USER, session ownership, revision grading, retry/history and
   progress smoke checks before reopening writes. Prefer forward repair.
7. Restore backups into a new recovery database, never automatically over live
   data. A pre-migration snapshot omits later accepted attempts; restoration is
   not a lossless rollback after reopening writes. Do not drop revision tables,
   remove immutability triggers or fall back to mutable grading.

The original delayed Phase 5C learner Clerk Submit scenario remains **Not Verified**
as its own historical test. The new controlled-response genuine Phase 6A test is
separate evidence. External network/server latency, other browsers, production
Clerk configuration and production operations were not exercised. Image/reference
keys do not version external bytes; delivery retention/rate policy and concurrent
admin form conflict UX remain future work.

Neon/production and port 55433 were never contacted. Original checkout branch,
HEAD, index and 53 protected changes, all 15 local worktree files, existing backup,
PR #13 and Phase 7A were preserved. Ignored local credentials/helpers/dumps/builds
are excluded from the scoped commit.
