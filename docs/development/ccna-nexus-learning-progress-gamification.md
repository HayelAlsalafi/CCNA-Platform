# CCNA NEXUS: learning evidence, achievements and final submission

Implemented 15 October 2026 in `<repository-root>`, `main`, HEAD `03b1452`. This extends the existing NEXUS implementation; it does not replace Admin, Curriculum, Exam Simulator, Clerk or the question system.

No application-database connections, migrations, grants, question edits, cleanup, commits or pushes were performed during implementation. The user-reported baseline of 60 published pilot questions, 24 topics, six domains, 53 objectives and 33 chapters was not used as test data or modified. Existing uncommitted work was retained.

## Implemented experience

The Command Center `/` now includes Yearly Activity and an interactive CCNA Skill Matrix. `/profile` provides the authenticated learner's identity, verified learning summary, yearly calendar, skill evidence, earned/locked badges, precise eligibility progress and recorded achievement milestones. The NEXUS sidebar links to the profile. These pages reuse React Query, Lucide, Radix, Tailwind and the existing navy/cyan visual language; no new dependencies were installed.

The calendar has 365/366 real Gregorian dates, month/weekday labels, five intensity levels, year navigation, horizontal scrolling, focusable tooltips and arrow-key navigation. Blank alignment cells are not fabricated dates or events. Levels are 0, 1–4, 5–9, 10–19 and 20+ recorded events. Exact answer/session counts accompany every date. A new learner receives an honest zero-activity state, not sample contributions.

The radar has six configured CCNA axes, selectable domain controls, exact accuracy/coverage/answer counts and an accessible table alternative. Unsupported scores are omitted rather than plotted as zero. A filled area is shown only when all six axes have sufficient evidence. Cards and tooltips explicitly describe an evidence index, never mastery or exam readiness.

Badge cards use persisted award timestamps to distinguish earned from locked. They show exact conditions and progress; eligibility alone does not fabricate an award. The gallery includes a nonintrusive, authenticated “Check earned badges” action. GET requests do not run award processing. Existing authentication middleware can still update normal user-login metadata; those updates are not learning events.

## Submission defect: exact cause and fix

`artifacts/ccna-learning/src/pages/nexus-practice.tsx` originally sent this body from the untracked Learn/finish fallback:

```json
{"selectedOptionKey":"A","deliveryId":"<delivered UUID>"}
```

The existing route `POST /api/practice/questions/:questionId/answer` in `routes/practice.ts` validates `SubmitPracticeAnswerBody.strict()`, whose required field is **`optionKey`**. It therefore returned `A valid optionKey is required.` before grading. The delivered option identifiers and revision snapshots were correct; this was a request-field mismatch, not an A/B/C/D-versus-UUID mismatch.

The Learn fallback now sends `{optionKey, deliveryId}` with the exact selected identifier from `question.options`. No arbitrary key conversion, validation relaxation, current-question answer-key lookup or authentication bypass was added. A UI regression submits the actual payload to the same Zod schema used by the backend. PostgreSQL tests reject a nonmember key and verify complete rollback.

## Final-question workflow and failure recovery

**Practice is now the default mode.** Its choices remain editable during navigation; Previous/Next, numbered status and flags preserve selections. There is no per-question grading action in Practice. **Finish & Submit appears only on the final question** and remains disabled while any question is unanswered. The final page offers a jump to the first unanswered question, alongside the full navigator. Finish always requires an accessible confirmation dialog.

Learn is an explicit immediate-feedback alternative with “Check answer (Learn mode)”. Guided Review Mistakes likewise has an explicit check action. Neither navigation nor selection automatically grades. Checked answers in these modes become immutable. Their difference from final-submit Practice is explained in the builder instead of silently changing mode semantics.

For an installed 0007 session, selection is saved through the existing owned PATCH endpoint. Finish reads confirmed server selections and grades within the existing session transaction. Parent locks, per-delivery locks and the delivery uniqueness constraint preserve idempotency. Original attempts and question revisions remain authoritative.

For the current **untracked** database state, the former client-side sequential grading loop has been replaced by `POST /api/nexus/submissions`. It accepts 1–100 unique `{questionId,deliveryId,optionKey,flagged}` entries. The server:

1. Validates the strict request shape and verified Clerk session.
2. Locks delivery IDs in deterministic order, with bounded waits.
3. Verifies each delivery's owner, original sign-in, question and immutable revision.
4. Rejects tracked membership; those deliveries must use their own session Finish route.
5. Reuses the original server grader inside one outer transaction.
6. Rolls back **all new grades** if any selection, delivery or constraint fails.
7. Returns only original-revision content and persisted server feedback after successful completion.

Identical retries replay the accepted delivery results. Changing an accepted answer produces `SUBMISSION_CONFLICT`, without rewriting history. No artificial session ID or historical session grouping is invented. Untracked runs still cannot resume after leaving the page; their individual saved answers remain available in history.

The UI prevents overlapping operations. Once final submission is attempted, an uncertain/network/500 response leaves choices locked so retries use the same payload; success is not assumed. A confirmed validation 400 unlocks editing. Learn similarly preserves an uncertain submitted choice. Navigation is still available for review. An expired or unavailable delivery may require leaving and starting a fresh run; no reset or overwrite is attempted. Refreshing an untracked run cannot recover its ephemeral grouping.

## Activity definitions and learner timezone

Events are projected from existing authoritative records, without a speculative activity table:

| Kind | Current authoritative source | Available now |
| --- | --- | --- |
| `ANSWER_SUBMITTED` | One row in `practice_attempts` | Yes |
| `PRACTICE_COMPLETED` | One `learning_sessions` row with status `COMPLETED`, using `completed_at` | After 0007 |
| `LESSON_COMPLETED` | Future server-validated lesson completion | No |
| `LAB_COMPLETED` | Future server-validated lab assessment/completion | No |

One answer plus one completed session counts as two different learning events. Replaying a submission does not create another attempt or completion. Starts, flags, page visits, profile opens and badge checks are not activity events. No study duration or inferred legacy session is produced.

The web client sends its browser-resolved IANA timezone. The server validates it using Intl and PostgreSQL's timezone catalog. Year bounds are local January 1 to the following January 1 converted to UTC; stored timestamps are grouped into local dates with `AT TIME ZONE`. The day series uses calendar dates rather than fixed 24-hour increments, so DST and leap days do not lose or duplicate dates. The fixed Gregorian calendar is independent of browser month-label localization.

Timezone is a display/evaluation context, not a new user-settings table. Travel or an OS timezone change rebuckets activity on the next request. Award evidence records the timezone used at evaluation; earned awards are retained even if current eligibility later differs. API event hooks without `X-Learner-Timezone` use UTC; the current browser client sends the header. Award timestamps record processing time, not a guessed historical first-qualifying date.

All recorded answers, including legacy records, remain visible in yearly activity and existing answer history. **Skill and badge evidence uses only revision-and-delivery-bound answers** plus reliably completed sessions. Unbound legacy answers are counted separately and never silently relabelled as verified evidence. Consequently a legacy-inclusive calendar streak may differ from the verified streak used for a badge.

## Transparent CCNA skill framework

`skillFrameworks` is a code registry separate from the official taxonomy. The current registered framework is `ccna-practice-evidence.v1`, with evidence adapter `ccna-objective-map.v1`, scoring rule `question-evidence.v1` and the configured CCNA 200-301 v1.1 domain codes 1.0–6.0. No taxonomy definitions are changed.

For each axis:

```text
accuracy = correct revision-bound answers / revision-bound answers
coverage = distinct currently available mapped questions attempted / available mapped questions
sample weight = min(1, answer count / 20)
evidence index = round(100 × accuracy × coverage × sample weight)
```

The index is withheld unless there are at least **10 answers and three distinct available questions** in that domain. No available questions also means insufficient evidence. Accuracy and coverage remain separate visible measures. Multiple objectives in one domain do not double-count a question. Unmapped questions are not guessed into an axis. Mapping is based on the current configured taxonomy; this is not a reconstruction of historical objective assignments.

This measures evidence within the available practice catalog, including its limited pilot size. It does not assess unseen objectives, lesson knowledge, lab competence, job readiness or certification readiness. A high index is not mastery.

Future Network Engineer, Security, Automation, Wireless and Troubleshooting frameworks can register different logical axes, evidence adapters and scoring rules. Their mapping configuration is generic and need not reference an exam blueprint. They must first implement real validated evidence sources and appropriate actions/rendering. None is advertised as available today, and no empty framework or course table was added.

## Versioned achievement catalog

Migration 0008 initializes **seven rule definitions**, not learner awards:

| Stable ID | Badge | Exact eligibility |
| --- | --- | --- |
| `first-packet.v1` | First Packet | At least one completed, reliably tracked practice session |
| `packet-explorer.v1` | Packet Explorer | At least 50 distinct revision-bound questions answered |
| `consistency-builder.v1` | Consistency Builder | Verified learning events on seven consecutive local dates, across year/DST boundaries if applicable |
| `vlan-explorer.v1` | VLAN Explorer | At least five verified answers across three distinct questions explicitly mapped to v1.1 objective 2.1 or its subobjectives, with at least 70% accuracy |
| `precision-90.v1` | Precision 90 | At least 30 verified answers across ten distinct questions, with at least 90% unrounded accuracy |
| `security-scout.v1` | Security Scout | At least ten verified Security Fundamentals answers across five distinct currently available mapped questions, with at least 70% accuracy |
| `ccna-pathfinder.v1` | CCNA Pathfinder | In each of all six domains: at least five verified answers and three distinct currently available mapped questions |

These are exploration/evidence milestones, not mastery claims. VLAN uses explicit objective associations; titles and keywords are never used as evidence. A small catalog may not contain enough relevant questions to earn a badge; it stays locked honestly.

Definitions are database-backed, versioned and read-only for the application role. Server implementations recognize only registered rule keys, version 1 and the reviewed criteria. Unknown rules/versions/thresholds fail closed instead of granting awards. New rule versions should use new stable IDs; historical award records retain their original evidence.

Awards are owned by the authenticated database user, have server timestamps and aggregate evidence snapshots, and are unique on `(user_id,achievement_id)`. Processing uses a per-user advisory lock and `ON CONFLICT DO NOTHING`. Repeated checks cannot duplicate awards. The client cannot submit achievement IDs, owner IDs, scores, counts or eligibility claims. No leaderboard, XP wallet, daily visit reward or competitive ranking was added.

Processing follows successful validated NEXUS answer/final-submission events. Failures in optional award processing do not turn a committed grade into an apparent grading failure; the profile action can retry processing from real evidence. GET profile/activity reads never award badges. Before achievement storage exists, processing returns explicitly unavailable and the UI does not fabricate earned or locked database records.

## API changes

Existing practice and learner API contracts remain unchanged.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/api/nexus/activity?year=2026&timezone=Asia%2FRiyadh` | Bounded complete local-year aggregation, counts, intensity, supported source flags |
| GET | `/api/nexus/progress?timezone=Asia%2FRiyadh` | Own verified evidence, skill framework, current skills, badge eligibility and persisted awards |
| POST | `/api/nexus/achievements/evaluate` | Body `{timezone}` only; evaluates own authoritative evidence and inserts only new eligible awards |
| POST | `/api/nexus/submissions` | Atomic final grading of original untracked deliveries; no session ID invented |

All routes use the existing active-account middleware, database-controlled account status and verified Clerk identity. Mutations require matching `X-Practice-Session`. Activity/year/timezone/configuration inputs are strictly validated and SQL is parameterized. No user ID is accepted as an ownership selector. Query keys and cancellation are scoped to account and Clerk session; stale account responses cannot populate another learner's view.

Activity is aggregated in PostgreSQL with a bounded year range. Evidence queries aggregate the authenticated learner's attempts, mapped domains and days, instead of loading full answer payloads. Badge rows are bounded by the catalog. Existing user/history indexes support the filters. Current server/session aggregation reuses existing indexes; additional large-scale query tuning should follow measured production workloads rather than speculative indexes.

## Database proposal and activation boundary

The officially registered chain remains **0000–0006** during this task. Pending 0007 remains unchanged. New proposal files are:

- `lib/db/drizzle/proposed/0008_learning_achievements.sql`
- `lib/db/drizzle/proposed/meta/0008_snapshot.json`
- `lib/db/drizzle/proposed/meta/0008_journal.json`
- ORM model `lib/db/src/schema/learning-achievements.ts`, exported through the schema barrel.

The two new tables are `achievement_definitions` and `learner_achievements`. They have named checks, RESTRICT foreign keys, unique learner/badge identity and a learner/date index. PUBLIC access is explicitly revoked on these new tables. No existing table, question, topic, attempt, revision, delivery, objective or chapter is rewritten. There is no history backfill, lesson/lab seed or automatic learner award in the migration.

The current source works before either migration: answer submission is fixed, untracked final submission is atomic, yearly answer activity and skill evidence work, and the profile labels unavailable tracking/badges. Persistent resume/complete-session history requires 0007; database-backed badge storage requires 0008. No database operation is needed merely to activate the submission bug fix and these read-only aggregates.

`tools/promote-learning.mjs --plan` is inert. `--promote-source`, **only after approval**, promotes the reviewed missing 0007/0008 files and metadata while preserving the existing journal prefix. Runtime guards recognize only the exact reviewed seven/eight/nine-entry states; arbitrary inventory, hashes, partial tables and unexpected privileges still fail closed. Existing initial-provisioning protections remain intact.

The live upgrade wrapper targets only `127.0.0.1:5432`, `ccna_phase6a_dev`, role `ccna_phase6a_migrator`, PostgreSQL system identifier `7694701597474139084`, the exact workspace/main/HEAD and reviewed Windows service/executable identity. It privately prompts for the known migrator password and reads no stored credentials or environment files.

The upgrade accepts only the exact reviewed seven-entry baseline, or the eight-entry baseline with existing sessions. It locks the existing tables and ledger, fingerprints all existing rows and the question-code sequence, uses the official Drizzle migrator through savepoint-bound transaction handling, verifies the fifteen-table snapshot/nine-entry ledger, seven exact initial badge definitions, empty award table and unchanged prior functions/data. Existing 0007 session rows are preserved when upgrading an eight-entry database.

The only 0008 runtime additions are:

```sql
GRANT SELECT ON public.achievement_definitions TO ccna_phase6a_app;
GRANT SELECT, INSERT ON public.learner_achievements TO ccna_phase6a_app;
```

For a seven-entry baseline, the same transaction also creates the pending 0007 session tables and applies their reviewed SELECT/INSERT and four mutable-column UPDATE privileges. No old history, role or catalog deletion privilege is expanded. Runtime validators forbid definition INSERT, award UPDATE/DELETE/TRUNCATE, column-level privilege workarounds and PUBLIC access. Failed guards roll back; no automatic reset, drop, password change, service change or retry is implemented. A rolled-back migrator can advance its ledger sequence, as PostgreSQL sequences are not transactional.

**Neither source promotion nor the live upgrade was executed. Explicit approval is required for 0007/0008 and these narrow grants.** The live credential/permission wrapper has not been run end to end. Its SQL migration/catalog behavior was tested under the existing disposable owner; the least-privilege decision logic was tested offline, without creating roles or changing private-cluster role grants.

## Future learning architecture

Courses and modules are content organization; lesson, lab, quiz and assessment completions must eventually have their own authoritative resource/version records. They should expose server-validated completion evidence through source adapters, keyed by learner, stable source-record ID, resource version, event kind and occurrence time. Repeated completion delivery must deduplicate at the source. Client visits or submitted counters are never sufficient evidence.

The current activity projection, normalized framework evidence and versioned rule registry are the extension seams. New source adapters can add real completion kinds and new registered rules without rewriting attempts or duplicating the question system. The API advertises lesson/lab capability as unavailable until those implementations exist. No speculative course/module/lesson/lab tables or administration flows were created.

## Validation and known limits

Final executed checks:

- `node tools/run-curriculum-tests.mjs`: **571 passed across 41 suites**, including backend/HTTP ownership, actual submission-body validation, navigation, final confirmation, double-click prevention, uncertain-response retry, calendar accessibility, skill thresholds, badge eligibility and existing Admin/Curriculum/Exam regressions.
- Node launcher/ledger/upgrade/NEXUS/learning-policy checks: **195 passed**.
- Real isolated PostgreSQL group: **1 passed, 10 unrelated groups intentionally skipped**. The group applied pending 0007/0008 through the official Drizzle migrator and repeated the run without duplicate ledger entries; verified all fifteen table/column/constraint/index structures and the original trigger; proved valid/invalid revision-key handling, atomic rollback after a later invalid answer, reordered replay and conflict handling; checked owner/sign-in isolation, real duplicate-award uniqueness, repeated award processing, exact seven-rule catalog, PUBLIC revocation, leap years and UTC/Tokyo/New York date aggregation against independent Intl calculations.
- All isolated fixtures and migration rows rolled back. Original eleven tables remained empty, original seven-entry ledger remained intact, all four proposed tables were absent afterward, and the temporary HBA allowance was restored byte-for-byte. Only the dedicated disposable database was connected; no application or populated rehearsal database connection occurred. Disposable sequences can advance.
- `node tools/check-admin.mjs`: **PASS** for API, frontend, schema and API-client TypeScript.
- Production compilation: **PASS**, including required Admin, NEXUS, profile, heatmap and Skill Matrix bundle markers. Artifact: `.local/admin-ui-production-build/1792051019235`. Existing non-fatal Radix source-map messages and the 739.28 kB bundle warning remain.
- JavaScript syntax checks, PowerShell AST parsing (without executing the wrapper), inert source-promotion plan and scoped Git whitespace inspection passed.

Early failures in development were corrected before these final results: the submission fixture covered only tracked mode and missed the real fallback payload mismatch; new regressions now validate both. The new PostgreSQL fixture also needed explicit timestamp normalization because Drizzle raw execution returned a string. No database reset or production-data repair was used.

No live browser, live application endpoint, real-user award or migration was exercised. DOM tests cover controls and navigation; responsive visual acceptance and screen-reader testing still require a normal signed-in browser. No browser integration was requested. Multi-connection stress testing was not performed; idempotency is enforced by actual PostgreSQL uniqueness plus locks and exercised with repeated service submissions.

The source build is a credential-free production compilation, not a deployment package with configured Clerk keys. Existing Radix source-map and large-bundle warnings may remain. Historical grouping, lesson/lab history, study duration and global competency are never inferred.

## Exact local commands

Use these safe source checks without database access:

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/promote-learning.mjs --plan
node tools/check-admin.mjs
node tools/run-curriculum-tests.mjs
node --test tools/learning-policy.test.mjs tools/nexus-policy.test.mjs tools/phase6a-local/policy.test.mjs tools/phase6a-local/runtime-ledger.test.mjs tools/phase6a-local/upgrade.test.mjs
node tools/build-admin-ui.mjs
```

The isolated migration/fixture runner is **not an offline check**. It uses only the previously approved existing empty Drizzle-check database on port 55440, with guarded temporary HBA access, no new environment or role creation, rollback-only data, exact source hashes and byte-for-byte HBA restoration:

```powershell
node tools/prepare-learning-migration.mjs
node tools/run-admin-practice-disposable.mjs --execute-learning
```

Do not run the live upgrade commands without explicit approval. After approval, stop only your own API/web foreground terminals with Ctrl+C and retain a verified backup. Then:

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/promote-learning.mjs --promote-source
if ($LASTEXITCODE -ne 0) { throw 'Source promotion failed. Stop.' }
powershell.exe -NoProfile -File tools/invoke-learning-upgrade.ps1 -Apply
```

There is an intentional maintenance window between source promotion and successful migration. Startup fails closed during that interval. If a guard stops, do not retry blindly, revert old migrations or reset data; inspect the sanitized stage first.

The updated UI and critical fix can run **now**, without migration, using the existing seven-entry application schema. Restart only your own existing foreground terminals. Terminal 1:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Terminal 2:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use each account's own password and existing Clerk development keys only at the hidden local prompts. Keep both terminals open. Visit `http://localhost:8080/`, `/profile` and `/practice`, and sign in normally.

Manual acceptance: inspect real counts and timezone labels; navigate the heatmap with arrows; switch radar/table; verify insufficient samples and locked badge conditions; start default Practice with multiple questions, change an earlier choice, flag, return, and confirm Finish appears only on the last question. Verify no grading occurs on Next/Previous. Test the explicit Learn check separately. After an approved upgrade, verify stored session resume and badge records through normal authenticated actions. No reset or cleanup command is part of verification.

## Files created or modified for this task

New backend: `artifacts/api-server/src/lib/learning-evidence.ts`, its unit test and `routes/learning-evidence.test.ts`. Extended `lib/nexus.ts`, `routes/nexus.ts` and Nexus tests for atomic final grading, strict ownership and validated-event award processing. Existing `routes/practice.ts` validation was not weakened or changed for this fix.

New frontend: `components/learning-evidence.tsx`, its tests, `pages/learner-profile.tsx` and `learning-evidence.css`, under `artifacts/ccna-learning/src`. Updated `App.tsx`, NEXUS sidebar, Overview, Practice and interaction tests. Extended the shared `lib/api-client-react/src/nexus.ts` contracts and timezone header support.

New schema/model and three proposed metadata/SQL files are listed above. New tooling: `tools/learning-policy.mjs`, its offline tests, `prepare-learning-migration.mjs`, `promote-learning.mjs`, `execute-learning-upgrade.mjs`, `invoke-learning-upgrade.ps1`. Extended existing source guards/test fixtures for the exact optional future schema, safe test/build runners, rollback-only integration group, and narrowly scoped LF attributes. Existing launcher/upgrade tests retain historical coverage while accommodating reviewed newer source inventories. No historical migration SQL or official journal entry was changed.
