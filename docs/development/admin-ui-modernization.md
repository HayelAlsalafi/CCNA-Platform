# Admin UI modernization

## Audit before implementation

Verified workspace `<repository-root>`, branch `main`, HEAD `03b1452`. All existing uncommitted work is preserved.

- `src/App.tsx` owns `SharedShell`, its fixed desktop sidebar, icon-only mobile links, inline `AuthPanel`, and the authoritative `AdminPage` access gate. Clerk sign-out already uses `useClerk().signOut`; the displayed role comes from the session-scoped `/api/auth/me` response.
- `/admin` currently mounts `AdminTopicManager`; questions, taxonomy and import are separate routes. The shell exposes a single Admin link and a second row of basic links inside the Admin page.
- `components/admin-taxonomy.tsx` combines always-visible creation/editing fields, every blueprint's full hierarchy, and question association controls. Forms and the tree compete for attention; no catalog search or status filter exists.
- `components/admin-question-import.tsx` already has protected downloads, real preview responses, an explicit confirmation checkbox and transactional confirmation. Its long reference listing and plain table obscure the workflow and row errors.
- `admin-topics.tsx` and `admin-questions.tsx` preserve validated forms, existing mutation hooks, session lifetimes and Radix disable confirmations. They repeat inline field/table styles; wide question tables need mobile handling.
- `index.css` mixes Tailwind 4 `@theme` tokens with a custom warm-paper shell. Tailwind is configured through `@tailwindcss/vite`, not a separate JS configuration file. Most accessible Radix primitives under `components/ui` are already installed: dropdown-menu, sheet, dialog, alert-dialog, tabs, buttons, badges, tables and skeletons. The app already mounts a toaster.
- Real statistics are available through the Admin topic list, paginated question list's `total`, and taxonomy catalog arrays. No import history/coverage analytics endpoint exists; those statistics must not be invented.

Scope: frontend navigation, account menu, shared Admin components/styles, overview, topic/question presentation, taxonomy and import UX; focused offline tests and production compilation. API contracts, Clerk/RBAC policy, schema, migrations, grants and database data remain unchanged. No live write action will be exercised.

## Implemented experience

- The desktop sidebar groups learning and administration links, marks the current route and anchors the account menu at the bottom. Mobile navigation uses the existing Radix Sheet with a named dialog, focus management and labeled links. A skip link targets the main content.
- The account menu uses the matching Clerk user's name/username and initials. Its role comes from the session-scoped `/api/auth/me` response. It exposes the real Clerk profile action only when available, and keeps the existing sign-out redirect. Late sign-out errors cannot appear in another account's session.
- `/admin` is an overview with actual topic, question, blueprint and objective totals from existing endpoints. Loading placeholders and retry states replace unavailable totals. Topic management now has its own `/admin/topics` route; the other Admin routes retain their existing endpoints and access gate.
- Admin headers, module navigation, buttons, panels, status labels, searches, loading/empty/error states and session-owned success toasts share a restrained slate/teal palette. Styles load after the existing base CSS. Status always has text; keyboard focus is visible and reduced motion is respected.
- Topic search covers the returned topic list. Question search is explicitly labeled as searching the current page; existing server topic/status/difficulty filters and pagination remain intact. Tables retain explicit accessibility roles when they stack into mobile rows. Validation errors are associated with their inputs. Answer editing uses a narrower mobile grid.
- Taxonomy separates the searchable, status-filtered blueprint/domain/objective catalog from question associations using Radix tabs. Creation/editing lives in a labeled dialog. The hierarchy shows actual weights, source/verification metadata and record IDs. Guidance explains documentation URLs, ISO timestamps, six domains and total weight. Selecting Active requires an explicit review acknowledgement; the server remains authoritative. Objective selection is explicit, and existing primary-objective and full-assignment APIs are preserved.
- Import uses four visible steps: template, upload, review and import. CSV/XLSX downloads use the existing protected endpoints. The reference list is expandable and bounded. Preview shows real accepted/rejected/duplicate counts, searchable/filterable row errors, answers and explicit objective mappings. Filtering never changes the accepted count. An acknowledgement plus a final confirmation dialog precedes the existing confirmation request. Cancel writes nothing. Expired previews require another validation; real confirmation responses produce the result summary. Imported questions retain the existing unpublished/disabled draft behavior.

No backend, SQL, migration metadata, grant, authorization policy or dependency changes were made for this UI task. Existing uncommitted work from earlier phases remains present.

## Files touched for this UI task

Paths below are relative to the workspace. Several feature files already existed as untracked work from the preceding implementation; they were improved in place.

| File                                                                  | Change                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `artifacts/ccna-learning/src/App.tsx`                                 | Shared navigation, overview/topics routing and consistent Admin boundaries; existing access checks retained.     |
| `artifacts/ccna-learning/src/main.tsx`                                | Load Admin styles after base styles.                                                                             |
| `artifacts/ccna-learning/src/admin.css`                               | New scoped Admin design and responsive navigation/table/form styles.                                             |
| `artifacts/ccna-learning/src/components/application-navigation.tsx`   | New sidebar, mobile drawer and authenticated account menu.                                                       |
| `artifacts/ccna-learning/src/components/admin-ui.tsx`                 | New shared Admin presentation components and session-owned toast.                                                |
| `artifacts/ccna-learning/src/components/admin-overview.tsx`           | New real-statistics overview and module links.                                                                   |
| `artifacts/ccna-learning/src/components/admin-topics.tsx`             | Search, statuses, responsive table, linked errors and success toast.                                             |
| `artifacts/ccna-learning/src/components/admin-questions.tsx`          | Current-page search, responsive table/form, linked errors and success toast.                                     |
| `artifacts/ccna-learning/src/components/admin-taxonomy.tsx`           | Searchable hierarchy, dialogs, tabs, review guidance and labeled associations.                                   |
| `artifacts/ccna-learning/src/components/admin-question-import.tsx`    | Guided preview/confirmation/results and preview-expiry handling.                                                 |
| `artifacts/ccna-learning/src/components/admin-modernization.test.tsx` | New navigation/account/overview/taxonomy/notification interaction tests.                                         |
| `artifacts/ccna-learning/src/components/admin-content.test.tsx`       | Adapt existing interactions to dialogs; add cancel, expiry and row-filter regressions.                           |
| `tools/run-admin-tests.mjs`                                           | Include the new frontend test file in the database-free selection.                                               |
| `tools/check-admin.mjs`                                               | Include the new test file in the offline TypeScript check.                                                       |
| `tools/build-admin-ui.mjs`                                            | New installed-cache production compilation with env-file loading disabled and a unique ignored output directory. |
| `docs/development/admin-ui-modernization.md`                          | Audit, implementation, validation, operator instructions and acceptance checklist.                               |

## Actual offline validation

Executed from the verified workspace on `main` / `03b1452`:

| Check                                                                               | Actual result                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node tools/run-admin-tests.mjs frontend`                                           | **PASS: 78 tests, six files, zero failures or skips.** Includes existing session isolation, server-access, CRUD and catalog-refresh regressions, plus 16 added tests across the two updated/new UI suites. |
| `node tools/check-admin.mjs`                                                        | **PASS.** TypeScript for frontend, API, DB schema, API client and the selected focused tests, resolving already-installed packages.                                                                        |
| `node tools/build-admin-ui.mjs`                                                     | **PASS.** Vite production frontend build, 1,910 modules. Latest output: `.local/admin-ui-production-build/1791869770982`.                                                                                  |
| `node --check` for build/check/test tools                                           | **PASS.**                                                                                                                                                                                                  |
| Scoped `git diff --check` and diff inspection                                       | **PASS.** No whitespace errors; Git emits its existing LF-to-CRLF advisory for frontend files.                                                                                                             |
| Raw hashes for SQL migrations 0000–0005, journal, grant script and `.gitattributes` | **PASS:** unchanged from the reviewed baseline.                                                                                                                                                            |
| Live browser/Clerk/assistive technology checks                                      | **NOT RUN.** Computer-use inventory returned no available browser or app session.                                                                                                                          |
| Database, import writes, migrations, grants, seeds or integration tests             | **NOT RUN.** No database connection or live write action was performed.                                                                                                                                    |

One intermediate UI test failed because its loading assertion also matched an unrelated card's valid statistic; the assertion was narrowed to the loading card. The final suite above passed after all UI changes. The production build emits non-fatal sourcemap-location warnings for existing `tooltip.tsx`, `sheet.tsx` and `dropdown-menu.tsx` primitives. It loads no `.env` files and injects no Clerk credentials; its output is a compilation artifact, not an authenticated deployment bundle. The ordinary whole-workspace build and root `dist/` publication were not run.

## Local review instructions

The offline checks above can be repeated directly without installing packages or starting servers. They use the already-installed package cache and native build dependencies; missing dependencies cause failure rather than installation.

For authenticated manual review, use the existing guarded local launcher in separate PowerShell terminals, supplying credentials through its private prompts. These are operator instructions only; they were not executed for this task and do not apply migrations or grants:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Open the guarded web app at `http://127.0.0.1:8080/admin` with an actual authorized account. The launcher retains its server/schema/privilege preflight and may refuse an unexpected state. Do not bypass a refusal. No fake tokens or auth bypass are provided.

## Manual browser acceptance checklist — pending

- Review `/admin`, `/admin/topics`, `/admin/questions`, `/admin/taxonomy` and `/admin/import` at 1440, 1024, 768, 390 and 320 CSS pixels, including 200% zoom. Confirm no clipped controls or page overflow; inspect stacked table labels and answer controls.
- Navigate by keyboard. Verify the skip link, active route, visible focus, account menu arrows/Escape/focus return, drawer focus containment/Escape/focus return, tabs and dialog focus. Verify screen-reader names and announcements with an actual assistive technology. Check reduced-motion behavior and contrast on rendered surfaces. This implementation is not a WCAG certification.
- With real sessions, verify the name and database role; profile action and sign-out should use Clerk. A USER must remain denied Admin content. Switch/sign out during pending reads and confirm that old content and notifications disappear. Profile/sign-out actions are intentional session-changing manual checks.
- Compare overview totals with existing Admin lists. Exercise loading/network-error/retry and empty states; no unavailable count should appear as an invented zero.
- Search/filter the taxonomy hierarchy and open/cancel each creation/edit dialog. Check source URL, timestamp, domain weight and Active guidance. Inspect explicit association checkboxes/radio labels across blueprints. Saving associations or records is a write and needs a separately authorized manual test target.
- Download both real templates; inspect field guidance and reference IDs. Preview a valid file and files with errors/duplicates; confirm displayed counts and row filtering. Open/cancel confirmation, and verify no `/confirm` request occurs before the final action. Verify expired previews cannot confirm. Preview requests upload content for validation; use approved synthetic files. A successful live import is a database write and was not exercised here.
- Validate actual save/disable/import result announcements and rollback behavior only in an authorized write-test context. Do not use real question data just to exercise this checklist.

## Remaining functional gaps

- Live rendering, real Clerk interaction and assistive-technology acceptance are pending because no browser surface was available.
- Search on Questions covers the current page; global search would require an API change. Taxonomy question suggestions retain the existing first-100 query, with direct question-ID entry available.
- The API has no import-history or coverage-analytics endpoint. The overview labels these as future capabilities and displays no fabricated analytics.
- No backend changes were needed. Existing import limits remain 2 MiB, 500 rows and one worksheet with plain values; formulas/merged cells are unsupported. Existing single-answer behavior, question revisions, explicit classification and import transactions remain the backend's responsibility.
