# Question Bank Management Studio

Implemented directly in the existing `/admin/questions` route. The existing PostgreSQL question/options/revision tables, database-generated codes, Clerk identity, database ADMIN authorization, taxonomy service and controlled deletion workflows remain the source of truth. No parallel question system, database migration, permission change, reseed or cleanup is introduced.

## Components and files

| File                                                                                         | Responsibility                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artifacts/api-server/src/lib/question-studio.ts`                                            | Bounded listing, metrics, relationship lookups, full details, duplicate checks, transactional saves, edit tokens, bulk changes and deletion dependency preview. |
| `artifacts/api-server/src/routes/admin-questions.ts`                                         | Additive Studio routes under the existing authentication, ADMIN and mutation-session middleware; old contracts retained.                                        |
| `artifacts/ccna-learning/src/components/question-bank-studio.tsx`                            | Dashboard, filters, URL state, table/cards, selection, details, export and bulk confirmation/results.                                                           |
| `artifacts/ccna-learning/src/components/question-studio-editor.tsx`                          | Spacious reusable create/edit/duplicate drawer, validation, objective assignments, publishing checklist and navigation guards.                                  |
| `artifacts/ccna-learning/src/components/studio-relationship-picker.tsx`                      | Searchable, paginated server lookups for topics/objectives; never downloads all topics or questions.                                                            |
| `artifacts/ccna-learning/src/components/studio-preview.tsx`                                  | Local answer selection and feedback; no delivery/attempt requests.                                                                                              |
| `artifacts/ccna-learning/src/components/question-content.tsx` and `src/question-content.css` | Shared safe text, inline-command and fenced-code rendering used by Admin preview and the actual practice/exam workspace.                                        |
| `artifacts/ccna-learning/src/lib/question-studio-form.ts`                                    | Form validation and formula-safe current-page CSV summary export.                                                                                               |
| `artifacts/ccna-learning/src/question-studio.css`                                            | Responsive table/cards, full-width editor, compact metrics and focus states.                                                                                    |
| `lib/api-client-react/src/question-studio.ts`                                                | Shared management response types, exported through the existing client package.                                                                                 |

The existing `admin-questions.tsx` exports the new manager for its existing callers. `App.tsx` avoids a duplicate Question Bank heading. Shared Topics relationship filters are reused. Shared delete controls now label transport/policy errors FAILED while retaining DELETED/BLOCKED record outcomes. Existing Admin session and HTTP authorization tests are updated for the drawer workflow. New service, studio and safe-renderer tests are included in `tools/run-curriculum-tests.mjs`.

The existing disposable test runner has a narrowly selected `--execute-studio` mode, refuses any pending migration, and checks zero records across all eleven application tables before/after its rollback-only fixtures. The production compilation checker verifies that authenticated Admin routes are actually present in its output.

## Interface and editor

The page shows real totals, ACTIVE count, DISABLED count, missing-objective count and difficulty counts. **Draft imports and disabled questions share DISABLED in the current schema.** The UI labels this “Unpublished / disabled”; it does not invent a separate draft or review metric/state.

Search runs on the server with PostgreSQL full-text matching plus escaped literal text/code matching. Pagination is 10/25/50 with stable ID tie-breaks. Filters cover topic, taxonomy domain/objective, reviewed curriculum chapter, difficulty, state, missing objective, missing chapter and fully mapped content. Sorting covers creation, update, code, difficulty and state. Filters, search, sort and effective pagination synchronize to the URL. Details/editor closure retains list context. Cards and tables use the same page; only the nonsensitive view preference is stored locally. Mapping/update columns can be hidden.

**Create Question** opens a wide drawer with separate information, answers, explanation/references, relationships and preview sections. Codes are generated by PostgreSQL and read-only after creation. New and duplicated questions start unpublished. Answer options default to four, allow 2–10, can be reordered/removed, and require exactly one explicit correct answer. Removing the correct answer requires choosing a new one; the UI does not guess. Blank, overlong and duplicate normalized option text is rejected in both Studio validation layers.

Save unpublished uses DISABLED. Publishing uses ACTIVE and requires a valid existing enabled topic, complete choices, exactly one correct answer and a useful explanation. Mapping gaps are visible warnings, not invented assignments. A checklist explains incomplete fields. Possible duplicate text in the same topic is checked before saving and requires explicit acknowledgement; this is a warning workflow, not a new global uniqueness constraint. Duplication creates a new UUID/code and preserves the source record. Bulk topic reassignment that introduces a possible duplicate is BLOCKED instead of implicitly acknowledging it.

Failed saves retain the draft and never retry automatically. Edit tokens cover the canonical database question row, options and objective assignments, so changes through existing APIs are detected even when an objective-only edit leaves the question timestamp unchanged. The drawer guards Escape, outside click, Cancel, browser Back and full-page navigation. Pending requests prevent duplicate submissions. Private unsaved answers remain in memory and are discarded on session changes, not stored in browser storage.

Technical material supports preserved whitespace, inline commands in backticks, fenced CLI/code blocks and monospaced tables placed in those blocks. React escapes all strings. No raw HTML, arbitrary Markdown attributes, links or remote image requests are executed. The shared renderer changes presentation only; delivery selection, grading, attempts and immutable snapshots are unchanged.

Details show full answer keys to authorized ADMIN users, explanations, educational references, exact relationships, timestamps and twenty immutable content-revision references per page. Existing snapshots do **not** contain taxonomy assignments or publication state; neither is misrepresented as revision history. Preview uses the same safe content renderer and single-answer semantics as the learner workspace, with local feedback and no history writes.

**Export current page** downloads a CSV summary of the displayed bounded page, without answer keys. It is not a round-trip import file. **Import Questions** opens the existing CSV/XLSX workflow and templates.

## Additive API

All paths below are under `/api/admin/questions`. Legacy listing/create/update/disable/delete endpoints retain their existing contracts.

| Method/path                     | Input and behavior                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/studio`                   | `page`, `pageSize`, `search`, `topicId`, `domainId`, `objectiveId`, `chapterId`, `difficulty`, `status`, `mapping`, `sort`, `direction`. Returns a bounded summary page, aggregate metrics and relationship metadata; no option answer key in listing rows. |
| GET `/studio/lookup`            | `kind=topics                                                                                                                                                                                                                                                | objectives`, `search`, `page`, optional `domainId`or`chapterId`; returns up to 25 choices and `hasMore`. |
| GET `/studio/:id`               | Optional `revisionPage`. Full ADMIN question/options, exact edit token, assignments with readable objective metadata, topic/chapter relationships and revision references.                                                                                  |
| POST `/studio`                  | `{question,assignments,acknowledgeDuplicate}`. Validated creation through the existing revision-aware writer; assignments saved in the same transaction.                                                                                                    |
| PATCH `/studio/:id`             | Same body plus `expectedToken`. Parent lock and fresh token comparison precede content/options/mapping writes. Stale edits return 409.                                                                                                                      |
| POST `/studio/duplicates`       | `{topicId,text,excludeId?}`; bounded possible matches by normalized text in the selected topic.                                                                                                                                                             |
| POST `/studio/bulk`             | `{items:[{id,editToken}],change:{status}                                                                                                                                                                                                                    | {difficulty}                                                                                             | {topicId}}`; 1–500 distinct selected records, sorted locks and per-item savepoints. Returns UPDATED/BLOCKED results. Unexpected failures roll back the whole transaction; UI reports FAILED without assuming success. |
| POST `/studio/deletion-preview` | `{ids}`; batched revision/delivery/attempt counts for the selected records. Advisory only; no writes.                                                                                                                                                       |

List rows and counts use two aggregate queries in a read-only repeatable-read transaction. Relationships and answer-state fingerprints are computed only for the bounded page using existing relationship indexes. Details and lookups are bounded; multi-record writes intentionally perform the existing revision-aware validation per selected item. Search/filter values are parameterized, sort expressions allowlisted, and save/bulk operations have statement/lock timeouts.

## Mappings and preservation

Topics, taxonomy and curriculum chapters remain distinct. The six domains, 53 objectives and 33 chapter definitions are never changed by this implementation. Chapter placement derives from reviewed exact topic-slug bindings. The editor's chapter selector filters suitable topic choices; choosing a topic is the explicit supported way to change question chapter placement. Objective UUIDs and blueprint UUIDs are explicitly selected and validated by the existing service and foreign keys; at most one primary is allowed per question per blueprint.

The previously reported two chapter-unmapped pilot questions are not automatically reassigned. Use **Mapping → Missing curriculum chapter**, inspect each question, and select an appropriate reviewed topic only after confirming the content fits it.

No application-database connection or write occurred during implementation/testing. The 60 pilot questions, 24 topics, IDs/codes, curriculum/taxonomy definitions and learner history were therefore not altered. Agent validation does not claim a fresh live inventory count.

## Deletion and authorization

Every Studio endpoint requires verified Clerk authentication and an ACTIVE database ADMIN user. Mutations retain the existing session precondition. Learner endpoints never receive Studio answer keys.

Selection persists across pages/sorts/page sizes, up to 500 records; changing filters/search clears it. **Select all** means the current page only. Bulk status, topic and difficulty changes require a confirmation listing the exact selected questions and preserve existing IDs, attempts, deliveries and revisions.

Permanent deletion uses the existing permanent-only policy check and controlled service. Dependency evidence is displayed before confirmation; unavailable evidence stops the request. Standard deletion returns **DELETED** only after verifying absence, or **BLOCKED** with dependencies/constraint reasons. It never archives. UI request failures are **FAILED**, with no assumption of deletion.

History deletion remains a separate session-bound expiring preview, exact confirmation phrase and history-loss acknowledgement. It is never invoked implicitly by Edit, Bulk Actions or standard Delete. No database permissions or immutable-history protections are broadened.

## Verification results

- **487 database-free regression tests passed across 36 suites**, including create/edit, options/correct-answer validation, publishing, duplicate blocking, objective mappings, URL filters/pagination, details/local preview, bulk actions, deletion authorization, history safeguards, dirty-navigation and focus/session isolation.
- API/frontend/schema/client TypeScript checks passed.
- Production compilation passed with authenticated Admin-route inclusion assertions: `.local/admin-ui-production-build/1791999064425`. The offline artifact uses an intentionally unset runtime Clerk reference to prevent dead-code elimination; no fabricated keys, credentials or auth bypass are supplied. This compile-only artifact is not a configured deployment.
- Isolated PostgreSQL: **3 selected groups passed, 6 intentionally skipped**. The executed groups cover Studio SQL, content/mapping transaction atomicity, stale tokens, primary-objective rejection with rollback, ID/code/revision preservation, Topics paging/physical deletion, and explicit protected-history authorization. All eleven tables returned to zero fixture records; the seven-entry ledger stayed unchanged. HBA restored byte-for-byte. Only the disposable question-code sequence may advance, as PostgreSQL sequences do not roll back.
- Database: `ccna_drizzle_check_20261012_c08f12ad34b6`, `127.0.0.1:55440`. Neither populated rehearsal database nor the application database was accessed. No migrations, grants, cleanup or new database/cluster creation occurred.
- Browser visual verification and authenticated live API tests: **NOT RUN**. Existing service terminals must be restarted by the operator to load the new source; credentials remain private.
- Edit-token consistency also passed with PostgreSQL session time zones UTC and Asia/Riyadh; epoch-based timestamp normalization preserves microseconds without depending on connection presentation settings.
- Syntax and tracked-file whitespace checks passed. An initial sandbox listener-identity check was denied before any database operation; the same guarded test command passed with authorized execution outside the sandbox.

## Remaining limits

- Separate draft/review states, tags, per-incorrect-answer explanations and private administrative notes have no current schema/workflow and are not invented.
- Chapters are reviewed topic bindings, not a new editable question-to-chapter table.
- Image references are preserved, but uploads/remote previews remain unavailable until a validated media workflow exists.
- Substring/full-text searches have bounded results but no newly installed GIN/trigram index. Profile query plans before very large catalogs; a future additive search index would require separate migration review.
- The production build reports existing Radix source-map warnings and a nonfatal bundle-size warning; route-level code splitting remains a possible optimization.

## Run and verify locally

Stop only your existing API/Web foreground processes with Ctrl+C in their own terminals. Do not rerun any cleanup or grant script.

API terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Web terminal:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use the existing hidden application-role password, migrator password for SELECT-only ledger verification, and Clerk development configuration prompts locally. No new permission grant or migration is required.

Open `http://localhost:8080/admin/questions` as ADMIN. Check real metrics, search across the bank, choose 10/25/50 rows, use mapping filters, switch views, inspect a question/revisions, and open/cancel Edit or Create. Preview answer feedback makes no learner writes. Do not use pilot records for destructive verification. The Admin browser Network panel should show 200 for `/api/admin/questions/studio?...`; signed-out/non-Admin access must be rejected.

Offline rerun commands:

```powershell
node tools/run-curriculum-tests.mjs
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

The reviewed rollback-only test mode is `node tools/run-admin-practice-disposable.mjs --execute-studio`. It is not a general database command: it refuses a stopped/mismatched private cluster, an unexpected HBA policy, nonempty test data or any ledger mismatch. Never substitute the application database or initialize/reset an environment to make it pass.
