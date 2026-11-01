# Multiple answers and universal permanent question deletion

## Post-activation runtime inventory correction

The operator's committed activation report confirms all eleven migrations and preservation checks passed. A subsequent API start stopped at `postgres-table-inventory`. `preflight()` in `tools/phase6a-local/policy.mjs` used `information_schema.tables` as the app role; that view hides `question_deletion_audits` because its intentionally restricted table/column privileges are absent. Expecting that table in the same result was inconsistent with the approved audit isolation policy.

Runtime inventory now reads public relation names/kinds from `pg_catalog.pg_class`/`pg_namespace`, requires the exact reviewed inventory and ordinary table kinds, and then runs the unchanged role/function/audit privilege guards. Missing/extra tables and nonordinary replacements still fail closed. Diagnostics show only sanitized missing/unexpected identifiers. Initial-provisioning checks remain unchanged. No audit-table grant, application database connection, migration, data change or server restart was performed for this fix.

Validation: 221 offline policy/upgrade/runtime tests passed, including five new inventory regressions; Node syntax and focused Git whitespace checks passed. The older learning-policy test was updated to validate the promoted eleven-entry source through the existing strict manifest validator. Live startup remains to be checked by rerunning the normal API launcher with its existing hidden prompts. Do not rerun `-Apply` or cleanup.

Current status: the operator reported successful application activation with eleven ledger entries, verified backup/restoration and preserved original rows/sequence; zero real questions were deleted by activation. The preparation/approval procedure below is retained as an execution record, not an instruction to run activation again. Remaining live work is runtime startup and authenticated UI verification.

## Confirmed application baseline

The operator ran `tools/invoke-question-bank-upgrade.ps1 -Check` on 2026-10-15. Its sanitized result verified PostgreSQL 18.6, `127.0.0.1:5432`, database `ccna_phase6a_dev`, migrator `ccna_phase6a_migrator`, system identifier `7694701597474139084`, installed data directory `C:/Program Files/PostgreSQL/18/data`, and the exact seven-entry 0000–0006 ledger. Identity, role, schema, history-function and prerequisite checks passed with zero database writes. The existing API and frontend must be restarted after activation to load current source.

The official source journal is still seven entries. Staging/proposed metadata does **not** mean any migration is applied. The guarded sequence is:

| Migration | Change |
|---|---|
| 0007 | Persistent learning sessions/items and deferred final grading |
| 0008 | Achievement definitions and awards; creates seven versioned definitions, no learner awards |
| 0009 | New question-type enum supporting single/multiple answers; widens serialized selections and updates snapshot/attempt validators |
| 0010 | Restricted deletion audits/recovery payloads, session tombstones and controlled deletion wrappers |

0009 retains the original enum and immutable historical snapshots. Editing preserves question UUID/code and captures a new revision through the existing save architecture. Historical deliveries continue to grade their original revision. Required selection count is configured in the editor and must equal the number of marked correct options; the server derives that count from the immutable correct set rather than storing a conflicting second source of truth. Single answers use one key; multiple selections use canonical distinct JSON keys and complete-set grading independent of order.

## Operator commands and approval gate

Read-only inspection, safe to run without migration approval:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/invoke-question-bank-upgrade.ps1 -Check
```

**Only after explicit approval of migrations 0007–0010 and the grants below**, stop the API/web terminals with Ctrl+C to avoid serving requests during schema activation. Do not stop PostgreSQL. Then run once:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/invoke-question-bank-upgrade.ps1 -Apply
```

The only hidden prompt is for the known migrator password. No environment files, application credentials or Clerk keys are read. Do not send credentials in chat. Do not retry automatically after any failed stage.

The command:

1. Verifies exact workspace, main/HEAD, migration bytes/order/metadata, installed service/listener, PostgreSQL 18.6 identity, role attributes, ownership and a reviewed 7/8/9/10-entry ledger/schema prefix. Refuses partial/unexpected schemas and already-completed execution.
2. Locks existing application tables and ledger, rechecks the baseline, fingerprints every existing row and the question-code sequence.
3. Creates a full custom-format `pg_dump` using an exported snapshot. Protects the backup folder for the current Windows user and SYSTEM. Verifies SHA-256, TOC and complete archive decoding.
4. Restores decoded public-table COPY values into the previously approved **empty** private database `ccna_drizzle_check_20261012_c08f12ad34b6` at `127.0.0.1:55440`, with its exact owner/marker/executable/data-directory/listener/HBA checks. Applies only the baseline schema using pinned migrations in an outer transaction. Every restored table count/hash must match. All changes roll back; original ledger and empty tables are rechecked. The exact temporary HBA rule is restored byte-for-byte. No new cluster/database is created and neither populated rehearsal database is connected to.
5. Promotes exact missing SQL/snapshot files and writes the ordered official journal last. Existing conflicting files cause refusal. It never rewrites historical SQL or ledger entries.
6. Applies the official Drizzle migrator on the same verified application connection inside an outer transaction using savepoint-bound migration boundaries; applies only pending prerequisites and 0009/0010.
7. Applies narrowly scoped runtime grants, checks exact schema/functions/trigger column bindings/ACLs, verifies all original rows and question-code sequence unchanged, and proves repeat migrator execution is a no-op before COMMIT.
8. Checks identity/ledger again in a read-only transaction. Reports `committed:true`, `stage:complete`, `ledgerEntries:11`, preserved tables, `realQuestionsDeleted:0`, `multipleAnswersReady:true`, and `controlledDeletionReady:true` only after verification.

Reports and backup stay under `.local/question-bank-upgrade/<timestamp>/`. A commit acknowledgement failure reports an unknown outcome and requires inspection, not an automatic retry. Source promotion is a filesystem action and cannot roll back with PostgreSQL: if SQL fails after promotion, the source journal may be eleven entries while the database remains seven. Preserve the report/backup and resolve the failed invariant before running any startup/migration again. No automatic source reset or database restoration occurs.

Runtime grants included in approval:

- If 0007 is pending: SELECT/INSERT on the two session tables; column UPDATE only on session status/completed_at and item selected_option_key/flagged.
- If 0008 is pending: SELECT on achievement definitions and SELECT/INSERT on learner awards.
- EXECUTE on `delete_question_without_learner_history(uuid,uuid)` for `ccna_phase6a_app`. Existing EXECUTE on `delete_question_with_history(uuid,uuid)` is retained and verified.
- USAGE only on the new `public.question_type_v2` enum for `ccna_phase6a_app`, consistent with the bootstrap's revoked PUBLIC type defaults. Grading trigger functions retain revoked PUBLIC/runtime execution; triggers still execute under PostgreSQL's existing trigger rules.
- No direct history DELETE/UPDATE/TRUNCATE, no audit/recovery table privileges, no EXECUTE on the internal deletion implementation, no role changes or unrestricted DELETE grants.

The older private test ledger has exactly the previously reviewed CRLF 0004 hash. A separate exact-target validator permits that historical disposable prefix only; the application ledger must continue to match the verified LF hash. No ledger is edited. Migration 0007/0008 pins retain their existing CRLF bytes; Git attributes preserve those bytes, while 0009/0010 SQL and new snapshots use LF.

## Deletion behavior and shared-session impact

`/admin/questions` retains the current design and server-controlled Admin authorization. The deletion policy is `permanent-only-v2`; topic deletion retains v1. No original-pilot UUID protection is used by the question deletion path. Both existing and future questions are eligible when explicitly selected and confirmed.

Every question deletion first requests a dependency preview listing code, revisions, deliveries, attempts and session positions. Ordinary confirmation physically deletes the question, options, objective mappings and exclusively owned revisions **only if no learner attempts, deliveries or session items exist**. Mere revisions no longer make ordinary deletion impossible.

Learner history/session membership requires a second dialog, the exact phrase `DELETE QUESTIONS AND THEIR HISTORY`, and a history-loss checkbox. Preview tokens last five minutes, are one-use, and bind the exact question/history fingerprint to the authenticated Admin database UUID and Clerk session. Changes to content, history or parent sessions invalidate the preview.

Controlled deletion locks sessions/questions, verifies active Admin again in PostgreSQL, captures a hash-checked recovery payload/audit, temporarily permits DELETE only on the selected owned immutable records, removes those attempts/deliveries/revisions/mappings/options, and deletes the actual `questions` row. It verifies physical absence before returning. FK enforcement and append-only protections remain enabled throughout. Corrupt cross-question ownership or unknown FKs remain BLOCKED with their safe constraint names; they are never bypassed.

Shared sessions are never deleted or rewritten by deletion. Only selected item positions become tombstones: question/revision/delivery IDs, selection and domain snapshots are cleared; code, deletion time and restricted audit reference remain. Unrelated items and parent sessions retain their original values. Learners see a removed-content placeholder rather than a broken revision join. An affected active session cannot resume or grade and can be abandoned; learners start a new session to continue. Completed sessions show remaining results and removed-content positions. Deleted attempts no longer contribute to recalculated progress. Previously earned badge records and unrelated learner data are retained.

This is physical deletion from active question/history tables, with an explicit restricted recovery backup—not a DISABLED/ARCHIVED substitution. Audit/recovery rows contain answer-bearing content and learner IDs, so neither the API role nor PUBLIC can read them; learner DTOs never expose them. They have no FK to the deleted question/Admin account. Audit UPDATE/DELETE/TRUNCATE is rejected by the immutable trigger.

Ordinary bulk deletion uses per-item savepoints for expected BLOCKED dependencies, and rolls back the entire batch on unexpected failure. Explicit history deletion is all-or-nothing across the previewed selection. Responses are `DELETED`, `BLOCKED`, or `FAILED`; committed deletion receipts include audit UUIDs. Admin caches, lists and counts refresh, with green success only when there are no blocked/failed outcomes. Lost commit acknowledgements never imply success or an automatic retry; refresh/review is required.

## Recovery

Before COMMIT, any failed migration/data invariant rolls back the application transaction. Sequence values in the **disposable** database may advance despite rollback; no application question-code sequence advancement is permitted by the upgrade. The restore proof does not execute archive setval statements. Keep the full dump and its SHA-256; never overwrite the current application database as an automatic recovery step.

After a committed migration/deletion, recovery needs a separately approved operator procedure. For full recovery, first provision an explicitly approved **new empty recovery target**, restore the full dump there, validate all rows/ledger/ownership/privileges and sequence values, then review a selective recovery/cutover plan. No recovery target creation, database drop/reset, or live restore is authorized by this implementation.

For a specific post-0010 deletion, the restricted audit payload preserves the exact question/options/mappings/revisions/deliveries/attempts/session-item rows and a PostgreSQL SHA-256 of their canonical JSON. An operator must verify that hash, question/audit identity, expected tombstone positions, retained parent sessions/users/topics/objectives and absence of UUID/code conflicts before restoring anything. Recover dependencies in FK order inside a transaction and compare restored row hashes before commit; restoring expired historical attempts may require a separately reviewed restoration-only insertion-policy procedure. Never grant runtime access to the payload or disable FKs/immutable-history guards. A synthetic selected-row restoration proof was executed and rolled back in the isolated tests; no generic live selective-restore command is provided.

## Validation performed

- `node tools/run-curriculum-tests.mjs`: 618 tests across 43 suites passed (API authorization, editor/create/edit, preview, selection/grading, history, deletion UI, cache refresh, failure/confirmation regressions).
- Node policy/launcher/upgrade suites: 216 tests passed, including 21 new question-bank policy/promotion tests (final rerun recorded in task report).
- `node tools/run-admin-practice-disposable.mjs --execute-editor`: 1 passed, 11 intentionally skipped; actual PostgreSQL single-to-multiple edit, preserved UUID/code/old revision, complete-set grading, wrong/forged answer rejection and final submission.
- `node tools/run-question-bank-disposable.mjs --execute-isolated`: 10 passed, rollback-only, including official migrator/repeat, populated-history preservation, actual deletion of synthetic published/draft/single/multiple/revision-only/history questions, original-pilot-style UUID eligibility, bulk/rollback, non-Admin/inactive-Admin denial, shared-session tombstones and selected-row recovery.
- The runner also created a full archive of the empty existing disposable database, decoded/restored all eleven public tables with matching row hashes and rolled back. This is a restore-workflow self-test; application backup/restoration remains pending the approved activation command.
- API/frontend/schema/client TypeScript checks passed. Production frontend build passed with existing sourcemap and chunk-size warnings.
- No live Admin-browser operation or application multiple-answer persistence/deletion is claimed before activation. Final post-activation authenticated UI verification remains required. Private fixture connections used the owner role; exact runtime ACL checks are implemented and exercised with offline fixtures, and must pass against the live roles during activation.

Repeat offline validation (no application connection):

```powershell
node tools/execute-question-bank-upgrade.mjs --plan
node tools/run-question-bank-disposable.mjs --plan
node tools/run-curriculum-tests.mjs
node --test tools/question-bank-policy.test.mjs tools/phase6a-local/policy.test.mjs tools/phase6a-local/upgrade.test.mjs tools/phase6a-local/runtime-ledger.test.mjs tools/nexus-policy.test.mjs tools/learning-policy.test.mjs
node tools/check-admin.mjs
node tools/build-admin-ui.mjs
```

## Restart and browser verification after approved activation

Run `-Check` again: expect eleven ledger entries, no pending migrations, `databaseWrites:0`. `ready:false` means no upgrade remains; it does not mean runtime failure.

Start API and frontend in separate PowerShell terminals, keeping both open:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

The runtime launcher prompts separately for app and read-only migrator ledger credentials, then the existing Clerk development keys. Do not change keys or reuse account passwords automatically. If a port is occupied, identify its process; do not kill it automatically.

At `http://localhost:8080/admin/questions`, edit only an explicitly chosen question: select Multiple Answers, configure two required selections, mark UDP/TCP correct, save, reopen and verify persisted UUID/code/type/options and a new revision. Admin Student Preview must use checkboxes; singles retain radios. In Network Challenge Arena and Practice, incomplete sets must be rejected, complete reversed-order sets must grade correctly, and results/history must reflect the original delivered revision. Creating temporary browser fixtures or deleting any actual question/history still needs explicit authorization of those records; the automated tests used only synthetic isolated records.

For an already-authorized real deletion, select the exact question(s), review displayed codes/dependencies, use ordinary confirmation or the second history-loss dialog as applicable, and check committed DELETED receipts/list/count refresh. Do not treat BLOCKED/FAILED or a lost response as physical absence. No real records were used for deletion verification in this task.

## File inventory for this change

- Proposed `0010_universal_question_deletion.sql`, `proposed/meta/0010_snapshot.json`, `0010_journal.json`; schema `question-deletion-audits.ts`, `nexus-sessions.ts`, schema exports.
- API `admin-history-delete.ts`, `admin-questions.ts`, `nexus.ts`; associated API/authorization tests.
- UI `admin-delete-controls.tsx`, deletion/studio tests, Nexus practice/history tombstone handling and Nexus API-client types.
- Guarded local launcher `policy.mjs`, `run.mjs`, `upgrade.mjs`, `.gitattributes` for exact migration byte handling.
- `prepare-question-bank-migration.mjs`, `question-bank-policy.mjs`/tests, `question-bank-upgrade-core.mjs`, `execute-question-bank-upgrade.mjs`, `invoke-question-bank-upgrade.ps1`, disposable access/restore/self-test/config/runner/fixture tools.
- This document. Existing 0009 editor implementation and historical migrations are retained; no lockfile, secrets, commits or application records were changed by this task.
