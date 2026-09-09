$ErrorActionPreference='Stop'
$runtimeRoot='C:\home\site\choirloom-app\nnsvs'
$dataRoot='C:\home\data\choirloom'
$process=Start-Process -FilePath (Join-Path $runtimeRoot '7za.exe') -ArgumentList @('x',(Join-Path $dataRoot 'nnsvs-runtime.zip'),('-o'+(Join-Path $runtimeRoot 'python')),'-y') -RedirectStandardOutput (Join-Path $dataRoot 'nnsvs-unpack.log') -RedirectStandardError (Join-Path $dataRoot 'nnsvs-unpack-error.log') -WindowStyle Hidden -PassThru
Write-Output ('Runtime extraction started: '+$process.Id)
