# Explicit reviewed 0017 only. Credentials are local hidden input, never arguments.
param([switch]$Apply,[switch]$ConfirmReviewedExam,[switch]$Plan,[string]$BackupReceipt,[string]$RehearsalReceipt)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
. (Join-Path $PSScriptRoot '../workspace-root.ps1')
if ($root -ine $CcnaWorkspaceRoot -or (Get-Location).Path.TrimEnd('\') -ine $root) { throw 'Wrong workspace.' }
if ($Plan -and !$Apply -and !$ConfirmReviewedExam) {
  & (Get-Command node.exe -ErrorAction Stop).Source (Join-Path $PSScriptRoot 'apply.mjs') --plan
  if ($LASTEXITCODE -ne 0) { throw 'Plan stopped; inspect evidence without retrying activation.' }
  exit
}
if (!$Apply -or !$ConfirmReviewedExam -or $Plan) { throw 'Use -Apply -ConfirmReviewedExam, or -Plan only.' }
if (!$BackupReceipt -or !$RehearsalReceipt -or $BackupReceipt.Contains('"') -or $RehearsalReceipt.Contains('"')) { throw 'Supply -BackupReceipt and -RehearsalReceipt without embedded quotes.' }
$configuration = @{}
$secret = Read-Host 'Known ccna_phase6a_migrator password (hidden; never send in chat)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $configuration = @{host='127.0.0.1';port=5432;database='ccna_phase6a_dev';role='ccna_phase6a_migrator';systemIdentifier='7694701597474139084';password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
$info.Arguments = '"' + (Join-Path $PSScriptRoot 'apply.mjs') + '" --apply --confirm-reviewed-exam --backup "' + [IO.Path]::GetFullPath($BackupReceipt) + '" --rehearsal "' + [IO.Path]::GetFullPath($RehearsalReceipt) + '"'
$info.WorkingDirectory = $root
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.EnvironmentVariables.Clear()
foreach ($name in @('SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE')) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ($null -ne $value) { $info.EnvironmentVariables[$name] = $value }
}
$child = New-Object System.Diagnostics.Process
$child.StartInfo = $info
try {
  if (!$child.Start()) { throw 'Cannot start approved exam activation.' }
  $child.StandardInput.WriteLine(($configuration | ConvertTo-Json -Compress)); $child.StandardInput.Close(); $configuration.Clear()
  $discardedError = $child.StandardError.ReadToEndAsync()
  $output = $child.StandardOutput.ReadToEnd(); $child.WaitForExit(); Write-Output $output
  if ($child.ExitCode -ne 0) { throw 'Activation stopped. Preserve the sanitized receipt; do not retry automatically.' }
} finally { $configuration.Clear(); $child.Dispose() }
