# Phase 9A — owner decisions and approval gates

Baseline: `7e3e6c16cbfd2a87682d1e28da0e0939f29d5005`, branch main. **No approval is inferred from this document.** All recommendations below are proposed architecture. “DB approval: Yes” means implementing that choice requires a separately reviewed migration/grant/data-change authorization; approval of documentation or source preparation is insufficient.

Source facts are classified in the [inventory](phase-9a-coupling-inventory.md); implementation sequence is only a [Markdown migration plan](phase-9a-migration-plan.md).

## 1. Core hierarchy and Track meaning

- **Options:** seven mandatory levels with an extra Module; flat Course→Lesson; in-place Track→Course→CourseVersion→Domain→Chapter→Lesson.
- **Recommend:** in-place generalization; Track is organization, not tenant isolation. One primary track per course initially; optional cross-listing later.
- **Risk:** flat/remapped models break stable chapter/topic references; an unnamed extra level forces unnecessary authoring/API work.
- **DB approval:** Yes, for new identities/bindings. No changes are proposed now.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — chapter/topic bridge and FKs, `lib/db/src/schema/curriculum-chapters.ts:20–23`, `questions.ts:66`, `lessons.ts:40`.

## 2. CourseVersion lifecycle and taxonomy ownership

- **Options:** mutate one edition in place; immutable version identity with dedicated blueprint/domain binding; share one blueprint freely between versions.
- **Recommend:** immutable published curriculum identity, dedicated blueprint per version initially; new-edition chapter/topic identities where structure changes. Keep old lessons/revisions in their original version.
- **Risk:** relabeling current rows changes historical attribution; shared blueprint rows can accidentally couple publishing/edits across courses.
- **DB approval:** Yes, FKs/uniqueness/lifecycle and any backfill. Decide whether future editions are automatically included in existing purchases separately.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `lib/db/src/schema/exam-blueprints.ts:40–51`, `curriculum-chapters.ts:33–37`, `artifacts/api-server/src/lib/exams.ts:264`.

## 3. Canonical CCNA integrity mechanism

- **Options:** hardcoded course-UUID conditional CHECK; application-only allowlist; immutable catalog/profile plus relational tuple enforcement.
- **Recommend:** migrator-managed immutable catalog and composite FK/unique bindings; preserve all existing canonical tuples, IDs, codes and domain bindings. Never put the CCNA course UUID in a generalized CHECK.
- **Risk:** mutable lookup CHECKs/app-only validation permit integrity drift; replacing the three old constraints before validation weakens existing protection.
- **DB approval:** Yes, new registry/bindings and separately gated replacement of the three chapter CHECKs. No broad application writes to canonical registry.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `lib/db/src/schema/curriculum-chapters.ts:40–57`; `lib/db/drizzle/0011_canonical_book_chapters.sql:12–14`; `artifacts/api-server/src/lib/canonical-chapters.ts:42`.

## 4. Non-certification courses and arbitrary domain notation

- **Options:** require every course to impersonate an externally verified exam blueprint; preserve certification adapter and separate course publication; build entirely new taxonomy tables.
- **Recommend:** retain current CCNA certification rules and explicitly separate internal course publication/verification semantics in a later approved design. Do not fabricate source URLs, official weights or certification claims.
- **Risk:** current ACTIVE blueprint visibility gate and numeric N.0/objective codes can block or misrepresent a generic course. Nullable/nonpercentage weights or arbitrary module grouping require additional schema choices.
- **DB approval:** Yes if changing constraints, lifecycle representation or column bounds; decision required before a non-certification course can be activated.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `lib/db/src/schema/exam-blueprints.ts:37,53,55,73`; `exam-taxonomy-validation.ts:6,51`; `artifacts/api-server/src/lib/lessons.ts:295`.

## 5. Topics bridge, imports and cross-course question reuse

- **Options:** replace topics/chapter IDs; keep 1:1 bridge with one version per chapter; add many-course question placements immediately.
- **Recommend:** keep bridge/IDs/FKs, namespace new topic slugs globally, bind import previews/confirmation to one version. Defer shared question placements; preserve old question codes/snapshots.
- **Risk:** title/code-only import inference can target another course; slug collisions or reparenting can alter practice eligibility and historical attribution.
- **DB approval:** Yes for version bindings; no original content or IDs should be rewritten. A future placement model needs separate approval.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `lib/db/src/schema/topics.ts:20`; `questions.ts:66`; `artifacts/api-server/src/lib/admin-content-validation.ts:97–114`; `question-import.ts:112`; `question-revisions.ts:33–44`.

## 6. Backward compatibility and course selection

- **Options:** unscoped requests aggregate all courses; break legacy URLs; preserve legacy CCNA defaults and add explicit version context.
- **Recommend:** legacy routes mean the original CCNA version only; new explicit context is verified server-side. Distinguish an explicitly named all-course dashboard from a course-local view.
- **Risk:** blank domain filters currently allow broader pools; accidental query-key/session remount can lose local work or duplicate session start.
- **DB approval:** Not for route/presentation changes alone; Yes for persisted session scope/backfill. API contract/codegen review still required.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `artifacts/ccna-learning/src/App.tsx:288–301`; `artifacts/api-server/src/lib/nexus.ts:43,eligible`; `exams.ts:28,79`; `curriculum.ts:34`.

## 7. Historic exam/practice attribution

- **Options:** rewrite old snapshots/sessions; leave legacy scope nullable/unknown; add proven append-only sidecar attribution where useful.
- **Recommend:** new exam sessions capture immutable version; preserve old JSON/hashes/deadlines/results. Leave unprovable legacy attribution unknown; optional sidecar only from captured evidence.
- **Risk:** question movement/tombstones make current joins unreliable; immutable state trigger intentionally rejects historic session changes.
- **DB approval:** Yes for new column/sidecar or any authorized backfill; never implied permission to disable triggers.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `artifacts/api-server/src/lib/exams.ts:181–188,264`; `lib/db/drizzle/0017_exam_simulator.sql:69,76`; `lib/db/src/schema/question-revisions.ts:question_revisions_hash_ck`.

## 8. Scoped roles and capability map

- **Options:** keep global Admin only; introduce scoped assignments with code-defined capabilities; store arbitrary executable permission rules in DB.
- **Recommend:** scoped assignments referencing validated scopes; fixed versioned capability map in source, with a conservative global Admin compatibility path. Do not equate role scope with course purchase.
- **Risk:** an editor can become a cross-course publisher/role manager if role inheritance/delegation is implicit.
- **DB approval:** Yes, new structures/grants/bootstrap. Exact roles and which roles may publish/delete/delegate must be approved.
- **Evidence / class:** MISSING for scoped RBAC; current global USER/ADMIN is EXISTING AND VERIFIED IN SOURCE — `lib/db/src/schema/users.ts:12,22`; `artifacts/api-server/src/middlewares/auth.ts:164–176`.

## 9. Least-privilege management channel and authority mutation

- **Options:** unrestricted normal app writes; normal app EXECUTE on narrow functions; separate management caller/credential with narrowly granted functions.
- **Recommend:** no direct assignment/audit writes; narrow functions plus API verification. Prefer separate management channel for platform-ownership operations if compromise containment is required.
- **Risk:** a shared DB login cannot independently prove that an actor UUID/GUC came from a real Clerk user; a compromised API with management EXECUTE may impersonate actors. Decide this trust boundary explicitly rather than claiming a function solves it.
- **DB approval:** Yes, dedicated owner/caller grants and exact function bodies. No existing credential should be read/configured during documentation.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — app UPDATE excludes role/status (`tools/phase6a-local/05-grant-runtime.sql:40–41`); identity is API-derived (`artifacts/api-server/src/middlewares/auth.ts:128–147`).

## 10. Last-owner safety, bootstrap and audit

- **Options:** count in UI/API; transactional locked authority operations; manual DBA-only owner changes.
- **Recommend:** explicit owner selection/bootstrap; serialize all owner-affecting operations through a locked authority row, check active effective owners, deny self escalation/self disable, expected-version/idempotency checks, mandatory same-transaction append-only audit. Platform owner changes may stay manual until isolated concurrency evidence passes.
- **Risk:** concurrent revocations/status changes remove the last effective owner; independent routes or broad UPDATE can bypass a central invariant.
- **DB approval:** Yes. Do not automatically promote every current ADMIN to OWNER. All status mutation paths must participate in the same protection.
- **Evidence / class:** MISSING — no OWNER/assignment/audit structures in `lib/db/src/schema/index.ts`; global roles in `users.ts:12`. Current column grants exclude authority changes (`05-grant-runtime.sql:41`).

## 11. Free and paid resource policy granularity

- **Options:** course-only entitlement; per-lesson booleans; validated resource hierarchy with action policies and grants.
- **Recommend:** independent typed resources, FREE_OPEN/FREE_PREVIEW/ENTITLED, explicit action rights and descendant coverage; manual grants first. Bundle/subscription issuance can later target the same resources without redesign.
- **Risk:** course-only grants cannot represent individual paid lessons/previews; a free ancestor must not implicitly override a paid child. A fully entitled course grant should cover paid lessons only under its declared contract.
- **DB approval:** Yes, resources/policies/grants and controlled mutation paths; capability/access decision semantics also need product approval.
- **Evidence / class:** MISSING — schema export `lib/db/src/schema/index.ts`; current lesson visibility is publication-based (`artifacts/api-server/src/lib/lessons.ts:294–295`).

## 12. Anonymous previews and expiry/revocation during active work

- **Options:** require sign-in even for free learning; permit anonymous explicit previews; revoke all active work immediately or allow a bounded issued-session lease.
- **Recommend:** preserve current sign-in behavior initially; FREE_OPEN is free of purchase, not automatically anonymous. Recommend an approved short lease for an already-issued timed exam, while blocking new starts after entitlement expiry; account disable remains authoritative.
- **Risk:** changing authentication implicitly expands exposure; abrupt revocation can strand an exam or private notes, while indefinite leases defeat access controls.
- **DB approval:** Yes if persisting lease/entitlement metadata; anonymous access alone is a separate security/product decision even if code-only.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `artifacts/api-server/src/routes/lessons.ts:40–47`; `artifacts/api-server/src/routes/exams.ts:14`; `artifacts/api-server/src/middlewares/auth.ts:135`; `artifacts/api-server/src/lib/exams.ts:owned,examSave,examSubmit`. Entitlement lease behavior is MISSING.

## 13. Shared media, catalog scope and notes after access expiry

- **Options:** one shared admin media catalog; per-course media management/sharing; duplicate/move objects per course.
- **Recommend:** keep opaque object keys and existing records; explicit management scopes and shared references. Read only through an accessible published reference or approved scoped administrative capability. Decide whether users may export their own notes/quoted excerpts after course access expires.
- **Risk:** a free reference makes the same bytes accessible even if another reference is paid; course filtering alone cannot protect direct URLs or 304 responses. Exporting private notes and disclosing paid lesson bodies are distinct actions.
- **DB approval:** Likely Yes for scoped ownership/resource bindings; API/media access logic needs explicit approval. Do not move/delete/overwrite S3 objects.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `artifacts/api-server/src/lib/lesson-media.ts:176`; `lesson-media-storage.ts:23,29`; `study.ts:owned,published,current`; `artifacts/ccna-learning/src/lib/study-export.ts:23`.

## 14. Learner monitoring and RLS privacy

- **Options:** bypass RLS as course Admin; continue owner-private study data; separately reviewed aggregate monitoring.
- **Recommend:** no RLS bypass/learner impersonation. Keep notes/highlights/bookmarks private. Scope existing practice/exam summaries; separately approve minimized aggregate lesson progress if needed.
- **Risk:** course role or table-owner connection can expose another learner's personal annotations if treated as an implicit override.
- **DB approval:** Yes for any new aggregate read function, grant or RLS policy; not authorized by catalog work.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `lib/db/drizzle/0014_interactive_study.sql:25,40`; `artifacts/api-server/src/lib/study.ts:31`; `routes/admin-learners.ts:34`.

## 15. Controlled deletion with new dependencies

- **Options:** preserve global-only deletion and block new references; add reviewed dependency handling and scoped capability functions; cascade related access/history rows.
- **Recommend:** retain current global-only destructive authority until a dedicated forward function is approved. Block deletion of protected/access-linked resources. Explicitly review every new incoming lesson FK before installing it.
- **Risk:** even an empty new binding FK trips the current unreviewed-dependency guard; cascades could destroy grants, audit evidence or learner history. Existing question deletion also captures exam recovery evidence.
- **DB approval:** Yes for changed function bodies/grants/new FKs. Never edit 0016/0017 or bypass checks.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `lib/db/drizzle/0016_safe_lesson_deletion.sql:9,22–44`; `0017_exam_simulator.sql:103–120`.

## 16. Course purchases, bundles and future editions

- **Options:** course lifetime rights include all future versions; version-pinned rights; product-specific explicit coverage.
- **Recommend:** default version-pinned grants and explicit product/resource mappings, validity windows, revocation source and coverage-at-issuance. Manual grants precede billing automation.
- **Risk:** adding lessons/versions to a bundle can retroactively change contractual access; deleting product mappings may accidentally revoke already-issued rights if entitlements are only computed from today's catalog.
- **DB approval:** Yes for grants/products/mapping structures; billing and subscriptions are deferred, not promised Phase 9 functionality.
- **Evidence / class:** MISSING — no such model in `lib/db/src/schema/index.ts`; current exam config has question/domain/chapter settings only (`artifacts/api-server/src/lib/exams.ts:181–188`).

## 17. Activation procedure, backups and rollout authority

- **Options:** rerun old 0017 tooling; unrestricted migrate; new dedicated post-0017 package with exact old/new startup support and staged approvals.
- **Recommend:** new preparation package after model approval, then a separately authorized live read-only baseline check, fresh verified backup, isolated restore/rehearsal, maintenance, exact migration and post-commit verification.
- **Risk:** old backup/apply workflow expects 16 entries/22 tables and older HEAD; startup rejects unreviewed counts above 17. Even additive schema can stop the guarded launcher.
- **DB approval:** Yes for all execution, grants, seed/backfill and any maintenance. Source-only tool preparation is a separate smaller authorization.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `tools/exam-activation/readiness.mjs:28,44`; `backup.mjs:27,62`; `apply.mjs:28,47`; `tools/phase6a-local/policy.mjs:152`.

## 18. Phase 9 scope, branding and acceptance

- **Options:** broad platform rebuild/commerce rollout; identity/scoping first with optional later authority/access stages; preserve single-course indefinitely.
- **Recommend:** additive identity/scoping foundation and preserved CCNA adapter first. Schedule RBAC/entitlements as separately approved subphases. Keep CCNA brand/opaque historical question/storage codes until an explicit branding decision; parameterize context labels rather than rename stored content.
- **Risk:** a branded label, passing source check or documentation milestone can be mistaken for secure multi-course or Public Beta readiness.
- **DB approval:** No for documentation/branding presentation alone; Yes for the foundational model and authority/access phases.
- **Evidence / class:** EXISTING AND VERIFIED IN SOURCE — `artifacts/ccna-learning/src/components/nexus-shell.tsx:75,155`; `artifacts/ccna-learning/src/lib/study-export.ts:22,68`; `docs/development/phase-8-final-acceptance.md:Decisions`.

## Requested next decision

Approve or amend **the architecture choices first** (especially 1–5, 8–13 and 15–17). Then explicitly commission a **source-only** additive schema/guard/executor proposal against the verified-at-that-time 0017 baseline. No live check, backup, restore, migration, seed, role bootstrap, service change or publication is authorized by this document.

**Current state:** PREPARED documentation; implementation MISSING; current database/security/data assumptions REQUIRES LIVE VERIFICATION. **GO for design review, NO-GO for activation or Public Beta claims.**
