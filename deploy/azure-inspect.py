import json,sys,urllib.request
options=json.load(sys.stdin)
request=urllib.request.Request('https://test-officialwebsite.scm.azurewebsites.net'+options['path'],headers={'Authorization':options['authorization']})
with urllib.request.urlopen(request,timeout=120) as r:
    data=r.read()
try:
    result=json.loads(data)
    if options['path'].startswith('/api/processes'):
        if isinstance(result,list):result=[{k:row.get(k) for k in ['id','name','command_line','href']} for row in result if row.get('name','').lower() in ['singer','singer.exe','audiveris','audiveris.exe','java','java.exe']]
        else:result={k:result.get(k) for k in ['id','name','command_line','file_name','working_set','private_memory']}
    elif isinstance(result,list):
        wanted=['web.config','runtime','singer','node_modules','app','config','dist','AzureHost.exe']
        result=[{k:row.get(k) for k in ['name','size','mtime']} for row in result if options['path']!='/api/vfs/site/choirloom-app/' or row.get('name') in wanted]
    print(json.dumps(result,ensure_ascii=False)[:6000])
except Exception:
    if options['path'].endswith('/web.config'):
        import xml.etree.ElementTree as ET
        tree=ET.fromstring(data)
        print(json.dumps({'handlers':[{k:node.get(k) for k in ['name','modules']} for node in tree.findall('.//handlers/add')],'aspNetCore':[node.get('hostingModel') for node in tree.findall('.//aspNetCore')],'httpPlatform':bool(tree.findall('.//httpPlatform')),'iisnode':bool(tree.findall('.//iisnode'))}))
    else: print(data.decode(errors='replace')[-6000:])
