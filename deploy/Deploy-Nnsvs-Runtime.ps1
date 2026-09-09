$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$source=Join-Path $workspaceRoot '.runtime\nnsvs\python'
$package=Join-Path $workspaceRoot '.runtime\nnsvs-python-inference.zip'
if(-not(Test-Path -LiteralPath (Join-Path $source 'python.exe'))){throw 'Run Build-Nnsvs.ps1 first.'}
Add-Type -AssemblyName System.IO.Compression
$stream=[IO.File]::Create($package);$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try{Get-ChildItem -LiteralPath $source -Recurse -File | ForEach-Object {
 $relative=[IO.Path]::GetRelativePath($source,$_.FullName).Replace('\','/')
 if($relative -match '(?i)(^|/)(tests?|include|__pycache__)/|\.(lib|pyc)$'){return}
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$_.FullName,$relative,[IO.Compression.CompressionLevel]::Fastest)|Out-Null
}}finally{$zip.Dispose();$stream.Dispose()}
$profiles=az webapp deployment list-publishing-profiles --name test-officialWebSite --resource-group OfficialWebsite -o json | ConvertFrom-Json
$profile=$profiles|Where-Object publishMethod -eq MSDeploy|Select-Object -First 1
$authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($profile.userName+':'+$profile.userPWD))
Write-Output ('Uploading NNSVS Python runtime: '+[Math]::Round((Get-Item $package).Length/1MB)+' MB')
@{url='https://test-officialwebsite.scm.azurewebsites.net/api/vfs/data/choirloom/nnsvs-runtime.zip';file=$package;authorization=$authorization;contentType='application/zip';method='PUT'}|ConvertTo-Json -Compress|python -X utf8 (Join-Path $PSScriptRoot 'azure-transfer.py')
if($LASTEXITCODE -ne 0){throw 'NNSVS runtime transfer failed.'}
Write-Output 'Runtime uploaded. Run Expand-Nnsvs-Runtime.ps1 on the Azure host to unpack outside the HTTP request.'
