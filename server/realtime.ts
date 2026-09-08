import type {Server,IncomingMessage} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
import {one,hash} from './db.ts';
import {events} from './events.ts';
import {voiceState} from './voicebanks.ts';
import {loginStatus} from './ai.ts';
import {safeUser,projectList,projectDetails,projectJobs} from './projects.ts';
import {log,ingestClientLogs,logMatches} from './diagnostics.ts';
import {adminSnapshot} from './admin.ts';
import {origin} from './mail.ts';
import {telemetrySchema} from '../shared/telemetry.ts';
type Client={socket:WebSocket,session:string,projectId:string|null,admin:boolean,filter:any,ready:boolean,alive:boolean,messages:number,windowStart:number};
export function attachRealtime(server:Server){
 const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false}),clients=new Set<Client>();
 const user=(c:Client)=>one('SELECT u.*,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',c.session,Date.now());
 function send(c:Client,type:string,data:any){if(c.socket.readyState!==WebSocket.OPEN)return;if(c.socket.bufferedAmount>8*1024*1024){c.socket.close(1013,'Client too slow');return;}c.socket.send(JSON.stringify({type,data}));}
 function refresh(c:Client,tables:Set<string>,full=false){
  if(!c.ready)return;const u=user(c);if(!u){c.socket.close(4401,'Session expired');return;}
  try{
   if(full||tables.has('users')||tables.has('sessions')){send(c,'session',safeUser(u));if(u.role!=='admin')c.admin=false;}
   if(full||['projects','members','users'].some(t=>tables.has(t)))send(c,'projects',projectList(u));
   if(full||tables.has('voice_library')||tables.has('voice_imports')||tables.has('users')||tables.has('catalog'))send(c,'voicebanks',voiceState(u.id));
   if(full||tables.has('ai')||tables.has('users'))send(c,'ai',loginStatus(u));
   if(c.projectId){try{if(full||['projects','revisions','chats','members','users','references_files','chat_sessions'].some(t=>tables.has(t)))send(c,'project',projectDetails(c.projectId,u));if(tables.has('jobs'))send(c,'jobs',{projectId:c.projectId,jobs:projectJobs(c.projectId,u)});}catch{send(c,'project.denied',{projectId:c.projectId});c.projectId=null;}}
   if(c.admin&&u.role==='admin'&&(full||['users','projects','jobs','voice_library'].some(t=>tables.has(t))))send(c,'admin',adminSnapshot(c.filter));
  }catch(error){log('error','websocket.snapshot.failed',{userId:u.id,error});send(c,'error',{code:'snapshotFailed'});}
 }
 server.on('upgrade',(req:IncomingMessage,socket,head)=>{
  const route=(req.url||'').split('?')[0];if(!['/api/live',(process.env.APP_BASE||'')+'/api/live'].includes(route)){socket.destroy();return;}
  if(req.headers.origin!==origin){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  let value='';try{value=decodeURIComponent((req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('session='))?.slice(8)||'');}catch{}
  const session=hash(value),u=one('SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',session,Date.now());
  if(!u){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;}
  if([...clients].filter(c=>c.session===session).length>=8){socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>{
   const c:Client={socket:ws,session,projectId:null,admin:false,filter:{},ready:false,alive:true,messages:0,windowStart:Date.now()};clients.add(c);log('info','websocket.connected',{userId:u.id});
   const authenticationTimeout=setTimeout(()=>{if(!c.ready)ws.close(4401,'Subscribe required');},10000);
   ws.on('pong',()=>{c.alive=true;});ws.on('error',error=>log('warn','websocket.error',{userId:u.id,error}));
   ws.on('message',raw=>{try{
    if(Date.now()-c.windowStart>60000){c.windowStart=Date.now();c.messages=0;}if(++c.messages>240){ws.close(1008,'Too many messages');return;}
    const message=JSON.parse(raw.toString()),fresh=user(c);if(!fresh){ws.close(4401,'Session expired');return;}
    if(message.csrf!==fresh.csrf){ws.close(4403,'Invalid session token');return;}
    if(message.type==='subscribe'){
     c.projectId=typeof message.projectId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(message.projectId)?message.projectId:null;c.admin=message.admin===true&&fresh.role==='admin';c.filter={level:['debug','info','warn','error'].includes(message.filter?.level)?message.filter.level:'',source:['client','server'].includes(message.filter?.source)?message.filter.source:'',query:String(message.filter?.query||'').slice(0,150),jobId:String(message.filter?.jobId||'').slice(0,100)};c.ready=true;clearTimeout(authenticationTimeout);refresh(c,new Set(),true);
    }else if(message.type==='client.logs'&&c.ready){const batch=telemetrySchema.parse(message.batch);send(c,'logs.ack',ingestClientLogs(fresh,batch));}
   }catch(error){log('warn','websocket.message.invalid',{userId:u.id,error});send(c,'error',{code:'invalidMessage'});}});
   ws.on('close',()=>{clearTimeout(authenticationTimeout);clients.delete(c);log('debug','websocket.closed',{userId:u.id});});
  });
 });
 const pending=new Set<string>();let flush:ReturnType<typeof setTimeout>|undefined;
 const onChange=(table:string)=>{pending.add(table);if(flush)return;flush=setTimeout(()=>{flush=undefined;const tables=new Set(pending);pending.clear();for(const c of clients)refresh(c,tables);},40);};
 const onLog=(entry:any)=>{for(const c of clients){if(!c.ready||!c.admin)continue;const fresh=user(c);if(fresh?.role==='admin'&&logMatches(entry,c.filter))send(c,'log',entry);else if(!fresh||fresh.role!=='admin')c.admin=false;}};
 events.on('change',onChange);events.on('log',onLog);
 // Protocol heartbeat only: business state is pushed by mutations, never polled.
 const heartbeat=setInterval(()=>{for(const c of clients){if(!c.alive||!user(c)){c.socket.terminate();continue;}c.alive=false;c.socket.ping();}},30000);heartbeat.unref();
 server.once('close',()=>{clearInterval(heartbeat);if(flush)clearTimeout(flush);events.off('change',onChange);events.off('log',onLog);for(const c of clients)c.socket.terminate();wss.close();});
 return wss;
}
