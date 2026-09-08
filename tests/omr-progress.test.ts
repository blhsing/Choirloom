import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,appendFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {watchOmrProgress} from '../server/omr-progress.ts';
test('Audiveris file logs report stages monotonically and final scan catches buffered output',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'choirloom-omr-progress-')),updates:Array<[number,string]>=[];
 const stop=watchOmrProgress(dir,(n,s)=>updates.push([n,s]),10);
 try{const file=path.join(dir,'score.log');writeFileSync(file,'INFO StepMonitoring.java:98 | LOAD\r\nINFO StepMonitoring.java:98 | HEADS\r\n');
  const deadline=Date.now()+3000;while(updates.length<2&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.equal(updates.at(-1)?.[1],'recognizing:HEADS');
  appendFileSync(file,'INFO StepMonitoring.java:98 | LOAD\r\nINFO StepMonitoring.java:98 | PAGE\r\n');await stop();
  assert.deepEqual(updates.map(u=>u[1]),['recognizing:LOAD','recognizing:HEADS','recognizing:PAGE']);assert.equal(updates.at(-1)?.[0],90);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
