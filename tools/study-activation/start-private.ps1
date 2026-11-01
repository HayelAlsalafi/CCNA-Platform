# Existing cluster only. No initdb, createdb, database connection, repair or cleanup.
[CmdletBinding()]
param([switch]$Start)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../workspace-root.ps1')
$root=$CcnaWorkspaceRoot
if((Get-Location).Path -cne $root){throw 'Wrong workspace.'}
& node tools/study-activation/readiness.mjs --plan | Out-Null
if($LASTEXITCODE -ne 0){throw 'Source/workspace preflight failed.'}
$cluster=Join-Path $root '.local\taxonomy-rehearsal\ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170'
$data=Join-Path $cluster 'data'
foreach($p in @($root,(Join-Path $root '.local'),(Join-Path $root '.local\taxonomy-rehearsal'),$cluster,$data)){
  $item=Get-Item -LiteralPath $p -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse target refused.'}
  if((Resolve-Path -LiteralPath $p).Path -cne $p){throw 'Noncanonical cluster path.'}
}
$owner=Get-Content -LiteralPath (Join-Path $cluster 'owner.json') -Raw | ConvertFrom-Json
if($owner.nonce -cne '8e6c4b9a2170' -or $owner.database -cne 'ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170' -or $owner.owner -cne 'ccna_taxonomy_rehearsal_owner_8e6c4b9a2170' -or $owner.port -ne 55440 -or $owner.dataDirectory -cne $data){throw 'Ownership marker mismatch.'}
$hba=@('local all all reject','local replication all reject','host ccna_taxonomy_rehearsal_20261012_8e6c4b9a2170,postgres ccna_taxonomy_rehearsal_owner_8e6c4b9a2170 127.0.0.1/32 trust','host all all 0.0.0.0/0 reject','host replication all 0.0.0.0/0 reject','host all all ::/0 reject','host replication all ::/0 reject')
if(((Get-Content -LiteralPath (Join-Path $data 'pg_hba.conf')) -join "`n") -cne ($hba -join "`n")){throw 'Unexpected HBA policy.'}
$auto=@("listen_addresses = '127.0.0.1'",'port = 55440','ssl = off',"unix_socket_directories = ''")
if(((Get-Content -LiteralPath (Join-Path $data 'postgresql.auto.conf')) -join "`n") -cne ($auto -join "`n")){throw 'Unexpected private cluster configuration.'}
$bin='C:\Program Files\PostgreSQL\18\bin'
if((& (Join-Path $bin 'postgres.exe') --version) -cne 'postgres (PostgreSQL) 18.6'){throw 'Wrong installed version.'}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 55440)
if($listeners.Count){throw 'Port 55440 is occupied; do not change or restart another process.'}
$control = & (Join-Path $bin 'pg_controldata.exe') -D $data
if ($LASTEXITCODE -ne 0) { throw 'Cannot read private control file.' }
$identifier = (($control | Select-String '^Database system identifier:').Line -replace '^Database system identifier:\s*','').Trim()
if ($identifier -notmatch '^[0-9]{10,25}$' -or $identifier -ceq '7694701597474139084') { throw 'Private cluster identity invalid or matches application cluster.' }
if ($identifier -cne '7695735287099484548') { throw 'Reviewed private control-file identity changed.' }
if ((Get-Content -LiteralPath (Join-Path $data 'PG_VERSION') -Raw).Trim() -cne '18') { throw 'Private data version mismatch.' }
$operatorSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$directoryOwner = (Get-Acl -LiteralPath $data).GetOwner([Security.Principal.SecurityIdentifier]).Value
$markerOwner = (Get-Acl -LiteralPath (Join-Path $cluster 'owner.json')).GetOwner([Security.Principal.SecurityIdentifier]).Value
if ($directoryOwner -cne $operatorSid -or $markerOwner -cne $operatorSid) { throw 'Private directory/marker NTFS owner mismatch.' }
$binaryHash=(Get-FileHash -LiteralPath (Join-Path $bin 'postgres.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
$plan=@{systemIdentifier=$identifier;executableSha256=$binaryHash;ntfsOwnershipVerified=$true;databaseOperations=0;dataDirectory=$data;host='127.0.0.1';port=55440;initialization=$false;cleanup=$false}
if(!$Start){$plan|ConvertTo-Json -Compress;return}
foreach($name in @('DATABASE_URL','PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
& (Join-Path $bin 'pg_ctl.exe') -D $data status 2>$null | Out-Null
if($LASTEXITCODE -ne 3){throw 'Cluster is not in the expected stopped state. No repair attempted.'}
# Read the already-verified auto.conf empty socket setting directly. Passing ''
# through Windows pg_ctl -o would become a literal directory name, not empty.
& (Join-Path $bin 'pg_ctl.exe') -D $data -l (Join-Path $cluster 'postgres.log') -o "-h 127.0.0.1 -p 55440 -c ssl=off" -w -t 30 start
if($LASTEXITCODE -ne 0){throw 'Private startup failed. Preserve state; no fallback or automatic repair.'}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq 55440)
if($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1'){throw 'Unexpected listener after startup.'}
$pidLines=Get-Content -LiteralPath (Join-Path $data 'postmaster.pid')
if([int]$pidLines[0] -ne $listeners[0].OwningProcess -or $pidLines[1].Replace('/','\') -cne $data -or [int]$pidLines[3] -ne 55440){throw 'PID identity mismatch.'}
$process=Get-Process -Id $listeners[0].OwningProcess
if($process.Path -cne (Join-Path $bin 'postgres.exe')){throw 'Unexpected PostgreSQL executable.'}
@{systemIdentifier=$identifier;executableSha256=$binaryHash;ntfsOwnershipVerified=$true;started=$true;pid=$process.Id;host='127.0.0.1';port=55440;dataDirectory=$data;databaseConnections=0}|ConvertTo-Json -Compress
