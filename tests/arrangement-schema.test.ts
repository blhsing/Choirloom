import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {arrangementResponseSchema,parseArrangementResponse} from '../server/arrangement-schema.ts';
import {demoScore} from '../shared/music.ts';

test('arrangement response requires every nested object field for strict output',()=>{
 const visit=(node:any)=>{if(!node||typeof node!=='object')return;if(node.properties){assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());assert.equal(node.additionalProperties,false);}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else visit(value);};
 visit(z.toJSONSchema(arrangementResponseSchema));
});
test('nullable response fields preserve repeats and numbered endings in app scores',()=>{
 const score=demoScore();const barlines=[{bar:2,location:'left',repeat:null,times:null,endingType:'start',endingNumbers:[1]},{bar:3,location:'right',repeat:'backward',times:2,endingType:'stop',endingNumbers:[1]}];
 const result=parseArrangementResponse({message:'Done',score:{...score,barlines}});
 assert.deepEqual(result.score?.barlines,[{bar:2,location:'left',endingType:'start',endingNumbers:[1]},{bar:3,location:'right',repeat:'backward',times:2,endingType:'stop',endingNumbers:[1]}]);
 assert.deepEqual(result.score?.parts,score.parts);
 assert.deepEqual(parseArrangementResponse({message:'Done',score:{...score,barlines:null}}).score,score);
 assert.deepEqual(parseArrangementResponse({message:'Hello',score:null}),{message:'Hello',score:null});
});
