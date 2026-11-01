param([switch]$CheckApi)
$ErrorActionPreference = 'Stop'
$invariant = 'postgres-service-inspection'
try {
  $svc = Get-CimInstance Win32_Service -Filter "Name='postgresql-x64-18'"
  $expected = '"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" runservice -N "postgresql-x64-18" -D "C:\Program Files\PostgreSQL\18\data" -w'
  $invariant = 'postgres-service-identity'
  if (!$svc -or $svc.State -ne 'Running' -or $svc.PathName -ine $expected) { throw 'Wrong service' }
  $invariant = 'postgres-listener-inspection'
  $listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 5432 })
  $ipv4 = @($listeners | Where-Object { $_.LocalAddress -in @('127.0.0.1','0.0.0.0') })
  $invariant = 'postgres-loopback-listener'
  if (!$ipv4.Count) { throw 'No local listener' }
  $invariant = 'postgres-listener-ownership'
  foreach ($listener in $listeners) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (!$owner -or $owner.Name -ine 'postgres.exe' -or $owner.ParentProcessId -ne $svc.ProcessId) { throw 'Listener is not the installed service child' }
  }
  if ($CheckApi) {
    $invariant = 'api-listener-inspection'
    $api = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 })
    $invariant = 'api-listener-identity'
    if ($api.Count -ne 1 -or $api[0].LocalAddress -ne '127.0.0.1') { throw 'Wrong API listener' }
    $invariant = 'api-process-inspection'
    $node = Get-CimInstance Win32_Process -Filter "ProcessId=$($api[0].OwningProcess)"
. (Join-Path $PSScriptRoot '../workspace-root.ps1')
    $script = (Join-Path $CcnaWorkspaceRoot 'tools/phase6a-local/run.mjs')
    $expectedCommand = '"' + $script + '" api --start'
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $invariant = 'api-process-metadata'
    if (!$node -or [string]::IsNullOrEmpty($node.ExecutablePath) -or [string]::IsNullOrEmpty($node.CommandLine)) { throw 'API process identity unavailable' }
    $invariant = 'api-process-identity'
    if (!$node -or $node.Name -ine 'node.exe' -or $node.ExecutablePath -ine $nodeExe -or
        !$node.CommandLine.EndsWith($expectedCommand,[StringComparison]::OrdinalIgnoreCase)) { throw 'API belongs to another runtime' }
  }
  Write-Output 'Installed local PostgreSQL service/listener verified.'
} catch {
  Write-Error ('Local service/listener verification failed. Invariant: ' + $invariant + '; stop.') -ErrorAction Continue
  exit 1
}
