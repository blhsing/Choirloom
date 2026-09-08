"""Build compact CC0 instrument packs. Requires numpy, scipy, soundfile; 7za for FreePats archive.
Sources are pinned in config/instrument-sources.json. Outputs retain source attribution and hashes.
"""
import sys,os,json,hashlib,urllib.request,concurrent.futures,subprocess
from pathlib import Path
if os.name=='nt':sys.path.insert(0,r'C:\Tools\choirloom-audio-libs')
import numpy as np,soundfile as sf
from scipy.signal import resample_poly
from math import gcd
root=Path(__file__).resolve().parent.parent
sources=json.loads((root/'config/instrument-sources.json').read_text())
cache=root/'.runtime/instrument-source';cache.mkdir(parents=True,exist_ok=True)
out=root/'public/instrument-samples';out.mkdir(parents=True,exist_ok=True)
def fetch(url):
 dest=cache/hashlib.sha256(url.encode()).hexdigest()
 if not dest.exists():
  with urllib.request.urlopen(url,timeout=120) as r:dest.write_bytes(r.read())
 return dest
archives={}
for id,bank in sources.items():
 if bank.get('archive'):
  archive=fetch(bank['archive']);dest=cache/id;dest.mkdir(exist_ok=True)
  subprocess.run([r'C:\Tools\7zip\7za.exe' if os.name=='nt' else '7za','x',str(archive),'-o'+str(dest),'-y'],check=True,stdout=subprocess.DEVNULL)
  archives[id]=dest

def build(task):
 id,bank,note=task
 file=archives[id]/note['archivePath'] if 'archivePath' in note else fetch(note['url'])
 data,rate=sf.read(file,always_2d=True,dtype='float32');data=data[:,:2]
 if not np.isfinite(data).all() or not np.max(np.abs(data))>0.0001:raise ValueError('silent/invalid '+str(file))
 if rate!=44100:
  g=gcd(rate,44100);data=resample_poly(data,44100//g,rate//g);rate=44100
 peak=float(np.max(np.abs(data)));indices=np.flatnonzero(np.max(np.abs(data),axis=1)>peak*.003)
 start=max(0,int(indices[0])-220);end=min(len(data),int(indices[-1])+2205,start+rate*(4 if bank['loop'] else 10));data=data[start:end].copy()
 data*=.7/peak
 loop={}
 if bank['loop'] and len(data)>rate*1.5:
  end=min(len(data)-2205,rate*3);start=int(rate*.7);fade=int(rate*.12)
  blend=np.linspace(0,1,fade,dtype='float32')[:,None]
  data[end-fade:end]=data[end-fade:end]*(1-blend)+data[start:start+fade]*blend
  loop={'loopStart':(start+fade)/rate,'loopEnd':end/rate}
 data[:100]*=np.linspace(0,1,100)[:,None];data[-220:]*=np.linspace(1,0,220)[:,None]
 name=id+'/'+str(note['pitch'])+'.flac';dest=out/name;dest.parent.mkdir(exist_ok=True);sf.write(dest,data,rate,subtype='PCM_16',format='FLAC')
 return id,{'pitch':note['pitch'],'file':name,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size,**loop}
tasks=[(id,b,n) for id,b in sources.items() for n in b['samples']];manifest={id:{'source':b['source'],'license':b['license'],'samples':[]} for id,b in sources.items()}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for i,(id,note) in enumerate(pool.map(build,tasks)):
  manifest[id]['samples'].append(note)
  if i%20==0:print('Built',i+1,'/',len(tasks),flush=True)
for bank in manifest.values():bank['samples'].sort(key=lambda n:n['pitch'])
(out/'index.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Finished',len(tasks),'samples;',sum(n['bytes'] for b in manifest.values() for n in b['samples'])//1024,'KiB',flush=True)
