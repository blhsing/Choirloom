import type {Score,Finding} from './music.ts';import {barTicks} from './music.ts';
export type BarSelection={startBar:number,endBar:number,partIds?:string[]};
export function validateScopedEdit(before:Score,after:Score,selection?:BarSelection):Finding[]{
 if(!selection)return [];const start=(selection.startBar-1)*barTicks(before),end=selection.endBar*barTicks(before),inside=(n:any)=>n.start>=start&&n.start+n.duration<=end;
 const metadata=(s:Score)=>({...s,parts:s.parts.map(({notes,...p})=>p)});
 if(JSON.stringify(metadata(before))!==JSON.stringify(metadata(after)))return [{severity:'error',code:'outsideSelection'}];
 for(const part of before.parts){const next=after.parts.find(p=>p.id===part.id);if(!next)return [{severity:'error',code:'outsideSelection'}];for(const note of part.notes){const replacement=next.notes.find(n=>n.id===note.id);if((!inside(note)||(selection.partIds&&!selection.partIds.includes(part.id)))&&JSON.stringify(note)!==JSON.stringify(replacement))return [{severity:'error',code:'outsideSelection'}];}for(const note of next.notes){const original=part.notes.find(n=>n.id===note.id);if((!inside(note)||(selection.partIds&&!selection.partIds.includes(part.id)))&&JSON.stringify(note)!==JSON.stringify(original))return [{severity:'error',code:'outsideSelection'}];}}
 return [];
}
