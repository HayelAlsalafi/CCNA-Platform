# Root configuration necessity audit

Date: 2026-10-26. **AUDIT ONLY. No file deletion or configuration changes.**

Workspace: `<repository-root>`; branch `main`; HEAD `3c07b4bb7fe807e60dcbcd5539c046b919a9956f`.

## Findings and counting rules

All **22 root-level regular files**, including the hidden `.git` worktree pointer, were read. Both lockfiles were read in full and parsed, rather than assessed from their names. Actual secret files were not read. The additional `.lovable/project.json` was inspected as supporting evidence; it is not a root-level file and is not included in the 22-file totals.

| Classification | Files |
| --- | ---: |
| ESSENTIAL | 10 |
| OPTIONAL_USEFUL | 4 |
| LEGACY_UNUSED | 1 |
| REDUNDANT | 0 |
| UNCERTAIN | 7 |
| Total | 22 |

**One low-risk removal candidate:** `eslint.config.js` (1,290 bytes), unused by the declared/current repository workflows. **Seven files need an external-integration or tooling decision**, rather than removal based on their lack of local imports. Four optional files are useful tooling/documentation choices, not application requirements. The ten essentials support maintained repository/build/security/agent workflows; they are not ten files that a deployed HTTP request reads.

Evidence does **not** establish that Replit or Lovable is currently active, or retired. Their checked-in declarations and historical mentions establish possible consumers, not current execution. No hosting account, browser, live service or database was contacted. Keep the seven uncertain files until their external-use question is resolved. Do not interpret this report as a new deletion approval.

## Complete root-file table

“Keep” for optional files is a recommendation, not a claim that the application would fail without them. Evidence identifiers refer to the execution traces below.

| File | Purpose | Actual consumer | Evidence | Classification | Delete or Keep | Risk / concrete deletion consequence |
| --- | --- | --- | --- | --- | --- | --- |
| `.env.example` | Human-readable placeholder configuration template | Developers setting up environment; API startup error points humans here, but does not load it | `artifacts/api-server/src/lib/env.ts:44`; API dev script loads `../../.env`, not this file. E1/E10 | OPTIONAL_USEFUL | Keep as an optional setup aid | Low runtime risk: no running component breaks. Setup guidance disappears. It is incomplete for guarded startup and includes older/default values; copying it is not production provisioning. |
| `.git` | Git worktree metadata pointer | Git commands in this workspace | File contains a `gitdir:` pointer, not application code; branch/status commands work through it. Pointer target was not manually traversed | ESSENTIAL | Keep | High repository risk: Git would stop recognizing this worktree, or discover an unintended parent repository. Application binaries themselves do not read it. |
| `.gitattributes` | Exact newline treatment for reviewed SQL/metadata and canonical data | Git checkout/add normalization; protects byte-pinned migration workflows indirectly | E4: `git check-attr` confirms 0004 LF, 0007 CRLF, proposed 0012 LF. SQL raw hashes are checked by `tools/phase6a-local/policy.mjs` and `tools/exam-policy.mjs` | ESSENTIAL | Keep | High safety risk: current execution might continue, but future checkouts/staging can change migration bytes and fail strict ledger/source-hash verification. |
| `.gitignore` | Repository exclusion policy | Git discovery/add; not an application loader | E4 confirms `.local`, artifact dist and environment paths match actual rules | ESSENTIAL | Keep | High safety risk: build output, dependencies, backups and local credentials become eligible for accidental staging. Existing tracked files are not protected by ignore rules. |
| `.npmrc` | pnpm install/peer resolution policy | pnpm invoked at the workspace root | `auto-install-peers=false`, `strict-peer-dependencies=false`; E3 compares the partial duplicate in workspace YAML | ESSENTIAL | Keep | Medium reproducibility risk: removing it changes strict-peer policy. Automatic peer installation remains disabled by workspace YAML, so not every setting is unique. No install was run to claim that deletion necessarily causes an install failure. |
| `.prettierignore` | Exclude generated outputs/lockfiles from intentional formatting | Installed Prettier CLI/API when that ignore path is used | E5 read-only `getFileInfo` reports `pnpm-lock.yaml` ignored. Includes lockfiles and `routeTree.gen.ts`; there is no format CI step | OPTIONAL_USEFUL | Keep unless formatting workflow is intentionally retired | No runtime/build break. Formatting scope changes if someone invokes project-wide Prettier; potentially large generated/lockfile diffs. No formatter was run. |
| `.prettierrc` | Formatting choices: width 100, semicolons, double quotes, trailing commas | Installed Prettier resolver; optional manual/editor formatting; old isolated Orval preview explicitly selects it indirectly | E5 resolves this exact file from learning `App.tsx`; `.local/tests/phase6a3/preview.config.ts:31,57` selects `formatter: "prettier"`; installed Orval resolver is conditional | OPTIONAL_USEFUL | Keep unless formatting convention is intentionally retired | No runtime break; future formatting changes when config disappears. Current committed Orval configs do not explicitly select a formatter, so codegen formatting must not be claimed as an unconditional consumer. |
| `.replit` | Replit workspace/deployment/agent/post-merge declarations | Replit external control plane if this checkout is still imported there; no local pnpm/CI loader found | E6: Node 20 modules, autoscale router, `pnpm store prune` post-build, `scripts/post-merge.sh` hook. Local commands and GitHub CI do not read this file | UNCERTAIN | Keep pending Replit retirement decision | No identified local break. If externally active, workspace provisioning, deployment and hook selection change. Existing Node 20 declaration conflicts with root Node >=22. |
| `.replitignore` | Replit deployment packaging exclusion | Replit publisher if in use; not Git, pnpm or Vite | Only effective entry is `.local`; E6 distinguishes this from `.gitignore` | UNCERTAIN | Keep pending Replit retirement decision | No local break. Removing it may allow local clusters/backups/native cache into an external publication; Git ignore is not proof that a publisher excludes those paths. |
| `AGENTS.md` | Repository-specific agent architecture and safety instructions | Codex: supplied in this session and explicitly read | Active instructions cover pnpm, database-role authority, Clerk, migrations, secret-safe startup and Lovable history rules | ESSENTIAL | Keep | Agent workflow loses repository constraints. Not required for runtime, production build, or tests. Historical Lovable wording is not proof of hosting activity. |
| `bun.lock` | Alternative Bun dependency resolution snapshot | Bun installer if invoked externally; no current local/CI installer consumes it | E2/E7: JSONC version 1, nine workspace records, 539 packages; five manifest declarations missing; pnpm uses its own lock. `.bun` store absent | UNCERTAIN | Keep pending Lovable/Bun automation decision | No identified pnpm/build/runtime break. An external Bun install might regenerate or resolve differently. It is stale relative to current manifests and must not replace `pnpm-lock.yaml`. |
| `bunfig.toml` | Bun install settings, release-age policy and four Lovable package exclusions | Bun installer if invoked; pnpm does not use this file | E7: `[install]`, `saveTextLockfile=true`, `minimumReleaseAge=86400`, Lovable exclusions. No Bun command in current scripts/CI; full lockfiles lack the root Lovable Vite-config dependency | UNCERTAIN | Keep pending Lovable/Bun automation decision | No local pnpm break. An external Bun installer would lose these policies/settings. A stale lockfile does not prove its installer is retired. |
| `components.json` | Root shadcn generation destination/style conventions | Root shadcn CLI or external component authoring tool if used; no runtime or build loader | E8: `tailwind.css=src/styles.css`, slate, root aliases. Learning artifact has its own different `components.json`; shadcn CLI is not installed/declared | UNCERTAIN | Keep pending root-template authoring decision | No identified local app break. Root component generation may lose configuration or choose the wrong destinations if externally invoked. Not a duplicate of the artifact config. |
| `eslint.config.js` | Old TanStack/Lovable ESLint flat config with Prettier integration | No executing consumer in the declared repository workflows | E9: no lint script in any of nine manifests; CI has no lint step; ESLint and all six imported config dependencies cannot resolve; neither full lockfile declares ESLint packages | LEGACY_UNUSED | **Propose removal after approval** | Low for current workflows: no application, build, test or pnpm step depends on it. Removes the unused lint convention. If there is an undocumented custom external lint job, retain it until that job is reviewed; none is established by repository evidence. |
| `package.json` | Root package identity, scripts, package-manager/engine selection and dev dependencies | pnpm/Corepack-compatible tooling; developer commands; CI starts root typecheck; recursive build/dev entry points | E1/E2: `packageManager=pnpm@10.28.0`, Node >=22, root scripts, TypeScript and Prettier dependencies, preinstall manager check | ESSENTIAL | Keep | High: loses root scripts/install guard/dependency declaration/package-manager selection. Duplicate catalog/override sections inside it do not make the entire file redundant. |
| `pnpm-lock.yaml` | Authoritative deterministic dependency graph | `pnpm install --frozen-lockfile`; GitHub Actions pnpm cache | E2: v9, nine importers, 562 packages and snapshots, 82 overrides. CI explicitly consumes frozen lockfile and cache | ESSENTIAL | Keep | High: fresh installs lose reviewed resolutions; CI frozen installation/cache discovery can fail. Existing installed bundles do not read it on each request. |
| `pnpm-workspace.yaml` | pnpm package discovery, catalogs, overrides and supply-chain/build-script policy | pnpm workspace install/filter/recursive commands | E3: four workspace patterns, catalog values, 82 overrides, `minimumReleaseAge=1440`, exclusions, `onlyBuiltDependencies`, `autoInstallPeers=false` | ESSENTIAL | Keep | High: workspace selection, `workspace:*` links, `catalog:` specs and installation policies cease to have their declared configuration. Root `workspaces` field is not evidence of equivalent pnpm YAML behavior. |
| `README.md` | Human-facing project entry point containing historical Clerk task and Lovable/local instructions | Humans reading the repository; no execution consumer | E10: old Clerk request, Lovable editor link, then `npm i` / `npm run dev`; root preinstall explicitly rejects npm | OPTIONAL_USEFUL | Keep as documentation; revise separately if desired | No runtime/build/test break. Useful entry point is currently misleading; keeping its current wording is not required. Delete only as a deliberate documentation decision, not to fix a program. |
| `replit.md` | Old foundation-phase architecture/run notes and Replit agent memory | Possible external Replit agent/human context; no local app/CI loader | E6/E10: claims questions/auth are not implemented, recommends DB push and fictional seed, calls esbuild CJS; these contradict current source | UNCERTAIN | Keep pending Replit agent-use decision | Content is demonstrably obsolete, but external context consumption is unknown. Deletion would not affect identified local commands; could remove external agent context. Do not follow these outdated operational instructions. |
| `tsconfig.base.json` | Shared TypeScript semantics and workspace condition | All eight package/compiler-config consumers plus root tsconfig and offline checker | E11: eight extending package/codegen configs; `tools/check-admin.mjs:42` explicitly reads it | ESSENTIAL | Keep | High: extends/read calls fail; strictness/module resolution/compiler target configuration disappears. Affects build/typecheck, not already-built HTTP execution. |
| `tsconfig.json` | Root TypeScript solution graph | `tsc --build` from root `typecheck:libs`; CI calls root `typecheck` | E11: references DB, API client and API Zod; extends base. Offline `check-admin.mjs` constructs its own program, so its previous pass alone is not proof this solution file is unused | ESSENTIAL | Keep | High for standard commands: root solution build/typecheck loses its explicit project graph. |
| `vite.config.ts` | Root Lovable/TanStack/Nitro configuration | Root Vite invocation or external Lovable build if selected; no current primary-app/CI loader | E1/E8: `@lovable.dev/vite-tanstack-config` import cannot resolve locally; server entry is `server`; artifact scripts use their own config; guarded startup/build set `configFile:false` | UNCERTAIN | Keep pending root Lovable-template retirement decision | No identified current primary-app break. Root-template/hosting build would lose its plugin/SSR configuration if it is externally supplied/used. Not interchangeable with artifact Vite config. |

## Execution evidence, not merely textual references

### E1 — What the actual commands load

- Root `package.json` → `tools/dev.mjs` → pnpm commands in API and learning workspace packages. Learning package `dev/build/serve` explicitly uses its own `vite.config.ts` with package working directory.
- `tools/phase6a-local/run.mjs:200` creates Vite with `configFile:false, envDir:false`, artifact root and programmatic React/Tailwind plugins. It does not import root or artifact Vite config.
- `tools/build-admin-ui.mjs:48` likewise sets `configFile:false`; it uses the artifact root and creates an isolated `.local` bundle. This was the previous successful production frontend build, not a root TanStack build.
- API `src/index.ts` validates required environment and loads `app.ts`. API build is `artifacts/api-server/build.mjs`, not Vite. The API dev command may load root `.env`; no script loads `.env.example` as configuration.
- `.github/workflows/ci.yml` installs frozen pnpm, runs root typecheck, package tests and API/artifact web builds. It has **no ESLint, Bun, formatting, root Vite or shadcn step**. Its existence alone does not establish an actual recent external CI run.
- Frontend/API Vitest configurations are package-specific; API config explicitly avoids repository-root Vite discovery. No tests were executed for this audit.

### E2 — Fully inspected manifests and lockfiles

`pnpm-lock.yaml` was parsed as YAML: format 9.0, nine importers (root + eight packages), 562 package entries / 562 snapshots, 82 overrides, `autoInstallPeers:false`. Its importer paths match current workspace packages. `bun.lock` was parsed as JSONC using installed TypeScript: version 1 / configVersion 1, nine workspace entries, 539 package entries.

The Bun workspace snapshot omits these current manifest declarations:

| Workspace | Group | Missing declaration |
| --- | --- | --- |
| `artifacts/api-server` | dependencies | `zod: catalog:` |
| `artifacts/api-server` | devDependencies | `@types/pg: ^8.23.1` |
| `artifacts/api-server` | devDependencies | `pg: ^8.23.0` |
| `artifacts/ccna-learning` | devDependencies | `jsdom: 26.1.0` |
| `artifacts/ccna-learning` | devDependencies | `vitest: ^3.2.7` |

This proves snapshot drift, not necessarily an inability of a non-frozen Bun install to refresh itself. Bun registry tarball URLs refer to a Lovable sandbox package cache; that is historical provenance, not current execution evidence. No install was run. `tools/preinstall.mjs` checks `npm_config_user_agent` for `pnpm/` and rejects a different manager. Historical reports that the sandbox runs Bun are therefore not a supported local install workflow.

### E3 — Partial duplication does not justify whole-file removal

Parsed root `package.json` `workspaces.packages`, `workspaces.catalog`, and `overrides` are byte-value equivalent to their respective parsed workspace YAML values. These are duplicate **sections**, not duplicate files. pnpm's active workspace YAML also has install policy not present in root JSON: release-age settings, exceptions and allowed build scripts. Root JSON retains scripts/dependencies/engines/package-manager selection. No file is classified REDUNDANT.

`.npmrc` duplicates the `autoInstallPeers:false` setting in YAML; `strict-peer-dependencies=false` is not duplicated there. Removing the whole `.npmrc` would change declared peer-validation policy. A local install compatibility failure was not simulated or asserted.

### E4 — Implicit Git consumers were inspected directly

Read-only `git check-attr text eol` confirms:

- `lib/db/drizzle/0004_question_revisions.sql`: text, LF.
- `lib/db/drizzle/0007_nexus_sessions.sql`: text, CRLF.
- `lib/db/drizzle/proposed/0012_exam_simulator.sql`: text, LF.

Read-only `git check-ignore -v --no-index` identifies `.gitignore` as the controlling rule for `.local/native-deps/package.json`, learning `dist/public/index.html`, `.env` and `.env.local`. These are real implicit tool consumers despite no source import. Only path strings were checked; secret files were not opened.

### E5 — Formatting is optional but not fictitious

Prettier 3.9.6 is a declared root dev dependency and resolves from the installed pnpm tree. A read-only Prettier `resolveConfigFile` / `resolveConfig` call for learning `App.tsx` selected the root `.prettierrc` and returned its exact four options. `getFileInfo` with `.prettierignore` reported the pnpm lockfile ignored. These introspections perform no formatting or file write.

No root/package format script or CI formatting step exists. Current committed `lib/api-spec/orval*.config.ts` files do not select `formatter` or `prettier`; do not repeat historical claims that formatting is always part of current codegen. Installed Orval 8.30.0 `dist/config-BF1guadq.mjs:3195` only creates the Prettier transform when explicitly selected, and its `createPrettierFileTransform` calls `prettier.resolveConfig(filePath)`. The accessible historical preview config selects Prettier at lines 31 and 57. It was inspected as an operational dependency, not executed.

### E6 — Replit: configured capability versus active use

`.replit` is not needed by the current local pnpm commands, guarded launcher, TypeScript solution, CI build or deployed application request path. Neither is `.replitignore` or `replit.md`. The former files are external Replit contracts; the latter can be external agent context. **No evidence retrieved here establishes that an active Replit project consumes them now.**

Per-artifact `.replit-artifact/artifact.toml` files independently declare API/web/mockup service commands. They make the imported Replit topology concrete, but are not root-file consumers and do not prove the cloud services are active. The web manifest specifies port 18553/static `dist/public`; API specifies port 8080 and `dist/index.mjs`. Current local guarded workflow instead uses API 3000/web 8080.

`.replit` declares Node 20 while current package engines/CI require >=22 / use 22.22.2. Its post-merge target executes `pnpm install --frozen-lockfile` and `pnpm --filter db push` in `scripts/post-merge.sh`; that conflicts with the current versioned-migrations-only rule and uses a package filter unlike `@workspace/db`. Do not run the hook to test it. These defects demonstrate stale configuration, not proof that external use is absent.

The Replit Vite overlay is still statically imported by artifact Vite configs; cartographer/banner are dynamically selected when `REPL_ID` is present. Removing `.replit` does not remove those packages or imports. Separately deciding to retire Replit should not silently change application dependencies or security behavior.

**Decision required:** is Replit publishing, workspace provisioning or Replit Agent context still used? If all are explicitly retired, these three root files become a candidate group: `.replit`, `.replitignore`, `replit.md` (3,512 bytes). Do not remove them while that question is unresolved, especially the packaging exclusion.

### E7 — Bun: unnecessary to pnpm, external installer unresolved

pnpm does not consume Bun lock/config files. Current scripts and CI contain no Bun execution, the installed `.bun` store is absent, and the Bun snapshot is stale as listed above. Root `bunfig.toml` has a Bun install release-age setting and exceptions for four `@lovable.dev/*` packages; those root-template packages are absent from the current declared workspace dependency graphs inspected here.

Thus **neither Bun file is necessary for current pnpm development, testing or production builds**. Their retention is solely because an external sandbox's installer is not verified retired, not because AGENTS/HANDOVER mentions Bun. A future Bun regeneration might be expected in such a sandbox; only a hosting decision resolves that consumer. No Bun command or package registry request was made.

**Decision required:** does any active Lovable/sandbox workflow still invoke Bun and consume these files? If explicitly not, propose both `bun.lock` and `bunfig.toml` (200,693 bytes). Until then, keep both; they are not alternative authority for dependencies.

### E8 — Lovable/root-template separation

The root `vite.config.ts` imports `@lovable.dev/vite-tanstack-config` and selects the `server` entry under TanStack Start. That package and `@tanstack/react-start` do not resolve from this installation, and are absent from current root manifest declarations. Root `src/routes/index.tsx` remains a placeholder. `.lovable/project.json` identifies a `tanstack_start_ts_current` template/revision; it does **not** itself prove an active deployment or list an active project connection. README's editor link and AGENTS' sync warning likewise do not prove a current cloud build.

Root `build:dev` explicitly builds the **artifact** and copies its output to root `dist`. It does not use root `vite.config.ts` or root `components.json`. That command can support a static preview even when the separate TanStack template is not built.

Root `components.json` targets `src/styles.css`, slate and root aliases. Learning `artifacts/ccna-learning/components.json` targets its own `src/index.css` and neutral theme. They are different CLI instructions, not functional duplicates. Existing UI components do not read these JSON files when rendering. No shadcn CLI dependency or invocation is declared, but external authoring cannot be inferred absent.

**Decision required:** does Lovable still execute/author the separate root TanStack template, or only serve the artifact's copied static dist? If only the artifact is used and root shadcn authoring is retired, root `vite.config.ts` and `components.json` become a candidate pair (1,300 bytes). This decision does not authorize deleting root source, `.lovable`, assets, or unrelated files. `.lovable/project.json` remains untouched and outside the root-file deletion proposal.

### E9 — Why ESLint is the concrete removal candidate

All nine manifests were parsed, all declared package scripts examined, and the only `.github` workflow read. None invokes lint/ESLint. No installed root resolution exists for `eslint`, `@eslint/js`, `eslint-plugin-prettier/recommended`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, or `typescript-eslint`. ESLint packages are also absent from both fully parsed lockfiles. Config-specific `server-only` guidance targets the separate TanStack template rather than the current Wouter app.

Source `eslint-disable` comments are annotations, not executable invocations of this config. Searching 191 accessible local script sources found only a comment in compiled Wouter, not a lint runner. The current production/TypeScript paths do not select ESLint. This supports LEGACY_UNUSED for current workflows. It does not certify the absence of a private external lint job; if the owner knows of one, its config requirements take precedence over this proposal.

### E10 — Documentation and templates are not loaders

`.env.example` is a placeholder template, not an auto-loaded env file. The API requires environment values but does not require this template to exist. Its generic database, CORS and planned storage examples are not a complete description of the guarded workstation setup. No credentials were retrieved.

README is a historical Clerk task followed by Lovable boilerplate and npm instructions; the npm install instruction conflicts with the active pnpm-only preinstall. It is not a correct current runbook. `replit.md` goes further: claims auth/question history are absent, recommends `db push`, and calls the bundle CJS; current API source has Clerk, questions/revisions/attempts, and esbuild sets ESM. These contradictions are demonstrated by source, not by age alone. Neither file is required to run the application. README is retained as an optional human entry point; Replit's possible special agent-context consumer keeps `replit.md` uncertain rather than declaring it globally unused.

### E11 — TypeScript has two different entry paths

The standard root command executes `tsc --build`, which selects root `tsconfig.json` and its DB/client/Zod references, followed by artifact/scripts typechecks. Eight package/codegen configs extend `tsconfig.base.json`: API, learning app, mockup sandbox, DB, API client, API Zod, scripts, and API-spec codegen. The root solution extends it too.

`tools/check-admin.mjs` explicitly reads the base config and constructs its own compiler program. Its successful baseline does not exercise the root solution in exactly the same way as root CI typechecking. Deleting root `tsconfig.json` because the isolated checker does not use it would therefore break a distinct maintained workflow.

## Necessity by workflow

Legend: **Yes** = maintained workflow consumer; **Opt** = optional human/manual tooling; **Ext?** = only an unverified external consumer; **Indirect** = protects the workflow without being a runtime import; **No** = no identified consumer. Production means already-built application request execution; build/deployment are separate columns. Codex use means agent instructions or human context, not that every config is imported by Codex.

| Root file | Local development | Production runtime | Build/deployment | Testing/typecheck | Codex |
| --- | --- | --- | --- | --- | --- |
| `.env.example` | Opt | No | Opt setup guide | No | Opt context |
| `.git` | Yes, Git | No | Indirect source workflow | No | Yes, repository operations |
| `.gitattributes` | Indirect | No | Indirect byte integrity | Indirect | Indirect |
| `.gitignore` | Indirect | No | Indirect source safety | No | Indirect source safety |
| `.npmrc` | Yes, installation policy | No | Yes at pnpm install | Indirect installation | No special consumer |
| `.prettierignore` | Opt | No | No | No | Opt formatting |
| `.prettierrc` | Opt | No | No | Historical preview opt-in only | Opt formatting |
| `.replit` | Ext? | No | Ext? | No | No local; external agent settings possible |
| `.replitignore` | No | No | Ext? packaging | No | No |
| `AGENTS.md` | Yes, agent workflow | No | No | No | Yes |
| `bun.lock` | No for pnpm; Ext? | No | Ext? installer | No for declared suites | No special consumer |
| `bunfig.toml` | No for pnpm; Ext? | No | Ext? installer | No for declared suites | No special consumer |
| `components.json` | Ext?/manual root CLI | No | No current build consumer | No | External authoring possible |
| `eslint.config.js` | No declared consumer | No | No declared consumer | No declared consumer | No declared consumer |
| `package.json` | Yes | Not in already-built request handling | Yes, install/commands | Yes | Command discovery |
| `pnpm-lock.yaml` | Yes, installs | No | Yes, frozen install/cache | Indirect installation | No special consumer |
| `pnpm-workspace.yaml` | Yes | No | Yes | Yes, package selection | Command discovery |
| `README.md` | Opt | No | No | No | Opt human context |
| `replit.md` | No local loader; Ext? | No | No current consumer | No | No local convention established; Replit agent Ext? |
| `tsconfig.base.json` | Yes | No | Yes | Yes | No special consumer |
| `tsconfig.json` | Yes, standard typecheck | No | Yes, root typecheck gate | Yes | No special consumer |
| `vite.config.ts` | No primary-app consumer; Ext? | No | Ext? root template | No current suite consumer | External authoring possible |

## Proposed deletion list and decisions

**Final proposal for approval: `eslint.config.js` only — 1 file / 1,290 bytes.** No deletion command has been run. Other files are not covered by an approval of this single-file list.

Reviewed raw SHA-256: `8dc219908ac50e457ad084979ce5396fe288343a856f6b6be9f56d175baf4825`.

Seven files remain decision-gated in three independent groups:

1. Replit fully retired: `.replit`, `.replitignore`, `replit.md`.
2. External Bun installer retired: `bun.lock`, `bunfig.toml`.
3. Root Lovable/TanStack/shadcn template unused: `vite.config.ts`, `components.json`.

These conditional groups total 205,505 bytes, but **are not in the current final deletion list**. There is no need to retire all integrations as a bundle. Optional formatting/template/README files can also be retired by an intentional workflow choice, not by claiming current runtime depends on them.

## Verification and limits

Reused the previous cleanup's successful baseline: `node tools/check-admin.mjs` PASS and `node tools/build-admin-ui.mjs` PASS (1,952 modules, five output files byte-identical to the pre-cleanup build; only existing sourcemap/chunk warnings). Neither was rerun for this read-only audit. Application tests, offline safety tests and the three known baseline failures were neither executed nor debugged.

New actions were limited to file reading/parsing, reference tracing, read-only module resolution, Prettier configuration introspection and Git metadata/attribute/ignore queries. No formatter, linter, build, package install, code generator, database operation or live-service check ran. Twenty-five protected evidence directories remain unreadable; no permissions were changed. This limits claims about private ad-hoc scripts but does not turn documentation mentions into runtime dependencies.

Final read-only checks confirmed all 22 root-file hashes unchanged, exactly 22 rows with one classification each, zero ESLint package entries in either lockfile, and this document as the only addition to the pre-existing Git status. Only this new audit document is created. Root files, application code, previous audit/cleanup receipts, user work, migration history and data remain untouched. No commits or pushes.
