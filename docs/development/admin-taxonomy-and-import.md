# Admin taxonomy and bulk question import

Implemented on `main`, HEAD `03b14526aae448e49eacd602a43bfb0e355aca4d`, in `<repository-root>`. No commits, pushes, dependency installation, remote connections or application-database actions were performed.

## Migration promotion and database evidence

Official migration `lib/db/drizzle/0005_exam_taxonomy.sql` is byte-identical to the passed SQL rehearsal proposal (SHA-256 `d1d40e488a00c14c7958dc5b1f83bda5e4bb420a4d05974ae92c3f6ca0027226`). It is journaled at index 5, timestamp `1791808640068`, with version 7/breakpoints. Snapshot `0005_snapshot.json` has a new ID and `prevId=693798d6-1010-4990-bbd8-262ebec767fa`. Drizzle Kit's database-free serializer generated the new table metadata; the previous tables, enums, sequences, schemas, views, policies and roles were preserved. The archived proposal remains unchanged. `node tools/promote-taxonomy.mjs --check` checks these invariants; do not repeat `--prepare`.

The completed nine-group rehearsal was not repeated. The user separately approved one empty database inside the existing private cluster on port 55440, solely for the real Drizzle test:

- Database: `ccna_drizzle_check_20261012_c08f12ad34b6`
- Owner: `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170`
- PostgreSQL: 18.6, listener `127.0.0.1:55440`, PID 16996.
- Actual Drizzle migrator first run: six SQL migrations, six matching ledger hashes/timestamps, eleven public tables.
- Repeat run: no changes to the ledger, schema columns or question-code sequence (`last_value=1`, `is_called=false`). No question fixtures were inserted.
- A narrow, temporary HBA allowance admitted only this exact database and existing disposable owner over IPv4 loopback. The original HBA bytes were restored and the private configuration reloaded afterward. No server restart/shutdown occurred. The new database is retained; do not reuse or delete it automatically.
- Neither populated rehearsal database was connected to or written to. No application database was connected to.

`tools/test-taxonomy-migrator.mjs` defaults to offline plan mode. Its execution has already completed; do not rerun its creation mode. Promotion intentionally invalidates the completed rehearsal manifests' old journal hashes; do not weaken or repin those historical guards to rerun populated databases.

The user separately approved **only** appending 0005 to the guarded local launcher's migration inventory. All other service, identity, credential, privilege and path safeguards are unchanged. This source change grants no permission to apply the migration to the application database.

## Admin interface

Authenticated, active database-role ADMIN accounts access:

- `/admin/taxonomy`: view blueprint/domain/objective trees, create draft blueprints, and create/edit domains/objectives. Explicit source review, URL and timestamp are required before activation. Complete weights must total 100%; CCNA activation requires codes 1.0–6.0. Blueprint row locks serialize activation and domain edits; active-domain edits revalidate the aggregate.
- Question objective editor: choose a question and blueprint, select any number of objectives, and optionally select one primary for each blueprint. The existing Questions page also links directly to this editor. Saving replaces the full association set under a parent-question lock. The PostgreSQL partial unique index remains authoritative; composite FKs prevent cross-blueprint mappings. Question IDs, topic IDs and history rows are not rewritten.
- `/admin/import`: authenticated template downloads, file selection, validation/duplicate preview, row errors, explicit confirmation and import summary.

The existing Clerk verifier, database role/status authorization and `X-Admin-Session` intent precondition protect all new endpoints. An Admin label in token claims never authorizes access. Responses are `no-store`; query keys and local form/preview state are scoped to the active session. Session changes discard late responses. Correct options appear only in protected Admin previews; learner endpoints are unchanged.

Classification remains attached to the logical question. Calling existing revision capture preserves content history, but unchanged content reuses the existing revision and taxonomy changes are not historical content snapshots. This feature does not add a taxonomy change audit ledger or reconstruct historical classifications.

## Import templates and format

Download buttons use the authenticated API client rather than unauthenticated navigation:

- `GET /api/admin/question-import/template.csv`
- `GET /api/admin/question-import/template.xlsx`

Both templates contain headers only, with no synthetic questions or inferred classifications. Required columns are `topicId`, `text`, `difficulty`, `optionA`, `optionB`, `correctOption`. Optional columns are `optionC`–`optionJ`, `explanation`, `referenceNotes`, `blueprintId`, `objectiveCodes`, `primaryObjectiveCode`.

Use an existing topic UUID from the reference panel. Difficulty is EASY, MEDIUM or HARD. Supply 2–10 nonempty options and exactly one correct key A–J. Question text/options use the existing limits and validation. NUL characters are rejected before PostgreSQL. Topic/objective references are resolved explicitly; topic names or question content never infer classifications.

For one blueprint per import row, supply its UUID and semicolon-separated objective codes, for example `1.1;2.1`; `primaryObjectiveCode` must be one of those codes. Leave all three classification fields empty to retain an unclassified question. The taxonomy editor supports associations across multiple blueprint versions after import.

Limits: 2 MiB compressed upload, 500 data rows, one XLSX worksheet, 50 worksheet columns, 128 ZIP parts, 8 MiB per expanded part and 20 MiB total expansion. CSV supports UTF-8 BOM, commas, escaped quotes and multiline fields. XLSX supports ordinary plain cells, shared/inline strings, and ZIP stored/deflate compression with CRC/length checking. It rejects old XLS, macros/binary parts, external workbook links, formulas, merged cells, DTD/entity declarations, unsafe paths, duplicate parts, invalid cell references and excessive XML depth/node/tag sizes. No new spreadsheet dependency was installed. Unsupported workbooks should be exported to plain CSV or the provided single-sheet template.

## Preview, confirmation and rollback

1. Upload produces a server-owned, random preview token and row statuses: accepted, rejected or duplicate. No questions are written.
2. Duplicates match normalized topic ID, question text and unordered answer texts, ignoring labels, answer correctness, explanation and difficulty. Existing disabled questions count as duplicates. Existing questions are never overwritten or automatically classified.
3. Preview tokens bind to the verified user/session, expire after ten minutes, and are one-use. This single-process store holds at most 50 previews globally and three per identity; a process restart expires outstanding previews. Multiple API instances require sticky preview routing or a shared server-side store before deployment.
4. The UI requires checking an explicit confirmation box and pressing the import button. The server requires literal `confirmed: true`, not client-supplied question rows.
5. Confirmation takes an advisory transaction lock to serialize bulk imports across API processes, reloads topic/objective/duplicate context, and rejects a stale accepted row before creating questions. Rejected/duplicate rows from the preview are skipped; only accepted rows are imported.
6. Existing `createQuestion` writes question/options and captures an immutable revision inside the outer transaction; explicit objective mappings are in that same transaction. Any failure rolls back the entire accepted batch. The consumed token requires a new preview after failure, preventing replay. PostgreSQL sequence values can have normal gaps after rollback; no sequence reset or ID reuse occurs.
7. Every imported question is `DISABLED`, the existing unpublished status. UI calls these drafts; no new question enum/system is introduced. Learner/practice endpoints require ACTIVE question/topic status. Publication is a separate manual action in the existing Questions manager.

Duplicate checks are enforced for concurrent bulk imports. Ordinary manual create/edit endpoints retain their original behavior; there is no new global content-fingerprint UNIQUE constraint.

## API contracts

| Method / path | Behavior |
| --- | --- |
| GET `/api/admin/taxonomy` | `{blueprints, domains, objectives}` |
| POST `/api/admin/taxonomy/{blueprints,domains,objectives}` | Create a fully validated record |
| PUT `/api/admin/taxonomy/{kind}/:id` | Replace editable record fields; referenced binding changes remain FK-protected |
| GET `/api/admin/taxonomy/questions/:id/objectives` | Current explicit mappings; missing question returns 404 |
| PUT `/api/admin/taxonomy/questions/:id/objectives` | `{assignments:[{objectiveId,blueprintId,isPrimary}]}`; empty array explicitly clears classifications |
| POST `/api/admin/question-import/preview` | `{filename,dataBase64}` → token/expiry, counts and row-level review/errors |
| POST `/api/admin/question-import/confirm` | `{previewId,confirmed:true}` → imported IDs and accepted/rejected/duplicate counts |

Blueprint API timestamps are explicit ISO strings or null; an invalid timestamp/URL is rejected. Domain/objective APIs follow existing taxonomy validator fields. Existing question create/update, learner and practice contracts remain unchanged. `lib/api-client-react/src/admin-content.ts` provides the typed additive client, alongside the existing generated client.

## Safe validation and local run instructions

Final executed checks:

| Check | Actual result |
| --- | --- |
| Database-free API units and compatibility tests | 293 passed in 11 files; 0 failed |
| Database-free frontend units and session tests | 62 passed in 5 files; 0 failed |
| Guarded launcher policy units | 69 passed; 0 failed |
| Application sources and five new focused test files, installed-cache TypeScript check | PASS |
| Official SQL/source hash, journal ordering and snapshot consistency | PASS |
| Syntax checks for all five new JavaScript tools | PASS |
| Actual isolated Drizzle migration and repeat execution | PASS: six migrations, then no ledger/column/sequence changes |
| Live Clerk/browser and application-role Admin CRUD/import integration | NOT RUN; application deployment requires separate approval |

Standard full-repository TypeScript commands were attempted and did not pass because existing package links/types are missing. No dependency installation or unrelated package repair was performed. The cache-based source/focused-test check above passed; it does not replace that outstanding repository tooling issue.

Run from the exact workspace:

```powershell
node tools/check-admin.mjs
node tools/run-admin-tests.mjs api
node tools/run-admin-tests.mjs frontend
node --test tools/phase6a-local/policy.test.mjs
node tools/promote-taxonomy.mjs --check
```

The unit runner disables environment-file loading and database test flags, selects only database-free tests, and uses installed package-cache modules plus the existing local native esbuild binary. It never installs dependencies or changes global package links. The typechecker checks application sources and the new focused tests using that cache. Standard `pnpm` typecheck currently encounters pre-existing missing package/type links; unrelated older test-source typing issues also remain outside this change. The isolated application/focused-test check does not claim those standard full-repository checks passed.

**Before local live use:** separately approve and apply the official migration to the existing application database through its reviewed upgrade workflow; verify/grant the application's role the required privileges on the four new tables. This task did not perform that deployment or role-permission test. The existing launcher's initial provisioning mode must not be used to reset an already populated database. Its ledger guard will refuse a five-entry ledger until the approved upgrade is complete.

After that approved upgrade, use the existing secure launcher with the verified application system identifier and its normal interactive credential prompts, in separate API/web terminals:

```powershell
# Supply the previously verified APPLICATION cluster identifier, not a disposable PID.
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier <verified-application-system-identifier> -Start
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier <verified-application-system-identifier> -Start
```

Do not enter credentials into source files or reuse disposable trust configuration for the application. Sign in with an existing active Admin account, open `/admin/taxonomy`, create reviewed records explicitly, then use `/admin/import` to preview and confirm drafts. A real Clerk/browser session and application-role CRUD/import integration were not exercised during this task; no application credentials were accessed.

## Files delivered

Created:

- `lib/db/drizzle/0005_exam_taxonomy.sql`, `lib/db/drizzle/meta/0005_snapshot.json`.
- `artifacts/api-server/src/lib/admin-content-validation.ts`, `taxonomy-admin.ts`, `question-import-files.ts`, `question-import.ts`.
- `artifacts/api-server/src/lib/taxonomy-admin.test.ts`, `question-import-files.test.ts`, `question-import.test.ts`.
- `artifacts/api-server/src/routes/admin-content.ts`, `admin-content.test.ts`.
- `artifacts/ccna-learning/src/components/admin-taxonomy.tsx`, `admin-question-import.tsx`, `admin-content.test.tsx`.
- `lib/api-client-react/src/admin-content.ts`.
- `tools/promote-taxonomy.mjs`, `test-taxonomy-migrator.mjs`, `check-admin.mjs`, `run-admin-tests.mjs`, `admin-unit.config.mjs`.
- This delivery document, `docs/development/admin-taxonomy-and-import.md`.

Modified:

- `lib/db/drizzle/meta/_journal.json` and existing `artifacts/api-server/src/lib/exam-taxonomy.schema.test.ts`.
- `artifacts/api-server/src/routes/index.ts`, `src/middlewares/body-parsing.ts`, and `vitest.config.ts`.
- `artifacts/ccna-learning/src/App.tsx`, `src/components/admin-questions.tsx`, `src/lib/admin-session.ts`, and `vitest.config.ts`.
- `lib/api-client-react/src/index.ts`.
- `tools/phase6a-local/policy.mjs` and `policy.test.mjs`: the separately approved six-migration inventory guard only.
- `docs/development/ccna-taxonomy-v1.md`.

Pre-existing taxonomy source, archived migration SQL, rehearsal profiles and unrelated uncommitted work were preserved. The already-dirty schema index and lockfile were not edited by this delivery.
