param([string]$PythonDirectory='C:\Tools\choirloom-nnsvs\ENUNU-1.0.0\python-3.12.10-embed-amd64',[switch]$ScriptsOnly)
$ErrorActionPreference='Stop'
$workspaceRoot=Split-Path $PSScriptRoot -Parent
$target=Join-Path $workspaceRoot '.runtime\nnsvs'
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'workers\Nnsvs\worker.py'),(Join-Path $workspaceRoot 'workers\Nnsvs\pronunciation.py'),(Join-Path $workspaceRoot 'workers\Nnsvs\legacy.py') -Destination $target -Force
if(-not $ScriptsOnly){
 if(-not (Test-Path -LiteralPath (Join-Path $PythonDirectory 'python.exe'))){throw 'Install the pinned NNSVS runtime documented in workers/Nnsvs/README.md first.'}
 & (Join-Path $PythonDirectory 'python.exe') -c 'import torch,nnsvs,utaupy,cmudict,pykakasi,pypinyin; assert torch.__version__.startswith("2.7.1")'
 if($LASTEXITCODE -ne 0){throw 'NNSVS runtime dependencies are incomplete.'}
 $destination=Join-Path $target 'python'
 New-Item -ItemType Directory -Force $destination | Out-Null
 robocopy $PythonDirectory $destination /E /XD __pycache__ /XF '*.pyc' /NFL /NDL /NJH /NJS /NP | Out-Null
 if($LASTEXITCODE -ge 8){throw 'NNSVS runtime copy failed.'}
}
Copy-Item -LiteralPath 'C:\Tools\7zip\7za.exe' -Destination $target -Force
Write-Output ('NNSVS runtime ready: '+$target)
