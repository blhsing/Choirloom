import test from 'node:test';
import assert from 'node:assert/strict';
import {demoScore} from '../shared/music.ts';
import {renderScore} from '../src/ScoreView.tsx';

test('zoom re-engraves bars into fewer systems when zooming out at a fixed width',async()=>{
 const score=demoScore();score.parts[0].notes=Array.from({length:96},(_,i)=>({...score.parts[0].notes[i%16],id:'layout'+i,start:i*480}));
 const small=await renderScore(score,false,{width:700,zoom:60});
 const large=await renderScore(score,false,{width:700,zoom:150});
 const count=(pages:string[],kind:string)=>pages.reduce((n,p)=>n+(p.match(new RegExp('class="'+kind+'"','g'))||[]).length,0);
 assert.equal(count(small,'measure'),24);assert.equal(count(large,'measure'),24);
 assert.ok(count(small,'system')<count(large,'system'),`Expected fewer systems: ${count(small,'system')} versus ${count(large,'system')}`);
});
