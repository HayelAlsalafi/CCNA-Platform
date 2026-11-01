# Phase 2B — interactive study and enhanced authoring

Implemented in source on 28 October 2026. No application database connections or
writes, migration activation/promotion, grants, storage provisioning, service
restarts, dependency installation, commits or pushes were performed.

## Status: source versus activation

| Capability | Implemented / tested | Activated / durable on current database |
| --- | --- | --- |
| H2–H4, paragraphs, semantic inline formatting, lists and quotes | Yes | Uses existing lesson JSON after a manual API/frontend update |
| Five semantic callouts, optional titles/icons, formatted links/text | Yes | Same existing draft/publication workflow |
| Block outline, before/after insertion, duplication, collapse, up/down, undo/redo | Yes | Session editing state; only explicit existing Save/Publish persists official content |
| Font size, width, line spacing, reading themes and focus reading | Yes | Local reader preferences, never presented as saved learner progress |
| Image alignment/width, preview and replacement UI | Yes | External URLs work through existing JSON; direct uploads blocked pending storage/schema approval |
| Image upload/storage/read abstraction | Source and isolated filesystem/authorization tests | **Not activated**; no configured provider/root is assumed |
| Private highlights, notes, bookmarks, progress and workspace | Source, generated contracts and focused tests | **Not activated**; migration 0014/grants remain unapproved/unapplied |
| Real PostgreSQL persistence/RLS/constraints for 0014 | Not exercised | **NOT VERIFIED** |
| Actual signed-in desktop/mobile browser workflows | Not performed | **NOT VERIFIED** |

The current database remains on the approved 13-entry chain through lesson
migration 0013. The existing runtime guards were not weakened or changed to accept
new tables. Missing study/media storage produces explicit HTTP 503 errors, not
fabricated successful saves, empty durable collections or completion badges.

## Implemented authoring

The existing Lesson Studio and immutable revision model are reused. No parallel
editor or arbitrary HTML storage was introduced.

- Structured rich text adds underline, limited semantic colors, four inline
  highlight colors, safe learning links and alignment. Bold/italic/inline code
  remain. Lists and blockquotes are new structured block variants, and headings
  support H2–H4. Old blocks remain valid.
- Callouts support information/blue, important/amber, tip/green, warning/red and
  example/purple, optional title/icon and formatted segments. A compatible plain
  text fallback is maintained when segments are edited. Colors have explicit
  contrasting foregrounds in both reading themes.
- New blocks can be inserted before/after an existing section. Duplication assigns
  a new UUID and clones nested content. The outline jumps to stable editor IDs.
  Long editors collapse; existing up/down controls remain keyboard accessible.
- Undo/redo retains up to 30 immutable editing snapshots in memory. It never
  rewrites saved published revisions and makes no autosave promises. Existing
  optimistic versions, session-bound saves, unsaved-change checks and previews
  remain active.
- PNG/JPEG/WebP selection gives a temporary object-URL preview with explicit
  “not uploaded” labeling. Only successful upload returns a durable media URL for
  insertion. Failed/blocked uploads preserve the previous image. Position, width,
  captions and descriptive alt text are editable; empty alt is allowed only after
  explicitly marking an image decorative.
- Removing/replacing/duplicating blocks never deletes binary media or shared
  historical references. Accessible up/down controls are implemented; drag-and-drop
  is deferred rather than adding a second, less accessible ordering mechanism.

## Private reader and workspace

The existing hierarchical curriculum sidebar, published-only reader, code copying,
self-checks, TOC and previous/next navigation remain. Reader comfort controls add
line spacing, reading width and reversible focus mode. The TOC/study panel remains
sticky on wide layouts and stacks on smaller screens.

Text selection is captured within one supported block, including keyboard
selection. Anchors contain `{blockId,start,end,quote}` plus immutable lesson/revision
UUIDs. Text offsets are UTF-16 positions within a deterministic text projection,
not document-wide DOM offsets. The server verifies exact quote, bounds and block
membership against the selected current published revision. Cross-block/oversized
selections are rejected instead of guessed. General/section bookmarks use a
revision-specific block marker where no selected quote is needed.

Highlight colors represent important/yellow, understood/green, review/blue and
difficult/pink. They never change completion. Marks are rendered as escaped React
nodes over the official text; no HTML mutation is saved into official content.
Overlapping personal highlights are rejected under a transaction advisory lock.
Colors can be edited and items deleted through owner-scoped APIs.

Private notes support general and selected-text notes, categories, editing,
explicit saving and deletion. Failed saves preserve the unsaved note. Navigation
warns before discarding a typed private note. Bookmarks support lesson, section
and selected passage targets. Categories/labels/colors can be edited from the
lesson's saved-item list. The workspace provides My Notes, Highlights, Bookmarks
and Progress tabs, keyboard tab navigation, search, color/domain/chapter filters,
server-side pages and lesson links.

Old-revision annotations are retained, labeled and never painted onto the current
revision. Their links open the stable lesson without silently jumping to changed
text. Superseded/unpublished official revisions are not exposed through a new
learner-reading bypass. Workspace organization follows the lesson's current
canonical placement; an older annotation is explicitly marked as such.

Progress has not-started (no current-revision row), in-progress and completed
states. Start, save position, complete and reopen are explicit requests. Opening a
lesson, selecting text or scrolling never creates completion. Saved reading
positions use a stable block ID. Re-publishing creates a different revision scope;
old completion is preserved rather than copied to the new revision automatically.
Chapter/domain completion aggregates use all visible current published lessons in
the selected scope; searching filters the lesson list, not the aggregate denominator.

All caches use the existing user/session identity keys. Rendered highlights/images
are also revision/owner scoped; session changes clear unsaved personal tool state.
No study items or progress are stored in localStorage. Until activation, controls
show the unavailable state and cannot claim to save private records.

### Limits and deferred details

- Per-lesson personal-item reads are bounded at 500 records; larger collections
  use the paginated workspace and need further reader pagination before lifting
  that limit. There is no silent truncation.
- Selection highlighting is supported for paragraphs, headings, structured rich
  text, callout text and quotes. Multi-block selections, tables and CLI selections
  are not guessed. All sections can be bookmarked.
- Position saves are explicit and block-granular, not automatic per-pixel syncing.
- Image checks validate signatures/MIME, declared dimensions and size. They are
  not a full codec decoder, malware scanner, EXIF scrubber or transcoder.
- Local private filesystem storage is the smallest proposed development adapter,
  not a multi-instance production object store. No storage root was created.
- Drag-and-drop, a global rich-text Word processor, historical-revision reader,
  cloud media adapter and automatic orphan pruning remain deferred.

## API, ownership and database design

Proposal only: `lib/db/drizzle/proposed/0014_interactive_study.sql`.
SHA-256: `c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893`.

Three new tables avoid duplicating curriculum or lesson content:

1. `lesson_annotations`: one typed private collection for NOTE/HIGHLIGHT/BOOKMARK,
   exact revision anchors, bounded text/category/color, optimistic versions and
   owner/revision indexes. A partial unique index prevents duplicate whole-lesson
   bookmarks per owner/revision.
2. `lesson_progress`: owner/lesson/revision primary key, explicit state, stable
   last block and version; indexed by owner/state.
3. `lesson_media`: opaque key, creator, MIME, size and SHA-256 only. Binaries remain
   outside PostgreSQL/lesson JSON.

Both private tables use RLS owner policies and explicit owner predicates. Each
service transaction sets the local `app.study_user` from the authenticated
PostgreSQL user UUID; clients cannot supply or override that identity. RLS requires
an app role that is neither owner nor BYPASSRLS/superuser. Backup/migration ownership
continues to permit approved administrative backup of all rows.

Composite FKs pin revision and lesson together; all new FKs use RESTRICT. Database
CHECKs constrain kind/color/state/bounds, while exact JSON block/quote membership is
validated in the service. No block table is invented to duplicate immutable JSON.
Timeouts bound statements/locks/idle transactions. Mutations lock the current
publication or private row, reject stale versions/revisions and use transactions.

Routes under `/api/study` require the existing authenticated active user. Mutations
add a mandatory `X-Study-Session` intent precondition; it is not an authentication
token or authorization substitute. Every own-item query/update/delete includes the
server-derived owner. A guessed foreign item ID returns 404. Existing PostgreSQL
ADMIN authorization/session checks protect media uploads before raw body parsing.
Media reads require a real active published reference, or an ADMIN preview.

New API surface:

- `GET /api/study/lessons/:id`
- `GET /api/study/workspace`, `GET /api/study/progress`
- `POST /api/study/annotations`, `PATCH/DELETE /api/study/annotations/:id`
- `PUT /api/study/progress`
- `POST /api/admin/lesson-media`, `GET /api/lesson-media/:id`

Study mutations use bounded JSON; uploads use bounded binary bodies. Responses are
validated, private/no-store, and do not emit raw SQL, filesystem paths or personal
values in errors. There are no official-content updates in these personal APIs.

## Media storage safety

`LessonMediaStore` exposes put/get. `LocalLessonMedia` uses a pre-existing approved
canonical directory, opaque UUID filenames, exclusive creation, bounded reads,
symlink/traversal rejection and SHA-256 verification. Original client filenames
are never used. Uploads accept only matching PNG/JPEG/WebP signatures, up to 5 MiB,
8192 per dimension and 32 megapixels. SVG/HTML/binaries are rejected. Media responses
set nosniff, a restrictive CSP and private/no-store caching; authenticated Blob
fetches are used rather than embedding tokens in URLs.

`LESSON_MEDIA_ROOT` defaults to unset; no provider is assumed. The guarded
launcher's environment allowlist is unchanged, so configuration activation requires
its own reviewed change. No directory/configuration was provisioned. A file is
retained on an uncertain DB write outcome, preventing deletion of a possibly
committed asset. Orphan cleanup requires reference checks across every draft and
published revision and separate approval; there is no auto-delete endpoint/job.

## Generated contracts and verification

Expanded only `LessonContentBlock` in the existing OpenAPI source; regenerated
only lesson outputs. Added `study.openapi.json` from inert Zod definitions and
`orval.study.config.ts`, with isolated generated client/Zod outputs. Safe internal
media/learning URLs are represented consistently with the authoritative validator;
raw HTML remains unsupported.

| Verification | Actual result |
| --- | --- |
| Scoped lesson/study/media/compatibility tests | **217 passed**, 14 files |
| API/frontend/schema/client TypeScript, including new tests | PASS |
| Offline code-generation reproducibility | PASS, 8 spec/generated files |
| Production frontend build | PASS, 1970 modules |
| Actual filesystem tests | PASS, disposable OS-temp directory only; exclusive storage/traversal rejection |
| PostgreSQL migration/RLS/FK/concurrency/rollback integration | NOT RUN; unapproved proposal |
| Browser desktop/mobile verification | NOT PERFORMED |

An initial route-fixture failure was corrected by supplying the email claim that
the existing real authentication middleware requires. No authentication check was
weakened. Build retains existing source-map notices and the >500 kB chunk warning.
No unrelated failing tests were investigated.

Reproduce safe checks from the project directory:

```powershell
node tools/run-curriculum-tests.mjs --lessons
node tools/check-admin.mjs
node tools/check-study-codegen.mjs
node tools/build-admin-ui.mjs
```

## Files created and modified

Created:

- `lib/lesson-study.ts`; `lib/db/src/schema/lesson-study.ts`;
  proposed `0014_interactive_study.sql`.
- `artifacts/api-server/src/lib/study.ts`, `study-validation.ts`,
  `lesson-media.ts` and their focused test files.
- `artifacts/api-server/src/routes/study.ts`, `lesson-media.ts`, `study.test.ts`.
- `artifacts/ccna-learning/src/components/study-tools.tsx`,
  `lesson-image-upload.tsx`, `study.test.tsx`; `src/lib/lesson-history.ts`;
  `src/study.css`.
- `lib/api-spec/study.openapi.json`, `orval.study.config.ts`;
  generated `lib/api-client-react/src/study-api/` and
  `lib/api-zod/src/study/api.ts`; client `src/study.ts` export.
- `tools/prepare-phase2b-contracts.mjs`, `prepare-study-spec.mjs`,
  `check-study-codegen.mjs`; this report and the activation readiness report.

Modified:

- Existing lesson validation, Admin lesson editor, content renderer, reader and
  sidebar footnote, plus existing lesson component regression assertion.
- API route registry and narrowly scoped body-parser exclusions.
- DB/client schema export indexes; existing OpenAPI lesson block section and its
  generated lesson client/Zod outputs.
- Scoped test runner and TypeScript checker to include the new focused tests.

No official SQL migration or official Drizzle journal/snapshot was modified.

## Next phase and local use

See `phase-2b-activation-readiness.md`: **NO-GO for persistence/media activation**
until fresh backup, isolated PostgreSQL/storage rehearsal, exact runtime guard/
permission review and explicit target-specific approval are complete.

Source-only authoring/comfort enhancements can be loaded with the existing guarded
API/frontend commands after intentionally stopping their old terminals. Do not
restart automatically, rerun 0013 activation or run Drizzle push:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
# In a separate terminal in the same directory:
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use existing hidden credential prompts only. Until separately activated, an
authenticated study request should return `STUDY_NOT_READY` and upload should return
`MEDIA_NOT_READY`. These are honest activation gates, not successful persistence.
