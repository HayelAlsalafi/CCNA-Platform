# Phase 8 — final bilingual verification

2026-11-05 (Asia/Riyadh). Baseline `ffeb8a92c2bb5fd97a3f173674e085b079f1cd66`, branch `main`. Source-only verification; no database/storage connections or Git publication. This document supersedes the earlier verification counts in [implementation report](phase-8-bilingual-ui.md).

## Review and corrections

Reviewed the complete original 72-file working tree plus the scoped follow-up files. The review combined source/dictionary checks, full changed-file classification, protected JSX-property comparisons and inspection of navigation, route actors, reader/study controls, studios and shared primitives. Across 55 modified production TSX files, existing `key`, `href`, `checked`, `disabled`, `onClick`, `onChange` and `value` expressions were retained; additions were explicit option values and presentation-component values. Locale never becomes a session/query/route key. Auth and business-rule implementations remain unchanged.

Confirmed gaps corrected:

- Application-owned validation, copy/upload/export/save notices and numeric status messages now use explicit presentation adapters. Numeric matching is limited to seven registered bounded patterns; arbitrary external messages remain verbatim. Validators still return their original values and publication checks are unchanged.
- Generated field labels, table headings, filter placeholders, queue states, enum/palette choices and read-only status labels are localized. Every translated option retains its original explicit `value`; the actual Studio regression verifies HARD remains HARD while its label changes.
- RTL compact-sidebar expand/collapse icons now indicate opposite actions correctly. Calendar month/day labels use the selected locale without changing dates or analytics queries.
- UI strings matching educational content are isolated: the regression uses stored `Save` and `Question` text to prove the content does not pass through the UI dictionary. Code and IP text remain exact.
- The prior readiness-POST fixture correction is retained with exactly one real persistence request required. No assertion, test or security guard was weakened or removed.

The coverage checker now includes direct/conditional/template text, application notification literals/templates, and translated options lacking explicit values. Its result is scoped source evidence, not a claim that every arbitrary runtime string is translated.

## Automated evidence

| Verification | PASS | FAIL | Scope |
| --- | --- | --- | --- |
| Complete frontend suite | **503** | **0** | 44 files; one complete run after final production fixes |
| Complete non-database API suite | **835** | **0** | 49 files; one complete run, excludes `**/*.db.test.ts` and the config's DB integration files |
| Focused Studio/localization/topics preflight | **61** | **0** | 5 files, including the prior readiness fixture suite |
| Final localization-only preflight | **16** | **0** | 3 files |
| Root `pnpm run typecheck` | **PASS** | — | Final source, all existing project references |
| Production compilation | **PASS** | — | `node tools/pilot-production-build.mjs`, API/frontend in `%TEMP%/ccna-pilot-build-TIKtgi`; no env files or running artifact replacement |
| Source coverage / diff | **PASS** | — | 1,922 typed translation call sites, zero findings in the declared scanner scope; `git diff --check` passes |

No source assertions were skipped, weakened or deleted. The focused name-filter rerun selected one new test; unselected cases were not counted as passes and all subsequently ran in the complete suite. A new Studio test initially queried beneath the React root instead of the actual Radix portal; the selector was corrected to inspect the real document-mounted dialog.

The build retains existing UI sourcemap warnings and large-chunk warnings (main bundle about 1,041 kB minified; optional ExcelJS about 937 kB). No dependencies were added/upgraded. This compile-only output is not a configured deployment artifact.

Working-tree review: **74 files** (the original 72 plus `src/i18n/validation-messages.ts` and this report). Groups: 62 frontend runtime files, 9 frontend test files, 2 documents and 1 read-only coverage tool. All remain uncommitted; HEAD is unchanged and the index is empty. Tracked diff: 61 files, 2,168 insertions / 2,431 deletions; new source/docs/tool files are additional. Targeted secret-pattern/path classification found no matches or unexpected files. No schema, migration, API, contract, auth mechanism, lockfile or dependency file was modified.

## Remaining English / original-language text

| Category | Treatment |
| --- | --- |
| Unknown server, provider or external-service error detail | Verbatim fallback; known application-owned wrappers are translated. Do not guess or hide an unfamiliar error. |
| Advanced Clerk verification, recovery and account settings | SDK fallback where the current presentation overrides do not define a key. Requires real Clerk/browser acceptance; no authentication strategies or session settings changed. |
| Stored lessons, questions, choices, notes, catalog titles, source quotations | Original text and authored direction retained intentionally. No automatic educational translation. |
| Commands, IPs, URLs, codes, stable IDs, HTTP/JSON/CSV/XLSX/DOCX/PDF identifiers | Technical spelling retained; code/technical runs isolated in LTR. |
| Generated export-document headings | Existing file-generation language/schema retained; the web export controls and application-owned export errors are bilingual. |
| Rare operator diagnostics with dynamic API field details | Unknown detail stays verbatim; dictionary fallback is explicit, not a fabricated translation. |

## Manual visual checklist — NOT VERIFIED

Browser inventory returned no available browser; native pipe and browser access host are unavailable. **No visual acceptance is claimed.** Run every row in **both English and Arabic**, toggling back and forth, at **1600×900**, **900×1000** and **390×844**, zoom 100%. Check document `lang/dir`, keyboard focus, readable long Arabic labels, wrapping, horizontal overflow, internal scrolling and portal placement. Reload once to confirm the language preference.

Do stateful checks only in a separately approved disposable/staging environment. On main, do not start/submit exams, save notes/drafts, upload, publish or delete as part of this read-only review. Use already authorized unexpired test sessions for state-preservation acceptance; timers may submit automatically at zero.

| Exact page / entry | Action and expected result | Status |
| --- | --- | --- |
| `/` | Toggle locale, dashboard tabs and sidebar collapse. Route/tab/collapse state stays; charts, legends and calendar labels remain readable. Arrow-key navigation follows direction. | NOT VERIFIED |
| `/topics` | Expand a domain/chapter, switch language. Current expansion/navigation stays; stored catalog names are unchanged; selected navigation is correct. | NOT VERIFIED |
| `/learn/chapters/9d8bd104-2bc5-59c8-a417-367996c7d8b9` | Canonical V1 chapter 1. Open an existing published lesson via its real link; if none exists, use another available published lesson from `/topics`. Do not invent a lesson ID. | NOT VERIFIED |
| `/learn/chapters/<chapterId>/lessons/<existingLessonId>` | Switch with an unsaved local note and existing saved position; focus width, current section, draft note and saved position remain. Inspect Outline/My Study/Progress, tables, media, CLI/code/IPs and export dialog. No unintended save/completion. | NOT VERIFIED |
| `/practice` | In an approved active test session, retain question order, choices, flags and navigation after switching. Buttons localize; question/answer text and IPs do not. No locale-triggered save, finish or new session. | NOT VERIFIED |
| `/practice/history` | Retain filters/page and original answer content; inspect source links, details, timestamps and tables on mobile. | NOT VERIFIED |
| `/exam` and `/exam?session=<existingUnexpiredTestSessionId>` | Retain setup count/duration/filters, or active session ID/order/answers/flags/original server deadline. Countdown continues; no duplicated submit. Inspect an already submitted session's score/review/history without creating new data. | NOT VERIFIED |
| `/profile` | Inspect real metrics, calendar, achievements and mixed-direction technical names; no invented statistics or changed evidence. | NOT VERIFIED |
| `/admin`, `/admin/topics`, `/admin/questions` | With an authorized Admin, inspect monitoring, filters/table headings, Studio field validation, enum labels/values and unsaved form state. Learner account must remain denied. | NOT VERIFIED |
| `/admin/lessons`, `/admin/taxonomy`, `/admin/import` | Inspect existing content, shared toolbar, preview, media dialog and import help. Open confirmation dialogs then cancel; no save, upload, import, publication or deletion. | NOT VERIFIED |
| `/sign-in`, `/sign-up`, existing account menu | Inspect language selection and common Clerk labels, keyboard behavior, real proxy/redirect/session behavior and fallback text. No configuration or role changes. | NOT VERIFIED |

## Decisions

**Phase 8 code checkpoint: GO for owner review/approval.** Automated verification passed and known application-owned presentation gaps were corrected; the documented provider/technical fallbacks remain explicit. This is not approval to stage or publish, and no Git mutation occurred.

**Visual acceptance: NOT VERIFIED. Public Beta deployment: NO-GO** pending its independent live/configuration/security/recovery acceptance. No main/isolated DB operations, SeaweedFS operations, real authentication, persisted learner writes, live backup/restore, service restart, deployment or Phase 9 work was performed.
