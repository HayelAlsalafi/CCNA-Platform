# Phase 8A.1 committed cleanup: retained content verification

Verified on 2026-10-13, workspace `<repository-root>`, branch `main`, HEAD `03b14526aae448e49eacd602a43bfb0e355aca4d`. This follow-up performed no database connections, writes, cleanup retries, process termination, schema changes or UI changes.

## Evidence and limits

Committed report: `.local/phase8a-cleanup/2026-10-13T15-59-16-134Z/report.json`, `committed:true`, `stage:complete`.

The consistent **before-cleanup** archive was independently SHA-256 checked and decoded into memory with PostgreSQL 18.6 `pg_restore --file=-` (no `--dbname`, no SQL execution). Hash: `de76195778fbe3a57d940892ee71f1904ec3d94aa6c8fd8d773657d438ce1d13`, 173510 bytes. No database restore was tested. Post-cleanup statuses below derive from the committed plan, affected-row counts and unchanged-record checks, not a new live catalog query.

Metadata-only inventory of all 75 retained question UUIDs, all 78 extra topic UUIDs and their dependency counts: [.local/phase8a-retention-review.json](../../.local/phase8a-retention-review.json). No answer choices, keys, passwords, connection strings or user identities are included. The offline analysis script is `.local/phase8a-retention-review.mjs`; it refuses to overwrite its inventory. Neither artifact connects to PostgreSQL.

## Inventory and provenance

| Fixture topic name | Retained questions | Extra topics | Provenance |
| --- | ---: | ---: | --- |
| Local interface demo | 1 | 1 | Previously approved initial demo classifier; exact topic UUID also appears in Phase 6A.4 local smoke targets |
| Disposable revision test | 53 | 56 | `artifacts/api-server/src/lib/question-revisions.db.test.ts`, `fresh()` creates `revision-q-*` topics |
| Renamed after attempt | 3 | 3 | Same persistence test deliberately renames topics after grading |
| Disposable revision integrity fixtures | 3 | 3 | Same test's `beforeAll()` creates `revision-test-*`; moving questions retains original snapshot topic references |
| Disposable live race demo | 12 | 12 | `.local/tests/phase6a7/browser-race-smoke.mjs`, `local-live-race-*` |
| Edited disposable smoke | 1 | 1 | `.local/tests/phase6a4/browser-smoke.mjs` and exact UUIDs in `browser-smoke-result.json` |
| Renamed revision demo topic | 1 | 1 | `.local/tests/phase6a5/browser-revision-smoke.mjs` and exact UUIDs in `browser-result.json` |
| Disposable Clerk session topic | 1 | 1 | `.local/tests/phase6a6/browser-session-smoke.mjs`, exact question/topic UUIDs and validation report |
| **Total** | **75** | **78** | All retained legacy questions and topics are DISABLED |

The original planner recognized only three approved exact names. It classified 66 questions/69 topics as confirmed and protected, and left nine questions/nine topics unresolved. The source/backup follow-up identifies those nine as the renamed/integrity/smoke fixtures above; no statuses were changed during this review. They were already DISABLED before cleanup.

The report's `drafts:75` means `status='DISABLED'`; the existing two-state question model also uses DISABLED for retired fixtures. These are not 75 newly imported educational drafts. The pilot remains 60 ACTIVE questions on 24 ACTIVE topics. Physical totals therefore remain **135 questions and 102 topics**.

### Previously unresolved question records

| Question code | Fixture | Revisions | Deliveries | Attempts |
| --- | --- | ---: | ---: | ---: |
| CCNA-Q-000002 | Edited disposable smoke | 0 | 0 | 2 |
| CCNA-Q-000005 | Renamed after attempt | 4 | 1 | 1 |
| CCNA-Q-000012 | Revision integrity fixtures | 2 | 1 | 1 |
| CCNA-Q-000024 | Renamed after attempt | 4 | 1 | 1 |
| CCNA-Q-000031 | Revision integrity fixtures | 2 | 1 | 1 |
| CCNA-Q-000042 | Renamed revision demo topic | 3 | 3 | 2 |
| CCNA-Q-000043 | Clerk session fixture | 1 | 5 | 3 |
| CCNA-Q-000046 | Renamed after attempt | 4 | 1 | 1 |
| CCNA-Q-000053 | Revision integrity fixtures | 2 | 1 | 1 |

Full UUIDs and topic references are in the metadata inventory. Classification identifies provenance; it does not authorize removing history.

## Why nothing was physically deleted

All 75 legacy questions are protected: **74 have immutable revisions; the one without revisions (CCNA-Q-000002) has two immutable attempts**. Forty-one legacy questions have attempts and 64 have deliveries; these subsets overlap. Their history totals are 163 revisions, 99 deliveries and 53 attempts. The full backup has 223 revisions, 116 deliveries and 67 attempts, including pilot history.

Migration `0004_question_revisions.sql` restricts revision-to-question deletion and makes revisions, deliveries and attempts append-only. `practice-attempts.ts` also restricts deletion of the question/topic referenced by older attempts. An unused initial revision is sufficient to block question deletion; having no attempts does not make it removable.

Of 78 extra topics, 75 still have current questions, 77 appear in revision snapshots and 41 have direct attempts. Three have no current questions because a test moved its question, but still have history references. **Zero extra topics are unreferenced.** Snapshot references are an additional cleanup preservation invariant, even though the UUID inside JSON is not itself an ordinary topic FK.

Consequently both planned deletion sets were empty. The cleanup did not attempt physical deletions and silently ignore errors; it deliberately retained dependency-bearing parents. Only two previously ACTIVE legacy questions and five previously ACTIVE extra topics needed disabling. The other retained fixtures were already disabled.

The committed report verifies zero orphans and unchanged pilot content/options/mappings/IDs, users/history/taxonomy, question sequence, migration ledger and schema. All six database blueprint domains remained intact; the navigation configuration retained all 33 chapters. Chapters are versioned navigation configuration, not database chapter rows.

## Visibility and selection verification

| Check | Actual result / limit |
| --- | --- |
| Live GET `/api/healthz` through port 8080 | HTTP 200 |
| Live GET `/api/topics` | HTTP 200; exactly 24 topic UUIDs match reviewed Sprint 7 bindings; zero missing, extra or legacy topics |
| Live topic/dashboard counts | Incorrectly report zero questions (`/api/dashboard/summary`: 24 topics, 0 questions). Current source aggregates ACTIVE questions; running backend has not picked up that correction, or differs from current source. No restart was performed during this read-only follow-up |
| Practice population | Committed guarded report: exactly 60 eligible questions. `getPracticeQuestionForTopic()` filters ACTIVE question AND ACTIVE topic; no legacy eligible question remains |
| Live practice delivery/grading | NOT RUN: even GET delivery inserts a revision/delivery. No verification writes were authorized in this follow-up |
| New Exam Simulator sessions | Live Vite GET `/src/pages/exam-simulator.tsx` returned 200 and serves `NEW_DEMO_SESSIONS_ENABLED = false` plus the unavailable message. Database-backed exam delivery is absent. It cannot be reported as selecting the 60 pilot questions |
| Learner history/progress | Disabled legacy records can still appear in the owning learner's historical attempts/progress; deliberately preserved and not offered as new practice |
| Admin questions/topics | Retained DISABLED records remain visible in all-status Admin lists. Questions support the existing ACTIVE filter; topics list all rows. Mapping report also includes disabled topics for Admin review |
| Authenticated curriculum/Admin mapping | Unauthenticated probes return HTTP 401 as expected; signed-in responses and rendered browser state were NOT independently verified |
| Six domains/33 chapters | Verified by committed preservation evidence, offline backup's six official domains and current navigation configuration/tests; not claimed as a new authenticated live response |

The current guarded API launcher imports `artifacts/api-server/src/app.ts` once through `tsx`; it does not install a backend source watcher. Listener inspection found loopback API port 3000 PID 26980 and frontend port 8080 PID 33172 at review time. PIDs are observations, not permission to stop either process. An approved ordinary restart using `tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start` loads current source after the existing API is stopped deliberately. Never run cleanup again to fix cached counts. Refresh browser tabs after the runtime is updated.

## Two unmapped published pilot questions

| Pilot item | Database question code | UUID |
| --- | --- | --- |
| S7-D6-Q09 | CCNA-Q-000134 | 75cff223-7d98-49c0-8fe9-c063b88b6f49 |
| S7-D6-Q10 | CCNA-Q-000135 | aeb5dbd3-68c3-4dce-80c4-01e69d9b3685 |

Both use topic `64a4f3e7-e4af-4152-8c45-707680a55d26`, slug `ccna-v1-1-s7-ai-network-operations`, title **Predictive and generative AI in operations**. Both retain the reviewed primary objective **6.4** in blueprint domain **6.0**; the committed executor checked their actual objective assignments before and after cleanup.

They are unmapped only at the navigation chapter layer: `topicChapterBindings` in `artifacts/api-server/src/lib/curriculum-config.ts` has 23 pilot slugs and omits this AI slug. No configured chapter specifically covers AI. This produces 58 mapped questions but 60 available/Practice-eligible questions. It is not lost question data or missing objective taxonomy. Keep both questions published; do not delete or relabel their objective to force a chapter count.

## Smallest safe next corrections and blockers

1. Load the existing corrected API source through an approved normal service restart, then verify topic/dashboard totals of 60 and refresh browser caches. This requires no database cleanup.
2. If all 60 must appear in the 33-chapter explorer, agree an appropriate existing automation chapter for the AI topic, then make one explicit, tested slug binding. No automatic assignment or chapter deletion is justified; the chapter fit requires review. This review made no mapping change.
3. **Physical 60-question/24-topic inventory is blocked under the current preservation rules.** Broadening the name classifier or rerunning cleanup cannot remove any of these 75 questions/78 topics. Achieving that physical inventory requires a separately reviewed, versioned archival/history-reference design that preserves original identifiers, snapshots, attempts and deliveries while decoupling their catalog parents. It must not disable RESTRICT/immutability checks or delete historical rows. Until such a change is expressly authorized and tested, retain the disabled parents. Filtering Admin lists would improve presentation but would not achieve permanent removal.
4. The Exam Simulator's database-backed selector is a separate missing feature; no Phase 8B work was started.

## Validation

`node tools/run-curriculum-tests.mjs`: **222 passed, 0 failed, 20 files** (database mocked; no environment files). Initial sandbox run could not load installed tooling due to filesystem restrictions; rerun outside that sandbox passed. Offline archive hash/decode and reference counts passed. `node --check .local/phase8a-retention-review.mjs` and `git diff --check` passed. No build or database integration test was run in this follow-up, which changed only review documentation and local offline inspection artifacts.
