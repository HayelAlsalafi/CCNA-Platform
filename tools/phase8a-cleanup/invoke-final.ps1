# Executes the already-authorized FINAL legacy cleanup. No second approval prompt.
param()
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
. (Join-Path $PSScriptRoot '../workspace-root.ps1')
if ($root -ine $CcnaWorkspaceRoot -or (Get-Location).Path.TrimEnd('\') -ine $root) { throw 'Wrong workspace.' }
$password = Read-Host 'Local ccna_phase6a_migrator password (hidden; never send it in chat)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$configuration = @{}
try {
  $configuration = @{ host='127.0.0.1';port=5432;database='ccna_phase6a_dev';role='ccna_phase6a_migrator';systemIdentifier='7694701597474139084';password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$password.Dispose() }
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
$info.Arguments = '"' + (Join-Path $PSScriptRoot 'execute-final.mjs') + '" --execute-final-legacy-cleanup'
$info.WorkingDirectory = $root
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.EnvironmentVariables.Clear()
foreach($name in @('SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE')) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if($null -ne $value){$info.EnvironmentVariables[$name]=$value}
}
$child = New-Object System.Diagnostics.Process
$child.StartInfo = $info
try {
  if(!$child.Start()){throw 'Cannot start cleanup.'}
  $child.StandardInput.WriteLine(($configuration | ConvertTo-Json -Compress))
  $child.StandardInput.Close()
  $configuration.Clear()
  # Child emits only a sanitized report. Driver/dump details are never printed.
  $stderr = $child.StandardError.ReadToEndAsync()
  $result = $child.StandardOutput.ReadToEnd()
  $child.WaitForExit()
  Write-Output $result
  if($child.ExitCode -ne 0){throw 'Cleanup stopped. Inspect the sanitized report; do not retry automatically.'}
} finally { $configuration.Clear();$child.Dispose() }
