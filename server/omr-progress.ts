import {open,readdir} from 'node:fs/promises';
import path from 'node:path';
import {omrStages} from '../shared/omr-stages.ts';

// Audiveris writes its stage events to a per-book log, not reliably to stdout.
export function watchOmrProgress(directory:string,update:(progress:number,stage:string)=>void,intervalMs=1500){
 let last=-1,pending:Promise<void>|undefined;
 const scan=()=>pending??=(async()=>{
  try{for(const name of await readdir(directory)){
   if(!name.endsWith('.log'))continue;
   const file=await open(path.join(directory,name),'r');
   try{const {size}=await file.stat();const bytes=Buffer.alloc(Math.min(size,65536));await file.read(bytes,0,bytes.length,Math.max(0,size-bytes.length));
    for(const match of bytes.toString().matchAll(/StepMonitoring\.java:\d+\s*\|\s*([A-Z_]+)/g)){
     const index=omrStages.findIndex(s=>s[0]===match[1]);
     if(index>last){last=index;update(10+Math.floor((index+1)/omrStages.length*80),`recognizing:${match[1]}`);}
    }
   }finally{await file.close();}
  }}catch(error:any){if(error.code!=='ENOENT')throw error;}
 })().finally(()=>{pending=undefined;});
 const timer=setInterval(()=>{void scan().catch(()=>{});},intervalMs);
 return async()=>{clearInterval(timer);if(pending)await pending.catch(()=>{});await scan().catch(()=>{});};
}
