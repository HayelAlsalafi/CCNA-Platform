# Phase 6A.4 — Catalog refresh and learner delivery cleanup

## Implemented scope

All six ADMIN question/topic create, update and disable handlers now use one catalog refresh function after a successful server write. It receives the mutation's captured editor lifetime, cancels older matching reads, checks that lifetime again, then invalidates matching queries and refetches active observers.

Affected projections: ADMIN question lists (including filtered/paginated variants), ADMIN topics and question-editor topic choices, public topic counts and dashboard summary, current-session practice question/detail queries, learning progress and practice history (including paginated variants). Private queries are matched by the full user/session identity; another administrator or another session of the same user is not refreshed. Authentication/access caches and legacy private caches without an owner are untouched. Inactive matching queries become stale; they are not eagerly fetched.

ADMIN response data is never copied into learner caches. Failed writes retain the draft and do not refresh the catalog. A late response from a departed editor lifetime cannot refresh the new session's UI. This does not cancel an already-authorized server write.

Learner selections and answer feedback now belong to a specific delivered-content lifetime. Edited deliveries clear their selection/result, including an A → B → A content transition. A delayed answer cannot attach to a newer delivery. Retained question data is hidden on a failed question refresh or missing/disabled topic; a question being refreshed is temporarily unavailable for submission. Unchanged delivered content retains its selection after a successful refresh.

No backend authorization, X-Admin-Session behavior, API contracts/generated clients, dependencies, schema, migrations or environment files changed.

## Automated verification

Commands ran from the Phase 6A worktree with database/Clerk/Neon/PG environment variables removed, RUN_DB_TESTS=0, and existing local Windows native build binaries. No write-capable database tests ran.

| Command | Final result |
| --- | --- |
| pnpm --filter @workspace/ccna-learning exec vitest run src/lib/catalog-cache.test.ts src/components/admin-session.test.tsx src/components/practice-workspace.test.tsx --reporter=verbose | 46 passed, 0 failed |
| pnpm --filter @workspace/ccna-learning test | 128 passed, 0 failed, 9 files |
| pnpm --filter @workspace/api-server exec vitest run --exclude "**/*.db.test.ts" | 209 passed, 0 failed, 11 files |
| pnpm run typecheck | Passed |
| pnpm exec tsc -p lib/api-spec/tsconfig.codegen.json | Passed |
| pnpm --filter @workspace/api-server run build | Passed |
| pnpm --filter @workspace/ccna-learning run build (PORT=8080, BASE_PATH=/) | Passed |

21 new cases: eight real QueryClient/QueryObserver cache tests, eight manager tests exercising all six mutation handlers and failed writes, five learner component tests with real generated hooks and controlled fetch promises. Existing session isolation and server authorization suites still pass. Initial verification caught and corrected two test selector/text mismatches and a narrow TypeScript Set annotation; these were not ignored. Frontend build reports an existing tooltip sourcemap warning and exits successfully.

Local sanitized receipts/logs live under ignored .local/tests/phase6a4; they are not committed.

## Read-only database comparison and local ADMIN finding

The running frontend and API are both launched by the guarded Phase 6A local entry point. PostgreSQL target: 127.0.0.1:5432/ccna_phase6a_dev, PostgreSQL 18, installed service/data directory and cluster fingerprint verified. Runtime uses the restricted application role. The four previously approved Drizzle migrations already passed; the app role intentionally cannot read the migration ledger.

Read-only audit snapshot (2026-10-10):

| Verified endpoint/database | users | topics | questions | options | attempts | Ledger rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Local ccna_phase6a_dev | 1 | 1 | 1 | 2 | 0 | 4, previously verified by migration role |
| Neon ep-small-moon… / neondb | 2 | 6 | 2 | 8 | Table absent | 3 |
| Neon ep-aged-sound… / neondb | 2 | 6 | 2 | 8 | 0 | 4 |
| Neon ep-quiet-pond… / neondb | 2 | 7 | 2 | 8 | 4 | 4 |

Neon connections used only existing approved project environment configuration, verified TLS, default_transaction_read_only=on and BEGIN READ ONLY. Only SELECT/catalog inspection was performed; no copying of records, DDL, roles, migrations or other writes. All three reachable endpoints contain an ACTIVE ADMIN mapping for the same Clerk ID that is mapped to ACTIVE USER locally. Credentials were never printed or saved. Named Neon branch mapping (production / ccna-development / ccna-phase5a-test) is not independently verified: configuration provides endpoints, not authoritative branch names. A read-only Neon project/endpoint mapping or management access is needed to assign those names reliably.

The apparent role regression is a database boundary: this dedicated local database has a new default USER row. Clerk identifies the account; PostgreSQL users controls role/status. New-user provisioning defaults to USER, while existing-user login updates profile/login metadata without overwriting role/status. Neither Phase 6A commit changed role assignment. The existing generic email-based bootstrap script is not being used: it does not pin the local cluster or bind the action to a server-verified Clerk identity.

No ADMIN promotion occurred. The current browser's /api/auth/me user UUID must first be matched to its local Clerk mapping. Promotion requires separate explicit approval naming the exact verified Clerk ID, local user UUID and local database. Execute a single guarded transaction through the local administrator, lock that one ACTIVE USER row, recheck identity/status, update only its role and updated_at, verify one returned row, then commit. No Neon roles or other users may change. Refresh current-user/admin access after approval; the app role cannot grant itself ADMIN.

## Live verification and limitations

Live HTTP smoke checks passed for the frontend shell/learner route documents, topic catalog and API health. Unauthenticated /api/auth/me and /api/admin/access return 401. HTTP shell responses do not prove browser rendering or successful authenticated workflows.

| Check | Evidence/status |
| --- | --- |
| Catalog refresh, six ADMIN writes, failed writes, disabled-topic/edited-question UI cleanup | Automated mocks and real QueryClient/component lifecycles passed |
| Server verified ADMIN/USER/unauthenticated protections and mutation precondition | Existing deterministic API tests passed; backend unchanged |
| Live login/current-user identity and USER 403 | User-reported; independent authenticated verification BLOCKED pending browser auth/me evidence |
| Live ADMIN access, topic/question CRUD and status changes | BLOCKED pending verified-identity approval and authenticated browser checks |
| Live learner submission/persistence/history/progress | BLOCKED pending authenticated browser verification; API/component tests are not live DB evidence |
| Real Clerk browser user/session transitions | Not Verified |
| Previously delayed learner Clerk Submit/session-switch scenario | Not Verified |

Publication does not make this Phase 6A foundation production-ready. Next P0 milestone is immutable question revision/snapshot grading: content fingerprints here are UI lifetime metadata, not server revisions or authorization evidence. A correct-answer/explanation edit can be invisible in the learner DTO, and server grading still uses mutable question/options. Historical correctness is append-only, but displayed history text/options can follow later catalog edits. Concurrent administrative edits still need an approved conflict policy.

Refresh is scoped to this QueryClient; it is not cross-tab/browser/server push synchronization. An already-authorized mutation can finish after sign-out/session switching; its departed editor callback is intentionally ignored. Headerless mutation clients retain their existing weaker session-intent protection. Draft/review/published/archive states are not implemented: current availability requires ACTIVE topic and ACTIVE question. Safe integration-test opt-in guards and CCNA v1.1 classification remain separate foundation tasks.

Rollback: revert this scoped frontend commit after approval; no database rollback or migration is required. Keep PR #12 Draft until remaining P0 foundations and required live validation are accepted.
