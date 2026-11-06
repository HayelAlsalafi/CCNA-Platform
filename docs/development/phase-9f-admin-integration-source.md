# Phase 9F — contract-limited multi-course admin interface

2026-11-06 (Asia/Riyadh). Owner-provided branch/baseline:
`backup/phase9-source-wip` / `00d8e98`. No Git commands were run in this task.
Existing 9B–9E source and local changes were preserved.
**SOURCE COMPLETE for the available read-only interface and honest disabled
states; backend catalog management and staff analytics remain unavailable.**
Database activation and Public Beta: **NO-GO**.

## Added interface

Direct route `/admin/catalog` mounts `CourseCatalogAdmin`. It uses existing
AdminPanel/AdminButton, authenticated session boundaries/query cleanup, Wouter,
React Query and the central English/Arabic dictionary. Existing CCNA admin screens,
navigation, role-management APIs and legacy routes were not replaced or redesigned.
The new page links back to `/admin`; no new legacy sidebar visibility rule was added.

The page first reads existing `/api/admin/rbac/me`. It conservatively admits only
explicit server-reported **GLOBAL OWNER/ADMIN** assignments, not token claims or
legacy ADMIN alone. Missing/inactive RBAC, COURSE assignments, other roles and
signed-out identities show denied/unavailable states without catalog requests.
This is admission to a UI, **not a new backend privilege**. Existing catalog APIs
remain authenticated learner-visible reads with their current visibility rules.
No private/draft resource is made visible merely by that UI admission. Broader
staff roles need a reviewed backend capability before this page can expand access.

Three hierarchical, bounded lists reuse only actual 9C GET contracts:

- `/api/catalog/tracks?page=N`
- `/api/catalog/tracks/:trackId/courses?page=N`
- `/api/catalog/courses/:courseId/versions?page=N`

Identifiers come from validated parent responses, not arbitrary course input.
Changing a parent/page clears child selections; parent errors or removal clear
stale descendants. Responses require the expected page, fixed 20-item page size,
bounded unique UUIDs and string titles. Errors have no local/demo fallback, raw
driver output or automatic retries. Query requests consume abort signals, use
the existing no-store transport, and partition cache by Clerk user/session.
`/api/catalog` is added to existing Admin session cleanup. Language changes do not
change query keys or selection state.

## Explicit missing capabilities

| Requested capability | Actual contract and UI behavior |
| --- | --- |
| Full publication-state inventory | 9C returns ACTIVE-visible entries and **does not return a publication-state field**. The page explains that drafts/retired entries are not included and renders state **UNKNOWN**, never fabricating DRAFT/PUBLISHED/ACTIVE from an absent field. |
| Draft track/course/version management | No catalog write contract or catalog-management capability exists. Three create-draft buttons are disabled with a visible shared explanation. No forms silently save locally, POST/PUT/PATCH, publish controls, activation calls or guessed endpoints. |
| Enrollment totals | 9E exposes a caller's own records only, no staff aggregation. UI renders UNKNOWN/unavailable, not zero or a count of the current Admin's personal enrollment mislabeled as all learners. |
| Staff learning analytics | 9E requires exact caller-owned enrollment/course/version. This page never calls it for a learner or tries an arbitrary learner UUID; no staff summary, impersonation or RLS bypass was added. |
| COURSE RBAC / entitlement operations | COURSE assignment is still disabled; no new role/capability, paid-access shortcut, entitlement mutation or delegation UI. |

No API, schema, proposed/historical migration, contract, flag, launcher, 503 barrier,
Clerk verification, publishing rule, grading, deadline, educational content, learner
record or storage path was changed. Existing API-level protection still applies;
there is no claim of completed Phase 9D enforcement.

## Layout and localization

Existing tokens/components, fluid single-column lists with a three-column desktop
grid, minimum-width constraints, wrapping buttons/IDs, logical text alignment,
pressed selection states, named regions and clear disabled explanations. Arabic
inherits document RTL from LocaleProvider; technical UUIDs are isolated LTR and
stored catalog titles use `bdi dir=auto` without translation. Long mixed-language
titles can wrap without imposing authored-content direction.

New keys live in `i18n/catalog-admin-messages.ts` and are merged into the existing
typed dictionary. No new localization dependency, framework or layout system.

## Files and verification

New: `components/course-catalog-admin.tsx`, its `.test.tsx`,
`i18n/catalog-admin-messages.ts`, and this report.
Scoped edits: `App.tsx` (import/route), `lib/admin-session.ts` (catalog cache family),
`i18n/messages.ts` (dictionary merge). No backend edits or new dependency.

Final focused evidence: **32 distinct tests PASS / 0 FAIL** (12 catalog-UI cases
in the final affected-suite run, plus 5 existing GLOBAL administration and 15
existing localization cases from the initial focused run). Repeated catalog cases
are not double-counted. Final root `pnpm run typecheck`: **PASS**. No full suite
or production build was run. TypeScript verification covers production code; an
initial import/translation-key union mismatch was corrected using the existing
dictionary API and a precise three-heading key union, without weakening assertions.

Tests cover signed-out/denied/inactive/Course-scope admission, real GET paths,
disabled writes and UNKNOWN analytics, no learner/analytics requests, Arabic
direction and selection preservation, malformed responses, session cache cleanup,
translation entries and stale-parent removal. All service/identity boundaries use
fixtures. **Interactive visual/browser acceptance NOT VERIFIED**, including mobile
overflow, keyboard focus and desktop/tablet/mobile RTL rendering. No live service
was contacted or started, and no visual acceptance is claimed.

Activation dependencies remain: reviewed backend draft/publication capability,
bounded minimized staff enrollment/analytics authorization if desired, independent
9D enforcement completion, and separately approved recovery/SQL/security/startup
verification. None is authorized or bypassed by this UI milestone.
