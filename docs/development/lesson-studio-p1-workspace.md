# P1 Lesson Studio workspace — 2026-10-29

Implemented only the approved authoring workspace from the frontend audit and
wireframe. No database, API, authentication, permissions, migration, published
content or service changes were made. Migration 0014 remains outside this work.

## Before / after

Previously, the lesson editor was a portal Sheet above a dimmed lesson library.
Its `visual-editor-sheet` and fullscreen declarations competed with the later
`lesson-editor-sheet` rule (`max-width: 920px !important`). The editor came before
the preview in an unequal grid. Save lived inside the editor form, which became
hidden in the mobile preview mode.

The manager now renders either its existing library or the in-page workspace.
Application navigation, including the existing collapse control, stays available.
There is no editor portal, backdrop or underlying library. Preview is first in
the DOM and physically left; editing controls are physically right. The grid has
two equal `minmax(0, 1fr)` columns, with independent pane scrolling. Preview prose
has a separate 72ch maximum measure. The page wrapper's width and padding are
released only while it contains this workspace.

`lesson-studio-workspace.css` exclusively owns the new workspace geometry. The
retired Sheet width rules and old visual-editor grid/mobile geometry were removed
from the two shared stylesheets rather than overridden with more `!important`.
Shared lesson rendering/appearance styles remain available to the reader.

## Actions and preserved behavior

- One persistent action bar: Back to lesson library, draft status, Save draft
  changes, Publish revision and the existing Unpublish action.
- Save targets the existing form using its HTML `form` attribute, outside either
  switchable pane. Existing required fields, pending lock and duplicate submission
  guard remain. Native-invalid fields reveal setup and Editor mode for correction.
- Publication requires explicit confirmation. Existing saved-version protection,
  publication gates and unpublish confirmation remain. No autosave/autopublish.
- Back retains unsaved-change confirmation. Link navigation and before-unload
  safeguards remain. Workspace heading receives initial focus; library heading
  receives focus on return. Navigation is not trapped inside an editing modal.
- Setup metadata collapses independently; server field errors reopen it.
- Existing Tiptap, selected-range formatting, undo/redo, block model and preview
  renderer remain. Formatting is grouped by links, emphasis, appearance and text
  history/direction, without replacing editor selection behavior.
- Outline, insertion, movement, duplication, deletion, tables, images, CLI,
  callouts/NOTE, knowledge checks, lab references and immutable revision history
  remain. Stable section IDs and mutation payloads are unchanged.

## Responsive and direction behavior

The breakpoint uses the **available workspace container**, not viewport width:
at 1000px or less, Editor / Preview switches show one pane while keeping both
mounted. Save/status remain outside both panes. Compact spacing applies below
520px. Short-height/zoomed windows permit page scrolling with a sticky action bar
rather than sacrificing the working area. Existing navigation is unchanged.

The grid explicitly uses LTR geometry so RTL never reverses the requested pane
positions. Pane chrome inherits the document's RTL direction when applicable;
prose/title/description/objectives support automatic direction. Existing rich-text
direction selection remains. Code, CLI and URL/language fields use isolated LTR.
This work does not introduce a separate translation system or translate the
existing English application chrome.

## Files changed in this task

All frontend paths are under `artifacts/ccna-learning/src/`:

| File | Change |
| --- | --- |
| `components/admin-lessons.tsx` | In-page workspace, persistent actions, collapsible setup, focus and responsive mode handling |
| `components/lesson-rich-editor.tsx` | Semantic formatting groups; existing commands and selection retention preserved |
| `components/lesson-visual-blocks.tsx` | Explicit LTR for technical fields |
| `components/lessons.test.tsx` | Replace editor-dialog assumptions and add four workspace regressions |
| `lesson-studio-workspace.css` | New scoped geometry, responsive behavior and presentation |
| `lesson-visual-editor.css` | Remove old Sheet/grid geometry; retain renderer and block styling |
| `lessons.css` | Remove obsolete 920px Sheet rule and retired Sheet selectors |

This report is the only additional documentation file. Existing unrelated
uncommitted work was retained. No dependency changes or commits were made.

## Verification actually executed

| Check | Result |
| --- | --- |
| Focused frontend `lessons.test.tsx` and `visual-lessons.test.tsx` | **48 passed, 0 failed**, two files |
| `node tools/check-admin.mjs` | **PASS** — installed-cache TypeScript check |
| `node tools/check-study-codegen.mjs` | **PASS** — eight spec/generated files reproduce |
| `node tools/build-admin-ui.mjs` | **PASS**, production frontend compilation |
| Final compiled CSS + DOM assertions | **6/6 passed** |
| Impeccable layout detector on manager/workspace CSS | **PASS**, empty findings array |
| Scoped `git diff --check` | **PASS** |

Tests cover existing selected-word/range formatting, shared renderer, block
operations, authenticated request context, version conflicts, failed-save content
retention, duplicate submission prevention, draft guards and lesson navigation.
New workspace regressions cover preview-first structure, in-page presentation,
Save outside panes in Preview mode, publication cancellation, native-invalid
field recovery, and preserved section/revision controls. These are database-free
component tests; they are not real PostgreSQL save/publication verification.

The first direct test invocation could not resolve the Windows Rollup native
package; it was rerun with the existing native-dependency cache, without installing
anything. Sandbox directory denial required approved execution outside the sandbox
for the tests and contract check. One intermediate assertion caught a new loading
label's punctuation encoding; corrected to the original ellipsis and all final
checks passed.

Final artifact:
`.local/admin-ui-production-build/1793272943654/`

Compiled `assets/index-m8brLTcU.css` verifies:

1. No `.lesson-editor-sheet`, `.visual-editor-sheet` or `.visual-editor-full`.
2. Explicit LTR grid with two equal columns.
3. The 1000px container-based switch.
4. Full available width on the scoped page wrapper.
5. Independent scrolling with overscroll containment.
6. Save's form association outside the switchable panes (source DOM check).

Build warnings remain for shared UI sourcemap locations and the main bundle above
500kB. They did not fail compilation; unrelated bundle refactoring is outside P1.

## Visual verification limitation and local review

Browser discovery returned no attached browsers and reported the browser host
unavailable. The relevant native Chrome window was minimized and could not be
inspected through the available bound interface. **No live browser layout,
screenshots, real keyboard traversal or real save/publish operations are claimed.**
No services were restarted. No actual lesson data was saved or published.

Use the existing running authenticated application at `/admin/lessons`, then
Create lesson or Edit / preview. The frontend can use its existing hot reload;
any service restart remains a separate user action/permission.

Manual visual acceptance remains pending at 1440×900, 1920×1080, 1280×720,
1024×768, 390px mobile and 200% browser zoom. Verify pane proportions, independent
scrolling, visible action bar in both mobile modes, RTL content with LTR CLI/URLs,
Tab/focus, text selection formatting, local live preview and cancelled unsaved
navigation. Save/publish only an explicitly authorized test draft; do not alter a
published lesson merely to check presentation.

P1 is complete at source/test/build level. Further audit phases were not started.
