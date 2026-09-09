import {expandRepeats} from '../shared/repeats.ts';
import {existsSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {zipSync,strToU8} from 'fflate';
import midiPackage from '@tonejs/midi';
import {type Score,PPQ,toMusicXML,toMXL,singingKey} from '../shared/music.ts';
import {selectParts,exportName} from '../shared/selection.ts';
import {one,HttpError} from './db.ts';
import {processCommand} from './jobs.ts';

export function selection(score:Score,query:any){
 const raw=query.parts??query.part;
 if(raw===undefined)return score;
 if(typeof raw!=='string')throw new HttpError(400,'invalidParts');
 try{return selectParts(score,raw.split(','));}catch{throw new HttpError(400,'invalidParts');}
}
export function structuredFile(score:Score,format:string):{bytes:Uint8Array,mime:string}{
 if(format==='musicxml')return {bytes:strToU8(toMusicXML(score)),mime:'application/vnd.recordare.musicxml+xml'};
 if(format==='mxl')return {bytes:toMXL(score),mime:'application/vnd.recordare.musicxml'};
 if(format==='json')return {bytes:strToU8(JSON.stringify(score)),mime:'application/json'};
 if(format==='mid'){score=expandRepeats(score);
  const midi=new midiPackage.Midi();midi.header.setTempo(score.tempo);
  for(const t of score.tempoMap)midi.header.tempos.push({ticks:t.tick/PPQ*midi.header.ppq,bpm:t.bpm});
  for(const p of score.parts){const track=midi.addTrack();track.name=p.name;for(const n of p.notes)if(n.pitch!==null)track.addNote({midi:n.pitch,ticks:Math.round(n.start/PPQ*midi.header.ppq),durationTicks:Math.round(n.duration/PPQ*midi.header.ppq),velocity:.8});}
  return {bytes:midi.toArray(),mime:'audio/midi'};
 }
 throw new HttpError(400,'invalidInput');
}
export function structuredExport(score:Score,format:string,separate:boolean){
 if(!separate||score.parts.length===1){const file=structuredFile(score,format);return {...file,name:exportName(score.title)+(score.parts.length===1?' - '+exportName(score.parts[0].name):'')+'.'+format};}
 const files=Object.fromEntries(score.parts.map((part,i)=>[`${String(i+1).padStart(2,'0')} - ${exportName(part.name)}.${format}`,structuredFile(selectParts(score,[part.id]),format).bytes]));
 return {bytes:zipSync(files),mime:'application/zip',name:exportName(score.title)+' - parts.zip'};
}
let activeExports=0;
export async function audioExport(projectId:string,score:Score,chosen:Score,format:string,separate:boolean,signal:AbortSignal,pinnedVersion?:number){
 if(!['wav','mp3'].includes(format))throw new HttpError(400,'invalidInput');
 const job=one("SELECT result FROM jobs WHERE project_id=? AND kind='render' AND status='complete' AND json_extract(result,'$.key')=? AND (? IS NULL OR json_extract(result,'$.version')=?) ORDER BY created DESC,rowid DESC LIMIT 1",projectId,singingKey(score),pinnedVersion??null,pinnedVersion??null);
 if(!job)throw new HttpError(409,'renderRequired');
 const result=JSON.parse(job.result);
 const parts=chosen.parts.map(part=>{
  const stem=result.files.find((f:any)=>f.name===part.id+'.wav');
  const artifact=stem&&one('SELECT path FROM artifacts WHERE id=? AND project_id=? AND version=?',stem.id,projectId,result.version);
  if(!artifact||!existsSync(artifact.path))throw new HttpError(409,'renderRequired');
  return {id:part.id,name:part.name,file:artifact.path,gain:part.gain};
 });
 if(activeExports>=2)throw new HttpError(429,'jobBusy');
 if(!process.env.NNSVS_COMMAND||!existsSync(process.env.NNSVS_COMMAND))throw new HttpError(503,'singerUnavailable');
 const root=path.join(tmpdir(),'choirloom-exports');mkdirSync(root,{recursive:true});const dir=mkdtempSync(path.join(root,'mix-'));
 const cleanup=()=>rmSync(dir,{recursive:true,force:true});activeExports++;
 try{
  const input=path.join(dir,'request.json');writeFileSync(input,JSON.stringify({parts,format,separate}),{mode:0o600});
  await processCommand(process.env.NNSVS_COMMAND,['--mix',input,'--output',dir],signal);
  if(signal.aborted)throw new HttpError(499,'cancelled');
  const extension=separate&&parts.length>1?'zip':format;
  const file=path.join(dir,'export.'+extension);if(!existsSync(file))throw new HttpError(500,'workerFailed');
  return {file,name:exportName(score.title)+(parts.length===1?' - '+exportName(parts[0].name):' - '+parts.length+' voices')+'.'+extension,cleanup};
 }catch(error){cleanup();throw error;}finally{activeExports--;}
}
