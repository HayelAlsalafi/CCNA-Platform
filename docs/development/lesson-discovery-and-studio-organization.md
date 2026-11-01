# Lesson discovery, studio organization and hierarchical learning navigation

Implemented 28 October 2026. No database migrations, grants, seeds or application
data writes were performed. Existing published revisions and learner data remain
untouched. No dependencies were installed and no Git commit/push was created.

## Discovery defect and correction

`chapterLessonList()` selected published revision ID/number from PostgreSQL but
omitted them from the serialized summary. The generated
`GetChapterLessonsResponse` contract requires `revisionId` and `revisionNumber`.
An empty `items` array passed validation, while a real non-empty chapter could
produce HTTP 500 / `LESSON_RESPONSE_INVALID` in the existing route handler. This
source defect reproduces the reported availability error; authenticated inspection
of the user's current lesson was not performed during this implementation.

The service now includes both fields from the selected immutable revision. Its
existing revision-pointer join, chapter binding, active topic/blueprint predicates,
published snapshot fields and `display_order,id` sorting remain unchanged.
No draft fields are substituted for missing publication data. A regression test
passes an actual non-empty service result through the generated response validator.

The learner path remains:
`/topics` → Start Learning → `/learn/chapters/:chapterId` →
`/learn/chapters/:chapterId/lessons/:lessonId`.
The authenticated endpoint remains `GET /api/chapters/:chapterId/lessons`.
Availability failures retain a retry action and now include the meaningful lesson
error text. Start Practice and question availability remain independent.

## Student navigation and reader

- Domain → volume section → chapter → ordered published reading lessons, using
  existing canonical curriculum IDs/titles/order without new curriculum records.
- Native expandable domain/chapter controls; selected ancestors open
  automatically. Lesson numbering follows the server-published order.
- Chapter metadata loads only when its chapter is expanded. There is no eager
  request per curriculum chapter and no fetch of every revision or lesson body.
- Current lesson uses `aria-current="page"`. A navigation-local observer reveals
  it inside the independently scrolling sidebar without scrolling the article.
- The mobile drawer reuses Radix Sheet: accessible title/description, focus
  handling, Escape dismissal and close-on-navigation. Native summaries remain
  keyboard-operable; links/buttons have visible focus styles.
- Actual CLI, knowledge-check and external lab-reference blocks in the selected
  published lesson receive numbered anchor links and distinct icons. These are
  authored blocks, not invented activities or executable lab simulations.
- Desktop places navigation left, article center and a real table of contents on
  the right at wide widths. Narrower layouts retain the TOC above the article and
  use the mobile drawer below the navigation breakpoint.
- Existing previous/next lesson links within a chapter, chapter catalog,
  typography controls, light/dark reading, reading time, safe media, code copying,
  local self-checks and immutable published content are preserved. Breadcrumbs
  include the domain, chapter and selected lesson title.

Reading position is computed from actual viewport scrolling and clearly remains
local to the page. It is **not persisted completion**, does not change learner
progress and never marks a lesson completed/in progress. No completion badges,
streaks, fabricated progress or placeholder published lessons are displayed.
Cross-chapter/domain navigation uses the sidebar; previous/next remains scoped to
the current chapter, preserving the existing API contract.

## Lesson Studio organization

The existing authoring drawer, content editor, unsaved-change protection,
session-bound saves, preview, publish/unpublish and revision history remain intact.
The inventory now groups each page under expandable domains and chapters.
Summary metrics are database counts: total lessons, published lessons, drafts and
chapters containing lessons. Group counts explicitly say “on this page.”

Search is debounced 300 ms and searches title, description, stable lesson UUID,
chapter name and domain name on the server. Filters cover domain, canonical
chapter, publication status, book volume and last-updated cutoff. Date cutoff is
explicitly UTC. Page sizes are 10/25/50, with stable session-scoped query keys,
loading/error/empty/retry states, reset-on-filter-change and clear filters.

The existing model has a nullable published revision pointer, not a separate
UNPUBLISHED status. Consequently the UI accurately offers **Draft / unpublished**
for a null pointer and **Published** for a non-null pointer. It does not infer a
historical status that the database does not store.

Each item shows chapter placement, status, order, estimated reading time, last
modified date and published revision number when present. Edit/preview opens the
existing drawer, including publication controls. Links open the learning chapter
and the published reader when available. Domain placement follows the selected
canonical chapter; administrators cannot independently assign contradictory domain
and chapter values. Existing “unpublish before moving” restrictions remain.

Up/down ordering reuses `POST /api/admin/lessons/reorder`. It first loads the full
selected chapter using the existing bounded Admin metadata endpoint, verifies the
selected lesson version, then submits a complete version-checked order. A search
or page can never renumber only its displayed slice. All existing transaction,
lock ordering, chapter checks and stale-version rejection remain active. An
ordering update invalidates Admin inventory and learner chapter/reader queries.

The existing 200-lesson-per-chapter metadata limit remains; an oversized chapter
returns an explicit error instead of a truncated reorder. Individual display-order
editing is still available in the existing editor. Library pagination itself has
no 200-lesson global inventory cap. No index was added; very large substring
search workloads may warrant a separately approved index later.

## Additive API contract

`GET /api/admin/lessons/library` is registered before the dynamic Admin lesson ID
route and protected by the existing authenticated database ADMIN boundary.

Query parameters (unknown properties rejected):

| Parameter | Validation / behavior |
| --- | --- |
| `q` | Trimmed literal substring, maximum 200 characters |
| `chapterId` / `domainId` | Optional UUID filters |
| `domainCode` | Optional `1.0` through `6.0`; UI maps canonical `d1`–`d6` IDs to codes |
| `status` | `DRAFT` or `PUBLISHED` |
| `volume` | `V1` or `V2` |
| `updatedAfter` | Offset-qualified ISO date/time |
| `page` | Integer 1–100000; default 1 |
| `pageSize` | 10, 25 or 50; default 25 |

Response: `{items,total,page,pageSize,summary}`. Items extend existing Admin summary
metadata with domain ID/name, chapter title, volume/number and published revision
number. `total` is the filtered count; `summary` contains global
`{total,published,drafts,chapters}` counts. Content blocks/objectives and historical
revision bodies are excluded. Existing list/detail/mutation and generated learner
contracts are unchanged. The additive library response has an explicit route Zod
validator and exported client types in `lessons.ts`, following existing manually
typed management APIs; existing generated files were not hand-edited.

One repeatable-read READ ONLY transaction executes a global summary, filtered
count and paged metadata query, plus readiness inspection. SQL parameters are
bound; literal search is not interpolated into SQL or treated as a wildcard.
Joins avoid per-row metadata queries. Pagination does not load the entire lesson
collection or content into the browser.

## Verification and limits

| Check | Actual result |
| --- | --- |
| `node tools/run-curriculum-tests.mjs --lessons` | **186 passed**, 10 files; database-free fixtures |
| `node tools/check-admin.mjs` | PASS: frontend, API, schema and client TypeScript |
| `node tools/build-admin-ui.mjs` | PASS: production build, 1962 modules |

Focused tests cover the non-empty generated discovery contract, immutable snapshot
serialization, draft isolation, literal search/pagination/filter validation,
read-only metadata queries, database-controlled Admin authorization, current
chapter highlighting, lazy cross-domain chapter queries, ordered lesson links,
retry behavior, mobile dialog labeling/Escape/selection, actual block activities,
existing save/publish behavior and curriculum/Start Practice regressions.
The old lesson metadata test was updated to recognize the already-approved and
applied 0013 migration and to compare its unchanged official/proposal SQL.

Build emitted existing UI source-map notices and the large-chunk warning. No
unrelated test failures were investigated. No database integration tests or live
database connections were made for this feature. Actual signed-in learner/Admin
workflows and rendered desktop/mobile visual verification were **not performed**;
browser access was not available. Automated dialog behavior is not a substitute
for rendered viewport verification.

Deferred: persisted completion/resume, bookmarks/highlights/notes, interactive IOS
exercises, executable practical labs, Packet Tracer attachments and a separate
chapter-review activity model. The current activity derivation is extensible;
none of these future capabilities are represented as functional.

## Files changed

- New `artifacts/ccna-learning/src/components/learning-sidebar.tsx`.
- Reader, chapter learning action, Admin lesson manager and scoped `lessons.css`.
- Lesson service, query validation and Express lesson routes.
- Typed library response in `lib/api-client-react/src/lessons.ts`.
- Existing lesson service, route and component test files.
- This report. No migration/schema/history file changed.

## Local verification

Restart the API to load the corrected response and additive route. Stop existing
API/frontend terminals with Ctrl+C, then use the existing guarded launchers in
separate terminals from the project directory:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Enter existing credentials/Clerk keys only at the hidden local prompts. Do not
rerun activation. At `/topics`, open Start Learning for a published chapter and
verify the sidebar, reader links, TOC and Start Practice independence. At
`/admin/lessons`, verify search, filters and grouped pages. Review any real ordering
or publication change before intentionally saving it; this implementation did not
perform those writes on existing content.
