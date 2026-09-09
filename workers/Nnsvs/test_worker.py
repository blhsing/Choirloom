import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import unittest
import tempfile
import zipfile
from pronunciation import approximate,note_phones
from worker import sustained,phrases,seconds,extract,inspect,inside

class SingingTests(unittest.TestCase):
    def test_ties_merge_only_contiguous_equal_pitch(self):
        notes=[{'id':'a','start':0,'duration':480,'pitch':60,'tie':'start','lyric':'me'},
               {'id':'b','start':480,'duration':960,'pitch':60,'tie':'stop','lyric':''},
               {'id':'c','start':1440,'duration':480,'pitch':60,'tie':'none','lyric':'again'}]
        merged=sustained(notes)
        self.assertEqual(len(merged),2)
        self.assertEqual(merged[0]['duration'],1440)
        self.assertEqual(merged[0]['members'],['a','b'])
        notes[1]['pitch']=62
        self.assertEqual(len(sustained(notes)),3)
    def test_tempo_and_phrase_boundaries(self):
        score={'tempo':120,'tempoMap':[{'tick':480,'bpm':60}]}
        self.assertEqual(seconds(score,960),1.5)
        notes=[{'id':'a','start':0,'duration':480,'pitch':60},{'id':'b','start':1440,'duration':480,'pitch':62}]
        self.assertEqual(len(list(phrases(score,notes))),2)
    def test_pronunciation_keeps_real_words_and_melismas(self):
        self.assertNotEqual(approximate('river'),['a'])
        self.assertEqual(approximate('[en/b en/aa]'),['b','a'])
        self.assertEqual(approximate('[ja/N]'),['N'])
        notes=[{'id':'a','pitch':60,'lyric':'Riv','syllabic':'begin'},{'id':'b','pitch':62,'lyric':'er','syllabic':'end'},{'id':'c','pitch':64,'lyric':''}]
        mapped=note_phones(notes,'en','woo')
        self.assertEqual(mapped['c'],[mapped['b'][-1]])
        self.assertEqual(notes[0]['lyric'],'Riv')
        self.assertEqual(note_phones([{'id':'a','pitch':60,'lyric':''}],'en','woo')['a'],['u'])
        self.assertTrue(approximate('你好','zh'))
        self.assertEqual(approximate('あ','ja'),['a'])
    def test_archive_traversal_and_dynamic_models_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);archive=root/'bad.zip'
            with zipfile.ZipFile(archive,'w') as z:z.writestr('../escaped.txt','bad')
            with self.assertRaises(ValueError):extract(archive,root/'model')
            self.assertFalse((root/'escaped.txt').exists())
    def test_mounted_paths_stay_short_without_resolving_to_unc(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with patch.object(Path,'resolve',side_effect=AssertionError('must retain mounted path')):
                self.assertEqual(inside(root,'model/config.yaml'),root/'model/config.yaml')
                with self.assertRaises(ValueError):inside(root,'../escaped')

if __name__=='__main__':unittest.main()
