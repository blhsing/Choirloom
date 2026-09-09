$ErrorActionPreference='Stop'
$runtimeRoot='C:\home\site\choirloom-app\nnsvs'
$dataRoot='C:\home\data\choirloom'
$prepared=& 'C:\home\site\choirloom-app\singer\Singer.exe' --prepare-runtime true | ConvertFrom-Json
if($LASTEXITCODE -ne 0 -or -not $prepared.python){throw 'Runtime preparation failed.'}
$process=Start-Process -FilePath $prepared.python -ArgumentList @('-X','utf8','-u',(Join-Path $runtimeRoot 'install_catalog.py')) -RedirectStandardOutput (Join-Path $dataRoot 'nnsvs-install.log') -RedirectStandardError (Join-Path $dataRoot 'nnsvs-install-error.log') -WindowStyle Hidden -PassThru
Write-Output ('NNSVS catalog installation started: '+$process.Id)
