# Admin Question Editor: four focused fixes

Scope: `/admin/questions` Create/Edit Question drawer, preview and the answer-delivery/grading paths needed for both question types. The standalone Taxonomy page is unchanged. Existing uncommitted work was retained. No application database connection, live migration, cleanup, permission change, dependency installation, commit or push was performed.

## Root causes and mapping persistence

The shared `RelationshipFilter` rendered a Radix `PopoverTrigger` using the existing `Button` without an explicit HTML type. `Button` forwards to a native button and does not provide a type default. Inside the question form this is a submit button: opening a curriculum/domain filter could submit a valid question before subsequent objective/primary/removal edits. It could close the drawer after saving the earlier values. The trigger now has `type="button"`; picker pagination buttons do too. A DOM regression asserts the type and proves domain selection causes no PATCH before Save.

A second source of confusion was the chapter control: it filters topics using source-owned `topicChapterBindings`; it is not a persisted question-to-chapter field. The domain control also filters objectives, rather than storing a separate question-domain record. Labels now distinguish Topic, Curriculum Chapter (filters Topic choices), CCNA Exam Domain, CCNA Exam Objectives and Primary Exam Objective. The Topic selector lives in this section and displays the current selection. Choose an existing chapter-bound Topic to change supported chapter placement; changing a filter alone does not assign a chapter or domain. Objective lookup requires a selected domain. Existing mappings remain visible and are not cleared by filter changes.

The backend already had a content-plus-mapping transaction. It retains that transaction, question locks, full-reference validation, per-blueprint primary constraint, edit-token concurrency protection and revision-aware writers. An additional guard rejects an existing-question edit that omits `assignments`, instead of interpreting omission as an empty replacement. New-question callers retain the compatible default of no mappings. An explicit empty array removes all mappings; otherwise only the submitted complete mapping set replaces the old set. Unrelated assignments are retained in the drawer and sent unless explicitly removed. After successful save, the drawer performs an explicit GET of the server detail before notifying success and refreshing catalog queries. Failed requests retain the draft and show validation/conflict errors.

This diagnosis is based on source inspection and reproduced DOM behavior plus isolated PostgreSQL persistence checks. The application's live catalog was not inspected and no browser verification is claimed.

## Single and multiple answers

Types are `MULTIPLE_CHOICE_SINGLE` and `MULTIPLE_CHOICE_MULTIPLE`. Single Answer uses radios and exactly one correct option. Multiple Answers uses checkboxes, at least two correct options, and a required-selection-count input. The configured count must equal the marked correct count. The persisted options are the single source of truth for that count; no redundant count column can drift from the answer key. Reloading derives it from the saved options.

Admin creation/editing, duplication, local Student Preview, Network Challenge Arena (tracked and untracked final submission, Learn, retry/selection state), the original practice workspace, results and historical review support complete sets. The local preview creates no delivery or attempt. Learner delivery DTOs expose only the type, public selection count and option text/keys. Correct option sets and explanations are returned only after authorized grading or through the authenticated owner's historical review.

The established `optionKey`/`selectedOptionKey` fields remain strings for backward compatibility. Single answers retain their original key representation and feedback shape. Multiple selections use a canonical JSON array of distinct, uppercased, sorted option keys, for example `["E","F"]`. New multiple-answer keys are restricted to 1-8 ASCII letters, digits, underscores or hyphens; ten keys fit the widened 128-character storage limit. Original single keys and historical rows are not normalized or rewritten.

Server grading checks complete set equality, independent of order. Partial, oversized, duplicate and unknown-key sets fail before insertion. A valid, complete incorrect set scores incorrect. Pending tracked selections may be partial, but final grading cannot accept them. Retrying an identical set replays one stored attempt; a different set for a submitted delivery returns conflict. Existing ownership, verified Clerk session, expiry, active availability and final-submit transaction checks remain in effect. Ordinary Admin partial updates now validate the merged existing question and options before writing, so changing only type or only options cannot create an invalid answer configuration.

## Inline Topic creation

`+ Create New Topic` opens the existing reusable TopicEditor as a nested drawer. The parent question state stays mounted. Fields reuse existing name, editable automatic slug, description, visibility and display-order validation, authenticated Admin Topics API and session precondition. Inline creation additionally requests duplicate-name checking; it checks normalized exact names under an advisory lock. Existing slug uniqueness remains database-enforced, including concurrent claims. No global name-uniqueness migration or silent topic merge was introduced.

On server confirmation, existing topic/catalog queries refresh and the returned UUID/name are selected in the question. The Topic exists independently immediately; the question association changes only when Save Changes succeeds. Failed topic creation retains both forms. Unsaved-close confirmations and before-unload warnings remain active; an in-flight guard prevents duplicate submissions. A nested topic operation does not authorize creating an official domain/objective.

Arbitrary topic-to-chapter assignments are not supported by the current database/API: chapters are reviewed source configuration bound to topic slugs. The nested form explains this, rather than offering a chapter selector that discards values. New ordinary topics have no inferred chapter. The existing question Topic picker can filter for topics already bound to a chapter. No official chapter or taxonomy definitions were modified.

## Publishing Readiness

The former static Publishing Checklist is a compact collapsible Publishing Readiness section. Missing local fields/configuration show Missing Required Information; server blockers show Needs Attention; Ready to Publish appears only after a successful authenticated server readiness check for the current valid form. Changes invalidate the earlier readiness result. Blocking issues expand the section. Network failures never produce Ready.

New `POST /api/admin/questions/studio/readiness` runs read-only publication checks: schema and answer configuration, explanation, real enabled Topic, real blueprint/objective bindings, primary uniqueness, explicit duplicate acknowledgement and multiple-answer migration capability. It evaluates publication even if a caller supplies a disabled draft state. Save still revalidates references and concurrent state transactionally; readiness is not a reusable authorization token. Missing objective or chapter mappings remain warnings because existing publication rules do not require them. The existing backend supports drafts with an empty explanation, but still requires a real Topic, question text and valid answer options; this change does not fabricate an incomplete-draft storage model.

## Notifications and confirmations

The existing accessible Radix AdminToast now supports success (teal), error (red), warning (amber) and information (blue), with semantic icons. Question/Topic saves notify only after confirmed responses; question save also reloads the detail. Mapping changes are included in successful save feedback. Duplicate checks use warning/info rather than reporting a successful check as an error. Permission, configuration and persistence failures retain visible errors and draft state; server field errors are attached to relevant controls.

The existing permanent-delete workflow is unchanged. Its confirmation and dependency/history preview remain required. Its DELETED/BLOCKED results now also produce appropriate success/warning notifications; transport failures remain FAILED and never imply deletion. No archive fallback, history deletion bypass or extra permission was added. This task executed no application deletion.

## Proposed database migration

`lib/db/drizzle/proposed/0009_multiple_answer_questions.sql` and proposed `meta/0009_snapshot.json`, `meta/0009_journal.json` are preparation artifacts only. The official journal remains unchanged. The proposal follows the pending reviewed 0007/0008 prerequisites.

- Create `question_type_v2` containing both types; retain the old enum.
- Convert only the questions.type column and restore its Single Answer default. Values and IDs remain unchanged.
- Widen attempt/session-item selection storage from varchar(8) to varchar(128).
- Replace snapshot INSERT validation to accept exactly the correct count for each type and bounded multiple-option keys.
- Replace attempt INSERT validation with complete-set verification for multiple answers while retaining the original ownership, revision/delivery, topic, expiry, timestamp and single-answer checks.
- Preserve every append-only trigger, foreign key, historical payload/hash and controlled-delete safeguard. No UPDATE/DELETE of stored application rows and no new runtime grants are in this SQL.

The new enum avoids PostgreSQL's restriction on using newly added enum values before commit, so the official transactional Drizzle migrator and rollback-only fixtures can exercise the actual SQL. The type conversion can take exclusive DDL locks and rewrite the questions table; live activation needs a verified backup, maintenance planning, explicit approval, and promotion/extension of guarded launcher metadata/function checks for this exact migration. The current live upgrade commands do not promote 0009 and must not be used to bypass that review. Multiple-answer saves fail clearly with MIGRATION_REQUIRED until installed. The single-answer drawer fixes can run against the current database.

Pinned 0009 SQL SHA-256: `cd2ea484ba1b6f850eb1f64b95fbe91869deecd2093061e05336588819492cef`.

`tools/prepare-editor-migration.mjs` stages a private ten-entry chain offline from pinned original/proposed SQL, emits proposed metadata and never changes the official journal. Historical 0007 staging explicitly retains its original varchar(8) shape even though the current model targets the widened later schema.

## Files changed

- Editor/UI: `question-studio-editor.tsx`, `studio-preview.tsx`, `topic-editor.tsx`, `admin-ui.tsx`, `admin-delete-controls.tsx`, the shared `RelationshipFilter` button in `topics-manager.tsx`, `studio-relationship-picker.tsx`, `question-studio-form.ts`, new `answer-selection.ts`, and `question-studio.css`, under the existing learning frontend.
- Learner answer paths: `pages/nexus-practice.tsx`, `pages/nexus-history.tsx`, `pages/practice-history.tsx`, `components/practice-run-workspace.tsx`.
- Backend: `lib/question-studio.ts`, `topics-management.ts`, `questions.ts`, `questions-admin.ts`, `question-revisions.ts`, `practice.ts`, `practice-batch.ts`, `nexus.ts`; `routes/admin-questions.ts`, `routes/practice.ts`.
- Storage model: `lib/db/src/schema/questions.ts`, `question-revisions.ts`, `practice-attempts.ts`, `nexus-sessions.ts`; new proposed 0009 SQL/metadata and narrowly scoped LF attributes.
- Contracts: OpenAPI spec; corresponding Zod schemas and generated question-type/learner/result contracts; API-client generated schema/history types plus `nexus.ts`, `question-studio.ts`.
- Tests/tooling: new `lib/multiple-answer.test.ts`; extended question-studio, question-bank-studio and Nexus tests; rollback fixture group in `tools/admin-practice-disposable.db.test.ts`; explicit `--execute-editor` runner mode; offline staging script, historical staging compatibility adjustment and focused `--editor` selection in the existing database-free regression runner.

No standalone Taxonomy redesign, launcher bypass, historical migration edit, official journal promotion, lockfile change or live learner-data mutation was performed.

## Validation results

Final executed results:

| Check | Actual result |
|---|---|
| Database-free application suite, including original question-domain validation | 611 passed, 43 suites; 0 failed |
| Offline migration/launcher/privilege-policy suite | 195 passed; 0 failed |
| PostgreSQL editor migration/persistence fixture | 1 passed; 11 unrelated groups intentionally skipped; 0 failed |
| API/frontend/schema/API-client TypeScript | PASS |
| Credential-free production compilation | PASS; 1,948 modules, artifact `.local/admin-ui-production-build/1792063799066` |
| New/changed JavaScript tooling syntax, source-hash/staging checks and scoped Git whitespace checks | PASS |
| Inert existing promotion plan | PASS; no database operations and no source promotion |

The production build retains non-fatal Radix source-map warnings and the approximately 745.56 kB JavaScript chunk warning (224.13 kB gzip). It is a compilation artifact without configured Clerk credentials, not a deployment. The final full-suite run includes the focused editor tests; the earlier focused run separately passed 207 checks before the two additional validation cases and original 11 question-domain checks were added.

Early development test failures were corrected before the final results: the relationship selector regression exposed premature form submission; portaled focus restoration needed its normal frame to settle in the DOM fixture; and the untracked Arena fixture needed to return its submitted flag rather than discard it. The final PostgreSQL run uses the final pinned SQL hash above. No browser, live endpoint, real-user submission or application migration was performed. Multi-connection stress/load testing and a live migrator-role activation are not claimed.

The isolated runner uses only `ccna_drizzle_check_20261012_c08f12ad34b6` at 127.0.0.1:55440, the exact private owner/data-directory/executable/listener checks and existing empty seven-entry ledger. It verifies staged hashes before temporarily adding one exact-database/exact-owner loopback HBA rule. Every fixture and migrated table/ledger change rolls back; original data emptiness and seven ledger entries are checked afterward, and HBA is restored byte-for-byte. Only disposable question-code/migration sequence values may advance. No new database/environment is created, and neither populated rehearsal database nor application database is connected.

The PostgreSQL fixture checks actual official migration and repeat behavior, full snapshot catalog consistency, existing row/revision preservation, inline name duplicate rejection, topic reassignment, objective/primary/removal persistence, stale-token conflict, invalid mapping rollback, original single delivery grading after conversion, learner answer-key allowlisting, complete-set grading/replay/conflict, forged grading rejection, append-only snapshot protection and tracked final submission with a rejected incomplete set.

## Local verification

Start the API and frontend in separate PowerShell terminals using the existing guarded launcher. Restart only your own foreground terminals with Ctrl+C if already running. Do not rerun cleanup or use unapproved migration commands.

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Enter account-specific credentials and existing Clerk development keys only at hidden local prompts. Visit `http://localhost:8080/admin/questions` and sign in as an existing Admin. Open Edit, inspect the saved Topic/objectives, open chapter/domain filters, and verify no save occurs until pressing Save Changes. Use synthetic test content for write checks, never the 60 protected pilot questions. New multiple-answer publication on the application database remains unavailable pending approved migration promotion/activation. There was no live browser or application endpoint verification in this task.

Offline checks:

```powershell
node tools/check-admin.mjs
node tools/run-curriculum-tests.mjs --editor
node tools/run-curriculum-tests.mjs
node tools/build-admin-ui.mjs
node tools/prepare-editor-migration.mjs
```

The PostgreSQL command is not offline and must retain its exact disposable target/temporary-HBA authorization:

```powershell
node tools/run-admin-practice-disposable.mjs --execute-editor
```
# Current activation follow-up

The guarded 0007–0010 activation sequence, universal Admin deletion behavior and current validation results are documented in [question-bank-migration-and-universal-deletion.md](question-bank-migration-and-universal-deletion.md). Application execution still requires separate approval. The earlier editor-stage results below remain historical; its pilot-preservation language does not prohibit a later explicitly selected and confirmed Admin deletion after activation.
