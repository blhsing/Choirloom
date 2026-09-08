param([Parameter(Mandatory=$true)][string]$Command)
$ErrorActionPreference='Stop'
$profiles=az webapp deployment list-publishing-profiles --name test-officialWebSite --resource-group OfficialWebsite -o json | ConvertFrom-Json
$profile=$profiles | Where-Object publishMethod -eq MSDeploy | Select-Object -First 1
$authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($profile.userName+':'+$profile.userPWD))
@{authorization=$authorization;command=$Command} | ConvertTo-Json -Compress | python -X utf8 (Join-Path $PSScriptRoot 'azure-command.py')
