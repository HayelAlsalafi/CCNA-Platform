# Post-0013 startup guard compatibility fix

Date: 28 October 2026.

## Confirmed root cause

`tools/phase6a-local/upgrade.mjs`, `upgradeSnapshots()`, selected
`examSnapshot(root)` whenever the official journal contained 13 entries. This
assumption predates the approved lesson-only migration chain. Both API and web
startup call `verifyRuntimeLedger()`, which uses this snapshot in
`verifyUpgradeState()` / `assertSchemaCatalog()` before opening the runtime pool.

The official journal now has entries 0000–0011 followed by
`0013_learning_lessons` at index 12. Exam proposal 0012 was not applied.
The incorrect expected inventory had `exam_sessions` and `exam_session_items`;
the approved post-0013 inventory instead has `lessons` and `lesson_revisions`.
The other 17 tables are common. Both inventories contain 19 tables, so the count
alone cannot distinguish them. Ordinary relation kind `r` and owner
`ccna_phase6a_migrator` remain mandatory for every table.

Successful activation receipt reviewed:
`.local/question-bank-upgrade/lessons-2026-10-27T21-10-38.180Z-0491c14c-c71d-44c5-9cda-ab24e32aeadf/activation-2f530344-822a-44b2-823d-473cdd386ffe/activation.json`.
It records COMMITTED, sourcePromoted, 13 ledger entries, preserved original rows
and question sequence, and lessonsActivated. Before COMMIT, the reviewed executor
verified the exact lesson catalog, constraints/indexes, immutable revision function
and trigger, and precise runtime grants. This receipt is evidence from activation;
it is not a new live catalog inspection after the reported startup failure.

## Minimal correction and security guarantees

`upgradeSnapshots()` now resolves the exact source manifest using
`migrationManifest(root)`. Its hashes, timestamps, entry indexes and pinned
metadata must validate before `isLessonChain()` can select `lessonSnapshot(root)`.
The existing exam branch remains available only for its separately reviewed chain.

No acceptance rule in `assertSchemaCatalog()`, ledger comparison, identity checks,
runtime permissions or role isolation changed. There is no wildcard inventory,
relaxed ownership, suppressed error, new grant or migration. Columns, NOT NULL,
primary/foreign keys, CHECK constraints, indexes, enums and sequences continue to
be verified against the pinned selected schema.

Files changed:

- `tools/phase6a-local/upgrade.mjs`: select lesson versus exam snapshot by validated
  migration identity instead of assuming the entry count identifies the schema.
- `tools/phase6a-local/runtime-ledger.test.mjs`: regression test for exact promoted
  lesson snapshot and negative tests for missing/unexpected tables, kind and owner.
- This report.

## Focused verification

`node --test tools/phase6a-local/runtime-ledger.test.mjs`: **12 passed, 0 failed**.
Includes separate READ ONLY migrator verification for API/web/check, ledger-hash
drift rejection, target rejection, credential isolation and new inventory tests.
`node --check tools/phase6a-local/upgrade.mjs`: PASS.
`node tools/check-admin.mjs`: PASS for API, frontend, DB schema and API-client
TypeScript. Scoped diff inspection: PASS. The validated source manifest has exactly
13 entries and the selected snapshot equals the promoted 0013 snapshot, with 19
tables and the approved migration hash. The operator subsequently confirmed both
guarded launchers work. The full test suite was not repeated.

## Live verification and startup

Use existing hidden credential prompts; do not read stored secrets or send keys
in chat. Run from `<repository-root>` in separate terminals:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Each command first performs existing read-only identity, complete ledger and
schema checks with the separately supplied migrator credential, then validates the
API role's exact runtime privileges. The API continues using only
`ccna_phase6a_app`. No application-role ledger access is granted.
The intended target remains `127.0.0.1:5432/ccna_phase6a_dev`, system identifier
`7694701597474139084`; approved 0013 SQL SHA-256 is
`e85ace211e7feb28183c3f9a9e7822bd437b060c81717be2aeb4739df0d394a3`.

If startup stops, retain the sanitized stage/error and do not bypass the guard.
The operator confirmed normal startup following this fix. Because both guarded
launchers completed, their live ledger/schema/ownership and runtime-permission
preflights passed; credentials were entered only locally. Independently performed
HTTP checks returned 200 for `http://127.0.0.1:3000/api/healthz` and its frontend
proxy at `http://127.0.0.1:8080/api/healthz`, both JSON. The frontend returned 200
HTML for `/admin/lessons`; this verifies SPA delivery, not signed-in Admin access.
Actual authenticated lesson creation/saving/reopening/publishing and learner
reading remain **NOT VERIFIED**. No new lesson or learner record was created by
this source fix.

No application database writes, permission changes, migration changes, resets,
commits or pushes were performed for this fix. Existing uncommitted work is retained.
