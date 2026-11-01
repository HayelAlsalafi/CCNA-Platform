# PREPARATION ONLY by default. -Create requires separate explicit user approval.
# No resume, cleanup, overwrite, arbitrary target or service-management options.
[CmdletBinding()]
param([switch]$Create)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../../../workspace-root.ps1')
$taxonomyWorkspace = $CcnaWorkspaceRoot
if ((Get-Location).Path -cne $taxonomyWorkspace) { throw 'Wrong workspace' }
$taxonomyEntrypoint = 'tools/taxonomy-rehearsal/profiles/8e6c4b9a2170/rehearsal.mjs'
$taxonomyPlanOutput = & node $taxonomyEntrypoint --plan
if ($LASTEXITCODE -ne 0) { throw 'Pinned profile/source checks failed' }
if (-not $Create) { $taxonomyPlanOutput; return }

$taxonomyPlan = ($taxonomyPlanOutput -join "`n") | ConvertFrom-Json
$taxonomyDatabase = 'ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170'
$taxonomyOwner = 'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170'
$taxonomyBin = 'C:\Program Files\PostgreSQL\18\bin'
$taxonomyRoot = Join-Path $taxonomyWorkspace ('.local\taxonomy-rehearsal\' + $taxonomyDatabase)
$taxonomyData = Join-Path $taxonomyRoot 'data'
if ($taxonomyPlan.profileId -cne '8e6c4b9a2170' -or $taxonomyPlan.host -cne '127.0.0.1' -or $taxonomyPlan.port -ne 55440 -or $taxonomyPlan.database -cne $taxonomyDatabase -or $taxonomyPlan.owner -cne $taxonomyOwner -or $taxonomyPlan.runRoot -cne $taxonomyRoot -or $taxonomyPlan.dataDirectory -cne $taxonomyData -or $taxonomyPlan.databaseOperations -ne 0) { throw 'Plan identity mismatch' }

foreach ($taxonomyParent in @($taxonomyWorkspace, (Join-Path $taxonomyWorkspace '.local'), (Join-Path $taxonomyWorkspace '.local\taxonomy-rehearsal'))) {
  if ((Test-Path -LiteralPath $taxonomyParent) -and ((Get-Item -LiteralPath $taxonomyParent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse-point parent refused' }
}
if (Test-Path -LiteralPath $taxonomyRoot) { throw 'New run directory already exists; do not reuse or delete it' }
if (@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 55440).Count -ne 0) { throw 'New port occupied; do not change any listener' }
$taxonomyVersion = & (Join-Path $taxonomyBin 'postgres.exe') --version
if ($LASTEXITCODE -ne 0 -or $taxonomyVersion -cne 'postgres (PostgreSQL) 18.6') { throw 'PostgreSQL version mismatch' }
$taxonomyHba = @(& node $taxonomyEntrypoint --print-hba)
if ($LASTEXITCODE -ne 0 -or $taxonomyHba.Count -ne 7) { throw 'Hardened HBA generation failed' }

# Remove process overrides without reading their values. Native createdb must
# never consult an existing password/service file or an application credential.
foreach ($taxonomyVariable in @('DATABASE_URL','PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS','PGSSLMODE','PGREPLICATION','PGCLIENTENCODING','PGAPPNAME','PGSSLNEGOTIATION','PGSSLCERT','PGSSLKEY','PGSSLROOTCERT','PGSSLCRL','PGSSLCRLDIR')) {
  [Environment]::SetEnvironmentVariable($taxonomyVariable, $null, 'Process')
}
$env:PGSERVICEFILE = Join-Path $taxonomyRoot 'absent-service.conf'
$env:PGPASSFILE = Join-Path $taxonomyRoot 'absent-password-file'
$env:PGSSLMODE = 'disable'
$env:PGOPTIONS = ''

New-Item -ItemType Directory -Path $taxonomyRoot -ErrorAction Stop | Out-Null
& (Join-Path $taxonomyBin 'initdb.exe') --pgdata=$taxonomyData --username=$taxonomyOwner --encoding=UTF8 --locale=C --auth=trust
if ($LASTEXITCODE -ne 0) { throw 'initdb failed; preserve new files and stop' }
@{nonce='8e6c4b9a2170';database=$taxonomyDatabase;owner=$taxonomyOwner;port=55440;dataDirectory=$taxonomyData} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taxonomyRoot 'owner.json') -Encoding UTF8
$taxonomyHba | Set-Content -LiteralPath (Join-Path $taxonomyData 'pg_hba.conf') -Encoding ASCII
@("listen_addresses = '127.0.0.1'", 'port = 55440', 'ssl = off', "unix_socket_directories = ''") | Set-Content -LiteralPath (Join-Path $taxonomyData 'postgresql.auto.conf') -Encoding ASCII
& (Join-Path $taxonomyBin 'pg_ctl.exe') -D $taxonomyData -l (Join-Path $taxonomyRoot 'postgres.log') -w -t 30 start
if ($LASTEXITCODE -ne 0) { throw 'Private startup failed; no fallback, repair or service changes' }

# Canonical paths, owner marker, ready PID, exact executable/version/listener,
# normalized server identity and authentication are checked before createdb.
& node $taxonomyEntrypoint --verify-maintenance
if ($LASTEXITCODE -ne 0) { throw 'New server preflight failed; do not create the database' }
& (Join-Path $taxonomyBin 'createdb.exe') --host=127.0.0.1 --port=55440 --username=$taxonomyOwner --owner=$taxonomyOwner --maintenance-db=postgres --template=template0 --no-password $taxonomyDatabase
if ($LASTEXITCODE -ne 0) { throw 'Exact database creation failed; preserve everything' }
& node $taxonomyEntrypoint --verify-empty
if ($LASTEXITCODE -ne 0) { throw 'Database identity/authentication/emptiness failed; preserve everything' }
# Stop here. No migrations, fixtures, rehearsal assertions or cleanup.
