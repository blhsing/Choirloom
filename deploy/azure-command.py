import json,sys,urllib.request
options=json.load(sys.stdin)
request=urllib.request.Request('https://test-officialwebsite.scm.azurewebsites.net/api/command',data=json.dumps({'command':options['command'],'dir':'C:\\home\\site\\choirloom-app'}).encode(),headers={'Authorization':options['authorization'],'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=180) as r:
    result=json.load(r)
print(json.dumps(result,ensure_ascii=False)[:8000])
