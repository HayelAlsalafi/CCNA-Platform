# Runtime ledger permission correction after committed cleanup

The committed report `.local/final-legacy-cleanup/2026-10-14T12-09-41-069Z/report.json` verifies physical deletion of 75 legacy questions, 78 topics, 163 revisions, 99 deliveries and 53 attempts. Post-commit SELECTs verify exactly 60 published pilot questions, 24 required topics and six domains. All 33 configured chapters, pilot content/history, users, sequence and FK/trigger bindings remain unchanged; orphan count is zero. The backup SHA-256 was independently recomputed as `36ff138261a013e743232e2d4a0e91e28dc247a26ac00decc7fdc3ea440fd448`. All eleven restored application-table counts/hashes matched in the disposable transaction before rollback. **Cleanup is complete; never rerun it to repair runtime startup.**

The API failed with SQLSTATE 42501 at `runtime-migration-ledger`. The new `runtimePrivileges()` implementation incorrectly selected `drizzle.__drizzle_migrations` using `ccna_phase6a_app`, while `assertRuntimePrivileges()` correctly requires `ledger_access: false`. The ledger permission denial is intentional. No ledger USAGE/SELECT grant should be added to the application role.

`runtime-ledger.mjs` now performs the exact seven-entry ledger/schema verification on an independently identity-checked **READ ONLY** migrator connection, then rolls back and closes it. This is verification only: no migrator/migration execution is imported by that helper. The normal app-role preflight remains intact, including forbidden ledger access and history writes, exact identity/table inventory and controlled-delete function ownership/ACL checks. The private migrator credential is stripped from the runtime configuration before application connection/environment construction. No stored secrets are read and no roles/privileges/database records were changed for this fix.

## Start API and frontend

Close old service processes with Ctrl+C in their own terminals. Do not terminate unidentified processes. In terminal 1:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Hidden prompts request the known `ccna_phase6a_app` password, then the known `ccna_phase6a_migrator` password for SELECT-only verification, then existing Clerk development publishable and secret keys. The API pool runs as `ccna_phase6a_app` only. Leave this terminal open once API port 3000 is reported.

In terminal 2:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

The same two database-role passwords are separately prompted; frontend needs only the existing Clerk publishable key. The frontend receives neither database credentials nor the Clerk secret key. Leave the terminal open; browse `http://localhost:8080/`, `/topics`, `/practice`, or `/admin` with the existing signed-in account.

Safe service checks in a third terminal:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/healthz'
Invoke-RestMethod -Uri 'http://localhost:8080/api/healthz'
(Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:8080/topics').StatusCode
```

The final check proves frontend routing, not authenticated curriculum rendering. Verify the six domains and 33 chapters after signing in. Do not paste credentials or authenticated request tokens. If startup fails, share only its sanitized stage/code; no automatic grants or retry fallback is performed.

## Actual tests

217 offline launcher/catalog tests passed, including seven new regressions for separate-role READ ONLY verification, seven-entry integrity, connection closure, missing credential refusal, wrong target refusal, no fallback and no migrator credential in runtime environment. JavaScript and PowerShell syntax checks passed. Tests mock database clients and OS state; the agent did not connect to the application database or start services. Live startup and endpoint results require the operator's hidden-prompt command.
