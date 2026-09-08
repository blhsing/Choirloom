import {useEffect,useRef} from 'react';
import {record,setLogSender,acknowledgeLogs,configureDiagnostics} from './diagnostics';
type Listener=(data:any)=>void;const listeners=new Map<string,Set<Listener>>();
let socket:WebSocket|null=null,reconnect:ReturnType<typeof setTimeout>|undefined,attempt=0,authenticated=false;
let context={userId:'',csrf:'',base:'',projectId:null as string|null,admin:false,filter:{} as any};
let state='offline';
function emit(type:string,data:any){for(const fn of listeners.get(type)||[])try{fn(data);}catch(error){record('error','live.handler.failed',{type,error});}}
function status(value:string){state=value;emit('connection',value);}
function subscribe(){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'subscribe',csrf:context.csrf,projectId:context.projectId,admin:context.admin,filter:context.filter}));}
function open(){
 if(!context.userId||!navigator.onLine)return;if(reconnect)clearTimeout(reconnect);status(attempt?'reconnecting':'connecting');authenticated=false;
 const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}${context.base}/api/live`);socket=ws;
 ws.onopen=()=>{if(socket!==ws)return;record('info','websocket.open');subscribe();};
 ws.onmessage=event=>{if(socket!==ws)return;try{const message=JSON.parse(event.data);if(message.type==='session'){authenticated=true;attempt=0;status('live');setLogSender(batch=>{if(!authenticated||socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify({type:'client.logs',csrf:context.csrf,batch}));return true;});}if(message.type==='logs.ack')acknowledgeLogs(message.data.accepted);else emit(message.type,message.data);}catch(error){record('error','websocket.message.failed',{error});}};
 ws.onerror=()=>record('warn','websocket.transport.error');
 ws.onclose=event=>{if(socket!==ws)return;socket=null;authenticated=false;setLogSender(null);record('warn','websocket.closed',{code:event.code});if(!context.userId)return;if([4401,4403].includes(event.code)){status('signed-out');emit('session.expired',null);return;}status(navigator.onLine?'reconnecting':'offline');reconnect=setTimeout(open,Math.min(30000,1000*2**Math.min(attempt++,5))+Math.random()*300);};
}
export function configureLive(base:string,userId:string|null,csrf:string){const changed=context.userId!==(userId||'')||context.csrf!==csrf;context={...context,base,userId:userId||'',csrf};configureDiagnostics(base,csrf,userId);if(changed){if(reconnect)clearTimeout(reconnect);const old=socket;socket=null;old?.close();setLogSender(null);authenticated=false;}if(!userId){status('offline');return;}if(!socket)open();}
export function subscribeLive(projectId:string|null,admin=false,filter:any={}){context={...context,projectId,admin,filter};subscribe();}
export function reconnectLive(){if(reconnect)clearTimeout(reconnect);const old=socket;socket=null;old?.close();attempt=0;open();}
export function useLiveEvent(type:string,callback:Listener){const current=useRef(callback);current.current=callback;useEffect(()=>{const listener:Listener=data=>current.current(data);let group=listeners.get(type);if(!group)listeners.set(type,group=new Set());group.add(listener);if(type==='connection')listener(state);return()=>{group!.delete(listener);};},[type]);}
addEventListener('online',()=>{if(!socket)open();});
