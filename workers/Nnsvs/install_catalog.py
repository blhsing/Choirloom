"""Operator-only, restartable installation and inference verification on the host."""
import gc
import json
import os
from pathlib import Path
import sqlite3
import sys
sys.path.insert(0,str(Path(__file__).parent))
from worker import render

data=Path(os.environ.get('DATA_DIR','C:/home/data/choirloom'))
banks=json.loads((Path(__file__).parent/'banks-staging.json').read_text(encoding='utf-8-sig'))
status_path=data/'nnsvs-install-status.json'
status=[]
for bank in banks:
    try:
        score={'tempo':120,'lyricsLanguage':'en','parts':[{'id':'probe','voicebank':bank['id'],'notes':[
            {'id':'n1','pitch':60,'start':0,'duration':480,'lyric':'Sing'},
            {'id':'n2','pitch':62,'start':480,'duration':480,'lyric':'with'},
            {'id':'n3','pitch':64,'start':960,'duration':480,'lyric':'me','tie':'start'},
            {'id':'n4','pitch':64,'start':1440,'duration':480,'lyric':'','tie':'stop'}]}]}
        status.append({'id':bank['id'],'status':'running'})
        status_path.write_text(json.dumps(status),encoding='utf-8')
        output=data/'nnsvs-verification'/bank['id']
        render(score,banks,data/'voices/shared',output)
        # Original archives and extracted models remain private, with publisher notices.
        archive=data/'voices/shared'/bank['bundle']['sha256']
        extracted=archive.with_name(archive.name+'.files')
        size=archive.stat().st_size+sum(p.stat().st_size for p in extracted.rglob('*') if p.is_file())
        with sqlite3.connect(data/'choirloom.sqlite',timeout=30) as db:
            db.execute("INSERT INTO voice_library(bank_id,status,progress,bytes,error) VALUES(?,'installed',100,?,NULL) ON CONFLICT(bank_id) DO UPDATE SET status='installed',progress=100,bytes=excluded.bytes,error=NULL",(bank['id'],size))
        status[-1]['status']='complete'
    except Exception as error:
        import traceback;traceback.print_exc()
        status[-1].update(status='failed',error=str(error))
    finally:
        status_path.write_text(json.dumps(status),encoding='utf-8')
        gc.collect()
if any(s['status']!='complete' for s in status):sys.exit(1)
