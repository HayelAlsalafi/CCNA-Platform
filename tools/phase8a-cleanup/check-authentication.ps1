param([ValidateSet('ccna_phase6a_app','ccna_phase6a_migrator')][string]$Role='ccna_phase6a_app')
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
. (Join-Path $PSScriptRoot '../workspace-root.ps1')
if ($root -ine $CcnaWorkspaceRoot -or (Get-Location).Path.TrimEnd('\') -ine $root) { throw 'Wrong workspace.' }
$secure = Read-Host "Known password for $Role (hidden; do not guess or send in chat)" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$configuration = @{}
try { $configuration = @{host='127.0.0.1';port=5432;database='ccna_phase6a_dev';role=$Role;systemIdentifier='7694701597474139084';password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)} }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose() }
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
$info.Arguments = '"' + (Join-Path $PSScriptRoot 'authentication.mjs') + '"'
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
 if(!$child.Start()){throw 'Cannot launch read-only diagnostic.'}
 $child.StandardInput.WriteLine(($configuration | ConvertTo-Json -Compress));$child.StandardInput.Close();$configuration.Clear()
 $stderr = $child.StandardError.ReadToEndAsync()
 $output = $child.StandardOutput.ReadToEnd();$child.WaitForExit();Write-Output $output
 if($child.ExitCode -ne 0){throw 'Read-only authentication check failed. Stop; do not retry with guessed credentials.'}
} finally { $configuration.Clear();$child.Dispose() }
