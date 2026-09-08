import {barTicks,endTick,type Score,type Note} from './music.ts';

/** Written bar numbers stay stable; only performance traverses them twice. */
export function playbackBars(score:Score):number[]{
 const count=Math.ceil(endTick(score)/barTicks(score)),marks=score.barlines||[],starts:number[]=[],sections=new Map<number,{start:number,times:number}>();
 for(let bar=1;bar<=count;bar++)for(const mark of marks.filter(m=>m.bar===bar)){
  if(mark.repeat==='forward')starts.push(bar);
  if(mark.repeat==='backward')sections.set(bar,{start:starts.pop()||1,times:mark.times||2});
 }
 const endings:Array<{start:number,end:number,passes:number[]}>=[];let open:typeof endings[number]|undefined;
 for(const mark of marks){if(mark.endingType==='start')open={start:mark.bar,end:count,passes:mark.endingNumbers||[]};else if(open&&mark.endingType){open.end=mark.bar;endings.push(open);open=undefined;}}if(open)endings.push(open);
 const passes=new Map<number,number>(),result:number[]=[];let lastPass=1;
 for(let bar=1,steps=0;bar<=count&&steps<10000;steps++){
  const section=[...sections].filter(([end,s])=>s.start<=bar&&end>=bar).sort((a,b)=>a[0]-b[0])[0];
  const pass=section?(passes.get(section[0])||1):lastPass,ending=endings.find(e=>e.start<=bar&&e.end>=bar);
  if(!ending||ending.passes.includes(pass))result.push(bar);
  const repeat=sections.get(bar);if(repeat){const n=passes.get(bar)||1;lastPass=n;if(n<repeat.times){passes.set(bar,n+1);for(const [end,s] of sections)if(end<bar&&s.start>=repeat.start)passes.delete(end);bar=repeat.start;continue;}}
  bar++;
 }
 if(result.length>=10000)throw Error('invalidImport');return result;
}
export function expandRepeats(score:Score):Score{
 if(!score.barlines?.some(m=>m.repeat))return score;
 const bt=barTicks(score),bars=playbackBars(score),tempoAt=(tick:number)=>[...score.tempoMap].sort((a,b)=>a.tick-b.tick).filter(t=>t.tick<=tick).at(-1)?.bpm||score.tempo;
 const expanded:Score={...score,barlines:[],tempoMap:bars.flatMap((bar,i)=>[{tick:i*bt,bpm:tempoAt((bar-1)*bt)},...score.tempoMap.filter(t=>t.tick>(bar-1)*bt&&t.tick<bar*bt).map(t=>({...t,tick:i*bt+t.tick-(bar-1)*bt}))]),parts:score.parts.map(p=>({...p,notes:bars.flatMap((bar,i)=>p.notes.filter(n=>n.start<bar*bt&&n.start+n.duration>(bar-1)*bt).map(n=>{const start=Math.max(n.start,(bar-1)*bt),end=Math.min(n.start+n.duration,bar*bt),stop=n.start<start||['stop','continue'].includes(n.tie),begin=n.start+n.duration>end||['start','continue'].includes(n.tie);return {...n,id:n.id+'-visit'+i,start:i*bt+start-(bar-1)*bt,duration:end-start,lyric:start>n.start?'':n.lyric,tie:(stop&&begin?'continue':stop?'stop':begin?'start':'none') as Note['tie']};}))}))};
 // A jump may leave a tie without its partner. Do not sustain across that jump.
 for(const p of expanded.parts){const ties=p.notes.map(n=>n.tie);p.notes.forEach((n,i)=>{const prev=p.notes[i-1],next=p.notes[i+1],stop=['stop','continue'].includes(ties[i])&&prev?.pitch===n.pitch&&prev.start+prev.duration===n.start&&['start','continue'].includes(ties[i-1]),start=['start','continue'].includes(ties[i])&&next?.pitch===n.pitch&&n.start+n.duration===next.start&&['stop','continue'].includes(ties[i+1]);n.tie=stop&&start?'continue':stop?'stop':start?'start':'none';});}
 return expanded;
}
