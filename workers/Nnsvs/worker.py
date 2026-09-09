"""Headless, resumable NNSVS synthesis. Publisher model extensions are never executed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import urllib.request
import zipfile

for variable in ('OMP_NUM_THREADS','OPENBLAS_NUM_THREADS','MKL_NUM_THREADS'):
    os.environ.setdefault(variable,os.environ.get('NNSVS_THREADS','2'))

sys.path.insert(0,str(Path(__file__).resolve().parent))
from pronunciation import note_phones

REVISION = 'nnsvs-phrase-v1'

def watch_launcher():
    """Stop inference if its launcher is killed by a timeout, cancellation or restart."""
    pid=os.environ.get('CHOIRLOOM_LAUNCHER_PID')
    if not pid or os.name!='nt': return
    import ctypes
    import threading
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.restype=ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes=[ctypes.c_void_p,ctypes.c_uint32]
    kernel.CloseHandle.argtypes=[ctypes.c_void_p]
    handle=kernel.OpenProcess(0x00100000,False,int(pid))
    if not handle: raise RuntimeError('launcherUnavailable')
    def wait():
        result=kernel.WaitForSingleObject(handle,0xffffffff)
        kernel.CloseHandle(handle)
        if result==0: os._exit(75)
    threading.Thread(target=wait,daemon=True).start()

def emit(**value):
    print(json.dumps(value,ensure_ascii=False),flush=True)

def inside(root, relative):
    # Azure's mounted C:\home expands to a much longer UNC path with resolve().
    # Keep its short mount spelling. Archives cannot introduce links (see extract).
    root = Path(os.path.abspath(root))
    target = Path(os.path.abspath(root / relative))
    if not target.is_relative_to(root): raise ValueError('unsafeModelPath')
    current=target
    while current!=root:
        if current.is_symlink(): raise ValueError('unsafeModelPath')
        current=current.parent
    return target

def extract(archive, destination, encoding=None):
    with zipfile.ZipFile(archive,metadata_encoding=encoding) as z:
        if sum(f.file_size for f in z.infolist()) > 4*1024**3: raise ValueError('voiceArchiveTooLarge')
        for f in z.infolist():
            name = f.filename.replace('\\','/')
            if ':' in name or (f.external_attr>>16)&0o170000 == 0o120000: raise ValueError('unsafeArchiveEntry')
            target = inside(destination,name)
            if f.is_dir(): target.mkdir(parents=True,exist_ok=True)
            else:
                target.parent.mkdir(parents=True,exist_ok=True)
                with z.open(f) as src, target.open('wb') as out: shutil.copyfileobj(src,out)

def inspect(root):
    import yaml
    choices = []
    for config in root.rglob('config.yaml'):
        folder = config.parent
        if not all((folder/(n+'_model.yaml')).is_file() and (folder/(n+'_model.pth')).is_file() for n in ('acoustic','timelag','duration')): continue
        cfg = yaml.safe_load(config.read_text(encoding='utf-8-sig'))
        if not isinstance(cfg,dict) or not (folder/'qst.hed').is_file(): continue
        if not list(folder.glob('*.table')): continue
        if not all((folder/f'{side}_{model}_scaler_{stat}.npy').is_file() for model in ('timelag','duration','acoustic') for side,stats in [('in',('min','scale')),('out',('mean','var','scale'))] for stat in stats): continue
        # Hydra can instantiate Python objects: only NNSVS model classes are permitted.
        def validate(value):
            if isinstance(value,dict):
                for k,v in value.items():
                    if k == '_target_' and (not isinstance(v,str) or not re.fullmatch(r'(?:nnsvs\.(?:model|acoustic_models|diffsinger)|(?:usfgan|sifigan)\.(?:models|losses)|parallel_wavegan\.models|torch\.optim(?:\.lr_scheduler)?)\.[A-Z][A-Za-z0-9_]*',v)): raise ValueError('unsupportedModelClass')
                    validate(v)
            elif isinstance(value,list):
                for v in value: validate(v)
        for file in [config,*folder.glob('*model.yaml')]:
            source=file.read_text(encoding='utf-8-sig')
            if '${' in source: raise ValueError('dynamicModelConfigurationUnsupported')
            validate(yaml.safe_load(source))
        choices.append({'modelConfig':config.relative_to(root).as_posix(),'engine':'nnsvs','sampleRate':cfg.get('sample_rate'), 'wordless':True,'languageCodes':['ja'],'embeddedVocoder':(folder/'vocoder_model.pth').exists(),'vocoder':'WORLD'})
    return choices

def install(bank, cache):
    asset = bank['bundle']; digest = asset['sha256']
    if not re.fullmatch('[a-f0-9]{64}',digest): raise ValueError('invalidAssetHash')
    archive = cache/digest; unpacked = cache/(digest+'.files')
    cache.mkdir(parents=True,exist_ok=True)
    complete=archive.exists()
    if complete and not unpacked.exists():
        with archive.open('rb') as source: complete=hashlib.file_digest(source,'sha256').hexdigest()==digest
    if not complete:
        pending = cache/(digest+'.partial')
        local = Path(os.environ.get('CHOIRLOOM_ASSET_SOURCE',''))/asset.get('filename',digest+'.zip')
        if local.is_file(): shutil.copyfile(local,pending)
        else:
            with urllib.request.urlopen(asset['url'],timeout=60) as response,pending.open('wb') as out:
                total = int(response.headers.get('Content-Length') or asset.get('bytes') or 1); done = 0
                while block := response.read(1024*1024):
                    out.write(block); done += len(block); emit(progress=min(85,int(done/total*85)))
        with pending.open('rb') as source:
            if hashlib.file_digest(source,'sha256').hexdigest()!=digest: raise ValueError('assetChecksumMismatch')
        pending.replace(archive)
    if not unpacked.exists():
        stage = Path(tempfile.mkdtemp(prefix=digest[:12]+'.extract-',dir=cache))
        try:
            if digest == '9be4daff7eef46862e19b496e9b2ff41de861c18386d4e0f224534c3744a2a83':
                import subprocess
                extractor=Path(__file__).parent/'7za.exe'
                subprocess.run([str(extractor),'x',str(archive),'-o'+str(stage),'resources/app/singer/*','-y'],check=True,stdout=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            else: extract(archive,stage,bank.get("archiveEncoding"))
            # Only this original publisher release may load legacy sklearn scalers.
            if digest == 'a1e20b4d547a1714650a5d808bdd7f6a74d0ee7c437e70e0b5d0032f27603095':
                from legacy import pack
                pack(stage/'ENUNU_Haruqa_20201217',stage/'packed')
            if digest == 'eafa2a6a38530a65890145169b851c6b661de8b3c2d8f4ea9a93e694286c99db':
                from legacy import pack
                pack(next(stage.rglob('enuconfig.yaml')).parent,stage/'packed')
            if not inspect(stage): raise ValueError('noSupportedNnsvsModel')
            stage.rename(unpacked)
        finally:
            if stage.exists(): shutil.rmtree(stage)
    config = bank.get('modelConfig')
    choices = inspect(unpacked)
    selected = next((c for c in choices if c['modelConfig']==config),None) if config else next(iter(choices),None)
    if not selected: raise ValueError('noSupportedNnsvsModel')
    emit(progress=100)
    return inside(unpacked,selected['modelConfig']).parent

def seconds(score,tick):
    tempo = score['tempo']; last = 0; total = 0
    for change in sorted(score.get('tempoMap',[]),key=lambda t:t['tick']):
        if change['tick']>tick: break
        total += (change['tick']-last)*60/(tempo*480); last=change['tick']; tempo=change['bpm']
    return total+(tick-last)*60/(tempo*480)

def sustained(notes):
    merged=[]
    for original in sorted(notes,key=lambda n:n['start']):
        n=dict(original); n['members']=[n['id']]
        if merged and n.get('tie') in ('stop','continue'):
            prev=merged[-1]
            if prev['pitch']==n['pitch'] and prev['start']+prev['duration']==n['start'] and prev.get('tie') in ('start','continue'):
                prev['duration']+=n['duration']; prev['tie']=n['tie']; prev['members']+=n['members']; continue
        merged.append(n)
    return merged

def phrases(score,notes):
    chunk=[]
    for n in notes:
        if n['pitch'] is None: continue
        if chunk and (seconds(score,n['start'])-seconds(score,chunk[-1]['start']+chunk[-1]['duration'])>.3 or seconds(score,n['start'])-seconds(score,chunk[0]['start'])>=12):
            yield chunk; chunk=[]
        chunk.append(n)
    if chunk: yield chunk

def load_engine(folder):
    import numpy as np
    import torch
    from nnsvs.svs import SPSVS
    torch.set_num_threads(max(1,int(os.environ.get('NNSVS_THREADS','2'))))
    # Always use restricted checkpoint loading, including when upstream requests pickle.
    if not getattr(torch.load,'choirloom_safe',False):
        original=torch.load
        def restricted(*args,**kwargs):
            kwargs['weights_only']=True
            return original(*args,**kwargs)
        restricted.choirloom_safe=True; torch.load=restricted
    engine=SPSVS(str(folder),device='cpu')
    engine.config.pop('extensions',None)
    return engine

def synthesize(engine,folder,score,chunk,phones,flags=''):
    import numpy as np
    import utaupy
    from nnmnkwii.io import hts
    from scipy.signal import resample_poly
    ust=utaupy.ust.Ust(); ust.setting['Tempo']='120'
    origin=seconds(score,chunk[0]['start']); cursor=0
    def add(lyric,pitch,duration):
        if duration<.005: return
        n=utaupy.ust.Note(); n.lyric=lyric; n.notenum=pitch; n.length=max(5,round(duration*960)); n.tempo=120; n.flags=flags; ust.notes.append(n)
    add('R',60,.4)
    for n in chunk:
        start=seconds(score,n['start'])-origin; end=seconds(score,n['start']+n['duration'])-origin
        add('R',60,start-cursor)
        add(' '.join(phones[n['id']]),n['pitch'],end-start); cursor=end
    add('R',60,.4)
    table=utaupy.table.load(str(next(folder.glob('*.table'))),encoding='utf-8')
    song=utaupy.utils.ustobj2songobj(ust,table)
    with tempfile.TemporaryDirectory() as work:
        label=Path(work)/'score.lab'; song.write(str(label),strict_sinsy_style=False)
        labels=hts.load(str(label))
    # Labels contain phrase context; the neural duration and pitch models run across notes.
    wav,sr=engine.svs(labels,vocoder_type='auto',dtype=np.float32,force_fix_vuv=True,fill_silence_to_rest=True)
    wav=np.asarray(wav,dtype=np.float32).reshape(-1)
    if not np.isfinite(wav).all() or np.max(np.abs(wav),initial=0)<1e-5: raise ValueError('silentRenderedAudio')
    wav=wav[round(.4*sr):round((.4+cursor+.12)*sr)]
    from math import gcd
    divisor=gcd(sr,44100)
    return resample_poly(wav,44100//divisor,sr//divisor).astype(np.float32)

def render(score,banks,cache,output,validate=False):
    import numpy as np
    from scipy.io import wavfile
    output.mkdir(parents=True,exist_ok=True)
    total=max((seconds(score,n['start']+n['duration']) for p in score['parts'] for n in p['notes']),default=0)+.5
    mixed=np.zeros(round(total*44100),dtype=np.float32)
    bank_map={b['id']:b for b in banks}
    for part in score['parts']:
        notes=sustained(part['notes'])
        if not any(n['pitch'] is not None for n in notes): continue
        bank=bank_map[part['voicebank']]
        folder=install(bank,cache)
        phones=note_phones(notes,score.get('lyricsLanguage','en'),part.get('wordless','ah'))
        if validate: continue
        stem=np.zeros_like(mixed); engine=None
        for chunk in phrases(score,notes):
            key=hashlib.sha256(json.dumps([REVISION,bank,score['tempo'],score.get('tempoMap'),chunk,{n['id']:phones[n['id']] for n in chunk}],sort_keys=True).encode()).hexdigest()
            checkpoint=output/'phrases'/(key+'.npy'); checkpoint.parent.mkdir(exist_ok=True)
            if checkpoint.exists(): wav=np.load(checkpoint,allow_pickle=False)
            else:
                if engine is None: engine=load_engine(folder)
                wav=synthesize(engine,folder,score,chunk,phones,bank.get('flags',''))
                with checkpoint.with_suffix('.tmp').open('wb') as f: np.save(f,wav,allow_pickle=False)
                checkpoint.with_suffix('.tmp').replace(checkpoint)
            offset=round(seconds(score,chunk[0]['start'])*44100); count=min(len(wav),len(stem)-offset)
            stem[offset:offset+count]+=wav[:count]
            for n in chunk: emit(part=part['id'],note=n['id'])
        if engine is not None: del engine
        import gc; gc.collect()
        peak=float(np.max(np.abs(stem)))
        if peak<1e-5: raise ValueError('silentRenderedAudio')
        # Consistent voice audition level, with headroom for the ensemble mix.
        rms=float(np.sqrt(np.mean(stem[abs(stem)>1e-4]**2)))
        stem*=min(.8/peak,.13/max(rms,1e-6))
        wavfile.write(output/(part['id']+'.wav'),44100,(np.clip(stem,-1,1)*32767).astype(np.int16))
        mixed+=stem*part.get('gain',.8)
    if not validate:
        peak=float(np.max(np.abs(mixed),initial=0)); mixed*=min(1,.95/max(peak,1e-6))
        wavfile.write(output/'mix.wav',44100,(np.clip(mixed,-1,1)*32767).astype(np.int16))

def main():
    watch_launcher()
    parser=argparse.ArgumentParser()
    for name in ('score','output','voicebanks','cache','install','inspect-bank','validate-lyrics'): parser.add_argument('--'+name)
    args=parser.parse_args()
    if args.inspect_bank:
        with tempfile.TemporaryDirectory() as temp:
            extract(Path(args.inspect_bank),Path(temp)); emit(choices=inspect(Path(temp)))
        return
    banks=json.loads(Path(args.voicebanks).read_text(encoding='utf-8-sig')); cache=Path(args.cache)
    if args.install: install(next(b for b in banks if b['id']==args.install),cache)
    else: render(json.loads(Path(args.score).read_text(encoding='utf-8-sig')),banks,cache,Path(args.output),args.validate_lyrics=='true')

if __name__=='__main__':
    try: main()
    except Exception:
        import traceback; traceback.print_exc(file=sys.stderr); sys.exit(1)
