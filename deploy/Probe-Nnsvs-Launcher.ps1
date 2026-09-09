$ErrorActionPreference='Stop'
$appRoot='C:\home\site\choirloom-app'
$dataRoot='C:\home\data\choirloom'
$output=Join-Path $dataRoot 'nnsvs-verification\namine-ritsu'
$score=@{tempo=120;lyricsLanguage='en';parts=@(@{id='probe';voicebank='namine-ritsu';notes=@(
 @{id='n1';pitch=60;start=0;duration=480;lyric='Sing'},
 @{id='n2';pitch=62;start=480;duration=480;lyric='with'},
 @{id='n3';pitch=64;start=960;duration=480;lyric='me';tie='start'},
 @{id='n4';pitch=64;start=1440;duration=480;lyric='';tie='stop'}
)})}
$inputFile=Join-Path $output 'score.json'
$score|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $inputFile -Encoding utf8
& (Join-Path $appRoot 'singer\Singer.exe') --score $inputFile --output $output --voicebanks (Join-Path $appRoot 'nnsvs\banks-staging.json') --cache (Join-Path $dataRoot 'voices\shared')
if($LASTEXITCODE -ne 0){throw 'Native NNSVS launcher verification failed.'}
Get-ChildItem -LiteralPath $output -File | Where-Object Extension -in '.wav','.mp3' | Select-Object Name,Length
