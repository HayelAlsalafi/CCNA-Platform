# Phase 2D — media, study tools and Neon readiness

Updated 2026-10-31 (Asia/Riyadh). Overall: **PARTIAL**. Source implementation and focused offline verification are finished; live acceptance and media activation are not.

| Area | Status | Verified result / remaining gate |
| --- | --- | --- |
| H1–H6 | PARTIAL | Actual shared-toolbar H1 fixture, mark retention, serialization and existing renderer tests pass. Live “Invalid input” has not been reproduced in the authenticated application. |
| Media Library | PARTIAL; live uploads BLOCKED | Computer selection, drop, bounded batch uploads, transfer feedback, gallery/search, reuse, edited copies, crop/rotation/ratio and optimized variants implemented. Isolated real-file storage/retrieval passes; metadata SQL is mocked. Requires separate metadata migration approval and configured persistent storage. |
| Reading position | PARTIAL | Incorrect non-scrolling overflow ancestor selection fixed; local measurement, nested scrolling and existing save/resume fixtures pass. Real scroll → save → refresh → resume remains pending. |
| Study organization | PARTIAL | Lesson filtering and date sorting added to existing owner-scoped tools; existing note/highlight/bookmark behavior retained. No real learner mutations performed. |
| XLSX/DOCX/PDF | PARTIAL | Real file generation and package integrity pass. First/last pages of an eight-page mixed Arabic/English PDF visually inspected. Authenticated browser downloads and Office visual acceptance remain pending. |
| Neon local compatibility inventory | COMPLETE | Pinned local database inspected read-only; no external data transfer. Cloud staging/cutover remain NO-GO until separately approved and verified. |

## H1 investigation and correction

The supplied error was only “Invalid input”; browser access was unavailable. A short, valid H1 succeeds through the actual toolbar in an isolated editor fixture. It is therefore **not established** that the reported live error has the same cause as the reproduced source defect.

Confirmed source defect: converting a formatted explanation longer than 200 characters to a structured heading produced invalid content. The existing heading constraint is 200 characters. Conversion now refuses that incompatible operation with specific guidance and retains the original text/marks. Valid H1–H6 use the active Tiptap `setHeading` command rather than substituting external block state. The nonblocking semantic hint remains. API validation now identifies heading-level and heading-length failures instead of leaving these diagnostics generic. No validation limits were relaxed.

The current API and frontend must both load this source before live acceptance. No service was restarted. Persistence/publication against PostgreSQL was not tested by writing a disposable lesson, because this execution preserved application records.

## Media implementation and activation boundary

The previous implementation offered URL fields and an upload API but lacked a computer-upload authoring workflow and configured persistent storage. The existing `lesson_media` table also lacked searchable names/captions and variant/edit metadata. Metadata alone does not store binaries.

The new picker supports up to ten PNG/JPEG/WebP files per batch, drag/drop, client preparation, transfer progress, separate processing feedback, 24-item paginated thumbnails, filename/caption search, reuse and insertion into the selected draft image block. Existing alt text, width and alignment controls remain. Image dimensions survive the lesson contract and render as explicit dimensions. Private reader images defer authenticated blob retrieval until near the viewport; external images retain native lazy loading. Object URLs and requests are cleaned up.

Server processing verifies signatures and actual decoding, rejects executable/SVG and multi-frame content, bounds input to 5 MiB / 32 megapixels / 8192px, limits processing concurrency and uses processing timeouts. Metadata is stripped. Delivery uses WebP up to 2000px, thumbnails up to 320×240px, and an optional metadata-stripped master up to 4096px. Rotation, numeric crop and aspect ratios produce a new opaque media ID. The local preview shows rotation/ratio, **not an exact interactive crop rectangle**; that editing experience remains partial. If no master was retained, later copies derive from the delivery image and cannot recover discarded pixels.

`LessonMediaStore` supports a server-only S3-compatible adapter. Immutable conditional puts prevent overwrites. Reads are bounded and hash checked. The local adapter is explicitly `local-test` and refused in production; there is no silent ephemeral production fallback. No cloud upload/retrieval was performed. Orphans after uncertain storage/metadata failures are retained for reviewed cleanup; there is no destructive cleanup or delete endpoint.

Admin/session mutation guards protect uploads and derivation. Only the creator can derive an edited copy. Administrators can reuse the shared catalog intentionally; learners cannot browse it. Learner image retrieval requires a currently visible published revision referencing that media. Conditional responses are authorized first, with private cache revalidation and authorization/cookie variation. Published objects/revisions are never overwritten or deleted.

### Configuration and approval required

Proposed, **unregistered and unapplied** `lib/db/drizzle/proposed/0015_lesson_media_library.sql` adds eight bounded metadata/variant columns, a check constraint and a catalog-order index to the existing table. It creates no competing metadata table, deletes no data and grants no privileges. Existing table-level SELECT/INSERT privileges are sufficient for the proposed insert-only workflow. The proposal still needs its own migration review, backup, rehearsal and activation approval; this report does not authorize it.

The library returns `503 MEDIA_LIBRARY_NOT_READY` before object writes if these columns are absent. Storage must also be explicitly configured:

```text
LESSON_MEDIA_PROVIDER=s3
LESSON_MEDIA_S3_ENDPOINT=<private HTTPS S3-compatible endpoint>
LESSON_MEDIA_S3_REGION=<region>
LESSON_MEDIA_S3_BUCKET=<private bucket>
LESSON_MEDIA_S3_ACCESS_KEY_ID=<server secret>
LESSON_MEDIA_S3_SECRET_ACCESS_KEY=<server secret>
```

Use provider credentials limited to GetObject/PutObject in `ccna-lessons/`; no public bucket or browser credentials. Configure backup/retention for objects alongside metadata. Test actual private upload, retrieval, editing and published-reference authorization in staging before operational acceptance. No credentials were requested in this report and no storage was activated.

## Reading and study tools

Confirmed scroll defect: an ancestor with computed `overflow-y:auto` could grow with the article instead of scrolling. It was incorrectly selected as the viewport. Selection now requires actual overflow (`scrollHeight > clientHeight + 1`). Captured document/window scroll, resize, image load and ResizeObserver measurements are coalesced through animation frames, with cleanup. A compact sticky reading indicator remains near the header. The accepted reader layout is preserved.

Current position remains local. Save is explicit and uses existing section-based persistence; it does **not** store a pixel offset or exact percentage across refresh. Resume returns to the saved section. Completion remains a separate explicit action; reaching 100% does not complete a lesson. Existing focus-mode anchoring and route cleanup remain. Live delayed-image, sidebar, normal/focus and refresh acceptance is pending.

Existing note CRUD, selected-text/section anchors, highlight colors, lesson/section bookmarks, source navigation and old-revision handling were retained. Workspace filtering now adds a published lesson selector and created/updated ascending/descending sorting to the existing domain/chapter/type/color/search controls. API ordering uses fixed SQL fragments, with parameterized identifiers and filters. Existing transaction-local learner context, explicit owner predicates and RLS remain unchanged. PostgreSQL-backed ownership was not retested by modifying learner records.

## Exports

Export scope is all saved study items, one chapter or one lesson, with selected annotation types. Only the authenticated owner endpoint is read; full lesson bodies are excluded. Exports are generated in memory and downloaded, not stored on the server. Identity changes abort collection and suppress stale downloads. Pagination is bounded to 10,000 items, checks totals/duplicate IDs, and fails rather than silently exporting incomplete pages. This is not a database snapshot: simultaneous edits can still change values without changing totals; avoid concurrent edits during export.

- XLSX: Overview, Notes, Highlights, Bookmarks; filters, frozen headers, wrapped cells and formula-injection-safe strings.
- DOCX: chapter/lesson headings, notes/excerpts, dates, source and revision references, escaped XML, Arabic direction and professional base typography. Desktop Word rendering was not inspected.
- PDF: page wrapping, footers, source references and embedded SIL-licensed Amiri for Arabic/English. Visual QA caught invisible mixed-script text with the initial font/direction combination; it was corrected and re-rendered. First and last pages now show both scripts without clipping. Complex mixed-direction paragraphs, unusual Unicode and long source strings need broader visual acceptance.

ExcelJS, docx and jsPDF load lazily from the export panel. The final build places the panel, media picker and generators in separate chunks; ExcelJS remains a large optional chunk (~937 kB minified). The compile-only build helper now selects jsPDF's browser entry rather than inheriting the unit-test Node entry.

## Read-only Neon evidence

User-run guarded receipt: `.local/phase2d/2026-10-30T11-47-29-171Z/neon-readiness.json`.

- `127.0.0.1:5432/ccna_phase6a_dev`; system identifier `7694701597474139084`; PostgreSQL `180006`.
- Source/ledger: 14 ordered migrations. Exact expected inventory: 22 tables. Database bytes: 12,129,983. Only `plpgsql 1.0` installed.
- Aggregate inventory: 285 constraint rows, 78 indexes, ten inspected functions, thirteen enabled triggers including lesson revision immutability, two learner-owner RLS policies; function definitions recorded as hashes.
- Both app/migrator lack superuser, CREATEDB, CREATEROLE, replication and BYPASSRLS; role boundaries retained. Ten distinct nonmissing Clerk mappings.
- Principal counts: 48 chapters/topics; 16 questions, 76 options; 11 lessons, 13 revisions; 7 sessions/29 items; 7 attempts/29 deliveries; 3 annotations, 1 progress row, 0 media; 10 users.
- Sequences: question code 152; migration ledger 14. No reset or sequence changes.
- Database access was READ ONLY/repeatable-read with UTC and no writes. No Neon connection or private-data copy occurred. This inventory is not itself a fresh restorable backup or a proof of cloud compatibility.

### Options and recommendation

| Option | Assessment |
| --- | --- |
| A — Local PostgreSQL + approved S3-compatible storage | **Recommended now.** Solves media persistence without moving authoritative learner/content data. Lowest immediate operational change. |
| B — Neon PostgreSQL + Neon Object Storage | Viable candidate after approved staging; combines role/pooling/guard/cutover work with storage configuration. Higher migration complexity. |
| C — Neon PostgreSQL + other compatible object storage | Also viable; provider-neutral adapter supports separation, but adds two providers' backup, locality and operations. |

Neon Object Storage requires its own bucket, endpoint and credentials; it is separate from PostgreSQL metadata. Regional/account availability must be checked before selection. [Neon storage setup](https://neon.com/docs/storage/get-started).

Use least-privilege SQL-created API roles, not the default console owner: console/API-created roles inherit `neon_superuser`, including RLS-bypass capabilities. [Neon role model](https://neon.com/docs/manage/roles).

Pooling requires rehearsal of the existing transaction-local learner context on one transaction connection, including cross-user pool reuse. Never replace it with persistent session state. Use a direct TLS connection for migration/restore workflows. [Neon transaction pooling](https://neon.com/docs/connect/connection-pooling).

### Proposed migration plan — no execution authorized

1. Freeze a reviewed source/ledger baseline. Create a fresh consistent full local backup, preserve earlier archives, verify checksum/readability and restore it in an authorized isolated environment. The old pre-0014 backup does not cover current content.
2. Select a supported Neon PostgreSQL major version compatible with this PG18 source; verify the chosen region's actual version, extensions and role capabilities. Do not attempt a downgrade. Review every function/trigger, privilege, sequence, constraint, index and immutable-revision dependency.
3. Obtain separate approval before transferring data. Restore only to a new private staging database; preserve local authoritative data and existing identity mappings. Never upload backups or switch DATABASE_URL implicitly.
4. Compare schema definitions, ordered migration checksums, UTC row fingerprints, counts and sequence states. Counts alone are insufficient. Verify objects and metadata together if media exists by then.
5. Recreate and test least-privilege app/migrator role separation, ownership, function execution, triggers, RLS WITH CHECK/USING behavior and immutable revisions. Do not copy privileged managed-owner attributes to the API role.
6. Rehearse current Clerk mapping, lesson discovery/revisions, questions, practice/exams and study persistence using authorized staging identities only. Compare all historical records before/after.
7. Test read/write permissions and cross-user denial through direct and pooled connections, including rollback/error paths. Prepare a separately reviewed cloud startup profile; never weaken the pinned local guard to accept arbitrary hosts.
8. Prefer a controlled write-maintenance window for this small database. Take a final backup and restore/compare again. If zero downtime is needed, separately design synchronization and conflict handling; do not assume table copy captures later writes.
9. Request explicit cutover approval for the exact cloud target, roles, connection settings, object-storage configuration, downtime and verification evidence. Only then change deployment settings and perform smoke checks.
10. Preserve local PostgreSQL and archives. Before accepting cloud writes, rollback can restore local service settings after approval. After cloud writes, pause writes and reconcile new records into a reviewed recovery path; blindly switching back would lose history. Rehearse this distinction in staging.

Cloud cutover is **NO-GO**: no approved cloud target, staging restore, cloud role/RLS test, fresh migration backup or cutover approval exists.

## Verification and limits

- `node tools/run-phase2d-tests.mjs`: **133 passed, 2 skipped, 11 files passed**. Includes actual H1 toolbar, heading limits, marks/contracts, scroll roots, image decode/crop/variants, local object bytes/retrieval, fail-closed readiness, ownership predicates and actual XLSX/DOCX/PDF generation. Runner excludes an obsolete pre-0014 journal expectation; skips are not passes. No full unrelated suite was run.
- `node tools/check-admin.mjs`: PASS (API/frontend/schema/client TypeScript).
- `node tools/check-study-codegen.mjs`: PASS, eight reproducible outputs.
- `node tools/build-admin-ui.mjs`: PASS. Final artifact `.local/admin-ui-production-build/1793435610996`. An earlier build exposed the jsPDF Node-entry mismatch; a justified rebuild followed the PDF and browser-entry corrections. Existing UI sourcemap and large-chunk warnings remain; no build error.
- PDF fixture `.local/phase2d-export-fixtures/bilingual-study.pdf`: eight pages; first/last rendered and inspected. This is artifact QA, not browser QA.
- `git diff --check`: PASS; pre-existing CRLF warnings and unrelated uncommitted work retained.
- Active `0014_interactive_study.sql` remains SHA-256 `c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893`; it was not edited or executed.
- Browser host unavailable. No desktop/mobile visual acceptance or authenticated draft save/reload, image upload/publish, study mutation, refresh/resume or download interaction is claimed.

No application data, published lesson/revision, Chapter 1 table/placeholder, learner record, authentication configuration, RLS policy, grant or active migration was changed. No services restarted, commits or pushes. All image/test writes were disposable filesystem fixtures; database operations in those fixtures used mocks. The live Neon inventory was read-only.

## Scoped files

Paths below are Phase 2D work; the wider existing dirty working tree is not this task's change list.

- API: `artifacts/api-server/src/lib/{lesson-media.ts,lesson-media-storage.ts,lesson-media-library.ts,phase2d-media.test.ts,lesson-validation.ts,study.ts,study-validation.ts}`; `src/routes/{lesson-media.ts,lessons.ts}`; API package manifest.
- Frontend: `artifacts/ccna-learning/src/components/{lesson-rich-editor.tsx,lesson-content.tsx,lesson-visual-blocks.tsx,lesson-media-library.tsx,study-tools.tsx,study-export-panel.tsx,phase2c-editor-reader.test.tsx,phase2d-study-export.test.ts}`; `src/lib/{reading-position.ts,study-export.ts}`; `src/{learning-workspace.css,lesson-media-library.css}`; frontend manifest and public font/license assets.
- Contracts: regenerated lesson/study OpenAPI and client/Zod outputs under `lib/api-spec`, `lib/api-client-react/src/{lesson-api,study-api}` and `lib/api-zod/src/{lessons,study}`; lesson contract preparation includes optional image dimensions and study preparation includes lesson/date filters.
- Tooling: `tools/{run-phase2d-tests.mjs,build-admin-ui.mjs}`, `tools/phase2d/neon-readiness.{mjs,ps1}`; `pnpm-lock.yaml`.
- Proposal only: `lib/db/drizzle/proposed/0015_lesson_media_library.sql`. Report: this file.

Minimum next actions: authenticated acceptance of H1 and scroll/save/resume; separate review/approval of the 0015 proposal and persistent private storage; then staging upload/retrieval/published-media verification. Do not rerun 0014 or automatically activate anything from this report.

## Phase 2D.1 targeted follow-up — 2026-10-31

- Manual acceptance supersedes the earlier pending status: **H1 and live reading percentage PASS**. Neither implementation was changed.
- **Save/Resume visibility FIXED in source after manual clarification:** the group was collapsed, Save was hidden for NOT_STARTED, and Resume disappeared without a saved section. Study tools now open initially; Save is visible and the first explicit save sends the existing `start` action with the measured section (one request). Later saves use `position`. Backend/schema semantics are unchanged; completion remains independent. Resume is visible but disabled with an explanation until a valid section is saved. Authenticated PostgreSQL/browser persistence acceptance remains pending; automated persistence uses a retained server fixture and a fresh query client, not live learner data.
- **Focus layout defect FIXED in source:** `study.css` hides the sidebar, but the later `learning-workspace.css` retained a 230px navigation column. Added a focus-specific single-column override and full-width main content. Existing anchor capture/restoration, study tools and saved state are untouched. Real-browser acceptance remains pending; an unrelated focus failure is not ruled out.
- New targeted tests: **5 passed** across two files. They cover focus enter/exit, tools retained, first-save visibility, single request under double-click, saved section after remount/new cache, resume, failed-save feedback, completion independence and cross-lesson isolation. TypeScript PASS; scoped diff check PASS. No old Phase 2C/2D suite or production build repeated.
- **0015 NO-GO.** Proposal SHA-256 `f42de505df26dc5a00a49e740ba59ccc1c0e6d053f1f6f77a84b8bf92090a63b`. It remains unregistered; journal ends at 0014. Additive fields preserve existing media metadata/FKs and do not change RLS or grants; existing table-wide SELECT/INSERT cover new columns. ALTER TABLE requires an access-exclusive lock; use a reviewed maintenance window. Live schema evidence remains the prior read-only receipt, not a new inspection.
- A fresh restorable backup and successful **0015-specific** isolated rehearsal are required. No rehearsal listener was found on 55440; nothing was started. No 0015 restoration/rehearsal evidence was established.
- All six storage names listed above are absent from this execution environment. Running-service configuration was not inspected and no secret files were read. Persistent storage remains unactivated; cloud upload/retrieval is unverified.
- Changed only `learning-workspace.css`, new `components/phase2d1-reading.test.ts` and `components/phase2d1-save-resume.test.tsx`, `study-tools.tsx`, `pages/lesson-reader.tsx`, the focused runner `tools/run-phase2d1-tests.mjs`, and this addendum. No application database operations, service restarts, content/learner changes, migration activation, commits or pushes.
