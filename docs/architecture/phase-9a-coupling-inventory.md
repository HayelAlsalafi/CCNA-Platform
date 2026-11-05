# Phase 9A — CCNA coupling inventory

Source baseline: `7e3e6c16cbfd2a87682d1e28da0e0939f29d5005`, branch `main`. Documentation-only review. No live catalog, grants, records, storage or credentials inspected. No tests/builds/migrations executed. The initial working tree was clean.

## Evidence rules and scope

- **V = EXISTING AND VERIFIED IN SOURCE**: the cited source contains the described implementation; this does not certify the running database.
- **P = PARTIALLY IMPLEMENTED**: an aspiration/partial structure exists but not the proposed end-to-end capability.
- **M = MISSING**: absent in the inspected schema export and relevant runtime interfaces; this is a bounded source finding.
- **L = REQUIRES LIVE VERIFICATION**: actual deployed identity, catalog, data, grants and behavior remain unverified.
- **BLOCKER** means adding a second course would be unsafe/incomplete without addressing this item. **ADAPT** means a contextual change/review is needed. **OK** means preserve the existing invariant or reuse that part, not that the whole feature is already multi-track.

The semantic register has **50 items: 21 BLOCKER / 20 ADAPT / 9 OK**. These are the counts used in the final report. The exhaustive lexical annex is a location index, not additional independent findings: a comment containing CCNA is not equivalent to a restrictive CHECK.

Read-only inspection used `git rev-parse`, `git status`, `git ls-files`, `rg` and text reads. A second text scan covered **1046 tracked text files**, finding **538 files** containing the specified literals or taxonomy symbols. It excluded secrets/private evidence, .env, .local, credential files and ignored/untracked artifacts before reading. No dependency directory or external downloaded source was searched. Tracked historical docs, fixtures and metadata are indexed so occurrences are not silently omitted; binary assets and package-manager lockfiles are not application-coupling evidence. The substring `1.1` can also occur in a dependency version, example or IP; the annex does not declare such an incidental hit a runtime coupling.

## Semantic inventory

| ID | Verdict | Evidence class | Source-verified fact / bounded absence | Evidence (path:line or symbol) | Architectural consequence / recommendation |
| --- | --- | --- | --- | --- | --- |
| C01 | BLOCKER | V | Canonical catalog fixes 48 chapter UUIDs, V1/V2, six domains and code generation. | `lib/ccna-book-chapters.ts:52; :87; :99; :106; :168` | Keep as a CCNA adapter/catalog; never use it as the registry for every course. |
| C02 | BLOCKER | V | Static curriculumVersion, domain IDs d1… and slug→UUID bindings build the returned curriculum. | `artifacts/api-server/src/lib/curriculum-config.ts:2; :3; :14; mapCurriculumTopics` | Resolve by course version; retain the existing CCNA response/IDs during compatibility. |
| C03 | BLOCKER | V | curriculum_chapters_canonical_ck permits only enumerated (id,volume,number,domain_code) tuples. | `lib/db/src/schema/curriculum-chapters.ts:40; lib/db/drizzle/0011_canonical_book_chapters.sql:12` | Replace only after equivalent catalog-backed enforcement is installed; not a UUID-specific conditional CHECK. |
| C04 | BLOCKER | V | number_ck restricts V1 to 1–29 and V2 to 1–19. | `lib/db/src/schema/curriculum-chapters.ts:52; lib/db/drizzle/0011_canonical_book_chapters.sql:13` | Preserve CCNA bounds in its immutable catalog; other courses use their own approved chapter definitions. |
| C05 | BLOCKER | V | code_ck requires CCNA-<volume>-<padded number>. | `lib/db/src/schema/curriculum-chapters.ts:56; lib/db/drizzle/0011_canonical_book_chapters.sql:14` | Use course-scoped uniqueness plus catalog correspondence; preserve every existing code. |
| C06 | ADAPT | V | exam_domains_code_ck requires numeric N.0, weights 1–100; composite FK binds domain/blueprint/code. | `lib/db/src/schema/exam-blueprints.ts:49; :53; :55; lib/db/src/schema/curriculum-chapters.ts:33` | Do not pretend arbitrary learning domains support this notation/weight convention. |
| C07 | ADAPT | V | exam_objectives_code_ck requires numeric objective prefix matching domain; objectives API is retired. | `lib/db/src/schema/exam-blueprints.ts:73; lib/db/src/schema/exam-taxonomy-validation.ts:6; artifacts/api-server/src/lib/taxonomy-admin.ts:70` | Keep legacy objective records/constraints; add profile-specific validation before enabling another convention. |
| C08 | OK | V | Chapter primary key is also a restrictive FK to topics.id; no independent chapter title/slug. | `lib/db/src/schema/curriculum-chapters.ts:16; :20; :23; lib/db/drizzle/0011_canonical_book_chapters.sql:18` | Retain this 1:1 bridge initially; do not regenerate topic or chapter IDs. |
| C09 | OK | V | questions.topic_id references both topics and curriculum_chapters. | `lib/db/src/schema/questions.ts:41; :66; lib/db/drizzle/0011_canonical_book_chapters.sql:24` | Course scope can be derived from the existing chapter FK; retain both restrictions. |
| C10 | OK | V | Lessons reference chapters; published revisions bind revision ID and lesson ID; mutations are rejected. | `lib/db/src/schema/lessons.ts:40; :43; :75; lib/db/drizzle/0013_learning_lessons.sql:42` | Preserve IDs, revision JSON, anchors, immutability and publication pointers. |
| C11 | ADAPT | V | topics.slug is globally unique, while chapter code/number uniqueness is currently blueprint-scoped. | `lib/db/src/schema/topics.ts:20; lib/db/src/schema/curriculum-chapters.ts:31` | Use globally namespaced new topic slugs initially; do not drop global uniqueness or rename old slugs. |
| C12 | ADAPT | V | Question codes use the global CCNA-Q sequence prefix, immutable identifiers and generated contract pattern. | `lib/db/src/schema/questions.ts:24; :38; lib/db/drizzle/0002_question_code_immutable.sql; lib/api-client-react/src/generated/api.schemas.ts:135` | Treat old codes as opaque legacy IDs; a new naming scheme needs additive contract/default review, not recoding. |
| C13 | ADAPT | V | Published visibility requires ACTIVE blueprint; ACTIVE blueprint requires source/verification metadata. | `lib/db/src/schema/exam-blueprints.ts:35; :37; artifacts/api-server/src/lib/lessons.ts:295` | Separate course publication from external certification verification; approve how non-certification courses activate. |
| C14 | BLOCKER | V | Direct question creation rejects IDs outside ccnaBookChapters. | `artifacts/api-server/src/lib/questions.ts:32` | Replace with version-scoped approved chapter lookup, retaining non-live creation/publication safeguards. |
| C15 | BLOCKER | V | Admin question edits retain canonical allowlist validation. | `artifacts/api-server/src/lib/questions-admin.ts:187` | Validate chapter membership against the selected version and preserve edit/history guards. |
| C16 | BLOCKER | V | Studio save, filters and relationship options assume canonical chapter taxonomy. | `artifacts/api-server/src/lib/question-studio.ts:68; :81; :132; :133; :235` | Thread explicit context through options/readiness/save; do not relax publication checks. |
| C17 | BLOCKER | V | Import resolves chapterCode/topicId through the CCNA array, rejects objective assignments, revalidates at confirmation. | `artifacts/api-server/src/lib/admin-content-validation.ts:97; :101; artifacts/api-server/src/lib/question-import.ts:46; :112` | Bind preview, fingerprint and confirmation to one version; preserve stale-preview rejection and DISABLED inserts. |
| C18 | ADAPT | V | CSV/XLSX headers require chapterCode or topicId; parsers and file/row bounds are separate from catalog semantics. | `artifacts/api-server/src/lib/question-import-files.ts:4; :5; :299; :317; artifacts/api-server/src/lib/admin-content-validation.ts:35` | Reuse file parser; require explicit import context, never infer course from a title or ambiguous code. |
| C19 | BLOCKER | V | saveChapter fixes title/volume/number/domain; insertion finds 200-301/1.1 domain; topics admin uses canonical IDs. | `artifacts/api-server/src/lib/canonical-chapters.ts:42; :84; :100; artifacts/api-server/src/lib/topics-admin.ts:92` | Keep CCNA editing contract as adapter; add separately validated generic authoring. |
| C20 | ADAPT | V | Taxonomy activation enforces all six domains for 200-301; catalog and domain edits are not course-scoped. | `artifacts/api-server/src/lib/taxonomy-admin.ts:38; :44; :56; :99` | Preserve certification rule; scope reads/writes and bind blueprint/version ownership. |
| C21 | ADAPT | V | Topic management filters and labels join chapters, domains and blueprints without version context. | `artifacts/api-server/src/lib/topics-management.ts:67; :99; :121; :272` | Constrain lists, exports and dependent metadata to the selected scope. |
| C22 | BLOCKER | V | Curriculum aggregates active topics globally then applies the static mapping; title is CCNA 200-301. | `artifacts/api-server/src/lib/curriculum.ts:11; :34; :39; artifacts/api-server/src/routes/curriculum.ts:27` | An extra course would otherwise produce unmapped data or misleading aggregate counts. |
| C23 | BLOCKER | V | Nexus domain binding fixes 200-301/1.1, but no-domain eligibility selects all active topics/questions. | `artifacts/api-server/src/lib/nexus.ts:43; eligible; nexusSelection` | No selected domain must mean all within the resolved course version, never all courses. |
| C24 | BLOCKER | V | Exam filters lack version; availability and selection span chapter taxonomy; IDs array limit is 48. | `artifacts/api-server/src/lib/exams.ts:23; :28; :79; :85; :213; :264` | Scope availability/start/recheck/history; retain randomized once, deadlines and count bounds. |
| C25 | BLOCKER | V | Command Center chapters/domains hardcode exam code/version; totals combine derived sources. | `artifacts/api-server/src/lib/command-center.ts:96; :100; commandCenterProjection` | Separate explicit all-course totals from version-local metrics; do not relabel global totals. |
| C26 | BLOCKER | V | Learning evidence fixes six axes, CCNA map, and VLAN chapter CCNA-V1-08. | `artifacts/api-server/src/lib/learning-evidence.ts:154; :162; :163; :314; :320` | Keep a CCNA evidence adapter; do not apply VLAN/CCNA achievements to other courses. |
| C27 | BLOCKER | V | Single/batch practice joins topics; chapter validity is indirect through FK; no course/entitlement predicate. | `artifacts/api-server/src/lib/practice.ts:13; :17; artifacts/api-server/src/lib/practice-batch.ts:11; :34; artifacts/api-server/src/lib/nexus.ts:45` | Add explicit context/access checks in a later implementation; do not claim these paths currently join blueprints. |
| C28 | ADAPT | V | Lesson catalog, chapter validation, published lookup and next/previous use chapter/domain/blueprint joins. | `artifacts/api-server/src/lib/lessons.ts:77; :137; :294; :316; :344` | Preserve revision visibility, add scoped capability/access policy checks at the API boundary. |
| C29 | ADAPT | V | Study/workspace/export visibility reuses published joins, without version scope. | `artifacts/api-server/src/lib/study.ts:42; :43; current; artifacts/api-server/src/lib/study-validation.ts:workspaceQuery` | Scope material lists and course summaries while preserving owner-only RLS and original anchors. |
| C30 | BLOCKER | V | Media read is allowed for global Admin or any visible published reference; no entitlement check. | `artifacts/api-server/src/lib/lesson-media.ts:176; artifacts/api-server/src/routes/lesson-media.ts` | Authorize through at least one accessible referencing lesson and explicit administrative media capability. |
| C31 | OK | V | S3 objects use opaque keys with fixed ccna-lessons namespace; private conditional writes and bounded reads. | `artifacts/api-server/src/lib/lesson-media-storage.ts:4; :23; :29` | Keep all existing keys, bucket paths and metadata. Namespace branding is not a reason to move binaries. |
| C32 | OK | V | Question revisions hash captured topic/text/options; exam mapping_snapshot captures chapter/domain metadata. | `artifacts/api-server/src/lib/question-revisions.ts:15; :33; :44; lib/db/src/schema/question-revisions.ts:31; artifacts/api-server/src/lib/exams.ts:264` | Never rewrite historical snapshots to attach current names/versions. |
| C33 | OK | V | Exam state trigger enforces immutable session/delivery fields and controlled finalization/deletion. | `lib/db/drizzle/0017_exam_simulator.sql:63; :69; :76; artifacts/api-server/src/lib/exams.ts:354` | Extend snapshot context additively and never retime or regrade old sessions. |
| C34 | OK | V | Study policies are owner-scoped via app.study_user; runtime asserts RLS enabled and FORCE false. | `lib/db/drizzle/0014_interactive_study.sql:24; :25; :39; :40; artifacts/api-server/src/lib/study.ts:31; tools/study-activation/proposed-runtime-guard.mjs:66` | Keep transaction-local actor; scoped staff role must not imply reading other learners' private annotations. |
| C35 | ADAPT | V | Runtime grants are table/column/function specific; user role/status UPDATE and lesson DELETE are withheld. | `tools/phase6a-local/05-grant-runtime.sql:40; :41; tools/lesson-activation/policy.mjs:73; lib/db/drizzle/0016_safe_lesson_deletion.sql:53; lib/db/drizzle/0017_exam_simulator.sql:140` | Any new scope tables/functions need separately approved least-privilege grants and exact runtime validation. |
| C36 | BLOCKER | M | Scoped assignments, OWNER role and transactional role-management/audit machinery are absent from the current model. | `lib/db/src/schema/users.ts:12; :22; lib/db/src/schema/index.ts; artifacts/api-server/src/middlewares/auth.ts:164` | Current implementation is global USER/ADMIN; scoped RBAC is a proposal, not an existing capability. |
| C37 | BLOCKER | M | No track/course/version, resource-access policy, entitlement, bundle or subscription model is exported. | `lib/db/src/schema/index.ts; lib/db/src/schema/lessons.ts; artifacts/api-server/src/lib/lesson-media.ts:176` | Design independent resource authorization; do not infer purchase rights from ADMIN/USER. |
| C38 | BLOCKER | V | Runtime only accepts exact reviewed migration chains/counts through 17 and exact schema/function/grant inventories. | `tools/phase6a-local/policy.mjs:113; :151; :152; tools/phase6a-local/upgrade.mjs:77; :97; tools/phase6a-local/run.mjs:54; tools/exam-activation/proposal.mjs:30` | A future additive migration also requires reviewed snapshots, executor and strict startup paths; old executors are not generic. |
| C39 | ADAPT | V | Authenticated routes expose unscoped curriculum, chapter lessons, practice, study and exams; admin gates remain global. | `artifacts/api-server/src/routes/curriculum.ts:5; artifacts/api-server/src/routes/lessons.ts:40; artifacts/api-server/src/routes/exams.ts:14; artifacts/api-server/src/routes/admin-content.ts; artifacts/api-server/src/routes/practice.ts; artifacts/api-server/src/routes/study.ts` | Introduce backward-compatible context resolution; authorize every direct-ID route, not only catalogs. |
| C40 | ADAPT | V | Generated clients/specs carry CCNA title/code patterns and existing filter contracts. | `lib/api-client-react/src/generated/api.schemas.ts:135; lib/api-spec/openapi.yaml; artifacts/api-server/src/lib/exams.ts:28` | Change source specs through existing codegen only in an approved implementation; retain legacy code acceptance. |
| C41 | ADAPT | V | App routes contain chapter/lesson IDs, global /exam and /practice, no course/version route context. | `artifacts/ccna-learning/src/App.tsx:276; :288; :291; :294; :296` | Keep deep links as CCNA compatibility routes; scoped navigation must not remount active sessions. |
| C42 | ADAPT | V | Shell fixes CCNA brand/exam header; navigation/admin modules have no course selector. | `artifacts/ccna-learning/src/components/nexus-shell.tsx:33; :75; :155; artifacts/ccna-learning/src/components/admin-ui.tsx:11` | Make context presentation data-driven later; branding can stay until owner decides. |
| C43 | BLOCKER | V | Admin taxonomy and book chapter reference UI enumerate canonical arrays and fixed counts. | `artifacts/ccna-learning/src/components/admin-taxonomy.tsx:67; :123; :151; artifacts/ccna-learning/src/components/taxonomy-book-chapters.tsx:98; :114` | Need a generic authoring view plus preserved CCNA reference adapter. |
| C44 | ADAPT | V | Curriculum, sidebar, practice/history, Exam header and skill visuals advertise a single CCNA context. | `artifacts/ccna-learning/src/pages/curriculum.tsx:79; :92; :410; artifacts/ccna-learning/src/components/learning-sidebar.tsx:240; artifacts/ccna-learning/src/pages/exam-simulator.tsx:250; artifacts/ccna-learning/src/components/nexus-visuals.tsx:167` | Use resolved catalog metadata; keep displayed educational text and session state unchanged. |
| C45 | ADAPT | V | Typed i18n keys and dynamic messages explicitly mention CCNA/200-301/1.1. | `artifacts/ccna-learning/src/i18n/messages.ts:134; :248; :505; :618; :1098; :1541; artifacts/ccna-learning/src/i18n/dynamic-messages.ts:52` | Retain historical keys; add parameterized UI keys rather than translate stored titles. |
| C46 | ADAPT | V | Study-export creator/headings/download filenames use CCNA branding. | `artifacts/ccna-learning/src/lib/study-export.ts:22; :23; :35; :60; :68` | Presentation metadata may gain scope; preserve export schema/privacy and technical file formats. |
| C47 | OK | V | Locale preference key is ccna-nexus.language, presentation provider does not define course/session identity. | `artifacts/ccna-learning/src/i18n/index.tsx:7; :62; artifacts/ccna-learning/src/main.tsx` | Keep the preference key and stable provider; no storage reset is needed for multi-track. |
| C48 | OK | V | Historical applied/proposed SQL and metadata retain immutable single-course evidence; journal has 17 entries ending 0017. | `lib/db/drizzle/meta/_journal.json; lib/db/drizzle/meta/0017_snapshot.json; tools/exam-activation/proposal.mjs:27` | Do not edit historical migrations/snapshots or regenerate their protected hashes. |
| C49 | ADAPT | V | Controlled deletion hardcodes global ADMIN; lesson deletion rejects every unreviewed incoming lesson FK even when empty. | `lib/db/drizzle/0016_safe_lesson_deletion.sql:9; :44; lib/db/drizzle/0017_exam_simulator.sql:105; :109` | New resource/entitlement FK or scoped admin operation needs dedicated safeguard review; never bypass definer checks. |
| C50 | ADAPT | P | Earlier authorization prose describes roles/user_roles, but current schema/middleware implement only global USER/ADMIN. | `docs/architecture/authorization.md:5; lib/db/src/schema/users.ts:12; artifacts/api-server/src/middlewares/auth.ts:176` | Treat older architecture aspirations as partial documentation, not source proof of RBAC. |

## API query and route coverage

This table includes the named modules even where there is **no direct taxonomy join**. Every actual direct reference found in production API source is indexed below; aliases in taxonomy-admin are explicitly included here. A route delegating to a library is not counted as a separate SQL implementation.

| Area | Query sites / symbols | Assessment |
| --- | --- | --- |
| Exams | `artifacts/api-server/src/lib/exams.ts:79,85,213,264` (`examEligibility`, availability, filter membership, captured mapping); routes `routes/exams.ts:14,81,104` | V / BLOCKER; no course-version input, empty domains can span courses |
| Nexus / practice workspace | `artifacts/api-server/src/lib/nexus.ts:43`, `eligible`, `nexusSelection`, `nexusStart`; analytics queries at :92–93 | V / BLOCKER; 200-301/1.1 binding and global unfiltered eligibility differ |
| Command Center | `artifacts/api-server/src/lib/command-center.ts:96,100`, `commandCenterProjection`; `routes/command-center.ts` | V / BLOCKER; preserve all-scope vs selected-scope semantics |
| Learning evidence | `artifacts/api-server/src/lib/learning-evidence.ts:314,320`, `learningEvidence`; `routes/learning-evidence.ts` | V / BLOCKER; CCNA six-axis and VLAN-specific adapter |
| Single/batch practice | `artifacts/api-server/src/lib/practice.ts:getPracticeQuestionForTopic,submitPracticeAnswer`; `practice-batch.ts:startPracticeBatch`; `routes/practice.ts` | V / BLOCKER; joins topics, not curriculum_chapters/blueprints directly; DB chapter FK is the indirect bridge |
| Imports | `artifacts/api-server/src/lib/question-import.ts:46–58`, `context,previewQuestionImport,confirmQuestionImport`; `routes/admin-content.ts:118,122` | V / BLOCKER; ORM reads chapters/objectives and whole question catalog, then static allowlist validation |
| Taxonomy admin | `artifacts/api-server/src/lib/taxonomy-admin.ts:26,38,58,59,101` (`blueprints/domains` import aliases); `lockBlueprint,validateActiveDomains,taxonomyCatalog,saveTaxonomy` | V / ADAPT; objectives creation retired at :70; do not mistake schema existence for an active objective workflow |
| Canonical chapters | `artifacts/api-server/src/lib/canonical-chapters.ts:17,26,68,80–84,100`; `chapterCatalog,saveChapter` | V / BLOCKER; 48-item source registry and hardcoded certification lookup |
| Curriculum | `artifacts/api-server/src/lib/curriculum.ts:11,34`; `routes/curriculum.ts:27–28` | V / BLOCKER; runtime query joins topics/questions, while chapter/domain structure comes from curriculum-config, not SQL taxonomy joins |
| Lessons | `artifacts/api-server/src/lib/lessons.ts:77,137,294,316,344`; `publishedJoin` reused for prior/next; `routes/lessons.ts:134–146` | V / ADAPT; keep revision and chapter validation |
| Study | `artifacts/api-server/src/lib/study.ts:42–43`; `published,current` reused by study/workspace/export/progress queries; `routes/study.ts` | V / ADAPT; owner RLS does not grant course access |
| Additional direct join consumers | `artifacts/api-server/src/lib/question-studio.ts:68,81,132,133`; `topics-management.ts:67,99,121,272`; `lesson-media.ts:176` | V / ADAPT, except media access C30 BLOCKER; these must not be missed by only reviewing learner routes |
| Admin monitoring | `artifacts/api-server/src/routes/admin-learners.ts:9,18,24,34` | V / ADAPT; global user/practice/exam summaries; lesson activity deliberately null, no RLS bypass |

In this table shortened `lib/` and `routes/` entries refer to `artifacts/api-server/src/`, never the root lib directory. Scope authorization must cover list/count/search/direct-ID/download and cached/conditional responses.

### Complete direct taxonomy reference index in API production source

Includes imports as well as SQL so delegated and aliased implementations remain traceable. All are source-only evidence. Taxonomy alias query sites are listed in the table above.

| Path:line | Reference kind | Class |
| --- | --- | --- |
| `artifacts/api-server/src/lib/canonical-chapters.ts:6` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:7` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:8` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:17` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:26` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:68` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:80` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:81` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:82` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:84` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/canonical-chapters.ts:100` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/command-center.ts:96` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/command-center.ts:100` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/exams.ts:79` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/exams.ts:85` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/exams.ts:213` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/exams.ts:264` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/learning-evidence.ts:314` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/learning-evidence.ts:320` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/lesson-media.ts:176` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/lessons.ts:77` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/lessons.ts:137` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/lessons.ts:294` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/nexus.ts:43` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/nexus.ts:92` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/nexus.ts:93` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/question-import.ts:7` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/question-import.ts:48` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/question-studio.ts:68` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/question-studio.ts:81` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/question-studio.ts:132` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/question-studio.ts:133` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/study.ts:42` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/taxonomy-admin.ts:6` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/taxonomy-admin.ts:7` | Imported taxonomy symbol (query body cited above) | ADAPT / V |
| `artifacts/api-server/src/lib/topics-management.ts:67` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/topics-management.ts:99` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/topics-management.ts:121` | Query / join expression | ADAPT / V |
| `artifacts/api-server/src/lib/topics-management.ts:272` | Query / join expression | ADAPT / V |

## UI and import interpretation

App route inventory is `artifacts/ccna-learning/src/App.tsx:282–301`: sign-in/up, dashboard, profile, topics, chapter/lesson reader, practice/history, exam, admin topics/questions/taxonomy/import/lessons/overview. No existing Track/Course/CourseVersion selection route is present in that switch (M). Shell navigation is `components/nexus-shell.tsx:33–38`; Admin module registry is `components/admin-ui.tsx:11–37` (V). Retain existing CCNA deep links; their compatibility resolver must not mean “any course”.

The complete CCNA/version-specific typed message-key locations found in `messages.ts` are below. Dynamic-key adapters also appear in the lexical annex, especially `i18n/dynamic-messages.ts:52,55`. Recommendation: parameterize application-owned labels in a future implementation; leave stored titles, authored questions, notes, answers and identifiers verbatim.

| Key evidence | Existing English key | Class |
| --- | --- | --- |
| `artifacts/ccna-learning/src/i18n/messages.ts:134` | "available questions lack active v1.1 taxonomy mappings. They are not assigned to a domain automatically." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:246` | "Required: chapterCode (for example CCNA-V1-01), text, difficulty (EASY / MEDIUM / HARD), optionA, optionB and correctOption (A-J; separate multiple correct answers with semicolons). Add optionC to optionJ as needed. Use questionType MULTIPLE_CHOICE_MULTIPLE for multiple answers; the default is MULTIPLE_CHOICE_SINGLE. Explanation and referenceNotes are optional for drafts." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:248` | "CCNA 200-301 v1.1 / 6 domains / 48 canonical book chapters. Questions and progress use the same stable chapter IDs." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:505` | "CCNA domains" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:509` | "Six CCNA domains" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:545` | "LEARN / CCNA 200-301" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:618` | "CCNA Exam Domain" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:759` | "No active CCNA v1.1 domain catalog is available. No mappings are inferred." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:788` | "CCNA PRACTICE" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:840` | "Create, classify and review CCNA assessments with learner history preserved." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:1098` | "Your CCNA Skill Matrix" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:1105` | "No active CCNA v1.1 domain evidence is available." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:1115` | "CCNA skill evidence, accuracy and coverage" | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:1301` | "Manage canonical book chapters and CCNA domains." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:1309` | "Work through active CCNA topics one prompt at a time. The question stays neutral until you submit; the answer service returns the result and explanation." | ADAPT / V |
| `artifacts/ccna-learning/src/i18n/messages.ts:1541` | "CCNA 200-301 / EXAM WORKSPACE" | ADAPT / V |

Import path: `question-import-files.ts:299,317` parses bounded files → `admin-content-validation.ts:78,97–114` resolves canonical code/UUID and rejects retired objective inputs → `question-import.ts:76,112` preview ownership/TTL and confirmation revalidation → `questions.ts:createQuestion` → existing publication flow in `question-studio.ts`. This is V, currently CCNA-only. Scope must be part of preview identity and revalidation, not merely an extra CSV column.

## Generic parts safe to reuse unchanged

“Unchanged” means the listed renderer/helper/algorithm, with existing safety checks and valid scoped inputs. Parent API selection/authorization is not included in that claim.

| Component / invariant | Evidence | Class / verdict |
| --- | --- | --- |
| Bilingual context, typed translations, Intl and preference persistence | `artifacts/ccna-learning/src/i18n/index.tsx:13,44,62` | V / OK; retain preference key |
| Question text/code rendering; original text remains original | `artifacts/ccna-learning/src/components/question-content.tsx:QuestionContent` | V / OK |
| Lesson blocks, semantic lists and rich-run rendering | `artifacts/ccna-learning/src/components/lesson-content.tsx:LessonContent,SemanticLessonList,RichRuns` | V / OK; scoped data/controls still required |
| Scroll-root detection, position measurement/resume and anchor restoration | `artifacts/ccna-learning/src/lib/reading-position.ts:27,40,126,136,147` | V / OK; do not rewrite for course selection |
| Modal/drawer keyboard/focus primitives | `artifacts/ccna-learning/src/components/ui/dialog.tsx`; `ui/sheet.tsx:SheetContent` | V / OK; permission is never delegated to UI |
| Revision capture, canonical JSON hash, answer normalization and feedback | `artifacts/api-server/src/lib/question-revisions.ts:15,44,93,105` | V / OK; do not add version metadata by rewriting prior JSON |
| Exam complete-set grading and server-deadline finalization | `artifacts/api-server/src/lib/exams.ts:318,354,378` | V / OK; scope selection changes are separate |
| Image decoding/optimization/edit bounds and immutable opaque storage keys | `artifacts/api-server/src/lib/lesson-media-library.ts:17`; `lesson-media-storage.ts:S3LessonMedia` | V / OK; catalog/delivery access predicates require adaptation |
| CSV/XML/ZIP parse limits and encoding handling | `artifacts/api-server/src/lib/question-import-files.ts:4,5,11,102,174,299` | V / OK; catalog validation remains C17 |
| Study anchor validation and owner transaction context | `lib/lesson-study.ts:validAnchor`; `artifacts/api-server/src/lib/study.ts:owned` | V / OK; staff access is not broadened |

## Live evidence and gaps

**L / REQUIRES LIVE VERIFICATION**: actual main ledger/catalog/owners/ACL/RLS, current row counts and CCNA availability, unresolved/orphan mappings, function bodies vs deployed copies, locks, index plans, real Clerk sessions, S3 references and resource sharing, restore completeness, concurrency and rollback. Source journal/snapshot describe 17 migrations / 24 tables; they do not prove the current live database matches (`lib/db/drizzle/meta/_journal.json`; `meta/0017_snapshot.json`; `tools/exam-activation/proposal.mjs:30`).

The supplied earlier assessment was Phase 8 presentation/verification, not a multi-track security proof (`docs/development/phase-8-final-acceptance.md:Decisions`). New architectural risks identified here: unfiltered cross-course question pools (C23/C24/C27), static-vs-SQL curriculum count disagreement (C22), any-published-reference media authorization (C30), unknown inbound FK rejection by controlled deletion (C49), and missing atomic scoped role authority/audit (C36). These are new findings relative to that supplied assessment; no claim is made about every earlier unpublished review.

## Exhaustive lexical location annex

Generated from the baseline tracked files; source not modified. Categories are case-insensitive ccna, exact 200-301, literal substring 1.1, CCNA- prefix, ccnaBookChapters, curriculumVersion, and chapter/taxonomy table or ORM symbols. Every matching line in every included file is listed (consecutive lines compressed). Path plus listed line numbers is the citation. Historical content/examples and old migration copies must be preserved, not globally search-and-replaced. Annex review treatment is a triage label; semantic verdicts C01–C50 take precedence. An incidental dependency/IP “1.1” is OK unless a cited runtime predicate uses it.

### Runtime application and shared libraries

| Source path | Search categories → all matching line numbers | Review treatment |
| --- | --- | --- |
| `artifacts/api-server/src/lib/admin-content-validation.ts` | ccna: 1,97,99; ccnaBookChapters: 1,97; CCNA-prefix: 99 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/canonical-chapters.ts` | chapter/taxonomy: 6–8,17,26,68,80–82,84,100; ccna: 10,42; ccnaBookChapters: 10,42; 200-301: 84; 1.1: 84 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/command-center.ts` | 200-301: 96,100; 1.1: 96,100; chapter/taxonomy: 96,100 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/curriculum-config.ts` | ccna: 1–3,5,14; 200-301: 2,5; 1.1: 2,5; curriculumVersion: 2 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/curriculum.ts` | curriculumVersion: 5,38,47; ccna: 39; 200-301: 39 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/exams.ts` | chapter/taxonomy: 79,85,213,264; ccna: 372,389 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/learning-evidence.ts` | ccna: 154–155,160,240–241,243,320; 200-301: 163,314,320; 1.1: 163,314,320; chapter/taxonomy: 314,320; CCNA-prefix: 320 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/lesson-media-storage.ts` | ccna: 20,26 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/lesson-media.ts` | chapter/taxonomy: 176 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/lessons.ts` | chapter/taxonomy: 77,137,294 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/nexus.ts` | 200-301: 43,92–93; 1.1: 43,92–93,113; chapter/taxonomy: 43,92–93; ccna: 113,376 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/question-import.ts` | chapter/taxonomy: 7,48 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/question-studio.ts` | ccna: 1,235; ccnaBookChapters: 1,235; chapter/taxonomy: 68,81,132–133 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/questions-admin.ts` | ccna: 1,187; ccnaBookChapters: 1,187 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/questions.ts` | ccna: 1,32; ccnaBookChapters: 1,32 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/study.ts` | chapter/taxonomy: 42 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/taxonomy-admin.ts` | chapter/taxonomy: 6–7; 200-301: 44; ccna: 53 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/topics-admin.ts` | ccna: 1,92; ccnaBookChapters: 1,92 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/lib/topics-management.ts` | chapter/taxonomy: 67,99,121,272 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/middlewares/auth.ts` | ccna: 32 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/routes/admin-content.ts` | ccna: 106,112 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/api-server/src/routes/learning.ts` | ccna: 41 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/index.html` | ccna: 6–7,9–10,13–14 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/package.json` | ccna: 2; 1.1: 16–20,22,24,26,28–29,33,36–37,39–40,55,64,74 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/App.tsx` | ccna: 107 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/admin-question-import.tsx` | ccna: 79,186; CCNA-prefix: 186 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/admin-taxonomy.tsx` | ccna: 12,67,123,151,174,221; ccnaBookChapters: 12,67; 200-301: 123; 1.1: 123 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/admin-ui.tsx` | ccna: 25 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/learning-evidence.tsx` | ccna: 240,253,338; 1.1: 253 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/learning-sidebar.tsx` | ccna: 240; 200-301: 240 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/nexus-shell.tsx` | ccna: 75,155; 200-301: 155 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/nexus-visuals.tsx` | ccna: 167; 1.1: 167 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/practice-run-workspace.tsx` | ccna: 244 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/question-bank-studio.tsx` | ccna: 102,259,363 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/question-studio-editor.tsx` | ccna: 602 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/components/taxonomy-book-chapters.tsx` | ccna: 5–6,9,15,42,98,102,106,110,114,140,169; ccnaBookChapters: 5,102,106,110,140; 200-301: 15,42; 1.1: 15,42 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/curriculum.css` | 1.1: 184,240,492,632,921 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/i18n/dynamic-messages.ts` | ccna: 52,55 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/i18n/index.tsx` | ccna: 7 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/i18n/messages.ts` | 1.1: 134,248,759,1105; ccna: 246,248,505,509,545,618,759,788,840,1098,1105,1115,1301,1309,1541; CCNA-prefix: 246; 200-301: 248,545,1541 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/index.css` | ccna: 436; 1.1: 496,518,607,647 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/lesson-studio-workspace.css` | 1.1: 46,274 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/lib/ccna-book-chapters.ts` | ccna: 1 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/lib/study-export.ts` | ccna: 22–23,35,60,68 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/curriculum.tsx` | ccna: 79,92,410; 200-301: 410 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/exam-simulator.tsx` | ccna: 250; 200-301: 250 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/nexus-history.tsx` | ccna: 225 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/nexus-overview.css` | ccna: 1,20,32,37,42,47,52–53,58,62,66–67,71,76,92,104,110–117,125,132,142,148,158,166,173–174,189,195,200,206,211,220–221,230,237,244,249,256,262,268,272,280,290,300,306,318,338,344,349–350,358,373,377,384,396,400,405–408,412,422,427,434,442,449,458,462,469,474,484,491,503,512,517,524,532–533,540,544,552,556,560,567,571,576,582–583,594,601,609,615,620,624,630,641,647,652,659,665,671,676,681,686,690,694,698,709,714,720,724,730,740,744–745,750–754,756,765,769,773,778,782,786,790,794,803,808,813,819,825,830,834,839,843,847,854,859,869,879,884,891–892,897,903,920,924,931,937,941,948,954,965,969,977,981,993,1000,1010,1017,1024,1035,1042,1049,1054,1059,1064,1070–1074,1080,1084,1088,1092,1096,1102,1105,1113,1117–1121,1124,1130,1134,1140,1145,1149,1157–1161,1167–1170,1173,1177–1178,1182–1184,1187,1191,1194–1195,1199,1203,1207,1210,1213,1216,1222,1225,1228,1232,1238,1243,1247,1252,1256,1263,1266,1274,1277,1282,1287,1293,1296,1299,1305,1309,1314–1315,1318,1323–1326,1329,1332,1336,1338,1342,1346,1350,1353,1358,1361,1366,1369,1379–1381,1390–1408; 1.1: 498,526,766,1125 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/nexus-overview.tsx` | ccna: 123,133,313,462; 200-301: 313; 1.1: 521 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/nexus-practice.css` | ccna: 1,20–21,25,30,40,52,56,63,73,81,86–87,94,98–99,103,109,113,122,126,134,140,144,149,157,162,170,183,187,194,200,214,226,235,239,243,258,271,275,284,292,302,315,320,326,331,335,345,349,353,358,363,374,383,391,396,405,409,420,430,437,447,455,463,468,477,482,487,493,498,511,516,527,536–537,543,550,558,563,579,585,591,596,603,616,622,627,636,642,649,653,658,673,678,683,691,695,702,708,714,728,733,741,747,753,760,765,770–771,857,861,867,871,877,881,885,891,896,902,906,911,916,922,926,931,935,941,945,949,954,958,962,966,971,975,982,987,991,995,1002,1008–1010; 1.1: 280 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/pages/nexus-practice.tsx` | ccna: 378,505 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/study-hub.css` | 1.1: 22 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/study.css` | 1.1: 180 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/src/topics-management.css` | 1.1: 12 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/ccna-learning/vitest.config.ts` | ccna: 11 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/mockup-sandbox/package.json` | 1.1: 15–16,19,21,23–25,27–28,32,36,38–39,51,70 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `artifacts/mockup-sandbox/src/index.css` | 1.1: 50–51 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/canonical-chapters.json` | ccna: 44,54,64,74,84,94,104,114,124,134,144,154,164,174,184,194,204,214,224,234,244,254,264,274,284,294,304,314,324,334,344,354,364,374,384,394,404,414,424,434,444,454,464,474,484,494,504,514; CCNA-prefix: 44,54,64,74,84,94,104,114,124,134,144,154,164,174,184,194,204,214,224,234,244,254,264,274,284,294,304,314,324,334,344,354,364,374,384,394,404,414,424,434,444,454,464,474,484,494,504,514 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/ccna-book-chapters.ts` | ccna: 52,87,106,168–169,175; 1.1: 52,100; CCNA-prefix: 87; 200-301: 99; ccnaBookChapters: 168 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/package.json` | 1.1: 25 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/src/schema/ccna-200-301-v1-1.ts` | ccna: 6,9–10; 200-301: 7,9–10; 1.1: 8–10,16,25–28; CCNA-prefix: 10 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/src/schema/curriculum-chapters.ts` | ccna: 1,43,57; ccnaBookChapters: 1,43; chapter/taxonomy: 14,17–18,31–32,34,36,38,40,52,56; CCNA-prefix: 57 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/src/schema/exam-blueprints.ts` | chapter/taxonomy: 23,33–37,40,43,49,51–56,71,92–93 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/src/schema/index.ts` | ccna: 29; 200-301: 29 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/src/schema/lessons.ts` | chapter/taxonomy: 15,39 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/src/schema/questions.ts` | chapter/taxonomy: 19,62; ccna: 24,44; CCNA-prefix: 24,44 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `lib/db/tsconfig.json` | ccna: 15 | ADAPT — see semantic C-items; literal presence alone is not a blocker |

### Contracts and generated clients

| Source path | Search categories → all matching line numbers | Review treatment |
| --- | --- | --- |
| `lib/api-client-react/src/command-center/api.schemas.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/command-center/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/generated/api.schemas.ts` | ccna: 5,135; CCNA-prefix: 135 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/generated/api.ts` | ccna: 5,160,207 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/learning-progress/api.schemas.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/learning-progress/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/lesson-api/api.schemas.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/lesson-api/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/practice-history/api.schemas.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/practice-history/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/study-api/api.schemas.ts` | ccna: 4 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-client-react/src/study-api/api.ts` | ccna: 4 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-spec/openapi.yaml` | ccna: 6,88,1803; CCNA-prefix: 1803 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-spec/study.openapi.json` | ccna: 4 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/command-center/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/api.ts` | ccna: 5,22,463,559,648,704; CCNA-prefix: 463,559,648,704 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminAccessResponse.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminAccessResponseRole.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminListQuestionsDifficulty.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminListQuestionsParams.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminListQuestionsStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestion.ts` | ccna: 5,15; CCNA-prefix: 15 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionCreate.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionCreateDifficulty.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionCreateOptionsItem.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionCreateStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionCreateType.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionDifficulty.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionListResponse.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionOption.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionType.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionUpdate.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionUpdateDifficulty.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionUpdateOptionsItem.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionUpdateStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminQuestionUpdateType.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminSessionPreconditionParameter.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminTopic.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminTopicCreate.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminTopicCreateStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminTopicStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminTopicUpdate.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/adminTopicUpdateStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/currentUser.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/currentUserResponse.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/currentUserRole.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/currentUserStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/dashboardSummary.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/errorResponse.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/errorResponseError.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/getPracticeHistoryParams.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/healthStatus.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/index.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/learnerQuestion.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/learnerQuestionDifficulty.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/learnerQuestionOptionsItem.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/learnerQuestionType.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceAnswerInput.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceAnswerResult.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceCorrectOption.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceHistoryItem.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceHistoryResponse.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceQuestion.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceQuestionDifficulty.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceQuestionOption.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceQuestionType.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/practiceTopic.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/generated/types/topicSummary.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/learning-progress/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/lessons/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/practice-history/api.ts` | ccna: 5 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |
| `lib/api-zod/src/study/api.ts` | ccna: 4 | ADAPT — generated headers may be OK; code patterns/contracts need source-spec review |

### Migration SQL and schema snapshots (historical evidence)

| Source path | Search categories → all matching line numbers | Review treatment |
| --- | --- | --- |
| `lib/db/drizzle/0001_question_domain.sql` | ccna: 20; CCNA-prefix: 20 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0005_exam_taxonomy.sql` | chapter/taxonomy: 5,14–17,20,22,24,29–34,37,50 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0006_controlled_history_delete.sql` | ccna: 8,13,51,57,61,63,80 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0007_nexus_sessions.sql` | ccna: 43 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0008_learning_achievements.sql` | ccna: 32 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0010_universal_question_deletion.sql` | ccna: 61,64–65,67,81 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0011_canonical_book_chapters.sql` | chapter/taxonomy: 2,10–14,18,20,22,24; ccna: 14; CCNA-prefix: 14 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0013_learning_lessons.sql` | chapter/taxonomy: 5 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0016_safe_lesson_deletion.sql` | ccna: 53 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/0017_exam_simulator.sql` | ccna: 70,76,79,114,116,140,142,144 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0001_snapshot.json` | ccna: 343; CCNA-prefix: 343 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0002_snapshot.json` | ccna: 343; CCNA-prefix: 343 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0004_snapshot.json` | ccna: 343; CCNA-prefix: 343 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0005_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0006_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0007_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0008_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0009_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0010_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0011_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0013_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0014_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0015_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0016_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/meta/0017_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0005_exam_taxonomy.sql` | chapter/taxonomy: 5,14–17,20,22,24,29–34,37,50 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0007_nexus_sessions.sql` | ccna: 43 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0008_learning_achievements.sql` | ccna: 32 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0010_universal_question_deletion.sql` | ccna: 61,64–65,67,81 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0011_canonical_book_chapters.sql` | chapter/taxonomy: 2,10–14,18,20,22,24; ccna: 14; CCNA-prefix: 14 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0012_exam_simulator.sql` | ccna: 70,76,79,114,116 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0013_learning_lessons.sql` | chapter/taxonomy: 5 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0016_safe_lesson_deletion.sql` | ccna: 53 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/0017_exam_simulator.sql` | ccna: 70,76,79,114,116,140,142,144 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0007_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0008_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0009_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0010_snapshot.json` | ccna: 343; CCNA-prefix: 343; chapter/taxonomy: 982–983,1040–1041,1059–1060,1070–1072,1074–1076,1078–1080,1085–1086,1128–1129,1151–1154,1167–1168,1175–1176,1187–1189,1191–1193,1195–1197,1199–1201,1293 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0011_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0012_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0013_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0014_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0015_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0016_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |
| `lib/db/drizzle/proposed/meta/0017_snapshot.json` | ccna: 343,2260; CCNA-prefix: 343,2260; chapter/taxonomy: 469,995–996,1053–1054,1072–1073,1083–1085,1087–1089,1091–1093,1098–1099,1141–1142,1164–1167,1180–1181,1188–1189,1200–1202,1204–1206,1208–1210,1212–1214,1306,2126–2127,2174–2175,2197–2199,2210–2213,2230–2231,2238–2239,2250–2251,2254–2256,2258–2260,2522 | OK — preserve historical/fixture evidence |

### Tests and operational tooling

| Source path | Search categories → all matching line numbers | Review treatment |
| --- | --- | --- |
| `artifacts/api-server/src/lib/admin-history-delete.test.ts` | ccna: 23,66; CCNA-prefix: 23,66 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/canonical-chapters.test.ts` | ccna: 8,15,26,42,132–133,155,172; ccnaBookChapters: 8,15,26,133,172; chapter/taxonomy: 9,32–34,101; 1.1: 42,131,134; CCNA-prefix: 42,132,155 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/curriculum.test.ts` | ccna: 1,36,46,49–50,58; ccnaBookChapters: 1,36,46,49,58 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/exam-taxonomy.schema.test.ts` | chapter/taxonomy: 6,15 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/exam-taxonomy.validation.test.ts` | ccna: 3,32–33,36,39,44,46,56,106,108,182,193,210–211; 1.1: 28,32–33,36,46,62,65,106,111,185,191; 200-301: 32–33,36,46,106; CCNA-prefix: 44 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/exams.test.ts` | ccna: 22,129,136; CCNA-prefix: 22,129,136; chapter/taxonomy: 147 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/learning-progress.integration.test.ts` | ccna: 26,30,57 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/lesson-media.test.ts` | ccna: 31 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/lessons.test.ts` | chapter/taxonomy: 58,296,336,425 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/minio-endpoint.test.ts` | 1.1: 8 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/phase2d-media.test.ts` | ccna: 30 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/pilot-publishing.test.ts` | ccna: 5,10; ccnaBookChapters: 5,10; chapter/taxonomy: 36 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/practice-history-details.integration.test.ts` | ccna: 22,26,46,75,92; CCNA-prefix: 75,92 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/practice-history-details.test.ts` | ccna: 29,60,118; CCNA-prefix: 29,60,118 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/practice-history-pagination.test.ts` | ccna: 60,95; CCNA-prefix: 60,95 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/practice.test.ts` | ccna: 10; CCNA-prefix: 10 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/question-import-files.test.ts` | ccna: 1,16,19; ccnaBookChapters: 1,16,19; 1.1: 31,147,162,164–165 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/question-import.test.ts` | ccna: 1,21,33; ccnaBookChapters: 1,21,33; chapter/taxonomy: 14,61 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/question-revisions.db.test.ts` | ccna: 21,52–54 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/question-studio.test.ts` | ccna: 1,33,87,123,130,168,245,263,277,294; ccnaBookChapters: 1,33,123,130,294; CCNA-prefix: 87,168,245,263,277; chapter/taxonomy: 132 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/questions.db.test.ts` | ccna: 70,75,102; CCNA-prefix: 70,75,102 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/questions.validation.test.ts` | ccna: 47,55; CCNA-prefix: 47,55 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/taxonomy-admin.test.ts` | chapter/taxonomy: 8–9,29–30; 200-301: 29,93,105,122; ccna: 93,107,122; 1.1: 93,106,122 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/lib/topics-management.test.ts` | ccna: 1,19,100; ccnaBookChapters: 1,19; CCNA-prefix: 100 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/pilot-integration.test.ts` | ccna: 25,32,35; CCNA-prefix: 25; ccnaBookChapters: 32,35 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/routes/admin-content.test.ts` | ccna: 140 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/routes/admin-questions.test.ts` | ccna: 107; CCNA-prefix: 107 | OK — preserve historical/fixture evidence |
| `artifacts/api-server/src/routes/practice.test.ts` | ccna: 126,147,362,369,376; CCNA-prefix: 126,147,362,369,376 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/admin-delete-controls.test.tsx` | ccna: 67,210,212; CCNA-prefix: 67,210,212 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/admin-modernization.test.tsx` | ccna: 1,60,66; ccnaBookChapters: 1,60; 200-301: 64; 1.1: 65,88 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/admin-session.test.tsx` | ccna: 48; CCNA-prefix: 48 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/application-shell.test.tsx` | ccna: 73 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/chapter1-content.test.tsx` | ccna: 8; 200-301: 8; 1.1: 41 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/command-center.test.tsx` | 1.1: 20; ccna: 112,180 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/learning-evidence.test.tsx` | ccna: 42 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/lessons.test.tsx` | 1.1: 123,600; ccna: 124,601 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/phase2c-editor-reader.test.tsx` | ccna: 27; 200-301: 27 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/phase2d-study-export.test.ts` | ccna: 31 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/phase2d1-save-resume.test.tsx` | 1.1: 109; ccna: 110 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/question-bank-studio.test.tsx` | ccna: 19,131,213,339,346,399,461; CCNA-prefix: 19,131,213,339,461; 1.1: 170,189 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/study-hub.test.tsx` | 1.1: 109; ccna: 110 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/study.test.tsx` | 1.1: 120; ccna: 121 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/components/taxonomy-book-chapters.test.tsx` | ccna: 6,31,120,143,193; ccnaBookChapters: 6,143,193; 200-301: 29; 1.1: 30,53 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/lib/ccna-book-chapters.test.ts` | ccna: 3–4,7,64,66,74–75,89,98–102,120,125; ccnaBookChapters: 4,89,98–101,120,125; 200-301: 127; 1.1: 128 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/lib/practice-history-cache.test.ts` | ccna: 13; CCNA-prefix: 13 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/pages/curriculum.test.tsx` | ccna: 41; 200-301: 41 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/pages/exams.test.tsx` | ccna: 33,46,103; CCNA-prefix: 33,46,103 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/pages/nexus.test.tsx` | 1.1: 22; ccna: 53,103; CCNA-prefix: 53 | OK — preserve historical/fixture evidence |
| `artifacts/ccna-learning/src/pages/practice-history.test.ts` | ccna: 25,35,88,153,195,204,214; CCNA-prefix: 25,35,88,153,195,204,214 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/final-import.test.ts` | ccna: 16,18,63; 200-301: 22; 1.1: 23 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/pilot-content.test.ts` | ccna: 24,56,67,70; 200-301: 24 | OK — preserve historical/fixture evidence |
| `tools/admin-practice-disposable.db.test.ts` | ccna: 51–52,54,110,174,207,220,503,693; chapter/taxonomy: 57,113–114,261–262,305,314,738,748; 1.1: 115,261,330,765; 200-301: 261,307 | OK — preserve historical/fixture evidence |
| `tools/admin-unit.config.mjs` | ccna: 66 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/apply-canonical-chapters.ps1` | ccna: 7–8,11 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/build-admin-ui.mjs` | ccna: 57,64,76 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/canonical-chapters-policy.mjs` | ccna: 20,57; chapter/taxonomy: 60 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/canonical-chapters-reset.mjs` | chapter/taxonomy: 21–22,183,240,246,265,268,271; 200-301: 42; 1.1: 42; ccna: 145–146,189,195,197,207,219,246,254 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/canonical-chapters.db.test.ts` | ccna: 62,114,153,163,186; CCNA-prefix: 114,153,163,186 | OK — preserve historical/fixture evidence |
| `tools/canonical-chapters.test.mjs` | chapter/taxonomy: 26,37; ccna: 45; 200-301: 45; 1.1: 45 | OK — preserve historical/fixture evidence |
| `tools/canonical-execution-state.mjs` | chapter/taxonomy: 29 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/chapter1-authoring/browser-authoring.mjs` | ccna: 52,72,91,175,180; CCNA-prefix: 52; 200-301: 91 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/check-admin.mjs` | ccna: 23,60,75,80–81 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/check-ui-localization.mjs` | ccna: 6,12; 200-301: 12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/dev.mjs` | ccna: 56 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/activation.mjs` | ccna: 41–42 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/activation.test.mjs` | ccna: 25,59,89–91 | OK — preserve historical/fixture evidence |
| `tools/exam-activation/apply-exam.ps1` | ccna: 6,15,18 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/apply.mjs` | ccna: 40 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/backup.mjs` | ccna: 45,86–87 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/check-readiness.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/diagnostics.mjs` | ccna: 3–4,19 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/diagnostics.test.mjs` | ccna: 20 | OK — preserve historical/fixture evidence |
| `tools/exam-activation/migration-context.mjs` | ccna: 13–14,20 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/migration-context.test.mjs` | ccna: 10,12,31,39,43,62 | OK — preserve historical/fixture evidence |
| `tools/exam-activation/prepare-backup.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/readiness.mjs` | ccna: 99 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/rehearse-backup.mjs` | ccna: 29,57,64,70,74,91 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/restore-roles.mjs` | ccna: 4,6,19,28–29,32,34–35 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/restore-roles.test.mjs` | ccna: 4,12–13,23,32–33 | OK — preserve historical/fixture evidence |
| `tools/exam-activation/runtime-details.mjs` | ccna: 20,22,25 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/safety-assertions.mjs` | ccna: 34,41–42,53,68,70,73,85,91,99,101,142,146,152; CCNA-prefix: 41; chapter/taxonomy: 148 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-activation/safety-assertions.test.mjs` | ccna: 38–40 | OK — preserve historical/fixture evidence |
| `tools/exam-disposable.db.test.ts` | ccna: 52; 200-301: 115; 1.1: 115; chapter/taxonomy: 115,123,133,294 | OK — preserve historical/fixture evidence |
| `tools/exam-final-read-only.mjs` | ccna: 22 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-final-read-only.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-guards.sql` | ccna: 9,15,18,53,55 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-migration-manifest.json` | ccna: 2 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-policy.mjs` | ccna: 45–46,103 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/exam-policy.test.mjs` | ccna: 57,85–87 | OK — preserve historical/fixture evidence |
| `tools/exam-runtime-grants.sql` | ccna: 11,13,33,36–38,44 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/execute-canonical-chapters.mjs` | ccna: 75; chapter/taxonomy: 147,151 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/execute-learning-upgrade.mjs` | ccna: 214,217,220,223–224 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/execute-nexus-upgrade.mjs` | ccna: 176,179,182 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/execute-question-bank-upgrade.mjs` | ccna: 125,265,268,271,275–276,279,281 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/invoke-canonical-chapters.ps1` | ccna: 7–8,11 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/invoke-learning-upgrade.ps1` | ccna: 8–9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/invoke-nexus-upgrade.ps1` | ccna: 8–9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/invoke-question-bank-upgrade.ps1` | ccna: 8–9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/learning-policy.mjs` | ccna: 59 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/activation.mjs` | ccna: 19 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/activation.test.mjs` | ccna: 106,139,141 | OK — preserve historical/fixture evidence |
| `tools/lesson-activation/apply-lessons.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/apply.mjs` | ccna: 71,135 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/backup.mjs` | ccna: 45,86–87 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/check-readiness.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/diagnose-state.mjs` | ccna: 32 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/diagnose-state.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/isolated.db.test.ts` | ccna: 56,134,279,370; chapter/taxonomy: 163–165,293 | OK — preserve historical/fixture evidence |
| `tools/lesson-activation/policy.mjs` | ccna: 71,117 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/prepare-backup.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/readiness.mjs` | ccna: 88 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/readiness.test.mjs` | ccna: 11,32 | OK — preserve historical/fixture evidence |
| `tools/lesson-activation/staging.mjs` | ccna: 54 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/start-private.ps1` | ccna: 6,10,18–19 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-activation/transaction-client.mjs` | ccna: 16,21,26 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/activation.mjs` | ccna: 17,33–34 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/activation.test.mjs` | ccna: 23,28,33,37–38,40–42 | OK — preserve historical/fixture evidence |
| `tools/lesson-deletion/apply-deletion.ps1` | ccna: 6,15,18 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/apply.mjs` | ccna: 40 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/backup.mjs` | ccna: 45,86–87 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/policy.mjs` | ccna: 17 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/policy.test.mjs` | ccna: 12,20 | OK — preserve historical/fixture evidence |
| `tools/lesson-deletion/prepare-backup.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/readiness.mjs` | ccna: 97 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/rehearse-backup.mjs` | ccna: 23,51,56; chapter/taxonomy: 55 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/rehearse.mjs` | ccna: 11,25; chapter/taxonomy: 22,29,37 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/restore-roles.mjs` | ccna: 4,6,16,25–26,29,31–32 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/lesson-deletion/restore-roles.test.mjs` | ccna: 4,12–13,23,32–33 | OK — preserve historical/fixture evidence |
| `tools/media-activation/activation.mjs` | ccna: 15,30–31 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/activation.test.mjs` | ccna: 17,47,53,67,73,78 | OK — preserve historical/fixture evidence |
| `tools/media-activation/apply-media.ps1` | ccna: 6,15,18 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/apply.mjs` | ccna: 40 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/backup.mjs` | ccna: 45,86–87 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/check-media-query.mjs` | chapter/taxonomy: 17,19 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/diagnose-restore.mjs` | ccna: 13 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/prepare-backup.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/readiness.mjs` | ccna: 93 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/rehearse.mjs` | ccna: 22–23,43 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/restore-security.mjs` | ccna: 10 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-activation/restore-security.test.mjs` | ccna: 11–12 | OK — preserve historical/fixture evidence |
| `tools/media-activation/start-private.ps1` | ccna: 6,10,18–19 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-reconciliation.mjs` | ccna: 7,9,15,21–22,26,29,34,43 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/media-reconciliation.test.mjs` | ccna: 6–7,10,16 | OK — preserve historical/fixture evidence |
| `tools/nexus-policy.mjs` | ccna: 79 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase2d/neon-readiness.mjs` | chapter/taxonomy: 10; ccna: 19,38–39 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase2d/neon-readiness.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/01-create-roles.sql` | ccna: 14–15,24–25,32,34 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/02-create-database.sql` | ccna: 17–18,27,29,38 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/03-lock-database.sql` | ccna: 13–14,24,30–32 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/04-prepare-schema.sql` | ccna: 1,6,14–15,30,32–33,51–52,54–55 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/05-grant-runtime.sql` | ccna: 2,6,14–15,32–35,37–42,44–45 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/06-verify.sql` | ccna: 1,5,13–14,23,26,29–37 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/07-grant-taxonomy-runtime.sql` | ccna: 2,10,20,22,49,54–62,67,69–70,72; chapter/taxonomy: 48,53,67 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/08-grant-admin-catalog-delete.sql` | ccna: 10,20,23,44,64–75,80,83–84; chapter/taxonomy: 43 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/SEAWEED.md` | ccna: 3,5,15 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/catalog-delete-grant.test.mjs` | ccna: 7,9 | OK — preserve historical/fixture evidence |
| `tools/phase6a-local/check-seaweed.mjs` | ccna: 23,29 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/frontend.mjs` | ccna: 25 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/frontend.test.mjs` | ccna: 19,40 | OK — preserve historical/fixture evidence |
| `tools/phase6a-local/invoke.ps1` | ccna: 10,20,22,28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/media-environment.test.mjs` | ccna: 12,28 | OK — preserve historical/fixture evidence |
| `tools/phase6a-local/policy.mjs` | ccna: 20–21,75; chapter/taxonomy: 142,146 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/policy.test.mjs` | chapter/taxonomy: 17; ccna: 79 | OK — preserve historical/fixture evidence |
| `tools/phase6a-local/run.mjs` | ccna: 54,203 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/runtime-startup.test.mjs` | ccna: 30 | OK — preserve historical/fixture evidence |
| `tools/phase6a-local/seaweed-environment.ps1` | ccna: 2,17 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/upgrade.mjs` | chapter/taxonomy: 48–49; ccna: 309,315,323,362,367,372 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase6a-local/upgrade.test.mjs` | ccna: 335,352,431–432; chapter/taxonomy: 401 | OK — preserve historical/fixture evidence |
| `tools/phase6a-local/verify-service.ps1` | ccna: 27 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/backup-disposable-test.mjs` | chapter/taxonomy: 19,42; ccna: 44–45 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/check-authentication.ps1` | ccna: 1,5,9 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/diagnose-provenance.mjs` | ccna: 9–10,24; 200-301: 9–10,24 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/diagnose-provenance.ps1` | ccna: 6–7,10 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/execute-final.mjs` | ccna: 9–10,67,176,223; 200-301: 9–10,67; chapter/taxonomy: 22–23,53–54,134,137,215 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/execute.mjs` | ccna: 9–10,59,158; 200-301: 9–10,59; chapter/taxonomy: 19–20,49–50,103 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/final-planner.test.ts` | ccna: 12; CCNA-prefix: 12 | OK — preserve historical/fixture evidence |
| `tools/phase8a-cleanup/invoke-final.ps1` | ccna: 6–7,11 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/invoke.ps1` | ccna: 6–7,11 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/planner.mjs` | ccna: 1; 200-301: 1 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/planner.test.ts` | ccna: 2–3; 200-301: 2–3 | OK — preserve historical/fixture evidence |
| `tools/phase8a-cleanup/topic-dependencies.mjs` | ccna: 7 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/phase8a-cleanup/topic-dependencies.test.ts` | ccna: 9 | OK — preserve historical/fixture evidence |
| `tools/phase8a-cleanup/verify-backup.mjs` | ccna: 22–24,106,108; chapter/taxonomy: 80 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/pilot-environment.test.mjs` | ccna: 8 | OK — preserve historical/fixture evidence |
| `tools/pilot-production-build.mjs` | ccna: 12,17,35 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-canonical-chapters.mjs` | ccna: 142; chapter/taxonomy: 173,195,200,223 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-canonical-metadata.mjs` | ccna: 24,36,40; ccnaBookChapters: 40; 1.1: 47; chapter/taxonomy: 54,58 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-exam-metadata.mjs` | 1.1: 24 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-learning-migration.mjs` | 1.1: 37 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-nexus-migration.mjs` | 1.1: 54 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-question-bank-migration.mjs` | 1.1: 26 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-study-metadata.mjs` | 1.1: 11 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/prepare-study-spec.mjs` | ccna: 153 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/promote-taxonomy.mjs` | 1.1: 18; chapter/taxonomy: 43 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/question-bank-disposable-access.mjs` | ccna: 9,12,44 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/question-bank-disposable.db.test.ts` | ccna: 103,117 | OK — preserve historical/fixture evidence |
| `tools/question-bank-empty-restore-check.mjs` | ccna: 31 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/question-bank-policy.mjs` | ccna: 65–66,73 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/question-bank-policy.test.mjs` | ccna: 26–27,107,139 | OK — preserve historical/fixture evidence |
| `tools/question-bank-restore.mjs` | ccna: 47,75; chapter/taxonomy: 120–121 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/question-bank-upgrade-core.mjs` | ccna: 149,156 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/rehearse-canonical-chapters.mjs` | ccna: 31; chapter/taxonomy: 52,55,61,64,67 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-admin-practice-disposable.mjs` | ccna: 29–31 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-admin-tests.mjs` | ccna: 53 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-curriculum-tests.mjs` | ccna: 34,40,42,45,48–49,51–52,58,61–62,64,66,70–72,77,82–86,93–97,99 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-lesson-delete-tests.mjs` | ccna: 28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-phase2c-tests.mjs` | ccna: 29–33 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-phase2d-tests.mjs` | ccna: 33–38 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-phase2d1-tests.mjs` | ccna: 28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-phase3b-tests.mjs` | ccna: 28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-study-hub-scroll-tests.mjs` | ccna: 28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/run-study-hub-tests.mjs` | ccna: 28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/activation.mjs` | ccna: 125 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/activation.test.mjs` | ccna: 41–42,53,72 | OK — preserve historical/fixture evidence |
| `tools/study-activation/apply-study.ps1` | ccna: 6,14,17 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/apply.mjs` | ccna: 39 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/backup.mjs` | ccna: 45,86–87 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/diagnose-isolated.mjs` | ccna: 41 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/diagnose-postcommit.mjs` | ccna: 50 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/diagnose-postcommit.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/isolated-policy.mjs` | ccna: 13–14,39,47,57 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/isolated-policy.test.mjs` | ccna: 9–11 | OK — preserve historical/fixture evidence |
| `tools/study-activation/prepare-backup.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/prepare-startup-patch.mjs` | ccna: 51 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/proposed-runtime-guard.mjs` | ccna: 42 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/readiness.mjs` | ccna: 94 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/rehearse.mjs` | ccna: 101; chapter/taxonomy: 517,549 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/start-private.ps1` | ccna: 6,10,18–19 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/startup.test.mjs` | ccna: 13,54,60–61 | OK — preserve historical/fixture evidence |
| `tools/study-activation/verify-postcommit.mjs` | ccna: 28 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/study-activation/verify-postcommit.ps1` | ccna: 7,9,12 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/create-environment.ps1` | ccna: 7,15–16 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/profile.mjs` | ccna: 13–14 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs` | ccna: 32–33,238; chapter/taxonomy: 198,204,206–207,229–230; 200-301: 206; 1.1: 206,208; CCNA-prefix: 238 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/taxonomy-rehearsal/rehearsal.mjs` | ccna: 34–35,211; chapter/taxonomy: 171,177,179–180,202–203; 200-301: 179; 1.1: 179,181; CCNA-prefix: 211 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/taxonomy-rehearsal/restrict-regression.test.mjs` | chapter/taxonomy: 24–25,40 | OK — preserve historical/fixture evidence |
| `tools/test-support/exam-source-fixture.mjs` | ccna: 12,15 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/test-taxonomy-migrator.mjs` | ccna: 63–65,143 | ADAPT — classify operator/runtime assumptions; retain immutable pins |
| `tools/workspace-root.ps1` | ccna: 2–3 | ADAPT — classify operator/runtime assumptions; retain immutable pins |

### Historical documentation, content and other tracked text

| Source path | Search categories → all matching line numbers | Review treatment |
| --- | --- | --- |
| `.github/workflows/ci.yml` | ccna: 44,52 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `docs/HANDOVER.md` | ccna: 8,13,35,37,54 | OK — preserve historical/fixture evidence |
| `docs/PROJECT-STATUS.md` | ccna: 3,21,187,190,208; CCNA-prefix: 187,190,208 | OK — preserve historical/fixture evidence |
| `docs/README.md` | ccna: 1,3 | OK — preserve historical/fixture evidence |
| `docs/api/learning-progress-api.md` | ccna: 76 | OK — preserve historical/fixture evidence |
| `docs/architecture/codebase-map.md` | ccna: 6; CCNA-prefix: 6 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/MANUAL-IMPORT-WINDOWS.md` | ccna: 13,15,44,77,107,129,132,139; 200-301: 13,15,44,107,129,132,139,204; 1.1: 77,204 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/README.md` | ccna: 1,9,40,62,65,67,106–107; 200-301: 9,36,50,62,65,67,106–107; 1.1: 9,36,50; CCNA-prefix: 9,40 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/bindings.example.json` | ccna: 2,13–36; 200-301: 2; 1.1: 2 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/blueprint.create.json` | 200-301: 2,4,6; 1.1: 3–4,6; ccna: 4,6; CCNA-prefix: 6 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/chapter-1/image-checklist.md` | 1.1: 7–10,15–16,23 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/chapter-1/implementation-report.md` | 1.1: 19,53,99; ccna: 78,146,169,251 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/chapter-1/source-coverage.md` | ccna: 4,87; 200-301: 4; 1.1: 17–23,28,42 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/curriculum-plan.md` | ccna: 1,5,22,32,42,52,66,76,86,96,110,120,130,140,154,164,174,184,198,208,218,228,242,252,262,272; 200-301: 1,5; 1.1: 1,5,22,42,60; CCNA-prefix: 5 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/manifest.json` | ccna: 2; 200-301: 2; 1.1: 2 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/manual-admin-workflow.browser.mjs` | ccna: 126,621,651; 200-301: 126,621; 1.1: 126,621 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/objectives.create.template.json` | 1.1: 6,78,86,94,102 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/planned-changes.json` | ccna: 2; 200-301: 2; 1.1: 2 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/prepare-pack.mjs` | ccna: 105,198,254,285; 1.1: 105,198,254,285; 200-301: 198,285 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/questions-review.md` | ccna: 1,7,20,33,46,59,72,85,98,111,124,137,150,163,176,189,202,215,228,241,254,267,280,293,306,319,332,345,358,371,384,397,410,423,436,449,462,475,488,501,514,527,540,553,566,579,592,605,618,631,644,657,670,683,696,709,722,735,748,761,774; 1.1: 1,7,20,399,401,403,406 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/source/curriculum.json` | ccna: 2,4–6,17–40; 200-301: 2,4,6; 1.1: 2,4,6,9,17,19; CCNA-prefix: 4 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/source/questions-d1.json` | 1.1: 2–3 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/source/questions-d4.json` | 1.1: 2 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/sources.md` | ccna: 3; 200-301: 3; 1.1: 3; CCNA-prefix: 3 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/topics.create.json` | ccna: 3,5,10,12,17,19,24,26,31,33,38,40,45,47,52,54,59,61,66,68,73,75,80,82,87,89,94,96,101,103,108,110,115,117,122,124,129,131,136,138,143,145,150,152,157,159,164,166; 200-301: 5,12,19,26,33,40,47,54,61,68,75,82,89,96,103,110,117,124,131,138,145,152,159,166; 1.1: 5,12,19,26,33,40,47,54,61,68,75,82,89,96,103,110,117,124,131,138,145,152,159,166 | OK — preserve historical/fixture evidence |
| `docs/content/ccna-200-301/validate-pack.mjs` | ccna: 41–43,48,63–65; 200-301: 48,63–65 | OK — preserve historical/fixture evidence |
| `docs/curriculum-hierarchy.md` | ccna: 1,3,5; 200-301: 3 | OK — preserve historical/fixture evidence |
| `docs/curriculum-topic-mapping.md` | ccna: 7 | OK — preserve historical/fixture evidence |
| `docs/database/schema.md` | ccna: 35; CCNA-prefix: 35 | OK — preserve historical/fixture evidence |
| `docs/deployment/environment.md` | ccna: 9,15 | OK — preserve historical/fixture evidence |
| `docs/deployment/local-setup.md` | ccna: 6; CCNA-prefix: 6 | OK — preserve historical/fixture evidence |
| `docs/development-log/CHANGELOG.md` | ccna: 10,46 | OK — preserve historical/fixture evidence |
| `docs/development-log/checkpoints/PHASE-01-CHECKPOINT.md` | ccna: 28,68,102 | OK — preserve historical/fixture evidence |
| `docs/development-log/checkpoints/PHASE-03-CHECKPOINT.md` | ccna: 65,74; CCNA-prefix: 65,74 | OK — preserve historical/fixture evidence |
| `docs/development-log/checkpoints/PHASE-03A-CHECKPOINT.md` | ccna: 20; CCNA-prefix: 20 | OK — preserve historical/fixture evidence |
| `docs/development-log/checkpoints/PHASE-04A-CHECKPOINT.md` | ccna: 33; CCNA-prefix: 33 | OK — preserve historical/fixture evidence |
| `docs/development/admin-delete-and-practice.md` | ccna: 3,25,33,81; CCNA-prefix: 3 | OK — preserve historical/fixture evidence |
| `docs/development/admin-question-editor-four-fixes.md` | ccna: 9,91 | OK — preserve historical/fixture evidence |
| `docs/development/admin-taxonomy-and-import.md` | ccna: 11–12,27,125,134,137; 1.1: 46 | OK — preserve historical/fixture evidence |
| `docs/development/admin-taxonomy-book-chapters.md` | ccna: 11,22,38–42,47; 200-301: 22; 1.1: 22 | OK — preserve historical/fixture evidence |
| `docs/development/admin-ui-modernization.md` | ccna: 35–46 | OK — preserve historical/fixture evidence |
| `docs/development/canonical-48-chapters-reset.md` | ccna: 7,18,35,54,82,162; CCNA-prefix: 18; chapter/taxonomy: 18,20,82; 1.1: 54 | OK — preserve historical/fixture evidence |
| `docs/development/ccna-nexus-learning-progress-gamification.md` | ccna: 1,9,13,19,70,72,101,141,148–149,233; 200-301: 72; 1.1: 72,98 | OK — preserve historical/fixture evidence |
| `docs/development/ccna-nexus-student-experience.md` | ccna: 1,3,19,109,116–118,127,164; 200-301: 19; 1.1: 19 | OK — preserve historical/fixture evidence |
| `docs/development/ccna-taxonomy-v1.md` | ccna: 1,5,32,43; 200-301: 5,32; 1.1: 5,19,32,36,43; chapter/taxonomy: 17–18; CCNA-prefix: 32 | OK — preserve historical/fixture evidence |
| `docs/development/clerk-setup.md` | ccna: 12–13 | OK — preserve historical/fixture evidence |
| `docs/development/command-center-navigation-regression-fix.md` | ccna: 78 | OK — preserve historical/fixture evidence |
| `docs/development/command-center-phase1-implementation.md` | ccna: 24,42,80; 1.1: 24,80 | OK — preserve historical/fixture evidence |
| `docs/development/exam-0017-activation-readiness.md` | ccna: 102,113,115,131 | OK — preserve historical/fixture evidence |
| `docs/development/exam-simulator-implementation.md` | ccna: 63 | OK — preserve historical/fixture evidence |
| `docs/development/existing-database-taxonomy-upgrade.md` | ccna: 9–10,37,40,89,122 | OK — preserve historical/fixture evidence |
| `docs/development/final-legacy-removal.md` | ccna: 15,17,21 | OK — preserve historical/fixture evidence |
| `docs/development/learning-curriculum-phase2a-implementation.md` | ccna: 10,13,168; chapter/taxonomy: 14,19 | OK — preserve historical/fixture evidence |
| `docs/development/learning-lessons-database-activation.md` | ccna: 25,28,149–151,191,220; chapter/taxonomy: 41–42,67 | OK — preserve historical/fixture evidence |
| `docs/development/learning-lessons-final-readiness.md` | ccna: 41,44–45,74,148–149 | OK — preserve historical/fixture evidence |
| `docs/development/lesson-discovery-and-studio-organization.md` | ccna: 164 | OK — preserve historical/fixture evidence |
| `docs/development/lesson-discovery-api-contract-repair.md` | ccna: 64,68,72 | OK — preserve historical/fixture evidence |
| `docs/development/lesson-saving-fix-and-activation.md` | ccna: 77–79,132,134–135,166,194; chapter/taxonomy: 117 | OK — preserve historical/fixture evidence |
| `docs/development/lesson-studio-p1-workspace.md` | ccna: 65 | OK — preserve historical/fixture evidence |
| `docs/development/local-runtime-startup-recovery.md` | chapter/taxonomy: 25; ccna: 100 | OK — preserve historical/fixture evidence |
| `docs/development/nexus-unified-shell-and-exam-plan.md` | chapter/taxonomy: 53; ccna: 158–164 | OK — preserve historical/fixture evidence |
| `docs/development/permanent-admin-delete.md` | ccna: 28,42,61; CCNA-prefix: 28,42 | OK — preserve historical/fixture evidence |
| `docs/development/phase-1-2-taxonomy-validation.md` | ccna: 17,22,75; 200-301: 22,75; 1.1: 75; CCNA-prefix: 75 | OK — preserve historical/fixture evidence |
| `docs/development/phase-1-4a-taxonomy-rehearsal-plan.md` | ccna: 37–39,59–60,105,192–193,195,225; chapter/taxonomy: 167–168 | OK — preserve historical/fixture evidence |
| `docs/development/phase-1-4c-2-fresh-rehearsal-profile.md` | ccna: 13–14,18,48,86,88,91 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b-0014-isolated-rehearsal-results.md` | ccna: 30,33–34,222,251 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b-0014-main-activation-results.md` | ccna: 19,21–22,330,334,458 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b-activation-readiness.md` | ccna: 15,17,66,85; CCNA-prefix: 85 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b-interactive-study-and-authoring.md` | ccna: 224 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b-media-storage-readiness.md` | ccna: 12; CCNA-prefix: 12 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b-migration-0014-readiness.md` | ccna: 21,23,120–122 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2b1-visual-lesson-editor.md` | ccna: 130–136,138,146 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2c-unified-editor-learning-workspace.md` | ccna: 57,59,61,63,65,67,69,71,73,75–76,91,93 | OK — preserve historical/fixture evidence |
| `docs/development/phase-2d-media-study-neon-readiness.md` | ccna: 49,73,128 | OK — preserve historical/fixture evidence |
| `docs/development/phase-3c-0015-readiness.md` | ccna: 13,19,26,39 | OK — preserve historical/fixture evidence |
| `docs/development/phase-5c-git-manifest.md` | ccna: 79–82,85–89,119,124–127,252,264,290–293,296–300,316,321–324 | OK — preserve historical/fixture evidence |
| `docs/development/phase-5c-validation.md` | ccna: 140–142,173–177,187–193,211–212,292 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-catalog-validation.md` | ccna: 21–22,27,35,41,46,68; 1.1: 68 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-foundation-plan.md` | ccna: 26,30,43–45,143,152,154,188; 200-301: 154; 1.1: 154; CCNA-prefix: 154; chapter/taxonomy: 158–159 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-local-development-preparation.md` | ccna: 13–15,25,30–31,33,62 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-local-functional-validation.md` | ccna: 9,38,46,51,66; 1.1: 66 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-question-bank-audit.md` | ccna: 20,55,71,180,263; CCNA-prefix: 20,180; 200-301: 180; 1.1: 180 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-question-revision-validation.md` | ccna: 55,120,125 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-release-readiness.md` | ccna: 43–44,49,54,93 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-server-mutation-validation.md` | ccna: 59–61,85–86,90 | OK — preserve historical/fixture evidence |
| `docs/development/phase-6a-session-isolation-validation.md` | ccna: 28–37,39,72–73,76,87 | OK — preserve historical/fixture evidence |
| `docs/development/phase-8-bilingual-ui.md` | ccna: 25,59 | OK — preserve historical/fixture evidence |
| `docs/development/phase-8-final-acceptance.md` | ccna: 28 | OK — preserve historical/fixture evidence |
| `docs/development/phase-8a-1-cleanup.md` | ccna: 14–15,36,44 | OK — preserve historical/fixture evidence |
| `docs/development/phase-8a-1-retained-content-review.md` | ccna: 35–43,49,80–81,83; CCNA-prefix: 35–43,49,80–81 | OK — preserve historical/fixture evidence |
| `docs/development/post-0013-startup-guard-fix.md` | ccna: 19,78–79 | OK — preserve historical/fixture evidence |
| `docs/development/practice-history-details.md` | ccna: 32 | OK — preserve historical/fixture evidence |
| `docs/development/public-pilot-integration-verification.md` | ccna: 25 | OK — preserve historical/fixture evidence |
| `docs/development/public-pilot-phase-0-5.md` | ccna: 68,121–129,167–173,186–187,218–220 | OK — preserve historical/fixture evidence |
| `docs/development/public-pilot-recovery-runbook.md` | ccna: 12,22 | OK — preserve historical/fixture evidence |
| `docs/development/public-pilot-test-stabilization.md` | ccna: 26–29 | OK — preserve historical/fixture evidence |
| `docs/development/question-bank-management-redesign.md` | ccna: 11–17,83 | OK — preserve historical/fixture evidence |
| `docs/development/question-bank-migration-and-universal-deletion.md` | ccna: 15,51,63–64 | OK — preserve historical/fixture evidence |
| `docs/development/runtime-ledger-permission-recovery.md` | ccna: 5,18 | OK — preserve historical/fixture evidence |
| `docs/development/safe-lesson-deletion-activation-checklist.md` | ccna: 6 | OK — preserve historical/fixture evidence |
| `docs/development/safe-lesson-deletion-activation-readiness.md` | ccna: 7 | OK — preserve historical/fixture evidence |
| `docs/development/safe-lesson-deletion-implementation.md` | ccna: 37,45–46,53 | OK — preserve historical/fixture evidence |
| `docs/development/topics-management-redesign.md` | ccna: 10–11 | OK — preserve historical/fixture evidence |
| `docs/maintenance/final-legacy-cleanup-result.md` | ccna: 43,81 | OK — preserve historical/fixture evidence |
| `docs/maintenance/frontend-ui-ux-audit-2026-10-29.md` | ccna: 1,30; 1.1: 17 | OK — preserve historical/fixture evidence |
| `docs/maintenance/milestone-local-evidence.md` | ccna: 3 | OK — preserve historical/fixture evidence |
| `docs/maintenance/repository-cleanup-audit.md` | ccna: 25,29,57–58,67,69,73,79,120 | OK — preserve historical/fixture evidence |
| `docs/maintenance/repository-cleanup-result.md` | ccna: 20,76 | OK — preserve historical/fixture evidence |
| `docs/maintenance/root-configuration-necessity-audit.md` | ccna: 75–76,128 | OK — preserve historical/fixture evidence |
| `package.json` | ccna: 11; 1.1: 35,37,44,51 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `pnpm-lock.yaml` | 1.1: 13,19,40–41,61,293–294,296–297,299,302,305–306,311–312,317–318,321,323–324,329–330,332–333,344–345,353,356–357,362–363,365–366,408,410–411,437,467–468,491–492,494–495,503–504,509–510,515–516,518–519,521–522,527–528,530–531,542–543,554–555,560–561,563–564,597,599–600,656–657,705–706,972,1016,1262,1265,1281,1294,1307,1346,1359,1372,1403,1416,1425,1451,1460,1473,1486,1495,1521,1547,1573,1586,1599,1612,1638,1677,1725,1751,1764,1790,1826,1835,1844,1853,1875,1908,2206,2235,2462,2491,2544,2548,2561,2571,2714,2736,2756,2769,2784,2878,2935,3008,3029,3057,3061,3115,3153,3182,3193,3270,3293,3297,3313,3321,3325,3329,3345,3379,3383,3387,3399,3420,3570,3588,3595,3659,3684,3688,3692,3711,3757,3793,3812,3843,3922,4055,4062,4107,4138,4152,4241,4278,4280,4290,4310,4377,4412,4482,4523,4549,4553,4613,4646,4659,4671,4716,4732,4918,4955,5031,5112,5171,5260,5331,5431,5433,5437–5440,5442–5444,5452,5454–5455,5457–5458,5465,5467,5474,5476,5485,5487–5488,5490,5499–5500,5502–5503,5505,5512,5514–5515,5517–5519,5521,5528,5530,5532,5540,5548,5551,5565,5567–5568,5570–5576,5579,5588,5594,5596–5599,5609–5610,5612,5614,5622,5628,5630–5632,5639,5641–5642,5644,5646–5648,5656,5658,5663,5665,5674–5676,5678–5682,5684–5687,5689,5698,5700–5702,5704–5705,5707–5708,5718–5720,5722–5727,5729–5730,5738,5740–5741,5743–5746,5748–5750,5764–5765,5767–5772,5779,5781–5782,5789,5791,5798,5807,5810,5819–5820,5822–5825,5827,5834,5836–5838,5840–5843,5846,5855–5857,5859–5863,5872–5875,5877–5881,5883–5885,5887,5889–5890,5900,5902,5911–5914,5916–5917,5919–5921,5930,5937–5938,5940,5942,5949,5951,5953–5957,5967–5969,5971–5975,5977,5985,5987,5989–5992,6000,6002–6003,6013–6014,6016–6017,6019–6021,6024,6032,6040,6042,6049,6060,6066,6072,6074,6079,6081,6088,6095,6125,6135,6141,6395,6463,6495,6503,6522,6547,6638,6691,6693,6726,6743,6770,6785,6804,6813,6861,6865,6867,6869,6871–6874,6885,6896,6922–6923,6934,7023,7035,7043,7045,7053,7071,7098,7132,7134,7148,7154,7159,7161,7169–7174,7178,7180,7182,7190–7191,7199,7216–7217,7249,7284,7293,7309,7313,7338,7346,7358,7362,7415,7442–7443,7446,7448,7455,7462,7496,7506,7510,7514,7522,7590,7594,7610,7616,7618,7620,7633,7635,7644,7646,7650,7656,7660,7666,7694,7699,7702–7703,7705,7707,7713,7730,7761,7874,7876,7897,7901,7924,7950,7970,7972,7974,7981–7983,7989,7995,8039,8064,8088,8102,8112,8137–8138,8140,8165,8175,8201,8206,8212,8217,8230,8237,8246,8252,8257,8265,8268,8276,8295,8357,8400,8409,8415,8425,8442,8467,8503,8508,8520,8573,8575,8582,8591,8599,8639,8646,8653,8656,8659,8688,8697,8700,8708,8711,8713,8720,8726,8728,8793,8817,8823,8827,8842,8849,8857,8865,8873–8874,8884,8909,8912–8914,8943,8952,8954,8973,8975,8977,9058,9088,9096,9099,9101,9103–9105,9112–9115,9117,9119,9121,9130,9165,9173; ccna: 253 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `pnpm-workspace.yaml` | 1.1: 45,47,54,63 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `scripts/src/seed.ts` | ccna: 47 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
| `src/styles.css` | 1.1: 85 | ADAPT — see semantic C-items; literal presence alone is not a blocker |
