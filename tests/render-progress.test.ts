import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
process.env.NODE_ENV='test';process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),'choirloom-render-progress-'));
const {processCommand}=await import('../server/jobs.ts');const {db,run,one}=await import('../server/db.ts');const {events}=await import('../server/events.ts');
test.after(()=>{db.close();rmSync(process.env.DATA_DIR!,{recursive:true,force:true});});
test('native note output streams durable progress across fragmented lines and ignores duplicates',async()=>{
 run("INSERT INTO users(id,email,name,password) VALUES('u','render@example.test','Render','unused')");run("INSERT INTO projects(id,owner,title,score) VALUES('p','u','Render','{}')");run("INSERT INTO jobs(id,project_id,user_id,kind,status,payload) VALUES('j','p','u','render','running','{}')");
 let updates=0;const change=(table:string)=>{if(table==='jobs')updates++;};events.on('change',change);
 const script=`process.stdout.write('{"part":0,"no');setTimeout(()=>{process.stdout.write('te":"n1"}\\n{"part":0,"note":"n1"}\\nnoise\\n{"part":1,"note":"n1"}\\n');},30);`;
 await processCommand(process.execPath,['-e',script],new AbortController().signal,undefined,{jobId:'j',renderTotal:4});events.off('change',change);
 const job=one("SELECT progress,stage,status FROM jobs WHERE id='j'");assert.equal(job.progress,52);assert.equal(job.stage,'rendering:2:4');assert.equal(job.status,'running');assert.ok(updates>=2);
});
