# Phase 2B.1 — Visual Lesson Studio

28 October 2026. Source implementation only. Migration 0013 remains the persistence
baseline; migration 0014 and persistent media storage were not activated. No
database connection, write, grant, migration, service restart, commit or push was
performed. Existing uncommitted work was retained.

## Confirmed limitations and design choice

The original `admin-lessons.tsx::BlockEditor` exposed individual run textareas and
whole-run checkboxes. It had no text-selection model or in-input formatting.
Lists were newline-delimited strings and tables required tab-separated cells.
The preview was an alternative pane behind a button, not a synchronized desktop
workspace. The existing content model already supported typed marks, semantic
colors, safe links, immutable lesson revisions and stable section UUIDs.

No mature rich-text framework was installed. Compared:

| Option | Fit for this repository |
| --- | --- |
| [Tiptap / ProseMirror](https://tiptap.dev/docs/editor/getting-started/install) | Selected: React bindings and existing framework selection/history machinery can be confined to each text block; a small JSON adapter preserves the platform's existing runs and stable block IDs |
| [Lexical](https://lexical.dev/docs/intro) | Viable maintained alternative with React bindings, selection, history and JSON state; would also need an adapter and explicit node/clipboard configuration for this existing lesson format |
| Custom contenteditable / replacing the whole lesson model | Rejected: would duplicate selection/paste/history handling or disrupt established revision-aware block architecture |

Five required Tiptap packages are pinned consistently to 3.32.0 (`core`, `pm`,
`react`, `starter-kit`, `extension-text-style`). The install used the existing
pnpm store; no package-manager upgrade or database operation occurred. Necessary
manifest/lockfile additions preserve the previous workspace entries. Initial
Tiptap peer mismatches were resolved by aligning these new packages. Existing
Clerk/React peer warnings were not addressed by unrelated upgrades. The editor is
lazy-loaded to keep its engine out of initial learner-page loading.

## Implemented behavior

- Responsive split workspace, independently scrolling editor and shared student
  renderer, full-screen width mode, live title/content preview, mobile Editor /
  Preview switch, existing outline and block collapse/jump actions. The preview
  explicitly labels local unsaved content and never fetches/publishes/saves it.
- Precise selected-range bold, italic, underline, inline code, approved text and
  highlight colors, links/unlink and clear formatting. Framework history supports
  text undo/redo and standard keyboard shortcuts. Toolbar mouse interaction
  retains selection. English/Arabic, automatic/manual editing direction, Unicode
  and hard line breaks are supported. Reader sections use `dir=auto`.
- Safe rich paste: parse supported structure/marks transiently, strip active
  elements, unsafe links, event attributes and unsupported styling. Persist only
  typed runs, not HTML. Unsupported formatting is discarded rather than invented.
- Optional version-1 block presentation: background, border accent, card, padding
  and spacing presets. Paragraphs, quotes, headings and callouts support inline
  runs. Quotes add attribution/decorative marks. Heading H2/H3/H4 semantics and
  `section-<UUID>` anchors remain unchanged. NOTE is a named callout alongside all
  previous tones; titles/icons avoid conveying meaning through color alone.
- Explicit list item controls; native semantic nested lists, decimal/letter/Roman
  numbering and bullet presets, root numbering start/restart and an explicit
  Continue previous numbered list button. Continuation counts root items of the
  preceding ordered block and is not silently recalculated. Enter inserts an item;
  Alt+Left/Right and buttons adjust nesting. Tab/Shift+Tab keep normal focus
  navigation, avoiding a keyboard trap or the Windows Alt+Tab shortcut.
- Visual table grid with direct cell editing, row/column size selection, insertion
  and removal, moving rows, column/row headers, per-cell approved background and
  alignment, width presets and contained horizontal scrolling. Structure changes
  carry unaffected cell styles with their content; last row/column cannot be
  deleted. Replacing a grid requires confirmation and can be undone.
- Image/diagram insertion and replacement dialog, safe URL/alt/caption entry,
  preview, alignment/width presets and aspect-ratio preservation. No base64 or
  local-file upload is introduced; inactive upload/storage features stay gated.
- CLI whitespace-preserving input, language label, explanation, line numbers and
  the existing copy button. Knowledge checks have visual options, add/remove/move,
  correct-option preservation and explanation. They remain local single-answer
  self-checks, not graded practice or persisted scores. Labs add structured
  objectives, requirements, steps, expected results and optional safe resource URL.
- Existing insert before/after, duplicate/new UUID, move, delete/undo, revision
  history, session/version protection, unsaved-change protection and explicit
  publication controls remain. Input updates are refused while a save is in flight.
  Text-local history resets on an external lesson-level undo/reload to avoid
  resurrecting another snapshot's content. Lesson-level history retains its
  existing bounded 30-snapshot policy.

## Content and API compatibility

No PostgreSQL schema change is needed: `lessons.blocks` and immutable revision
snapshots already store JSONB. This is an additive content contract: original
blocks still parse and render unchanged when optional fields are absent.
`appearance.version=1` identifies the presentation representation; only enum
presets, booleans and bounded data are accepted. Unsupported versions/arbitrary
CSS/unknown attributes are rejected. Existing inline semantic color tokens remain.

Text-bearing blocks keep their original type and UUID, plus an optional `runs`
array and equal plain-text fallback. Server validation rejects mismatched fallback
text. Whitespace is preserved in these blocks instead of trimming away text that
selection anchors depend on. Lists keep their original `items` and `ordered`
fields, with optional bounded nesting/marker/start metadata. Tables keep their
headers/rows and add optional bounded cell presentation. Old list/table data needs
no transformation. New lesson content must be served by the updated API and UI;
an older API will correctly reject unknown optional fields until manually updated.

The authoritative Zod block schema generates the OpenAPI block contract and typed
clients via the existing lesson codegen flow. The former handwritten generator
delegates to this schema, preventing it from erasing new optional properties.
Generated contracts preserve existing field names/discriminators and routes.

Publishing still uses the existing server service to insert a new immutable
revision. No UPDATE/DELETE of published snapshots was added. Saving a working
draft does not change its current published pointer. Current revisions/learner
answers were never accessed or modified by this task. Tests establish source/mock
compatibility, not live PostgreSQL persistence.

## Image failure diagnosis

The exact old message `Image unavailable: unsafe or invalid URL.` is emitted by
`LessonContent` when `safeLessonUrl(block.url)` returns null **before an image
request**. The rejection means an invalid/relative URL, unsupported protocol or
embedded credentials (subject to the existing approved same-origin exceptions).
That particular message cannot be caused by a missing remote resource, HTTP auth
failure, CSP or unconfigured upload storage. No failing authored URL was provided,
so the specific stored value was not guessed or changed.

URL rules were not loosened: existing HTTP/HTTPS support and exact approved local
learning/media paths remain; script/data/file URLs and credentials are rejected.
There is no new origin allowlist to bypass. The dialog distinguishes missing URL,
unsupported protocol and invalid/credential-bearing URL. Valid URLs can still fail
to load; the renderer now reports that separately and directs the operator to
Network/CSP diagnostics. Browser `img.onerror` alone cannot reliably distinguish
404, remote policy, network and CSP; the UI does not pretend otherwise. Private
media continues using authenticated transport and may report unavailable storage.

## Files changed

| File | Change |
| --- | --- |
| `artifacts/ccna-learning/src/components/admin-lessons.tsx` | Existing studio workspace integration; old segment/delimiter editor replaced |
| `artifacts/ccna-learning/src/components/lesson-rich-editor.tsx` | Framework editor, toolbar, selection/history, direction and safe paste integration |
| `artifacts/ccna-learning/src/components/lesson-visual-blocks.tsx` | Reusable style, list, grid, image and specialized block controls |
| `artifacts/ccna-learning/src/lib/lesson-rich-text.ts` | Typed JSON adapter, approved palette and paste filtering |
| `artifacts/ccna-learning/src/lib/lesson-block-operations.ts` | Nonmutating table structure/style operations |
| `artifacts/ccna-learning/src/components/lesson-content.tsx` | Shared safe rendering for old and new content; image load feedback |
| `artifacts/ccna-learning/src/lesson-visual-editor.css` | Responsive workspace, semantic lists/tables, presets and focus/contrast rules |
| `artifacts/api-server/src/lib/lesson-validation.ts` | Strict additive JSON contract and invariants; no DB schema edits |
| `artifacts/ccna-learning/src/components/visual-lessons.test.tsx` | Framework, renderer, palette, table and mounted interaction regressions |
| `artifacts/api-server/src/lib/visual-lessons.test.ts` | Legacy/new schema, bounds, fallback and stable-ID regressions |
| `tools/prepare-visual-lesson-contracts.mjs` | Authoritative offline block-contract generation |
| `tools/prepare-phase2b-contracts.mjs` | Delegation to the authoritative generator |
| `tools/run-curriculum-tests.mjs` | Include the two focused test files in lesson selection |
| `lib/api-spec/openapi.yaml` | Additive lesson block contract |
| `lib/api-client-react/src/lesson-api/api.ts`, `api.schemas.ts` | Regenerated lesson client/types |
| `lib/api-zod/src/lessons/api.ts` | Regenerated lesson validators |
| `artifacts/ccna-learning/package.json`, `pnpm-lock.yaml` | Required aligned editor dependencies |
| `docs/development/phase-2b1-visual-lesson-editor.md` | This implementation and verification report |

## Verification

- Focused lesson suite: **236 passed, 0 failed, 16 files** (217 existing tests,
  19 additions). Includes actual ProseMirror selected-range/mixed-mark/undo/redo
  operations, Arabic/Unicode, safe paste, table operations/style preservation,
  list semantics/keyboard/continuation, stable IDs, legacy parsing, NOTE rendering,
  all approved foreground/highlight contrasts at least 4.5:1, and a mounted React
  toolbar-selection-to-student-preview interaction with zero fetch/save calls.
- `node tools/check-admin.mjs`: PASS for API/frontend/schema/client TypeScript.
- `node tools/check-study-codegen.mjs`: PASS; eight spec/generated files reproduce.
- `node tools/build-admin-ui.mjs`: PASS. Existing sourcemap notices and main-chunk
  size warning remain. The rich editor is a separate lazy-loaded chunk.
- The first new test run had an incorrect selection-end expectation; it was fixed
  to assert that a trailing space outside the selected word keeps its prior mark.
  Later focused runs passed. No product validation was weakened to pass tests.
- No real browser desktop/mobile or database-backed create/save/reopen/publication
  check was performed. Mounted DOM tests are not browser verification. Current
  safety scope prohibits application writes outside explicitly approved isolated
  tests, and no isolated environment was started.

## Deferred work and operation

Resizable panels, drag-and-drop, merged cells, syntax highlighting and arbitrary
custom CSS/color pickers are deferred. Existing accessible buttons/native controls
are implemented alternatives. Plain text remains appropriate for CLI input;
no emulator is claimed. Image resource diagnostics still require the browser's
actual HTTP/CSP evidence when a valid URL fails.

Manual startup after review (no migration or grant command is needed):

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

In a second terminal, use the same directory and:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Use existing local hidden prompts; never send credentials in chat. Existing
processes were not restarted automatically. If already running, stop them manually
with Ctrl+C before starting updated code. Open `http://localhost:8080/admin/lessons`.
Create/edit a draft, select one word, format it, add a card/list/3-column grid/NOTE,
preview an approved hosted image, then use the existing Save draft changes flow
and reopen. This is a manual verification checklist, not a claim it was executed.
Publication remains a separate explicit action.

Migration 0014 remains byte-for-byte unchanged:
`c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893`.
This editor does not require it. Its isolated rehearsal may resume only after
separate authorization and the readiness blockers already documented in
`phase-2b-migration-0014-readiness.md` are resolved. Direct uploads and study
persistence must not be activated based on this editor report.
