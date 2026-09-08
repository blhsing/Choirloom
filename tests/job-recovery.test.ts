import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),'choirloom-recovery-'));
const {run,one,db,transaction,revision}=await import('../server/db.ts');
const {recoverJobs}=await import('../server/jobs.ts');
const {demoScore}=await import('../shared/music.ts');
run("INSERT INTO users(id,email,name,password) VALUES('u','u@test','U','x')");
run("INSERT INTO projects(id,owner,title,score) VALUES('p','u','Test',?)",JSON.stringify(demoScore()));
test('orphaned jobs recover under the same ID; live and cancelled jobs are untouched',()=>{
 for(const [id,status,pid] of [['orphan','running',2147483647],['live','running',process.pid],['cancelled','cancelled',null],['legacy','running',null]] as const)run('INSERT INTO jobs(id,project_id,user_id,kind,status,payload,worker_pid,progress) VALUES(?,?,?,?,?,?,?,?)',id,'p','u','render',status,'{}',pid,42);
 recoverJobs();recoverJobs();
 assert.equal(one("SELECT status FROM jobs WHERE id='orphan'").status,'queued');
 assert.equal(one("SELECT progress FROM jobs WHERE id='orphan'").progress,42);
 assert.equal(one("SELECT status FROM jobs WHERE id='legacy'").status,'queued');
 assert.equal(one("SELECT status FROM jobs WHERE id='live'").status,'running');
 assert.equal(one("SELECT status FROM jobs WHERE id='cancelled'").status,'cancelled');
});
test('a failed completion transaction cannot leave a score revision behind',()=>{
 const p=one("SELECT * FROM projects WHERE id='p'");
 assert.throws(()=>transaction(()=>{revision(p,demoScore(),'u');throw Error('crash before job result');}));
 assert.equal(one("SELECT version FROM projects WHERE id='p'").version,1);
 assert.equal(one('SELECT COUNT(*) AS n FROM revisions').n,0);
 assert.equal(db.isTransaction,false);
});
test('recovered arrangement publishes its saved result exactly once without rerunning AI',async()=>{
 const {mkdirSync,writeFileSync}=await import('node:fs');const {tick}=await import('../server/jobs.ts');
 run("UPDATE jobs SET status='cancelled'");
 const dir=path.join(process.env.DATA_DIR!,'jobs','saved');mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'arrangement.json'),JSON.stringify({score:demoScore(),message:'Recovered answer'}));
 run("INSERT INTO jobs(id,project_id,user_id,kind,status,payload,worker_pid) VALUES('saved','p','u','ai','running',?,2147483647)",JSON.stringify({version:1}));
 await tick();await tick();
 assert.equal(one("SELECT status FROM jobs WHERE id='saved'").status,'complete');
 assert.equal(one("SELECT version FROM projects WHERE id='p'").version,2);
 assert.equal(one("SELECT COUNT(*) AS n FROM chats WHERE job_id='saved'").n,1);
});
