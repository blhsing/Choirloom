import test from 'node:test';import assert from 'node:assert/strict';import {newScore} from '../shared/music.ts';import {renderScore} from '../src/ScoreView.tsx';
test('import preview leaves unrecognized lyrics blank while singing view can show wordless syllables',async()=>{
 const s=newScore('Import review');s.parts[0].notes=[{id:'blank-note',pitch:60,start:0,duration:480,lyric:'',syllabic:'single',tie:'none',locked:false}];
 const imported=(await renderScore(s,false)).join('');assert(!/>ah</.test(imported));
 const singing=(await renderScore(s,true)).join('');assert(/>ah</.test(singing));
});
