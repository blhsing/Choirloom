import type {Score} from '../shared/music';
import type {PreviewInstrument} from './preview-instruments';
export type Sample={pitch:number,file:string,sha256:string,loopStart?:number,loopEnd?:number};
export type LoadedSample=Sample&{buffer:AudioBuffer};
let manifest:Promise<Record<string,{samples:Sample[]}>>|undefined;
const decoded=new Map<string,Promise<AudioBuffer>>();
export function nearestSample<T extends {pitch:number}>(samples:T[],pitch:number):T{return samples.reduce((best,s)=>Math.abs(s.pitch-pitch)<Math.abs(best.pitch-pitch)?s:best);}
async function sampleBytes(url:string){let cache:Cache|undefined;try{cache=await caches.open('choirloom-instruments-v1');const found=await cache.match(url);if(found)return found.arrayBuffer();}catch{}const response=await fetch(url,{cache:'force-cache'});if(!response.ok)throw Error('instrumentSampleUnavailable');try{await cache?.put(url,response.clone());}catch{}return response.arrayBuffer();}
export async function loadInstrument(ctx:AudioContext,instrument:PreviewInstrument,score:Score,base:string):Promise<LoadedSample[]>{
 if(instrument==='voice')return [];
 const root=base.replace(/\/$/,'')+'/instrument-samples/';
 manifest??=fetch(root+'index.json').then(r=>{if(!r.ok)throw Error('instrumentSampleUnavailable');return r.json();}).catch(e=>{manifest=undefined;throw e;});
 const bank=(await manifest)[instrument];if(!bank?.samples.length)throw Error('instrumentSampleUnavailable');
 const needed=new Set(score.parts.flatMap(p=>p.notes.filter(n=>n.pitch!==null).map(n=>nearestSample(bank.samples,n.pitch!).file)));
 return Promise.all(bank.samples.filter(s=>needed.has(s.file)).map(async sample=>{
  const url=root+sample.file+'?v='+sample.sha256;
  if(!decoded.has(url))decoded.set(url,sampleBytes(url).then(bytes=>ctx.decodeAudioData(bytes)).catch(e=>{decoded.delete(url);throw e;}));
  return {...sample,buffer:await decoded.get(url)!};
 }));
}
