# Preparation only: SELECT-only application inventory plus verified backup. No reset/apply.
param([switch]$Prepare,[switch]$Diagnose,[switch]$CompareUsers)
$ErrorActionPreference='Stop'
if(([int]$Prepare.IsPresent+[int]$Diagnose.IsPresent+[int]$CompareUsers.IsPresent) -ne 1){throw 'Choose exactly one of -Prepare, -Diagnose or SELECT-only -CompareUsers; no apply mode exists.'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
. (Join-Path $PSScriptRoot 'workspace-root.ps1')
if($root -ine $CcnaWorkspaceRoot -or (Get-Location).Path.TrimEnd('\') -ine $root){throw 'Wrong workspace.'}
$secret=Read-Host 'Known ccna_phase6a_migrator password (hidden; never send in chat)' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$configuration=@{}
try{$configuration=@{host='127.0.0.1';port=5432;database='ccna_phase6a_dev';role='ccna_phase6a_migrator';systemIdentifier='7694701597474139084';password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
$info=New-Object System.Diagnostics.ProcessStartInfo
$info.FileName=(Get-Command node.exe -ErrorAction Stop).Source
$operation=if($CompareUsers){'--compare-users'}elseif($Diagnose){'--diagnose'}else{'--prepare'}
$info.Arguments='"'+(Join-Path $PSScriptRoot 'prepare-canonical-chapters.mjs')+'" '+$operation
$info.WorkingDirectory=$root
$info.UseShellExecute=$false
$info.CreateNoWindow=$true
$info.RedirectStandardInput=$true
$info.RedirectStandardOutput=$true
$info.RedirectStandardError=$true
$info.EnvironmentVariables.Clear()
foreach($name in @('SystemRoot','WINDIR','COMSPEC','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE')){$value=[Environment]::GetEnvironmentVariable($name);if($null -ne $value){$info.EnvironmentVariables[$name]=$value}}
$child=New-Object System.Diagnostics.Process
$child.StartInfo=$info
try{if(!$child.Start()){throw 'Cannot start guarded operation.'};$child.StandardInput.WriteLine(($configuration|ConvertTo-Json -Compress));$child.StandardInput.Close();$configuration.Clear();$stderr=$child.StandardError.ReadToEndAsync();$output=$child.StandardOutput.ReadToEnd();$child.WaitForExit();Write-Output $output;if($child.ExitCode -ne 0){throw 'Guarded operation stopped. Do not retry automatically; inspect the sanitized stage/report.'}}finally{$configuration.Clear();$child.Dispose()}
