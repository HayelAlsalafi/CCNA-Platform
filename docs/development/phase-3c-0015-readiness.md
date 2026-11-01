# Migration 0015 — isolated rehearsal readiness

2026-10-31. **Source readiness: GO FOR APPROVAL. Startup guards: READY. Dedicated executor: READY. Focused tests: PASS (16). Main database: UNCHANGED. Main activation: NOT EXECUTED.** A separately approved maintenance window, fresh backup and matching isolated rehearsal remain mandatory execution gates. No services were restarted.

## Confirmed restoration blocker and correction

The original `archive-restoration` receipt lacked a failing subcheck. A focused READ ONLY diagnosis of that disposable database confirmed identity, the 14-entry ledger, all original UTC fingerprints and study RLS passed. Only immutable-revision protection failed: `extra_acl=true`, `public_execute=true` on `public.reject_lesson_revision_mutation()`.

Cause: `pg_restore --no-privileges` omitted the archive's exact `REVOKE ALL ON FUNCTION public.reject_lesson_revision_mutation() FROM PUBLIC;`. Stored data and the function body were not corrupt. The archive contains exactly that restriction and no other ACL statement for this function.

`restore-security.mjs` now accepts only that exact archived restriction, independently verifies the new disposable database identity on 55440, and restores the restriction before the unchanged revision guard runs. General archived role grants remain excluded. No guard was relaxed; no original migration or archive/backup receipt was changed.

Diagnosis evidence: `.local/media-0015-rehearsal/ccna_media_0015_8e175714b5874534b9917c42/restore-diagnosis.json`.

## Successful isolated evidence

- Backup archive SHA-256: `ed5eab9b37a4e61d5d3887b11c89aacead48de04d20b55929986df9234f0163f`; checksum, coverage and full archive decoding reverified. Existing six-hour freshness gate passed; no replacement backup was needed for this run.
- Proposal SHA-256: `f42de505df26dc5a00a49e740ba59ccc1c0e6d053f1f6f77a84b8bf92090a63b` (unchanged).
- Private target: `127.0.0.1:55440/ccna_media_0015_e13dfb49bd8a45939e31d53c`; system identifier `7695735287099484548`; PostgreSQL 18.6. Existing process/executable, directory, marker and exact private configuration verified before connection. Only a new empty database was restored; previous databases were retained.
- Restore: 22 tables, baseline ledger and original UTC fingerprints/sequences matched the verified backup. Function restriction and study RLS passed.
- Migration: only staged 0015 executed through Drizzle, inside an outer disposable transaction. Ledger reached 15; eight columns, the metadata check constraint and catalog-order index appeared. Other catalog objects and original records matched the baseline.
- Repeat: a second Drizzle invocation with the same staged journal changed neither ledger nor sequences. SQL itself is intentionally non-idempotent; the ledger prevents reapplication.
- Permissions: disposable fixture role had SELECT/INSERT but no UPDATE/DELETE/TRUNCATE. Old-format media insertion received compatible defaults; invalid width was rejected. This is isolated fixture evidence, not a live app-role upload test.
- Rollback: schema, ledger and original fingerprints restored exactly. The nontransactional ledger sequence was restored only in the disposable database and both sequence states verified. Private HBA restored byte-for-byte. No database was deleted.

Receipt: `.local/media-0015-rehearsal/ccna_media_0015_e13dfb49bd8a45939e31d53c/rehearsal.json`.

## Startup integration review and remaining risks

The original startup integration blocker is resolved in source. `policy.mjs`, `upgrade.mjs`, `run.mjs`, and the study proposal/runtime catalog now support exactly the pinned 15-entry media chain after promotion. The official journal remains at 14 and still selects the unchanged 0014 snapshot. No active SQL or official snapshot/journal has been modified. Unknown chains/counts and partial promotion fail closed.

Prepared proposal metadata: `lib/db/drizzle/proposed/meta/0015_snapshot.json` (SHA-256 `485a3cf8998faaad5defcf82f01166175fac0b5e26238791db369e0b828e1b24`) and `0015_journal.json` (SHA-256 `de08a3729f3687d870a1e90b24dadc286c54ca3f35024dc237923b02061e121b`). Journal timestamp: `1793145600001`. The original 14-entry SQL manifest checksum is `bd845403f82ffaed696958f44687fb9b453ec6c68903db8c9922a44b7568ea50`. The snapshot preserves 22 tables and all unrelated definitions. The runtime additionally checks added defaults, the validated check expression including boolean grouping, index ordering/validity, original ownership, exact ledger IDs, RLS, grants and immutable lesson revisions.

Existing main `lesson_media` was empty in the verified backup, so preservation of populated legacy media is limited to the compatible-default fixture. ALTER TABLE requires an access-exclusive lock. The successful migration was rolled back in isolation; no committed main activation or authenticated upload/publication is claimed. SeaweedFS adapter PUT/GET previously passed, but it does not substitute for metadata activation or published-reference authorization testing.

## Exact approval-dependent activation sequence

1. Review `tools/media-activation/{proposal,runtime,activation,apply}.mjs`, `apply-media.ps1`, the proposal metadata and startup changes. The executor stages only one SQL file/one journal entry. **Do not use an unrestricted migrate command.** Offline Plan is available below.
2. Obtain explicit approval for only proposal SHA-256 above on `127.0.0.1:5432/ccna_phase6a_dev`, system identifier `7694701597474139084`, and its reviewed source/guard promotion. No extra grants are proposed; current table-level SELECT/INSERT covers the added columns.
3. After approved maintenance shutdown, create a fresh backup once with `powershell.exe -NoProfile -File tools/media-activation/prepare-backup.ps1 -Backup` using the hidden local prompt. Verify archive/receipt and exact current data fingerprints; do not reuse this older archive if stale or data has changed. Restore/reverify the activation archive in isolation as required by the final executor's gate.
4. The reviewed executor must recheck zero clients/listeners, exact main identity, 14-entry ledger/22-table schema, backup/checksum/fingerprints and permissions under locks before applying **only** 0015. Verify the 15-entry ledger, exact schema, original UTC fingerprints/sequences, RLS/grants and immutable revisions before commit and in a separate READ ONLY UTC post-commit transaction. Stop on any failure; never retry speculatively.
5. Only after successful verification and authorized restart, use the existing guarded API/frontend launchers. Existing SeaweedFS configuration loads API-only credentials. Verify authenticated upload/retrieval, draft reload, authorized publication/reference delivery and denied unauthorized access using separately authorized test content.

Offline, credential-free Plan (already passed; no database connection):

```powershell
powershell.exe -NoProfile -File tools/media-activation/apply-media.ps1 -Plan
```

After separate approval only, and with API/frontend stopped manually, run the backup once. Assign `$backupReceipt` to its exact sanitized report path; no credentials belong in variables or arguments. Rehearse that exact archive in the verified existing private cluster, then assign `$rehearsalReceipt` to the successful report path:

```powershell
powershell.exe -NoProfile -File tools/media-activation/prepare-backup.ps1 -Backup
# Set $backupReceipt to the returned media-backup.json path.
node tools/media-activation/rehearse.mjs --rehearse $backupReceipt
# Set $rehearsalReceipt to the returned successful rehearsal.json path.
powershell.exe -NoProfile -File tools/media-activation/apply-media.ps1 -Apply -ConfirmReviewedMedia -BackupReceipt $backupReceipt -RehearsalReceipt $rehearsalReceipt
```

These activation commands were **not executed** in this source-only task. The wrapper accepts the migrator credential only through a hidden prompt and sterile child stdin. The executor validates the installed service, ports 3000/8080, guarded processes and zero competing database clients; rechecks exact main identity, source/SQL pins, original reviewed rehearsal hash, fresh archive verification and a matching successful isolated restore/rollback receipt. Under transaction-scoped locks it compares the entire 14-entry/22-table baseline, UTC original-column fingerprints, sequences and existing permissions before migration. No grants are issued. It verifies the 15-entry state before promotion/COMMIT and again with `withReadOnlyUtc` in a repeatable-read READ ONLY transaction after COMMIT.

Evidence/source drift, expired backup (six-hour window), missing isolated restoration, invalid privileges or partial promotion stop execution. Do not automatically retry. A failure after promotion or uncertain COMMIT can leave source and database out of sync; receipts record both states. Keep services stopped and diagnose read-only rather than running activation again or resetting sequences.

Recovery: before COMMIT, transaction rollback restores schema/data (ledger sequence advances require explicit guarded handling). After COMMIT, stop on uncertainty and diagnose read-only; do not drop columns or restore over the main database. Any recovery operation needs separate approval and must preserve newer records and stored objects.

## Focused checks and changed files

Current focused run: **16 passed** across `tools/media-activation/activation.test.mjs`, `restore-security.test.mjs` and `tools/study-activation/read-only-utc.test.mjs`. Tests use source copies and query fixtures only: simulated promotion selects the 15-entry manifest/snapshot; wrong hashes, unknown chains, missing columns, extra tables, owners/kinds, defaults/constraint/index drift, unsafe security metadata, wrong target, stale backup and mismatched rehearsal evidence are rejected. The real source remains at 14 after tests. UTC invariance and mismatch rejection are retained. PowerShell/Node syntax and targeted diff checks passed. No TypeScript files changed; no build or broad suite was needed.

New guard/executor paths have not been run against a live 15-entry PostgreSQL instance during this source-only task. The earlier successful isolated migration is reused as migration evidence; authenticated uploads, application restart and post-activation live acceptance remain pending. GO means ready to request narrowly scoped activation approval, not that operational uploads are already active.

This source-only pass changed `tools/phase6a-local/{policy,upgrade,run}.mjs`, `tools/study-activation/{proposal,proposed-runtime-guard}.mjs`; added `tools/media-activation/{proposal,runtime,activation,apply}.mjs`, `apply-media.ps1`, `activation.test.mjs` and proposed 0015 snapshot/journal; updated this report. Earlier restoration fixes remain intact. Only disposable filesystem source fixtures were written by tests. No database was connected to, no services were started/restarted, and no credentials, commits or pushes were produced.
