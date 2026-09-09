"""One-time operator cleanup after the NNSVS application is deployed.

Requires a saved retired-voicebanks.json in the private data directory.
Defaults to a dry run; --apply removes only retired model packages and render jobs
whose saved score still selects those voices. Scores themselves are retained.
"""
from pathlib import Path
import argparse,json,re,shutil,sqlite3

parser=argparse.ArgumentParser()
parser.add_argument('--data',default='C:/home/data/choirloom')
parser.add_argument('--apply',action='store_true')
args=parser.parse_args()
data=Path(args.data).resolve()
old=json.loads((data/'retired-voicebanks.json').read_text(encoding='utf-8-sig'))
banks={b['id']:b for b in old if b.get('engine')!='nnsvs'}
with sqlite3.connect(data/'choirloom.sqlite',timeout=30) as db:
    for bank_id,manifest in db.execute('SELECT bank_id,manifest FROM voice_custom'):
        bank=json.loads(manifest)
        if bank.get('engine')!='nnsvs':banks[bank_id]=bank
    paths=set()
    for bank in banks.values():
        for key in ('bundle','vocoderBundle','dictionary'):
            asset=bank.get(key) or {};digest=asset.get('sha256','')
            if re.fullmatch('[a-f0-9]{64}',digest):
                for suffix in ('','.files','.partial'):paths.add(data/'voices/shared'/(digest+suffix))
    jobs=[]
    for job_id, in db.execute("SELECT id FROM jobs WHERE kind='render'"):
        if not re.fullmatch('[A-Za-z0-9_-]+',job_id):continue
        folder=data/'jobs'/job_id
        score=folder/'score.json'
        if score.exists() and any(p.get('voicebank') in banks for p in json.loads(score.read_text(encoding='utf-8-sig')).get('parts',[])):
            jobs.append(job_id);paths.add(folder)
    # Validate every absolute target before any recursive operation.
    allowed=[(data/'voices/shared').resolve(),(data/'jobs').resolve()]
    checked=[]
    for path in paths:
        target=path.resolve()
        if not any(target.parent==root for root in allowed):raise RuntimeError('Unsafe cleanup target: '+str(target))
        if target.exists():checked.append(target)
    print(json.dumps({'retiredVoices':len(banks),'renderJobs':len(jobs),'paths':[str(p) for p in sorted(checked)],'apply':args.apply}),flush=True)
    if args.apply:
        for target in checked:
            if target.is_dir():shutil.rmtree(target)
            else:target.unlink()
        for job_id in jobs:
            prefix=str(data/'jobs'/job_id)
            db.execute('DELETE FROM artifacts WHERE path LIKE ?',(prefix+'%',))
            db.execute('DELETE FROM jobs WHERE id=?',(job_id,))
        for bank_id in banks:
            db.execute('DELETE FROM voice_library WHERE bank_id=?',(bank_id,))
            db.execute('DELETE FROM voice_installs WHERE bank_id=?',(bank_id,))
            db.execute('DELETE FROM voice_custom WHERE bank_id=?',(bank_id,))
        print('Retired DiffSinger assets removed.',flush=True)
