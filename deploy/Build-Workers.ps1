$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
Push-Location $workspaceRoot
try {
 dotnet publish workers/Singer/Singer.csproj -c Release -o .runtime/singer -r win-x64 --self-contained true
 if($LASTEXITCODE -ne 0){throw 'Singer build failed.'}
} finally {Pop-Location}
