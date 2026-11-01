# CCNA NEXUS student experience

Submission behavior and new learning features are updated by [Learning progress and gamification](./ccna-nexus-learning-progress-gamification.md): Practice now defaults to final submission, the untracked payload uses `optionKey`, and untracked Finish is atomic. Pending migration 0008 adds achievement storage. The original delivery/session safeguards below remain in place.

Implementation: 15 October 2026. Workspace `<repository-root>`, branch `main`, HEAD `03b1452`. No application-database connections, migrations, grants, content edits or cleanup were performed during this implementation. Existing uncommitted work was retained.

## Delivered pages and design

`/`, `/practice` and `/practice/history` now share `NexusAppShell`: collapsible navy navigation, accessible mobile Sheet, skip link, visible keyboard focus, account menu and a real API health indicator. Admin access uses the database account role. Admin pages, Curriculum and Exam Simulator keep their existing routes and behavior; the Exam Simulator implementation was not changed for NEXUS.

Tokens in `nexus.css`: navy `#0B1628`, midnight `#10243E`, cyan `#22D3EE`, teal `#14B8A6`, blue `#3B82F6`, paper `#F7FAFC`, surface `#EEF4FA`. SVG topology illustrations are static and lightweight. White content panels, restrained borders, responsive grids and existing Lucide/Radix components provide the visual system. Reduced-motion preferences disable animation and transitions. No assets or dependencies were installed. Text remains English, following the current application; dates and numbers use browser locale conventions. No separate translation service was introduced.

`NetworkHero`, `NetworkTopologyMap`, `LearningMetricCard` and `LearningAnalytics` are shared components. The supplied textual design specification guided implementation; no unavailable reference image was represented as inspected.

### Command Center

- Clerk identity is displayed only when it matches the active account.
- Answer count, accuracy, unique questions and last activity come from the authenticated learner's actual PostgreSQL attempts. No readiness, mastery, streak or study-time values are invented.
- Six-domain topology uses the active **CCNA 200-301 v1.1** database catalog, with an accessible list alternative. Empty catalogs are reported, not fabricated.
- Coverage counts distinct currently available questions attempted; accuracy counts persisted submissions. Multiple objectives in one domain do not duplicate either denominator. Objective coverage describes catalog question associations, not learner mastery.
- Domain selection exposes a practice action and a real topic recommendation. Recommendations prioritize topics below 70% accuracy after five answers, then expand unattempted coverage. Topic-level metrics can span multiple domains, so these are suggestions rather than domain mastery scores.
- Reliable, unexpired sessions from the same Clerk sign-in can resume after the upgrade. Historical individual answers remain separate when session grouping is unavailable. Recent activity never invents session IDs.

### Challenge Arena

Builder filters domain, topic, difficulty and mode. Availability is queried from PostgreSQL; count must be an integer from 1 to the lesser of availability and 100. Review Mistakes selects currently available questions whose **latest answer by this learner** was incorrect. Unmapped questions remain eligible when no domain filter is selected.

Learn mode submits each answer for server feedback. Practice mode retains choices until explicit Finish confirmation. Review Mistakes uses immediate feedback. All modes reuse existing delivery creation, immutable revision capture and grading. No answer key or explanation is sent in an ungraded delivery.

The workspace includes numbered navigation, selected/submitted/flagged labels, mobile navigator drawer, previous/next controls, safe fenced CLI rendering and copy controls. CLI content is escaped text and is never executed. Busy guards prevent overlapping UI mutations. Selection writes complete before local state updates. Failures leave the last confirmed state intact; submitted answers cannot be changed.

Internal link navigation and page unload warn about unfinished work. Explicit Leave abandons a tracked session without removing attempts. Browser history navigation is not intercepted; tracked selections can resume while the original delivery and Clerk session remain valid. Untracked runs cannot survive leaving the page. No answers or private session payloads are stored in localStorage.

Results use server-returned grades, with counts, topic/domain breakdowns, flagged and incorrect revision review, Retry Mistakes and Return to Overview. Multi-domain totals can overlap. Retry Mistakes queries current own-history eligibility rather than guessing classifications.

### Learning Intelligence

Timeline supports 7 days, 30 days and all time (monthly buckets), using UTC PostgreSQL aggregates. Only recorded buckets are shown; gaps are not fabricated as zero accuracy. Exact dates, correct/total counts and small-sample labels accompany the chart. One bucket gets an honest insufficient-trend state. Header totals are all-time; the period selector controls the timeline.

Current domain mappings are explicitly distinguished from original delivery content. Unmapped available questions and unmapped historical answers are reported. Domain accuracy includes answer counts; no few-answer mastery claims appear. Searchable sessions use server pagination (10/25/50), escaped search and a 250 ms debounce. Session review reads the original revision and only discloses correct answers after server grading. The separate, cursor-paginated Individual Answer History retains existing legacy handling and explicitly labels unavailable original content.

## API and security

All new routes require the existing authenticated, active database user and a verified Clerk session. Mutations also require `X-Practice-Session` matching that verified session. User IDs never come from request bodies or query parameters. Responses disable caching; React Query keys include account and Clerk-session identities and are cleared on account transitions. In-flight local state updates check the captured identity lifetime.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/nexus/analytics?range=7\|30\|all` | Own totals, real domains/topics, timeline, recent sessions and reliable resume candidate |
| GET | `/api/nexus/availability` | Validated domain/topic/difficulty/mode filters and real eligible count |
| POST | `/api/nexus/sessions` | Validated configuration, count and UUID request ID; safe revision-bound deliveries |
| GET | `/api/nexus/sessions?page=1&pageSize=10&search=` | Own persisted runs, bounded pagination and search |
| GET | `/api/nexus/sessions/:id` | Own original deliveries, confirmed selections/flags and permitted feedback |
| PATCH | `/api/nexus/sessions/:id/selection` | `{questionId, optionKey, flagged}`; immutable after submission |
| POST | `/api/nexus/sessions/:id/answer` | `{questionId}`; immediate grading for Learn/Review Mistakes only |
| POST | `/api/nexus/sessions/:id/finish` | Atomic grading and completion after every question is selected |
| POST | `/api/nexus/sessions/:id/abandon` | Explicit terminal state without grading unanswered questions |

Existing practice, learning, Admin and Exam Simulator contracts remain available. Analytics batch aggregates and session list queries avoid per-row API or database calls. The availability topic selector is bounded to 500 matching topics; a future larger catalog will need searchable topic pagination. All current pilot topics fit this bound.

## Additive session model and migration

Proposed files, **not promoted or applied live**:

- `lib/db/drizzle/proposed/0007_nexus_sessions.sql`
- `lib/db/drizzle/proposed/meta/0007_snapshot.json`
- `lib/db/drizzle/proposed/meta/0007_journal.json`
- ORM models: `lib/db/src/schema/nexus-sessions.ts`, exported by the schema barrel.

`learning_sessions` stores owner, original Clerk session, unique per-owner request UUID, mode, status, normalized configuration, bounded count and timestamps. `learning_session_items` stores membership/order, composite owner/revision/question/delivery binding, selected option, flag and frozen domain associations. All history relationships use RESTRICT. Completed/abandoned timestamps must be non-null and no earlier than creation. No existing rows are backfilled, regrouped or rewritten. No existing taxonomy, curriculum, question or learner records are changed.

Session start uses an owner/request advisory lock and idempotency validation. Membership and publication state are rechecked under locks. Selection, grading, finish and abandon serialize through the session parent row with bounded lock/statement waits. Existing per-delivery grading remains idempotent. Finish runs grading and completion in one transaction; an error rolls back all new attempts from that Finish operation.

The `nexus_deferred_grading` trigger prevents the legacy answer endpoint from inserting early Practice-mode grades. It permits those inserts only within the owned Finish transaction. Closed tracked sessions cannot gain new attempts. Legacy deliveries with no session membership keep existing behavior. Previously submitted answers can still be replayed idempotently. The trigger function is SECURITY INVOKER with a pinned search path and no PUBLIC EXECUTE privilege. Runtime receives no DELETE or general UPDATE privileges on the new tables.

Existing controlled history deletion will be blocked by the new RESTRICT delivery relationship for session-bound records. NEXUS does not silently cascade, remove history, or change the Admin deletion implementation.

### Current database compatibility

With the existing seven-entry ledger and no new session tables, analytics and all three modes work through existing revision-bound delivery/answer infrastructure. The UI labels these runs **untracked**, disables reliable resume and retains submissions as individual history. Before 0007, Practice Finish now submits all selected deliveries through the atomic `/api/nexus/submissions` endpoint. Failed batches roll back new grades, and unchanged retries replay accepted results. This still does not invent persisted session grouping or resume.

After the approved upgrade, modes use persistent session membership, reliable same-sign-in resume, atomic Finish and paginated run review. The guarded launcher supports only the reviewed seven-migration state or exact promoted eight-migration state, with exact expected table inventory, source hashes, schema constraints and least-privilege validation. Partial installations fail closed. Initial provisioning safeguards remain unchanged.

### Upgrade approval and exact commands

**Do not run the following upgrade commands until explicit approval is given for migration 0007 and its runtime grants.** No approval was inferred from the implementation request. First stop the API and web foreground terminals with Ctrl+C and retain a verified existing backup. No new backup or database write was performed against the application during this task.

Offline checks (safe to run now):

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/promote-nexus.mjs --plan
node tools/check-admin.mjs
node tools/run-curriculum-tests.mjs
node --test tools/nexus-policy.test.mjs tools/phase6a-local/policy.test.mjs tools/phase6a-local/runtime-ledger.test.mjs tools/phase6a-local/upgrade.test.mjs
node tools/build-admin-ui.mjs
```

Only after approval:

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/promote-nexus.mjs --promote-source
if ($LASTEXITCODE -ne 0) { throw 'Source promotion failed. Stop.' }
powershell.exe -NoProfile -File tools/invoke-nexus-upgrade.ps1 -Apply
```

Promotion adds the exact reviewed official SQL/snapshot and one journal entry. It performs no database operations. Startup intentionally fails closed between source promotion and a successful database upgrade; this is a maintenance window. Do not retry or roll back source files blindly after a failure—inspect the sanitized stage first.

The upgrade command prompts privately for the known migrator password and never reads stored secrets. It verifies workspace/main/HEAD, exact local service/executable/listener, `127.0.0.1:5432`, `ccna_phase6a_dev`, migrator role and system identifier `7694701597474139084`. It checks exact seven-entry hashes/timestamps, unique positive ledger IDs, existing schema and immutable-history functions. Sequence-generated ID gaps are valid; the original IDs must remain identical after migration.

It locks all eleven existing application tables and the ledger, fingerprints all eleven tables and the question-code sequence, invokes the official Drizzle migrator through savepoint-bound transaction handling, verifies the complete eight-entry ledger, thirteen-table catalog, empty session tables, exact grading function and trigger, and unchanged original functions/data/sequence. Only then can it commit.

The **only new grants** in that same guarded transaction are:

```sql
GRANT SELECT, INSERT ON public.learning_sessions, public.learning_session_items TO ccna_phase6a_app;
GRANT UPDATE(status,completed_at) ON public.learning_sessions TO ccna_phase6a_app;
GRANT UPDATE(selected_option_key,flagged) ON public.learning_session_items TO ccna_phase6a_app;
```

No roles, old grants, permissions on history tables, PUBLIC privileges or existing data are changed. Runtime rejects table-wide UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER privileges on the new tables. There are no new sequences. A failed transaction rolls back the migration and grants; PostgreSQL's migration-ledger sequence can still advance. No automatic reset, destructive rollback or retry is implemented. The live operator wrapper and grant application have not been executed end to end; catalog/migration behavior was tested only in isolation and privilege rejection was tested offline.

## Validation results and limits

- Database-free learner/Admin/curriculum regressions: **521 passed across 38 suites** in the final completed run.
- Launcher, ledger, upgrade and new privilege-policy checks: **184 passed**.
- Real PostgreSQL 18.6: **1 passed, 9 intentionally skipped** in the selected Nexus group. The group verifies: official Drizzle migration and repeat-run behavior; complete table/column/constraint/index/enum catalog compared with the proposed snapshot; exact trigger binding; no pre-grade keys; idempotent start/finish; persisted selection/flag; original revision after current-question edit; cross-owner rejection; different-sign-in resume refusal; Learn/Practice/Mistakes semantics; own history pagination; legacy answer compatibility; all six domain metrics; duplicate objective mappings; unmapped counts. Rollback-only fixtures in the existing `ccna_drizzle_check_20261012_c08f12ad34b6` on `127.0.0.1:55440`. No connection to either populated rehearsal database or application database. Temporary exact-owner HBA allowance restored byte-for-byte. New schema and ledger row rolled back; empty original tables and original seven-entry ledger checked afterward. Only disposable sequence values may advance.
- TypeScript: API, web, schema and client passed. JavaScript syntax checks and PowerShell AST parsing passed without executing the upgrade wrapper. Inert promotion plan passed.
- Production compilation passed with Admin and all three NEXUS route markers included; final artifact `.local/admin-ui-production-build/1792042820144`. The compile-only artifact uses an unset runtime Clerk-key reference, loads no secret/environment files and is not a deployment build. Existing non-fatal Radix source-map and bundle-size warnings remain.
- No signed-in browser inspection, visual viewport inspection, live endpoint test, live migration or real learner session was performed. DOM tests cover interactions; keyboard/screen-reader behavior and mobile layout still need manual browser acceptance. Multi-connection race stress tests were not executed; database row/advisory locks and delivery idempotency are used.
- No study time, streak, readiness model, interactive lab or AI recommendation service is claimed. Image keys are not rendered as arbitrary URLs; safe text/CLI content is supported.

## Local startup and manual acceptance

The redesigned pages can run before migration in the explicitly labelled untracked mode. If the old servers are already open in your own foreground terminals, stop those terminals with Ctrl+C. Do not kill unrelated processes or rerun cleanup.

Terminal 1:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Terminal 2:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Enter each role's own password and existing Clerk development keys only at the hidden local prompts. Keep both terminals open. Do not send secrets in chat.

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/healthz'
Start-Process 'http://localhost:8080/' -WindowStyle Hidden
```

Sign in normally. Inspect `/`, `/practice`, `/practice/history`. In DevTools Network, verify authenticated `/api/nexus/analytics` and `/api/nexus/availability` responses. Inspect counts against your own account; six domains should come from the existing catalog, never synthetic UI defaults. Check topology/list keyboard controls, real availability, Learn grading, selected-answer navigation, flags, explicit Finish, original revision history and zero-answer states. After the approved upgrade, additionally refresh an active run through Continue Learning, confirm persisted choices and session history, and verify cross-sign-in resume refusal. Check mobile navigation and 320/768/1440 px layouts manually.

Admin `/admin/questions`, `/admin/topics`, `/admin/taxonomy`, `/admin/import` and `/exam` retain their existing supported workflows. No pilot record was used as an implementation test fixture.

## Source file inventory for this task

New frontend: `components/nexus-shell.tsx`, `components/nexus-visuals.tsx`, `pages/nexus-overview.tsx`, `pages/nexus-practice.tsx`, `pages/nexus-history.tsx`, `pages/nexus.test.tsx`, `lib/nexus.ts`, `nexus.css` (under `artifacts/ccna-learning/src`). Modified `App.tsx`, the history component export and learner cache isolation.

New backend: `artifacts/api-server/src/lib/nexus.ts`, `lib/nexus.test.ts`, `routes/nexus.ts`; router registered in `routes/index.ts`. Shared client `lib/api-client-react/src/nexus.ts` and barrel exports; schema model/barrel and three proposed migration/metadata files listed above.

New tooling: `tools/nexus-policy.mjs`, `tools/nexus-policy.test.mjs`, `tools/prepare-nexus-migration.mjs`, `tools/promote-nexus.mjs`, `tools/execute-nexus-upgrade.mjs`, `tools/invoke-nexus-upgrade.ps1`. Modified the existing safe test/build runners, isolated fixture suite, and launcher `policy.mjs`, `upgrade.mjs`, `run.mjs` for the exact optional future schema. Added narrowly scoped LF attributes for the new pinned sources. This document is new. Unrelated pre-existing changes were not reverted or committed.
