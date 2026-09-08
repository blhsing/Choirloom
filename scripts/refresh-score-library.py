"""Refresh the pinned CC0 OpenScore Lieder catalog. Scores are fetched only on import."""
import hashlib,json,sqlite3,tempfile,urllib.request,urllib.parse
from pathlib import Path

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Choirloom-catalog'}),timeout=60) as r:
        return r.read(8_000_000)

def main():
    tree=json.loads(fetch('https://api.github.com/repos/OpenScore/Lieder/git/trees/main?recursive=1'))
    if tree.get('truncated'):raise RuntimeError('Incomplete repository tree')
    commit=tree['sha'];base=f'https://raw.githubusercontent.com/OpenScore/Lieder/{commit}/'
    paths={Path(x['path']).stem[2:]:x for x in tree['tree'] if x['path'].endswith('.mxl')}
    with tempfile.TemporaryDirectory(prefix='choirloom-catalog-') as tmp:
        db=Path(tmp)/'lieder.db';db.write_bytes(fetch(base+'data/lieder.db'))
        connection=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True);connection.row_factory=sqlite3.Row
        songs=[]
        for row in connection.execute('SELECT s.*,c.name_display AS composer_name,c.born,c.died,t.title AS set_title FROM song s JOIN composer c ON c.id=s.composer LEFT JOIN sets t ON t.id=s.sets WHERE s.completed=1 ORDER BY c.name_display,s.title'):
            item=paths.get(str(row['musescore_id']))
            if not item:continue
            score_id=str(row['musescore_id']);songs.append({'id':'openscore-'+score_id,'title':row['title'],'composer':row['composer_name'],'collection':row['set_title'] or '', 'lyricist':row['lyricist'] or '', 'languages':(row['language'] or 'und').lower().split(),'born':row['born'],'died':row['died'],'source':'OpenScore Lieder','license':'CC0-1.0','sourceUrl':'https://github.com/OpenScore/Lieder/blob/'+commit+'/'+urllib.parse.quote(item['path']),'url':base+urllib.parse.quote(item['path']),'blobSha':item['sha'],'bytes':item.get('size',0)})
        connection.close()
    root=Path(__file__).resolve().parents[1]
    (root/'config/score-library.json').write_text(json.dumps({'sourceUrl':'https://fourscoreandmore.org/openscore/lieder/','licenseUrl':'https://github.com/OpenScore/Lieder/blob/'+commit+'/LICENSE.txt','commit':commit,'songs':songs},ensure_ascii=False,indent=2),encoding='utf8')
    print(f'Indexed {len(songs)} songs at {commit}')
if __name__=='__main__':main()
