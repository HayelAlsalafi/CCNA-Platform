# Final legacy removal and controlled Admin deletion

This implements the user's explicit FINAL LEGACY DATA REMOVAL authorization. It supersedes the earlier requirement to retain the specifically identified disposable fixtures. Real pilot learner history remains protected during this operation.

## Operator execution

Run from the approved workspace after isolated tests pass:

```powershell
Set-Location -LiteralPath '<repository-root>'
node tools/phase8a-cleanup/execute-final.mjs --plan
powershell.exe -NoProfile -File tools/phase8a-cleanup/invoke-final.ps1
```

Enter only the known `ccna_phase6a_migrator` password at its hidden prompt. It is passed privately through stdin; no environment files are read. Do not guess credentials or retry automatically after any failure. Share only the sanitized result/report path.

The command requires main/03b1452, 127.0.0.1:5432, `ccna_phase6a_dev`, system identifier 7694701597474139084, expected owner/role attributes, and exactly the six pinned historical ledger entries. It refuses an already-completed or partially migrated database. The original cleanup command is not reused.

The SHA-256-pinned inventory contains 75 exact legacy question UUIDs and 78 topic UUIDs. The original Sprint 7 manifest/bindings and fixed 60/24 pilot IDs are independently checked. Each disposable content/history row must still match the verified October 13 backup, allowing only the previously committed status changes. Added or changed history, shared pilot topic/history bindings, extra records, unknown incoming dependencies and changed immutable functions stop the operation.

A repeatable-read transaction locks the eleven application tables. Before migration or deletion, PostgreSQL 18.6 creates a full snapshot-consistent custom backup in an ACL-restricted new `.local/final-legacy-cleanup/<timestamp>/` folder. The archive hash, table-of-contents and full decoding are verified. All eleven application tables are actually restored into the existing empty `ccna_drizzle_check_20261012_c08f12ad34b6` database on private port 55440, checked against every live pre-cleanup count and row hash, then rolled back. No databases are created, dropped, reset or overwritten. The temporary exact-owner HBA allowance is restored byte-for-byte.

During this **disposable-only restoration**, the single `practice_attempts_validate_revision` INSERT trigger is suspended transactionally: historical pre-0004 attempts legitimately lack deliveries, and expired deliveries cannot be resubmitted as new attempts. Foreign keys, CHECK/NOT NULL constraints and append-only UPDATE/DELETE/TRUNCATE protections remain active. The INSERT trigger is enabled before verification and rollback restores its original state. No application trigger is disabled. COPY blocks are loaded unchanged in FK dependency order. Sequences are excluded from this data restoration; the full archive retains their recovery state.

Official Drizzle migration 0006 and cleanup share the verified outer transaction using migrator savepoints. The six historical ledger rows, schema/FKs and trigger bindings remain unchanged. Only the new controlled function receives runtime EXECUTE; the API still has no direct DELETE/UPDATE/TRUNCATE on history and no TEMP permission. The function uses the existing database owner's TEMP permission, not a new grant.

Deletion order is selected attempts → deliveries → revisions → mutable objective links → questions/options → now-unreferenced selected topics. The result must contain exactly 60/24 original IDs; pilot content/options/objective mappings/topics/history, users, taxonomy and the question sequence must have identical fingerprints. All constraints are checked before COMMIT. Failed checks roll back both the new migration and deletion. An uncertain COMMIT acknowledgement must be investigated from the preserved report/backup, never automatically retried.

Six exam domains are verified as PostgreSQL rows. The 33 chapters are the existing versioned `curriculum-config.ts` definitions: this application has no PostgreSQL chapter table. No chapter database rows are invented.

## Future Admin deletion

Normal single and bulk Delete return only DELETED/BLOCKED, verify physical absence, and block historical dependencies or any question-bearing topic. There is no unconditional Sprint 7 exclusion in future Admin deletion. The final cleanup independently protects the pilot set.

For questions, the existing confirmation dialog offers **Preview deletion including history**. Authenticated active Admins receive exact question/revision/delivery/attempt UUIDs and counts, must acknowledge permanent history loss and type `DELETE QUESTIONS AND THEIR HISTORY`. Previews expire in five minutes, are single-use, bounded in memory and bound to the exact DB-authorized actor and Clerk session. Confirmation rechecks all rows under ordered parent locks; any change blocks the entire batch. The server supplies the actor ID; the client cannot choose it. The SECURITY DEFINER function rechecks the actor's current database ADMIN/ACTIVE status. Topics are never expanded to implicitly delete questions; explicitly handle questions first, then delete empty topics.

Migration 0006 changes no persistent table structure. Its private temporary permit relation is definer-owned, inaccessible to the runtime role, transaction/session scoped and dropped at commit. Only exact permitted DELETE rows can pass the immutable trigger. Direct UPDATE/TRUNCATE or unpermitted DELETE remains forbidden. PUBLIC cannot execute the controlled helper. All successful Admin deletions refresh existing catalog/curriculum/practice/dashboard caches.

After operator execution, restart the updated API/frontend using the existing guarded, hidden-prompt launcher. No Clerk configuration changes are required. Old backend processes keep old source until restarted; do not assume the new workflow is live before that restart.

## Validation

Use `node tools/run-curriculum-tests.mjs`, `node tools/check-admin.mjs`, `node tools/build-admin-ui.mjs`, and the explicitly authorized `node tools/run-admin-practice-disposable.mjs --execute-isolated`. The latter targets only the existing empty Drizzle-check database, applies pinned 0006 through the official migrator if pending, and rolls back fixture/restore transactions. It never contacts the application or populated rehearsal databases. Source-only `--plan` performs no database operations.

Actual application counts and backup location must be taken from the **committed** final report, not inferred from tests or the earlier retained-content report.

Implementation validation: 353 database-free Vitest tests passed (30 files), 210 offline guarded-launcher/catalog tests passed, and seven PostgreSQL groups passed on the dedicated disposable database. The latter includes physical removal of restored copies of all 75/78 fixture parents and exactly 163 revisions, 99 deliveries and 53 attempts, ending at 60/24 with unchanged pilot/user/taxonomy fingerprints, then rollback. TypeScript, production compilation, source/metadata checks, PowerShell syntax and inert plan passed. The production build reports the existing UI source-map warnings. Application execution remains subject to the operator's hidden-password command and inspection of its actual committed report; these isolated results do not establish live application counts.
