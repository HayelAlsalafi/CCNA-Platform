# Historical test resolution — development commit review

> Latest verification: the final sequential run passed 481 frontend, 835 non-DB API and 17 relevant tooling checks, plus TypeScript/codegen. See [checkpoint stabilization](public-pilot-test-stabilization.md). Earlier failing runs and narrower verification scopes below are historical evidence, not current checkpoint blockers. Public Beta remains a separate NO-GO.

2026-11-03. **GO for committing the reviewed local development changes plus these test repairs, after owner authorization. Public Beta deployment remains NO-GO.** All seven documented failure cases are resolved locally; no production application, migration, schema, grant or data change was made in this follow-up. A complete CI/full-suite run was not requested or claimed.

| Previously failing case | Updated fixture/expectation and preserved safety intent |
| --- | --- |
| Taxonomy schema journal | Assert the original 0004 → 0005 positions and six-entry prefix, plus the complete ordered 17-entry journal ending at 0017. Exact historical SQL comparison retained |
| Study migration journal | Assert 0013 precedes 0014 at their exact positions, retain all additive-table/RLS/RESTRICT checks, and verify current journal ordering through 0017 |
| Import objective mapping | Reject retired objective/primary mappings explicitly with a retirement error and no draft; separately require accepted canonical chapter mapping, DISABLED status and no inferred objective assignments |
| Focus CSS | Read actual CSS through Node filesystem paths (avoiding Vite dynamic asset URL rewriting), parse existing top-level desktop rules with the already-installed PostCSS dependency, and apply the real cascade. All grid, focus-width, sidebar restoration and unsaved-note assertions retained; no synthetic production declarations |
| Save/Resume | Use the current Save Position and Resume Saved Position buttons and Progress tab. Retain payload/version, explicit completion and no-scroll-write assertions; add a fresh reader/QueryClient reload before Resume and clear the scroll spy before checking the exact call |
| Exam activation tooling | Create an OS-temp 0016 source fixture, loading its unmodified policy/activation module graph. Stage/promote only that copy, retain exact source pins, permission/ACL/index/constraint rejection, evidence/freshness gates and rollback assertions. Assert the real workspace remains at 0017 |
| Exam migration context | Run actual Drizzle statements against the recording fake client using the same historical source fixture; retain schema-resolution, public CREATE/USAGE, migrator/owner, ledger-schema and per-statement drift rejection checks |

The owner explicitly authorized tests to read `tools/canonical-chapters-original-approval.json` and `tools/canonical-chapters-plan.json` internally. Those two existing local source proofs are copied only into the OS-temp fixture, checked by the original pinned guards, never printed or included in Git. Other inputs are tracked source files. No `.local`, credentials or backup receipts are read. If the approved proofs are absent/drifted, these operator-tooling tests still fail closed; fresh-clone tooling readiness without those local inputs is not claimed.

The service-bundle test uses the installed esbuild via a test-only adapter instead of reading the historical `.local` native installation. It still executes the real service-fixture helper, inert DB shim and no-application-pool metafile assertion; production tooling/guards are unchanged.

## Focused verification

- Three affected API files: **48 passed**, zero failures/skips.
- Two affected frontend files: **11 passed**, zero failures/skips.
- Two affected Node tooling files: **13 passed**, zero failures/skips; positive and negative safety cases now execute past setup.
- **72 affected checks passed in total.** No assertions skipped, disabled or marked todo.
- Root `pnpm run typecheck`: **PASS**.
- `git diff --check`: **PASS**. Applied migrations/schema and protected manifests unchanged; Git index remains empty and HEAD remains `ac1744287c5310c06410b02f5f6be6ad63bba3b8`.

Only tests, a test-support helper and documentation were changed in this follow-up; all earlier local application changes are preserved. No new dependencies, browser/build rerun, database/storage connection, live SQL, backup/restore, service restart or Git staging/commit/push/tag. No genuine new application-production defect was demonstrated by these failures.

## Separate decisions

**Commit: GO for a documented development milestone.** Include the original reviewed 49-file set and the test/support/documentation repairs; the working-tree count is therefore larger than 49. This does not certify every historical suite or authorize Git operations.

**Public Beta: NO-GO unchanged.** Real Clerk/deployment configuration, browser acceptance, live read-only confirmation of the question bank and permissions, post-0017 recovery evidence and the separately approval-gated scope remain outside these offline tests. Previous production compilation/integration evidence remains in [integration verification](public-pilot-integration-verification.md).

Final local inventory: **55 changed/untracked files** (including the prior 49). No local source-proof files or test artifacts are in that inventory.
