import {z} from 'zod';
import {barlineSchema,scoreSchema} from '../shared/music.ts';

// Structured outputs require every property; absent repeat attributes travel as
// null, then become omitted properties in the application's score model.
const responseBarline=barlineSchema.extend({
 repeat:barlineSchema.shape.repeat.unwrap().nullable(),
 times:barlineSchema.shape.times.unwrap().nullable(),
 endingType:barlineSchema.shape.endingType.unwrap().nullable(),
 endingNumbers:barlineSchema.shape.endingNumbers.unwrap().nullable(),
});
export const arrangementResponseSchema=z.object({message:z.string(),score:scoreSchema.extend({
 barlines:z.array(responseBarline).max(2000).nullable(),
}).nullable()});
export function parseArrangementResponse(value:unknown){
 const result=arrangementResponseSchema.parse(value);
 if(!result.score)return {message:result.message,score:null};
 const {barlines,...score}=result.score;
 return {message:result.message,score:scoreSchema.parse({...score,...(barlines===null?{}:{barlines:barlines.map(mark=>Object.fromEntries(Object.entries(mark).filter(([,v])=>v!==null)))})})};
}
