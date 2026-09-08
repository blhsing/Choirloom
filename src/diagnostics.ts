import {redact} from '../shared/redact';
type Entry={id:string,time:string,level:'debug'|'info'|'warn'|'error',event:string,message:string,context:any};
const key='choirloom-debug-buffer-v1';let base=import.meta.env.BASE_URL.replace(/\/$/,''),csrf='',userId:string|null=null,sessionReady=false;
let queue:Entry[]=[];try{queue=JSON.parse(localStorage.getItem(key)||'[]').slice(-200);}catch{}
let clientId:string=crypto.randomUUID();try{clientId=localStorage.getItem('choirloom-debug-client')||clientId;localStorage.setItem('choirloom-debug-client',clientId);}catch{}
let sender:((batch:any)=>boolean)|null=null,inflight:string[]=[],timer:ReturnType<typeof setTimeout>|undefined,ackTimer:ReturnType<typeof setTimeout>|undefined,retry=1000,installed=false;
const originalFetch=window.fetch.bind(window);
function persist(){try{localStorage.setItem(key,JSON.stringify(queue.slice(-200)));}catch{}}
export function record(level:Entry['level'],event:string,context:any={},message=''){
 let safe=redact(context);if(JSON.stringify(safe).length>4000)safe={summary:JSON.stringify(safe).slice(0,4000)};queue.push({id:crypto.randomUUID(),time:new Date().toISOString(),level,event:event.slice(0,80),message:redact(message),context:{...safe,capturedUserId:userId}});queue=queue.slice(-200);persist();schedule(100);
}
function schedule(delay:number){if(!timer)timer=setTimeout(()=>{timer=undefined;void flushLogs();},delay);}
export function configureDiagnostics(nextBase:string,nextCsrf:string,nextUserId:string|null){base=nextBase;csrf=nextCsrf;userId=nextUserId;sessionReady=true;schedule(0);}
export function setLogSender(next:typeof sender){sender=next;schedule(0);}
export function acknowledgeLogs(ids:string[]){queue=queue.filter(e=>!ids.includes(e.id));inflight=[];retry=1000;if(ackTimer)clearTimeout(ackTimer);persist();if(queue.length)schedule(0);}
export async function flushLogs(){
 if(!sessionReady||!queue.length||inflight.length||!navigator.onLine)return;const batch={clientId,csrf,events:queue.slice(0,6)};inflight=batch.events.map(e=>e.id);
 if(sender?.(batch)){ackTimer=setTimeout(()=>{inflight=[];schedule(retry);retry=Math.min(30000,retry*2);},5000);return;}
 try{const r=await originalFetch(base+'/api/client-logs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(batch),keepalive:true});if(r.status===403){const session=await originalFetch(base+'/api/session');if(session.ok){const state=await session.json();csrf=state.csrf||'';userId=state.user?.id||null;}}if(!r.ok)throw Error('Upload unavailable');const result=await r.json();acknowledgeLogs(result.accepted);}
 catch{inflight=[];schedule(retry);retry=Math.min(30000,retry*2);}
}
export function installDiagnostics(){if(installed)return;installed=true;
 window.fetch=async(input,init)=>{const start=performance.now(),url=new URL(input instanceof Request?input.url:String(input),location.href),tracked=url.origin===location.origin&&url.pathname.includes('/api/')&&!url.pathname.endsWith('/client-logs');try{const response=await originalFetch(input,init);if(tracked)record(response.ok?'debug':'warn','http.response',{path:url.pathname,method:init?.method||(input instanceof Request?input.method:'GET'),status:response.status,durationMs:Math.round(performance.now()-start),requestId:response.headers.get('x-request-id')});return response;}catch(error){if(tracked)record('error','http.network',{path:url.pathname,durationMs:Math.round(performance.now()-start),error});throw error;}};
 addEventListener('error',event=>record('error','window.error',{error:event.error||event.message,file:event.filename?.split('?')[0],line:event.lineno}));
 addEventListener('unhandledrejection',event=>record('error','promise.unhandled',{error:event.reason}));
 for(const level of ['warn','error'] as const){const original=console[level].bind(console);console[level]=(...args:any[])=>{original(...args);record(level,'console.'+level,{arguments:args});};}
 addEventListener('online',()=>{record('info','network.online');void flushLogs();});addEventListener('offline',()=>record('warn','network.offline'));
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void flushLogs();});
 addEventListener('pagehide',()=>{if(sessionReady&&queue.length)navigator.sendBeacon(base+'/api/client-logs',new Blob([JSON.stringify({clientId,csrf,events:queue.slice(0,6)})],{type:'application/json'}));});
 record('info','client.started',{path:location.pathname,viewport:{width:innerWidth,height:innerHeight}});
}
