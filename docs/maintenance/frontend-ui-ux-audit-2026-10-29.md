# CCNA NEXUS — frontend UI/UX audit and approval plan

29 October 2026. **Audit and proposal only: no redesign implemented.** No frontend
application source, authentication, API, business logic, dependency manifest,
database, migration, published content or running service was changed. No commit
or push. Additions are the requested skill installation, local audit evidence and
this plan/wireframe.

## Method, skills and limits

- Used installed `ui-ux-pro-max` guidelines and scoped UX/React searches. The React
  split-pane queries returned no verified dataset match after one narrower retry;
  sizing recommendations below are explicitly project-specific design judgments.
- Impeccable was absent from the inspected project/user skill directories. Installed
  official `pbakaus/impeccable/.agents/skills/impeccable` into the project's existing
  `.agents/skills/` using skill-installer. Skill version **4.8.0**; official native
  engine **0.1.18** installed in user cache. No hooks, init workflow, PRODUCT.md,
  DESIGN.md, application packages or authentication settings were installed/changed.
  The skill will be discoverable automatically on the next turn.
- The required context command initially failed because its engine/cache needed
  permission. Per its fallback, project context was read directly; PRODUCT.md and
  DESIGN.md are absent. Engine bootstrap then succeeded. Context was not repeatedly
  rerun and no new product/design authority was invented.
- Applied Impeccable's audit playbook and planning guidance, preserving the existing
  NEXUS identity. Visitor modes: **Operate** for administration/practice and
  **Read** for lesson content. No new brand direction is proposed.
- Inspected `App.tsx`, the shared shell, all routed page families, administrative
  modules, lesson editor/renderer and CSS/responsive rules. Checked a prior local
  production CSS artifact against current selectors and import structure.
- Ran `impeccable detect artifacts/ccna-learning/src --json`: completed with exit
  **2** (findings), **10 warning findings**. Raw local evidence is
  `.local/frontend-audit-20261029/impeccable-source.json`.
- **No live browser, viewport measurements, computed-style inspection, screen-reader
  pass, interaction test or authenticated endpoint call was performed.** Old chat
  screenshots are historical context, not current rendering evidence. No test suite,
  production build, live database check or application restart was run for this audit.

Installation sources: [official repository](https://github.com/pbakaus/impeccable),
[official installation guidance](https://impeccable.style/docs/).

## Executive decision

Prioritize **Lesson Studio workspace geometry and CSS ownership**, then global
semantic tokens/RTL, then page-specific density. Keep the working lesson engine,
shared preview renderer, query/session boundaries and existing save/publication
workflow. Replacing the whole editor or adding another UI framework is unnecessary.

The chief verified defect is a CSS cascade conflict, not a need to rebuild rich
text. The last existing production CSS contains:

| Selector | Position in compiled CSS | Declaration |
| --- | --- | --- |
| `.visual-editor-sheet` | 19,435 | Width up to 1600px, `!important` |
| `.visual-editor-full` | 19,600 | `100vw`, no max width, `!important` |
| `.lesson-editor-sheet` | 37,647 | Width/max-width capped at 920px, `!important` |

Artifact:
`.local/admin-ui-production-build/1793214866097/assets/index-Bla8hq_c.css`.
The later equal-specificity important 920px rule wins for an element bearing both
classes, including the Full Screen variant. `lesson-content.tsx` imports the visual
editor stylesheet while `lesson-reader.tsx` imports `lessons.css`; subsequent
duplicate imports do not guarantee a later CSS definition. This corroborates the
source-level collision. It does **not** establish what bundle a running browser is
currently serving.

## Audit health — provisional source rubric

| Dimension | Score / 4 | Evidence / limit |
| --- | --- | --- |
| Accessibility | 2 | Focus rings, semantic controls and tab semantics exist; dense controls and complete RTL remain gaps; no AA certification without rendered checks |
| Performance | 2 | Rich editor is lazy-loaded; route components remain broadly static imports; shared renderer pulls authoring CSS; no runtime performance measurement |
| Theming | 2 | Root tokens exist, but NEXUS, overview, admin and lessons maintain different palettes/width rules |
| Responsive design | 2 | Multiple responsive layouts exist, but editor width conflicts and mobile preview hides save controls |
| Implementation integrity | 2 | Product-specific curriculum/practice/admin structure is coherent; long-form authoring remains constrained by a modal architecture |
| **Total** | **10 / 20** | Planning rubric only; not an accessibility or performance compliance result |

Implementation verdict: **preserve and refine the existing product; replace the
Lesson Studio workspace container**. No confirmed P0 task blocker was established
by this source-only audit. The plan contains **4 P1, 6 P2, 1 P3 findings** below;
these are separate from the detector's 10 style warnings.

## Prioritized verified findings

| ID / priority | Evidence | User impact | Proposed correction |
| --- | --- | --- | --- |
| F01 · P1 | `lessons.css:398` vs `lesson-visual-editor.css:1`, compiled order above | A nominal full-screen editor is still capped at 920px; two usable panes become narrow columns | Remove competing sheet width ownership when introducing the dedicated workspace; use one layout definition, not more `!important` overrides |
| F02 · P1 | `admin-lessons.tsx:657–675`, `ui/sheet.tsx` | A long authoring task opens a modal backdrop/focus trap over unused library content | Render the existing editor as the primary full-width admin workspace; keep dialogs for small insert/confirm tasks |
| F03 · P1 | `admin-lessons.tsx:713–714,934`; grid `1.08fr / 1fr` | Editing is on the left, preview on the right; this contradicts the requested arrangement | **Physical left preview / physical right controls**, equal initial allocation of available width |
| F04 · P1 | `nexus.css:122`, physical left/right rules; editor direction state; mixed `dir=auto` usage | Arabic content can work inside a field while the surrounding controls/navigation stay inconsistent | Separate UI locale from content direction; logical spacing, bidi isolation for IDs/code and explicit RTL acceptance checks |
| F05 · P2 | `index.css` root tokens, `nexus.css` local tokens, overview `--ov-*`, lesson hard-coded colors | Several local systems compete; fixes are fragile across pages/themes | Add semantic aliases to current NEXUS tokens and migrate component styles gradually; retain brand and reading surfaces |
| F06 · P2 | `lesson-visual-editor.css:70–96`, `lesson-rich-editor.tsx` | Every text block exposes a wrapping toolbar with 11–12px labels and many simultaneous controls | Compact contextual toolbar for the focused block; group text, color, link and history actions; keep keyboard alternatives |
| F07 · P2 | Mobile CSS hides `.visual-editor-pane`; save/publish controls are inside its form footer (`admin-lessons.tsx:903`) | Preview mode requires a mode switch to reach save actions | One persistent workspace action bar outside either pane; keep existing submit behavior and explicit publication rules |
| F08 · P2 | Metadata precedes all blocks; visual table editor shows many structural actions together | Author spends time scrolling through setup and interpreting action clusters | Collapsible lesson setup, lightweight outline, active block emphasis, selected-cell table controls and row/column menus |
| F09 · P2 | `nexus.css:60,66,139`; rich toolbar labels | 8–11px labels/uppercase tracking reduce scanability; Arabic has no explicit paired UI font strategy | Functional text 14–16px, body 16px+, metadata 12–13px; retain 10–11px only for genuinely secondary decoration; define Arabic-safe font fallback |
| F10 · P2 | Static route imports in `App.tsx`; visual-editor CSS imported by `LessonContent` | Learner surfaces inherit administration styling dependencies and larger entry bundles | Plan route-level splitting and shared reader/authoring stylesheet separation after layout; preserve query/session behavior |
| F11 · P3 | `lesson-rich-editor.tsx:119` uses `window.prompt`; several native confirms exist | Link insertion interrupts the visual workflow and lacks consistent inline help | Accessible small link popover/dialog with visible validation; retain URL rules and unsaved-content behavior |

P1 means major difficulty/brief mismatch here, **not an automatically proven WCAG
failure**. Actual target dimensions, contrast and focus obstruction need browser
measurement. Use 44px as a preferred touch target; WCAG 2.2 AA's 24px target-size
criterion has specific exceptions and must not be misreported as a universal 44px rule.

### Detector findings reviewed in context

- **2 “overused-font” warnings**: root/NEXUS Plus Jakarta Sans. Do not change the
  established brand font solely because a detector calls it common. Treat these
  as non-actionable for this approved preservation brief.
- **8 “side-tab” warnings**: expanded curriculum domain, a legacy focus panel,
  lesson/quote styles, four question-studio callout styles and a study style.
  Colored edges can legitimately communicate selection or educational meaning.
  Keep functional state/callout cues with labels; reduce purely repeated decorative
  stripes only where visual review confirms excess. These are not eight confirmed
  accessibility defects or proof that the UI should be flattened indiscriminately.
- No detector warning authorizes deleting content, removing functional indicators,
  replacing the brand or changing behavior. Static regex scanning does not prove
  runtime accessibility, layout, contrast or performance.

## Page-by-page improvement plan

| Page / surface | Preserve existing functionality | Proposed UI/UX improvement | Priority |
| --- | --- | --- | --- |
| Shared NEXUS shell | Sidebar, active route states, account controls, mobile Sheet, skip link, status indicator | Consistent page gutters/header heights; readable nav captions; logical RTL spacing; collapse rail without losing navigation; avoid layering an extra large page hero on workspaces | P1 foundation |
| `/` Command Center — all five tabs | Welcome banner; At a glance, Domain topology, Activity, Skill evidence, Next steps; current keyboard tab controls and real data | Keep distinct jobs per tab. Glance: clear count vs percentage labels. Topology: readable domain labels and non-color status. Activity: clear range/data-vs-empty state. Skills: stable comparison rows. Next steps: one primary action with evidence. Refine short-height/zoom scrolling rather than adding duplicate statistics | P2 |
| `/topics` Learning Curriculum | Existing six-domain register, chapter exploration, question/lesson availability, chapter navigation | Reduce stacked card/chrome overhead; keep the chosen domain/chapter clear; more direct lesson entry; preserve independent chapter/content navigation without creating nested page-wide scrolling traps | P2 |
| `/learn/chapters/:chapterId` chapter library | Existing published activity order and links | Compact domain/chapter breadcrumb, clear activity type/time/availability; distinguish no published lesson from loading failure; no placeholder published activities | P2 |
| `/learn/chapters/:chapterId/lessons/:lessonId` reader | Shared renderer, previous/next, navigation sidebar, typography tools, CLI copy, existing study controls | Consistent reading measure, less tool competition, mobile navigation/action grouping, visible focus beneath sticky areas; label inactive persistence honestly; Arabic prose direction independent from LTR CLI | P1 RTL / P2 layout |
| `/practice` Challenge Arena | Session builder, single/multiple choices, navigation, finish/leave confirmations, server-authoritative feedback | Separate setup/taking/results visual states; keep question and submit actions central; compact or move decorative hero during an active session; clearer selected/answered/flagged legend; retain every grading action | P2 |
| `/exam` Exam Simulator | Existing configure/timer/navigation/review/results/persistence controls | Improve setup filter density, persistent timer/submit hierarchy, compact mobile question navigation, wrap long options and protect action space at zoom; never alter timing/scoring/session semantics | P2 |
| `/practice/history` Learning Intelligence | Existing analytics, period range, pagination, search and detailed review | Define scan hierarchy between analytics and history; consistent table density and accurate metric labels; responsive detail drawer for short reviews; preserve page/filter context | P2 |
| `/profile` Learner Profile | Real profile/private progress, existing statuses and totals | Separate identity, learning summary and achievements; explain metrics briefly, avoid decorative empty panels and fabricated accomplishments; mobile vertical rhythm | P2/P3 |
| `/admin` overview | Module navigation, actual content statistics, workflow links | Task-oriented grouping and concise headers; consistent metric presentation/unavailable states; no extra nested admin navigation competing with the shell | P2 |
| `/admin/topics` | Existing pagination, filters/search, table/card modes, detail/edit, guarded bulk actions | Align filter rows and sticky selection summary, reduce redundant badges, make dependency/deletion outcomes easy to scan; retain explicit selection scope and confirmations | P2 |
| `/admin/questions` | Existing bank/search/filter/sort, previews, correct-answer controls, history-aware deletion and bulk workflows | Harmonize column density, distinguish preview/details/edit modes, improve contextual row actions and mobile summary cards; preserve DELETED/BLOCKED/FAILED distinctions and all confirmations | P2 |
| `/admin/taxonomy` | Existing chapter management and Book chapters view, search/domain/volume/status filters | Consistent chapter labels/breadcrumbs, clear separation of management vs book reference, readable bilingual titles; no recreation of obsolete objective classifications | P2 |
| `/admin/import` | Existing templates, upload, validation/errors, duplicate review, preview and explicit import confirmation | Clear step progression, accepted/rejected/duplicate summary, row-error table that remains readable on small screens, preserve results on failure; no parsing/transaction/API changes | P2 |
| `/admin/lessons` library | Search/filters/page size/pagination/status and edit entry; existing chapter organization | Compact metadata rows, active filter chips, meaningful lesson identity/status hierarchy and consistent navigation into full-width editing; do not redesign it as another editor-in-table | P1 entry / P2 list |
| Lesson Studio editing | Existing Tiptap/runs, all blocks, preview, outline, stable IDs, history, save/publish, conflict and unsaved protection | Dedicated full-width **50% left preview / 50% right editor**, contextual controls, persistent actions and progressive setup; full proposal below | **P1 first implementation** |
| `/sign-in`, `/sign-up` | Entire existing Clerk authentication and routing | Only outer visual spacing, typography and brand consistency if later approved; no key, role, token, provider or auth-flow changes | P3; separate visual scope |
| Not-found/config/loading/error states | Existing clear boundaries and retries | Shared message hierarchy and accessible action placement; no fake access, fake data or hiding genuine readiness failures | P2 |

No page above is assumed unfinished simply because it has less content. All five
dashboard tabs, list pagination, rich text, nested lists and grid editing already
exist; this plan improves their presentation instead of proposing duplicates.

## Design-system recommendations

1. **Preserve identity:** navy navigation, cyan/teal identity and action accents,
   neutral administration surfaces and warm reading paper. Retain Plus Jakarta
   Sans and the CLI mono role. No generic gradient/glass redesign.
2. **Use semantic layers:** existing palette → surface/text/border/action/status/
   focus tokens → editor/preview/table/toolbar tokens. Distinguish UI status colors
   from author-selected lesson color presets. Do not rewrite saved content styles.
3. **Constrain density, not workspace width:** fluid administration/editor surfaces;
   separate readable text measure of roughly 60–75 Latin characters for prose.
   Preview pane can occupy 50% without stretching each paragraph across that width.
4. **Typography:** page title 24–28px in task workspaces, section 18–22px, body/editor
   16px with 1.6–1.8 leading, functional labels 14px, secondary metadata 12–13px,
   CLI 14–16px. These are proposals, to validate at zoom and Arabic line wrapping.
5. **Arabic:** define an appropriate system Arabic fallback now in the plan; a
   dedicated local Arabic font is a later asset/licensing/performance decision,
   not an installation in this audit. Avoid letter spacing/capitalization rules
   on Arabic; use logical inline spacing and wrap mixed-language labels safely.
6. **Spacing and controls:** consistent 4/8px rhythm, 16–24px pane gutters and 8px
   action gaps; conventional 40–44px field/button heights where practical. Tokenize
   radius/elevation instead of introducing more per-page hex values and shadows.
7. **Reusable UI patterns:** one workspace header, state badge vocabulary, filter
   bar, empty/error/skeleton family, action bar, accessible contextual menu and
   table toolbar. Reuse existing Radix/shadcn primitives and icon family.
8. **CSS ownership:** separate reader content styles from studio layout; remove
   superseded width rules rather than stack overrides. Verify final CSS cascade
   and source import order. Respect current dark reader mode separately from
   administration surface tokens.
9. **Accessibility:** visible focus, labeled controls, meaningful heading order,
   non-color state, reduced motion, keyboard alternatives and no focus-obscuring
   sticky bars. Measure actual composed colors and target sizes before claiming AA.

## Lesson Studio layout proposed for approval

Desktop physical arrangement — same for Arabic and English:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ NEXUS / Lessons / Lesson title      Draft · Unsaved   Save  Publish  │
├─────────────────────────────────┬───────────────────────────────────┤
│ LIVE STUDENT PREVIEW — 50%       │ EDITING CONTROLS — 50%             │
│ local / not yet published       │ Chapter + lesson setup [collapse] │
│                                 │ Outline [open drawer]              │
│ Shared reader renderer          │ Selected block                     │
│ Title, prose, tables, images     │ Compact contextual format toolbar │
│ Readable centered text measure   │ Editable content                   │
│                                 │ Style / advanced [collapse]        │
│ Independent scrolling           │ Independent scrolling             │
└─────────────────────────────────┴───────────────────────────────────┘
```

See `lesson-studio-layout-proposal.svg` for the static planning wireframe. It is
not an implemented interface or a rendering of actual lesson data.

### Geometry and navigation

- Primary workspace, **not Sheet/Dialog**, occupying all available content width
  and height beneath one compact header. No dimmed library behind it, 920/1600px
  modal cap, duplicate hero or large unused surrounding gutters.
- Start at **50/50 of the workspace after navigation/gutters**, not of the entire
  monitor. Optional keyboard-accessible divider later, bounded approximately
  40/60–60/40 and resettable to 50/50; never squeeze either pane below usable width.
- Retain the existing navigation; a focus-mode collapsed rail is proposed to
  recover width, with an obvious expand/back action. Do not remove navigation or
  permanently hide account/help controls.
- Preserve `/admin/lessons` authorization and existing list controller. A frontend
  query-state/deep-link approach such as `?edit=<lessonId>` can enter/leave the
  workspace while preserving list filters. This is a proposal, not a new API or
  a requirement to change current auth routing.
- Sticky global action area contains Save draft, publication actions and one clear
  state summary. Preview mode must not hide save access. Publication remains an
  explicit separate action using current rules; no autosave/published claim is added.

### Editor and preview

- Right pane: collapsible setup, lightweight outline, block insertion points,
  focused block emphasis and compact structural actions. Keep stable IDs, existing
  duplicate/move/delete/undo, version/history view and failure-safe draft state.
- Contextual formatting uses the installed Tiptap editor; no second editor engine.
  Group emphasis, color/highlight, link and history. Distinguish text undo from
  lesson/block undo instead of displaying ambiguous duplicated Undo controls.
- Tables retain the working grid/operations. Row/column menus and selected-cell
  style controls replace the always-expanded action wall. Wider tables scroll
  within their pane. Do not remove headers, alignment, row movement or undo.
- Left pane uses the **same LessonContent renderer**. Immediate updates remain
  local, with an explicit unsaved-preview label. No mock saves, localStorage-only
  persistence, fabricated lesson progress or image-upload activation.
- Keep current image/diagram validation, alt/caption/sizing and honest failure
  messages; preserve CLI copy/whitespace, NOTE/callouts, lists, knowledge checks
  and lab fields. Move advanced fields behind disclosure, not out of the product.

### Responsive and bilingual behavior

| Available layout | Proposed behavior |
| --- | --- |
| Wide desktop, approximately 1280px viewport and above | Default equal side-by-side panes; optional rail; no container cap. Validate actual available width with expanded navigation |
| Medium / tablet / 1024px or heavy zoom | Use side-by-side only if both pane minimums fit; otherwise Editor/Preview switch. Do not shrink controls to preserve a nominal split |
| Phone 320–430px | One pane at a time, persistent Save/status, compact block menu and normal page scrolling; table-only horizontal scroll |
| Short landscape / virtual keyboard | Action bar and focused control remain visible; reduce chrome rather than clip the editor |

- Physical **preview-left/editor-right** is explicit and does not silently reverse
  with locale. UI language/direction and lesson content direction are separate.
- Editing controls must have a logical primary-task keyboard order with landmark
  jumps for Editor and Preview; validate it in English and Arabic rather than use
  positive tabindex values or duplicate DOM to force visual placement.
- Arabic prose/editor uses RTL/auto as appropriate. Cisco commands, URLs, UUIDs,
  code and numeric technical expressions remain LTR/bidi-isolated. Directional
  navigation icons mirror when semantically appropriate; vertical move buttons do not.
- State survives pane switches and resizing without remounting the editing model
  or triggering a save, publish, progress event or duplicate fetch.

## Implementation order after approval

1. **P1 — `$impeccable layout`:** relocate existing LessonEditor from Sheet to the
   dedicated workspace, resolve stylesheet ownership, preview-left/editor-right
   50/50 and persistent actions. Preserve list/session/save controllers.
2. **P1 — `$impeccable adapt`:** usable breakpoints/zoom/short height and Arabic RTL
   across editor controls; independent content direction and LTR CLI.
3. **P2 — `$impeccable distill` / `$impeccable typeset`:** progressive metadata,
   contextual text/table controls, consistent readable type and spacing.
4. **P2 — `$impeccable extract` / `$impeccable harden`:** document existing tokens,
   shared states and bilingual edge cases. Do not migrate business logic or data.
5. **P2 — `$impeccable optimize`:** route/style splitting only after baseline
   workflows/layout are preserved; avoid premature rewrites.
6. **Final — `$impeccable polish`, then `$impeccable audit`:** rendered and
   keyboard checks against acceptance criteria; re-evaluate the provisional score.

### Approval acceptance criteria

- At 1440×900 and 1920×1080, preview is physically left, controls right, initially
  equal, without background modal/backdrop or a 920px cap. The usable app area is
  filled; prose remains readable rather than stretched edge-to-edge.
- At 1280×720, 1024×768, 768px and 390/320px widths, 200% zoom and short landscape,
  no page-wide horizontal overflow; only tables/CLI regions may scroll horizontally.
- All existing block, outline, preview, undo/redo, save, conflict, publication,
  revision and unsaved-navigation behaviors remain. No data/API/auth changes.
- Selected-word formatting/cursor history, Arabic/English mixed text, safe links,
  table operations and preview consistency are exercised with authorized test data.
- Save is reachable from both mobile modes; Tab/Escape/focus restoration and
  screen-reader landmarks work. Normal text contrast meets 4.5:1 where required;
  focus/control boundaries and target sizes are measured in rendered states.
- Published content is never changed by visual inspection or preview; real save
  verification requires explicitly authorized test data. No migration dependency.

**Approval requested:** the dedicated full-width Lesson Studio layout above and
phased presentation-only improvements. You may approve the Studio phase alone or
the broader plan in another order. No redesign has been applied by this audit.
