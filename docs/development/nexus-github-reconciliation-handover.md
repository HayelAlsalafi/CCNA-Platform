# NEXUS: GitHub reconciliation and independent architecture handover

Prepared 2026-11-10, Asia/Riyadh. Scope: source preservation and Git reconciliation only. **DATABASE ACTIVATION NOT AUTHORIZED. Public Beta: NO-GO.**

## 1. Executive summary and evidence vocabulary

The inspected development checkout contained Phase 9G backend and Phase 9H frontend work missing from the existing GitHub development branch: **19 files, 13 added and 6 modified, no deletions**. Those exact reviewed files were copied from a hashed preservation snapshot into a separate worktree based on the fetched remote development HEAD. This report is the twentieth changed file. No application functionality was authored or altered to reconcile the branches.

- **VERIFIED** means inspected source, Git objects, hashes, or a successful command in this reconciliation.
- **REPORTED** means an earlier implementation report or owner statement, not a newly established runtime fact.
- **UNVERIFIED** means insufficient evidence; in particular, source and mocked tests do not establish deployed database or browser behavior.

The reviewed current source snapshot is preserved in the synchronization branch. This is **not a claim that every historical local branch, ignored file, private receipt or runtime database has been synchronized**. Explicit exclusions are below.

## 2. Exact baselines, destination and commit identity

| Reference | VERIFIED value before publication |
| --- | --- |
| Origin | `https://github.com/HayelAlsalafi/CCNA-Platform.git` |
| Original local branch | `backup/phase9-source-wip` |
| Original local HEAD and fetched origin development HEAD | `4fec46e9826109fc0becede5ced4a5a32c9c5272` |
| Fetched `origin/main` | `e537fa6081b2d4b77204bfa9137eb2c1a6dcae1c` |
| Local `main` (not switched to or pushed) | `debda491d157fb56a792daafa6a11206e0428303` |
| New synchronization branch | `sync/nexus-local-reconciliation-20261110-793f839c` |
| Phase 9G preservation commit | `ac0f36f94807249de2d0faa9da628b80939950cc` |
| Exact synchronized application-source commit | `f0453a32b2fdfa356b8e99f597fba93c99dd6adf` |
| Application-source tree at that commit | `8dd3cb2431ebfaeb6ef2e3ee057d5b7f00758313` |

Destination: [synchronization branch](https://github.com/HayelAlsalafi/CCNA-Platform/tree/sync/nexus-local-reconciliation-20261110-793f839c). The following documentation-only commit adds this report. Its own literal SHA cannot be embedded in its contents without changing that SHA. The **exact final handover commit** is the commit adding this path, resolvable with `git log -1 --format=%H -- docs/development/nexus-github-reconciliation-handover.md`; the final operator receipt records its literal remote SHA after push. The source SHA above is fixed and does not include this report. At report preparation time publication is pending; only the separate remote verification establishes publication success.

## 3. Inventory, isolation and preservation method

VERIFIED: original root `C:/Users/hayel/Desktop/CCNA-Platform`; linked-worktree Git common metadata belongs to the existing `kindred-identity-spark` repository. No relocation or correction of that pre-existing arrangement was attempted. The original branch, HEAD, six modified files and thirteen untracked files were retained in place; no stash, reset, clean, checkout, history rewrite or destructive cleanup was used.

Before transfer, 1,132 tracked/nonignored-untracked file paths were inventoried with sizes, SHA-256 and Git content hashes, and copied to an immutable-by-procedure local snapshot. All original source raw hashes remained unchanged after validation. A verified `git bundle --all` preserves local refs, including existing stash/internal refs; these were not published. Bundle: 3,126,284 bytes; SHA-256 `19fd60147d20b9feaa77949c3f4de1c18096808c213f94c6ae85b57ea23806b3`.

Local evidence directory, deliberately outside version control:
`.local/nexus-reconciliation/reconciliation-2026-11-10T13-33-09-010Z-793f839c/`.
It contains `manifest.json`, `snapshot/`, `local-all-refs.bundle`, `refs-after-fetch.txt`, `ignored-inventory.json`, `reconciliation-plan.json`, `integrity-precommit.json`, validation logs/results and the final publication receipt when completed. Do not upload this directory or assume it contains a database backup. The separate synchronization worktree is its `worktree/` child.

## 4. Git ancestry and difference classification

VERIFIED: development HEAD equals fetched `origin/backup/phase9-source-wip`; there are no remote-only or local-only commits on that branch at reconciliation baseline. Development is four commits ahead of `origin/main`, zero behind, with main itself as merge base. The inherited development-to-main delta is 42 added and 16 modified paths, retained untouched in the new branch.

Inherited commits: `debda491` (9B), `aa5d186` (owner's C/D/E WIP), `00d8e98` (9E), `4fec46e` (9F). No main merge or replacement was necessary. Existing remote files are preserved because the new worktree starts from their exact development tree and the source delta is explicitly reviewed.

| Requested classification | Result |
| --- | --- |
| A: identical | Existing remote development tree except the reviewed 19-file delta |
| B: absent remotely | 13 new 9G/9H files listed below |
| C: local descendant work | 6 modified files, based on the exact fetched remote development baseline |
| D: remote newer | None on the selected development branch at baseline |
| E/H: divergent files/manual conflicts | None on the selected development branch; no automatic ours/theirs resolution |
| F: local-only commits | Six older alternative-history commits below; archived, not merged |
| G: remote-only commits | None against selected development HEAD; all inherited remote content retained |
| I: excluded files | Ignored/private/generated material described below |

One attached-assets text file appeared different only when Git's current text normalization was applied: `attached_assets/Pasted-We-have-successfully-completed-and-verified-Phase-1-Fou_1790521518995.txt`. Its **raw bytes equal the existing remote blob**; it is unchanged, was not staged or normalized. Timestamps were not used to select versions.

Six historical commits reachable from other local branches but absent from origin's branch/tag reachability were preserved in the bundle rather than merged into current source: `4c01d02dcd9275793da90b4d6d9a8beff652e3ca`, `9eb1cb68b81402c241cdb5729dcedd4dbaf3dfde`, `eceb9c08c5747b06cc0563a6f13fa45fb04e1fa6`, `d45105260be5c71fb02f47ba53036db4f1551377`, `5b1d25fad302007df6aef274f340371f4c022033`, `fe041e77dab19d066036c90e3d32d60bfbbe7d3b`. They belong to older Phase 3–5 alternative branches. Their functional equivalence, confidentiality and suitability for independent publication remain UNVERIFIED; owner review is required before integrating or uploading them. Cached `old-origin/*` refs were inventoried but that remote was not contacted. No existing branch or tag was modified.

## 5. Complete newly synchronized file scope

Paths are relative to repository root. **Added (14 including this report):**

```text
artifacts/api-server/src/lib/catalog-drafts.test.ts
artifacts/api-server/src/lib/catalog-drafts.ts
artifacts/api-server/src/routes/catalog-drafts.test.ts
artifacts/api-server/src/routes/catalog-drafts.ts
artifacts/ccna-learning/src/components/catalog-draft-manager.test.tsx
artifacts/ccna-learning/src/components/catalog-draft-manager.tsx
artifacts/ccna-learning/src/i18n/catalog-draft-messages.ts
artifacts/ccna-learning/src/lib/catalog-drafts-client.test.ts
artifacts/ccna-learning/src/lib/catalog-drafts-client.ts
docs/development/phase-9g-catalog-drafts-source.md
docs/development/phase-9h-admin-catalog-draft-ui-source.md
docs/development/nexus-github-reconciliation-handover.md
lib/db/drizzle/proposed/0023_catalog_draft_management.sql
lib/db/src/schema/catalog-draft-events.ts
```

**Modified (6):**

```text
artifacts/api-server/src/lib/global-rbac.ts
artifacts/api-server/src/routes/index.ts
artifacts/ccna-learning/src/components/course-catalog-admin.tsx
artifacts/ccna-learning/src/i18n/messages.ts
artifacts/ccna-learning/src/lib/admin-session.ts
lib/db/src/schema/index.ts
```

No deleted/renamed files. No package/lockfile, workflow, historical SQL, official migration journal/snapshot, launcher, feature-default or educational-content change. All other remote development paths are inherited. The 19 files above were pre-existing local development, not reconciliation feature work.

## 6. Exclusions and backup boundaries

VERIFIED metadata inventory: **26 standalone ignored files and 21 ignored directory groups**; directory contents are not recursively counted. These are exclusions, not 47 source files omitted accidentally. Private ignored contents were not opened or uploaded. The full names are retained locally in `ignored-inventory.json` and `reconciliation-plan.json`.

Categories: node_modules; dist and TypeScript build caches; `.local` private receipts/backups/snapshots; `.agents`; local rehearsal manifests and operator approvals; maintenance inventories; content-pack/manual-run/bound artifacts; historical `.bak` copies; deferred local MinIO tooling; a literal `%SystemDrive%` directory. These remain in place. Their recovery, privacy and usefulness are UNVERIFIED beyond metadata; no deletion permission is implied. Source-only synchronization is not backup of secrets, storage, databases or all ignored local work.

VERIFIED: no submodules and no tracked LFS files. Five inherited binary assets (two Arabic fonts, favicon, two screenshots) are unchanged; no new binary or oversized source requiring LFS was selected. No dependency was installed. `.gitignore` and `.gitattributes` were inspected; protected SQL/content/pin files keep their raw bytes. 105 protected tracked paths compared equal between original checkout and isolated worktree before commits.

## 7. Architecture and existing functionality

VERIFIED source layout: pnpm workspace; authoritative `pnpm-lock.yaml`; React/TypeScript/Vite frontend in `artifacts/ccna-learning`; Express TypeScript API in `artifacts/api-server`; shared Drizzle PostgreSQL model in `lib/db`; generated API/client infrastructure in `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`. Clerk verifies identity; database user status/roles govern authorization. Arabic/English dictionaries, LocaleProvider, logical layout and LTR technical identifiers coexist with original authored content.

Frontend source includes CCNA curriculum/learning routes, question practice, exam simulator, lesson study/workspace/export, administrative questions/lessons/taxonomy, GLOBAL user administration, read-only catalog and draft catalog workspace. API source includes corresponding learning, questions/practice, exams, lessons/study/media, admin and catalog/enrollment routers (`artifacts/api-server/src/routes/index.ts`). Presence is VERIFIED in source; current deployed functionality, real Clerk flow and browser acceptance are UNVERIFIED here.

No learning records, media objects or database content are part of this Git transfer. The owner-designated **16 real questions**, their IDs/text/answers/revisions/dependencies, all experimental lessons/exam results, users and other data must be preserved. The count/classification is **REPORTED by the owner**, not a fresh live count. Experimental never means disposable.

## 8. Phase 9A–9H status for independent review

| Phase | VERIFIED source/document evidence | Limitations |
| --- | --- | --- |
| 9A | Four architecture plans plus owner approval record; 18/18 architectural decisions recorded | Design approval does not approve SQL execution, cleanup or activation |
| 9B | GLOBAL RBAC policy, service/routes/UI, proposed 0018 | COURSE denied; no automatic legacy Admin promotion; SQL/concurrency/bootstrap unverified |
| 9C | Track/Course/CourseVersion model, catalog reads, proposed 0019/0020 | Nullable chapter binding and deterministic canonical CCNA backfill are proposals only; no replacement chapter/topic IDs |
| 9D | Central access policy/evaluator, lesson/media/private-study source hooks and 0021 | **PARTIAL**: remaining question/practice/exam/discovery enforcement and entitlement mutation authority deferred; global activation barrier remains |
| 9E | Enrollment/lifecycle, private course analytics, proposed 0022 | Own-user only; uncertain historical attribution UNKNOWN; no staff aggregates or auto-enrollment |
| 9F | `/admin/catalog` contract-limited read-only UI | Missing publication field/analytics shown UNKNOWN; no staff learner access |
| 9G | Draft read/create/edit backend and 0023 | Flag off; unused DRAFT only; version creation needs dedicated reviewed DRAFT blueprint; SQL not compiled live |
| 9H | Separate draft UI, client, localization/session protections | Track/Course create; permitted metadata edit; CourseVersion creation disabled; visual acceptance unverified |

Implementation-complete labels in earlier phase reports describe their limited SOURCE scope, not deployable platform completeness. Prior phase test totals are REPORTED unless covered by the fresh validation below. Read `docs/development/phase-9{b,c,d,e,f,g,h}-*-source.md` and `docs/architecture/phase-9a-*.md` for each exact scope and gate.

## 9. Database, curriculum and proposed migration status

VERIFIED official source journal: **17 entries, ending `0017_exam_simulator`**; latest official snapshot describes **24 tables**. Runtime applied ledger/schema/owners/grants/RLS are UNVERIFIED. All historical SQL, official metadata and startup pins remain unchanged. Do not infer applied state from source or run unrestricted migration tooling.

Unregistered proposals, source only: `0018_global_rbac.sql`; `0019_course_catalog.sql`; `0020_ccna_catalog_backfill.sql`; `0021_content_access.sql`; `0022_course_enrollment_analytics.sql`; `0023_catalog_draft_management.sql` under `lib/db/drizzle/proposed/`. Verify filenames/order against that directory before any future packaging. No proposed SQL was executed.

Catalog source preserves existing chapter UUID = topic UUID and question/lesson chapter references. Existing canonical CCNA checks and dedicated blueprint relations remain; backfill uses existing canonical identities. General non-certification publishing and canonical-profile generalization still need reviewed implementation; never invent official verification metadata or borrow the ACTIVE CCNA blueprint for a draft version.

0021 introduces incoming lesson/revision policy FKs, which interact with the 0016 controlled-deletion unreviewed-dependency guard. A separately reviewed forward solution/rehearsal is required; do not edit historical SQL or bypass that guard. Immutable exam/question revisions and existing lesson RLS remain intact.

## 10. Authentication, RBAC and draft contracts

VERIFIED source: verified Clerk session maps to local ACTIVE user; no token role claim or UI state grants authority. GLOBAL OWNER/ADMIN/CONTENT_MANAGER/STUDENT assignments are distinct from legacy USER/ADMIN. New management denies legacy ADMIN-only fallback and COURSE scope. Last-active-Owner protection, anti self-mutation, idempotent request hashes, guard serialization and append-only same-transaction audit are proposed; actual PostgreSQL behavior needs isolated verification.

The dedicated manager transport does not fall back to application/migrator credentials. Narrow fixed operations and proposed EXECUTE grants avoid broad app table writes. SQL trusts API-supplied verified actor UUID; a compromised API process could impersonate actors. That trust boundary, exact function owner/search_path/ACL/default ACL and dedicated LOGIN privileges require explicit acceptance and rehearsal. No credential or OWNER bootstrap was read, selected or executed here.

9G contracts: authenticated GET/POST/PATCH `/api/admin/catalog/{tracks,courses,versions}`; POST/PATCH require verified `X-Admin-Session`. Strict bodies, parent checks, optimistic concurrency, bounded pagination, immutable request receipts; no publishing/retirement/delete/bulk API. `expectedVersion` preserves all six UTC microsecond digits as an opaque string, never a JavaScript Date. 9H retains stable requestId/payload, disables duplicate submissions and automatic retries, distinguishes 400/403/404/409/503, partitions caches by identity/session, and treats uncertain outcomes as unresolved. Such receipts need manual review; no general receipt-diagnosis API or authorized DRAFT-blueprint picker was invented.

## 11. Enrollment, analytics and content-access boundaries

Enrollment tracks learning intent, not payment, entitlement or administrative authority. One learner/version binding survives ACTIVE/PAUSED/WITHDRAWN transitions. Only own enrollment/history is exposed. New attribution epochs and immutable snapshots prove scope where possible; missing proof remains UNKNOWN rather than guessed zero. Private notes/RLS are not repurposed as staff analytics.

Access policies FREE_OPEN/FREE_PREVIEW/ENTITLED are independent of roles; sign-in remains required. Administrative roles do not purchase paid content. Owner-approved expiry direction permits original personal notes/progress but denies paid bodies/media/quoted excerpts; preservation never deletes annotations/history. End-to-end question/practice/exam enforcement, issued-exam access leases, independent audited entitlement management and all disclosure boundaries remain incomplete. No UI milestone resolves them.

VERIFIED `requireContentAccessReadiness` is mounted after health and before every other API router. With `CONTENT_ACCESS_ENABLED=true`, it returns no-store 503 for all those routes. With the flag absent/disabled, legacy behavior remains. RBAC/catalog/enrollment/draft flags also require explicit enablement; none was set, forwarded or edited. **Do not remove this barrier, enable flags or start an unguarded server to test the new UI.**

## 12. Fresh offline validation

All checks below PASSED in this task with existing local dependencies, no install. Environment credentials/DB/provider/feature-variable names were removed from the child validation environment. Tests use fixtures/source inspection, not live integrations. Validation ran in the original checkout because the isolated worktree has no dependencies; all 19 transferred source blobs were independently matched to that exact tested snapshot.

| Check | VERIFIED result |
| --- | --- |
| Frontend focused suites | 79 tests, 7 files, PASS |
| API focused suites | 147 tests, 16 files, PASS |
| Offline diagnostics/media-reconciliation/pilot-environment tool tests | 7 tests, PASS |
| Root `pnpm run typecheck` | PASS |
| `pnpm exec tsc -p lib/api-spec/tsconfig.codegen.json` | PASS; no code generation |
| `git fsck --full` | PASS |
| Source raw snapshot, transferred blobs, protected-file comparison | No drift/mismatch |
| `git diff --check` | PASS before source commits |

Frontend coverage: draft client/manager, read-only catalog, GLOBAL admin, localization, StudyHub/export. API coverage: GLOBAL RBAC, catalog, access/private-study/read boundaries, enrollment/analytics, draft routes/service, lessons/study/media. Local evidence contains exact command arguments/logs. **233 focused tests total**, not the full suite. No production build, fresh install, SQL execution, real concurrency, DB permission test, live Clerk/media request, browser or deployment test.

`.github/workflows/ci.yml` triggers main pushes and specified PR targets. Pushing the new sync branch alone does not establish a GitHub CI run; no CI success is claimed. Linux/fresh-dependency reproducibility remains UNVERIFIED.

## 13. Security findings and technical debt

VERIFIED scan of inventoried relevant text found 14 token/URL/secret-like matches; inspection classified all as documented templates, test sentinels or explicitly unused trust-cluster fixture passwords. No unresolved actual credential/private-key finding or sensitive candidate file was found. Secret values were not reported; secret/ignored configuration was not opened. This is a bounded source review, not proof that every Git object or ignored artifact is secret-free.

No new binary, dependency, generated build, database dump or private receipt is selected. Existing fonts/screenshots are retained unchanged. All intended current source candidates have manifest hashes. Historical alternative commits are excluded from publication pending separate review, rather than presumed safe from a current-tree scan.

Technical debt/blockers: partial 9D enforcement; explicit entitlement-management permission/audit design; DRAFT blueprint selection; non-certification publication/canonical integrity evolution; COURSE RBAC; staff aggregates; uncertain mutation receipt diagnosis; exact SQL compilation/concurrency/security/load proof; fresh backup/restore proof; startup/journal/snapshot/executor promotion; browser/mobile RTL acceptance. Existing local check exit 0 without captured expected JSON remains a REPORTED unresolved verification item, not a live baseline receipt.

## 14. Recovery and activation gates

UNVERIFIED: current database identity/ledger, exact 16-question/dependency inventory, current catalog/security, eligible post-0017 backup and matching isolated restore. No DB/storage connection or private backup inspection occurred. Existing pre-0017 activation tooling has pinned earlier baselines; never bypass its pins or reuse its apply path for these proposals.

Next safe milestone: independent architecture/security review of this exact source commit and the unresolved boundaries, then separately authorized preparation of a guarded post-0017 recovery/activation package. Live preflight, backup, isolated restore, SQL rehearsal, new grants/roles, Owner selection/bootstrap, epoch initialization, maintenance and activation each require their applicable explicit owner approvals. No current records are destructive fixtures. No cleanup, deployment or Public Beta approval is implied.

## 15. Publication verification and handover use

The release procedure must check main/development/tags against the baseline again immediately before and after push; publish **only the new branch without force**; compare the remote branch commit/tree and every intended delta blob; check for zero unintended deletions; and verify original source hashes/status/branch unchanged. Stop on remote movement, failed validation, secret finding or conflict. The final private publication receipt and operator summary record those results and the literal final SHA. This document deliberately does not claim a future push already succeeded.

For Claude: pin the exact report-adding commit plus source commit above; review the relevant source and tests before accepting prior phase claims. The original development checkout remains dirty intentionally; the isolated sync worktree should be clean after the report commit. Existing main/development refs and tags must remain at their prior values. The six alternative-history commits and ignored metadata groups remain explicit differences, so this is **reviewed source reconciliation, not complete equivalence of every local artifact/ref with GitHub**.
