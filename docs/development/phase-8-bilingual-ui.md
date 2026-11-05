# Phase 8 — bilingual interface

Updated 2026-11-05 (Asia/Riyadh). **Source implemented; browser acceptance pending.** Current acceptance results and manual checklist: [final bilingual verification](phase-8-final-acceptance.md). Earlier run counts below are historical. This report does not certify Public Beta readiness or authorize a Git checkpoint.

Baseline: `ffeb8a92c2bb5fd97a3f173674e085b079f1cd66`, main. Source-only work; no database or storage connections.

## Inventory and implementation plan

| Surface | Existing components | Localization scope |
| --- | --- | --- |
| Shared shell and account | nexus-shell, application-navigation, App, UI primitives | Navigation, language preference, dialogs, accessibility, auth boundary messages |
| Dashboard and analytics | nexus-overview, command-center-insights, learner-profile, nexus-history | Headings, metrics, dates, empty/error states |
| Curriculum and learning | curriculum, learning-progress, learning-sidebar, lesson-reader | Navigation, reader controls, study tools and export UI |
| Practice | nexus-practice, practice-workspace, practice-run-workspace | Setup, interaction labels, feedback UI and history |
| Exams | exam-configuration, exam-simulator | Configuration, active session controls, results and history; preserve server state |
| Administration | admin-*, question-bank-studio, question-studio-editor, topics-manager, taxonomy, lesson editors | UI, publication/import/deletion confirmation, monitoring and media UI |

No existing i18n library was found. Use a small React context, typed English source keys and centralized Arabic dictionary, exact interpolation and Intl formatting. Mount once above application providers; never key routes, queries, or session components by locale. English defaults; only the locale code is stored locally. Stored content is not translated. Adapt logical layout and primitive direction without changing authentication or business rules.

Static-source inventory found 1,506 UI text/attribute occurrences (1,264 distinct) before dynamic labels, errors and shared primitives. Coverage and verification will be reported explicitly; compiling the foundation alone does not establish full localization.

## Implementation

- `src/i18n/{index.tsx,messages.ts,dynamic-messages.ts,quantities.ts,clerk.ts,rtl.css}` provide typed source-message keys, Arabic resources, required interpolation parameters, exact-key English fallback, Intl formatting and Arabic's six plural categories. React renders escaped text; there is no HTML or DOM text-replacement layer and no translation service/dependency.
- The provider lives above the existing application root. No route, actor, query, session or editor is keyed by locale. Only `ccna-nexus.language` is stored locally; denied storage leaves a usable session preference. New preferences default to English. Document `lang` and `dir` update together.
- Application navigation and sign-in/sign-up pages expose language selection. Radix tabs, select and dropdown roots receive the current direction. Sidebars/drawers move with direction; desktop, compact and focus reading offsets are preserved. Dialog controls and menu spacing use logical edges. Existing content directions are retained; questions use `dir=auto`, and code/commands remain LTR and isolated.
- The inventory surfaces above now use centralized UI translations, including reader/study controls, export dialog, practice, Exam setup/active/results/history, dashboard, studios, import, monitoring and confirmation controls. Existing content, domain/chapter titles, notes and answers are rendered verbatim. Explicit UI enum labels can be translated without changing their API values.
- Clerk receives presentation-only localization overrides for common sign-in/sign-up, account menu and field labels. Proxy, identity, roles, redirects, strategies and session behavior are unchanged.

## Integration corrections

Initial regression runs caught missing spaces between translated labels and values. Original JSX boundaries were restored; existing assertions were retained. A temporary Windows source-conversion step also corrupted some Arabic dictionary values; these were replaced with UTF-8 resources and a regression now rejects replacement characters/question-mark corruption. The one-time writing tools were removed.

The full run exposed an existing Topics search-timer race: the initial empty-search debounce could return the user to page one after navigation. The minimal guard now schedules a reset only when search differs from its debounced value. Existing search, filter, pagination and exact selected-ID tests remain mandatory. No authorization, query eligibility or persistence model was changed.

## Verification scope and remaining acceptance

Localization tests cover preference defaults/reload/denied storage, document language/direction, English fallback, escaped interpolation, dictionary placeholders/encoding, Intl categories, typed invalid-key rejection, technical LTR isolation and actual desktop CSS offsets. Actual Exam, Arena, legacy practice and Lesson Reader fixtures exercise switching without replacing DOM/session state or issuing requests/writes. Admin navigation tests retain server-derived role denial. These use isolated mocked boundaries, not real authentication or persistence.

`node tools/check-ui-localization.mjs` is read-only and inspects only frontend source. It reports direct JSX text, display attributes and conditional/templates; technical identifiers are explicitly excluded. A zero finding count is limited to those syntactic categories: it is not proof about arbitrary runtime API strings, third-party screens or educational content.

Remaining untranslated areas are explicit fallbacks: unknown server/validation errors, advanced Clerk verification/account flows not covered by the supplied overrides, and existing generated export-document labels. Stored educational/catalog content and technical identifiers intentionally remain in their original language. No automatic translation is claimed.

Browser discovery failed: native pipe and browser access host unavailable. Desktop/tablet/mobile visual acceptance remains **PENDING**, including Arabic wrapping/overflow, portal alignment, charts, keyboard navigation and real Clerk locale changes. Review `/`, `/topics`, `/learn/...`, `/practice`, `/exam` (active and submitted), `/profile` and Admin pages in both languages at approximately 1600, 900 and 390px. Verify language changes retain real exam answers/flags/deadline and private unsaved notes.

No database/storage connections, SQL, migrations/schema/contract edits, dependency changes, services, Git staging/commit/push/tag or deployment occurred. The initial pass did not run backend suites; the final acceptance pass subsequently passed the complete non-database API suite. DB/live authentication/storage/backup/restore and persisted learner writes were not run. Production compilation uses the existing isolated build helper with environment files disabled; its output is not a configured deployment artifact.

The initial checkpoint recommendation below was superseded by [final bilingual verification](phase-8-final-acceptance.md): **code checkpoint GO for owner review; visual acceptance NOT VERIFIED; Public Beta deployment NO-GO**. The following evidence preserves the earlier run history.

## Final evidence

| Check | Result |
| --- | --- |
| Last full frontend run | 498 PASS / 1 FAIL, 44 files, 499 cases. The sole failure was a pre-existing fixture assuming the first POST was creation; the read-only readiness POST could precede it. |
| Studio fixture correction | Persistence requests now exclude only the exact read-only readiness endpoint; assert exactly one real write, the creation path, DISABLED payload and no PATCH. Studio suite: 27 PASS; the final duplicate-case correction: 1 PASS / 26 unselected by name filter. No assertion was skipped in source. The whole suite was not rerun after this test-only correction. |
| Topics + actual Arena + localization suites | 50 PASS, 5 files after the debounce correction and actual `/practice` locale-preservation regression |
| Focused navigation/localization/RTL suites | 40 PASS, 4 files; includes the real desktop CSS offset/focus regression |
| Root `pnpm run typecheck` | PASS on final source |
| `node tools/pilot-production-build.mjs` | PASS on final source, isolated `%TEMP%/ccna-pilot-build-MKFY3C`; API/frontend production compilation only |
| Source localization inventory | 1,912 typed call sites; zero remaining direct/conditional/template findings within the checker's declared scope |
| Diff / boundaries | `git diff --check` PASS. No DB/schema/migration/API/contract/lockfile changes. Targeted secret-pattern scan found no matches or unexpected files. |

Compilation retains existing UI sourcemap and large-chunk warnings. The main optional-feature bundle remains large; no new dependencies were added. The final working tree contains 72 changed/new project files: frontend, this report and the read-only coverage checker. HEAD remains `ffeb8a92c2bb5fd97a3f173674e085b079f1cd66`, branch `main`, index empty. Temporary source-writing helpers were removed; build outputs remain outside the repository.
