# -Check is SELECT-only. -Apply requires separate explicit approval of 0007-0010
# and the exact runtime function/session/badge grants. Never accepts credentials in arguments.
param([switch]$Check,[switch]$Apply)
$ErrorActionPreference='Stop'
if($Check.IsPresent -eq $Apply.IsPresent){throw 'Choose exactly one of -Check or separately approved -Apply.'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
. (Join-Path $PSScriptRoot 'workspace-root.ps1')
if($root -ine $CcnaWorkspaceRoot -or (Get-Location).Path.TrimEnd('\') -ine $root){throw 'Wrong workspace.'}
$secret=Read-Host 'Known ccna_phase6a_migrator password (hidden; never send in chat)' -AsSecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$configuration=@{}
try{$configuration=@{host='127.0.0.1';port=5432;database='ccna_phase6a_dev';role='ccna_phase6a_migrator';systemIdentifier='7694701597474139084';password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}
$info=New-Object System.Diagnostics.ProcessStartInfo
$info.FileName=(Get-Command node.exe -ErrorAction Stop).Source
$operation=if($Check){'--check'}else{'--apply'}
$info.Arguments='"'+(Join-Path $PSScriptRoot 'execute-question-bank-upgrade.mjs')+'" '+$operation
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
