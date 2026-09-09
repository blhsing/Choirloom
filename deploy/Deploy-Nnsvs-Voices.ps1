param([string]$SourceDirectory='C:\Tools\choirloom-nnsvs',[string]$AssetName='')
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$banks=Get-Content -LiteralPath (Join-Path $workspaceRoot 'config\voicebanks.json') -Raw|ConvertFrom-Json
$profiles=az webapp deployment list-publishing-profiles --name test-officialWebSite --resource-group OfficialWebsite -o json|ConvertFrom-Json
$profile=$profiles|Where-Object publishMethod -eq MSDeploy|Select-Object -First 1
$authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($profile.userName+':'+$profile.userPWD))
foreach($asset in ($banks.bundle|Sort-Object sha256 -Unique|Where-Object {-not $AssetName -or $_.filename -eq $AssetName})){
 $file=Join-Path $SourceDirectory $asset.filename
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256){throw ('Voice checksum mismatch: '+$asset.filename)}
 Write-Output ('Uploading private voice package: '+$asset.filename)
 @{url=('https://test-officialwebsite.scm.azurewebsites.net/api/vfs/data/choirloom/voices/shared/'+$asset.sha256);file=$file;authorization=$authorization;contentType='application/octet-stream';method='PUT'}|ConvertTo-Json -Compress|python -X utf8 (Join-Path $PSScriptRoot 'azure-transfer.py')
 if($LASTEXITCODE -ne 0){throw 'Voice package transfer failed.'}
}
