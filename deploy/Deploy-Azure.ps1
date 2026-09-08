param([switch]$AssetsOnly,[switch]$SkipAssets,[switch]$CodeOnly,[switch]$IncludeDependencies,[switch]$ApiOnly,[switch]$WorkerOnly,[string]$AssetName='')
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$stage=Join-Path $workspaceRoot '.runtime\azure'
if(-not (Test-Path -LiteralPath (Join-Path $stage 'web.config'))){throw 'Build the Azure staging directory before deployment.'}
# Publishing credentials stay in process memory and are never written to disk or printed.
$profiles=az webapp deployment list-publishing-profiles --name test-officialWebSite --resource-group OfficialWebsite -o json | ConvertFrom-Json
if($LASTEXITCODE -ne 0){throw 'Unable to read publishing profile.'}
$profile=$profiles | Where-Object publishMethod -eq 'MSDeploy' | Select-Object -First 1
$credential=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($profile.userName+':'+$profile.userPWD))
$headers=@{Authorization='Basic '+$credential;'If-Match'='*'}
function Send-KuduFile([string]$url,[string]$file='',[string]$contentType='application/octet-stream',[string]$method='PUT') {
 @{url=$url;file=$file;authorization=$headers.Authorization;contentType=$contentType;method=$method} | ConvertTo-Json -Compress | python -X utf8 (Join-Path $PSScriptRoot 'azure-transfer.py')
 if($LASTEXITCODE -ne 0){throw 'Kudu transfer failed.'}
}
$scm='https://test-officialwebsite.scm.azurewebsites.net'
if(-not $AssetsOnly){
 $package=Join-Path $workspaceRoot '.runtime\choirloom-app.zip'
 Add-Type -AssemblyName System.IO.Compression
 $stream=[IO.File]::Create($package);$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
 try { Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object { $relative=[IO.Path]::GetRelativePath($stage,$_.FullName).Replace('\','/');$include=$relative -match '^(app/|config/|dist/|runtime/|singer/|node_modules/|package(-lock)?\.json$|web\.config$|entry\.cjs$)';if($CodeOnly){$include=$relative -match '^(app/|config/|dist/|web.config|entry.cjs|singer/(?!System\.|Microsoft\.|core|clr|host|ms|vcruntime|onnx|libmp3))'};if($IncludeDependencies -and $relative -match '^(node_modules/(ws/|pdfjs-dist/|@napi-rs/|utif/|pako/)|package(-lock)?\.json$)'){$include=$true};if($ApiOnly){$include=$relative -match '^(app/|config/|entry.cjs|web.config)'};if($WorkerOnly){$include=$relative -match '^singer/(?!System\.|Microsoft\.|core|clr|host|ms|vcruntime|onnx|libmp3)'};if($relative -match '(audiveris|omr-progress|omr-stages)'){$include=$false};if($include){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$_.FullName,$relative,[IO.Compression.CompressionLevel]::Fastest) | Out-Null} } } finally {$zip.Dispose();$stream.Dispose()}
 Write-Output ('Uploading app package: '+[Math]::Round((Get-Item $package).Length/1MB)+' MB')
 if($CodeOnly){$offline=Join-Path $workspaceRoot '.runtime\app_offline.htm';'Choirloom is updating. Please reload shortly.' | Set-Content -LiteralPath $offline;Send-KuduFile "$scm/api/vfs/site/choirloom-app/app_offline.htm" $offline 'text/html'}
 try {Send-KuduFile "$scm/api/zip/site/choirloom-app/" $package 'application/zip'} finally {if($CodeOnly){Send-KuduFile "$scm/api/vfs/site/choirloom-app/app_offline.htm" '' 'text/html' 'DELETE'}}
 if(-not $CodeOnly){
 $config=az webapp config show --name test-officialWebSite --resource-group OfficialWebsite -o json | ConvertFrom-Json
 if($LASTEXITCODE -ne 0){throw 'Could not read virtual applications.'}
 if(-not ($config.virtualApplications | Where-Object virtualPath -eq '/Choirloom')){
  $apps=@($config.virtualApplications)+@(@{virtualPath='/Choirloom';physicalPath='site\choirloom-app';preloadEnabled=$false;virtualDirectories=$null})
  $configFile=Join-Path $workspaceRoot '.runtime\virtual-applications.json';@{properties=@{virtualApplications=$apps}} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configFile -Encoding utf8
  az rest --method patch --uri "https://management.azure.com/subscriptions/619b657b-51aa-42c9-b8e6-d4772a184100/resourceGroups/OfficialWebsite/providers/Microsoft.Web/sites/test-officialWebSite/config/web?api-version=2024-04-01" --body "@$configFile" --query properties.virtualApplications -o json
  if($LASTEXITCODE -ne 0){throw 'Could not append Choirloom virtual application.'}
 }
}
}
if(-not $SkipAssets){
 Send-KuduFile "$scm/api/vfs/site/choirloom-app/assets/"
 Get-ChildItem -LiteralPath (Join-Path $stage 'assets') -File | Where-Object {-not $AssetName -or $_.Name -eq $AssetName} | ForEach-Object {
  Write-Output ('Uploading asset: '+$_.Name)
  Send-KuduFile ("$scm/api/vfs/site/choirloom-app/assets/"+[Uri]::EscapeDataString($_.Name)) $_.FullName
 }
}
$credential=$null;$profile=$null;$profiles=$null;$headers=$null
Write-Output 'Deployment transfer complete: https://test-officialwebsite.azurewebsites.net/Choirloom/'
