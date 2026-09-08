import {type Note} from './music.ts';

/** Join only explicit, contiguous, equal-pitch ties. Repeated attacks remain separate. */
export function sustainedNotes(notes:Note[]):Note[]{
 const result:Note[]=[];let previous:Note|undefined;
 for(const note of [...notes].sort((a,b)=>a.start-b.start)){
  const head=result.at(-1);
  if(head&&previous&&note.pitch!==null&&note.pitch===previous.pitch&&previous.start+previous.duration===note.start&&['start','continue'].includes(previous.tie)&&['stop','continue'].includes(note.tie))head.duration+=note.duration;
  else result.push({...note});
  previous=note;
 }
 return result;
}
