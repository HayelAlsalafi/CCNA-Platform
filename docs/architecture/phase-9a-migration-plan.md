# Phase 9A — staged migration and activation plan

**Markdown plan only. No SQL file, migration, schema, configuration or production code has been created or changed.** Baseline source is `7e3e6c16cbfd2a87682d1e28da0e0939f29d5005` on main. All SQL-like fragments below are **non-executable sketches**, not reviewed migration statements or commands to run.

Companion documents: [inventory](phase-9a-coupling-inventory.md), [model/security design](phase-9a-multitrack-design.md), [approval decisions](phase-9a-owner-decisions.md).

## Baseline facts and assumptions

- **EXISTING AND VERIFIED IN SOURCE:** official journal ends at 0017 and the reviewed snapshot describes 24 tables (`lib/db/drizzle/meta/_journal.json`; `lib/db/drizzle/meta/0017_snapshot.json`; `tools/exam-activation/proposal.mjs:30`). No 0012 exam entry should be inserted into historical order.
- **EXISTING AND VERIFIED IN SOURCE:** runtime count >17 is rejected; schema, ownership, functions and grants are pinned (`tools/phase6a-local/policy.mjs:152`; `upgrade.mjs:97`; `run.mjs:54–56`). A new schema requires a new exact approved startup path.
- **EXISTING AND VERIFIED IN SOURCE:** the existing Exam 0017 backup/readiness/rehearsal tools are **pre-0017 executors**: readiness expects 16, backup reads 0016 snapshot, restored rehearsal compares the first 16 entries, and apply pins an older HEAD (`tools/exam-activation/readiness.mjs:28,44`; `backup.mjs:27,62`; `rehearse-backup.mjs:46`; `apply.mjs:28,41,47`). They must not be reused directly for a post-0017 migration by bypassing assertions.
- **REQUIRES LIVE VERIFICATION:** main identity, actual 17-entry chain, 24-table state, all owners/ACL/RLS/function hashes, row/sequence fingerprints and current user counts. The expected local cluster identity supplied by the owner is 127.0.0.1:5432 / ccna_phase6a_dev / system identifier 7694701597474139084; it has not been contacted in this phase.
- **ARCHITECTURAL RECOMMENDATION:** allocate new forward-only migration identifiers only after the owner accepts exact schema boundaries. “Next migration” does not mean an executable 0018 exists.

## Gate summary

| Step | Operation type | New grants / RLS decisions? | Explicit approval point | Safe rollback / stop |
| --- | --- | --- | --- | --- |
| S0 | Baseline inspection, tooling preparation, maintenance/recovery design | Read-only diagnostic credential; no grant presumed | Approve scope and exact target; then separately approve execution | No mutation; report mismatch |
| S1 | One fresh backup and isolated restore rehearsal | Isolated roles only; main backup privilege must already exist or stop | Backup/restore and disposable target authorization | Retain backup/evidence; no restore over main |
| S2 | Add empty Track/Course/CourseVersion/catalog identity tables | YES, narrow read rights and reviewed management paths; no lesson RLS change | Exact SQL, metadata, guard promotion and maintenance window | Transaction rollback; after commit keep empty additive tables and disable new feature |
| S3 | Add nullable chapter scope columns and restrictive bindings | YES for new lookup tables; no broad UPDATE; RLS unchanged | Exact FK/index/locking review | Rollback before commit; afterwards old code may run only with matching reviewed guard state |
| S4 | Seed CCNA identities/catalog and approved backfill of chapter scope | Main DML requires explicit approval; use migrator-controlled executor | Exact data mapping, expected counts, fingerprints and rollback assessment | Rollback transaction; after commit keep verified additive mapping, never undo blindly |
| S5 | Validate new integrity and replace three global chapter CHECKs | Registry write rights remain restricted; no RLS bypass | Replacement security equivalence plus supported new-course notation | Rollback before commit; reinstatement after new courses exist may be impossible—forward repair |
| S6 | Compatible scoped API/UI behavior and new session scope | Column-specific rights for new fields; no new RLS presumed | Code/contract/default-context policy plus migration if needed | Feature gate to CCNA adapter; do not clear new session metadata |
| S7 | Scoped RBAC/manual entitlements/audit/resource bindings | YES, dedicated functions/owners/EXECUTE and explicit RLS decisions | Separate high-risk authority/access approval; not implied by catalog approval | Fail closed and keep data; no bypass or data deletion |
| S8 | Enforce final NOT NULL/retire compatibility | New grants not automatically needed; review old consumers first | Separate later approval after usage evidence | Do not drop old paths/columns until proven; forward-only remediation |

Every step that changes source startup pins must preserve the currently running supported state until the approved maintenance transition. No wildcard migration acceptance, arbitrary table counts, or permissive function ACLs.

## S0 — prepare the next dedicated package, not an old migrator rerun

1. Review exact approved SQL, generated snapshot/journal and codegen implications; unchanged historical hashes must remain byte-identical.
2. Prepare a **new** source-only executor/readiness/backup package explicitly supporting the current 17-entry/24-table baseline and the approved next state. Reuse audited helper concepts (UTC row proofs, archive validation, hidden prompts, identity checks), not old top-level assumptions.
3. Require exact host/port/database/system ID/server version, source HEAD or reviewed manifest, database owner/least-privilege roles, all ordered ledger hashes, exact snapshot, revision guards, deletion function bodies, RLS and grants.
4. Rehearsal target must be a separate, positively identified disposable database in the approved private cluster (planned port 55440, **not proof it currently runs**). Verify cluster identity/directory/owner and reject the main cluster regardless of target name.
5. Plan maintenance because ALTER TABLE locks and strict runtime catalog checks mean even an additive change may not be compatible with the old launcher. Prepare exact old/new guard branches together, never restart a service automatically.

No execution command is supplied as ready-to-run: a reviewed post-0017 executor does not yet exist. **MISSING**, evidenced by the current fixed-baseline executor source listed above. Requesting a future tool package is the next implementation step after decisions, not permission to run it.

## S1 — backup, isolated restoration and recovery evidence

After explicit authorization, create **one** fresh consistent main dump via the new 17-baseline workflow. Verify checksum, archive contents and full decode. Capture identity, source/migration hashes, UTC row fingerprints for all existing tables, sequence states, owners/grants/RLS, function bodies, journal and schema. Maintain restricted local evidence outside Git; never store credentials in receipts. Preserve all prior backups.

Restore to an independently verified disposable target; use a non-superuser main-equivalent migrator and least-privilege app fixture. Map roles deliberately. Restore exact required archived security restrictions, not broad archived grants. Existing restoration precedent is the restricted ACL helper (`tools/media-activation/restore-security.mjs`) and role preparation (`tools/exam-activation/restore-roles.mjs`); these are source patterns, not proof of a new successful restoration.

Mandatory isolated evidence:

- Restored 17-entry ledger and all 24-table baseline fingerprints/sequences match.
- Existing question/lesson revision guards, study owner RLS and exact privileges hold.
- Apply only the proposed next migration, verify exact next schema/grants/source pins, run all new scope/authorization assertions, and prove repeat-execution prevention.
- Compare original-column row proofs excluding only the **explicitly approved** scope-column backfill. No question text/options/revision JSON, authored blocks, user roles, attempt records or media keys may change incidentally.
- Prove transaction failure rollback and committed isolated restore/startup behavior. A rolled-back rehearsal alone does not exercise post-commit/runtime startup.
- Keep a sanitized signed-off receipt tied to exact archive/proposal/tool hashes and freshness policy. If hashes/source/backup change, evidence no longer certifies that package. Stop; never edit a receipt to make it pass.

No fresh backup, restore, role fixture or rehearsal has been run for Phase 9A.

## S2–S3 — additive identities and nullable bindings

Illustrative pseudo-SQL only:

```text
PROPOSE NEW tracks, courses, course_versions
  typed parent FKs; immutable IDs/version identity; bounded metadata
  unique public slugs/version keys; explicit lifecycle
PROPOSE NEW curriculum_catalogs, curriculum_catalog_entries
  migrator-managed immutable profile/version/digest
  full allowed chapter identity/code/grouping/number/domain tuple

PROPOSE ADD curriculum_chapters.course_version_id NULL
PROPOSE ADD curriculum_chapters.catalog_id NULL    -- one representation, owner-reviewed
PROPOSE UNIQUE course_versions(id, blueprint_id, catalog_id)
PROPOSE FK chapters(course_version_id, blueprint_id, catalog_id)
        -> course_versions(id, blueprint_id, catalog_id)
PROPOSE FK chapters(catalog_id, id, code, volume, chapter_number, domain_code)
        -> catalog_entries(catalog_id, chapter_id, code, grouping, number, domain_code)

KEEP chapters.id -> topics.id
KEEP questions.topic_id -> topics.id AND curriculum_chapters.id
KEEP lessons.chapter_id -> curriculum_chapters.id
KEEP all current CHECKs until S5
```

Exact composite-key choices and transitional null constraints need review: a MATCH SIMPLE composite FK permits null components, so the final enforcement must explicitly disallow partial/null scope bindings. Catalog entries enumerate allowed IDs and need not require a pre-existing topic row for every manifest entry; actual chapters still require the topic FK. This avoids assuming every allowed canonical chapter is installed.

Existing blueprints/domain codes have their own composite constraints; no version may accidentally bind a chapter to another version's blueprint. For the initial model, enforce a dedicated blueprint per version. Cross-course blueprint reuse is deferred, not silently accepted.

New indexes should support (course_version_id, domain_id, display order/identity) query patterns after measurement. Do not claim CONCURRENTLY and transactional DDL are interchangeable; choose a dedicated reviewed index procedure if production lock analysis requires it.

**Rollback:** before commit, transaction rollback. After commit, preserve empty additive structures; use the reviewed compatibility source. Do not drop them automatically or restore a backup over newer records.

## S4 — exact CCNA seed and backfill

This step changes existing rows and therefore needs its own explicit owner approval even though it only adds scope values.

```text
ASSERT one exact existing CCNA blueprint by stable natural identity (exam_code, version)
ASSERT all installed chapter UUID/code/volume/number/domain bindings match reviewed CCNA manifest
CREATE reviewed Track/Course/CourseVersion and immutable catalog binding, once
SEED exact canonical allowed tuples from reviewed source + approved existing metadata
UPDATE ONLY previously-NULL chapter scope/catalog columns
  WHERE chapter UUID and full original tuple match expected baseline proof
ASSERT every installed chapter now maps exactly once; no cross-course assignment
ASSERT original-column fingerprints and all non-target tables unchanged
```

The natural lookup is a seed/activation decision, not a hardcoded course UUID inside generalized CHECKs. Reference generated IDs via FKs and immutable catalog identity. Do not guess from chapter titles, reorder topics, recreate UUIDs, change slugs, move media keys or backfill historical revisions. Missing/duplicate/unexpected canonical rows stop execution.

No role bootstrap, entitlement grant, question enablement or chapter activation is bundled into this backfill. Existing visibility remains unchanged. Keep old chapter code/number uniqueness during compatibility; add new course-scoped constraints before considering removal of redundant old ones.

**Rollback:** transaction rollback if any proof differs. After commit keep the additive verified association; reversing it requires fresh evidence and a separate approved plan. Original catalog semantics remain active at this stage.

## S5 — replace the three global CCNA chapter constraints safely

The old constraints are `curriculum_chapters_canonical_ck`, `curriculum_chapters_number_ck`, `curriculum_chapters_code_ck` (`lib/db/drizzle/0011_canonical_book_chapters.sql:12–14`). No early phase drops or relaxes them.

1. Install catalog/version FKs plus generic bounded syntax/uniqueness constraints; validate complete CCNA correspondence. NOT VALID constraints are not complete evidence—validate before relying on them.
2. Prove invalid CCNA IDs, changed code/number/volume/domain, mismatched blueprint/version and partial bindings still fail under the replacement mechanism. Prove application role cannot edit catalog entries/profile designation.
3. Only then, in one reviewed transition, replace the three global CHECKs. The course-scoped replacement is principally relational FKs/uniqueness plus generic CHECKs, not three weaker regexes with conditional UUID exceptions.
4. Keep exam_domains_code_ck and exam_objectives_code_ck unless a separately approved profile policy requires change. Current numeric notation and non-null certification weights are still blockers for differently shaped curricula (`exam-blueprints.ts:53,55,73`). Do not generalize them accidentally as part of the chapter patch.
5. Non-certification activation must resolve ACTIVE blueprint verification semantics explicitly (design document), not invent a source URL or claim external certification.

**Rollback:** before commit, rollback. After any non-CCNA rows exist the old tuple CHECKs cannot simply be reinstated. Disable further generic authoring, preserve new records and use a forward corrective migration. This is an irreversible compatibility boundary needing a dedicated approval, not a promise of a destructive “down” migration.

## S6 — compatibility period, exams/practice and historical integrity

Future code plan, not changes in this phase:

- Legacy routes resolve **only** to original CCNA course/version. New explicit context is authoritative and server-validated. Never default a missing scope to all courses. Preserve existing chapter/lesson IDs and URL formats.
- Scope counts/catalog/search/import preview+confirm/selection/analytics together. Empty domain selection retains “all domains in this course version”. Recheck provided chapter/domain IDs and entitlement; preserve publication readiness.
- Add exam_sessions.course_version_id nullable for existing records; require scoped value for new sessions. New config/mapping snapshots include captured version identity. Keep original request IDs, deadlines, flags, answers, scores and revision hashes.
- Do not UPDATE historic exam_sessions for convenient backfill: immutable state guards compare non-mutable fields (`0017_exam_simulator.sql:69`). Use an approved additive historical-attribution sidecar if required, or leave legacy scope explicitly unknown. No trigger disabling or “temporary” broad UPDATE.
- Existing question/attempt/session history may contain tombstones or earlier classifications. Derive only proven mappings from captured snapshots, not current mutable question.topic_id. Ambiguous history is not fabricated.
- Preserve the topics bridge and globally unique slugs initially. New edition chapters/topics get new IDs; historical CCNA topic IDs stay unchanged.
- Keep owner-private study RLS, locale state, existing caches/session owner keys; add scope to new catalog query keys without remounting an active exam or starting another practice run.
- Review deployment/rollback with two exact supported source/catalog states. Existing tools are checksum-pinned and must not be made broadly permissive.

**Rollback:** keep additive fields/history. Fall back to the CCNA compatibility adapter for new navigation as authorized, without hiding or deleting already-created other-course data. An app binary unable to handle existing new records is not a valid rollback target.

## S7 — separately gated authority, entitlement and deletion-function integration

Scoped RBAC and access controls are **MISSING** from current implementation (inventory C36–C37). Do not ship a second course as commercially isolated on catalog filtering alone.

Proposed package needs:

- role assignment/scope guard/audit structures; no direct app INSERT/UPDATE/DELETE on assignments or audit;
- controlled grant/revoke functions with ACTIVE-actor checks, delegation ceilings, self-change denial, serialized last-active-owner invariant, version/idempotency validation and mandatory same-transaction audit;
- manual entitlement functions with explicit action/resource/descendant/version coverage and expiry/revocation;
- resource bindings whose FKs are real and scoped, rather than unverifiable kind/UUID values;
- owner-scoped study RLS unchanged; a separate decision if aggregate staff progress monitoring is required;
- direct-ID/media/conditional-cache authorization and publication/reference integrity.

**Critical dependency:** `delete_never_published_lesson` rejects any unreviewed incoming FK to lessons (`0016_safe_lesson_deletion.sql:44`). Even an empty lesson-resource binding table can block safe draft deletion. Install new inbound lesson FKs only with an approved updated **forward** function/checker that recognizes exact safe dependency semantics and still blocks protected references. Existing migration 0016 must not be edited. Prefer blocking deletion of a lesson with access/history references; never cascade entitlement/audit/learner history away.

Both existing lesson and question deletion functions enforce global ADMIN (`0016:9`, `0017:105`). Scoped authorization changes require explicit SQL function review and isolated race/security tests; adding only API checks must not weaken the database-level gate.

The management DB channel decision and grant set must be reviewed before any mutation UI. A general app role with unrestricted assignment writes is not an acceptable shortcut.

## S8 — exit compatibility only after evidence

Only after all old consumers, saved links, previews, integrations and new sessions are scoped, plan NOT NULL and additional validated FKs. Use measured production query plans and lock duration, not guesses. Retire legacy routing or redundant constraints only in a later explicitly approved release. No early data deletion, table renaming, history rewriting, object moves or old-backup cleanup.

## Mandatory approval and verification gates for eventual activation

1. Owner accepts model, canonical policy, scopes, identity/backfill mapping, access semantics and explicit affected grants/RLS decisions.
2. Exact forward SQL/source/snapshots/journal hashes independently reviewed; historical chain untouched.
3. Approved main read-only preflight, one fresh verified backup, matching isolated restore, mandatory functional/security/preservation/rollback tests.
4. Maintenance authorization and independent checks for competing clients/services/locks. No automatic service stop/start.
5. Dedicated executor verifies baseline and backup under appropriate locks; applies only the approved staged migration; pre-commit exact schema/grants/functions/row proofs.
6. Separate READ ONLY UTC post-commit verification and exact new-chain startup catalog. Uncertain commit/source promotion → keep services in the approved maintenance state, diagnose read-only, no automatic retry/reset.
7. Authorized application startup and browser acceptance in both languages, with separately authorized disposable data. Main user/learner records are not test fixtures.
8. Recovery authorization is separate: before commit rollback; after commit diagnose and forward repair. No automatic destructive restore, column drop, sequence reset or removal of new records.

**Current conclusion:** GO for reviewing this design and commissioning a source-only post-0017 preparation package after owner decisions; **NO-GO for any database activation**. No live assumptions have been certified.
