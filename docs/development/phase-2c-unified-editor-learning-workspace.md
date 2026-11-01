# Phase 2C — Unified editor and Learning Workspace

Date: 2026-10-30, Asia/Riyadh.

Overall outcome: **PARTIAL — source implementation and focused automated checks
passed; rendered-browser and live authenticated persistence acceptance remain
pending.** The source is ready for manual acceptance testing. No database records
were changed and no application services were restarted.

## Interrupted state and work preserved

The existing working tree contained extensive earlier, unrelated modifications
and untracked files, including the lesson application itself. Git status, diff
statistics, repository instructions and relevant source were reviewed. Nothing
was reset, discarded, committed or pushed. A clean historical Phase 2C diff was
not available because most relevant lesson files were already untracked. This
report identifies the scoped implementation files rather than attributing all
working-tree changes to Phase 2C.

The interrupted work already contained the shared formatting store, optional
formatting fields, generated lesson contracts, inline image controls, a compact
workspace, reading-position utilities and initial regressions. No final Phase 2C
report existed. These implementations were retained and completed.

Continuation repairs included real H1–H6 Tiptap commands, shared list controls,
selected palette state, link editing at a caret, callout alignment, delayed
article mounting, focus-position restoration and focused save/resume tests.
The temporary extra toolbar fieldset was replaced with an inert div so existing
section semantics remain intact. The standalone editor still initializes its
own toolbar when used outside Lesson Studio.

## Area status

“COMPLETE” below means the stated source capability passed focused automated
verification. It does not assert live PostgreSQL persistence or visual acceptance.

| Area | Status | Evidence / boundary |
|---|---|---|
| Shared editor ownership and one Studio toolbar | COMPLETE | Mounted editor/store tests; selected-word formatting, active-target release and incompatible-field clearing |
| Supported inline formatting and structured lists | COMPLETE | ProseMirror operations, run round trips, validated list fallbacks, nesting and student rendering |
| H1–H6 end-to-end persistence | PARTIAL | Actual Tiptap commands, validation, JSON reload and published renderer passed; no live draft/publish write was authorized |
| Specialized block controls and block actions | COMPLETE | Existing table/list/block action regressions pass; all block types retained |
| Compact Studio split workspace | PARTIAL | DOM layout/action placement and production compilation pass; visual/zoom/RTL acceptance pending |
| Reference tables | COMPLETE | Compatible plain-text cells, row/column operations, style preservation, header semantics and keyboard controls verified |
| HTTPS image authoring | PARTIAL | Inline binding, safe-source validation, JSON round trip and image markup verified; real network image load and live save/reopen pending |
| Local persistent image uploads | BLOCKED | Storage remains unconfigured/inactive; no infrastructure or permission activation |
| Learning Workspace/responsive layout | PARTIAL | Responsive CSS compiled; real desktop/mobile/zoom rendering pending |
| Reading-position calculation | PARTIAL | Normal/nested geometry, short articles, resizing, delayed loading, route and focus regressions pass; real scroll layout acceptance pending |
| Explicit section save/resume | PARTIAL | Mounted reader uses existing API with mocked persistence/reload; real authenticated persistence pending |
| Notes/highlights/bookmarks/completion | PARTIAL | Focus, identity isolation, failed-save retention and explicit completion regressions pass; live interaction not performed |
| Existing content compatibility | COMPLETE | Six frozen continuation payloads validate; 21 tables and 15 placeholders retained; no content-authoring or database writes |

## Scoped files

Frontend:

- `artifacts/ccna-learning/src/components/lesson-format-context.tsx` — new
  shared active-editor store, subscription and ownership lifecycle.
- `artifacts/ccna-learning/src/components/lesson-rich-editor.tsx` — shared
  toolbar, compatible Tiptap nodes/marks, structural commands and selection handling.
- `artifacts/ccna-learning/src/lib/lesson-rich-text.ts` — safe mark serialization
  and heading-node reconstruction; approved palettes retained.
- `artifacts/ccna-learning/src/components/lesson-visual-blocks.tsx` — contextual
  list/table/image controls, rich list items and figure-placeholder guidance.
- `artifacts/ccna-learning/src/components/admin-lessons.tsx` — provider and one
  lazy toolbar, one active editing block, grouped insertion and compact actions.
- `artifacts/ccna-learning/src/components/lesson-content.tsx` — semantic H1–H6,
  new marks, rich list items, saved direction/alignment and image-resource validation.
- `artifacts/ccna-learning/src/lib/reading-position.ts` — new local measurement,
  section resume and focus-anchor helpers.
- `artifacts/ccna-learning/src/pages/lesson-reader.tsx` — article readiness,
  settings, learning-path toggle, outline state and save/resume integration.
- `artifacts/ccna-learning/src/components/study-tools.tsx` — grouped tools,
  separate progress concepts and scoped position actions; existing APIs retained.
- `artifacts/ccna-learning/src/learning-workspace.css` — new reader layout owner.
- `artifacts/ccna-learning/src/lesson-studio-workspace.css` — compact toolbar,
  canvas, contextual controls and heading styles.

Validation/contracts:

- `artifacts/api-server/src/lib/lesson-validation.ts` — bounded optional marks,
  direction and list runs; H1–H6; image resource checks and fallback consistency.
- `lib/api-spec/openapi.yaml` — generated additive lesson-content definition.
- `lib/api-client-react/src/lesson-api/api.schemas.ts`,
  `lib/api-client-react/src/lesson-api/api.ts`,
  `lib/api-zod/src/lessons/api.ts` — regenerated through existing lesson-only
  tooling; generated outputs checked for reproducibility.

Verification and report:

- `artifacts/ccna-learning/src/components/phase2c-editor-reader.test.tsx` — new
  Phase 2C regressions.
- `artifacts/ccna-learning/src/components/study.test.tsx` — additional mocked
  persistence, delayed metadata and focus/note tests.
- `tools/run-phase2c-tests.mjs` — new focused offline runner using installed
  native binaries, without environment-file loading or database credentials.
- This report.

Existing lesson tests were reused. No migrations, schema files, authentication,
RLS, grants, question-bank or Exam Simulator implementation was changed in this task.

## Unified editing architecture

Lesson Studio owns one `LessonFormatProvider`. Its small external store tracks
the active editor and current structured-block/list callbacks. Only the toolbar
subscribes to formatting transactions, avoiding transaction-driven rerenders of
the entire authoring workspace.

Focusing a compatible editor activates its target; focus on CLI, URLs, numeric
inputs or plain table cells clears it. Unmounting an editor releases only that
editor's ownership, so an old editor cannot clear a newer active target. Toolbar
buttons preserve pointer selection and restore editor focus before commands.
The toolbar supports labelled controls, tooltips, pressed/disabled states and
arrow/Home/End movement between buttons.

Only the active block mounts its detailed editor. Other blocks retain compact
summaries, actions and their content in lesson state. The live preview uses the
existing `LessonContent`, with stable IDs and no save/publish requests. The rich
editor/toolbar stay in a lazy-loaded production chunk.

The existing structured JSON content model is retained. This is not a replacement
HTML document or a flattened Tiptap JSON persistence format.

### Formatting by content type

| Content | Shared formatting | Contextual properties |
|---|---|---|
| Formatted text, paragraphs, headings, blockquotes | Bold, italic, underline, strike, code, sup/sub, safe links, approved colors/highlights, clear marks, text undo/redo; saved direction/alignment | Structure selector, H1–H6, approved appearance presets; quote attribution |
| Callout/note text | Same inline marks, links, palettes and saved direction/alignment | Tone, title/icon and safe appearance; structure conversion intentionally disabled |
| List item text | Same inline marks/links/palettes and text undo/redo | Shared ordered/unordered and indent/outdent commands; contextual nesting, numbering and continuation |
| Table cells/headers | Plain text, intentionally no fake rich-text toolbar | Cell alignment/background, row/column management, header row/column and width presets |
| Image captions/alt text | Plain text matching the persisted string fields | Source, preview, alignment, width and decorative setting |
| CLI/code | Raw whitespace-preserving text, LTR | Language, explanation, line numbers; no rich marks applied to commands |
| Knowledge checks and lab references | Existing structured fields retained | Choices/correct answer/feedback or lab metadata and safe links |

List item formatting uses optional bounded `itemRuns` alongside the original
`items` strings. Server validation requires identical fallback text and matching
array lengths. Older lists remain valid without runs. List nesting is still
bounded and uses semantic ordered/unordered lists. List direction remains
automatic; explicit block direction controls are available on the compatible
text block types rather than falsely exposed on list cells or unrelated fields.

### H1–H6 reliability

Compatible text editors enable Tiptap's six heading levels. Commands/shortcuts
update the corresponding structured heading `level`, text and runs. Metadata
changes reconstruct the correct editable heading node. The automatic Tiptap
trailing-paragraph plugin is disabled inside these single-block editors: a
regression demonstrated it otherwise appended a newline to heading content.

Validation, generated contracts, renderer and outline accept all six levels.
Rendering uses real `h1`–`h6` elements with stable section anchors. The UI advises
using H2 for sections because the lesson title remains the primary heading.
Editor JSON → validated lesson JSON → reload → shared published renderer is
covered. Actual PostgreSQL save/reopen/publication is explicitly not claimed.

## Tables and image workflow

Tables retain individual cell/header editing; add/remove rows/columns, move rows,
header row/header column, safe cell backgrounds/alignment and column width
presets. Tab remains normal focus navigation; Alt+arrows move between cells.
Student tables preserve accessible headers and horizontal overflow. No Chapter 1
table was rewritten and no cell formatting is presented that would disappear.

Confirmed source-level image defects were:

1. The generic link helper accepted chapter/topic navigation as an image source.
2. The former image dialog kept pending URL/alt/caption edits outside the lesson
   form until a separate “Use image” action. Closing it could discard those edits.
3. Browser-local file/blob references cannot serve as persistent published assets.

Image fields now update lesson draft state directly. Dedicated resource
validation allows HTTPS sources without credentials and approved authenticated
lesson-media paths, excluding chapter links and temporary/local schemes. The API
also rejects navigation paths for images. Existing HTTP image references remain
readable/valid for compatibility; the authoring UI warns and requires HTTPS for
new source selection. No protocol/credential protection was relaxed.

Alt text is required unless explicitly decorative. Caption, alignment and width
persist in the existing block shape. The same student renderer provides preview,
responsive images and a safe image-load failure message. Replacing the URL
replaces the source; removing a block uses the existing confirmed section action.

Tests verify a supported HTTPS block through JSON validation/reload and rendered
image markup. They do not prove that an arbitrary external server serves an image,
that its CSP/hotlinking permits access, or that a real draft was saved. The precise
browser/network cause of the user's original insertion failure was not captured;
the confirmed source defects above were repaired without guessing a live failure.

Local uploads remain inactive. No media directories, upload service, storage
configuration or infrastructure was created. Figure-placeholder callouts expose
clear author guidance to insert an image after the placeholder and carry its
figure/source reference into the caption. No automatic replacement or publishing
occurs; all 15 planned placeholders remain unchanged.

## Studio and Learning Workspace

Studio preserves the existing full-width page, physical preview-left/editor-right
50/50 arrangement, independent pane scrolling and narrow-width Editor/Preview
switch. Save and publication actions remain outside the panes. Metadata,
appearance, outline and block actions are progressively disclosed. All 12 block
types and add-before/after, duplicate, move, remove and revision history remain.
Draft state, optimistic version protection, failed-save retention, explicit
publication confirmation and unsaved-change warnings remain in place.

The reader has a collapsible desktop Learning Path; the existing accessible mobile
navigation drawer remains available. Available workspace width, not only screen
width, controls whether the outline/tools appear alongside the article. At narrower
widths they flow after the article. The article uses the selected readable width,
text size and line spacing. No independently scrolling narrow study panel is
required. Tables and CLI blocks retain their own horizontal overflow where needed.

Reading settings are grouped in one disclosure. Outline links show hierarchy and
the active heading. Study tools/notes are grouped; current reading position, saved
section and explicit completion have distinct labels. Existing highlights,
bookmarks, private notes, Study Workspace, Previous/Next and completion actions
remain. Focus mode preserves the mounted study component and restores the current
section offset after layout changes, rather than discarding note drafts or
snapping unnecessarily to the top of the section.

## Reading Position 0%: cause and repair

The old effect subscribed only to `window` scroll, while a scrollable application
ancestor can be the actual reading viewport. It also used `window.innerHeight`
for nested containers, measured only on scroll/window resize and used a separate
global/fixed-180px heuristic for saved position.

One further lifecycle defect was found during completion: the lesson response
can arrive before curriculum/list metadata. The article is then absent when the
effect runs. If dependencies do not subsequently change, measurement never
attaches. The reader now activates the hook only when its actual article can render.

The corrected implementation:

- Detects the article's nearest scrolling ancestor and its content viewport.
- Measures article bounds and clamps finite percentages to 0–100.
- Handles fully visible short lessons as 100% position, independently of completion.
- Captures nested/window scroll and coalesces measurements per animation frame.
- Observes article/root resize, image loads, viewport resize and layout-setting changes.
- Resets/remeasures on lesson/revision changes; honours explicit section links.
- Cleans up listeners, animation frames and resize observers.
- Uses the same article-scoped section measurement for explicit position saving.

Scrolling sends **no persistence requests** and cannot complete a lesson.
Save uses the existing revision/version/session-protected progress API. Resume
returns to the saved section; the API stores a block ID, not an exact percentage
or pixel offset. Older missing-section references are identified rather than
falsely displayed as section 1. There is no autosave or invented pixel precision.

## Verification results

Final focused command: `node tools/run-phase2c-tests.mjs`.

- **96 passed, 0 failed, six files.** Actual Tiptap selected-range/heading commands,
  marks/undo/redo, one-toolbar ownership, structure/list callbacks, safe paste,
  legacy content, table operations, image validation/serialization, block actions,
  preview and draft protection are covered.
- Reading tests cover normal/nested geometry, clamping, short articles, content
  resize, delayed metadata, route/focus transitions, section save/reload/resume,
  unsaved-note preservation and completion independence. API persistence is mocked.
- `node tools/check-admin.mjs`: **PASS** for API/frontend/schema/client TypeScript.
- `node tools/check-study-codegen.mjs`: **PASS**, eight spec/generated files
  reproduce; zero database connections/dependency installations.
- `node tools/build-admin-ui.mjs`: **PASS**, production artifact under
  `.local/admin-ui-production-build/1793357190012`.
- Build retains existing UI-component sourcemap notices and a main-chunk size
  warning. The rich editor is separately lazy loaded (about 416 kB before gzip).
- Impeccable's scoped detector returned `[]` (no findings). This is a mechanical
  check, not visual or screen-reader acceptance.
- Focused `git diff --check`: **PASS**. Because most lesson files are untracked,
  their scoped source/report whitespace was independently checked as well: **PASS**.
- Final compiled CSS retains the two equal Studio panes and Learning Workspace
  container queries, with **no Studio 920px width override**. Required web/API
  entry points remain present. These are compilation/source checks, not computed
  browser layout measurements.

An earlier broader lesson test invocation also encountered the pre-existing test
in `artifacts/api-server/src/lib/lessons.test.ts` which assumes 0013 is the last
migration. Activated 0014 makes that expectation obsolete. No migration, ledger
or unrelated test was changed to hide it; it is excluded from the focused runner.
Introduced heading whitespace, toolbar initialization and wrapper regressions were
repaired and the final focused run passed.

Windows tooling uses the already installed binaries under `.local/native-deps`.
No package reinstall, lockfile modification or dependency upgrade was needed.

## Browser and live-data acceptance boundary

Browser access reported that its host was unavailable. Native Computer Use then
ended because it could not establish the current browser URL confidently enough
to enforce policy. No further browser automation or security workaround was used.

Consequently no actual screenshots, desktop/mobile/200%-zoom visual verification,
real keyboard/screen-reader session, external image load, or authenticated
database-backed authoring/study interaction is claimed. Mounted jsdom tests and
static renderer tests are distinguished from those checks throughout this report.

No new or existing lesson was saved/published through the live application.
No learner note, bookmark, highlight, progress or completion record was modified.
The seven Chapter 1 published lessons, including 1.0, their revisions, ordering,
tables and placeholders were not targeted by any mutation. Frozen content-pack
compatibility checks passed; no fresh live database fingerprint comparison was
performed during this source-only task.

## Manual acceptance and remaining limitations

The API needs to load the updated additive validation/contract code before an
administrator uses the new marks, heading levels or list runs. Running services
were not restarted. When the operator schedules the restart, use the existing
guarded launchers in separate terminals, after stopping only those application
processes normally:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use existing credentials only at local hidden prompts. Do not rerun any activation
or migration command. This documentation does not execute a restart or authorize
test writes to real content/learner records.

Manual acceptance should use separately authorized disposable draft/test-user
records: verify all headings/marks after save/reopen/publication, an actually
reachable HTTPS image, long tables and block actions; then inspect the reader at
desktop/tablet/mobile widths and 200% zoom, RTL/LTR, focus transitions, keyboard
navigation, notes/highlights/bookmarks and explicit save/resume/completion.

Known compatible limits are plain-text table cells/captions and specialized
metadata, automatic list direction, section-based persisted resume, no persistent
local uploads and no live end-to-end acceptance yet. There is no claim that the
entire Phase 2C product is COMPLETE until those remaining acceptance checks pass.
