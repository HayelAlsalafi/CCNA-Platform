# Final cleanup provenance mismatch diagnosis

The failed `2026-10-14T08-06-36-164Z/report.json` confirms `committed: false`, PostgreSQL 18.6, the pinned system identifier, local database and migrator role. The failure occurred at the first disposable-row comparison (`questions`) in `verifyDisposableOwnership`, before backup, official migration, function grant or deletion. The executor's catch rolls back the transaction.

The existing report contains neither differing UUIDs nor field values. It cannot prove drift versus a comparison defect. No timestamp/content field is ignored, no new hash is accepted and the guarded cleanup has not been retried.

## Read-only operator evidence

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase8a-cleanup/diagnose-provenance.ps1
```

Use only the known migrator credential at the hidden prompt. Share the sanitized output or report path; never credentials. The separate diagnostic never imports the cleanup executor. It verifies the exact workspace/main/HEAD, server identity, role attributes, six-entry historical ledger and schema, then uses a repeatable-read **READ ONLY** transaction. It performs no migrations, grants, locks for deletion or database writes. Local reports are ACL-restricted under `.local/final-legacy-diagnosis/`.

`disposableDifferences` uses the same canonical field comparison as the existing deletion guard and reports all mismatching row identities/fields. Safe catalog metadata (UUIDs, codes, enum values, timestamps) is shown exactly. Arbitrary content, snapshots, answers, learner identifiers and session identifiers are represented by SHA-256 and byte count. Timestamps retain microseconds; equivalent timezone representations compare equal.

The report independently checks the 60 pilot educational-content fingerprints against the original pack, compares their exact UUIDs and required topic UUIDs with the fixed baseline, and proves deletion-set disjointness. It also compares original-backup pilot parent/options/mapping/topic fingerprints, separately from educational content, so metadata drift is visible.

Do not rerun `invoke-final.ps1` until those differences have been inspected and attributed. Any correction must preserve the exact UUID set, all pilot checks, immutable-history ownership proof and strict row comparison. If a verified disposable metadata change requires an amendment, pin only independently verified old/new values for the exact UUID/field; never ignore an entire timestamp column or accept arbitrary current hashes. Ambiguous content/history changes remain blockers.

## Actual offline results

- 358 database-free tests passed across 31 files, including five new diagnostic regressions.
- JavaScript and hidden-prompt PowerShell syntax checks passed.
- Offline decoding of the original backup verified SHA-256 `de76195778fbe3a57d940892ee71f1904ec3d94aa6c8fd8d773657d438ce1d13`.
- All 60 archived pilot content fingerprints match the original pack; exact 60/24 versus 75/78 UUID baselines match with zero overlap. Aggregated pilot evidence SHA-256: `c51110dd1f51510e08e25aeaeab7392c9ff8a53bc854365302d696d80f04a10d`.
- No live database was connected to by the agent during this investigation. Current differing values and the live pilot evidence require the operator's SELECT-only report; the historical proof does not establish current values.

## Resolved timestamp drift

The SELECT-only live report `2026-10-14T08-37-27-017Z` confirmed exactly 23 differences: updated_at on twenty disposable questions and three obsolete topics. All other disposable content/options/mapping/history fields match the archive. The backup predates these metadata updates; the comparator correctly refused genuine changes. This is not a timezone, hash or comparison defect. Existing Admin disable/update handlers set updated_at, consistent with the earlier archive/disable activity, but timestamps alone do not prove which individual action wrote them.

The live report independently matched all sixty original pilot educational-content fingerprints and the full pilot parent/options/mapping/topic fingerprints against the original backup. All pilot questions are published, all twenty-four required topics active, and both deletion-set overlaps zero. The live read-only counts were 135 questions and 102 topics. The evidence report SHA-256 is 2d6e3503432c02b079137fcfc83a48eb64e4c0f4442f755650507755f406abb1.

`final-provenance-amendments.json` pins only the following exact UUID/updated_at old/new pairs, backed by that independently checked report and the original archive hash. Its raw SHA-256 is ef060c6b46041a6ef33a5a6bd7082b6c5978c9723ac95ef047fdb410120d1974. The original archive value must match before an expected-row amendment is applied. Any third timestamp, other field change, unknown UUID or history drift still stops cleanup. No timestamp column is ignored, and no database value is updated by the amendment.

All values below are normalized UTC, preserving PostgreSQL microseconds. The field for every row is updated_at.

| Table | UUID | Original archive | Verified current value |
| --- | --- | --- | --- |
| questions | 03a44178-97e4-4231-a539-3af180fe5e11 | 2026-10-11T12:15:46.887Z | 2026-10-13T17:29:01.938Z |
| questions | 1a261298-e196-4a29-ab64-62124e595bf0 | 2026-10-11T12:20:26.256Z | 2026-10-13T17:28:16.919Z |
| questions | 31909a92-c222-4801-a860-8d6488f11900 | 2026-10-11T12:15:46.892Z | 2026-10-13T17:28:16.92Z |
| questions | 34db915a-ffe6-44d3-86cd-0d6f68237101 | 2026-10-11T12:15:46.915Z | 2026-10-13T17:28:16.921Z |
| questions | 370fe0e1-3d6e-41d9-b272-60ed1f311d99 | 2026-10-11T12:35:19.856Z | 2026-10-13T17:28:16.922Z |
| questions | 371f2a77-3658-4bfc-89a7-9e3929b34633 | 2026-10-11T12:24:54.273Z | 2026-10-13T17:28:16.923Z |
| questions | 3ddffec2-a833-4518-b338-7b7729be1de7 | 2026-10-11T12:33:35.215Z | 2026-10-13T17:28:16.925Z |
| questions | 4e853e01-ce1a-40ef-b8d1-551f68c6c7a3 | 2026-10-11T12:15:46.896Z | 2026-10-13T17:28:16.926Z |
| questions | 6d4ece2f-e802-446f-b822-6cbf8a6b6274 | 2026-10-11T12:31:03.67Z | 2026-10-13T17:28:16.927Z |
| questions | 71b924f2-701b-4bbc-8050-5faad5ee6d94 | 2026-10-11T12:15:46.92Z | 2026-10-13T17:28:16.928Z |
| questions | 7b985558-7c56-427d-b24b-1c2b12e5efc9 | 2026-10-11T12:25:12.816Z | 2026-10-13T17:28:16.929Z |
| questions | 88c1fb65-de85-4d82-a27f-5ede052f3b1e | 2026-10-11T12:30:58.755Z | 2026-10-13T17:28:16.929Z |
| questions | 9b872189-26ef-474e-b8bc-3a2000fac33c | 2026-10-11T12:32:07.114Z | 2026-10-13T17:28:16.93Z |
| questions | 9dbd200b-6983-468b-966b-8366d28223e0 | 2026-10-11T12:15:46.925Z | 2026-10-13T17:28:16.931Z |
| questions | 9e35fe2e-9840-43c8-b1bb-b472dac84f69 | 2026-10-11T12:34:23.042496Z | 2026-10-13T17:28:16.932Z |
| questions | a1a61d90-33d8-4eb6-bdf9-48c5482d1dd1 | 2026-10-11T12:24:52.057Z | 2026-10-13T17:28:16.933Z |
| questions | c56dc456-52ec-46cd-a504-90d2e8bb284d | 2026-10-11T12:15:46.907Z | 2026-10-13T17:28:16.934Z |
| questions | d46d4881-dcd0-4b93-bfe9-c2472e234296 | 2026-10-11T12:31:26.399Z | 2026-10-13T17:28:16.934Z |
| questions | d704910b-4fdc-462f-9f8a-8b97d63678bd | 2026-10-11T12:15:46.902Z | 2026-10-13T17:28:16.935Z |
| questions | f24cba52-25ef-4333-8567-1c5c3649ff23 | 2026-10-11T12:36:42.633Z | 2026-10-13T17:28:16.936Z |
| topics | 01aca52d-3b7d-4b1c-b084-fa71eef4d507 | 2026-10-11T12:15:46.946Z | 2026-10-13T20:16:35.446Z |
| topics | 76070780-14a4-464f-aca9-71e417338927 | 2026-10-11T06:22:02.367Z | 2026-10-13T17:25:05.984Z |
| topics | a29d0290-817d-4ce3-9cdd-1b4707794d6b | 2026-10-11T06:21:53.713294Z | 2026-10-13T20:14:27.941Z |

Validation after the correction: 360 database-free tests passed across 31 files; seven isolated PostgreSQL groups passed, including exact 75/78 deletion with the 23 metadata pairs simulated only in rollback fixture copies and unchanged pilot fingerprints. Syntax checks and inert plan passed. The HBA allowance was restored byte-for-byte. No live cleanup was retried, no migration SQL or metadata was altered by this correction. It is safe to run the existing authorized `invoke-final.ps1` manually once; its full backup/identity/preservation/dependency checks remain mandatory and fail closed on any later change. Do not retry automatically after failure.
