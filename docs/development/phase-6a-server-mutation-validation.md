# Phase 6A.3 — Server-Verified Admin Mutation Validation

Date: 2026-10-10. Worktree: `C:\Users\hayel\Desktop\ccna-phase-6a`.
Branch: `feature/phase-6a-question-bank-foundation`.
Implementation base: `d1611c5d9868f8994aed4f9a5af9ffc4c2cddaa8`.
PR [#12](https://github.com/HayelAlsalafi/kindred-identity-spark/pull/12) remains Draft, open and unmerged. This record describes local verification before publication. New-HEAD CI results are recorded separately in the PR description; earlier Phase 6A.2 CI is not evidence for this slice.

## Audit and confirmed findings

`app.ts` already runs Clerk middleware before API routing. `getAuth(req)` reads that request's verified authentication state; its default token policy accepts session tokens. This was checked against installed `@clerk/express` 2.1.72 and the official [getAuth reference](https://clerk.com/docs/reference/express/get-auth) / [Express middleware overview](https://clerk.com/docs/reference/express/overview). No JWT parsing, fake token, authentication bypass, or live Clerk Backend API call was added.

`requireAuthenticatedUser` resolves the local user using the verified Clerk user ID and an email from verified session claims, provisions new users as USER, and rejects disabled accounts. `requireAdmin` checks the PostgreSQL user row, never a client role or custom token role. Both question and topic routers already apply these checks to every request before their domain services. Existing create/update schemas are strict and reject injected `userId`, `role` and `sessionId`. Disable handlers use only the validated path identifier and ignore body identity fields.

Services are internal database functions, not independently authenticated HTTP surfaces. All six HTTP mutation callers are protected by their routers. They do not store actor/audit columns, so adding actor parameters to otherwise unchanged services would not improve this boundary. No new service authorization wrapper, audit table, or schema change was justified.

The confirmed gap was **initiating-session intent**, not an ADMIN bypass: Phase 6A.2 guarded client state and completions, but ambient cookies could select a different valid ADMIN session between preparing a write and server authentication. The bank is shared among administrators; this protects request intent, not administrator-specific question ownership. Auth also read `getAuth` twice during user resolution; that working authentication was consolidated into one captured request identity rather than a second verification mechanism.

Question updates already replace fields/options in a transaction. Topic writes already enforce input/slug rules. This slice does not add revision preconditions or solve concurrent edit lost updates.

## Threat model and invariants

1. Actor identity comes only from Clerk's server-verified request and the matching local database lookup. Header/body user IDs and role flags never select an actor or grant access.
2. The DB ACTIVE/ADMIN checks run on every protected request. Prior browser access, cached roles and JWT role labels are not authority.
3. A client session identifier is an optional consistency signal only. It is compared with Clerk's verified session ID after authentication/ADMIN checks, before question/topic domain writes.
4. A mismatch cannot invoke a question/topic mutation service. Authentication's existing user provisioning/profile/last-login update may occur earlier; “no domain write” does not mean no user-bridge database activity.
5. Once a request has passed authorization and consistency checks, its captured actor does not change when the browser switches sessions. The request may legitimately finish, and its response stays with its original HTTP request.
6. Frontend lifetime guards separately prevent old results/errors from updating another session's editor/cache. Server authorization tests and frontend isolation tests are separate evidence.
7. An expected-session header never replaces authenticated credentials, role resolution, or normal validation. Errors expose stable codes/messages, not verified identifiers, claims or tokens.

## Actual implementation and HTTP behavior

`VerifiedRequestAuth` is a readonly typed request context containing internal user ID, verified Clerk user ID and verified session ID. Authentication captures identity scalars before asynchronous lookup, reads Clerk once, and freezes the context after ACTIVE account resolution. Existing user/role/status/provisioning behavior is retained.

Both admin routers apply `requireAdminMutationSession` after existing authentication and ADMIN middleware. It skips reads; writes require the verified request context and matching resolved local user. Authorized mutation responses use `Cache-Control: no-store`.

| Caller state / signal | Result |
| --- | --- |
| No authenticated Clerk user | Existing 401 UNAUTHENTICATED; no domain service |
| DB USER or disabled ADMIN | Existing 403 FORBIDDEN / ACCOUNT_DISABLED; no domain service |
| Active ADMIN, header omitted | Existing create/update/disable behavior retained |
| Active ADMIN, matching `X-Admin-Session` | Normal existing mutation behavior |
| Active ADMIN, empty, duplicate/comma-separated, non-identifier or >256-character signal | 400 INVALID_ADMIN_SESSION; no domain service |
| Active ADMIN, signal differs from verified session (including same user/new session), or verified session is absent | 409 ADMIN_SESSION_CHANGED; no domain service |

The optional header is an opaque 1–256 character ASCII identifier (`[A-Za-z0-9_-]`), not a secret token. No prefix is assumed. All six mutations from the current admin UI send the captured session ID through the existing generated client's RequestInit headers. Reads and learner calls are unchanged. On a current-session conflict, existing error handling preserves the draft and displays the refresh message; there is no automatic retry under another identity. Late conflicts are subject to the same Phase 6A.2 lifetime guards as late successes/failures.

This is an **additive API behavior change**: requests providing a malformed/mismatching header used to have that header ignored, and now receive 400/409. Headerless ordinary authenticated requests remain compatible. Create/update bodies, IDs, success statuses/DTOs, existing validation errors and ADMIN authority remain unchanged. OpenAPI documents the optional parameter and errors for exactly six operations. New generated type/header-validator declarations were extracted mechanically from isolated Orval output; generated React request functions need no change because they already accept headers.

## Slice file inventory (15)

| File | Change |
| --- | --- |
| `artifacts/api-server/src/middlewares/auth.ts` | Capture verified request actor/session once; typed frozen context |
| `artifacts/api-server/src/middlewares/admin-mutation.ts` | Central optional consistency precondition and no-store responses |
| `artifacts/api-server/src/routes/admin-questions.ts` | Apply guard after existing authorization |
| `artifacts/api-server/src/routes/admin-topics.ts` | Apply same guard |
| `artifacts/api-server/src/middlewares/auth.test.ts` | Two capture/delayed-lookup tests |
| `artifacts/api-server/src/routes/admin-mutation.test.ts` | 62 deterministic route/guard/contract cases |
| `artifacts/ccna-learning/src/lib/admin-session.ts` | Captured session header on mutations only |
| `artifacts/ccna-learning/src/lib/admin-session.test.ts` | Generated transport/header test |
| `artifacts/ccna-learning/src/components/admin-session.test.tsx` | Two current-conflict tests, delayed-conflict case, six-workflow header assertions |
| `lib/api-spec/openapi.yaml` | Optional header and 400/409 contract |
| `lib/api-client-react/src/generated/api.schemas.ts` | Generated session-precondition type only |
| `lib/api-zod/src/generated/api.ts` | Six generated optional header validators/constants only |
| `lib/api-zod/src/generated/types/adminSessionPreconditionParameter.ts` | Generated parameter type |
| `lib/api-zod/src/generated/types/index.ts` | Export generated parameter type |
| `docs/development/phase-6a-server-mutation-validation.md` | This evidence record |

No package/config/lockfile change. No existing Phase 6A.2 implementation or planning document was rewritten. No learner service, revision logic, database/schema/migration or environment file changed.

## Automated evidence

API tests run real Express routers and actual auth/ADMIN/session-guard logic. Only the external SDK session reader, user DB boundary and domain services are mocked. Requests use an ephemeral server bound to 127.0.0.1. No database pool is imported by these mocked tests. Schema and generated validator tests are pure. Controlled promises establish delay ordering rather than sleeps.

The new API cases exercise all six mutations: unauthenticated/spoofed identity, USER despite ADMIN claims, valid ADMIN, headerless compatibility, different users and same-user/new-session mismatch, disabled account, malformed/duplicate/missing-verified-session signals, actor invariance despite spoofed user headers, strict body identity rejection, per-request role revocation, absent context failure, and generated header syntax. Two concurrent delayed create cases retain each request's own actor and HTTP response and permit A's already-authorized write to complete after B's request. Two auth tests verify one SDK read and captured identity through delayed DB lookup.

Frontend evidence uses the actual managers, QueryClient/generated transport and controlled Clerk/network mocks. Four new cases verify the sent header, current question/topic conflict preserving the draft without retry, and stale conflict suppression after switching. Existing A→B, same-user session switch, sign-out, delayed query/mutation, stale callback and CRUD tests still pass. These DOM mocks do not verify Clerk token cryptography or real browser cookie timing.

Commands use the ignored `.local/tests/phase6a3/validate.cjs` runner. It strips inherited database/Clerk/Neon/PG/Vite/Replit configuration, sets RUN_DB_TESTS=0, and uses the previously provisioned local Windows native tooling. It loads no environment file. Each mode has a command/exit/time receipt and log.

| Mode / exact executed command | Final result |
| --- | --- |
| `apiFocused`: `pnpm --filter @workspace/api-server exec vitest run src/routes/admin-mutation.test.ts src/middlewares/auth.test.ts src/routes/admin-questions.test.ts src/routes/admin-topics.test.ts --reporter=verbose` | 107 passed / 4 files; exit 0 |
| `api`: `pnpm --filter @workspace/api-server exec vitest run --exclude "**/*.db.test.ts"` | 209 passed / 11 files; exit 0 |
| `focused`: `pnpm --filter @workspace/ccna-learning exec vitest run src/lib/admin-session.test.ts src/components/admin-session.test.tsx --reporter=verbose` | 39 passed / 2 files; exit 0 |
| `frontend`: `pnpm --filter @workspace/ccna-learning test` | 107 passed / 7 files; exit 0 |
| `types`: `pnpm run typecheck` | Workspace libraries and all artifact/scripts checks passed; exit 0 |
| `orvalTypes`: `pnpm exec tsc -p lib/api-spec/tsconfig.codegen.json` | Passed; exit 0 |
| `apiBuild`: `pnpm --filter @workspace/api-server run build` | Production bundle passed; exit 0 |
| `build`: `pnpm --filter @workspace/ccna-learning run build`, process-only PORT=8080 / BASE_PATH=/ | Production bundle passed, 1,883 modules; exit 0 |
| `codegenPreview`: `pnpm --filter @workspace/api-spec exec orval --config C:/Users/hayel/Desktop/ccna-phase-6a/.local/tests/phase6a3/preview.config.ts` | Both client/Zod outputs generated in ignored temporary directories; exit 0 |
| `git diff --check` / safety receipt | Whitespace, scope, preservation and credential checks passed; no staging |

Totals add 64 API cases to the previous 145 and four frontend cases to the previous 103; focused totals are subsets, not additional tests. No selected tests failed or were skipped. DB suites and real integration/browser tests were excluded, not Passed. Full regressions/type/build checks were run again after narrowly synchronizing header declarations. The known tooltip sourcemap-location warning remains; frontend build exits 0.

The preview also includes formatting and pre-existing full-generator differences affecting separate learner client overlays. Only the 18 header constants/validators, parameter alias/type and barrel export were copied mechanically; broad regeneration was not applied. Existing generated request functions and learner overlays remain unchanged. Future broad codegen must account for those overlays rather than overwrite them.

## Known limitations and remaining risks

- **Real Clerk admin browser transitions and real server-bound cookie/bearer-session checks: Not Verified.** Automated tests assume the verified SDK boundary and do not exercise Clerk cryptographic/session lifecycle validation or deployment headers/CORS behavior.
- **Previously delayed learner Clerk Submit/session-switch test remains Not Verified**, with the approved pause intact. This slice changes no learner submission endpoint.
- Header omission deliberately preserves existing ADMIN clients, so those clients get no initiating-session intent protection. A caller that strips/changes the signal still needs valid server authentication/ADMIN; this signal is not a security credential.
- No one-use nonce, anti-replay table or idempotency guarantee is added. Repeated valid writes within an authorized session can execute again. Stale-session intent with the unchanged signal is rejected; general authenticated replay prevention is not claimed.
- Already-authorized writes may finish after sign-out/session change or subsequent role revocation. Checks use the request's verified identity and DB role at authorization time; cancellation/cache removal cannot undo server writes. A later request rechecks the database role/status.
- Concurrent request actor/result isolation is tested. Lost updates between admins, learner grading against mutable options, durable revisions/audit history and database test guards remain separate approved work; no real PostgreSQL transaction/concurrency evidence was obtained here.
- Session signal is not CSRF protection. Existing permissive credentialed CORS/cookie deployment policy is unchanged and was not validated against a deployed service. No new allowlist, token introspection or speculative deployment mechanism was introduced.
- Existing Clerk/React peer compatibility and native Windows provisioning limitations from Phase 6A.2 remain. The current builds contain no real Clerk configuration and are compilation evidence only.
- Local verification precedes publication. PR #12 must run CI against the Phase 6A.3 commit; earlier Phase 6A.2 CI does not validate this slice.

## Acceptance, rollback and preservation

Recommend acceptance of the **scoped automated Phase 6A.3 implementation**, with the live-validation and compatibility limitations above explicitly retained. This is not production-release approval. Deploy the server guard before claiming intent protection for the updated UI; the optional header is compatible with older authenticated clients and an older server will merely ignore it.

Rollback uses a narrow forward revert of these source/contract changes, preserving protected work and published history. No DB rollback is needed. Do not globally regenerate/remove learner clients as part of rollback.

The final ignored verification receipt is `.local/tests/phase6a3/verification.json`. It compares the original 606 baseline file hashes, original branch/HEAD/index/status, the 53 protected changes plus original audit, and both preserved untracked planning documents. It also checks unchanged Phase 6A worktree HEAD/index contents and repository refs (excluding Codex internal snapshot refs), sparse rules/excluded .env, the explicit 15-file allowlist, zero targeted credential matches and zero failing validation receipts. That local verification performed no staging, commit, push, migration, Neon/production access or original-checkout write. Subsequent approved scoped publication is tracked in PR #12. Do not start Phase 6A.4 without approval.