param([string]$JavaHome=$env:JAVA_HOME)
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
if(-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome 'bin\javac.exe'))){
 $compiler=Get-Command javac.exe -ErrorAction SilentlyContinue
 if($compiler){$JavaHome=Split-Path (Split-Path $compiler.Source -Parent) -Parent}
 else{$JavaHome=(Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-21*' | Select-Object -Last 1).FullName}
}
if(-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome 'bin\javac.exe'))){throw 'Set -JavaHome to a JDK 21 or newer installation.'}
Push-Location $workspaceRoot
try {
 dotnet publish workers/Singer/Singer.csproj -c Release -o .runtime/singer -r win-x64 --self-contained true
 if($LASTEXITCODE -ne 0){throw 'Singer build failed.'}
 New-Item -ItemType Directory -Force .runtime/audiveris-bootstrap | Out-Null
 & (Join-Path $JavaHome 'bin\javac.exe') --release 21 -encoding UTF-8 -d .runtime/audiveris-bootstrap workers/AudiverisBootstrap/AudiverisBootstrap.java
 if($LASTEXITCODE -ne 0){throw 'Audiveris bootstrap build failed.'}
 & (Join-Path $JavaHome 'bin\jar.exe') --create --file .runtime/singer/audiveris-bootstrap.jar -C .runtime/audiveris-bootstrap .
 if($LASTEXITCODE -ne 0){throw 'Audiveris bootstrap packaging failed.'}
 $runtimeDlls='C:\Tools\Audiveris\SourceDir\Audiveris\runtime\bin'
 if(Test-Path $runtimeDlls){Get-ChildItem $runtimeDlls -File | Where-Object Name -in @('msvcp140.dll','vcruntime140.dll','vcruntime140_1.dll') | Copy-Item -Destination .runtime/singer -Force}
} finally {Pop-Location}
