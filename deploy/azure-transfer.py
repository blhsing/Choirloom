"""Stream Kudu uploads with OpenSSL TLS 1.3; credentials arrive only on stdin."""
import http.client
import json
import pathlib
import ssl
import sys
from urllib.parse import urlsplit

options=json.load(sys.stdin)
url=urlsplit(options['url'])
connection=http.client.HTTPSConnection(url.hostname,timeout=1800,blocksize=1024*1024,context=ssl.create_default_context())
headers={'Authorization':options['authorization'],'If-Match':'*','Content-Type':options.get('contentType','application/octet-stream')}
file=pathlib.Path(options['file']) if options.get('file') else None
headers['Content-Length']=str(file.stat().st_size if file else 0)
with file.open('rb') if file else open(__file__,'rb') as source:
    connection.request(options.get('method','PUT'),url.path,body=source if file else b'',headers=headers)
    response=connection.getresponse()
    body=response.read()
    if response.status==409 and not file and url.path.endswith('/'):
        print('Directory already exists')
        sys.exit(0)
    if not 200<=response.status<300:
        print(f'Kudu transfer failed: HTTP {response.status}',file=sys.stderr)
        print(body.decode('utf-8',errors='replace')[:3000],file=sys.stderr)
        sys.exit(1)
print(f'Transfer complete: HTTP {response.status}')
