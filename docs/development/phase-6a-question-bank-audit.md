# Phase 6A — Question Bank Audit & Foundation Plan

Date: 2026-10-10. Repository: `HayelAlsalafi/kindred-identity-spark`.

**Status: audit and planning only; implementation and Git synchronization await approval.** This document is uncommitted. Application source, environment files, protected local changes, branch, HEAD, index, and Git refs must remain unchanged. No database connection, migration, seed, code generation, commit, push, or PR creation is part of this audit.

## 1. Git safety and baseline

| Item | Observed state |
| --- | --- |
| Current branch | `phase-5b2-practice-history-ui` |
| HEAD | `4c01d02dcd9275793da90b4d6d9a8beff652e3ca` |
| Index | Empty; no staged changes |
| Existing worktree changes | 53 protected paths: 49 modified tracked files and 4 untracked files |
| Local `main` | `f07e9fa` (stale) |
| Local `origin/main` tracking ref | `ed69cb4d3e5f480ea024f65216cae2300a198886` (stale) |
| Live `origin/main` | `7866b5e97ce02d66a2e6f83cd4647b5ccfdf5439`, confirmed by `git ls-remote` |
| PR #11 | Closed and merged; GitHub reports the same squash merge SHA |
| Origin | `https://github.com/HayelAlsalafi/kindred-identity-spark.git` |
| Backup remote | `https://github.com/HayelAlsalafi/CCNA-Platform.git` |

The 53 protected paths are:

- 48 modified files under `lib/api-zod/src/generated/types/` already identified in the [Phase 5C Git manifest](phase-5c-git-manifest.md). Line-ending differences do not authorize rewriting these bytes.
- Modified `package.json` containing earlier local development tooling changes.
- Untracked `docs/development/local-environment.md`.
- Untracked `tools/local-development.mjs`, `tools/local-env.mjs`, and `tools/local-env.test.mjs`.

An ignored audit receipt under `.local/tests/phase6a-20261010/` records all protected path names and SHA-256 hashes, 605 baseline file hashes, HEAD, refs, branch, status, and index hash. It contains no environment values. Only this new document is an intended visible worktree addition; the original 53 paths remain protected.

GitHub comparison reports the squash SHA and live `main` identical at inspection time. The 47 merge-file paths match the local committed Phase 5C changes: 45 patch bodies match; two patches use different hunk grouping (`practice.ts` and `practice-history.tsx`), and their complete committed contents match the merge SHA after newline normalization. The audit uses the current committed implementation and inspects the protected working files without editing them. This is source comparison evidence, not a fetch, merge, or rehearsal of synchronization.

### Recommended synchronization — not executed

1. Obtain approval for a separate clean worktree and new Phase 6 branch. Preserve this checkout, including all 53 files and this document.
2. After approval, fetch `origin/main`, confirm `7866b5e...` is present in its ancestry, and review any newer changes before selecting the base. Stop if the expected history differs.
3. Create an isolated worktree from the approved `origin/main` and a branch such as `feature/phase-6a-question-bank-foundation`. Do not merge or rebase the pre-squash local branch into `main`.
4. Copy only this audit document into the clean worktree if approved. Do not transfer generated local changes, tooling, build output, `.local`, credentials, or environment files. Decide delivery of the earlier local tooling separately.
5. Install with the authoritative `pnpm-lock.yaml` using a frozen lockfile. Review the clean baseline before any approved implementation. Perform code generation only in an isolated clean context and review its output explicitly.

This approach leaves published Lovable history and the dirty checkout intact. It needs neither stash nor reset/clean. No new branch or worktree was created during this audit.

## 2. Existing implementation inventory

“Implemented” below means connected source behavior with actual persistence or service logic, not live database or browser verification during this audit. “Partial” identifies a usable subset. Proposed enhancements are listed separately in sections 6–7.

| Capability | Classification | Actual behavior and evidence |
| --- | --- | --- |
| Admin entry and access gate | Implemented | `App.tsx` routes `/admin` to topic management and `/admin/questions` to the question manager after Clerk and server ADMIN checks. Sign-in/denied placeholder artwork does not make the authenticated managers mocks. |
| Admin analytics dashboard | Missing | No bank coverage, quality, review backlog, or publishing dashboard. The admin landing page is the topic manager. |
| Question create/read/update | Implemented for single-answer questions | Real list/create/update services, transactions, validation, and generated hooks. Editing reads list DTOs; there is no dedicated admin question-detail endpoint. |
| Deletion | Partial by design | A real soft-disable operation and reactivation by update exist. There is no hard-delete endpoint. This is useful protection for practice history. |
| List filters and pagination | Implemented | Topic, difficulty, ACTIVE/DISABLED, limit/offset, total count; UI pages contain 20 rows. No question text/code search. |
| Topic management | Implemented | Flat topics: slug, name, description, display order, ACTIVE/DISABLED; real list/create/update/disable and duplicate-slug handling. |
| Categories / exam objectives | Missing | No category/domain/objective tables or hierarchy. Seed contains five general topics, not a complete CCNA blueprint. |
| Options and answer storage | Implemented for single answer | Separate option rows with keys/order/text/correct flag. Server requires 2–10 options and exactly one correct option; editor uses a radio button. |
| Multiple-answer questions | Missing | Type enum has only `MULTIPLE_CHOICE_SINGLE`; submission and attempts store one option key. This cannot be enabled by changing only the editor. |
| Explanations | Implemented with quality gaps | Text is stored, edited, and returned after grading; empty explanation is allowed. No publication quality requirement. |
| References | Partial | `referenceNotes` is stored and edited as free text. No structured citations, URL validation, or learner practice reference presentation. |
| Difficulty | Implemented | EASY/MEDIUM/HARD across schema, service, contracts, filters, and editor. No calibrated difficulty scoring or adaptive selection. |
| Images | Partial | Nullable `imageKey` storage and contract field exist; no bank editor upload/preview flow, and practice selection does not return the image field. |
| Draft / review / published / archived | Missing | Only ACTIVE/DISABLED. A new ACTIVE question is immediately eligible for practice when its topic is active. |
| CSV / Excel bulk import | Missing | No parser, template, preview, staging job, row report, or apply endpoint. |
| Duplicate detection | Missing | Unique question code and option keys are identifiers, not content duplicate detection. |
| Question revisions / audit trail | Missing | Updates overwrite question fields and replace option rows. Timestamps exist, but no revision, actor, change event, or review record. |
| Learner practice | Implemented for single answer | Random active question in active topic, private-answer projection, transactional grading and attempt insertion using server identity. |
| Legacy summary counters | Placeholder | `/topics` metadata is real but its counters are zero; `/dashboard/summary` returns placeholder zero metrics. Phase 5C learner progress uses separate implemented endpoints. |
| Admin session cache isolation | Inconsistent / needs correction | Access-check queries are identity scoped, but manager query keys, editor state, and mutation handling are not session scoped. See section 5. |
| Admin mutation invalidation | Inconsistent / needs correction | Question writes invalidate the old summary endpoint, not current Phase 5C progress/practice keys; topic writes also omit related views. |

Primary UI evidence: [App.tsx](../../artifacts/ccna-learning/src/App.tsx), [admin-questions.tsx](../../artifacts/ccna-learning/src/components/admin-questions.tsx), [admin-topics.tsx](../../artifacts/ccna-learning/src/components/admin-topics.tsx), and [practice-workspace.tsx](../../artifacts/ccna-learning/src/components/practice-workspace.tsx).

## 3. Database and domain architecture

### Current tables and constraints

- [topics.ts](../../lib/db/src/schema/topics.ts): flat topic UUID, unique slug, name, description, display order, status, timestamps.
- [questions.ts](../../lib/db/src/schema/questions.ts): stable UUID; unique database-generated question code; topic FK with RESTRICT; question text, single-answer type, difficulty, explanation, optional image/reference notes, ACTIVE/DISABLED, timestamps.
- Option rows have UUID, question FK with CASCADE, option key, order, text, correct flag, and timestamps. Per-question key and order uniqueness exist.
- [practice-attempts.ts](../../lib/db/src/schema/practice-attempts.ts): user/question/topic IDs with RESTRICT, selected option key, stored correctness, submission timestamp, and indexes. There is no version ID, answer-content snapshot, or selected-options collection.
- [users.ts](../../lib/db/src/schema/users.ts): Clerk ID, email, profile, database-controlled USER/ADMIN and ACTIVE/DISABLED.

Strict server Zod schemas trim text, reject unknown fields and unsupported enums, bound lengths, require unique case-insensitive option keys, require 2–10 options and exactly one correct option, reject empty updates, and exclude client-supplied question code. The code-immutability database trigger is in migration `0002`, although a schema comment refers to `0001`.

The database does **not** enforce the aggregate option count or exactly-one-correct rule. Raw database writes or an importer bypassing the shared validator can create invalid questions. Practice fails with an internal error when correct-answer cardinality is invalid. Preserve the shared validation boundary and design additional database invariants where feasible.

### Migrations

The tracked Drizzle journal contains:

1. `0000_baseline.sql`: users/topics baseline.
2. `0001_question_domain.sql`: question enums, sequence, tables, keys and indexes.
3. `0002_question_code_immutable.sql`: immutable code trigger.
4. `0003_practice_attempts.sql`: attempts and restricted historical references.

Snapshots exist through `0002`; the handwritten `0003` is journaled. Validate future generation against this state rather than assuming missing snapshot metadata means the migration was not applied. No actual database migration state was inspected. `lib/db/package.json` still exposes push/push-force scripts; project policy requires versioned migrations, never those commands.

### Editing, concurrency, and historical integrity

[questions-admin.ts](../../artifacts/api-server/src/lib/questions-admin.ts) updates the parent before replacing all option rows in one transaction. [practice.ts](../../artifacts/api-server/src/lib/practice.ts) obtains SHARE locks on the question/topic/options during grading and insertion. These coordinate an update with an in-flight submission, but not the time between displaying a question and submitting it.

**High-priority integrity gap:** a learner can load revision A, an administrator changes the options/correct answer, and the learner submits against the current question. No displayed revision is supplied or checked, so grading can use revision B. This follows from the source contract; it was not reproduced against a live database during this audit.

Attempts preserve their original topic ID, selected key, correctness, and timestamp. Hard deletion of a referenced question/topic is restricted. However, history joins current question/topic metadata, and replaced options cannot reconstruct the question the learner actually saw. Append-only attempt behavior is an application convention, not a database immutability trigger. Concurrent administrator edits also have no expected revision/ETag and can overwrite one another.

List total and page rows are separate queries, so simultaneous edits can make pagination totals drift. Random practice selection uses `ORDER BY random()`; measure its cost before assuming it scales to a large imported bank.

## 4. API contracts and generated clients

Actual registered routes under `/api` include:

| Route | Access and behavior |
| --- | --- |
| `GET /admin/questions` | Authenticated ADMIN; filter and paginated private bank DTOs |
| `POST /admin/questions` | Authenticated ADMIN; validated transaction, 201 |
| `PATCH /admin/questions/{id}` | Authenticated ADMIN; partial update, optional option replacement |
| `POST /admin/questions/{id}/disable` | Authenticated ADMIN; soft disable |
| `GET/POST /admin/topics` | Authenticated ADMIN; list/create |
| `PATCH /admin/topics/{id}`; `POST .../disable` | Authenticated ADMIN; update/soft disable |
| `GET /questions/{id}` | Authenticated learner; active question/topic only, answer fields excluded |
| `GET /practice/topics/{topicId}/question` | Authenticated learner; active random question, no correct answer/explanation |
| `POST /practice/questions/{id}/answer` | Authenticated learner; one selected key, transactional grade/attempt insert |
| History and learning-progress routes | Authenticated learner; database user identity supplies ownership |

Route evidence: [admin-questions.ts](../../artifacts/api-server/src/routes/admin-questions.ts), [admin-topics.ts](../../artifacts/api-server/src/routes/admin-topics.ts), [questions.ts](../../artifacts/api-server/src/routes/questions.ts), [practice.ts](../../artifacts/api-server/src/routes/practice.ts), and the [route index](../../artifacts/api-server/src/routes/index.ts).

[openapi.yaml](../../lib/api-spec/openapi.yaml) describes these endpoints, enums, private/admin versus learner DTOs, errors, and Clerk authentication. ADMIN enforcement is runtime middleware, not an OpenAPI bearer role claim. Exactly-one-correct is a server refinement, not guaranteed merely by a generated type. No contract exists for revisions, import, review, classification, or multiple selected answers.

Generated React Query hooks in `lib/api-client-react/src/generated/api.ts` call real routes. Generated Zod/contracts exist under `lib/api-zod/src/generated/`. The custom fetcher handles transport/errors/abort but does not runtime-parse every response. Learner question responses have explicit server schema parsing; admin routes primarily rely on service DTO construction and static types.

Default Orval configurations use `clean: true`. Future generation must occur in the approved clean worktree or isolated output, followed by explicit diff review; running it over the current protected generated files is unsafe. No generation was performed for this audit.

## 5. Security, tests, and residual risks

### Authentication and ADMIN authorization

[auth.ts](../../artifacts/api-server/src/middlewares/auth.ts) uses real Clerk identity, looks up/provisions a PostgreSQL user, checks ACTIVE, and derives ADMIN exclusively from the database. A new user is USER, and token role claims do not grant ADMIN. Each admin router applies authentication and `requireAdmin`; UI access checks supplement this server enforcement. No auth bypass or fake token implementation was introduced.

`scripts/src/promote-admin.ts` is an operator CLI, not a public role-mutation endpoint. The bank is globally shared among administrators; there is no tenant/organization boundary, actor audit, or separate reviewer capability. Keep this model explicit before adding a review workflow. Protected GET requests can update user profile/last-login state through middleware, so this audit did not call live application endpoints.

### Prioritized findings

| Priority | Finding | Evidence and recommended action |
| --- | --- | --- |
| High | Admin bank data/editor state are not session isolated | Manager queries use generic generated keys without user/session identity. Managers have no identity remount boundary or late-mutation guard equivalent to Practice. Scope/cancel/remove sensitive cache and reset drafts on identity changes; add real browser verification. Static risk, not a demonstrated server authorization bypass. |
| High | Displayed question can be graded against a changed question | Read/submit contracts lack revision. Introduce immutable published revisions and require the displayed version, or reject stale submissions explicitly. |
| High | Historical question content is lost on edit | Attempts retain result/key, not question/option revision. Preserve stable question IDs, add nullable legacy version links, and never fabricate historical snapshots. |
| Medium | Catalog changes leave current learner caches stale | Question manager refreshes `/dashboard/summary`, not current progress/practice keys; topic writes omit dependent question/progress views. Define one catalog invalidation strategy with session guards. |
| Medium | Legacy DB test suites accept inherited application connection | `questions.db.test.ts` and `topics-admin.db.test.ts` require RUN_DB_TESTS and DATABASE_URL but no dedicated loopback/database-name guard. Transactions do not protect sequence state or make production execution safe. Add guarded local-only test infrastructure before running them. |
| Medium | Cross-origin and sensitive response policy needs review | `app.ts` reflects origins with credentials; admin routes have no explicit private/no-store policy. Validate Clerk cookie/origin behavior, restrict trusted origins, and protect answer-bearing responses. No exploitable CSRF was established. |
| Medium | Error logging can include raw database errors | Admin handlers log the error object; existing redaction covers credential headers, not necessarily SQL parameters or question content. Keep generic responses and sanitize structured internal diagnostics. No secret leak was observed. |
| Medium | No publication quality gate, duplicate guard, or administrator conflict check | ACTIVE can be created immediately, explanations may be blank, code uniqueness does not detect content duplicates, and updates are last-writer-wins. Address before high-volume authoring/import. |
| Before production | Delayed real Clerk Submit/session switch remains **Not Verified** | Previously deferred because of testing-tool limitations. Ordinary A/B login and data isolation succeeded; unit guards do not establish this delayed browser scenario. Retain as residual production risk and revalidate with supported tooling. |

Rendering currently uses escaped text, not arbitrary question HTML. If Markdown, citations, downloads, or uploads are introduced, add format-specific sanitization and limits. No current import/upload security exists because the feature is absent.

### Test evidence and its limits

This audit did not rerun TypeScript, builds, tests, or application servers: there is no executable change, and the dirty checkout must be preserved. Existing Phase 5C evidence is a baseline, not new Phase 6 verification:

| Evidence | Status and limitation |
| --- | --- |
| Phase 5C final TypeScript and builds | Previously passed; not rerun during this audit |
| API non-database suite | Previously 145 passed across 10 files; admin HTTP tests mock domain services/database lookup and Clerk boundaries |
| Frontend suite | Previously 68 passed across 5 files; progress/history/session/cache logic, not administrator DOM workflow coverage |
| Isolated PostgreSQL progress/history | Previously 16 passed on 2026-10-09: 11 progress and 5 history; not bank CRUD proof and not rerun |
| Published Phase 5C head CI | Run 28, [37996029295](https://github.com/HayelAlsalafi/kindred-identity-spark/actions/runs/37996029295), passed on `4c01d02...`; do not relabel this as a new Phase 6 or squash-HEAD run |
| Real Clerk delayed Submit transition | **Not Verified**; neither a pass nor evidence of an observed application failure |

Existing question coverage includes 11 validator tests, 16 admin-question HTTP tests, and 16 admin-topic HTTP tests. Optional database files cover question creation/code immutability/FKs/visibility/grading/attempts and topic CRUD; they were not executed here. There is no dedicated real-SQL admin question option-replacement/concurrency/history suite.

Frontend Vitest currently uses Node and includes only `src/**/*.test.ts`, so adding `.test.tsx` alone would not establish component coverage. CI excludes `*.db.test.ts`; the API config separately excludes integration tests. Future work needs deliberate DOM configuration and guarded disposable PostgreSQL coverage rather than counting skipped tests as passes.

## 6. Proposed target architecture — not current implementation

### Classification

Use a versioned exam blueprint, domain, and objective mapping while retaining existing topic IDs as learner delivery groups. A question can map to one or more objectives with a primary classification. Store blueprint version and objective codes, not just translated display labels. Mark legacy questions unclassified until reviewed; do not infer classification from topic names or silently move historical topic IDs.

The official [Cisco CCNA 200-301 v1.1 blueprint](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf), checked on 2026-10-10, identifies six domains: Network Fundamentals (20%), Network Access (20%), IP Connectivity (25%), IP Services (10%), Security Fundamentals (15%), and Automation and Programmability (10%). Store this version as data and allow future blueprint revisions. The existing five seed topics do not establish objective coverage. Do not copy a full exam-question bank or treat classification as verified content quality.

### Stable identity, revisions, and lifecycle

- Keep the existing question UUID and immutable code as logical identity. Add immutable revision records and revision options, with a published revision pointer and an editable draft head.
- Keep ACTIVE/DISABLED compatibility during an additive migration. Add explicit DRAFT/IN_REVIEW/PUBLISHED/ARCHIVED lifecycle semantics; switch learner eligibility only at an approved cutover. Publication belongs to a specific revision; editing a published question creates a draft rather than mutating its live revision.
- Do not automatically assert that all legacy ACTIVE questions were reviewed. Approve a compatibility/backfill policy that preserves availability initially, labels legacy review status accurately, and permits later publication review without silent mass removal.
- Add actor-attributed audit events and optimistic revision checks. Lifecycle changes, revision creation, archive/restore, and import application must record internal database user, time, action, and relevant revision IDs.
- Future attempts reference the displayed immutable revision. Legacy version links remain nullable where the historical content cannot be recovered. Preserve stored correctness, selected key, original topic ID, and timestamp.
- Archive without physical deletion. Maintain historical FKs and retrieve attempt details from their revision. Define whether a loaded archived revision may still be submitted; either a bounded grace policy or an explicit stale/unavailable response must be documented and tested.

### Answers, quality, and duplicate policy

Keep current single-answer compatibility. Multiple-answer support needs a separate supported type, sets of selected option identities, set-based correctness, revised DTOs/contracts, learner controls, and attempt persistence. Initially recommend exact-set grading with explicit “choose all that apply”; partial credit is a separate product decision. Reject duplicate/foreign/empty selections and malformed correct-answer sets.

Explanations and at least one approved reference can become publication requirements after agreement; drafts may be incomplete. Retain legacy reference notes while adding structured references with label, URL/citation, and optional source section. Keep difficulty enums, with an authoring rubric and later evidence-based calibration.

Define content normalization and fingerprint semantics before adding a uniqueness policy. Compare question text/type and normalized option content rather than relying on code; handle reordered options and same text with materially different answers intentionally. Exact matches need a transaction-safe decision, near matches should produce review warnings, and nothing should be auto-deleted or auto-merged.

### Import

Start with UTF-8 CSV and `.xlsx`, with an explicit template and stable topic/objective identifiers. Do not accept macro-enabled workbooks or evaluate spreadsheet formulas. Use staged jobs and per-row results: validate, preview, approve apply, create drafts, record provenance. Applying a job must be idempotent and recheck administrator authorization and duplicate policy. Publication is a separate action.

Limit file bytes, sheets, rows, columns, cell length, and ZIP expansion; reject unsupported formats and unknown columns. Escape formula-like cells in downloaded CSV reports. Do not fetch reference URLs server-side or automatically create classifications from arbitrary uploaded names. Specify atomicity, retry, retention, and cleanup rules for staging before implementation.

## 7. Phase 6 implementation roadmap

All phases below are proposed work after synchronization and scope approval. Each should have a small reviewable diff and explicit checks; no production database is required for development or test validation.

### Phase 6A — Foundation

- **Scope:** approved blueprint/domain/objective model; version/lifecycle compatibility design; test-database safety; administrator session isolation and catalog cache invalidation; publication/revision invariants and migration policy.
- **Dependencies:** approve separate worktree, blueprint version, legacy availability/backfill policy, revision/attempt semantics, and minimum publication requirements.
- **Database:** additive versioned migrations for classification, question revisions/options, revision pointers, audit events, and nullable attempt revision FK. Preserve old IDs/results and ACTIVE/DISABLED compatibility; verify the Drizzle journal before numbering new migrations. No destructive migration or push.
- **API:** classification read contracts and ADMIN management where needed; add revision identifiers/concurrency errors without breaking existing single-answer callers; wire shared validation and private cache policy. Define stable error codes and legacy compatibility.
- **UI:** identity-keyed admin managers, draft reset and late-response guard, coherent query invalidation; classification fields/labels and legacy-unclassified indicator. No import or publishing workflow in this phase.
- **Security:** database ADMIN checks on every new admin route; cancel/remove prior-session answer-bearing caches; approved origin policy, sanitized logging; guarded loopback-only test databases.
- **Tests:** unauthenticated/USER/disabled-user denial; session change during list/save; warmed progress cache after catalog changes; additive migration/legacy backfill/FKs/code immutability; displayed-revision grading contract; isolated regeneration/typecheck/build.
- **Acceptance:** protected checkout unchanged; clean branch baseline; six blueprint domains and objective-code support; legacy attempts preserved without invented snapshots; old single-answer contracts remain supported; admin cache and stale catalog regressions reproduced then fixed; mandatory checks pass on the reviewed head.

### Phase 6B — Question Management

- **Scope:** revision-aware editor/detail view, search/filter/pagination, structured references, single- and multiple-answer authoring/practice, archive/restore, administrator conflict handling, exact/near-duplicate feedback. Prioritize single-answer revision integrity before enabling multiple answers.
- **Dependencies:** Phase 6A model, grading policy, duplicate normalization, reference format and display decisions.
- **Database:** supported multiple-answer type and revision-scoped options; selected option sets tied to attempt/revision with additive legacy compatibility; structured references and indexed fingerprint/search fields as justified by measurements.
- **API:** admin detail/revision/history/search contracts; expected revision on writes; stable duplicate/conflict errors; learner read/submit/result contracts for version and answer sets; no physical-delete endpoint for referenced content.
- **UI:** revision-aware form, explicit single/multiple controls, correct-answer cardinality guidance, reference editing/preview, readable conflicts and duplicate warnings; learner multiple selection and version-aware result. Image uploads remain a separately bounded decision, not an assumed foundation feature.
- **Security:** learners receive no pre-answer correctness/explanations; references use safe URL schemes and escaped content; all version/history/admin fields stay ADMIN protected; ownership of attempts stays server controlled.
- **Tests:** real SQL option replacement/revision immutability, simultaneous admin edits and learner submissions, exact-set grading, invalid/foreign keys, safe archive with history, references and answer projection, DOM editor/practice flows.
- **Acceptance:** every submitted new attempt grades the displayed revision or returns a documented conflict; historical details survive edits/archive; both supported answer types work end to end; unauthorized mutations fail; errors preserve drafts without silently overwriting newer data.

### Phase 6C — Bulk Import

- **Scope:** CSV/XLSX template, staged validation, preview, row errors, duplicate decisions, approved application to drafts, downloadable reports and provenance.
- **Dependencies:** stable Phase 6B contracts, shared validator, duplicate policy, classification identifiers, file/row limits, and atomicity policy.
- **Database:** import job/row tables with creator, normalized inputs, validation state, content hashes, application/result IDs, timestamps, and retry/idempotency constraints; retention policy for staged input.
- **API:** ADMIN-only template/create-upload/validate/preview/apply/status/report operations. Apply requires an explicit validated job/version; never publish imported rows automatically.
- **UI:** upload wizard, mapping/template instructions, progress, valid/invalid/duplicate counts, actionable row errors, final apply confirmation and result report.
- **Security:** file and ZIP expansion limits, no formulas/macros execution, no URL fetching, safe report cells, safe filenames/storage, authorization recheck, bounded batch transactions, payload-safe logs and job access.
- **Tests:** Unicode/BOM/newline CSV, quoted fields, malformed/oversized XLSX, formula cells, unsupported columns, invalid classification/answer cardinality, intra-file/existing-bank duplicates, concurrent retries, cancellation/partial failures, USER and disabled-ADMIN denial.
- **Acceptance:** preview creates no live questions; apply creates only approved valid drafts according to the documented atomicity policy; repeated apply cannot duplicate rows; failures are traceable; imported data never appears in practice before publication.

### Phase 6D — Review, Publishing & Quality Assurance

- **Scope:** review queue, feedback/rejection, revision publication, archive/restore semantics, bank quality/blueprint coverage reporting, legacy review completion, production readiness validation.
- **Dependencies:** Phases 6A–6C; agreed author/reviewer separation and publication requirements; approved legacy and learner eligibility cutover.
- **Database:** complete lifecycle transition/audit records, reviewer/publisher internal user IDs, published timestamps and revision pointers; additional constraints/indexes only if necessary. Resolve legacy review labels explicitly.
- **API:** ADMIN-only submit-for-review/review/reject/publish/archive transitions with expected revision, state validation and quality checks; bank coverage/quality summaries; learner selection uses eligible published revisions and active topics.
- **UI:** review comparison and feedback, publication blockers, audit timeline, domain/objective coverage and difficulty distribution; explicit actions with conflict handling and accessibility.
- **Security:** transition policy checked server-side; decide whether one ADMIN may author and approve or a second ADMIN is required. If capabilities are extended, store them in PostgreSQL, never token role claims. Prevent draft answers from leaking to learners.
- **Tests:** full state matrix and permissions, attempted publish with missing explanation/references/classification or invalid answers, published revision immutability, archived question history, catalog invalidation, import-to-review-to-practice journey, concurrent transitions, migration rehearsal and performance budgets.
- **Acceptance:** only approved eligible revisions enter practice; failed checks leave state unchanged; audit actors/transitions are traceable; legacy data/history is retained; CI on the resulting head passes; supported real Clerk delayed Submit/session-switch validation is completed or remains explicitly **Not Verified** with an approved production risk decision. A skipped/incomplete scenario is never counted as Passed.

## 8. Candidate files for future approved changes

This is a planning inventory, not a staging allowlist. Select only the files required by the approved phase.

| Area | Existing files / proposed additions |
| --- | --- |
| Schema and migration | `lib/db/src/schema/{questions,topics,practice-attempts,index}.ts`; proposed `exam-blueprints.ts`, `question-versions.ts`, `question-audit.ts`, later `question-imports.ts`; versioned `lib/db/drizzle/*.sql` and reviewed journal/snapshots |
| Domain services | `artifacts/api-server/src/lib/{questions,questions-admin,topics-admin,practice,learning-progress}.ts`; proposed revision/classification/import/review services |
| Routes and middleware | `artifacts/api-server/src/routes/{admin-questions,admin-topics,questions,practice,index}.ts`; proposed import/review/classification routes; `middlewares/auth.ts` only if agreed database capabilities require it; `app.ts`/`lib/logger.ts` for approved origin/log policy |
| Contracts and generated output | `lib/api-spec/openapi.yaml`, relevant Orval configuration; explicit reviewed files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/`, generated only in the isolated approved context |
| Administrator and learner UI | `artifacts/ccna-learning/src/App.tsx`, `components/{admin-questions,admin-topics,practice-workspace}.tsx`; cache helpers; proposed detail/review/import components |
| Tests and CI | Existing validator/admin route/practice/database tests; proposed guarded DB helper, revision/authorization/import tests and administrator DOM tests; relevant Vitest config and `.github/workflows/ci.yml` for disposable local PostgreSQL/DOM coverage |
| Seed and documentation | `scripts/src/seed.ts` for approved blueprint data; this document and subsequent migration/import/review validation documentation |

Exclude protected local tooling, environment files, root/build output, build-info, and `.local` from any future feature commit unless separately authorized. Keep `pnpm-lock.yaml` authoritative and review any dependency addition for the approved CSV/XLSX/parser or DOM test scope.

## 9. Audit completion and approval boundary

Final hash verification passed: the original 53 path hashes, branch/HEAD, refs, and index are unchanged, the index is empty, and this new audit document is the only visible addition (54 worktree paths including the original 53). No application/environment file changed. A targeted credential-pattern scan of the document found no matches. Ignored safety receipts are local evidence, not commit inputs.

Recommend approval of the separate-worktree synchronization strategy, followed by a narrowly scoped Phase 6A implementation proposal. Do not begin implementation, create a branch, or publish Git changes on the strength of this audit alone. PR #11 is already merged; the remaining decisions concern Phase 6 synchronization and implementation, not re-merging Phase 5C.
