> Superseded implementation note: the canonical 48-chapter development reset replaces the earlier reference-only / 33-navigation-chapter design described below. See [the current architecture and guarded reset runbook](canonical-48-chapters-reset.md). Application activation still requires the final execution approval recorded there.

# Admin Taxonomy: book chapter reference

Implemented incrementally on `main` at workspace `<repository-root>`, inspected HEAD `3c07b4bb7fe807e60dcbcd5539c046b919a9956f`. The existing shell, Admin authorization boundary, blueprint search/status filters, version/status editing, domain/objective forms and question associations remain in place.

## Data distinction and provenance

The existing canonical learner navigation in `artifacts/api-server/src/lib/curriculum-config.ts` contains **33 learning chapters**. Its module explicitly disclaims book attribution. It combines some subjects, uses navigation identities such as `d1-c1`, and contains neither book volume nor original chapter-number fields. It cannot represent the supplied 48 book chapters without changing the meaning of existing curriculum and topic bindings.

The new `ccna-book-chapters.ts` is the single canonical source **for this book reference**, using the user's exact 2026-10-17 classification. Each read-only record has a stable book-reference ID, volume, original chapter number, full title and exactly one primary domain code. These are not database UUIDs, official objective IDs or curriculum identities. No duplicate book registry, guessed chapter/objective cross-reference or database mapping was introduced. Book edition was not supplied; the UI records that limitation and does not claim verification against a particular edition or publisher table of contents.

| Domain | Exam weight | Primary chapters |
|---|---:|---:|
| 1.0 Network Fundamentals | 20% | 12 |
| 2.0 Network Access | 20% | 10 |
| 3.0 IP Connectivity | 25% | 9 |
| 4.0 IP Services | 10% | 6 |
| 5.0 Security Fundamentals | 15% | 7 |
| 6.0 Automation and Programmability | 10% | 4 |

There are 48 unique `(volume, chapterNumber)` pairs: V1 chapters 1–29 and V2 chapters 1–19. Exam weights sum to 100% and are not calculated from chapter counts. Filters never reweight domains or renumber chapters. The reference always describes the supplied CCNA 200-301 v1.1 mapping, independent of whichever editable blueprint version is selected in the management tab.

## UI behavior

- **Blueprints & objectives** retains the default tab and all existing management behavior.
- **Book chapters** adds six ordered domain sections, prominent exam weights, original primary chapter counts and semantic three-column tables: Book / Chapter / Chapter title. V1/V2 labels and original numbers remain visible. Headers/captions/row headers support assistive technology.
- The chapter search matches title, volume, number and domain, supports multiple words and combines with the volume selector. Result counts, clear filters and no-match state are provided. Displayed domain primary totals refer to the complete reference, while the result line reports the filtered total.
- **Question associations** retains its existing explicit mapping/primary-objective controls. The `?question=<UUID>` deep link still takes priority. Viewing/filtering book chapters sends no write requests and does not classify or publish anything.
- `?view=book-chapters` opens the new reference directly. Existing blueprint loading/error/retry behavior remains unchanged; the authenticated page must successfully load its taxonomy catalog before rendering the tabs.
- Tables wrap full titles on small screens, preserving the same three columns. The existing tabs wrap on narrow screens. Styles are isolated to book-specific classes and use the current theme/system components.
- Arabic column/filter labels and a local RTL table layout follow an existing `html lang="ar"` setting; English titles remain isolated LTR. There is no global language change or new language switch. The rest of the existing Admin page retains its existing localization behavior.

## Files

Created:

1. `artifacts/ccna-learning/src/lib/ccna-book-chapters.ts` — immutable supplied reference and pure filtering.
2. `artifacts/ccna-learning/src/lib/ccna-book-chapters.test.ts` — independent exact 48-title/number/primary-domain transcription and integrity checks.
3. `artifacts/ccna-learning/src/components/taxonomy-book-chapters.tsx` — accessible read-only reference view.
4. `artifacts/ccna-learning/src/components/taxonomy-book-chapters.test.tsx` — rendering, filters, RTL, deep links, keyboard navigation and retained management contracts.
5. `artifacts/ccna-learning/src/taxonomy-book-chapters.css` — scoped responsive layout.
6. This document.

Modified:

1. `artifacts/ccna-learning/src/components/admin-taxonomy.tsx` — additive tab/component and optional deep link, preserving the existing management implementation.
2. `tools/run-curriculum-tests.mjs` — focused `--taxonomy` selection and resolution of the already-installed native Windows dependency cache.
3. `tools/build-admin-ui.mjs` — same installed native-cache resolution, new book-view bundle markers and replacement of the obsolete `NETWORK COMMAND CENTER` smoke marker with the current source's `Dashboard sections`. No application dashboard code changed.

No API, schema, migration, permission or database changes were necessary. No database was connected to. Existing questions, answers, attempts, history, objectives and mappings were not modified. The 33 learning-navigation chapters remain intact.

## Verification

Run from the project directory:

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/run-curriculum-tests.mjs --taxonomy
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

The focused suite passed **68 tests in six files**, covering exact domains/weights/counts, every supplied title and primary placement, unique pairs, original numbering, 33-navigation-chapter separation, search/volume filtering, read-only browsing, Arabic labels/RTL, accessible keyboard tabs, deep-link precedence, retained blueprint/domain/objective edit/save contracts and existing question-association/authorization/API regressions. All requests in these tests are mocks; no database integration or destructive tests ran.

API/frontend/schema/client TypeScript checks passed. Production frontend compilation and bundle smoke checks passed; existing UI sourcemap and large-bundle warnings remain. The first tooling attempts could not resolve Rollup's Windows native package despite its existing cached binary; the tooling now resolves the installed cache without installation, lockfile edits or package-tree modification. The first build compiled but failed its obsolete dashboard text marker; the corrected current-source marker and new book markers passed.

## Manual verification

If the website is running, open `http://localhost:8080/admin/taxonomy` with an existing authenticated Admin account. If needed, start the existing services in separate terminals using the normal hidden local prompts:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Do not start a duplicate process on an occupied port; use the existing foreground services. No migration, seed, cleanup or grant command is required.

1. Select **Book chapters**, or open `http://localhost:8080/admin/taxonomy?view=book-chapters`.
2. Confirm 48 chapters, V1 29, V2 19, six domain sections and 100% total exam weight. Verify the domain counts/weights against the table above.
3. Check that V1 chapter 28 is Security Fundamentals, V1 chapter 29 is Network Access, and V2 chapter 19 retains its complete Ansible/Puppet/Chef title under Automation and Programmability.
4. Select **V2**, search `chef`, and confirm the one row is still V2 chapter 19 with domain exam weight 10%. Select **Clear filters** to restore all 48 rows.
5. Search a nonexistent title and verify the helpful no-match/reset state. Use Tab and arrow keys to navigate controls/tabs. Resize to tablet/mobile widths and check that full chapter titles wrap without truncation.
6. Return to **Blueprints & objectives**. Confirm search/status filters, blueprint selection and Create/Edit actions remain available. Open blueprint/domain/objective dialogs, inspect fields and **Cancel** to avoid writing records.
7. Open **Question associations** and inspect the existing controls. Do not save changes merely to verify this read-only UI enhancement. Existing save payloads and authorization are covered by automated regressions.

Live signed-in browser/visual verification was not performed by the agent; these manual steps remain for the local Admin session. No screenshot pixel-match or live database counts are claimed. The book edition remains unspecified, and no automatic reconciliation of book chapters with the 33 navigation chapters or current question mappings is performed.
