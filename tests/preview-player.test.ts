import test from 'node:test';
import assert from 'node:assert/strict';
import {PreviewPlayer} from '../src/audio.ts';
import {demoScore} from '../shared/music.ts';
import {previewInstruments,previewInstrument} from '../src/preview-instruments.ts';

test('all instrument presets schedule audible envelopes and stop cleanly',()=>{
 const score=demoScore();const signatures=new Set<string>();
 for(const preset of previewInstruments.filter(p=>p.id!=='voice')){
  const levels:number[]=[],starts:number[]=[];
  const param=()=>({value:0,setValueAtTime(v:number){levels.push(v);},linearRampToValueAtTime(v:number){levels.push(v);},setTargetAtTime(v:number){levels.push(v);}});
  const node=()=>({connect(){},disconnect(){},gain:param(),frequency:param(),setPeriodicWave(){},start(t:number){starts.push(t);},stop(){},onended:null});
  const ctx={currentTime:2,resume:async()=>{},createGain:node,createOscillator:node,createPeriodicWave(real:Float32Array,imag:Float32Array){assert.equal(real.length,imag.length);signatures.add(JSON.stringify([...imag]));return {};},destination:{}};
  const player=new PreviewPlayer();player.ctx=ctx as any;
  try{player.play(score,.2,[],preset.id);assert.ok(levels.some(v=>v>0));assert.ok(starts.length>0&&starts.every(t=>t>=2));assert.equal(player.position(),.2);assert.ok(player.nodes.length<20);}finally{player.stop();}assert.equal(player.nodes.length,0);assert.equal(player.timer,null);
 }
 assert.equal(signatures.size,12);assert.equal(previewInstrument('invalid'),'piano');
});

test('preview schedules a bounded window, advances, and releases finished voices',async()=>{
 const param={value:0,setValueAtTime(){},linearRampToValueAtTime(){}};
 const oscillators:any[]=[];
 const node=()=>({connect(){},disconnect(){},gain:{...param},frequency:{...param},Q:{...param},start(){},stop(){},onended:null});
 const ctx={currentTime:0,resume:async()=>{},createGain:node,createBiquadFilter:node,createOscillator:()=>{const n=node();oscillators.push(n);return n;},destination:{}};
 const player=new PreviewPlayer();player.ctx=ctx as any;
 const score=demoScore();score.parts[0].notes=Array.from({length:1000},(_,i)=>({...score.parts[0].notes[0],id:'n'+i,start:i*480}));
 try{player.play(score);assert.ok(oscillators.length<5);const first=oscillators.length;ctx.currentTime=3;await new Promise(r=>setTimeout(r,130));assert.ok(oscillators.length>first);assert.ok(oscillators.length<10);const before=player.nodes.length;oscillators[0].onended();assert.equal(player.nodes.length,before-9);assert.ok(player.position()>2);player.stop();assert.equal(player.nodes.length,0);assert.equal(player.timer,null);}finally{player.stop();}
});
import {sustainedNotes} from '../shared/ties.ts';
import {expandRepeats} from '../shared/repeats.ts';
test('preview sustains ties through bar lines and first endings without merging repeated attacks',()=>{
 const score=demoScore(),base=score.parts[0].notes[0];score.parts=score.parts.slice(0,1);
 score.beats=3;score.beatType=4;
 score.parts[0].notes=[{...base,id:'a',pitch:60,start:0,duration:1440,tie:'start'},{...base,id:'b',pitch:60,start:1440,duration:960,tie:'stop'},{...base,id:'c',pitch:60,start:2400,duration:480,tie:'none'}];
 score.barlines=[{bar:2,location:'right',repeat:'backward',times:2}];
 const written=JSON.stringify(score),notes=sustainedNotes(expandRepeats(score).parts[0].notes);
 assert.deepEqual(notes.map(n=>[n.start,n.duration]),[[0,2400],[2400,480],[2880,2400],[5280,480]]);
 assert.equal(JSON.stringify(score),written);
});
