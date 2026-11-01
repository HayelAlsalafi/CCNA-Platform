# Exam Simulator implementation — 2026-10-19

## Current status

The existing NEXUS shell remains the single persistent workspace layout. The Exam Simulator source now uses authenticated APIs and persistent PostgreSQL exam models; it no longer starts the retired in-memory demo. Phase 2 source work continued after the user's instruction to continue.

**Database rollout is blocked and has not occurred.** The guarded isolated test command stopped before a connection because no server was listening on 55440. The user explicitly chose to leave that private cluster stopped. It was not started, no HBA changes were made, and no exam SQL, fixtures, migrations, grants or deletions were executed. PostgreSQL constraint enforcement, transaction behavior, migration repeat behavior and real runtime privileges remain NOT VERIFIED. No source-only result is claimed as proof of persisted PostgreSQL behavior.

The official 0000–0011 migration files/journal are unchanged by this work. Migration 0012 exists only under `lib/db/drizzle/proposed/`, with proposed snapshot/journal and exact hashes. Until it is verified and separately approved/applied, the Exam setup displays real eligible published counts but disables starting with a clear migration/permissions notice. No questions, topics, chapters or learning history were seeded, reset or changed.

## Implemented source behavior

- Exam setup reads eligible counts from existing ACTIVE questions, ACTIVE topics and canonical chapters/domains; it supports question count 1–100, duration 5–180 minutes, multiple domain filters, optional searchable chapter filters and a useful empty bank state. Selection is uniform random practice, not a claim to reproduce Cisco distribution/scoring.
- Transactional creation rechecks eligibility after acquiring question/topic locks, captures immutable revisions and chapter/domain metadata, and persists randomized positions. Owner/request UUID uniqueness plus an advisory transaction lock make identical creation retries idempotent; changed configuration with the same request ID is rejected.
- Exam-only delivery IDs are separate from Practice deliveries. Existing Practice endpoints cannot grade an exam delivery as a shortcut to obtain early feedback. Existing Practice attempts/history/evidence are not generated or modified by exam submission.
- An exam URL contains its stable session ID and optional current question position for refresh/back/forward. The server supplies saved selections, flags and answer versions. Controls use radios for single-answer questions, checkboxes for multiple answers, and support clearing an answer and marking it for review.
- Failed saves retain the local draft, prevent assumed success and block question navigation/submission until retry or explicit reload. Pending/failed work triggers unload/navigation warnings. Requests and cache entries are scoped to the real Clerk user/session; old exam caches are removed during existing account/session cleanup. No fake authentication was added.
- Save and submit lock the owned session, then read PostgreSQL's clock after acquiring that lock. Answers are rejected at/after the deadline and after submission. The browser timer is display only. Expired exams finalize using saved server answers through the same idempotent submission API; a closed tab needs no background job to enforce the write deadline. Grading is persisted when the learner next finalizes/resumes.
- Equal-weight, complete-set grading: one point for an exact answer set, independent of selection order; no partial credit. Empty arrays are unanswered; incomplete nonempty sets are incorrect. Result totals, percent, effective elapsed time and chapter/domain breakdowns are stored, with original revision feedback available only after finalization. No official passing score is invented.
- Own exam history is paginated (10 entries/page), with stable descending start/UUID ordering. Other-owner and absent IDs both return 404. ADMIN does not gain cross-learner history access through these learner APIs.

## Schema and migration

The two new exported Drizzle models are `exam_sessions` and `exam_session_items`. See the reviewed design in `nexus-unified-shell-and-exam-plan.md` for field details. The implemented model uses one `finalized_at` as the effective finish time (the deadline for expired exams), not a separate processing timestamp. History uses bounded page pagination rather than a cursor in this initial implementation.

The proposed migration adds two tables, indexes, CHECK/RESTRICT FK constraints and state/answer guard triggers. It extends controlled question deletion by renaming the old internal core, wrapping it with exam handling, and explicitly rebinding the existing public deletion wrappers while preserving their existing permissions. No migration-time content DELETE/TRUNCATE/DROP TABLE or disabled FK/trigger operations are present. Existing chapter and Practice table definitions are unchanged in the proposed Drizzle snapshot.

Runtime operations use bounded application-role transactions with narrow column UPDATE permissions and database guards, rather than new SECURITY DEFINER answer/grading functions. The only new SECURITY DEFINER operation is the controlled Admin deletion extension. `guard_exam_state` is a normal trigger function with PUBLIC execution revoked.

`tools/exam-runtime-grants.sql` is an **inert, unexecuted proposal**, not a complete migration/backup runner. It requires the exact local host/port/database/system identifier, migrator owner/role attributes, exact duplicate-sensitive thirteen-entry ledger equality, function body fingerprints and ownership, and grants only:

- SELECT and INSERT on the two new exam tables.
- UPDATE(status, finalized_at, result) on exam_sessions.
- UPDATE(selected_keys, flagged, answer_version, graded_result) on exam_session_items.

It grants no DELETE, TRUNCATE, REFERENCES, schema CREATE, sequence permissions, general table UPDATE or access to the restricted deletion-recovery audit. Future launcher support accepts the exact thirteen-entry source/snapshot/table/function/privilege inventory only after official source promotion; the current twelve-entry runtime remains unchanged. Guard checks include exam trigger identity, function body/owner/search path and public/column privilege refusal. These checks have offline regression coverage; actual PG behavior is blocked, not certified.

## Controlled deletion compatibility

Admin dependency previews include exam delivery and shared-exam counts. The preview hash includes exam item evidence and is invalidated if answers/flags/versions change before confirmation. Lock order is exams, existing Practice sessions, then questions. Interactive history evidence remains capped at 50,000 combined records.

Ordinary deletion cannot remove a question with exam history. The separate destructive history confirmation is required and describes the consequences. Under that existing authorized workflow, the proposed function writes restricted recovery evidence, redacts only selected question slots into tombstones, and delegates physical question/revision/options/attempt deletion to the existing audited core. Shared exam/session rows and unrelated question slots remain. Active exams with removed content cannot be graded; completed exams retain their immutable aggregate score and show partially redacted review. No actual Admin deletion was executed or tested against real records.

## Registered API routes

All routes are mounted by the real Express API router at `/api/exams`, use existing active-account authentication, set `Cache-Control: no-store`, and take the owner from `req.dbUser`. Mutation requests require the existing matching `X-Practice-Session` header derived from the current real Clerk session.

| Method/path | Purpose |
| --- | --- |
| GET /api/exams/availability | Published eligibility/counts, canonical filters and feature readiness |
| POST /api/exams | Idempotent owned creation |
| GET /api/exams | Own paginated active/completed history |
| GET /api/exams/:id | Own saved session with redacted active delivery DTOs |
| PATCH /api/exams/:id/items/:delivery | Versioned answer/review-flag save |
| POST /api/exams/:id/submit | Server grading/finalization, including expiration and repeat-safe results |
| GET /api/exams/:id/result | Owned terminal result; active result requests are rejected |

Before finalization, responses contain neither correct-option flags/keys nor explanations or reference notes. Runtime/DB errors return sanitized codes/messages, never raw SQL, credentials or driver messages. No production or application database requests were issued to verify these routes live; route tests use real Express routing/auth middleware with the repository's test-only Clerk/database fixtures.

## Files changed for Phase 2

- API: `artifacts/api-server/src/lib/exams.ts`, `src/routes/exams.ts`, `src/routes/index.ts`, their focused test files; exam-aware `src/lib/admin-history-delete.ts` and tests.
- Frontend: `artifacts/ccna-learning/src/pages/exam-simulator.tsx`, new `exam-workspace.css` and `exams.test.tsx`; retired-demo regression updated in `legacy-cleanup.test.tsx`; exam dependency counts in `components/admin-delete-controls.tsx`; private exam-cache cleanup in `lib/learning-progress-cache.ts` and tests.
- Shared API client: `lib/api-client-react/src/exams.ts` and its index export.
- Schema/proposal: `lib/db/src/schema/exam-sessions.ts` and index export; `lib/db/drizzle/proposed/0012_exam_simulator.sql`, proposed 0012 snapshot/journal. No official migration/journal promotion.
- Safety/tooling: `tools/exam-guards.sql`, `prepare-exam-metadata.mjs`, `exam-migration-manifest.json`, `exam-policy.mjs` and static tests, `exam-runtime-grants.sql`, `exam-disposable.db.test.ts`, `exam-db.config.mjs`; scoped future-version updates to local policy/run/upgrade and question-bank function checks; test inventory extension in `run-curriculum-tests.mjs` and existing policy test fixture.
- Documentation: this implementation status and the existing shared-shell/exam design link. Existing lockfile and unrelated uncommitted work are preserved. No installations, commits or pushes.

## Safe local verification

Database-free commands (no credentials or environment files are loaded):

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/run-curriculum-tests.mjs --exams
node tools/run-curriculum-tests.mjs
node --test tools/exam-policy.test.mjs tools/phase6a-local/runtime-startup.test.mjs tools/phase6a-local/runtime-ledger.test.mjs
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

Do not run `--exam-db` while the private cluster is stopped or without approval to use its exact existing disposable target. The prepared runner verifies marker/PID/executable/listener, owner, version, canonical directory, pinned SQL and the existing empty seven-entry baseline, applies remaining migrations through the actual Drizzle migrator inside an outer rollback transaction, uses only synthetic fixtures, and restores HBA bytes. It refuses another state rather than resetting/reusing populated data. A future successful run can advance only the disposable question-code sequence; it does not rewind that sequence.

To load the source routes for an authenticated manual review, restart the existing API in its own terminal (Ctrl+C there; do not kill unrelated processes), then run the established launcher. Keep credentials in the hidden local prompts:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

In a second terminal:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Open `http://localhost:8080/exam`. With migration 0012 unapplied, the migration/permission notice and disabled Start are expected. Startup cannot apply migrations or grants. Seeing that notice is not a persisted-exam acceptance test. No signed-in browser verification is claimed.

## Remaining gate

1. User currently requires the private cluster to stay stopped; honor that decision. PostgreSQL verification remains blocked.
2. If later authorized, verify an appropriate existing isolated target and run the prepared migration/workflow fixtures, schema/constraint and runtime-role privilege checks. Add two-connection race testing with separately approved disposable fixture handling; the current rollback-only runner does not prove concurrent connection behavior.
3. Before active deployment, present a reviewed migration/permission impact, exact raw source hashes and ordering, verified target identity/current schema/ledger, and a fresh full backup with integrity checks plus tested isolated restoration. A complete guarded application migration/promotion command still needs to be prepared/verified after those isolated results. Do not manually copy the proposal into the official journal or execute its SQL to bypass this gate.
4. Obtain separate explicit approval for applying migration 0012 and its exact runtime grants to the existing development database. The user has not granted it in this task. After execution, verify the actual thirteen-entry ledger, schema, privileges and persisted end-to-end exam workflows. Do not claim production readiness from the offline tests.
## Actual validation results

- Full application database-free regression: **747 passed, 0 failed**, 52 files. This includes the updated deletion-preview fixture and added exam-aware history/cache regressions.
- Final focused exam/API/UI/navigation/deletion/cache run: **90 passed, 0 failed**, eight files (overlaps the full suite).
- Offline source/launcher/ledger/privilege guard tests: **181 passed, 0 failed**. The stale policy-test inventory expectation was updated to the existing twelve-entry baseline and the exact proposed thirteen-entry version; production identity/hash/schema checks were not bypassed.
- API, frontend, schema and API-client TypeScript: **PASS**.
- Final frontend production compilation: **PASS**, 1952 modules, output `.local/admin-ui-production-build/1792437070004`. Existing UI source-map and large-chunk warnings remain.
- Proposal snapshot consistency: adds exactly two tables, preserving the entire previous snapshot. Node source syntax and static SQL source/metadata/hash checks passed. The SQL parser/constraints have **not** been tested by a PostgreSQL server.
- Isolated PostgreSQL command: **BLOCKED at listener preflight** (one attempted test command exited with a failed preflight; no PostgreSQL assertions or SQL executed). Port 55440 was not listening. The user declined starting the cluster; it was left stopped and no HBA file was changed.
- Actual migration/grant application, PostgreSQL FKs/triggers, transactional persistence/rollback, real runtime privileges, two-connection save/submit races, full backup/restore of the current application database, and authenticated live browser acceptance: **NOT VERIFIED / NOT RUN**. They cannot be described as passed or production-ready.

Final proposed migration 0012 raw SHA-256:

```text
a371c060f9d712c1ea00934f01d7ff2899af370c7ab216b009bdd0610c1291ea
```

The manifest also pins the proposed snapshot and journal. Scoped LF rules in `.gitattributes` preserve these exact migration bytes on Windows; no historical SQL is normalized or rewritten by this task. The inert grant proposal uses that migration hash and duplicate-sensitive bidirectional EXCEPT ALL ledger equality. It has not been executed or certified by PostgreSQL.

The next required development action is verification of the proposed migration and runtime role in an explicitly available, approved isolated PostgreSQL environment. Until the user changes the instruction to keep the current private cluster stopped, that step remains blocked. Do not create another target or weaken preflight to proceed. After successful isolated verification, prepare and review the concrete guarded backup/promotion/apply procedure and obtain active-database execution approval. No such approval is implied by this report.
