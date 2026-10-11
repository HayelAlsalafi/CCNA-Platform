# Phase 6A.2 — Admin Question Bank Session Isolation Validation

Date: 2026-10-10. Worktree: `C:\Users\hayel\Desktop\ccna-phase-6a`.
Branch: `feature/phase-6a-question-bank-foundation`.
Implementation base: `7866b5e97ce02d66a2e6f83cd4647b5ccfdf5439`.

**Local validation record before publication: implemented and verified.** At that point there was no commit, push, PR, database connection, schema/migration, environment-file edit, or API contract change. The copied audit and foundation plan remain unchanged. Phase 6A.3 mutation-session binding and question revision work have not started.

## Implementation

The actual Clerk integration, application QueryClient, server access gate/routes, generated hook keys/transport, admin managers, and their mutation handlers were inspected before editing.

- `adminAuthState` distinguishes loading, signed out, and a resolved identity. Signed-in state without user/session identifiers stays loading. Both identifiers are required; a new session of the same user gets a different key.
- Admin question and topic query keys retain generated route/filter keys and append scoped identity metadata. That metadata is not sent to the API and cannot grant access.
- `AdminCacheGuard` runs inside Clerk across routes. On transition it cancels/removes old or unscoped admin queries and removes sensitive mutation entries, preserving unrelated public/learner queries.
- Authorized `AdminSessionBoundary` mounts a fresh manager on identity or question/topic surface changes. Forms, selected question/topic IDs, disable dialogs, filters, pagination, validation errors, and notices reset through teardown/remount.
- Each mounted lifetime has a generation. Actions check the current lifetime before dispatch, and async completions check the captured identity/generation before applying notices/errors, resetting forms, or invalidating queries. Leaving and returning to the same session does not reactivate an earlier lifetime's callbacks.
- Reads pass the generated AbortSignal, use same-origin credentials/no-store and zero inactive cache retention, and use no previous-data placeholder. Mutation keys and cache lifetimes are scoped too; completed active mutations reset their observers. Teardown removes pending payload/results from the shared MutationCache.
- Existing create/edit/disable and topic workflows remain intact. Admin invalidation targets only the current session's admin keys. Existing public topic/legacy-summary refresh behavior is retained; broader Phase 5C catalog invalidation remains the separately planned slice.
- The access UI now requires a resolved identity and a successful server response with `allowed === true`. A USER or server access error/denial never mounts the managers. Server Clerk authentication and PostgreSQL role/status middleware remain unchanged and authoritative.

Cancellation/removing client state does not roll back a write accepted by the server. The implementation follows [TanStack query cancellation](https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation), while enforcing its own mutation-completion guards and cache teardown.

## Files in this slice

| File | Change |
| --- | --- |
| `artifacts/ccna-learning/src/lib/admin-session.ts` | Identity states, scoped query/mutation policy, cleanup/invalidation, lifetime generation |
| `artifacts/ccna-learning/src/components/admin-session-boundary.tsx` | Global cache guard, authorized keyed lifetime/context |
| `artifacts/ccna-learning/src/App.tsx` | Wire guard/boundary; require positive server access; export AdminPage for direct boundary tests |
| `artifacts/ccna-learning/src/components/admin-questions.tsx` | Scoped lists/mutations and guarded editor/actions/completions |
| `artifacts/ccna-learning/src/components/admin-topics.tsx` | Same isolation for related topic management |
| `artifacts/ccna-learning/src/lib/admin-session.test.ts` | 13 focused identity/cache/lifetime tests |
| `artifacts/ccna-learning/src/components/admin-session.test.tsx` | 22 DOM workflow/access/transition tests |
| `artifacts/ccna-learning/vitest.config.ts` | Explicit TSX discovery and source alias; existing tests remain Node, DOM file opts into jsdom |
| `artifacts/ccna-learning/tsconfig.json` | Exclude TSX test files from application compilation, consistent with existing TS test exclusion |
| `artifacts/ccna-learning/package.json` | Pin jsdom 26.1.0 as test-only dependency |
| `pnpm-lock.yaml` | jsdom dependency graph and corresponding shared Vitest optional-peer context; no existing package-version upgrade |
| `artifacts/ccna-learning/src/pages/learning-progress.test.ts` | One-line fixture parser accepts CRLF and LF |
| `artifacts/api-server/src/routes/learning-progress.test.ts` | Same one-line fixture portability fix |
| `docs/development/phase-6a-session-isolation-validation.md` | This evidence and limitations record |

The two progress test changes are necessary Windows portability corrections discovered during required regression runs. Their Markdown JSON-fence regex previously accepted LF only, giving an empty example collection on this fresh CRLF checkout. No fixture document, learner source, API route/service, or contract was changed. Frontend test count returns to the previous 68 plus 35 new tests; API restores all 145 tests including documented examples.

The two previously untracked planning documents are separate existing worktree additions, not modifications introduced by this slice. No staging allowlist has been applied.

## Focused regression coverage

The 35 new tests use real managers, the real scoped lifetime/cache policy, real QueryClient/generated hooks, deterministic Clerk-state mocks, network mocks, and controlled promises. No synthetic authentication tokens or runtime bypass were introduced.

Covered cases include:

- Admin A to B and same-user/new-session transitions, including the actual AdminPage server-access boundary.
- Sign-out and authentication loading, clearing editor content/references/options/selected targets/dialogs/filters/notices.
- Old list completion after B has loaded, including a mocked transport that ignores abort.
- Delayed save success and failure without clearing B's draft or generating old notices/errors/invalidation.
- Delayed topic save, and pending mutation completion after sign-out without restoring shared cache.
- Retained callbacks after identity transition, after teardown/re-entry into the same session, and StrictMode effect teardown/replay.
- USER, signed-out/loading/incomplete identities, and server-denied access do not request bank data or mount managers.
- Existing question create/edit/filter/pagination/disable and topic create/edit/disable functionality.
- Cleanup preserves unrelated learner/public cache and another session during targeted cleanup; scoped invalidation cannot target the prior session.
- Identity is local cache metadata only; actual request URL contains no client-selected user identity.

The existing API authorization suites exercise real middleware with mocked Clerk/user lookup and cover unauthenticated, non-admin, and disabled accounts. These are automated boundary tests, not live Clerk browser verification.

## Commands and exact results

Commands were run from the new worktree using Node 22.22.2 and pnpm 10.28.0. The ignored runner `.local/tests/phase6a2/validate.cjs` writes command/exit/time receipts and logs, strips inherited database/Clerk/Neon/PG/Vite/Replit configuration from the child process, and sets RUN_DB_TESTS=0. No environment file is loaded or edited by that runner.

| Runner invocation | Executed command | Final result |
| --- | --- | --- |
| `node .local/tests/phase6a2/validate.cjs focused` | `pnpm --filter @workspace/ccna-learning exec vitest run src/lib/admin-session.test.ts src/components/admin-session.test.tsx --reporter=verbose` | **35 passed**, 2 files, zero failed/skipped; exit 0 |
| `node .local/tests/phase6a2/validate.cjs frontend` | `pnpm --filter @workspace/ccna-learning test` | **103 passed**, 7 files, zero failed/skipped; exit 0 |
| `node .local/tests/phase6a2/validate.cjs api` | `pnpm --filter @workspace/api-server exec vitest run --exclude "**/*.db.test.ts"` | **145 passed**, 10 files, zero failed/skipped in the selected suite; database files/integration suites excluded; exit 0 |
| `node .local/tests/phase6a2/validate.cjs types` | `pnpm run typecheck` | Workspace library build and API/frontend/mockup/scripts TypeScript checks **passed**; exit 0 |
| `node .local/tests/phase6a2/validate.cjs build` | `pnpm --filter @workspace/ccna-learning run build` with process-only PORT=8080, BASE_PATH=/ | **Passed**, 1,883 modules transformed; exit 0 |
| Git review | `git diff --check`; cached diff and status review | Whitespace check passed; index empty |

Initial failure history: the first focused launch could not load the omitted Windows Rollup binary; no tests ran. After local tooling provisioning, 31/32 focused cases passed; the create fixture lacked a selected correct answer and was corrected, then additional boundary/topic tests brought the final total to 35. The first full suites exposed the existing CRLF example-parser issue. The minimal parser corrections produced the final 103/145 passes above. Earlier failures are not counted as successful runs.

### Windows tooling and build limits

The repository's existing overrides omit Windows native binaries. Matching Rollup 4.63.1, esbuild 0.28.2, lightningcss 1.32.0, and Tailwind oxide 4.3.3 binaries were provisioned only in ignored `.local/native-deps`, with an independent local pnpm install (`--ignore-workspace --ignore-scripts`). The validation child uses NODE_PATH and ESBUILD_BINARY_PATH pointing there. Project overrides and the original checkout were not modified.

Preparation commands:
`pnpm install --frozen-lockfile`;
`pnpm --filter @workspace/ccna-learning add -D jsdom@26.1.0 --save-exact`;
`pnpm --dir .local/native-deps install --ignore-workspace --ignore-scripts`.

Installation reported the existing Clerk/React peer mismatch with pinned React 19.1.0. React and Clerk versions were not upgraded in this slice. The frontend build also emitted the existing tooltip sourcemap-location warning and exited 0. No real configured Clerk session was exercised by this build; publishable/secret keys were absent. This artifact is compilation evidence, not a deployment or live authentication test.

Build output, TypeScript build-info, dependency directories, local-native tooling and receipts are ignored local artifacts, not future commit inputs. No native binary workaround is shipped with this source change.

## Acceptance and remaining risks

**Phase 6A.2 meets its scoped automated acceptance criteria:** identity-specific cache/data and fresh editor state, delayed query/mutation and stale-callback isolation, denial boundaries, preserved authoring/topic functionality, and required local regression/type/build checks pass.

Remaining limits:

1. **Phase 6A.3 dispatch-time session binding is not implemented.** Frontend checks cannot atomically bind ambient cookies to the identity that prepared a mutation. An already-dispatched request may complete for whichever session the server authenticated. A server-verified expected-session precondition is the planned separate slice; no API contract was changed here.
2. **Delayed real Clerk learner Submit/session switch remains Not Verified.** Prior testing-tool limitations and the approved pause remain in effect. These new deterministic admin DOM tests neither execute nor upgrade that scenario to Passed. Real admin Clerk browser transitions also remain unverified.
3. Same-session server role revocation still relies on server request checks and subsequent access/data refresh. Cached UI is not authority; no client-side ADMIN mechanism grants server permission.
4. Cross-tab catalog freshness and the old summary-only invalidation gap remain planned separately. No question revision integrity, safe database test overhaul, classification, publishing, import, or multiple-answer feature is included.
5. CI was not available during local validation before publication. The approved Draft PR records the resulting commit and its current CI status separately. Database and live production/browser validation were not run.

Rollback after a future approved commit uses a narrow forward revert/review, never published-history rewriting or destructive commands. No database rollback is required for this slice. Keep the worktree and uncommitted documentation intact until the user decides commit scope.

## Preservation evidence

Final verification passed: both worktrees retain their branch/HEAD and byte-identical indexes, repository branch and remote refs are unchanged (Codex internal snapshot refs are excluded), all 53 original protected files and original audit bytes are unchanged, and both copied planning documents are unchanged. Sparse rules and the excluded frontend .env are preserved. The explicit 14-file source/document allowlist has no unexpected changes; the targeted credential-pattern scan found zero matches. The original checkout was inspected read-only. Both indexes remain empty. The receipt is saved under .local/tests/phase6a2-publish/reviewed.json in the new worktree.

Stop after verification. Do not stage, commit, push, create a PR, or start the next slice without user approval.
