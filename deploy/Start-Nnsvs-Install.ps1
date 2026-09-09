$ErrorActionPreference='Stop'
$runtimeRoot='C:\home\site\choirloom-app\nnsvs'
$dataRoot='C:\home\data\choirloom'
$process=Start-Process -FilePath (Join-Path $runtimeRoot 'python\python.exe') -ArgumentList @('-X','utf8','-u',(Join-Path $runtimeRoot 'install_catalog.py')) -RedirectStandardOutput (Join-Path $dataRoot 'nnsvs-install.log') -RedirectStandardError (Join-Path $dataRoot 'nnsvs-install-error.log') -WindowStyle Hidden -PassThru
Write-Output ('NNSVS catalog installation started: '+$process.Id)
