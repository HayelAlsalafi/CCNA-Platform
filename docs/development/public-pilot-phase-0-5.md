# Public pilot Phase 0–5 — local implementation review

> Follow-up: production compilation and actual-app fixture integration are now verified in [integration verification](public-pilot-integration-verification.md). The earlier execution limits and Git snapshot below describe the Phase 0?5 pass, not the later follow-up.

2026-11-03. HEAD `ac1744287c5310c06410b02f5f6be6ad63bba3b8`, branch `main`. **PARTIAL / NO-GO for claiming public-pilot readiness.** Independent safe source work is implemented and focused checks pass. Eligibility compatibility, privileged administration, current restored recovery and historical baseline failures remain open. No staging/commit/push/tag, database/storage connections, migrations, data changes or service restarts were performed in this workflow. No secrets or private receipts were inspected. Existing local changes were preserved.

## Phase 0: baseline and environment

| Check | Baseline classification | Repair / current result |
| --- | --- | --- |
| Windows Rollup startup | NEW-FAILURE: native optional package excluded | Restored **4.63.1**, exact existing Rollup version; no upgrade |
| Windows esbuild startup | NEW-FAILURE: native optional package excluded | Restored **0.28.2**, exact existing esbuild version; no upgrade |
| Root typecheck | NEW-FAILURE: shared sources outside db composite root; test JSON/union typing | Explicitly include only the two imported shared files under widened declaration root; preserve project references. Test types corrected without removing assertions. **Final `pnpm run typecheck`: PASS** |
| Frontend baseline | NEW-FAILURE: package resolution, CWD-dependent fixture paths, old study controls/CSS expectations | Resolved API-client/API-Zod in test config, portable font/CSS fixture paths; ZIP test uses ExcelJS's already-locked dependency. Historical study/focus tests still conflict with current UI/CSS; not weakened |
| API baseline, non-DB | NEW-FAILURE: **789 passed, 14 failed, 6 failed/38 passed files** | Canonical import fixtures and JSON types repaired; historical journal/objective expectations remain conflicting (below). No claim that the complete baseline passes |
| Exam activation/context tools | **KNOWN-STALE: two failures** (`17 !== 16`) | Left unchanged. Combined offline run: 19 passed / 2 failed, including two new reconciliation checks at that point. Baseline exam tooling alone has 17 passing checks and the two known failures |

The complete frontend/API baseline actually ran once after native startup repair. Subsequent runs were focused on changed files or newly diagnosed fixture errors; no repeated complete historical suite or production build. Vitest configurations disable env-file loading. Two disposable export/media fixtures were moved from `.local` to OS temp directories; no existing private evidence was read or removed. pnpm's `minimumReleaseAge: 1440` remains enabled. The only new application dependencies are pinned `helmet@8.1.0` and `express-rate-limit@8.2.1` (plus required transitive dependencies). Existing Clerk/React peer-range warnings remain; React was not upgraded.

## Findings and changes

Evidence locations refer to current source. `Y` means an approval-dependent remainder, not permission to execute it.

| Item | Evidence | Finding | Approval needed? |
| --- | --- | --- | --- |
| CORS previously reflected arbitrary origins | `artifacts/api-server/src/app.ts:37`; `middlewares/pilot-security.ts:6` | CONFIRMED DEFECT fixed with exact origin allowlist | N |
| No API-level headers/abuse budgets/final JSON fallback | `middlewares/pilot-security.ts:34`; `app.ts:49` | CONFIRMED DEFECT fixed; authenticated routes preserved | N |
| Clerk proxy must retain transport behavior | `app.ts:36` before security installation | OK: proxy remains ahead of security middleware | N |
| Admin session intent header optional | `middlewares/admin-mutation.ts:15` | RISK: omission allowed for existing clients. Recommend making mandatory only after compatibility/product review; not changed | Y |
| Generic question creation could use schema ACTIVE default | `lib/questions.ts`, createQuestion insertion | CONFIRMED DEFECT fixed in code: always explicit DISABLED, schema/default untouched | N |
| Explicit publish workflow exists | `lib/question-studio.ts:220,260,298`; `components/question-studio-editor.tsx:260` | OK: canonical chapter, explanation, topic, options, duplicates, edit token, locks and revision-aware writer. Added positive publish regression | N |
| Legacy enable/edit could bypass Studio readiness | `lib/questions-admin.ts:165–179` | CONFIRMED DEFECT: legacy ACTIVE activation/published edits now direct admin to Studio; Studio/bulk pass the internal reviewed path after validation | N |
| Existing learner eligibility is not a universal revision gate | `lib/questions.ts:83`; `lib/practice.ts:15`; `lib/practice-batch.ts:32`; `lib/exams.ts:79` | RISK: ACTIVE question/topic required; Exam additionally joins canonical mapping/blueprint and checks options. Some delivery paths capture revisions on demand. Universal canonical/current-revision filtering was **not** changed without compatibility evidence | Y |
| Exam ownership/deadline/finalization | `lib/exams.ts:100,148,289,354` | OK in source/mocks: user predicates, locked server deadline, save denial, idempotent terminal result | N |
| Exam isolation mechanism | `0017_exam_simulator.sql`; `lib/exams.ts:103,152` | RISK: owner isolation relies on application user_id predicates, not owner RLS on Exam tables; DB constraints add integrity, not cross-user row isolation | Y for any RLS change |
| Read-only learner monitoring | `routes/admin-learners.ts:18` | Implemented bounded admin-only aggregate endpoint with runtime SELECT checks, read-only transaction and no-store; no answers/email/Clerk IDs/lesson-private rows | N |
| Role/status mutations | `tools/phase6a-local/policy.mjs:157` forbids role_update/status_update | BLOCKED: no grants added and no mutation endpoint/UI implemented | Y |
| Lesson activity monitoring | `lib/db/drizzle/0014_interactive_study.sql:25,40` owner RLS | BLOCKED: no impersonation/bypass. API reports null/unavailable explicitly | Y |
| Post-0017 backup/recovery tooling | `tools/exam-activation/verify-backup.mjs:23–26,46` | RISK: old migration backup tooling deliberately requires 16 entries and absent Exam objects; not repurposed | Y before live backup/restore |
| Arabic/RTL | Existing English UI convention; no i18n framework added | RISK: full translated Arabic flows/RTL acceptance remain outside this implementation | Product/browser review |

### Phase 1 — API security

`ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins. Default **only with NODE_ENV=development**: `http://localhost:8080`. All other environments require explicit configuration; production requires HTTPS origins and fails closed if missing/invalid. Requests without Origin retain ordinary authenticated server/client behavior. Unknown/disallowed browser origins receive a JSON 403. No wildcard or credential-bearing origins.

Helmet is API-oriented: no frontend CSP injection, cross-origin resource delivery retained, HSTS disabled in development. Global budget 600/minute/IP; admin mutations 120, uploads/derivation 20, exam start 10, practice/Nexus answer/submission/finalization 120. Window and limits are configurable by `API_RATE_WINDOW_MS`, `API_RATE_GLOBAL`, `API_RATE_ADMIN`, `API_RATE_UPLOADS`, `API_RATE_EXAM_START`, `API_RATE_PRACTICE_SUBMIT`. Health and authenticated media image reads bypass rate counters. Clerk proxy remains ahead of this middleware. JSON 404 and sanitized unexpected-error/JSON-parser fallbacks added without response stack leakage.

`API_TRUST_PROXY` defaults to false; only reviewed fixed hop counts 1–5 accepted. Configure only with a known ingress chain and direct API access blocked; never enable blindly. Settings cross both guarded launcher allowlists **API-only**, never frontend/check. Limits use an in-process store, suitable for this single-process pilot candidate; multi-instance deployment needs a separately reviewed shared enforcement strategy. Shared-NAT behavior needs browser/load acceptance. No existing endpoint contract/schema was changed; the new internal admin summary route is additive and uses the existing authenticated transport, without changing generated OpenAPI clients.

Source authorization audit: healthz, `/topics` and `/dashboard/summary` are intentionally retained public summary reads; `/auth/me` resolves verified identity. Questions, practice, curriculum, Nexus, exams, lesson discovery/content, study and media use existing authentication. Admin topic/question/import/taxonomy/lesson/media and new monitoring routes retain server-side ADMIN checks; role/status derive from PostgreSQL, not token claims. This is source-level review, not live authorization certification. Existing explicit completion and media reference authorization were not changed.

### Phase 2 — publishing

Every caller of central creation (legacy admin, Studio and import) now stores DISABLED even if ACTIVE was requested or defaulted. Import already explicitly requested DISABLED. New Studio guidance explains reopening/reviewing/publishing; existing edit/bulk publication still revalidates through Studio inside the transaction. No existing question rows were touched. Legacy direct activation is rejected with Studio guidance rather than granting a second publication bypass. Canonical schema defaults and generated contracts remain unchanged.

**Compatibility impact deliberately avoided:** adding revision/canonical checks to all learner availability queries could remove existing ACTIVE questions with inconsistent historical mappings/revisions. Main inspection is prohibited in this workflow, so that filter change is deferred. Existing question availability/counts/delivery/grading queries remain unchanged. DISABLED is sufficient for non-live creation; a true DRAFT enum or durable audit trail requires a separate migration plan/approval, not an implicit schema change.

### Phase 3 — deterministic exam tests only

New no-DB fake executor injects server time and persisted rows to verify reload retains questions/answers/flags/original deadline, expired saves cause no writes, needsFinalization, EXPIRED finalization capped at deadline, grading preservation and repeated-submit idempotence. Existing multi-answer/correct/incorrect/unanswered tests and cross-owner read/save/submit tests retained. UI history Resume test retained; added clock-crossing test proves one automatic submission at zero and no editable inputs afterward. No exam scoring/timer/backend algorithm changed.

### Phase 4 — safe subset

New internal `GET /api/admin/learners?page=1&pageSize=20`: max 50/page, bounded pages, stable ordering, minimal account fields and practice/exam aggregate counts/dates. It confirms required existing SELECT permissions, uses a repeatable-read READ ONLY transaction, and fails 503 if privileges/schema are unavailable. No query touches owner-scoped lesson_progress/lesson_annotations. No new grants or actor impersonation. A compact read-only panel appears in Admin Overview with pending/error/retry/empty/pagination states. Cache identity and cleanup reuse existing admin-session conventions. Main-role permissions and live performance remain unverified because no database connection is authorized.

### Phase 5 — preparation

`tools/media-reconciliation.mjs`: inert on import; offline `--plan`; explicit guarded read-only inspection mode pins cluster identity, exact source/ledger 17 and private bucket. It compares metadata delivery/thumbnail/original keys with bounded paginated object listing, using the adapter's `ccna-lessons/` prefix. No object mutations, retry loop, secrets or raw driver diagnostics. Missing/orphan candidate keys are review evidence only. No live invocation was performed. See [recovery runbook](public-pilot-recovery-runbook.md) for approval gates and candidate commands; it explicitly refuses to treat old pre-0017 tools as a post-0017 recovery certification.

## STOPPED items: plans for separate approval

| Item | What / why | Risk | Rollback |
| --- | --- | --- | --- |
| Universal learner eligibility | Approve read-only aggregate compatibility inventory first; determine missing canonical mappings and matching revisions without exposing answers. Then review a code-only shared eligibility rule; any row repair needs separate authorization | Unexpected disappearance of legitimate published content or counts | Revert only new query predicates; never delete history or silently repair rows |
| Role/status management | Design a narrowly scoped controlled DB function and migration, retaining no direct app UPDATE grants. Serialize role/status writers; validate verified ADMIN actor, deny self changes, lock target and active-admin set, reject removal of final active admin atomically. Log actor/target/change via pino without secrets | Privilege escalation, concurrent last-admin loss | Before activation no DB effect; after activation stop/review function rollback separately, never auto-reverse user records |
| Admin lesson summaries | Review aggregate-only function/RLS design returning counts, enforcing ADMIN server/DB checks; never spoof owner context or add BYPASSRLS | Exposure of private learner notes/progress | Remove new capability after approved review; leave owner policies/history intact |
| DRAFT/audit schema, if desired | Optional reviewed migration, not needed for current DISABLED creation safety | Enum/data compatibility, extra privileged writes | Separate reviewed forward recovery; no automatic enum/data rollback |
| Current recovery evidence | Prepare/review exact 17-entry backup/restore guard, then approve one fresh archive and isolated 55440 recovery plus private object snapshot/restore verification | False recovery confidence, stale metadata/object mismatch | No live restore/cutover here; retain all archives and authoritative services |

## Verification and remaining baseline failures

- Final root `pnpm run typecheck`: PASS (rerun after source changes).
- Focused API main work: **96 passed / 8 files** (security, monitoring, publication, exam invariants, Studio, existing exam tests, canonical import and import transaction fixtures). Later stricter security/Nexus paths: **10 passed**; explicit Studio publish/security combined: **37 passed**. Counts overlap; do not add them.
- Existing route/typing checks: **74 passed, one historical study-schema test failed** in the targeted 75-case run; it expects an old journal state and is not evidence of a new runtime defect.
- Frontend: Exam **16 passed** (including clock crossing), new monitoring + Studio **28 passed**, export integrity **10 passed**, Nexus **19 passed** after module resolution repair. Historical focus CSS test still fails because jsdom does not evaluate current container-query layout; old study test requests the former save/resume control labels. Neither production reading behavior nor assertions were weakened to satisfy them.
- Canonical import files + import transactions: **37 passed, one failed**; the remaining test still expects retired objective classification to be accepted. Do not re-enable that behavior merely to satisfy a historical assertion. Taxonomy schema test also expects the current journal to end at migration 0005; current exact chain ends at 0017. These are additional baseline findings, distinct from the two known Exam tooling failures.
- Node tools: **4 passed** for reconciliation and API-only security settings; source SQL/snapshot/17-entry pins validate. The two known Exam tooling tests remain unchanged and fail pre-activation assumptions against the promoted source.
- `git diff --check`, script syntax and credential-free reconciliation Plan: PASS. Historical SQL, schema source, protected manifests and known stale test files unchanged.

Not run/verified: live DB tests/privileges/RLS, main or isolated SQL, browser, production build, load testing, real CORS/Clerk deployment, actual media reads/uploads, archive inspection, live backups/restores or S3 reconciliation/object backup. No service restart or live acceptance was performed; an existing development frontend may pick up edits through hot reload. Browser review must cover Clerk sign-in/out/session switching, both languages/RTL, Studio create-unpublished → review/publish, legacy guidance, exams/resume/expiry, admin monitoring/privacy, practice, images and rate-limit feedback. Configure Clerk sign-up availability, allowed origins/redirects and session expiry/revocation in its dashboard separately; do not assume these source changes configure Clerk.

## Changed-file inventory

The following list includes preserved Phase 0 repairs and this workflow's changes; all remain uncommitted. No Git staging or publication is authorized here.

- `artifacts/api-server/package.json`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/lib/canonical-chapters.test.ts`
- `artifacts/api-server/src/lib/exams.test.ts`
- `artifacts/api-server/src/lib/phase2d-media.test.ts`
- `artifacts/api-server/src/lib/pilot-exams.test.ts`
- `artifacts/api-server/src/lib/pilot-publishing.test.ts`
- `artifacts/api-server/src/lib/question-import-files.test.ts`
- `artifacts/api-server/src/lib/question-import.test.ts`
- `artifacts/api-server/src/lib/question-studio.test.ts`
- `artifacts/api-server/src/lib/question-studio.ts`
- `artifacts/api-server/src/lib/questions-admin.ts`
- `artifacts/api-server/src/lib/questions.ts`
- `artifacts/api-server/src/lib/study.test.ts`
- `artifacts/api-server/src/middlewares/pilot-security.test.ts`
- `artifacts/api-server/src/middlewares/pilot-security.ts`
- `artifacts/api-server/src/routes/admin-content.test.ts`
- `artifacts/api-server/src/routes/admin-learners.test.ts`
- `artifacts/api-server/src/routes/admin-learners.ts`
- `artifacts/api-server/src/routes/command-center.test.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/learning-catalog.test.ts`
- `artifacts/api-server/src/routes/lessons.test.ts`
- `artifacts/api-server/src/routes/study.test.ts`
- `artifacts/api-server/vitest.config.ts`
- `artifacts/ccna-learning/src/components/admin-learners.test.tsx`
- `artifacts/ccna-learning/src/components/admin-learners.tsx`
- `artifacts/ccna-learning/src/components/admin-overview.tsx`
- `artifacts/ccna-learning/src/components/phase2d-study-export.test.ts`
- `artifacts/ccna-learning/src/components/phase2d1-reading.test.ts`
- `artifacts/ccna-learning/src/components/question-studio-editor.tsx`
- `artifacts/ccna-learning/src/lib/admin-session.ts`
- `artifacts/ccna-learning/src/pages/exams.test.tsx`
- `artifacts/ccna-learning/vitest.config.ts`
- `docs/development/public-pilot-phase-0-5.md`
- `docs/development/public-pilot-recovery-runbook.md`
- `lib/db/tsconfig.json`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tools/media-reconciliation.mjs`
- `tools/media-reconciliation.test.mjs`
- `tools/phase6a-local/invoke.ps1`
- `tools/phase6a-local/policy.mjs`
- `tools/pilot-environment.test.mjs`

## Final Git evidence

```text
HEAD: ac1744287c5310c06410b02f5f6be6ad63bba3b8

git status --short
M artifacts/api-server/package.json
 M artifacts/api-server/src/app.ts
 M artifacts/api-server/src/lib/canonical-chapters.test.ts
 M artifacts/api-server/src/lib/exams.test.ts
 M artifacts/api-server/src/lib/phase2d-media.test.ts
 M artifacts/api-server/src/lib/question-import-files.test.ts
 M artifacts/api-server/src/lib/question-import.test.ts
 M artifacts/api-server/src/lib/question-studio.test.ts
 M artifacts/api-server/src/lib/question-studio.ts
 M artifacts/api-server/src/lib/questions-admin.ts
 M artifacts/api-server/src/lib/questions.ts
 M artifacts/api-server/src/lib/study.test.ts
 M artifacts/api-server/src/routes/admin-content.test.ts
 M artifacts/api-server/src/routes/command-center.test.ts
 M artifacts/api-server/src/routes/index.ts
 M artifacts/api-server/src/routes/learning-catalog.test.ts
 M artifacts/api-server/src/routes/lessons.test.ts
 M artifacts/api-server/src/routes/study.test.ts
 M artifacts/api-server/vitest.config.ts
 M artifacts/ccna-learning/src/components/admin-overview.tsx
 M artifacts/ccna-learning/src/components/phase2d-study-export.test.ts
 M artifacts/ccna-learning/src/components/phase2d1-reading.test.ts
 M artifacts/ccna-learning/src/components/question-studio-editor.tsx
 M artifacts/ccna-learning/src/lib/admin-session.ts
 M artifacts/ccna-learning/src/pages/exams.test.tsx
 M artifacts/ccna-learning/vitest.config.ts
 M lib/db/tsconfig.json
 M package.json
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
 M tools/phase6a-local/invoke.ps1
 M tools/phase6a-local/policy.mjs
?? artifacts/api-server/src/lib/pilot-exams.test.ts
?? artifacts/api-server/src/lib/pilot-publishing.test.ts
?? artifacts/api-server/src/middlewares/pilot-security.test.ts
?? artifacts/api-server/src/middlewares/pilot-security.ts
?? artifacts/api-server/src/routes/admin-learners.test.ts
?? artifacts/api-server/src/routes/admin-learners.ts
?? artifacts/ccna-learning/src/components/admin-learners.test.tsx
?? artifacts/ccna-learning/src/components/admin-learners.tsx
?? docs/development/public-pilot-phase-0-5.md
?? docs/development/public-pilot-recovery-runbook.md
?? tools/media-reconciliation.mjs
?? tools/media-reconciliation.test.mjs
?? tools/pilot-environment.test.mjs

git diff --stat (tracked files only; new files listed above are excluded)
artifacts/api-server/package.json                  |  2 +
 artifacts/api-server/src/app.ts                    |  6 ++-
 .../api-server/src/lib/canonical-chapters.test.ts  |  2 +-
 artifacts/api-server/src/lib/exams.test.ts         |  1 +
 artifacts/api-server/src/lib/phase2d-media.test.ts |  3 +-
 .../src/lib/question-import-files.test.ts          |  5 ++-
 .../api-server/src/lib/question-import.test.ts     |  9 ++--
 .../api-server/src/lib/question-studio.test.ts     |  6 +++
 artifacts/api-server/src/lib/question-studio.ts    |  2 +-
 artifacts/api-server/src/lib/questions-admin.ts    |  4 +-
 artifacts/api-server/src/lib/questions.ts          |  2 +-
 artifacts/api-server/src/lib/study.test.ts         |  4 +-
 .../api-server/src/routes/admin-content.test.ts    |  2 +-
 .../api-server/src/routes/command-center.test.ts   |  2 +-
 artifacts/api-server/src/routes/index.ts           |  2 +
 .../api-server/src/routes/learning-catalog.test.ts |  4 +-
 artifacts/api-server/src/routes/lessons.test.ts    | 10 ++---
 artifacts/api-server/src/routes/study.test.ts      |  2 +-
 artifacts/api-server/vitest.config.ts              |  6 ++-
 .../src/components/admin-overview.tsx              |  2 +
 .../src/components/phase2d-study-export.test.ts    | 12 ++++--
 .../src/components/phase2d1-reading.test.ts        |  2 +-
 .../src/components/question-studio-editor.tsx      |  5 ++-
 artifacts/ccna-learning/src/lib/admin-session.ts   |  2 +-
 artifacts/ccna-learning/src/pages/exams.test.tsx   | 19 ++++++++
 artifacts/ccna-learning/vitest.config.ts           |  5 ++-
 lib/db/tsconfig.json                               | 12 ++++--
 package.json                                       |  2 -
 pnpm-lock.yaml                                     | 50 +++++++++++++++++++++-
 pnpm-workspace.yaml                                |  2 -
 tools/phase6a-local/invoke.ps1                     |  2 +-
 tools/phase6a-local/policy.mjs                     |  2 +-
 32 files changed, 144 insertions(+), 47 deletions(-)
```
