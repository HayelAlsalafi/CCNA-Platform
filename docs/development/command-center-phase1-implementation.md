# Command Center — Phase 1 implementation

Implemented 2026-10-26 in `<repository-root>`, branch `main`, HEAD `3c07b4bb7fe807e60dcbcd5539c046b919a9956f`. Source changes only: no database connection, migration, seed, grant, history modification or question change. Existing user work and the previously approved configuration cleanup remain preserved.

## Discovery and verified gaps

The existing route is `/`, mounted by the existing `App` inside the shared NEXUS shell. It was already connected to persisted learner data. Zero counters were not treated as evidence that the data connection was missing.

| Existing tab | Already implemented before this task | Confirmed gap | Phase 1 change |
| --- | --- | --- | --- |
| At a glance | Four all-time counters, personal welcome, start/resume actions, signed-out/loading/error handling | Content stopped after the four counters | Added published-question/chapter coverage, six-domain accuracy/sample/weight context, and latest completed exam when supported |
| Domain topology | Interactive topology/list switch, domain selection, availability/coverage, chapter counts, domain practice links | Historical accuracy could follow a question's edited current chapter; server suggestions could include fully covered strong topics | Retained the component/interactions; corrected historical attempt attribution and recommendation eligibility in existing analytics |
| Activity | Existing timezone-aware yearly heatmap, year/date keyboard controls, streak and real event totals | No short-term correct/incorrect trend in this dashboard | Reused existing `LearningAnalytics` above the unchanged `YearlyActivity`; added 90-day range, local calendar dates, session/exam completion counts and honest zero-answer gaps |
| Skill evidence | Existing radar/table, detail selection, conservative sample requirements, revision-verified evidence | No concise summary of stronger/review/insufficient areas | Added a summary above the unchanged matrix; its existing verified cohort and scoring rules remain intact |
| Next steps | Topic recommendation, explanation of the existing rule, recent sessions/answers, history links and retries | Could recommend a fully covered high-accuracy topic with zero remaining questions; rationale was generic | Excludes no-work topics, adds individualized reasons, deterministic tie-breaking and an existing Exam Simulator link |

The welcome banner markup, technical illustration, sidebar, navigation, five tab identities, roving keyboard tabs, resume/start links, topology map/list, yearly calendar, Skill Matrix and recent-history fallback remain. No alternate dashboard or replacement shell was introduced. All inactive panels still use the existing hidden/tab relationship.

## Architecture and data flow

1. Existing Clerk identity and PostgreSQL account middleware authenticate the request; the database account supplies authorization and the internal learner ID.
2. The existing `GET /api/nexus/analytics` is extended. No second analytics endpoint, event table, taxonomy or session system was created.
3. Existing counters/topics/session history/resume and new read-only projections execute in one **repeatable-read, read-only transaction**, with a local 10-second SQL statement timeout. This prevents a concurrent answer from changing the cohort between queries in one response. Existing history helper calls remain in that transaction through a nested read-only transaction/savepoint.
4. New projection reads existing practice attempts, active questions/topics, canonical curriculum chapters, active CCNA v1.1 domains/blueprint, optional completed practice sessions and optional exam sessions.
5. The response is normalized to its JSON wire representation and validated with the scoped Orval-generated Zod response schema before being returned. Null session topic summaries normalize to the existing empty-label fallback; historical rows themselves are not changed.
6. React keeps the original identity/session-keyed query lifecycle and no-store requests. Main all-time metrics and selected-period trend have separate observers, sharing the default query key. Changing the trend never clears the main dashboard or carries another identity's placeholder data.

The existing shared `examsInstalled` helper now accepts a structural execute-only database interface, allowing checks inside a read-only transaction. No exam creation, grading, submission, history or permission behavior changed. The same execute-only/transaction-capable typing is used by the reused Nexus readers; no `any` was added to bypass the transaction type check.

## Files created and modified

Backend:

- Added `artifacts/api-server/src/lib/command-center.ts`: input/calendar validation, SQL projection, cohort validation and conservative domain status.
- Modified `artifacts/api-server/src/lib/nexus.ts`: existing analytics integration, consistent read snapshot, historical chapter attribution, valid recommendations and full output validation. Practice/session write handlers are unchanged.
- Modified `artifacts/api-server/src/routes/nexus.ts`: strict analytics query validation; existing verified actor/session delegation. Unexpected diagnostics now log a fixed code rather than raw driver errors.
- Modified `artifacts/api-server/src/lib/exams.ts`: read-check parameter type only, to accept the transaction's execute interface.
- Added focused `lib/command-center.test.ts` and `routes/command-center.test.ts`.

Frontend:

- Modified `artifacts/ccna-learning/src/pages/nexus-overview.tsx` and its CSS, retaining the existing panels and banner.
- Added `components/command-center-insights.tsx` and `components/command-center.test.tsx`.
- Modified `components/nexus-visuals.tsx` only in the reused timeline: 90-day option, null/zero-day rendering, precise dates, counts and truncation/timezone labels. Topology interactions remain.
- Modified `lib/nexus.ts`: generated analytics fetcher, timezone-aware private query key, valid recommendation filtering and stable tie-breaks.

Contracts/tooling:

- Added `/nexus/analytics` and `CommandCenter*` schemas to `lib/api-spec/openapi.yaml`; original API contract content is otherwise preserved.
- Added `lib/api-spec/orval.command-center.config.ts`: additive scoped generation, `clean:false`; existing client/generated folders are not rewritten.
- Generated `lib/api-client-react/src/command-center/api.ts`, `api.schemas.ts`, and `lib/api-zod/src/command-center/api.ts` using installed Orval 8.30.0. Updated existing package exports and the handwritten Nexus compatibility types to use the generated summary type.
- Added `--command-center` selection to existing `tools/run-curriculum-tests.mjs`; no new parallel test harness.

No dependencies, lockfiles, database schema exports, migration SQL, snapshots or journal entries were changed.

## API contract

`GET /api/nexus/analytics?range=30&timezone=Asia%2FRiyadh`

- `range`: optional `7`, `30`, `90`, `all`; default `30`.
- `timezone`: optional IANA timezone, at most 100 characters; default `UTC` for compatible older callers. Browser callers supply their resolved timezone. Intl validation happens before SQL; server timezone availability is checked before bucketing.
- Unknown parameters, arrays/repeated ranges, invalid periods and invalid timezones are rejected. No client `userId` or role selects an actor.
- Existing totals, domains, topics, history, resume, range/granularity and unavailable study-time/streak fields remain. `range` filters the **timeline only**; lifetime statistics are not relabeled as ranged statistics.
- Additive `commandCenter` object: timezone/cohort, current published coverage, conservative domain evidence with official weights, optional exam summary and timeline truncation metadata.
- Timeline rows add `incorrect`, `completedSessions`, `completedExams`. Existing `day`, `attempts`, `correct` remain.
- New fields have generated client and runtime validator contracts. The frontend compatibility type keeps `commandCenter` optional while an older API is being restarted; it does not invent data when the field is absent.
- All private Nexus responses retain `Cache-Control: no-store`. No questions, option keys, explanations, learner names or other learners' rows are included in this aggregation response.

## Metric definitions and reconciliation

| Metric | Exact definition |
| --- | --- |
| Submitted/answered questions | Count of persisted `practice_attempts` belonging to the verified internal learner. Every committed attempt is one answer, including repeated attempts and legacy rows. Selections/page visits/unsubmitted deliveries do not count. |
| Correct answers | Count of those attempts with server-stored `is_correct=true`; both single/multiple-answer outcomes already come from the existing grading path. |
| Overall accuracy | `correct / attempts * 100`, rounded for display; null/dash when denominator is zero. No inferred proficiency. |
| Unique practiced questions | Distinct question IDs across those persisted attempts. Repeats change answer/accuracy counts without multiplying distinct questions. |
| Recent learning activity | Maximum persisted practice submission timestamp, not a visit or draft selection. |
| Available questions | Questions and topics both `ACTIVE`. This is a current published-catalog denominator, distinct from lifetime historical answers. |
| Practiced available questions | Current available questions with at least one persisted attempt for this learner; each question counted once via `EXISTS`. Incorrect practice counts as encountered coverage, not successful mastery. |
| Available/practiced chapters | Active CCNA v1.1 canonical chapters containing available questions; practiced chapters additionally require a learner attempt for an available question in the **same recorded chapter**. A moved question does not manufacture chapter coverage. Empty chapters are not a misleading zero-success denominator. |
| Domain answers/correct | Submission-time `practice_attempts.topic_id` joins the stable canonical chapter and its primary domain. A question's current chapter is not used to retroactively move historical answer accuracy. No taxonomy record is created. |
| Domain unique questions | Distinct question IDs among those historically attributed domain attempts, including historical questions no longer available. Repeats do not increase this sample threshold. |
| Missing mappings | Unmapped historical attempts stay in lifetime totals, are not assigned by guessing, and are explained separately. A deleted/unavailable catalog question is excluded from current availability/coverage. Physically removed attempts cannot be reconstructed by this feature. |
| Multi-objective/multi-domain associations | Canonical chapter supplies **one primary domain**. Objective association tables are not joined into the answer aggregate, preventing fan-out/double counting. If a learner practiced a question in different chapters over time, its attempts belong to their respective recorded primary domains; domain unique counts therefore need not sum to global unique questions. |
| Completed practice sessions | Existing `learning_sessions.status='COMPLETED'` for this learner. Active/abandoned sessions are not completed. Session completions are separate event columns and never added to answer counts. |
| Partially completed practice | Persisted individually graded answers still count; unsubmitted selections do not. Completion remains a distinct session state. Retried/idempotent submissions rely on existing persistence uniqueness and are not counted again by a join. |
| Completed exams | Only owned terminal `SUBMITTED`/`EXPIRED` sessions, after existing exam schema/guard/privilege readiness succeeds. Latest result uses deterministic finalized-time/ID ordering. Active exams are excluded. |
| Exam performance | Stored terminal result percentage, shown separately from practice accuracy. Exam deliveries are not practice attempts and are never unioned into practice answer totals. If the existing optional exam feature is unavailable, no exam count/score is fabricated. |
| Calendar activity | Saved practice answers, completed practice sessions and completed exams grouped into separate columns using the learner timezone's local midnight boundaries. Local timestamp buckets avoid treating UTC dates as local days and handle calendar-day/DST boundaries on PostgreSQL. |
| Trend window | 7/30/90 local days including today, zero-filled; `all` is monthly and bounded to the latest 120 calendar months. Explicit `truncated` warning appears if older events exist; lifetime counters still include them. Zero-answer buckets show “No answers,” not 0% accuracy, and are gaps in the line. |
| Yearly calendar | Existing `YearlyActivity` and its answer/session event semantics are preserved, including its year navigation and timezone. Its combined event count is not labeled as a question-answer count. Exam completion history is added to the short-period trend, not silently mixed into the old yearly event cohort. |
| Study time | Remains unavailable; neither elapsed session span nor page presence is promoted to active study duration. |

Historical attribution assumes the existing canonical chapter/domain identity constraints. Legacy attempts without a valid canonical chapter remain unattributed. No historical revision, mapping snapshot or answer is rewritten to simplify the calculation.

## Evidence and recommendations

New domain status uses unrounded ratios with **at least 10 answers and 3 distinct practiced questions**:

- Below either sample threshold: `INSUFFICIENT` regardless of apparent accuracy.
- At least 80%: `STRONG` practice evidence.
- Below 70%: `REVIEW`.
- Otherwise: `DEVELOPING`.

These are conservative descriptive labels, not a certification-readiness prediction. Official domain weights are read from the existing catalog and are never used as the learner's score.

The existing Skill Matrix retains its stricter **revision-bound + delivery-bound** cohort, existing available-question threshold and sample-weighted index. Its new summary derives from its existing supported scores and raw accuracy ratios, without changing framework rules. The UI explicitly explains the cohort distinction from all-committed-practice overview/domain counts.

Next-topic selection retains the existing simple rule: eligible available topic with either at least five answers below 70%, or remaining unattempted published questions. Review takes precedence; then lower accuracy/greater unattempted coverage; names and IDs stabilize ties. Fully covered high-accuracy topics are not suggested as coverage work. Explanations include actual counts/rates; no “AI” or hidden readiness score is claimed.

Resume actions link to the existing authenticated, unexpired session ID. Domain/topic practice links refer only to active eligible catalog records. History and exam links use existing routes; no GET creates a new session. New learners are directed to `/topics` or `/practice`; the existing `/exam` page remains reachable. No arbitrary/deleted question deep link is generated.

## Security, performance and UX

- Existing Clerk verification plus database `users` status/role remains authoritative. Even ADMIN users receive only their own learner aggregation. Query-supplied identity is rejected.
- SQL values are bound parameters; query shape/ranges are fixed, not concatenated user SQL. Runtime validation rejects impossible coverage/domain/timeline aggregates and strips unknown response fields.
- The read-only snapshot prevents cross-query cohort races; SQL statement timeout bounds each database statement. New aggregate lists are bounded to six domains, 120 trend buckets, latest one exam, and existing five recent sessions. Aggregation happens on the server, not by shipping the question bank to the browser. Query count is constant, not one application round trip per domain/question.
- Existing full topic analytics list remains compatible; very large custom-topic catalogs may warrant a separately versioned paginated API. No database timings, query-plan benchmarks or large-data load tests were invented.
- Session/user-scoped private query keys, zero retention on inactive private queries, abort signals, existing identity-change cache clearing and no placeholder transfer protect sign-out/account switches.
- The overview's new two-column grid uses existing paper/rust/teal tokens, collapses below 900px, and stacks domain cells below 430px. No speculative filler content, new image/chart dependency, shell rewrite or reduced existing navigation.
- Existing accessible tab keyboard behavior, progress bars, domain map/list and matrix radar/table remain. The short-term chart has exact keyboard-accessible values and does not connect zero-evidence gaps as zero scores.
- Selected-trend failures are local to that panel; the yearly calendar and other tabs remain usable. Skill/recent-answer retries are preserved. Loading metrics remain skeletons rather than invented zero readings.
- Localization follows existing English copy plus locale-aware numeric/date formatting and resolved learner timezone; there is no new parallel localization system.

## Actual verification

Baseline reused from the immediately preceding cleanup: application/schema/client TypeScript PASS; production frontend build PASS (1,952 modules). The three previously reported unrelated failing tests were not investigated, changed or selected in this task.

| Check | Final result |
| --- | --- |
| `node tools/run-curriculum-tests.mjs --command-center` | **138 passed, 0 failed, 9 files**; 37.08 seconds in the final run. Includes new projection/auth/UI tests and relevant existing Nexus, learning-evidence and cache regressions. |
| `node tools/check-admin.mjs` | **PASS**, exit 0: application, schema and client TypeScript using existing installed dependencies. |
| `node node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p lib/api-spec/tsconfig.codegen.json` | **PASS**, exit 0, including the new scoped generator configuration. |
| Scoped installed Orval generation | **PASS**, client and Zod generated successfully. Initial client generation encountered a filesystem sandbox restriction; rerun with explicit tool approval succeeded. No dependency installation or database access. |
| `node tools/build-admin-ui.mjs` | **PASS**, 1,954 modules, final output `.local/admin-ui-production-build/1793038941663`; 17.45-second build. Existing UI sourcemap-location and >500 kB chunk warnings remain. This is compile-only output, not deployment. |
| `node --check tools/run-curriculum-tests.mjs` / `git diff --check` | **PASS**, existing LF/CRLF policy warnings only. |
| Preservation checks | **PASS**: existing general generated files, lockfile, schemas/migrations and protected existing source outside the explicit feature allowlist unchanged. Removing only the newly appended contract blocks reconstructs the exact previous OpenAPI bytes/hash. |
| Desktop/mobile rendered interface | **NOT PERFORMED**. Browser/app inventory returned `apps:[]`, `browsers:[]`. No integration reconnection was requested. DOM interaction tests and responsive CSS inspection do not substitute for rendered layout checks. |
| Live PostgreSQL, API deployment, database constraints/query plans | **NOT RUN / NOT VERIFIED**. No database connection, migration or service restart. Private PostgreSQL cluster was not started. |

Tests cover new learner/no content, repeated and mixed attempts, unavailable/legacy mapping query constraints, canonical one-domain attribution without multi-objective fan-out, optional exam absence and terminal-only history, timezone/range validation, bounded buckets, contradictory aggregates, output sanitization, signed-out/disabled users, cross-user ADMIN isolation, no-store, five-tab preservation and keyboard operation, recommendations, loading, errors, retry and failed-trend containment.

SQL-shape/parameter tests and controlled mock rows verify the contract and query construction; **they do not prove PostgreSQL execution/aggregation semantics against real rows**, real DST transitions, concurrency behavior, permission catalogs or performance. Those remain integration verification tasks. One initial new test fixture syntax error was corrected; the final selection passes without changing the unrelated baseline failures.

## Local run and remaining activation requirements

No migration, grant, seed or data preparation is required for these source changes. Restart the existing API and frontend from their own terminals to load the updated source; do not terminate unrelated processes or rerun cleanup/reset tools.

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

In a second terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Enter existing credentials only at the launcher's hidden prompts, never in chat. Visit `http://localhost:8080/`. Verify all five tabs at desktop, tablet and mobile sizes; compare a real learner's counters to their persisted history and local-day boundaries. Check a recorded practice session/individual answer, topic movement, optional completed exam and account switch. These are instructions, not checks claimed executed here.

The optional Exam Simulator migration/permissions readiness remains governed by its existing separate approval workflow. This task neither applies nor requires promotion of that migration for practice/coverage/activity insights; exam statistics remain unavailable when its guard is false.

Recommended next work: perform authorized live read-only metric reconciliation and desktop/mobile visual QA, then consider period-over-period improvement evidence or chapter-level review prioritization only where persisted data supports it. No next phase was started. No commit or push.
