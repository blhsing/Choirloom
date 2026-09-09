param([switch]$SkipWorkers,[switch]$SkipDependencies,[string]$AssetsDirectory='')
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$stage=Join-Path $workspaceRoot '.runtime\azure'
Push-Location $workspaceRoot
try {
 npm run build
 if($LASTEXITCODE -ne 0){throw 'Web build failed.'}
 npm run build:server
 if($LASTEXITCODE -ne 0){throw 'Server build failed.'}
 if(-not $SkipWorkers){& (Join-Path $PSScriptRoot 'Build-Workers.ps1')}
 New-Item -ItemType Directory -Force $stage | Out-Null
 function Copy-StageDirectory([string]$source,[string]$name) {
  $target=[IO.Path]::GetFullPath((Join-Path $stage $name))
  if(-not $target.StartsWith([IO.Path]::GetFullPath($stage)+[IO.Path]::DirectorySeparatorChar)){throw 'Unsafe staging path.'}
  if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Recurse -Force}
  New-Item -ItemType Directory -Force $target | Out-Null
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
 }
 Copy-StageDirectory '.runtime/app' 'app'
 Copy-StageDirectory 'dist' 'dist'
 Copy-StageDirectory 'config' 'config'
 Copy-StageDirectory '.runtime/singer-nnsvs' 'singer'
 New-Item -ItemType Directory -Force (Join-Path $stage 'nnsvs') | Out-Null
 Copy-Item -LiteralPath workers/Nnsvs/worker.py,workers/Nnsvs/pronunciation.py,workers/Nnsvs/legacy.py -Destination (Join-Path $stage 'nnsvs') -Force
 Copy-Item -LiteralPath '.runtime/nnsvs/7za.exe' -Destination (Join-Path $stage 'nnsvs') -Force
 Copy-Item -LiteralPath package.json,package-lock.json -Destination $stage -Force
 Copy-Item -LiteralPath deploy/iisnode/entry.cjs,deploy/iisnode/web.config -Destination $stage -Force
 New-Item -ItemType Directory -Force (Join-Path $stage 'runtime') | Out-Null
 Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $stage 'runtime\node.exe') -Force
 if(-not $SkipDependencies){
  npm ci --omit=dev --prefix $stage
  if($LASTEXITCODE -ne 0){throw 'Production dependency installation failed.'}
 }
 if($AssetsDirectory){
  $destination=Join-Path $stage 'assets'
  New-Item -ItemType Directory -Force $destination | Out-Null
  Get-ChildItem -LiteralPath $AssetsDirectory -File | Copy-Item -Destination $destination -Force
 }
 Write-Output ('Azure staging ready: '+$stage)
} finally {Pop-Location}
