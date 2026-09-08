import {db} from './db.ts';
import {events} from './events.ts';
import {redact,redactText} from '../shared/redact.ts';
export type Level='debug'|'info'|'warn'|'error';
db.exec(`CREATE TABLE IF NOT EXISTS diagnostic_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,level TEXT NOT NULL,source TEXT NOT NULL,event TEXT NOT NULL,message TEXT,context TEXT,user_id TEXT,project_id TEXT,job_id TEXT,request_id TEXT,client_id TEXT,event_id TEXT,UNIQUE(client_id,event_id));CREATE INDEX IF NOT EXISTS diagnostic_time ON diagnostic_logs(time);CREATE INDEX IF NOT EXISTS diagnostic_job ON diagnostic_logs(job_id,id);`);
let count=0;
export function log(level:Level,event:string,context:Record<string,any>={},message='',source='server',dedupe?:{clientId:string,eventId:string}){
 try{
  const safe=redact(context),time=new Date().toISOString(),text=redactText(message);
  const inserted=db.prepare('INSERT OR IGNORE INTO diagnostic_logs(time,level,source,event,message,context,user_id,project_id,job_id,request_id,client_id,event_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(time,level,source,event.slice(0,100),text,JSON.stringify(safe),context.userId||null,context.projectId||null,context.jobId||null,context.requestId||null,dedupe?.clientId||null,dedupe?.eventId||null);
  if(!inserted.changes)return;
  const entry={id:Number(inserted.lastInsertRowid),time,level,source,event,message:text,context:safe,user_id:context.userId||null,project_id:context.projectId||null,job_id:context.jobId||null,request_id:context.requestId||null};
  if(process.env.NODE_ENV!=='test'&&level!=='debug')console.log(JSON.stringify({component:'Choirloom',...entry}));
  events.emit('log',entry);
  if(++count%200===0)db.exec("DELETE FROM diagnostic_logs WHERE id < (SELECT COALESCE(MAX(id),0)-20000 FROM diagnostic_logs) OR time < strftime('%Y-%m-%dT%H:%M:%fZ','now','-14 days')");
 }catch(error){console.error('Choirloom diagnostic storage unavailable:',redact(error));}
}
export function logMatches(entry:any,filter:any={}){return (!filter.level||entry.level===filter.level)&&(!filter.source||entry.source===filter.source)&&(!filter.jobId||entry.job_id===filter.jobId)&&(!filter.query||JSON.stringify(entry).toLowerCase().includes(String(filter.query).toLowerCase()));}
export function logs(filter:any={}){
 const limit=Math.max(1,Math.min(200,Number(filter.limit)||100)),before=Number(filter.before)||Number.MAX_SAFE_INTEGER;
 return db.prepare('SELECT * FROM diagnostic_logs WHERE id<? AND (?=\'\' OR level=?) AND (?=\'\' OR source=?) AND (?=\'\' OR job_id=?) ORDER BY id DESC LIMIT 1000').all(before,filter.level||'',filter.level||'',filter.source||'',filter.source||'',filter.jobId||'',filter.jobId||'').map((r:any)=>({...r,context:JSON.parse(r.context)})).filter(e=>logMatches(e,filter)).slice(0,limit);
}
export function ingestClientLogs(user:any,batch:any){
 const accepted:string[]=[];for(const item of batch.events){
  log(item.level,'client.'+item.event,{...redact(item.context||{}),userId:user?.id||null,clientTime:item.time,clientSession:batch.clientId},item.message||'','client',{clientId:batch.clientId,eventId:item.id});accepted.push(item.id);
 }return {accepted};
}
