param([switch]$ScriptsOnly)
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$package=Join-Path $workspaceRoot '.runtime\nnsvs-bootstrap.zip'
Add-Type -AssemblyName System.IO.Compression
$stream=[IO.File]::Create($package);$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($name in @('worker.py','pronunciation.py','legacy.py','install_catalog.py')){
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $workspaceRoot ('workers\Nnsvs\'+$name)),$name,[IO.Compression.CompressionLevel]::Fastest)|Out-Null
 }
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $PSScriptRoot 'Start-Nnsvs-Install.ps1'),'Start-Nnsvs-Install.ps1',[IO.Compression.CompressionLevel]::Fastest)|Out-Null
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $PSScriptRoot 'Retire-DiffSinger.py'),'Retire-DiffSinger.py',[IO.Compression.CompressionLevel]::Fastest)|Out-Null
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $PSScriptRoot 'Probe-Nnsvs-Launcher.ps1'),'Probe-Nnsvs-Launcher.ps1',[IO.Compression.CompressionLevel]::Fastest)|Out-Null
 foreach($entry in @(@('C:\Tools\7zip\7za.exe','7za.exe'),@((Join-Path $workspaceRoot 'config\voicebanks.json'),'banks-staging.json'),@((Join-Path $PSScriptRoot 'Expand-Nnsvs-Runtime.ps1'),'Expand-Nnsvs-Runtime.ps1'))){
  if($ScriptsOnly -and $entry[1] -eq '7za.exe'){continue}
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$entry[0],$entry[1],[IO.Compression.CompressionLevel]::Fastest)|Out-Null
 }
}finally{$zip.Dispose();$stream.Dispose()}
$profiles=az webapp deployment list-publishing-profiles --name test-officialWebSite --resource-group OfficialWebsite -o json|ConvertFrom-Json
$profile=$profiles|Where-Object publishMethod -eq MSDeploy|Select-Object -First 1
$authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($profile.userName+':'+$profile.userPWD))
@{url='https://test-officialwebsite.scm.azurewebsites.net/api/zip/site/choirloom-app/nnsvs/';file=$package;authorization=$authorization;contentType='application/zip';method='PUT'}|ConvertTo-Json -Compress|python -X utf8 (Join-Path $PSScriptRoot 'azure-transfer.py')
if($LASTEXITCODE -ne 0){throw 'NNSVS host preparation failed.'}
