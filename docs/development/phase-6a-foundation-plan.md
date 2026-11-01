# Phase 6A.1 — Safe Worktree Setup & Foundation Design

Date: 2026-10-10. Repository: `HayelAlsalafi/kindred-identity-spark`.

**Setup and planning completed; implementation awaits approval.** This plan narrows the earlier [Question Bank audit](phase-6a-question-bank-audit.md) to Phase 6A priorities. The copied audit is an unchanged historical record of the earlier inspection; its “synchronization not executed” statements describe that earlier step. This document records the subsequent approved setup. No Phase 6B/6C/6D work is started or authorized here.

## 1. Setup record

| Item | Result |
| --- | --- |
| Original checkout | `<historical-checkout>` |
| Original branch / HEAD | `phase-5b2-practice-history-ui` / `4c01d02dcd9275793da90b4d6d9a8beff652e3ca` |
| Original protected work | 53 existing local changes plus the uncommitted audit document; preserve all 54 visible paths |
| New worktree | `<historical-checkout>` |
| New local branch | `feature/phase-6a-question-bank-foundation` |
| New HEAD / fetched `origin/main` | `7866b5e97ce02d66a2e6f83cd4647b5ccfdf5439` |
| Squash merge ancestry | `git merge-base --is-ancestor` succeeded; fetched main equals the required squash SHA |
| Audit copy | `docs/development/phase-6a-question-bank-audit.md`, unchanged in both checkouts |
| Audit SHA-256 | `835b4dd19244daf07d0a7d34dc35584f38ffc5166e22b085b125635457a7be9f` |
| Intended new-worktree status | Empty index and only two untracked planning documents: the audit and this plan |

The initial original-checkout receipt contains 606 file hashes, its status, branch, HEAD, refs, and index hash. Final verification must compare these, including the audit and all protected changes. Receipts remain ignored under `.local/tests/phase6a1-20261010/` in the original checkout.

### Environment-file exclusion

The main tree contains a tracked `artifacts/ccna-learning/.env`. To honor the instruction not to copy environment files, setup used:

1. Explicit fetch of main with no tags.
2. `git worktree add --no-checkout -b feature/phase-6a-question-bank-foundation ... 7866b5e...`.
3. Worktree-specific non-cone sparse checkout: include `/*`, exclude `!/artifacts/ccna-learning/.env`, use a normal index.
4. `git read-tree -m -u HEAD` in the new, empty worktree to populate its index and files under those patterns.

The excluded path has Git skip-worktree status, is absent from disk, and is not staged as deleted. No local `.env`, credentials, `.local`, dependency directory, protected generated files, or local tooling was copied. The repository's tracked `.env.example` remains a template. Do not disable sparsity or materialize the excluded `.env` during later work without approval.

Git sparse checkout enables worktree-specific configuration; the shared Git metadata now includes that setting, the new branch/worktree registration, fetched objects, and updated `origin/main`. Original working files, HEAD/branch, and index are separate from these authorized metadata changes. Git's [sparse-checkout documentation](https://git-scm.com/docs/git-sparse-checkout) describes the per-worktree configuration behavior.

No dependencies were installed and no application tests/builds were run in this setup phase. Future installation uses a frozen `pnpm-lock.yaml` inside the new worktree, never the original dirty checkout. Environment provisioning and real-browser validation require an explicitly approved local setup; no production connection is inherited.

## 2. Priority P0 — Administrator session isolation

### Current evidence

- [App.tsx](../../artifacts/ccna-learning/src/App.tsx) already scopes current-user and admin-access queries by Clerk user/session and checks server ADMIN access.
- [admin-questions.tsx](../../artifacts/ccna-learning/src/components/admin-questions.tsx) and [admin-topics.tsx](../../artifacts/ccna-learning/src/components/admin-topics.tsx) still use generic list keys. Their forms, selected edit/disable target, messages, and mutation completions are not bound to the same identity boundary.
- [learning-progress-cache.ts](../../artifacts/ccna-learning/src/lib/learning-progress-cache.ts) and [practice-session.ts](../../artifacts/ccna-learning/src/lib/practice-session.ts) provide existing identity/key/result-guard patterns to adapt, not a reason to rewrite generated clients or unrelated learner logic.
- The bank is shared among ADMIN users. Session isolation protects confidential cached answers and user intent; it does not introduce per-administrator ownership of questions.

### Proposed invariant and behavior

An administrator manager mounts only after Clerk has resolved `(userId, sessionId)` and the current server access check succeeds. Its data, draft, target, errors, success messages, and mutation effects all belong to that identity and an activation generation.

Use existing generated query-key prefixes with identity appended, retaining request filters/pagination. Identity is cache metadata, never an authoritative API role or database user ID. Do not use placeholder/previous-session data. Use `gcTime: 0` for answer-bearing inactive admin queries, pass AbortSignals through generated requests, and request `cache: no-store` where transport supports it.

On sign-out, user/session change, unresolved Clerk state, access denial, or manager unmount:

1. Immediately stop rendering the previous authorized manager; mount a fresh keyed manager when the new boundary is authorized.
2. Reset editor content, edit target, disable confirmation, filters/pagination, validation errors, notices, and mutation observer state. Clearing is deliberate; warn about unsaved drafts within the current session if needed, but never carry drafts into another session.
3. Cancel and remove only admin-sensitive query families belonging to the old identity, including legacy unscoped keys. Do not globally clear learner caches or another active manager's new requests.
4. Capture identity and activation generation when starting a mutation. Recheck immediately before dispatch. After an await, apply result/error/reset/invalidation only if the originating manager is still active and its identity/generation matches. This also handles leaving and returning to the same Clerk session while an old request is pending.
5. Hide/drop sensitive mutation results after completion or teardown; a late response must not recreate removed old-session cache or update a new form. Abort is resource management, not proof that an authenticated server write was undone.

The mutation variable/body stays bound to the displayed target and draft. A client may not choose a different user identity for authorization. Server `requireAuthenticatedUser` and database `requireAdmin` remain authoritative for every route.

### Dispatch-time identity race

Frontend guards alone cannot make ambient-cookie authentication atomic with a Clerk switch. A request might be prepared under A and reach middleware after cookies changed to B. For the separate mutation-binding slice, prefer an expected Clerk-session header on admin writes, compared server-side against Clerk's authenticated session ID before invoking the domain service. A mismatch returns a stable session-changed conflict and performs no mutation. The header is an intent precondition, not authentication and never grants ADMIN. Check cookie and real bearer-session behavior before fixing the exact header/error contract.

Do not include authorization-sensitive values in the query string or accept a body `userId` as authority. If a supported real Clerk token binding is chosen instead, it must pin the captured genuine session and be verified end to end; do not fabricate tokens. The first frontend slice does not claim to close this dispatch race by itself.

### Required tests

- Query keys differ for A/B, and for two sessions of the same user; filters/offset are retained.
- Clerk unloaded, signed out, missing session, USER, disabled user, and access-error boundaries do not mount managers or issue bank calls.
- Warm A's bank cache and draft; switch to B, sign out, and change A's session: no previous answer flags, reference notes, targets, or notices render.
- Resolve/reject an old list or mutation after a switch, or after leave-and-return within the same session: no stale display, reset, mutation, or invalidation of the new activation.
- Already-dispatched writes can complete for the authenticated originating request; their responses remain isolated. New dispatch from a stale closure is blocked.
- Mutation-binding tests reject expected-session mismatch before any service write; server USER/disabled/unauthenticated checks remain enforced and token role claims cannot grant ADMIN.
- Real Clerk browser tests are a separate validation layer; mocked identities do not establish the live scenario.

## 3. Priority P0 — Question revision integrity

### Current problem and chosen foundation direction

Current practice reads question fields and options separately, submits only a selected option key, and grades mutable current options. Admin edits replace options. SHARE locks protect the grading transaction, but not delivery-to-submit time. Attempts preserve correctness and original topic ID, but cannot reproduce old content.

Recommend **immutable question revisions plus explicit displayed revision on submit**. Do not use `updatedAt` as the only revision token, accept client-supplied correct answers, or keep a silent current-question fallback. A content hash alone can detect change but does not preserve historical content; a signed snapshot token adds key/expiry complexity and still needs durable historical storage.

### Proposed additive data model — no DDL created or executed

| Entity | Proposed purpose / invariant |
| --- | --- |
| Existing `questions` | Stable UUID/code and operational visibility; add a current practice revision pointer and monotonic edit generation. Retain compatibility fields initially. |
| `question_versions` | Immutable numbered revision per question: text, type, difficulty, explanation, image/reference snapshot, topic ID and topic label at capture, creator internal user, creation time. Uniqueness for `(question_id, revision_number)` and a composite identity usable by FKs. |
| `question_version_options` | Immutable option key/order/text/correctness per revision; unique key and order; shared answer-cardinality validation. |
| Existing `practice_attempts` | Add nullable revision FK, restricted deletion, and a constraint/FK ensuring a version belongs to the referenced question. Preserve legacy result/key/topic/time; new attempts require a valid version in the service. |
| Minimal revision events | Record authenticated internal actor, old/new version, action, timestamp, and reason if applicable. Full review workflow remains future work. |

Immutable content includes the fields needed to explain an old grade. Topic delivery membership may change later, but an attempt keeps its original topic and revision snapshot label. Keep selected single option keys for this foundation; multiple-answer changes are outside this slice.

Initially, ACTIVE/DISABLED and active topic filtering remain the eligibility policy. Call the pointer `currentPracticeVersionId` or equivalent, not “published” if review/publishing is not yet implemented. Do not label legacy ACTIVE questions reviewed. Future approved review states can add a separate published pointer without changing logical question identity.

### Compatibility and transition

1. Approve the precise schema, migration numbering, current-field mirror policy, and rollout before any migration.
2. On a disposable local database, rehearse an additive migration and take a current-content snapshot for each valid existing question. Label it migration baseline, not historical reconstruction. Record invalid existing content for explicit correction; do not silently invent answers.
3. Leave all old attempts' version links null unless their exact historical content is independently known. Preserve their stored accuracy, original topic ID, selected key, and timestamp. Show legacy details as unavailable rather than deriving them from newly captured content.
4. During transition, existing mutable fields may remain a transactional mirror for older admin readers. Once revisions become authoritative, every approved edit creates a new complete immutable revision and atomically updates the mirror/pointer. Eliminate unversioned writers before cutover.
5. Learner read DTOs add `questionVersionId`; options come from that same immutable version. Return no correctness, explanation, or private reference information before grading. Do not pair a mutable header with options from a different revision.
6. The coordinated submit contract requires the displayed version. A legacy request without provenance fails safely with a documented refresh-required response and no attempt; it must not be graded against current mutable data. This preserves question identity, single-answer interaction, and stored results, but does not promise silent success for outdated clients.
7. Update the learner UI and generated contracts together in the approved worktree. Document the client-refresh behavior before an independently deployed API/client cutover. Do not mix unsafe old grading and new revision grading in production.

### Concurrency policy

For the first revision slice, choose **strict current-version submission**: if the practice pointer changed since delivery, return `409 QUESTION_VERSION_CHANGED`, save no attempt, and prompt the learner to reload without revealing either correct answer. Disabled questions/topics retain the existing unavailable behavior. An older revision remains available only for historical attempt details, not arbitrary submission.

Grading locks the stable question/topic, verifies eligibility and matching requested version, reads immutable options, and inserts the attempt referencing that version in one transaction. Pointer/visibility changes use the corresponding parent lock discipline. If submission acquires its locks first, it completes against the delivered revision and an admin edit waits; if the edit commits first, submission conflicts. No request grades a mixed revision or rewrites a prior attempt.

Admin writes carry an expected edit generation/revision. Lock the parent and compare atomically; the first valid writer creates the next revision, and a stale second writer receives `409 QUESTION_EDIT_CONFLICT` without writing. Status/topic changes participate in this concurrency policy. Do not equate append-only revision creation with protection from lost updates unless the pointer comparison is atomic.

Version content may not be updated or deleted through admin services. Review database enforcement (permissions/triggers, option-set finalization and deferred invariants) before locking the DDL; aggregate correctness is not established by ordinary foreign keys. Referenced versions and questions must remain RESTRICT protected. Do not accept a revision ID from a different question.

### Required tests and gates

- Deliver V1, edit to V2, submit V1: conflict, zero attempt; reload/submit V2: correct V2 grade and version-linked attempt.
- Delivery remains coherent when a revision pointer changes between header and option reads.
- Barrier-based concurrent transactions exercise both admin-first and submission-first outcomes; no sleeps as proof of ordering.
- Two admins with the same expected generation: one succeeds, one conflicts, no orphan/incomplete revision or option replacement.
- Attempts against V1 keep correctness/content after later edits, topic rename/move, disable, and archive-policy changes; progress accuracy remains based on stored attempts, not regrading.
- Wrong-question revision, unknown/foreign option, malformed answer cardinality, missing version, unavailable question/topic, and failed transaction all save no attempt.
- Migration rehearsal preserves question codes/UUIDs, attempt count/results/timestamps, and legacy-null version links. Rollback does not delete captured versions.
- HTTP contracts, generated clients, learner session result guards, and existing progress/history tests pass; API projections do not expose answers.

## 4. Priority P1 — Safe database testing

### Current gaps

`questions.db.test.ts` and `topics-admin.db.test.ts` accept RUN_DB_TESTS plus application DATABASE_URL. The progress/history integration files use dedicated local URLs and check server identity, but the presence of those URLs alone enables those suites. The old practice-history integration suite also needs review. A common policy should require both explicit opt-in and an approved dedicated local URL before any write-capable test or pool import.

### Proposed policy

1. Require `RUN_DB_TESTS=1` and a dedicated per-suite test connection; **never fall back to DATABASE_URL**. Without opt-in, skip safely with zero connection creation. If configured test input is unsafe, fail with sanitized names-only diagnostics.
2. Before opening any pool, parse the URL: only PostgreSQL protocol, literal loopback addresses (prefer `127.0.0.1` / `::1`), approved exact test database names or validated run suffixes, no query parameters/service overrides, no external host/socket, and no Neon/production hostname. If retaining `localhost`, resolve it only to loopback and document that check.
3. Dedicated names such as `ccna_questions_test_<run>`, `ccna_topics_test_<run>`, and `ccna_revisions_test_<run>` identify isolated databases. A local development database is not a test target.
4. After connection and before fixtures or DDL, verify `current_database()`, `host(inet_server_addr())`, absence of Neon metadata, and a runner-owned test marker/approved role where practical. A loopback URL alone cannot establish what a local tunnel forwards to; server identity checks and a disposable locally owned PostgreSQL process remain required.
5. Import schema-only modules or inject the dedicated connection. Mock or otherwise prevent the application pool from being initialized at module load. Clear inherited application connection/Clerk secrets from the test process without editing environment files.
6. Separate lightweight TEMP-table behavioral tests from real versioned-schema/migration tests. TEMP fixtures cannot prove migration or trigger correctness. Real-schema suites use only disposable guarded databases after approval to run migrations there.
7. Cleanup addresses only runner-owned temporary objects/approved test database fixtures. Use least-privilege test roles, transaction rollback where useful, and bounded timeouts; remember sequences are not rolled back. Never blanket-truncate public tables on an inherited connection.
8. Report executed, failed, skipped, and not verified separately. No opt-in or no local PostgreSQL means not executed, not Passed. CI may later use a disposable local PostgreSQL service without production secrets after separate approval.

First test the guard itself with mocked pool creation: malformed/external/Neon/tunnel identity, wrong DB name, URL override, opt-in absent, safe opt-in, and invalid server identity. Assert rejection occurs before writes (and before connecting for URL failures). No actual production URL, credentials, or Neon request is needed to prove rejection.

## 5. Priority P1 — CCNA classification design only

Use the official [Cisco CCNA 200-301 v1.1 blueprint](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf), checked 2026-10-10. Its six domains are Network Fundamentals, Network Access, IP Connectivity, IP Services, Security Fundamentals, and Automation and Programmability. Domain weights belong to that blueprint version; they are reference metadata, not evidence that the current bank meets coverage or difficulty requirements.

Propose the following independent layer:

- `exam_blueprints`: UUID, exam code, version, title, source URL, reviewed date, active metadata; unique `(exam_code, version)`.
- `exam_domains`: blueprint FK, stable domain code and display name, weight/display order; unique code within blueprint.
- `exam_objectives`: domain/blueprint association, objective code, label, optional parent objective, display order; unique code within blueprint, parent constrained to the same blueprint. Do not sort dotted objective codes as decimals.
- `question_version_objectives`: version/objective mapping with a primary objective flag and valid same-blueprint membership. Retain revision-specific mappings for historic classification; future edits can change the mapping without rewriting past revisions.

Existing topics remain delivery groups with stable IDs. One topic can contain questions mapped to multiple objectives; classification and topic navigation serve different purposes. Legacy questions begin unclassified, not guessed from seed names. Multiple blueprint versions can coexist; changing active blueprint metadata does not migrate old mappings automatically. Blueprint edits require ADMIN authorization and actor records when implemented.

Design acceptance: every mapping identifies an exam/version/domain/objective, objective hierarchy rejects cross-blueprint parents/cycles, old topic/attempt semantics remain intact, and coverage distinguishes unclassified content from actual gaps. No classification tables, seed changes, API routes, UI, or migrations are implemented in Phase 6A.1. Revalidate Cisco metadata before a later approved seed release; do not copy full objective text without assessing maintenance requirements.

## 6. Ordered small-step implementation plan — proposed

Each step requires implementation approval. Numbers below are proposed review slices, not commits created in this task.

| Order | Slice | Scope and dependency | Completion gate |
| --- | --- | --- | --- |
| 1 | **6A.2 — Admin UI session isolation** | Key managers, scope queries, clear drafts/targets, cancel/remove sensitive caches, guard late results by identity plus activation generation. No DB/schema/API-body change. Add the minimal meaningful DOM test setup. | A/B and same-user/new-session cases plus leave/return and delayed-result regressions pass; current server auth tests remain green. |
| 2 | 6A.3 — Admin mutation session binding | Verify real Clerk session shape, specify expected-session precondition, enforce it before service invocation on admin writes; complete P0 dispatch-race protection. Depends on slice 1. | Mismatch/anonymous/USER/disabled cases perform zero writes; captured-session action cannot be executed as a changed session; real-browser gaps are accurately labelled. |
| 3 | 6A.4 — Catalog invalidation | Replace old summary-only refresh with scoped admin/topic/progress/practice refresh rules after question/topic changes. Define across-tab freshness separately, not as a solved event bus. | Warmed dependent views refresh for the active session; old-session completion does not alter new-session data. |
| 4 | 6A.5 — Local database test guard | Shared preflight/identity guard, explicit opt-in, dedicated connection injection; retrofit every write-capable suite before running them. No application migration. | Mocked guard tests prove zero unsafe connections/writes; approved local-only suite runs distinguish schema and TEMP evidence. |
| 5 | 6A.6 — Revision schema and migration rehearsal | Finalize DDL/constraints/current-field compatibility; additive versions/options/pointers/audit/nullable attempt links; local rehearsal only after separate migration approval. Depends on slice 4. | Preserve legacy IDs/results; valid baseline capture and legacy-null history; safe rollback evidence, no fabricated history. |
| 6 | 6A.7 — Version-aware admin services | Atomic expected-generation compare, immutable version creation/mirror/pointer update, visibility concurrency. Depends on revision schema. | Concurrent admin conflicts and atomic failures verified on guarded local SQL. |
| 7 | 6A.8 — Version-aware delivery/grading | Coordinated OpenAPI/generated client/learner changes; coherent version read; strict stale conflict; version-linked attempts and honest legacy history details. Depends on slices 5–6. | Delivery/edit/submit ordering, API answer projection, historical content/accuracy, progress/history regressions pass. |
| 8 | 6A.9 — Classification design approval and foundation review | Approve blueprint/objective model and future rollout; summarize remaining P0/live Clerk/performance/origin-policy risks. Classification implementation remains a separate approval. | Foundation acceptance reviewed; no import, multi-answer authoring, or review/publishing feature expansion. |

The test guard is P1 but is a prerequisite to P0 revision SQL validation. Documentation/schema design may be refined earlier; no write-capable test precedes the guard. Do not turn the proposed order into a broad mixed-purpose commit.

## 7. First implementation slice for approval: 6A.2

Candidate file scope:

- `artifacts/ccna-learning/src/App.tsx`: pass resolved authorized identity and establish keyed manager lifetime.
- `components/admin-questions.tsx` and `components/admin-topics.tsx`: scoped keys, editor teardown, dispatch/result guards and mutation reset.
- Proposed `src/lib/admin-session.ts` and `admin-session.test.ts`: key/cache cleanup and activation guard with QueryClient regression tests.
- Proposed focused admin DOM tests; update `vitest.config.ts` deliberately to include `.test.tsx`, with per-file DOM environment while retaining Node for existing tests.
- Add only the required DOM test dependency (e.g. jsdom) to the frontend package and authoritative `pnpm-lock.yaml` after approval; React DOM/act can avoid introducing a larger testing library if sufficient. Current package has no DOM environment dependency.
- This plan/validation record updated with actual checks. No generated client regeneration, schema, migration, role change, or environment file is required for this UI slice.

Minimum regression matrix:

| Test | Expected result |
| --- | --- |
| A bank query/draft then ADMIN B | B has fresh authorized fetch and empty draft; no A private fields or target |
| Same user, new session | Distinct key and manager generation; old session removed |
| Sign-out / unresolved Clerk / denied access | Manager absent, sensitive data cleared, no save/disable dispatch |
| Deferred A list resolves after B starts | A response cannot render or repopulate A cache |
| Deferred A save/disable succeeds or fails | No B notice/error/form reset/invalidation; in-flight server result is not mislabelled canceled |
| Leave and return within same session | Old activation completion cannot affect newly mounted form |
| Stale handler invoked after switch | No API call dispatched by that handler |
| Existing API policy tests | 401/403 and database role authority retained; no auth bypass |

Acceptance for this first slice is narrower than closing all P0: session-scoped UI data/state and stale-handler isolation demonstrated in QueryClient and DOM tests, unchanged backend authorization, and an explicit remaining dispatch-time race until slice 6A.3. Real Clerk delayed learner Submit remains **Not Verified** unless that exact scenario is later completed.

After implementation approval, run focused frontend tests, the existing frontend/API non-DB suites, TypeScript, and relevant builds in the new worktree. Report actual counts and skips. Do not reuse old CI success as verification of new code, and do not run database tests for this frontend-only slice.

## 8. Risks, rollback, and final acceptance

| Risk | Mitigation / rollback |
| --- | --- |
| Loss of an unsaved draft on session transition | Intentional security boundary; clear all prior-session state. Explain current-session draft behavior without carrying content between identities. |
| Abort mistaken for server undo | Treat an accepted authenticated write as potentially committed; isolate response and reconcile the originating session on fresh fetch. Session precondition guards new requests, not retroactive undo. |
| Cache invalidation harms new session or unrelated learner state | Restrict removal and invalidation to known families/identity/generation; test delayed completions and unrelated cache retention. |
| Old clients submit without a version | Coordinated contract/UI rollout and explicit refresh conflict; never unsafe fallback grading. |
| Version model invents historic content | Leave legacy attempt links null; preserve stored results and mark details unavailable. |
| Migration/dual-write drift | Additive schema, local rehearsal, one transaction per version/pointer/mirror, eliminate unversioned writers, verify counts and FKs. |
| Rollback re-enables mutable grading | Retain captured versions/attempt links. Disable practice submission or return refresh-required temporarily rather than redeploy unsafe old grading. Use an approved forward repair; no destructive down migration or historical rewrite. |
| Guarded loopback endpoint is a tunnel | Use owned disposable PostgreSQL and server identity/marker checks before writes; URL syntax alone is insufficient. |
| Excluded `.env` is accidentally materialized | Keep worktree sparse rules; inspect status/exclusion after tooling. No environment setup or secret copy is authorized here. |
| Old audit metadata appears current | Preserve it byte-for-byte and use this setup record for current HEAD/worktree status. |
| Real delayed Clerk scenario remains untested | Carry **Not Verified** as a production residual risk; no unit/mock test upgrades that status. |

For frontend-only rollback after future approved commits, revert the narrowly scoped change through an ordinary forward commit/PR; never reset, force-push, amend published history, or touch the original dirty checkout. For this setup phase, retain the new worktree and both uncommitted documents; do not automatically remove it or discard documentation. Any later removal needs a content review and approval.

Phase 6A.1 acceptance:

1. New worktree branch/HEAD match verified fetched main and contain the required squash merge.
2. Original branch, HEAD, index bytes, status, 53 protected files, audit bytes, and all inventoried original working files remain unchanged.
3. Only authorized shared Git metadata changes occur; no original checkout merge/reset/clean/stash.
4. Audit copy hash matches; new worktree has only the two planning documents untracked and no staged application changes.
5. No `.env` or local secrets copied; tracked frontend `.env` stays absent with skip-worktree status.
6. All four priorities have concrete invariants, sequencing, tests, risks and approval boundaries; first slice is clearly bounded.
7. No database connection/migration, source change, dependency install, commit, push, or PR creation; stop for implementation approval.
