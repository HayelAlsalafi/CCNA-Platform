# Migration 0014 isolated rehearsal — PASS

29 October 2026. The authorized isolated verification is complete. **No connection
to port 5432, main-database write, application restart, source promotion, main
permission change, media activation, commit or push occurred.** Existing work and
both earlier rehearsal environments were preserved.

## Decision

- **PASS / GO for the rehearsed 0014 SQL and recovery evidence.** Restore,
  migration, real persistence, isolation and preservation checks passed.
- **NO-GO for immediate main-database execution.** Main startup guards are
  deliberately unchanged under this task's restriction. The reviewed 14-entry
  candidate must be integrated and its launcher wiring verified before activation.
  A fresh main-state/backup gate and a 0014-only operator executor are also required.
  Main activation still needs separate explicit approval.
- **NO-GO for uploads.** Persistent media storage remains unconfigured and untouched.
  This is independent of database-only private study persistence.

## Preflight and environment

| Property | Verified evidence |
| --- | --- |
| Workspace / branch | `<repository-root>`, `main` |
| HEAD | `3c07b4bb7fe807e60dcbcd5539c046b919a9956f` |
| Binary / version | `C:\Program Files\PostgreSQL\18\bin\postgres.exe`, PostgreSQL 18.6 |
| Binary SHA-256 | `8b8bf5d400487159e3e117053d3f5a89fad0c740b310a3ac69e5720ce4f818e1` |
| Private system identifier | `7695735287099484548`, read from control file before start and matched live |
| Main identifier, explicitly excluded | `7694701597474139084` |
| Data directory | `.local/taxonomy-rehearsal/ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170/data` |
| Ownership | Exact existing nonce/owner/path marker; canonical non-reparse paths; data/marker NTFS owner matched operator |
| Listener / PID | Exactly `127.0.0.1:55440`, PostgreSQL PID `25736`; executable and postmaster PID/data/port matched |
| New database | `ccna_study_0014_rehearsal_20261028_c61edf950aa5` |
| Database owner | `ccna_taxonomy_rehearsal_owner_8e6c4b9a2170` |

Port 55440 was unused and `pg_ctl status` reported stopped before the authorized
start. The native starter emitted an “another server might be running” warning,
but completed normally; all post-start PID/listener/executable checks passed.
No PID file was deleted, no fallback port used and no process terminated.
The private cluster remains running; it was not registered as a Windows service.

The new database name was checked absent before CREATE DATABASE using template0.
Its initial relation/function inventories were zero. No populated database was
reset, dropped, overwritten or reused for the restore. The date component in its
name retains the already-reviewed target identity; execution occurred on 29 October.

The existing hardened HBA first-match policy stayed in place. Each operation
temporarily inserted only the exact new database/private-owner IPv4-loopback
allowance; original HBA bytes were restored and reloaded in finally blocks.
Unauthorized `postgres` authentication against this private endpoint was rejected
with SQLSTATE **28000**. Unix/IPv6/non-owner reject rules were not removed. No
production credentials or storage configuration was used or modified.

## Backup and actual restoration

Source archive, preserved unchanged:

`.local/question-bank-upgrade/study-2026-10-28T13-00-40.345Z-fab6cddb-244f-4569-a35b-be3b582e25f7/before-upgrade.dump`

Size **145,546 bytes**; SHA-256:
`adbf25e98a8f9473251a86d1c8e2e5fcd2b1ad77c345b6d0c26e92458193eaf8`.

Before service start, the protected receipt/hash, table coverage, archive TOC and
full archive decoding were reverified. Actual restoration then used PostgreSQL
18's `pg_restore --single-transaction --exit-on-error --no-owner --no-privileges`
into the newly created private database. Database identity was rechecked first.
All 19 restored table fingerprints matched the original consistent snapshot,
including **16 questions, 16 question revisions, 2 lessons, 6 lesson revisions,
10 users, 6 attempts and 28 deliveries**. Both sequence values and all 13 ledger
hashes/timestamps/IDs matched. Constraints, indexes, table kinds and mapped private
ownership matched the baseline snapshot. No FK or immutable trigger was disabled.

Ownership and ACL replay were intentionally excluded: the restored objects belong
to the private owner, and application roles/permissions were not recreated or
changed. Data, SQL objects, FKs, indexes and immutable guards were restored; the
required runtime permission profile was separately mirrored and checked in this
new database. This is not a claim that cluster-global roles or production ACLs
can be recovered from a database dump alone.

## Actual migration and database assertion results

Unchanged SQL proposal:
`lib/db/drizzle/proposed/0014_interactive_study.sql`.
SHA-256 **`c61edf950aa5de1b5638b98ec406a4e4472efa8c7e7790716a8d447456e06893`**.

The staging directory contained exactly the 13 reviewed baseline SQL files plus
0014 and its proposed journal; unrelated exam proposal 0012 was excluded. The
official Drizzle Node/PostgreSQL migrator performed migration and repeat checks.

| Assertion group | Actual result |
| --- | --- |
| Private identity / unauthorized authentication | PASS |
| Full archive restoration / original hashes / baseline sequences and ledger | PASS |
| Genuine SQL failure rollback | PASS: injected division-by-zero **22012** inside Drizzle after initial study DDL; partial tables and ledger change rolled back; 13-entry baseline remained |
| Exact prior-state continuation | PASS: identity, source checksums, 14 ledger entries, original fingerprints, empty study tables and expected sequences rechecked before further writes |
| Migration 0014 / existing data preservation | PASS: 22 tables, 14 ledger entries, exact PK/FK/CHECK/index metadata and owners; two owner RLS policies |
| Repeat migrator execution | PASS: no new ledger entry, sequence advance or original-data changes |
| Private role privileges | PASS: exact study privileges and existing lesson privileges, no study TRUNCATE/REFERENCES/TRIGGER/MAINTAIN or revision UPDATE/DELETE |
| Highlights / notes / bookmarks / resume across connections | PASS: actual committed service writes reopened through a second connection |
| Note edit/delete and progress transitions | PASS: edited note version advanced; deleted note physically absent; explicit start/position/complete/reopen; position preserved completion; stale version rejected |
| RLS / FKs / checks / deletion restrictions / immutability | PASS: missing/foreign owner context rejected; cross-user service edits/deletes rejected; mismatched revision FKs **23503**, invalid checks **23514**, restricted operations **42501**, RESTRICT/immutable history **23001** |
| Published revision compatibility | PASS: both restored published lessons read through the real reader service; old fixture revision unchanged after republish; old annotations retained; old-revision writes rejected; new revision progress not guessed |
| Final original data / sequences / HBA | PASS: all original row fingerprints matched; question-code sequence preserved; HBA restored byte-for-byte |

Real service code was bundled with an inert DB module shim and supplied a client
pinned to this disposable target. The application pool cannot be imported by that
bundle. This is real PostgreSQL/service persistence, not mocked query success.
The restricted SQL role was the existing **NOLOGIN, NOSUPERUSER, NOBYPASSRLS**
`pg_read_all_settings`; no cluster role/password was created or altered. Only
new-database-local table grants were added. It is a restricted SQL test identity,
not a fake Clerk token or a claim of live signed-in HTTP verification.

Cross-user annotations and progress were absent from the other user's result.
Duplicate unanchored bookmarks failed **23505**; overlapping highlights and stale
versions failed the real service validations. The database also rejected writes
with absent or spoofed owner context. Draft lessons were not available to study
reads. No real-user content was changed during testing.

Final counts **include retained synthetic test fixtures**:

| Table | Final count | Original restored rows |
| --- | --- | --- |
| questions | 16 | All 16 unchanged |
| users | 13 | All 10 unchanged; 3 synthetic identities added |
| lessons | 3 | Both original lessons unchanged; 1 synthetic lesson added |
| lesson_revisions | 8 | All 6 originals unchanged; 2 synthetic revisions added |
| lesson_annotations | 2 | Synthetic highlight and bookmark; the test note was deleted |
| lesson_progress | 1 | Synthetic learner progress |
| lesson_media | 0 | No storage/upload activation |

Question-code sequence remained **152 / called**. The Drizzle sequence became
**14 / called** on normal application and did not advance on repeats. Fixture
provenance was independently checked against archived original UUID sets before
continuation; final original-row hashes excluded only those exact synthetic IDs.
No original row was deleted to make the hashes match. Fixtures/database remain
available for review; no cleanup is authorized by this report.

## Corrections and stopped attempts

No migration SQL was changed. Two model/proposed-snapshot mismatches were corrected:

1. Explicit Drizzle PK name `lesson_progress_pkey`, matching 0014's PostgreSQL
   default name, instead of Drizzle's generated composite name.
2. Explicit `::text` in the model's bookmark predicate, matching PostgreSQL's
   canonical text comparison. The predicate and unique-index semantics did not
   change; no global index guard normalization was weakened.

Current proposed snapshot SHA-256:
`d325996ec079334f4593cc7cafdbacfaada720404db14f16e988ebf54645ed4a`.
Proposed journal remains
`e8132f0677ae5d0069d298c3a2b49c4ce9399b6203dd3600612411f6ae5feb6e`.
Older readiness snapshot hashes are historical and superseded by this report.

The candidate policy comparison was corrected for PostgreSQL's uppercase NULLIF
keyword. Only that keyword and representation-only casts/parentheses are
normalized; tests still reject a different owner setting or `OR true` rule.

One service attempt stopped with **42501** because the private test role initially
had SELECT-only lesson access; PostgreSQL `FOR SHARE` also needs UPDATE. The actual
approved application lesson profile already includes SELECT/INSERT/UPDATE. A
SELECT-only provenance diagnostic verified exactly three synthetic users, one
lesson/revision and zero study records before the private role was given that
existing profile. No main grant was required. The runner also uses the actual
0013 immutable-trigger SQLSTATE **23001**.

Every stop was diagnosed before continuation. The database was never restored,
reset or recreated after population, and 0014 was not reapplied. Continuations
were pinned to the recorded state; repeats exercised the migrator with **no pending
migration**. Initial receipts and continuation attempts are retained. Completed
rehearsals now refuse resumption without overwriting their successful receipt.

## Startup guard assessment — candidate only

`tools/study-activation/proposed-runtime-guard.mjs` verified the actual private
22-table/14-entry schema, ownership, exact RLS enable flags/policies and study
privileges. The proposed source patch is:

`tools/study-activation/proposed-startup-0014.patch`

It adds only the pinned study-chain branch, exact five lesson/study table names,
0014 snapshot selection, existing lesson guards plus exact study permissions/RLS.
Identity, role boundaries, checksum/timestamp ordering and unexpected-table
rejection remain. `git apply --check` and syntax checks on all three candidate
launcher modules passed. **The patch was not applied.** The active launcher still
requires the current 13-entry main schema and would reject an unrecognized 14-entry
upgrade. Full launcher wiring after applying the patch is not yet verified.

## Source/evidence files and offline validation

Added isolated tooling under `tools/study-activation/`: `start-private.ps1`,
`isolated-policy.mjs`, `rehearse.mjs`, `diagnose-isolated.mjs`,
`verify-fixture-state.mjs`, `final-verification.mjs`,
`proposed-runtime-guard.mjs`, `prepare-startup-patch.mjs`,
`proposed-startup-0014.patch`, `isolated-policy.test.mjs`.

Updated only `lib/db/src/schema/lesson-study.ts`, proposed
`meta/0014_snapshot.json`, the corresponding proposal checksum/chain validation in
`tools/study-activation/proposal.mjs`, and readiness report links. Official Drizzle
metadata, SQL migrations, application startup files, APIs, media configuration,
dependency lockfile and launcher credentials were not changed.

Offline checks: **12 preparation/policy tests passed**, **236 focused lesson/API/UI
tests passed (16 files)** and TypeScript passed. New starter/runner JS/PowerShell
syntax checks and patch applicability checks passed. No unrelated tests or fixes
were performed. PostgreSQL assertion groups above are separate actual database
checks, not included in those unit-test counts. No browser or live Clerk HTTP
session was used; API authorization routes remain covered by the focused unit suite.

Sanitized authoritative evidence:

`.local/study-0014-rehearsal/2026-10-29T06-11-20.273Z-c04c0075-63c2-48bb-a0d9-f906b71db6c5/rehearsal.json`

That protected directory also retains the initial failure, read-only catalog
diagnoses, verified fixture provenance, staged SQL and continuation receipts.
The final receipt includes CHECK definitions/defaults and a final READ ONLY
catalog/privilege/count attestation. No credentials or learner row contents appear
in this public report.

## Proposed main activation and recovery steps — NOT EXECUTED

1. Obtain separate approval for the exact unchanged SQL hash and
   `127.0.0.1:5432/ccna_phase6a_dev`, identifier `7694701597474139084`, source
   promotion, candidate startup patch and only the three study-table grants below.
2. Stop API/frontend manually, keep PostgreSQL running, close competing clients.
   Revalidate the live main identity, complete 13-entry ledger/schema/role profile
   and no unrelated pending migrations. Create a fresh consistent backup with:

   ```powershell
   Set-Location -LiteralPath '<repository-root>'
   powershell.exe -NoProfile -File tools/study-activation/prepare-backup.ps1 -Backup
   ```

   Use the existing hidden local prompt. Today's rehearsal proves the migration
   against the verified 28 October snapshot; it does not prove today's main rows
   are unchanged. Verify the refreshed archive/restoration evidence without
   overwriting this backup or resetting the current populated rehearsal database.
3. Review the source patch before applying it under that separate approval:

   ```powershell
   git apply --check tools/study-activation/proposed-startup-0014.patch
   ```

   Applying the patch, source promotion and full launcher wiring verification are
   still future work, not implied by `--check`. Promote only 0014 SQL, its corrected
   snapshot and the exact 14-entry journal. Do not include exam proposal 0012.
4. Use a separately reviewed hidden-prompt **0014-only** operator executor. It must
   lock/recheck the exact main baseline against the fresh backup, invoke official
   Drizzle with the pinned 14-entry staging chain, validate the result and apply
   these narrow grants in the same controlled transaction:

   | Table | `ccna_phase6a_app` additions |
   | --- | --- |
   | lesson_annotations | SELECT, INSERT, UPDATE, DELETE; owner RLS |
   | lesson_progress | SELECT, INSERT, UPDATE; owner RLS |
   | lesson_media | SELECT, INSERT only; uploads still unconfigured |

   No 0014 main activator has been executed or presented as runnable here; do not
   substitute a generic migration CLI, manual SQL or the old 0013 activator.
5. Before commit, verify all 14 ledger hashes/timestamps/IDs, exact 22-table schema,
   policies/privileges and all original fingerprints/sequences. On failure, roll
   back and preserve receipts; unknown commit outcomes require diagnosis first.
6. After confirmed success, the operator may manually start API/frontend with the
   existing guarded `invoke.ps1 -Mode api/web ... -Start` commands and known local
   hidden prompts. Perform a controlled signed-in study save/reopen test with
   explicit test-data authorization. Do not activate media storage implicitly.

Recovery evidence is now stronger than archive readability: the original archive
actually restored and all rows/relationships/sequences matched. For any future
main restore, first restore into a **new, separately authorized empty private
target**, verify its identity, hashes and all original records, then seek explicit
approval before any main-database replacement. Do not run `pg_restore` into a
populated target, delete current data or drop study tables as an automatic rollback.
After study records exist, prefer a reviewed forward correction. Database dumps
alone do not recover future image binaries; storage remains a separate NO-GO.

**Stop here: the isolated objective passed. Main activation is not authorized and
is not immediately ready while the guard patch and operator executor remain
unintegrated. No additional rehearsal environment or application change was begun.**
