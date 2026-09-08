import {all,one,run,transaction,HttpError} from './db.ts';
import {log,logs} from './diagnostics.ts';
import {workerStatus} from './jobs.ts';
import {catalog} from './voicebanks.ts';
export function adminUsers(){return all('SELECT u.id,u.email,u.name,u.role,u.created,(SELECT COUNT(*) FROM projects p WHERE p.owner=u.id) AS projects FROM users u ORDER BY u.created DESC');}
export function adminWorks(){return all('SELECT p.id,p.title,p.version,p.updated,u.name AS ownerName,u.email AS ownerEmail,p.owner FROM projects p JOIN users u ON u.id=p.owner ORDER BY p.updated DESC');}
export function setRole(actor:any,id:string,role:string){
 if(actor.role!=='admin')throw new HttpError(403,'adminRequired');
 transaction(()=>{const target=one('SELECT id,role FROM users WHERE id=?',id);if(!target)throw new HttpError(404,'notFound');if(target.role==='admin'&&role==='user'&&one("SELECT COUNT(*) AS count FROM users WHERE role='admin'").count<=1)throw new HttpError(409,'lastAdmin');run('UPDATE users SET role=? WHERE id=?',role,id);});
 log('info','admin.role.changed',{userId:actor.id,targetUserId:id,role});
}
export function adminSnapshot(filter:any={}){return {users:adminUsers(),works:adminWorks(),logs:logs(filter),health:{pid:process.pid,uptime:Math.floor(process.uptime()),node:process.version,worker:workerStatus(),voiceCount:catalog().length,memoryMB:Math.round(process.memoryUsage().rss/1048576)},jobs:all('SELECT j.id,j.project_id,j.user_id,j.kind,j.status,j.stage,j.error,j.progress,j.created,j.updated,p.title FROM jobs j JOIN projects p ON p.id=j.project_id ORDER BY j.created DESC,j.rowid DESC LIMIT 100')};}
