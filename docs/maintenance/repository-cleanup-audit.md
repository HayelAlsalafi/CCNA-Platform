# Repository cleanup audit

Audit date: 2026-10-26 (client date). **Audit only; no deletion approved or performed.**

Workspace: `<repository-root>`
Branch: `main`
HEAD: `3c07b4bb7fe807e60dcbcd5539c046b919a9956f`

## Scope and evidence

The initial Git inventory contained **53 modified tracked files and 336 individual untracked files** (`git status --porcelain=v1 -uall`). These include active application features, migrations, operational helpers, documentation, `pnpm-lock.yaml`, and backup copies. Untracked does not mean disposable. All were preserved.

A recursive metadata walk observed **47,809 regular files, 4,975 directories entered, 1,956 symbolic links/junctions not followed, and 610,216,392 logical bytes**. This is a traversal observation, not allocated disk space or a claim to have read every file. It includes installed dependencies and accessible private-cluster files. `.git` is a worktree pointer file; its external target was not traversed. No other project was accessed.

**Coverage limitation:** 25 directories denied enumeration: dated backup, restore-test, diagnosis and upgrade evidence beneath `.local/final-legacy-cleanup`, `.local/final-legacy-diagnosis`, `.local/phase8a-cleanup`, and `.local/question-bank-upgrade`. They remain protected and unclassified internally. Permissions were not changed. Stored secrets, environment files, PostgreSQL data contents and backup payloads were not read. No database or external service was contacted. These omissions prevent a claim of exhaustive semantic inspection or a complete repository-wide disk total.

Outside `.local`, dependency trees and `.git`, the inventory contains **986 files / 18,757,566 bytes**, including generated dist files. A safe text corpus of **756 files** was searched for direct and indirect references; generated distribution files, environment files, large migration snapshots and binary payloads were excluded from that text corpus. Import-pattern analysis found **2,375 literal import/from/require references** and **five files with nonliteral dynamic imports**. These are syntactic reference counts, not proof that every runtime path was executed. Accessible local script sources were searched separately without reading database files or private reports. Only the root `AGENTS.md` was discovered outside installed dependency trees; no nested project instructions were found in accessible directories.

The companion inventory records exact candidate paths, sizes, classifications, reference evidence, retained duplicate counterparts, and a SHA-256 allowlist for the proposed deletions. Audit output is excluded from its own counts.

## Actual architecture and entry points

| Area | Actual use and reason to retain |
| --- | --- |
| `artifacts/ccna-learning` | Primary React 19 / Vite / Wouter / TanStack Query application. `index.html` loads `src/main.tsx`, which mounts `App.tsx`; shared NEXUS shell, curriculum, practice, Admin, history and exam pages live here. Tailwind and existing UI components are active. |
| `artifacts/api-server` | Express 5 API. `src/index.ts` validates environment and starts `app.ts`; `app.ts` mounts the routes under `/api`. Clerk establishes identity; database users determine role/status. esbuild bundles the API and its worker dependencies. |
| `lib/db` | PostgreSQL / Drizzle schema and versioned SQL, journal and snapshots. Official source chain has **12 entries, 0000–0011**. Proposed `0012_exam_simulator` is still a proposal; source exports do not prove database activation. All historical SQL and proposed SQL/metadata are protected. |
| `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` | OpenAPI and multiple Orval configurations generate distinct general, learning-progress and detailed-history clients/validators. Custom fetch and handwritten additions remain required. Generated source files are consumed by imports/exports and contain pre-existing edits; do not delete or regenerate them as cleanup. |
| `lib/canonical-chapters.json`, `lib/ccna-book-chapters.ts` | Canonical educational chapter definitions and mapping logic. Distinct from exam domains/objectives. Preserve. |
| `scripts` | Workspace package with seed and promote-admin CLIs plus post-merge hook. Manually invoked operational entry points count as dependencies. No seeds or administrative commands were run. |
| `tools` | Guarded local startup, offline checks, migration source preparation/promotion, privilege validation, controlled deletion, backup/provenance/reset tools and isolated-test harnesses. Retain even if older commands intentionally fail closed on newer migration chains. |
| `artifacts/mockup-sandbox` | Separate workspace package and Replit component-preview service. Its plugin scans `src/components/mockups/**/*.tsx`, generates a module map and dynamically imports previews. Included by workspace globs/recursive build/typecheck. Not an unused folder. |
| Root `src`, `vite.config.ts`, `components.json`, `public` | Separate Lovable/TanStack template, including placeholder route and internal routing/error-reporting graph. Not the primary local app. Historical handover calls it unused by the app, but root config explicitly selects `src/server.ts`, root routes use `/favicon.ico`, and Lovable integration remains recorded. Hosting use was not live-verified. Keep pending an explicit hosting decision. |

Eight workspace packages plus the root package are present: API, learning web, mockup sandbox, DB, API spec, API client, API Zod, scripts. Workspace patterns are `artifacts/*`, `lib/*`, `lib/integrations/*`, and `scripts`; no integration-package directory was observed.

**Package manager:** `pnpm@10.28.0`; Node >=22. Root `preinstall` rejects other package managers. CI installs using the frozen `pnpm-lock.yaml`. `bun.lock` is a Lovable sandbox artifact documented in `AGENTS.md` and `docs/HANDOVER.md`; it is not the authoritative lockfile. Preserve it and `bunfig.toml` for hosting review rather than treating them as approved removals. No dependency installation, upgrade, lockfile edit or code generation ran.

**Build and deployment:** `.github/workflows/ci.yml` typechecks, tests and builds API + learning web on Ubuntu. Root `build` also recurses through workspace packages. `build:dev` copies the learning web output to root `dist/` for Lovable. `.replit` and per-artifact `.replit-artifact/artifact.toml` declare separate Replit services; Vite conditionally imports cartographer/dev-banner when `REPL_ID` is present and always imports the Replit runtime overlay. Installed/invoked tooling must not be removed merely because this workstation is Windows.

**Local runtime:** `tools/phase6a-local/invoke.ps1` dispatches guarded modes through `run.mjs`; its frontend dependency resolver and offline runners explicitly use `.local/native-deps/node_modules`. That cache supplies Windows binaries omitted by workspace platform overrides. Removing it breaks this workstation. The launcher also uses `.local/phase6a-runtime/vite-cache`; do not remove runtime directories during an audit.

## Baseline checks performed before report creation

| Command / check | Actual result |
| --- | --- |
| `node tools/check-admin.mjs` | **PASS**. API, frontend, DB schema and client TypeScript through the installed-cache checker. This does not cover every workspace package, every test, or the root Lovable template. |
| `node tools/run-curriculum-tests.mjs` | **FAIL**: 745 passed, 2 failed, 747 tests / 52 files. This is the runner's explicit database-free selection, not every repository test. |
| `node --test tools/exam-policy.test.mjs tools/question-bank-policy.test.mjs tools/phase6a-local/policy.test.mjs tools/phase6a-local/upgrade.test.mjs tools/phase6a-local/runtime-ledger.test.mjs tools/phase6a-local/runtime-startup.test.mjs tools/phase6a-local/frontend.test.mjs tools/phase6a-local/catalog-delete-grant.test.mjs` | **FAIL**: 235 passed, 1 failed, 236 reported tests/file failures. No database connections. |
| `node tools/build-admin-ui.mjs` | **PASS**, 1,952 modules, compile-only production frontend output at `.local/admin-ui-production-build/1793003332411`. Existing UI sourcemap warnings and >500 kB chunk warning. No environment files loaded, no configured credentials, no server started. This does not build the API or activate exams. |
| Lint | **NOT RUN**: no package lint script and no installed ESLint / required plugin set in the pnpm cache. `eslint.config.js` exists; no packages were installed to make it executable. |
| Root recursive build / API production build | **NOT RUN**: root build invokes wider package workflows; API build deletes its existing `dist` first. Initial audit permits no deletion. The isolated frontend compilation above is the safe substitute, not an API build claim. |
| PostgreSQL, migrations, restore tests, live API/UI, external hosting | **NOT RUN**. Private test cluster stays stopped as requested. No app database connection, migration, grant, reset, deletion or service change. |

Baseline failures, unchanged by this audit:

1. `artifacts/ccna-learning/src/components/admin-session.test.tsx:539`: StrictMode teardown/replay test exceeded its 5,000 ms timeout. The run overlapped compilation/typechecking; this observation does not establish a product regression or prove flakiness.
2. `artifacts/ccna-learning/src/components/question-bank-studio.test.tsx:369`: duplication test selects the first POST and expects `/api/admin/questions/studio`; observed `/api/admin/questions/studio/readiness`. Distinguish readiness from the eventual save in a separate test-maintenance task; no assertion or application behavior was changed here.
3. `tools/question-bank-policy.test.mjs:19` calls `questionBankPlan()` at module load. `tools/question-bank-upgrade-core.mjs:31` only accepts official lengths 7–11; the actual source chain has 12. This is an obsolete upgrade-test assumption/fail-closed tool boundary, not permission to bypass the migration guard. The file fails before its tests register.

## Classification and proposed cleanup boundary

`SAFE_TO_REMOVE` means strong local evidence supports a proposal, **not permission to delete**. `GENERATED_RECREATABLE` does not mean every old artifact can be reproduced byte-for-byte from today's changed source. For that reason, only unreferenced, byte-identical duplicate build copies are proposed; unique historical bundles and documentation-linked outputs remain.

| Candidate / area | Classification | Evidence and references | Risk / recommendation |
| --- | --- | --- | --- |
| `artifacts/ccna-learning/src/pages/exam-simulator.css` | SAFE_TO_REMOVE | 14,919-byte retired demo stylesheet. No filename/import reference in the safe source corpus or accessible local script sources. Current exam page explicitly imports `./exam-workspace.css`. Current production route compiles. No CSS discovery/glob includes the retired sheet in the inspected build paths. | Low. Propose this one file only, with its pinned hash; retain current exam source, tests and `exam-workspace.css`. |
| `.local/admin-ui-production-build` | GENERATED_RECREATABLE | 31 observed output directories, each five compiled/static files. Producer is `tools/build-admin-ui.mjs`, which creates a timestamped isolated output and never uses an older output as input. Current launcher serves source, ordinary deployment uses artifact/root dist. Full relative filename + SHA-256 manifests identify exact duplicate copies. | Low for the nine duplicate copies listed below. Preserve the latest audit build, every documentation-linked bundle and one exact counterpart per proposed removal. |
| `artifacts/api-server/dist`, `artifacts/ccna-learning/dist` | GENERATED_RECREATABLE | Existing API bundle/workers and web build. API `start` directly executes `dist/index.mjs`; web deployment manifests point to `dist/public`. | Keep: generated but operationally consumed; service state not inspected or changed. |
| `lib/api-client-react/dist`, `lib/api-zod/dist`, `lib/db/dist`, seven `*.tsbuildinfo` files | GENERATED_RECREATABLE | TypeScript declaration/map and incremental outputs; tsconfig project references and emit settings explain production. Exact paths/sizes in inventory. | Keep in this proposal. Rebuilding all packages was not established and no compiler cache deletion is necessary for a safe first cleanup. |
| Nine `tools/phase6a-local/*.before-*.bak` files | OBSOLETE_BUT_REVIEW_REQUIRED | 49,473 bytes total, no exact filename references found in searched source or accessible local scripts. Each differs from its current counterpart. They retain older operational/security behavior. Exact paths below. | Medium. Preserve pending owner decision on rollback/evidence value; do not execute or bulk-delete. |
| Literal `%SystemDrive%/ProgramData/Microsoft/Windows/Caches` directory | UNCERTAIN_KEEP | Four files / 989,728 bytes, untracked; inspected binary headers, not SQL migrations or importable JS. No literal path references found. Binary provenance and external Windows-tool usage are unverified. This is a literal workspace-relative directory, not the real system drive. | Medium. Preserve; no claim that filename or absent imports proves disposability. |
| `screenshots/ccna-learning-dashboard.jpg`, `screenshots/ccna-learning-topics-mobile.jpg` | UNCERTAIN_KEEP | 98,000 / 37,786 bytes; no exact filename references in searched text. They are unique visual evidence, not recreatable source artifacts. | Keep for review. No lack-of-import deletion. |
| `attached_assets/Pasted-We-have-successfully-completed-and-verified-Phase-1-Fou_1790521518995.txt` | OBSOLETE_BUT_REVIEW_REQUIRED | 12,334 bytes; historical request/provenance. Asset alias remains in web Vite config and local launcher; `docs/development/phase-5c-git-manifest.md` explicitly preserves this file. | Keep. Historical user-created material, not an approved cleanup target. |
| Root `src/`, `vite.config.ts`, `components.json`, `public/`, `eslint.config.js` | UNCERTAIN_KEEP | Lovable template with internal imports, route generation, error-reporting and explicit server-entry configuration; root assets referenced by root layout. `src/` has 59 files / 177,018 bytes. Deployment status not independently verified. | Keep entire graph until hosting/toolchain ownership is decided; no UI component deletion by import count. |
| `bun.lock`, `bunfig.toml` | OBSOLETE_BUT_REVIEW_REQUIRED | 200,306 / 387 bytes; documented Lovable-created alternative tooling, not pnpm authority. Hosting may regenerate/use these. | Keep until Lovable-specific review; no dependency changes. |
| `.replit`, `.replitignore`, `replit.md`, artifact manifests, Replit plugins | ACTIVE_REQUIRED / historical documentation | `.replit` references post-merge hook; `.replitignore` excludes `.local` deployment; manifests expose web/API/mockup services. Vite includes Replit tooling, including dynamic imports. | Keep. Current external hosting use is uncertain; source-level operational references are concrete. |
| `.lovable/project.json`, `AGENTS.md`, `.github/workflows/ci.yml`, pnpm configuration | ACTIVE_REQUIRED | Recorded hosting connection, instructions, CI, workspace globs, frozen-lock workflow, supply-chain guard and dependency overrides. | Protected; preserve all. |
| Old demo `artifacts/ccna-learning/src/lib/exam-simulator.ts` and its test | ACTIVE_REQUIRED (test dependency) | Demo helper is directly imported by `exam-simulator.test.ts`; that test is selected by `tools/run-curriculum-tests.mjs`. Runtime uses the newer page/client. | Keep both. A retired runtime feature is not automatically an unused test dependency. |
| Thin compatibility modules `components/admin-questions.tsx`, `components/admin-topics.tsx`, `components/practice-workspace.tsx` | ACTIVE_REQUIRED | Re-export current Studio/topics/practice implementations, preserving existing import contracts and tests. | Keep; file length is not evidence of redundancy. |
| `lib/db/drizzle/proposed/**`, repeated migration copies and metadata under `.local` | ACTIVE_REQUIRED / operational evidence | Rehearsal manifests, source-pinning tests, promotion tools, snapshot comparisons and backup workflows read these exact paths/hashes. For example `question-bank-upgrade-core.mjs` and `run-admin-practice-disposable.mjs` read proposed and staged copies. | Protected even when promoted SQL also exists officially. Do not deduplicate historical migration files. |
| `.local/native-deps`, `.local/taxonomy-rehearsal`, `.local/question-bank-upgrade`, cleanup/diagnosis receipts, retention evidence, `.local/tests` | ACTIVE_REQUIRED / protected evidence | Native cache supports local startup; remaining paths contain cluster files, backup archives, provenance and manually invoked validation workflows. Documentation and guarded tools pin/report exact paths. Some contents are unreadable. | Keep. Never delete `.local` wholesale. No database inspection or restore attempted. |
| `docs/**`, content packs, import templates, curriculum manifests, database/auth/Admin/practice/exam code | ACTIVE_REQUIRED / historical documentation | Current code and documented manual workflows depend on these; history explains schema changes, grants, deletion scope, fingerprints and recovery. Older terminology does not prove safe deletion. | Protected. No historical document or content pack proposed for removal. |

## Maintenance findings outside deletion scope

- `scripts/post-merge.sh` invokes `pnpm --filter db push`, and `.replit` selects this hook. This conflicts with the repository rule requiring versioned migrations; the workspace package is also named `@workspace/db`. Flag for a separately reviewed operational fix. The hook was not run or changed.
- `README.md` ends with npm installation/start instructions despite pnpm enforcement, and its opening is historical Clerk setup instructions. `docs/HANDOVER.md` / `docs/PROJECT-STATUS.md` contain earlier phase states. Preserve historical evidence; a separate documentation consolidation can make current startup/status easier to find.
- Official migrations and the unpromoted exam schema coexist intentionally. Removing proposed SQL or changing metadata to silence an old test would risk the migration safety workflow.
- No live deployment, PostgreSQL catalog, browser, running process or environment configuration was verified. A source audit cannot certify those external dependencies absent.

## Execution boundary and subsequent validation

**Nothing is approved for deletion by this report.** The exact proposed file allowlist and duplicate-retention proof are in `repository-cleanup-proposed-deletions.json`. It contains individual file paths, byte lengths and raw SHA-256 values, not a wildcard or recursive-delete command. No parent directory, database/cache, dependency tree, `.bak` file, lockfile, screenshot or user change is implicitly included.

After explicit approval: recheck branch/HEAD, unchanged candidate hashes, retained duplicate counterparts, current references and Git state. Stop on any changed/missing/ambiguous entry. Remove only approved individual files; do not expand to parent directories. Re-run the same offline checks, compare the three baseline failures, check for missing assets/references and inspect Git diff. A new failure requires investigation; an old failure must not be presented as passing. Database/runtime verification remains separate and unauthorized in this audit.

The audit creates this report and its two JSON evidence files. Baseline verification additionally generated an isolated compile output and test scratch artifacts; it did not modify application source, credentials, services or database data. No commit or push was made.

Final offline validation: all 46 proposed paths exist and match their pinned raw hashes and lengths; all 45 duplicate build files have identical retained counterparts outside the deletion list. The allowlist has no duplicate, absolute or parent-traversal paths and remains unapproved/inert. `migrationManifest(process.cwd())` validates the 12 official migration source hashes/metadata without a database connection. `git diff --check` passes with existing LF/CRLF policy warnings. Final branch/HEAD are unchanged; Git reports the original 389 changed/untracked entries plus exactly the three new audit files (392 entries total).

<!-- GENERATED AUDIT TABLES -->

## Exact proposed duplicate-copy removals

Each row represents five individual files enumerated in the JSON allowlist. Retained counterparts match every relative filename and raw file hash. No directory deletion is proposed.

| Duplicate output directory | Files | Bytes | Retained identical counterpart |
| --- | ---: | ---: | --- |
| `.local/admin-ui-production-build/1791899692234` | 5 | 581,247 | `.local/admin-ui-production-build/1791899242513` |
| `.local/admin-ui-production-build/1791904684565` | 5 | 581,247 | `.local/admin-ui-production-build/1791899242513` |
| `.local/admin-ui-production-build/1791910872322` | 5 | 583,090 | `.local/admin-ui-production-build/1791960784094` |
| `.local/admin-ui-production-build/1791911689242` | 5 | 583,090 | `.local/admin-ui-production-build/1791960784094` |
| `.local/admin-ui-production-build/1791960529194` | 5 | 583,090 | `.local/admin-ui-production-build/1791960784094` |
| `.local/admin-ui-production-build/1791963740291` | 5 | 583,090 | `.local/admin-ui-production-build/1791960784094` |
| `.local/admin-ui-production-build/1792042367664` | 5 | 905,376 | `.local/admin-ui-production-build/1792042820144` |
| `.local/admin-ui-production-build/1792231435945` | 5 | 1,030,732 | `.local/admin-ui-production-build/1792231352656` |
| `.local/admin-ui-production-build/1792262532062` | 5 | 1,020,425 | `.local/admin-ui-production-build/1792244487395` |

In addition, propose only `artifacts/ccna-learning/src/pages/exam-simulator.css` (14,919 bytes). Combined proposed scope: **46 files / 6,466,306 bytes / 6.17 MiB logical savings**. Nothing has been removed.

## Source inventory totals

| Classification | Files | Logical bytes |
| --- | ---: | ---: |
| UNCERTAIN_KEEP | 70 | 1,325,669 |
| ACTIVE_REQUIRED | 721 | 5,394,390 |
| GENERATED_RECREATABLE | 182 | 11,760,088 |
| SAFE_TO_REMOVE | 1 | 14,919 |
| OBSOLETE_BUT_REVIEW_REQUIRED | 12 | 262,500 |

These mutually exclusive counts cover the 986-file source/config/generated inventory outside `.local`, installed dependencies and `.git`, excluding this report and companion evidence. They are retention classifications, not a claim that all ACTIVE_REQUIRED code executes in every deployment. The additional `.local` build inventory contains **155 generated files / 31 directories / 24,589,150 bytes**; it includes this audit's retained compilation output. At least **410 source/config files** fall in the explicit protected subset defined in the inventory. Protected inaccessible backups and cluster/dependency files are additional; a full protected-file count is unavailable.

## Distinct operational backup copies: preserve for review

| Exact file | Bytes |
| --- | ---: |
| `tools/phase6a-local/05-grant-runtime.sql.before-phase7a.bak` | 2,933 |
| `tools/phase6a-local/invoke.ps1.before-diagnostics.bak` | 3,278 |
| `tools/phase6a-local/invoke.ps1.before-esbuild-fix.bak` | 3,445 |
| `tools/phase6a-local/invoke.ps1.before-stderr-capture.bak` | 3,353 |
| `tools/phase6a-local/invoke.ps1.before-unification.bak` | 3,278 |
| `tools/phase6a-local/policy.mjs.before-unification.bak` | 10,011 |
| `tools/phase6a-local/policy.test.mjs.before-unification.bak` | 10,856 |
| `tools/phase6a-local/run.mjs.before-esbuild-fix.bak` | 10,507 |
| `tools/phase6a-local/verify-service.ps1.before-path-fix.bak` | 1,812 |

## Companion evidence

- [Complete source and candidate inventory](repository-cleanup-inventory.json): exact source paths/sizes, classifications, all build file hashes, references and limitations.
- [Exact proposed deletion allowlist](repository-cleanup-proposed-deletions.json): 46 individual paths with raw hashes and retained duplicate locations. `approved` is false. This is inert data, not a cleanup script.
