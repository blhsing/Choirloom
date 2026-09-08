import {type Score} from './music.ts';

/** Keep the score's part order, rhythm, lyrics and original lead when included. */
export function selectParts(score:Score,ids:readonly string[]|null):Score {
 if(ids===null)return score;
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!score.parts.some(p=>p.id===id)))throw Error('invalidParts');
 const parts=score.parts.filter(p=>ids.includes(p.id));
 return {...score,parts,leadId:parts.some(p=>p.id===score.leadId)?score.leadId:parts[0].id};
}
export const exportName=(name:string)=>name.replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,90)||'Choirloom';
