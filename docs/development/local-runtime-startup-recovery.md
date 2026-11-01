# Local runtime startup after taxonomy migration

Verified workspace `<repository-root>`, `main`, HEAD `03b14526aae448e49eacd602a43bfb0e355aca4d`. Existing work is preserved. No live database connection, migration, grant, seed, process termination or server startup was performed for this investigation.

## Findings and limits

The demonstrated launcher defect is inaccurate diagnostic staging in `tools/phase6a-local/run.mjs`: after successful `preflight()`, closing its connection, testing API port 3000, verifying the existing API process and testing web port 8080 could still fail under `Startup phase: postgres-preflight`. A child OS-verifier error was also reduced to a generic `Error`, hiding the failed invariant.

The current **OS-only** `verify-service.ps1 -CheckApi` run confirms `api-process-metadata`. The PostgreSQL service/listener checks passed. Windows returned PID 31536 as `node.exe`, parent PID 17060, created October 12, 2026 at 19:28:51 in the displayed local time, but did not expose its executable path or command line. Missing metadata cannot establish a mismatch or a valid runtime identity; the guard correctly refuses it. That process owns `127.0.0.1:3000`; no listener on 8080 was found. Its database-free `/api/healthz` returned `{"status":"ok"}`. A 404 at `/` is normal: the health route is `/api/healthz`, not the root. Health success does not establish process identity, current code or Admin authorization.

This is a confirmed blocker in the web startup's post-database OS check, consistent with the earlier generic failure. No live database preflight was rerun, so additional database/configuration issues cannot be ruled out. Source review and offline tests establish the following:

| Startup invariant               | Result                                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local migration source manifest | Six reviewed journal entries/source hashes pass offline validation. No migration changes.                                                                                                                                                             |
| Live migration ledger           | NOT VERIFIED here. Runtime API/web preflight does not read the ledger; `drizzle` USAGE is intentionally forbidden for the runtime role. Ledger verification belongs to the existing migrator/upgrade checks. No ledger check was removed or bypassed. |
| Table inventory                 | Runtime expects the exact sorted eleven-table inventory, including all four taxonomy tables. Actual live inventory NOT VERIFIED.                                                                                                                      |
| PostgreSQL identity/role        | Database, session role, IPv4 address, port, PostgreSQL 18, data directory, supplied system identifier and absence of Neon metadata remain checked. SQL identity/role results NOT VERIFIED here; OS service/listener passed.                           |
| Runtime privileges              | Approved taxonomy grants are already compatible with `runtimePrivileges()` / `taxonomyPrivileges()` and `assertRuntimePrivileges()`. Actual live ACLs NOT VERIFIED.                                                                                   |
| Clerk                           | Existing exact development instance and key-type checks, frontend secret exclusion and environment whitelist retained. No actual keys were accessed or changed.                                                                                       |
| API port                        | Occupied by PID 31536; this explains `EADDRINUSE` for a second API startup.                                                                                                                                                                           |
| Web's API process check         | Refused because executable/command-line metadata is unavailable. Exact Node executable, guarded launcher suffix and single IPv4 loopback listener are still required.                                                                                 |
| Web port                        | No 8080 listener observed. The web process has not reached listening.                                                                                                                                                                                 |

The approved taxonomy privileges are SELECT/INSERT/UPDATE on `exam_blueprints`, `exam_domains`, `exam_objectives` and `question_objectives`, DELETE only on `question_objectives`, public-schema and enum USAGE, and existing question-code sequence USAGE. Catalog DELETE, TRUNCATE, REFERENCES, TRIGGER and sequence UPDATE remain forbidden. Original catalog/profile/history/revision/delivery checks remain unchanged. **No grant-policy relaxation was justified or made.**

## Minimal changes

- `tools/phase6a-local/run.mjs`: accurate workspace/manifest/preflight/connection-close/API identity/port/environment stages; only whitelisted OS-invariant labels from child errors; safe missing/unsafe taxonomy privilege names.
- `tools/phase6a-local/policy.mjs`: optional stage observer during read-only preflight; diagnostics identify fixed required/forbidden privilege check names while retaining the same strict boolean requirements; whitelist OS failure labels.
- `tools/phase6a-local/verify-service.ps1`: safe invariant labels and explicit refusal of unavailable API metadata. The executable, command, role/service and listener checks remain intact.
- `tools/phase6a-local/policy.test.mjs`: stage, cleanup, privilege-diagnostic and stderr-sanitization regressions.
- `tools/phase6a-local/runtime-startup.test.mjs`: actual taxonomy reader with a fake driver, exhaustive approved/unauthorized privilege cases, and actual PowerShell verifier with all Windows service/process/listener commands mocked. No database or runtime is started.
- This document: findings, checks and manual recovery instructions.

`invoke.ps1`, application/API/UI source, auth configuration, migration files/journal and grant SQL were not changed.

## Actual validation

- `node --test --test-reporter=spec tools/phase6a-local/policy.test.mjs tools/phase6a-local/upgrade.test.mjs tools/phase6a-local/runtime-startup.test.mjs`: **206 passed, zero failed/skipped**. The installed Drizzle migrator test uses its existing fake driver, not a database. Six intermediate OS-fixture tests initially failed because the fixture variable was scoped to the calling script; correcting the test-only scope produced the passing final suite.
- `node --check` on changed JavaScript/test files: PASS. PowerShell parser-only validation of `verify-service.ps1`: PASS.
- `node tools/build-admin-ui.mjs`: PASS; 1,910 modules, output `.local/admin-ui-production-build/1791870753578`. Same non-fatal sourcemap-location warnings in existing tooltip/sheet/dropdown primitives. No env files or server startup. This is frontend production compilation, not a full API runtime or authenticated deployment test.
- Protected hashes for migrations 0004/0005, journal, `.gitattributes` and taxonomy grant SQL: unchanged. The migration inventory unit test checks all six SQL files.
- OS-only guard: **REFUSED as intended**, invariant `api-process-metadata`. Public API health: PASS. Actual updated API/web startup and live DB ACL verification: **NOT RUN**.

## Exact manual recovery commands

These are operator commands; none of the stop/start/database-preflight commands below were executed during this task. Keep the database and Clerk values in the existing launcher's private prompts. Do not rerun migrations or grants.

First inspect the current listener and process in a PowerShell session that can read the older process's metadata. If properties are null, use a suitably privileged inspection session; do not treat null metadata as proof of identity. Capture the reviewed identity for the later stop check:

```powershell
Set-Location -LiteralPath '<repository-root>'
Get-NetTCPConnection -State Listen -LocalPort 3000,8080 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
$reviewedApi = Get-CimInstance Win32_Process -Filter 'ProcessId = 31536'
$reviewedApi | Select-Object ProcessId,ParentProcessId,CreationDate,Name,ExecutablePath,CommandLine | Format-List
powershell.exe -NoProfile -File tools/phase6a-local/verify-service.ps1 -CheckApi
```

Prefer Ctrl+C in the older API's original terminal. If that is unavailable, **only after explicit approval to stop the reviewed PID**, run the following in the same inspection session. It refuses unreadable metadata, PID reuse, a changed command/path, an unexpected listener or an unrecognized launcher, and prompts before stopping. If the older process uses a different command, stop here and review it rather than editing the checks to accept it.

```powershell
if (!$reviewedApi -or $reviewedApi.Name -ine 'node.exe' -or
    [string]::IsNullOrEmpty($reviewedApi.ExecutablePath) -or
    [string]::IsNullOrEmpty($reviewedApi.CommandLine)) {
  throw 'Reviewed API identity is unavailable; do not stop anything.'
}
$guardSuffix = '"<repository-root>\tools\phase6a-local\run.mjs" api --start'
if (!$reviewedApi.CommandLine.EndsWith($guardSuffix,[StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unrecognized API command; review separately before termination.'
}
$currentApi = Get-CimInstance Win32_Process -Filter 'ProcessId = 31536'
$apiListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction Stop)
if (!$currentApi -or $currentApi.CreationDate -ne $reviewedApi.CreationDate -or
    $currentApi.ExecutablePath -cne $reviewedApi.ExecutablePath -or
    $currentApi.CommandLine -cne $reviewedApi.CommandLine -or
    $currentApi.Name -ine 'node.exe' -or $apiListeners.Count -ne 1 -or
    $apiListeners[0].LocalAddress -ne '127.0.0.1' -or
    $apiListeners[0].OwningProcess -ne 31536) {
  throw 'API identity/listener changed; do not stop anything.'
}
Stop-Process -Id 31536 -Confirm -ErrorAction Stop
```

After the approved stop, confirm that port 3000 is free. Do not kill any other process if it is occupied:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Launch the API, then the frontend in separate terminals under the **same Windows account and privilege level**, so the frontend can inspect the newly started API process. The guarded startup performs read-only DB preflight; it does not apply a migration or grant. Actual server/configuration issues now identify their stage and safe invariant.

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode api -SystemIdentifier 7694701597474139084 -Start
```

Expected success JSON includes `mode:"api"`, `database:"ccna_phase6a_dev"`, `role:"ccna_phase6a_app"`, `clusterFingerprintVerified:true` and `apiPort:3000`.

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Expected success JSON includes `frontendPort:8080` and `proxyTarget:"127.0.0.1:3000"`. If the new process metadata is still unreadable, stop and inspect the Windows access context; do not bypass the process guard.

Verify listeners, direct health, proxy health and SPA routes:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,8080 |
  Select-Object LocalAddress,LocalPort,OwningProcess
powershell.exe -NoProfile -File tools/phase6a-local/verify-service.ps1 -CheckApi
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/healthz' -TimeoutSec 5
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/healthz' -TimeoutSec 5
foreach ($route in @('/admin','/admin/topics','/admin/questions','/admin/taxonomy','/admin/import')) {
  [pscustomobject]@{
    Route = $route
    Status = (Invoke-WebRequest -UseBasicParsing -Uri ('http://127.0.0.1:8080' + $route) -TimeoutSec 5).StatusCode
  }
}
```

Expect exactly one IPv4 loopback listener per service, both health responses `status=ok`, and HTTP 200 for the SPA shells. Shell status is not an authorization test. In the browser, sign in through real Clerk and confirm the actual account role, all five Admin views and successful protected Admin reads. A non-admin must remain denied. Do not save, disable or import questions solely for startup verification.

If a subsequent failure occurs before the API identity stage, the read-only runtime check can isolate it without starting either server:

```powershell
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode check -SystemIdentifier 7694701597474139084
```

This operator-only command connects with the runtime role, verifies identity/table/privilege invariants inside a read-only transaction and returns sanitized output. It was not executed here. Capture only the stage, invariant/check names and permitted error code; do not share credentials or connection strings. A genuine ACL, identity, table or ledger drift needs separate review, not automatic grants or bypasses.
# Frontend native dependency recovery (2026-10-17)

The guarded web launcher reached `frontend-import` after database, identity,
ledger, API-process and port checks. Offline reproduction found that Vite could
not resolve `@rollup/rollup-win32-x64-msvc` and Tailwind could not resolve the
Lightning CSS native binary. Both were already installed in
`.local/native-deps/node_modules`. Setting `NODE_PATH` after Node starts does not
refresh its CommonJS lookup paths, and the native pnpm package directories also
need to be included, as in the existing offline production build helper.

`tools/phase6a-local/frontend.mjs` now loads only existing workspace native paths,
refreshes Node's module lookup paths, then imports the same frontend dependencies.
The launcher retains all database, authentication, listener, configuration and
proxy guards. Failure stages now distinguish `frontend-import-vite`,
`frontend-import-react` and `frontend-import-tailwind`; messages name only the
known dependency and omit raw driver/loader output and credentials. No package
installation, lockfile change, migration or grant is involved.

Verification: 53 focused frontend/runtime/ledger tests passed, including actual
installed native resolution and Vite creation/closure with React and Tailwind in
middleware mode (no listening socket, `configFile:false`, `envDir:false`). Node
syntax checks and `node tools/build-admin-ui.mjs` passed. Production compilation
retains existing source-map and large-chunk warnings. No database connection or
authenticated live website startup was performed for this correction.

Leave the working API running. Start the frontend using its existing hidden
prompts:

```powershell
Set-Location -LiteralPath '<repository-root>'
powershell.exe -NoProfile -File tools/phase6a-local/invoke.ps1 -Mode web -SystemIdentifier 7694701597474139084 -Start
```

Expected sanitized startup output includes `frontendPort:8080` and
`proxyTarget:"127.0.0.1:3000"`. Visit `http://localhost:8080/admin/taxonomy`,
`/admin/questions` and `/topics`. The canonical reset is already applied; do not
rerun it to resolve a frontend dependency-loading failure.
