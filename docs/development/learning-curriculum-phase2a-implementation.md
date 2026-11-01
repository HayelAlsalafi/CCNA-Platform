# Phase 2A — interactive learning foundation

Implemented 27 October 2026. Source implementation is complete; database activation
is **not approved or performed**. No production lessons or sample published
records were created. PostgreSQL-backed authoring and reading cannot be claimed
operational until the proposed migration and runtime permissions are activated.

## Discovery and architecture

The active application is the React/Vite workspace in `artifacts/ccna-learning`,
with Express routes in `artifacts/api-server`. `/topics` renders the existing
`CurriculumExplorer` through `TopicsPage`. `curriculum-config.ts` derives its six
domains and 48 chapter entries from `lib/ccna-book-chapters.ts`; chapter IDs are
the existing stable canonical topic UUIDs. Database `curriculum_chapters.id`
references `topics.id`. Display domain IDs (`d1`–`d6`) are distinct from database
domain UUIDs. Chapter titles, book volume/number and domain assignments are reused.

Questions still reference their existing topic IDs. Lessons are **separate**
records referencing `curriculum_chapters.id`; a chapter may own many lessons.
No topic, question, domain or chapter is duplicated or repurposed into a lesson.
Learner practice attempts, Nexus sessions and exam persistence remain unchanged.

Reused capabilities include Clerk's authenticated request transport, PostgreSQL
user-role/status authorization, `requireAdminMutationSession`, session-scoped
React Query caches, the persistent Nexus shell, Wouter routes, Radix Sheet,
searchable relationship selectors and the existing design tokens.

The official journal ends at 0011. Exam migration 0012 is a separate proposal.
This feature prepares **`lib/db/drizzle/proposed/0013_learning_lessons.sql`** and
does not alter the official journal, existing migrations or snapshots.

## Editor decision and content model

No Tiptap, Lexical, Quill, ProseMirror or Markdown editor is declared in the
active frontend manifest. Phase 2A uses a structured JSON block editing approach:
controlled React fields and semantic React rendering, not `contentEditable`,
`execCommand`, a custom HTML parser, or raw HTML. No dependency was installed.

Supported blocks:

- Paragraph and level-two/three heading.
- Rich-text segments with bold, italic, inline code and validated hyperlinks.
- Cisco CLI/code preserving whitespace, with clipboard feedback.
- Images and diagrams via validated absolute HTTP(S) resource URLs and required
  alt text; optional caption. No file-upload hosting system is added.
- Rectangular tables with column headers.
- Informational, warning and study-tip callouts.
- Knowledge checks with local explanation feedback.
- External lab references, explicitly labelled as references rather than execution.

Text is escaped by React. No HTML, executable content, iframe or arbitrary DOM
attributes are accepted. URLs reject unsupported schemes, missing hosts and
embedded credentials on the server and again at rendering. External images use
`referrerPolicy="no-referrer"`; links use `noopener noreferrer`. The server never
fetches those URLs or executes commands.

This is a usable **structured rich-text/block author**, not a full WYSIWYG
word processor. Rich segments have explicit accessible formatting controls.
Paste-from-Word cleanup, drag-and-drop, asset uploads, syntax highlighting and
collaborative editing are outside this phase. A future established editor can
adapt to the same versioned semantic content model without accepting raw HTML.

Each block has a stable UUID independent of order. Duplicate section IDs,
ragged tables, out-of-range knowledge-check answers and unknown properties are
rejected. Limits include 200 blocks, 30 objectives, 600 estimated minutes and
500 KiB serialized lesson content. The bounded 600 KiB Express parser runs
**after** authentication, Admin authorization and mutation-session verification;
the global 100 KiB parser bypass is restricted to lesson management paths.

Knowledge checks are ungraded self-checks, not question-bank questions. Their
explanations belong to the published lesson snapshot; they create no learner
attempts and do not expose answers from existing practice questions.

## Persistence and publication

`lib/db/src/schema/lessons.ts` is exported by the existing schema barrel.

| Structure | Relationship and policy |
| --- | --- |
| `lessons` | UUID identity; existing chapter FK; editable working copy; title, description, objectives, minutes, blocks and order; optimistic version; author/editor user FKs; timestamps; nullable publication pointer |
| `lesson_revisions` | UUID identity; parent lesson FK; per-lesson revision number; complete content snapshot; publishing actor and timestamp |
| Composite publication FK | `(published_revision_id, lessons.id)` references `(lesson_revisions.id, lesson_id)`, preventing a lesson from publishing another lesson's revision |

All parent/author references use RESTRICT. Indexes support chapter ordering and
revision retrieval. SQL adds an immutable-revision trigger rejecting UPDATE and
DELETE; the proposal includes no grants and modifies no existing rows. Its
trigger function uses a fixed `pg_catalog` search path and has PUBLIC privileges
revoked. Database enforcement has been inspected statically, **not executed**.

Creation saves an unpublished working copy. Saving an already-published lesson
does not alter what learners read. Publish locks the parent, verifies version,
chapter visibility and required content/objectives, inserts an immutable snapshot
and changes the publication pointer in one transaction. Unpublish clears the
pointer without deleting revisions. Moving a published lesson to another chapter
requires unpublishing first. Reorder uses deterministic row locking, verifies
chapter ownership and versions, and updates live navigation order deliberately.

Ordinary edits use optimistic versions and return 409 on concurrent changes.
The editor retains unsaved text on failure, guards closing/link navigation and
page unload, and offers a safe preview. Publication requires a saved draft.
Revision history lists published snapshots; ordinary draft saves are not each
stored as immutable revisions. No lesson deletion endpoint is introduced.

## API contracts and authorization

All endpoints below are relative to `/api` and require authenticated active users.
Administrators are authorized from PostgreSQL `users`, never token role claims.
Admin writes additionally require `X-Admin-Session` to match the verified session.

| Method and path | Result / purpose |
| --- | --- |
| GET `/chapters/:chapterId/lessons` | Published metadata only, in deterministic order; no draft fields |
| GET `/lessons/:id` | Published immutable snapshot, original chapter/domain/book metadata and bounded previous/next links |
| GET `/admin/lessons?chapterId=UUID` | Admin-only working-copy metadata; chapter filter; at most 200 rows |
| GET `/admin/lessons/:id` | Admin-only complete working copy for editing |
| POST `/admin/lessons` | Create draft |
| PUT `/admin/lessons/:id` | Save working copy with expected version |
| POST `/admin/lessons/:id/publish` | Publish snapshot with expected version |
| POST `/admin/lessons/:id/unpublish` | Withdraw learner access with expected version |
| POST `/admin/lessons/reorder` | Chapter-scoped ordering with per-lesson versions |
| GET `/admin/lessons/:id/revisions` | Admin-only published revision history, capped at 100 |

Unknown or unpublished lesson IDs return 404 to learners. Inactive parent topics
or blueprints also hide lessons. Published reads use snapshot content, including
while an administrator edits the working copy. List queries select metadata
instead of loading every complete body; adjacent lesson queries each use LIMIT 1.
Lists over 200 require chapter filtering rather than silently truncating results.
Every response uses private/no-store cache headers and generated Zod validation.
Unexpected faults return sanitized errors. Missing lesson tables return 503
`LESSONS_NOT_READY`; schema absence is never represented as a fake empty catalog.

The existing OpenAPI spec has additive lesson paths/schemas. The scoped
`lib/api-spec/orval.lessons.config.ts` generated only the new `lesson-api` client
and `lessons` Zod directories, with `clean: false`. Existing generated contracts
were retained. Shared lesson DTO exports alias generated types. The frontend uses
the existing authenticated transport and generated chapter-list fetcher. Admin
draft caches and learner lesson caches participate in session-change cleanup.

## Interface and navigation

- `/topics`: existing six-domain cards and chapter explorer retained. A selected
  chapter checks lesson availability independently from question coverage.
  **Start Learning** opens `/learn/chapters/:chapterId`. If no published lessons
  exist, it is disabled with **Lessons coming soon**. Errors have a separate Retry.
- Existing **Start Practice** keeps `/practice?topicId=<original UUID>` and its
  published-question rules. No practice behavior or mapping was changed.
- `/learn/chapters/:chapterId`: published lesson list and honest empty state.
- `/learn/chapters/:chapterId/lessons/:lessonId`: focused reader, breadcrumbs,
  objectives, TOC anchored to stable section IDs, previous/next links, code copy,
  tables/diagrams, responsive layout, adjustable typography and light/dark reading.
- `/admin/lessons`: new Lessons navigation entry inside the existing guarded
  Admin workspace. Create a lesson, choose an existing chapter, add objectives
  and blocks, save, preview, publish/unpublish or review revision snapshots.
  Filter to a chapter to reorder its lessons with accessible up/down buttons.

Reading position is a transient page-scroll indicator, clearly labelled as such.
It does **not** claim saved reading progress, completion or mastery. Typography
and reading theme are local component preferences, not browser-only substitutes
for lesson persistence. No placeholder lesson or practice record is generated.

## Source change inventory

New implementation files:

- `artifacts/api-server/src/lib/lesson-validation.ts`, `lib/lessons.ts` and
  `routes/lessons.ts` (paths under the same API server source directory).
- `lib/db/src/schema/lessons.ts` and proposed `0013_learning_lessons.sql`.
- `artifacts/ccna-learning/src/components/admin-lessons.tsx`,
  `components/lesson-content.tsx`, `components/chapter-learning-action.tsx`,
  `pages/lesson-reader.tsx` and `lessons.css`.
- `lib/api-client-react/src/lessons.ts`, generated `src/lesson-api/`;
  generated `lib/api-zod/src/lessons/`; `lib/api-spec/orval.lessons.config.ts`.
- New API service/route `lessons.test.ts` files and frontend
  `components/lessons.test.tsx`, plus this implementation report.

Existing integration files changed:

- API `routes/index.ts`, `middlewares/body-parsing.ts`, schema export barrel.
- Frontend `App.tsx`, curriculum page and tests, Admin navigation/overview,
  Nexus navigation and shell tests, Admin/learner session-cache modules and tests.
- OpenAPI specification, client/Zod export barrels and the focused offline test
  runner (new `--lessons` selection). Existing uncommitted changes were preserved.

## Verification results

| Check | Actual result |
| --- | --- |
| `node tools/run-curriculum-tests.mjs --lessons` | PASS: 168 tests across 10 files, zero failures |
| `node tools/check-admin.mjs` | PASS: API, frontend, schema and client TypeScript |
| `tsc -p lib/api-spec/tsconfig.codegen.json` using installed TypeScript | PASS |
| `node tools/build-admin-ui.mjs` | PASS: 1,961 modules; `.local/admin-ui-production-build/1793108581006` |
| Proposed migration / Drizzle FK static checks | PASS within focused tests; journal unchanged |
| OpenAPI references / offline runner syntax / Git whitespace inspection | PASS: 10 lesson operations, 16 schemas, zero unresolved schema references |
| PostgreSQL migration/transaction/trigger integration tests | NOT RUN: no database connections authorized for this task |
| Live signed-in desktop/mobile browser verification | NOT PERFORMED: no browser surface available |

Tests cover domain/chapter learning navigation, unchanged UUID practice links,
lesson empty/loading/error states, draft isolation, Admin/learner authorization,
stale mutation sessions, ordering ownership, optimistic conflicts, safe content,
code copy, local quizzes, missing lessons, invalid chapters, published snapshots,
API response contracts, session cache cleanup and the existing application shell.
The parser test exercises an authorized lesson above 100 KiB and rejects an
unauthorized malformed body before parsing. API services use in-memory database
fakes; UI tests use mocked network responses. These are not claims of actual
PostgreSQL persistence or browser end-to-end execution.

The existing build sourcemap and >500 KiB chunk warnings remain. Unrelated
pre-existing failing tests were not run, investigated or changed. No databases,
services, environment secrets, migrations already in the chain, lockfiles or
dependency versions were modified. No commits or pushes were made.

## Activation gate and recovery

Do not apply the proposal manually or use `db:push`. Separate explicit approval
and a guarded activation workflow must first:

1. Verify the exact development server/database identity, source hashes, current
   ledger and parent schema. The two new tables must have the reviewed owner.
2. Resolve ordered migration promotion: 0012 is an existing exam proposal, while
   0013 only needs the 0011 chapter schema semantically. Do not skip, renumber or
   activate unrelated exam persistence implicitly. Review the exact sequence.
3. Create a verified full backup and test restoration in an explicitly authorized
   isolated database; rehearse the actual Drizzle migration and repeat-run behavior.
4. Prepare consistent journal/snapshot metadata and extend strict launcher
   migration/table/privilege inventories as part of that reviewed activation.
5. Approve least privilege for the API role: SELECT/INSERT/UPDATE on `lessons`,
   SELECT/INSERT on `lesson_revisions`; no DELETE/TRUNCATE or revision UPDATE.
6. Apply through the official migrator only after approval, then verify FKs,
   immutable triggers, empty initial lesson inventory, role privileges and
   unchanged questions, chapter IDs, learner data and migration history.

Before commit, PostgreSQL migration failures should roll back the transaction.
After lesson publication, routine recovery is unpublishing or publishing a
corrected new snapshot. Do not drop lesson/revision tables to undo activation:
future annotations may depend on immutable revisions. Restore from a verified
backup only through a separately reviewed recovery procedure. No automatic
rollback, deletion or restoration was executed here.

For source-level local inspection, use the existing guarded API/web launchers
with system identifier `7694701597474139084` and hidden local credential prompts.
No migration command is included or implied:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
# In a separate terminal, same project directory:
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Open `http://localhost:8080/topics` or, as an Admin,
`http://localhost:8080/admin/lessons`. Lesson operations will report the activation
gate until the approved persistence rollout is complete. Existing practice remains
available according to actual question coverage.

## Phase 2B extension points — no speculative tables added

Personal study features should reference `(user_id, lesson_id, revision_id,
block_id)` rather than a chapter display number or current DOM offset alone.
Immutable revision snapshots retain the original selected text after edits.

- **Highlights:** exact quote, prefix/suffix context, normalized character offsets
  within the block, owner-defined color/category. Re-anchor against a new revision
  only with evidence; ambiguous matches require learner confirmation.
- **Notes:** private owner, plain or similarly validated semantic content; optional
  highlight/section association. Search/filter/edit/delete only within that owner.
- **Bookmarks/resume:** lesson and revision plus block/position; stale revisions
  remain identifiable. Never silently mark a lesson completed based on scrolling.
- **Study progress:** explicit completion evidence separate from reading position
  and practice performance, with last-visited timestamp and optional reminders.
- **Flashcards:** private owner, validated front/back, optional source anchor,
  scheduler version, due date, review history and server-authoritative scheduling.
- **Official objective links:** a future explicit many-to-many lesson/objective
  relationship referencing versioned official objective IDs. Current learning
  objective text is pedagogical content, not a replacement exam classification.
- **Related questions:** optional explicit lesson/question links can be added when
  a reader or authoring consumer exists; preserve existing question IDs and
  learner delivery/grading boundaries. Chapter practice already reuses the
  current topic mapping without guessing question-level associations.

Phase 2B should first activate/rehearse this persistence with approval, perform
signed-in desktop/mobile workflow checks, then add private progress/bookmark
consumers and ownership tests before introducing their storage structures.

## Future networking labs

Keep labs separate from lessons and questions: a lesson references a versioned
lab specification containing instructions, initial topology, expected configuration,
validation rules, hints and attachment metadata. A future execution service owns
attempts, feedback and completion evidence per learner, bound to the lab version.
Use explicit guided tasks or deterministic command-interpretation validators
before considering sandbox execution. Each backend must declare its capabilities.

Never execute learner strings through the host shell, connect to real equipment
implicitly, or claim Cisco IOS emulation. Packet Tracer files may be links or
attachments only until a supported, licensed execution/assessment integration is
actually implemented and tested. Isolate any future runner, resource limits,
network policy and grading evidence from the API process and authentication data.
