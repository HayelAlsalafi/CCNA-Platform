# Public pilot recovery — preparation, not execution

No database/storage connections, live backup, restoration or reconciliation were executed in this work. Never reuse the Exam 0017 pre-activation executor as a post-0017 backup tool: `backup.mjs`, `readiness.mjs` and `verify-backup.mjs` deliberately pin 16 entries, 22 tables and absent Exam objects. Keep these checks intact. The current recovery target is 17 entries, 24 tables. Existing restored rehearsal proves the earlier migration path, not recovery of current learner exams.

## Operator approval gates

1. Approve a post-0017 backup/isolated-recovery window and protected destination; retain existing archives. Verify source SQL hashes and actual cluster identity, role grants, RLS and function guards through the normal read-only startup check. Do not use `upgrade-verify` with its historical HEAD pin or bypass it.
2. Capture one consistent custom-format dump of the whole database, including ledger, sequences, immutable revisions, learner exams and annotations. Use a hidden local password prompt, never a password/connection string in arguments, shell history or reports. Do not read existing `.env` or private receipts as part of this preparation.
3. Verify archive checksum, full decoding and table/sequence/function/ACL coverage. A readable archive is not a restored-backup proof. Prepare a new guarded recovery workflow that explicitly supports the 17-entry source, not a patched old receipt.
4. Restore only to an approved new disposable database on independently verified private cluster port **55440**, system identifier `7695735287099484548`. Stop on unknown owner/role mappings. `--no-privileges` loses the immutable-function PUBLIC revocation: restore the exact archived restriction with the existing security helper, then verify all function ACLs and main-equivalent least privilege. Never enable elevated rights to make a check pass.
5. Compare all 24 tables with consistent UTC row fingerprints/counts, ledger hashes/IDs, both sequences, constraints/indexes, function bodies/owners/search paths/EXECUTE ACLs, triggers, RLS and grants. Verify cross-user denial, exams/deadlines/grades, lesson deletion/revision immutability and media references on disposable records only. Transactionally roll back fixture mutations and prove unchanged originals. Counts alone are insufficient.
6. S3 objects require a separate durable private backup/versioned snapshot, including `ccna-lessons/` delivery, thumbnail and retained-original objects. Preserve object bytes, keys, checksums and metadata. Restore a copy into a separate private bucket, then compare hashes and authorized retrieval there. Database metadata is not a binary backup. Approve provider-specific snapshot/restore commands separately; no destructive synchronization or deletion is authorized.
7. Retain the latest verified pre-change archive, one verified current archive and their matching object backup/evidence. Avoid repeat backups when the same valid snapshot suffices. Never delete old archives without separate review/approval. After any real restore/cutover, reconcile newer writes; do not overwrite a live database with an older archive.

## Exact candidate commands — require operator approval; NOT run here

```powershell
# Read-only live baseline check, no schema/data changes:
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode check -SystemIdentifier 7694701597474139084

# Set $archive to a NEW approved private path; do not overwrite an archive.
pg_dump.exe -h 127.0.0.1 -p 5432 -U ccna_phase6a_migrator -d ccna_phase6a_dev -W --format=custom --file=$archive
Get-FileHash -LiteralPath $archive -Algorithm SHA256
pg_restore.exe --list $archive
# Full decode only; does not connect or restore:
pg_restore.exe --file=NUL $archive

# Offline reconciliation plan; no secrets/connection required:
node tools/media-reconciliation.mjs --plan
# Only after a separate READ-ONLY DB + storage inspection approval:
node tools/media-reconciliation.mjs --check --confirm-read-only-main-and-storage
```

The live reconciliation command requires server-only `MEDIA_RECONCILE_DATABASE_URL`, `LESSON_MEDIA_S3_ENDPOINT`, `LESSON_MEDIA_S3_REGION`, `LESSON_MEDIA_S3_BUCKET`, `LESSON_MEDIA_S3_ACCESS_KEY_ID`, `LESSON_MEDIA_S3_SECRET_ACCESS_KEY` injected locally through an approved credential mechanism, never literal values in commands. It pins main identity, 17-entry source/ledger and bucket; reads a repeatable-read READ ONLY metadata snapshot then paginates S3 listing with no writes/retries. It reports counts and opaque missing/orphan candidate keys only. Concurrent writes can create temporary differences; orphan candidates are never deletion authorization. It does not verify object bytes.

No post-0017 restored-recovery executor is certified yet. Therefore no restore command is offered for direct execution: prepare/review that guard and obtain isolated restore approval first. Neither the old Exam migration rehearsal nor this runbook authorizes main restoration or migration.
