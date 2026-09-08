import {expandRepeats} from '../shared/repeats';
import {type Score,PPQ,endTick} from '../shared/music';
export function secondsAt(score:Score,tick:number){let time=0,last=0,bpm=score.tempo;for(const t of [...score.tempoMap].sort((a,b)=>a.tick-b.tick)){if(t.tick>tick)break;time+=(t.tick-last)/PPQ*60/bpm;last=t.tick;bpm=t.bpm;}return time+(tick-last)/PPQ*60/bpm;}
export function playbackDuration(score:Score){const expanded=expandRepeats(score);return secondsAt(expanded,endTick(expanded));}
export class RenderedPlayer {
 ctx:AudioContext|null=null;buffers=new Map<string,AudioBuffer>();nodes:AudioBufferSourceNode[]=[];gains=new Map<string,GainNode>();started=0;offset=0;playing=false;generation=0;
 stop(){this.generation++;for(const n of this.nodes)try{n.stop();n.disconnect();}catch{}this.nodes=[];this.gains.clear();this.playing=false;}
 async play(score:Score,files:any[],base:string,offset=0,solo:string[]=[],share=''){
  this.stop();const generation=this.generation;this.ctx??=new AudioContext();const ctx=this.ctx;await ctx.resume();
  const tracks=await Promise.all(score.parts.filter(p=>p.notes.some(n=>n.pitch!==null)).map(async p=>{const f=files.find(f=>f.name===p.id+'.wav');if(!f)throw Error('singerUnavailable');let buffer=this.buffers.get(f.id);if(!buffer){const r=await fetch(`${base}/api/artifacts/${f.id}${share?'?share='+encodeURIComponent(share):''}`);if(!r.ok)throw Error('singerUnavailable');buffer=await ctx.decodeAudioData(await r.arrayBuffer());this.buffers.set(f.id,buffer);}return {p,buffer};}));
  if(generation!==this.generation)return;this.started=ctx.currentTime+.04;this.offset=offset;this.playing=true;for(const {p,buffer} of tracks){if(offset>=buffer.duration)continue;const node=ctx.createBufferSource(),gain=ctx.createGain();node.buffer=buffer;node.connect(gain);gain.connect(ctx.destination);gain.gain.value=p.muted||(solo.length&&!solo.includes(p.id))?0:p.gain/Math.max(1,Math.sqrt(tracks.length));node.start(this.started,offset);this.nodes.push(node);this.gains.set(p.id,gain);}
 }
 mix(score:Score,solo:string[]){for(const p of score.parts){const gain=this.gains.get(p.id);if(gain&&this.ctx)gain.gain.setTargetAtTime(p.muted||(solo.length&&!solo.includes(p.id))?0:p.gain/Math.max(1,Math.sqrt(this.gains.size)),this.ctx.currentTime,.02);}}
 position(){return this.playing&&this.ctx?this.offset+Math.max(0,this.ctx.currentTime-this.started):this.offset;}
}
export class PreviewPlayer {ctx:AudioContext|null=null;nodes:AudioNode[]=[];started=0;offset=0;duration=0;playing=false;
 stop(){for(const n of this.nodes)try{(n as OscillatorNode).stop?.();n.disconnect();}catch{}this.nodes=[];this.playing=false;}
 play(score:Score,offset=0,solo:string[]=[]){score=expandRepeats(score);this.stop();this.ctx??=new AudioContext();void this.ctx.resume();const ctx=this.ctx;this.started=ctx.currentTime;this.offset=offset;this.duration=secondsAt(score,endTick(score));this.playing=true;
 for(const p of score.parts){if(p.muted||(solo.length&&!solo.includes(p.id)))continue;for(const n of p.notes){if(n.pitch===null)continue;let start=secondsAt(score,n.start)-offset,end=secondsAt(score,n.start+n.duration)-offset;if(end<=0)continue;const frequency=440*2**((n.pitch-69)/12);const oscillator=ctx.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=frequency;const gain=ctx.createGain();const length=end-Math.max(0,start);gain.gain.setValueAtTime(0,ctx.currentTime+Math.max(0,start));gain.gain.linearRampToValueAtTime(p.gain*.09,ctx.currentTime+Math.max(0,start)+Math.min(.035,length/4));gain.gain.setValueAtTime(p.gain*.07,ctx.currentTime+Math.max(0,end-.05));gain.gain.linearRampToValueAtTime(0,ctx.currentTime+end);
 const sum=ctx.createGain();sum.gain.value=.7;for(const [f,q,g] of (p.wordless==='woo'&&!n.lyric?[[300,5,1],[870,8,.7],[2240,10,.2]]:[[800,5,1],[1200,8,.7],[2600,10,.2]])){const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=f;filter.Q.value=q;const fg=ctx.createGain();fg.gain.value=g;oscillator.connect(filter);filter.connect(fg);fg.connect(sum);this.nodes.push(filter,fg);}sum.connect(gain);gain.connect(ctx.destination);oscillator.start(ctx.currentTime+Math.max(0,start));oscillator.stop(ctx.currentTime+end+.01);this.nodes.push(oscillator,sum,gain);}}
 }
 position(){return this.playing&&this.ctx?Math.min(this.duration,this.offset+this.ctx.currentTime-this.started):this.offset;}
}
