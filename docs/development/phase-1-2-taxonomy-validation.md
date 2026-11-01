# Phase 1.2 — Taxonomy foundation validation

Date: 2026-10-12 (Asia/Riyadh). Source baseline: `main`, `03b14526aae448e49eacd602a43bfb0e355aca4d`.

## Scope and workspace verification

Before editing, all mandatory checks passed: workspace `<repository-root>`, branch `main`, expected HEAD prefix `03b1452`, and existing `lib/db/src/schema/exam-blueprints.ts`.

Existing changes included `pnpm-lock.yaml`, draft taxonomy/audit/planning documents, the draft taxonomy schema and local launcher files. The authorized taxonomy drafts were extended; unrelated existing work was preserved. Neither excluded project directory was accessed. No environment/secret file, database configuration value or database connection was read.

## Files changed

Modified existing files:

- `lib/db/src/schema/exam-blueprints.ts`: extend the four draft taxonomy tables with version/status/source metadata, validated code/binding constraints, RESTRICT foreign keys and lookup/primary indexes.
- `lib/db/src/schema/index.ts`: export taxonomy tables, pure validators and the read-only reference inventory.
- `docs/development/ccna-taxonomy-v1.md`: update the design proposal with implemented source architecture, compatibility, catalog verification scope and migration approval boundary.

Created feature files:

- `lib/db/src/schema/exam-taxonomy-validation.ts`: pure strict domain/classification validators.
- `lib/db/src/schema/ccna-200-301-v1-1.ts`: six weighted domains, 53 objective codes and 58 subobjective codes, with provenance and pending full-description review.
- `lib/db/drizzle/proposed/0005_exam_taxonomy.sql`: additive SQL proposal, deliberately unjournaled and unapplied.
- `artifacts/api-server/src/lib/exam-taxonomy.validation.test.ts`: 39 taxonomy and legacy-contract unit cases.
- `artifacts/api-server/src/lib/exam-taxonomy.schema.test.ts`: 7 static schema/migration consistency cases.
- This validation report.

An ignored local validation helper was also created at `.local/tests/phase1-2-taxonomy/typecheck.cjs`; it compiles installed source in memory with no output or database access. No existing local launcher was modified.

## Executed checks and results

| Check | Actual result |
| --- | --- |
| New taxonomy validation tests | PASS — 39 tests |
| New static schema/migration tests | PASS — 7 tests; rerun after correcting a test typing error also passed |
| Existing `questions.validation.test.ts` | PASS — 11 tests |
| Existing `practice.test.ts` | PASS — 13 tests |
| Existing `practice-history-details.test.ts` | PASS — 8 tests |
| Existing `routes/practice.test.ts` | PASS — 42 tests |
| Combined selected Vitest run | PASS — 6 files, 120 tests |
| No-emit source check: `lib/db` | PASS — 0 diagnostics with the local compiler helper |
| No-emit source check: `artifacts/api-server` | PASS — 0 diagnostics with the local compiler helper |
| Git whitespace/diff inspection | PASS — `git diff --check`; new feature files also checked for trailing whitespace |
| Existing unrelated work | PASS — SHA-256 checks on all 25 protected lockfile/document/launcher paths unchanged; old schemas, migrations and journal have no diff |
| PostgreSQL migration execution / integration tests | **NOT RUN** — outside authorization; no database connection |
| Full application build / live browser / real Clerk | **NOT RUN** — not needed to verify this source-only taxonomy foundation |

### Commands and toolchain limits

The standard `pnpm exec tsc` attempt failed because the checkout's root TypeScript package link is absent. Direct compiler invocation first reported missing Node type links and incompatible no-emit override flags, then unresolved `pg` declarations after those flags were corrected. These failed attempts are not reported as successful project checks.

The ignored helper uses the existing TypeScript 5.9.3 compiler, existing project configs and installed declarations, with `noEmit`, incremental/declaration output disabled, workspace source root, cached `@types` resolution and an explicit path to the installed `pg` declaration. It checks both projects' source, including the new tests, without creating build output or changing dependencies. Its first run caught one TypeScript error in the new static test's index-expression typing; after correction both projects passed. A normal `pnpm run typecheck` remains unverified until the dependency links are repaired in a separately authorized task.

The first direct Vitest attempt failed because the platform-specific esbuild package was not linked. The already installed workspace-local binary was supplied through `ESBUILD_BINARY_PATH`; the sandbox then denied esbuild directory access. The same selected database-free command succeeded after approval to run outside the sandbox. No package install, dependency upgrade or lockfile change was needed.

Successful Vitest command from `artifacts/api-server`, after supplying that local binary:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/exam-taxonomy.validation.test.ts src/lib/exam-taxonomy.schema.test.ts src/lib/questions.validation.test.ts src/lib/practice.test.ts src/lib/practice-history-details.test.ts src/routes/practice.test.ts
```

The corrected static test was rerun individually. The successful source check from the workspace root was:

```powershell
node .local/tests/phase1-2-taxonomy/typecheck.cjs
```

Database test files were never selected. The current default API Vitest config excludes integration tests but does not exclude every `*.db.test.ts`; a generic unfiltered test invocation was intentionally not used.

## Compatibility and remaining issues

- No existing topic/question/option/attempt/revision/delivery schema or API contract changed. Legacy questions have no inferred mapping, and taxonomy is optional for current practice. Blueprint activation is metadata only.
- No learner endpoints or DTOs were added; existing practice and history unit/HTTP tests passed. Live PostgreSQL and browser behavior are not proven by these tests.
- Composite FKs and the partial unique index express cross-blueprint binding and concurrent primary uniqueness. PostgreSQL execution, locking behavior and permissions still require a separately approved disposable-database rehearsal.
- The [Cisco v1.1 blueprint](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf) was verified for domain weights and its complete code inventory. Full official descriptions remain pending verification; no question coverage, editorial completeness or v2.0 support is claimed.
- Taxonomy mappings are current logical-question classifications. They are not revision snapshots or an audit trail. Future management must define version immutability and classification-change history before relying on historical coverage metrics.
- The migration remains under `proposed/`; the execution journal and existing snapshots are unchanged. Future promotion must produce reviewed journal/snapshot metadata before deployment or subsequent generation.
- Standard package-script type checking is limited by the existing incomplete dependency links, as explained above.

## Actions requiring separate approval and next phase

Approve migration promotion/journaling/snapshot preparation and disposable-database rehearsal separately. Actual database migration, catalog population, question classification and any deployment require separate approval; none occurred here. No seed, question creation, activation, publication, commit, push, branch or PR was performed.

Recommended next phase: ADMIN-only catalog/classification management with reviewed descriptions, transactional assignment replacement, explicit review attribution, authorization tests and an approved disposable PostgreSQL migration rehearsal. Preserve existing learner selection and answer projections. Import, publication and coverage analytics can follow after management semantics are established.
