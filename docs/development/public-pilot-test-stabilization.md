# Final checkpoint test stabilization

2026-11-03 (Asia/Riyadh). **GitHub checkpoint: GO for the reviewed development changes, subject to separate Git authorization. Public Beta deployment: NO-GO unchanged.** HEAD remains `ac1744287c5310c06410b02f5f6be6ad63bba3b8`; nothing staged, committed, pushed or tagged.

## Causes and corrections

| Failed case | Classification / exact cause | Correction preserving the assertions |
| --- | --- | --- |
| Frontend Study Hub sticky CSS | Outdated path: repo-relative CSS path evaluated from the frontend package CWD | Node file-URL directory plus filesystem path; all sticky/overflow/focus CSS checks retained |
| Frontend topic bulk selection across pages | Async timing: immediate lookup of page 2 checkbox before query response/render settled | Bounded `vi.waitFor` for the exact next-page UUID before the existing click. Exact IDs, versions, explicit confirmation and selection clearing still asserted |
| Frontend delayed Admin A save error | Fixture classification: the write counter counted the read-only readiness POST as a persistence write | Exclude only the exact readiness endpoint from persistence count. Existing strict single-write, session header, no stale requests/cache/error feedback assertions retained |
| Frontend Admin identity transition timeout | Test environment contention: unrestricted workers plus simultaneous full API/frontend/build work exceeded the unchanged deadline | Cap Vitest files to two workers; final suites execute sequentially with no build competition. Test body and assertions unchanged |
| Frontend yearly keyboard navigation timeout | Same CPU/memory contention; no deterministic calendar defect demonstrated | Same resource budget; full calendar and keyboard/year-navigation assertions remain unchanged. No timeout increased |
| API lesson proposal test | Outdated filesystem path, then obsolete assumption that 0013 is the newest journal entry | Source-relative URL; assert exact 0013/0014 positions and the current complete ordered chain ending at 0017. SQL equality, additive behavior, immutable trigger and publication ownership FK checks retained |
| API Nexus proposal test | Outdated filesystem path to 0007 | Source-relative URL; terminal timestamps, historical binding restrictions, error constraint and forbidden destructive operations checks unchanged |
| Actual-app integration startup/cleanup | Lifecycle issue: full app graph imported inside a 10-second server hook; failed startup left server undefined and teardown called close anyway | Collect the actual app module after hoisted non-secret fixture environment setup. Hook only binds/awaits the owned ephemeral server, handles listen errors, and closes only a started fixture. Environment always restored. Startup failures still fail the suite; no catch-to-pass or deadline extension |

No genuine new application-production defect was established. This pass changed test fixtures/lifecycle/configuration and documentation only, retaining all earlier application changes. Database/storage boundaries remain mocked. No live service or real record was accessed.

## Files touched in this stabilization pass

- `artifacts/api-server/src/lib/lessons.test.ts`
- `artifacts/api-server/src/lib/nexus.test.ts`
- `artifacts/api-server/src/pilot-integration.test.ts`
- `artifacts/api-server/vitest.config.ts`
- `artifacts/ccna-learning/src/components/admin-session.test.tsx`
- `artifacts/ccna-learning/src/components/topics-manager.test.tsx`
- `artifacts/ccna-learning/src/components/study-hub-scroll.test.tsx`
- `artifacts/ccna-learning/vitest.config.ts`
- This report and follow-up links in the previous integration/historical-resolution reports.

`learning-evidence.test.tsx` required no edit: its existing assertions pass with the bounded test environment. No new dependency, schema/migration change, application refactor, retry policy, timeout increase, test skip or disabled assertion.

## Verification: affected first, then one final sequential pass

| Check | Result |
| --- | --- |
| Affected API files | **58 passed / 3 files** |
| Affected frontend files | **64 passed / 4 files** |
| Final root TypeScript + codegen TypeScript | **PASS** |
| Final complete frontend suite | **481 passed / 41 files**, zero failures/skips |
| Final complete non-DB API suite | **835 passed / 49 files**, zero failures/skips |
| Final relevant Node tools | **17 passed**, zero failures/skips |
| Final diff/integrity | **PASS**, protected source proofs/manifests unchanged; no schema/migration diff or index entries |

The final test suites ran sequentially, not alongside production compilation. Default test/hook deadlines remain unchanged. The previously successful isolated API/frontend production build is reused because no application source changed in this stabilization pass; no unnecessary build rerun. No database tests, live PostgreSQL/SeaweedFS/Clerk connection, real-data creation, migrations, backups/restores, browser acceptance or service restart occurred. The previously authorized canonical source proofs are used internally only by the tooling fixture, never printed or included in Git.

**Checkpoint: GO.** Local verification blockers are resolved. This is not remote GitHub CI verification, deployment authorization or a production-readiness certification. The working tree includes the earlier reviewed development work and these repairs; no Git write operation was performed.

**Public Beta: NO-GO separately.** Clerk/public-origin/proxy/session/storage configuration, real browser acceptance, authorized live read-only bank/permission verification, current recovery evidence and any separately approved role/status/RLS/eligibility scope still require their own decisions. See [integration report](public-pilot-integration-verification.md) and [recovery runbook](public-pilot-recovery-runbook.md).
