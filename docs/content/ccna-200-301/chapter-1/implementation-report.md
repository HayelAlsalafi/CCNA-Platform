# Chapter 1 implementation — published

Completed 29 October 2026 using the existing authenticated Admin lesson APIs.
**Six new lessons published; zero new drafts remain.** This is actual persisted
content and authenticated reader-API verification, not an import proposal or
mocked save. The user executed the utility in the existing signed-in Admin tab;
the agent independently inspected its downloaded outcome receipt.

Open the existing chapter:
[Introduction to TCP/IP Networking](http://localhost:8080/learn/chapters/9d8bd104-2bc5-59c8-a417-367996c7d8b9).
Refresh the chapter/Studio if a previously open React Query view still shows its
pre-import inventory; the authenticated no-store API checks already see all seven.

## Published lessons and reading duration

| Order | Lesson | Minutes | Persisted lesson ID |
| --- | --- | --- | --- |
| 0 | **1.0 Network Fundamentals — unchanged existing lesson** | **5** | `ec725a65-e699-4938-a103-bc67f81a13fc` |
| 10 | 1.1 Networking Models, Open Standards, and TCP/IP Layers | 11 | `e5763d31-7f1a-44cf-9884-a3ba787979b4` |
| 20 | 1.2 HTTP, TCP Recovery, and Layer Interactions | 12 | `3172cdb4-27bd-424e-90d1-fc66c9a84814` |
| 30 | 1.3 IP Addressing and Routing from Sender to Destination | 12 | `25ba546a-a600-45c1-879e-4f5f2170ee2f` |
| 40 | 1.4 Ethernet Delivery and the Five Encapsulation Steps | 11 | `1805c5aa-b4bd-4a4d-bcfa-955b9fc6eaf5` |
| 50 | 1.5 OSI Layer Mapping and Protocol Data Units | 8 | `e288dab9-5ddb-49a0-ab4b-679ec7a2625e` |
| 60 | 1.6 Chapter Review and Networking Vocabulary | 9 | `3e6270f0-8c0c-4cc7-b0e8-34dbd7cbd5d5` |

**New readings: 63 minutes. Whole chapter including unchanged 1.0: 68 minutes.**
Estimates use 180 words/minute for technical prose plus explicit allowances for
studying table cells, ordered procedures and figure placeholders. The six new
lessons contain approximately 9,206 visible block words including table/glossary/
reference/placeholder text. These are estimates, not measured learner telemetry.

Each new lesson is now `PUBLISHED`, version **2**, with a new immutable published
revision. New records were first created as drafts, all six validated before any
publication, and then published with the server's optimistic version precondition.

## Exact preservation of the existing lesson

Before import, the read-only inspection established one existing Chapter 1 lesson:
1.0. It already contained the chapter introduction and Perspectives on Networking
(printed pp. 12 and 14–16). The continuation therefore starts the new teaching at
the networking-model section on printed page 16 instead of copying that introduction.

The complete Admin lesson object **and both immutable revision records/snapshots**
were canonically hashed before and after. The final hash matches exactly:

`c49a392eb0e5f701b98ede455f8425fd2288b07cf767a396d21025977105a203`.

Unchanged: lesson ID, title, description, body/formatting/section IDs, objectives,
reading duration **5**, numerical order **0**, status **PUBLISHED**, version **5**,
timestamps, and both immutable revisions. Published revision remains
`2a19b193-8c6e-4f0a-95ef-78bb62a9fc7b` (revision 2). A separate fingerprint of the
student-facing published lesson object also matched. Only its **derived** Next
navigation now points to 1.1, as required; no field/revision of 1.0 was edited.

The existing domain, V1 section and chapter context fingerprint remained
`66e99f8c0b4cc3a58211796209ad9940502641f7698f50c78b97192175ca0923`.
No chapter/domain/volume/topic was created or changed.

No annotation, bookmark, highlight or progress endpoint was called. Keeping the
original lesson/revision/section IDs intact preserves their existing references.
This is operation-scope/reference preservation, not a separate SQL fingerprint
audit of every learner table. Authentication remained the normal Clerk + PostgreSQL ADMIN authorization path; no token claims were used to bypass it.

## Source coverage and content format

The supplied PDF contains **20 pages**, through the final printed page **31**.
Every page was read; three complete source pages were privately rendered to
inspect diagram labels and review-table layout. No standalone source figures
were extracted into platform assets, uploaded, embedded or externally linked.

Source SHA-256:
`5669aeb8e6fd799d011cfdb4c17b411e9c5202a5bac1978bcf36d096253df212`.

[The completed source checklist](source-coverage.md) maps every PDF/printed page,
main/subsection, procedure, table, note, key comparison and final terminology to
the preserved 1.0 or a published continuation lesson. It records all five source
tables and the seven highlighted end-of-chapter review elements. This assesses
the supplied chapter, not the entire CCNA exam blueprint.

The continuation uses existing supported native blocks:

- **190 structured blocks**, including headings, short paragraphs, ordered and
  unordered lists, tables and callouts.
- **21 editable native tables**: all five source-derived tables plus explanatory,
  layer-comparison, address, process, PDU and glossary tables. No screenshots.
- **13 educational notes/tips**, plus **6 source-reference callouts**.
- Full HTTP sequence, TCP missing-segment recovery, IP forwarding, four Ethernet
  delivery steps and five sending/encapsulation stages.
- All nine terms in the source's final key-term list.
- **15 image placeholders**, each with its actual figure number, printed/PDF page,
  topic, technical description and manual-insertion status. They are text callouts,
  not empty image URLs, so they create no missing-image requests.

### Image insertion and explicit exclusions

Use [the consolidated image checklist](image-checklist.md). Figures 1-3–1-15 appear
beside their relevant new explanations. Figures **1-1 and 1-2** belong to the
already protected 1.0 content; their placeholders are collected at the beginning
of 1.1 with an explicit carry-forward explanation. Inserting them into 1.0 itself
would violate the present immutability instruction and was not done.

The original seven diagnostic quiz questions, answer choices and printed letter
answer key were not copied. Their technical concepts are taught in original
language, and 1.6 provides original recall activities rather than copied assessment
items. No practice/question-bank records were created.

The visible five-layer Figure 1-14 mapping is faithfully explained. Its caption
mentions two TCP/IP models although the supplied drawing includes only one TCP/IP
column; that discrepancy is explicitly noted, and no absent column is invented.
RFC 1122's four-layer variation and the source Table 1-2 alternative labels are
explained. No detailed fiber specifications absent from the supplied chapter body,
book edition, external website URL or other unavailable material was invented.

**No identified substantive technical section of the supplied chapter is omitted.**
Missing visual assets are intentional manual-insertion placeholders, not missing
surrounding explanations. All source-derived instructional prose was newly worded;
the old lesson was neither rewritten nor duplicated.

## Authenticated implementation and actual verification

Utility: `tools/chapter1-authoring/browser-authoring.mjs`. This is an operator-run
content utility, not a new application feature, route or authentication bypass.
It uses the current Clerk SDK session, keeps tokens only in memory/request headers,
checks server ADMIN authorization, and uses the normal session header and APIs.

The first read-only selector incorrectly assumed the exam-domain code `1.0` was
the curriculum API's display number. Source inspection confirmed the existing
contract uses `d1` / `01`; the utility was corrected to the exact known chapter
UUID and V1 reference. That stopped inspection made no lesson changes. No API or
curriculum contract was altered to accommodate the utility.

The frozen pack is bound to the original record and context fingerprints and its
canonical content hash:
`4656963410d06cf07f26842b55b236c5828ab9f087428f312a97ad46af6c254b`.

The writer permits only creation of new lesson drafts and publication of exact,
verified pack-owned records. It contains no PUT/PATCH/DELETE/reorder/unpublish
workflow. It rechecks original preservation during the run, refuses conflicting
titles/content, uses a cross-tab operator lock, and never automatically retries a
request with unknown outcome. A manual resumption must reconcile an exact payload
against the server inventory, preventing casual duplicate creation. This is not
claimed as a general server-side idempotency guarantee across unrelated operators.

Actual outcome receipt, independently inspected:

`<source-pdf-directory>/ccna-chapter1-import-2026-10-29T17-27-45.036Z.json`

SHA-256:
`1e1959176239aff7386f0b6bd632d837bf74d4b2436019d519896370d811bbe6`.
An unchanged local evidence copy is `.local/chapter1-authoring/import-receipt.json`.

| Check | Actual result |
| --- | --- |
| Six draft creates | Confirmed through authenticated APIs |
| Six publications/new immutable revisions | Confirmed; all six status PUBLISHED, version 2 |
| Published bodies | Each fetched through the student published-lesson endpoint and matched exactly to its validated payload |
| Student chapter discovery | Exactly seven entries in the intended 1.0–1.6 order |
| Previous / Next | Verified for **all seven** entries; 1.0 Previous null, 1.6 Next null |
| Chapter binding | Every published reader response retains the existing Chapter 1 |
| Existing 1.0 and two revisions | Exact full-object fingerprint unchanged |
| Existing published reader object | Exact fingerprint unchanged, excluding derived navigation |
| New drafts left over | **0** |
| Automatic retries | **0** |
| Protected lesson writes / study endpoint calls | **0 / 0** |

### Automated/offline checks actually run

- **4 focused Vitest tests passed, 0 failed** in
  `artifacts/ccna-learning/src/components/chapter1-content.test.tsx`.
- All six payloads passed the actual server `lessonInputSchema`.
- Every stable section ID is unique; all blocks use supported types; no image or
  diagram assets are referenced.
- The actual shared `LessonContent` renderer produced all **21 native tables**,
  **15 text placeholders** and headings, with no `<img>` or undefined output.
- Core protocol/address/history identifiers, complete four/five-step procedures
  and all nine glossary entries checked.
- Two additional offline guard-refusal checks reject changed original/context
  fingerprints; frozen pack and captured baseline hashes verified.
- All twenty source pages accounted for in the coverage record; all fifteen
  figure identifiers unique.
- JavaScript syntax and scoped diff whitespace checks passed. No broad test suite
  or unrelated build was run; no production application source was changed.

### Browser versus API verification

**Authenticated API verification occurred inside the operator's actual signed-in
Admin browser session.** This confirms persistence, publication, reader response
content and navigation. It is not a claim of visually inspecting the rendered
student UI or testing a separate LEARNER account.

The browser access host was unavailable. Actual desktop/mobile rendering, clicking
Previous/Next in the UI, table horizontal-scrolling ergonomics and interactive
notes/bookmarks/highlights/progress remain **visually/interaction pending**. Static
shared-renderer output and API links were verified instead. No learner tracking
records were created merely to test the content. Existing study functionality was
not modified.

## Practical improvements encountered — next phase only

These are observed authoring/workflow gaps, not UI redesigns implemented here.
Working rich text, tables, revision protections and existing reader features remain.

### Admin Lesson Studio

1. **P1: supported batch lesson import with preservation preview and server-side
   idempotency.** Six lessons required a separate authenticated API utility and a
   frozen preservation receipt. A built-in workflow should show new records only,
   detect duplicate source keys, validate all drafts, publish explicitly and retain
   per-row outcomes without Console execution.
2. **P2: first-class topic grouping within a chapter.** The current model is flat;
   this implementation uses existing descriptions/headings for six topic-group
   labels. Nested management is not presented as implemented. Any schema addition
   needs a separate reviewed migration.
3. **P2: native source/figure-placeholder management.** Fifteen text callouts and a
   separate checklist were necessary. A source-page/figure field and pending-image
   inventory would make later manual insertion/revision review less error-prone.
4. **P2: revision comparison and explicit protected-record handling in batch tools.**
   Full before/after API fingerprints were needed to prove 1.0 unchanged; the
   ordinary revision list alone does not provide that bulk-import preservation view.
5. **P3: reading-time calculation and import cache refresh.** Durations were
   calculated from prose/table/procedure complexity outside Studio. An imported
   batch should also invalidate relevant Studio/curriculum caches automatically.

All source tables were representable with the current native table blocks. No
new table-editor limitation, merge-cell bug or formatting defect is invented from
an unavailable visual session, and existing working controls were not replaced.

### Student Learning Reader

1. **P2: grouped chapter navigation.** Current sequential navigation works, but the
   six group labels live in lesson descriptions rather than a nested activity tree.
2. **P2: real chapter-review tracking.** The source's review-date table is reference
   content; it cannot act as a persisted learner form. A future review/completion
   experience should integrate with real progress instead of implying blank table
   cells save study state.
3. **P3: source/figure navigation.** A dedicated list of pending figures and source
   references would help readers find the carry-forward 1.0 diagrams without
   repeating its content. Current placeholders explicitly explain their placement.
4. **Verification follow-up:** inspect mobile tables and long-form comfort through
   an available authenticated browser, then test notes/bookmarks/highlights/resume
   with separately authorized disposable learner records. No failure of those
   existing functions was observed or claimed in this content-only task.

## Files and safety scope

Content/checklists: this report, `source-coverage.md`, `image-checklist.md`, and
`chapter-1-content-pack.json` in this folder.

Tools/tests: `tools/chapter1-authoring/build-content.py`,
`tools/chapter1-authoring/browser-authoring.mjs`, and
`artifacts/ccna-learning/src/components/chapter1-content.test.tsx`.

Source text, full-page inspection renders, original baseline and execution receipt
are private local working evidence under `.local/chapter1-source` and
`.local/chapter1-authoring`. An isolated PDF tooling cache was used without changing
application dependencies or the authoritative lockfile. The original PDF was not
modified, and no source-page render became an application asset.

No direct SQL writes, migrations (including 0014), schema changes, resets/restores,
Clerk/RLS/permission changes, image uploads, media activation, original lesson
updates, question-bank/exam changes, service restarts, commits or pushes occurred.
The task stops after these six published additions and verification.
