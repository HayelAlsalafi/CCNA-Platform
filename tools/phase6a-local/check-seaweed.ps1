$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'seaweed-environment.ps1')
$values = Read-SeaweedMediaEnvironment
if (!$values) { throw 'Local S3 credential file is missing.' }
$prior = @{}
try {
  foreach ($name in $values.Keys) {
    $prior[$name] = [Environment]::GetEnvironmentVariable($name)
    [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
  }
  $values.Clear()
  node (Join-Path $PSScriptRoot 'check-seaweed.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'S3 connectivity check stopped; no database was contacted.' }
} finally {
  foreach ($name in $prior.Keys) { [Environment]::SetEnvironmentVariable($name, $prior[$name], 'Process') }
  $values.Clear(); $prior.Clear()
}
