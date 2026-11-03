# Public pilot integration verification

> Latest verification: the final sequential run passed 481 frontend, 835 non-DB API and 17 relevant tooling checks, plus TypeScript/codegen. See [checkpoint stabilization](public-pilot-test-stabilization.md). Earlier failing runs and narrower verification scopes below are historical evidence, not current checkpoint blockers. Public Beta remains a separate NO-GO.

2026-11-03. Branch `main`; HEAD remains `ac1744287c5310c06410b02f5f6be6ad63bba3b8`. Local changes only. **Current commit recommendation: GO for a documented development milestone after the seven historical test repairs; see [resolution evidence](public-pilot-historical-tests-resolution.md).** The earlier failing runs below are retained as history, not current blockers. No full CI-green claim is made. **Public Beta deployment: NO-GO**, independently, pending live configuration/browser/authorization/recovery acceptance and the existing approval-dependent scope.

## Scope and complete-diff review

Reviewed tracked changes and untracked source, tests, tooling and documentation from the Phase 0–5 working tree. No schema, applied migration, protected integrity manifest or known stale Exam test was changed. Dependency additions are the approved pinned security packages and their transitive dependencies; restored Windows native packages match existing parent versions. Test JSON/union fixes retain assertions. Fixture paths use source-relative URLs/OS temp instead of private local evidence. Admin monitoring remains bounded, ADMIN-only and read-only after the existing authentication/profile resolution. No role/status mutation or RLS bypass was added.

Existing creation intentionally becomes non-live; explicit Studio publication retains validation, locking, edit tokens and revision capture. Legacy direct ACTIVE enable/edit is rejected with Studio guidance; that is the intended publication safeguard, not a silent publication fallback. No existing row is changed by merely installing this source. Existing practice/Exam eligibility, availability, selection and grading source is unchanged relative to HEAD (comparison normalizes Windows checkout CRLF). The learner-read portion of questions.ts is also unchanged; only creation status changed there.

### Safe integration corrections in this pass

- Removed only the Windows x64 exclusions for Lightning CSS **1.32.0** and Tailwind Oxide **4.3.3**, matching existing parent versions. Lockfile updated without unrelated upgrades; minimumReleaseAge retained.
- Security route classification now normalizes case and trailing slashes to match Express. Previously `/API/EXAMS/` could consume only the generous global budget instead of the strict Exam-start budget. Regression proves it shares the stricter budget with `/api/exams`.
- Media delivery uses `res.vary()` for Authorization/Cookie instead of replacing Vary, retaining CORS Origin variation through image and conditional-cache responses.
- Added an actual app/router/auth/security integration suite. Only Clerk verification, DB persistence and storage/service boundaries use fixtures; no token fabrication or production bypass. The real authentication middleware still derives ADMIN from the database user, and rejects claimed-ADMIN/DB-USER and disabled accounts.
- Added `tools/pilot-production-build.mjs`: production compilation to a new OS-temp directory, no `.env`/`.local` reads, no running dist replacement and no application execution. It reuses the API build's external list/Pino plugin and frontend React/Tailwind production plugins. The undefined compile-only Clerk public-key reference keeps auth routes compiled; the output is **not a configured deployment artifact**.

## Verification evidence

| Check | Result / scope |
| --- | --- |
| API + frontend production compilation | **PASS** with the final runtime corrections. Output `%TEMP%\ccna-pilot-build-bymDjv\{api,web}`; no servers/DB connections or env-file loading. Existing UI sourcemap warnings and >500 kB chunk warnings remain |
| Root `pnpm run typecheck` | **PASS** |
| Focused integration/security/publishing/monitoring/Studio/Exam/media suites | **65 PASS, 7 files** |
| Existing real auth middleware + practice batch + Exam service tests | **29 PASS, 3 files**; mocked DB only |
| Reconciliation + API-only launcher-setting tests | **4 PASS** |
| 0017 source/pin validation | **PASS**, 17-entry source journal / 24-table snapshot; no live catalog inspection |
| Final diff/secret-pattern/schema-integrity checks | **PASS**: targeted secret-pattern/path scan, diff check, exact protected hashes; existing package resolutions unchanged |

Integration checks cover: health and unchanged Clerk-proxy mounting order; JSON 404; unsigned/disabled/non-admin denial; creation as DISABLED; rejection of direct enable; explicit Studio publish; DB role overriding a claimed ADMIN; monitoring READ ONLY/no private lesson queries; authorized PNG bytes and 304; preserved Origin/Authorization/Cookie Vary; exam and practice intent headers. Separate middleware tests verify development allowlist/preflight/denial, production missing/invalid origins failing closed, production HTTPS origin/HSTS, global/strict budgets, path aliases, and unthrottled health/image reads. These are local fixture proofs, **not real Clerk signature verification or S3/PostgreSQL integration acceptance**.

### Existing 16 eligible questions

No live database inspection was allowed. **Live current count/state: NOT VERIFIED.** No question records were touched. Existing eligibility/selection queries are unchanged from HEAD. The actual availability function is tested with database-provided counts **0, 16 and 25**, proving the source does not hardcode 16 and still returns a 16-question fixture intact. This does not substitute for later authorized read-only confirmation of the actual bank.

## Historical failures reviewed; now resolved in the follow-up

The following five additional historical cases were rerun by test-name selection only; unselected tests were skipped by the filter, not counted as passes. No assertion was deleted or weakened.

| File / failed expectation | Actual evidence | Classification |
| --- | --- | --- |
| `lib/exam-taxonomy.schema.test.ts:45` expects the journal to end at 0005/idx 5 | Ends at 0017/idx 16 | Historical whole-journal assumption; not a new schema change |
| `lib/study.test.ts:255` expects latest migration 0013 | Actual latest is 0017 | Historical pre-study-activation assumption |
| `lib/question-import-files.test.ts:151` expects retired objective assignments to be accepted | Validation correctly rejects them | Contract expectation conflicts with canonical-chapter workflow; do not re-enable retired mappings to pass |
| Frontend `components/phase2d1-reading.test.ts:18` expects a computed desktop grid in jsdom | Computed value is empty; fixture strips container rules | Test/layout-environment mismatch; no production layout redesign performed |
| Frontend `components/study.test.tsx:325` searches for the former save control | Current visible control is Save Position | Outdated control/Resume interaction expectation; existing current-reader regressions were previously passing |

API cases above: **3 FAIL / 45 unselected**. Frontend cases: **2 FAIL / 9 unselected**. The two known `tools/exam-activation/{activation,migration-context}.test.mjs` failures remain unchanged: their pre-activation fixture plan requires 16 while source is promoted to 17. Their prior offline failure evidence was reused, not rerun here. A complete green CI claim is therefore unwarranted. Typechecking/building does not erase these failures.

## Deployment configuration still required

- `NODE_ENV=production`, API `PORT`, server-only `DATABASE_URL`, Clerk publishable/secret keys; real frontend `VITE_CLERK_PUBLISHABLE_KEY` at deployment build time. Values were not read, printed or configured here.
- Explicit `ALLOWED_ORIGINS` with exact public HTTPS frontend origins. Only development defaults to `http://localhost:8080`; add other development origins explicitly if needed. Production never falls back to localhost/wildcard.
- Review `API_TRUST_PROXY` against the actual fixed ingress chain; default false. Restrict direct API access before choosing hop counts. Review `API_RATE_WINDOW_MS`, `API_RATE_GLOBAL`, `API_RATE_ADMIN`, `API_RATE_UPLOADS`, `API_RATE_EXAM_START`, `API_RATE_PRACTICE_SUBMIT`. Current in-memory counters are per process; multi-replica shared enforcement remains unverified.
- Existing server-only `LESSON_MEDIA_PROVIDER` and `LESSON_MEDIA_S3_*` configuration must be supplied through approved deployment secrets, not copied into Git/frontend. No S3 connection was made. Local loopback SeaweedFS is not evidence of public deployment storage/availability.
- Clerk dashboard sign-up policy, allowed frontend origins/redirects, proxy/domain configuration and session expiry/revocation require owner configuration and real browser verification.
- Preserve the separate plans for role/status management, aggregate lesson monitoring, eligibility compatibility and post-0017 recovery. No migration/grant is authorized by this report.

No live service connections, main/isolated SQL, migrations, real-data creation, backup/restore, bilingual UI work or service restarts were performed. No staging, commit, push or tag. The follow-up resolves all seven documented failure cases; public deployment still needs its own separate acceptance.

## Final working-tree scope

49 changed/untracked source, test, config and documentation files remain local; index empty and HEAD unchanged. Follow-up additions are the isolated build tool, actual-app integration suite and this report; additional edits cover middleware path normalization, CORS/media Vary preservation, matching Windows native packages, focused compatibility tests and the earlier report cross-reference. No secret, receipt, backup or build output is included in that file set. Native additions are esbuild 0.28.2, Rollup 4.63.1, Lightning CSS 1.32.0 and Tailwind Oxide 4.3.3; every pre-existing lockfile package resolution is unchanged.
