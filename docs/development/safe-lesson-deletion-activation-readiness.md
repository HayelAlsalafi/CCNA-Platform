# Migration 0016 — final activation preparation

2026-11-01. **Source tooling: READY. Main activation: NO-GO pending fresh backup, matching restored rehearsal, maintenance gates and explicit approval.** No main database connection/mutation, backup creation, restore, migration, role change, service restart, commit, tag or push was performed in this preparation pass.

## Reviewed scope

- Target: `127.0.0.1:5432/ccna_phase6a_dev`, system identifier `7694701597474139084`, owner `ccna_phase6a_migrator`.
- Exact 15-migration source manifest checksum: `6a6ad1038cfdcf9c901121734f7551ef49b64d7ab63964d53c5363dbfc86e77d`; all existing SQL pins still pass. Official journal remains at 15; no applied SQL/snapshot/journal was changed.
- Only proposed `0016_safe_lesson_deletion`, SHA-256 `7a64aaaf5fc40e117a7aad2f11682d3fa8426673f17277c77009d19606dd0116`, timestamp `1793145600002`. One controlled function, fixed search path, PUBLIC execution revoked, app EXECUTE only. Direct lesson DELETE/TRUNCATE remains forbidden. No table changes, learner cleanup or media/storage operations.

## Prepared workflow

`tools/lesson-deletion/` now contains `readiness.mjs`, `backup.mjs`, `prepare-backup.ps1`, `verify-backup.mjs`, `restore-roles.mjs`, `rehearse-backup.mjs`, `activation.mjs`, `apply.mjs`, `apply-deletion.ps1`, and `activation.test.mjs`. Existing safe archive, identity, schema, role, fingerprint, source-promotion and UTC verification helpers are reused; old 0015 workflows are not repurposed or executed.

The backup uses one READ ONLY repeatable-read UTC snapshot, verifies the pinned main identity, 15-entry/22-table baseline and security, exports a consistent full archive, checks its checksum/coverage/decode and writes a new protected receipt without overwriting old backups.

The restored rehearsal accepts only that exact fresh archive (six-hour execution window) and only a newly created disposable database on the verified existing private cluster `127.0.0.1:55440`, system `7695735287099484548`. It restores data once, compares original UTC fingerprints/sequences/ledger, and preserves archived public/drizzle ACLs. Inside an outer rollback-only transaction it creates temporary non-login, non-superuser app/migrator fixtures; **existing role names cause STOP**, never adoption or alteration. Those roles cannot connect externally. Relevant object ownership and archived ACLs are restored only in the disposable database. Exact 0016 bytes then run as the non-superuser owner; checks include exact function security, unchanged table permissions/data, repeat-execution no-op and one newly created synthetic draft deletion as the app role. It never deletes a restored original lesson. Rollback must remove all role/ownership/function changes and restore schema/data; only the disposable ledger sequence is reset to its original value. The private HBA must be restored byte-for-byte. No cluster startup is automatic.

The executor pins source and reviewed synthetic-test evidence, requires a matching successful restored-rehearsal receipt, checks backup freshness/integrity again, installed service identity, closed application ports/processes, zero competing database clients, and locked original fingerprints/schema/ledger/sequences. Staging contains only 0016. It issues no learner/media mutation and never calls the deletion function on main records. Exact 16-entry state, immutable revisions, role boundaries, unchanged direct table privileges and function EXECUTE ACL/body are verified before COMMIT and again in a READ ONLY UTC post-commit transaction. Any drift or uncertain commit/promotion stops without retries, repairs or sequence resets.

Offline Plan describes either the strict pre-activation state or already-promoted source; it never claims live database verification. Apply continues to require the exact 15-entry baseline even after source promotion.

## Essential checks performed

- `node --test tools/lesson-deletion/activation.test.mjs`: **5 PASS**. Covers one-file staging, exact invocation, post-promotion offline Plan, stale/mismatched archive evidence, missing restoration/rollback/nonprivileged-role gates, wrong database identity, scoped ACL replay and refusal of existing fixture roles.
- Node/PowerShell syntax and scoped diff checks: **PASS**.
- `powershell.exe -NoProfile -File tools/lesson-deletion/apply-deletion.ps1 -Plan`: **PASS**, 15 source entries, 0016 pending, zero database connections/writes.
- Existing implementation/UI tests and synthetic deletion rehearsal were reused, not repeated. Their successful receipt is checksum-pinned. No TypeScript/UI changes or production build were needed in this pass.
- **New live backup/restored-rehearsal/executor paths remain unexecuted.** Offline checks do not certify a restorable current 15-entry archive or main-equivalent live activation. The private roles use NOLOGIN with SET ROLE; main login/authentication must still be verified during approved startup. If ACL replay, role-name availability or permissions differ, stop; do not bypass the gate.

## Backup inventory and retention

Read-only metadata inventory of `.local/question-bank-upgrade`: **13 archives, 1,672,194 bytes (~1.60 MiB)**. Contents were not re-audited or re-restored.

| Group | Archives | Bytes | Recorded baseline |
|---|---:|---:|---|
| Legacy, Oct 15/17 | 3 | 446,958 | Not identified from inspected receipt names |
| Test-labelled Oct 15 | 4 | 235,488 | Not verified empty; retain |
| Lessons, Oct 27 | 2 | 261,897 | 12 migrations |
| Study, Oct 28/29 | 2 | 292,329 | 13 migrations |
| Media, Oct 31 14:25 / 20:19 UTC | 2 | 435,522 | 14 migrations, pre-0015 |

None is a fresh 15-entry backup. A receipt's original `restorationVerified:false` is not proof no later rehearsal occurred; restoration evidence lives in separate receipts. Keep **all existing archives and receipts now**: they are small and include release/recovery evidence. Retain each pre-activation and accepted milestone backup; after new encrypted copies and restoration checks exist, separately review test-labelled files and any daily/weekly retention policy before deletion. Never clean backups automatically during activation. PostgreSQL dumps contain media metadata, not SeaweedFS binaries; retain the durable object-store data/config separately. No backup or object was deleted or copied externally.

## Exact operator commands

Offline Plan (safe now; already checked):

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/lesson-deletion/apply-deletion.ps1 -Plan
```

After arranging an approved maintenance shutdown, keep API/frontend stopped and PostgreSQL/storage running. Obtain one fresh backup through its hidden local credential prompt; never send passwords:

```powershell
powershell.exe -NoProfile -File tools/lesson-deletion/prepare-backup.ps1 -Backup
# Assign the returned exact lesson-delete-backup.json path:
$backupReceipt = '<returned full receipt path>'
node tools/lesson-deletion/verify-backup.mjs $backupReceipt
node tools/lesson-deletion/rehearse-backup.mjs --rehearse $backupReceipt
# Assign the returned READY FOR APPROVAL restored rehearsal receipt:
$rehearsalReceipt = '<returned full rehearsal.json path>'
```

If the existing private cluster is stopped, identity fails, a fixture role already exists or any check stops, preserve receipts and report the blocker. Do not start services, substitute a target or rerun speculatively.

**STOP for explicit approval of exact target, checksum, function EXECUTE grant and reviewed source promotion.** Only after that separate approval and successful gates:

```powershell
powershell.exe -NoProfile -File tools/lesson-deletion/apply-deletion.ps1 -Apply -ConfirmReviewedLessonDeletion -BackupReceipt $backupReceipt -RehearsalReceipt $rehearsalReceipt
```

Do not run Apply from this report as implied authorization. Do not use generic migrate commands or old 0015 Apply. After successful database verification, separately authorized guarded startup/browser acceptance must finish before the later requested commit/tag/push milestone. No Git operations are included here.
