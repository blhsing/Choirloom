import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {rename,rm,statfs} from 'node:fs/promises';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {publicAddress,sourceUrl} from '../shared/voice-import.ts';

const LIMIT=2*1024**3,RESERVE=1024**3;
export async function downloadVoice(urlValue:string,file:string,progress:(bytes:number,total:number)=>void=()=>{},expected?:string,signal?:AbortSignal){
 let url=sourceUrl(urlValue);const timeout=AbortSignal.any([AbortSignal.timeout(20*60_000),...(signal?[signal]:[])]);
 for(let redirects=0;redirects<=8;redirects++){
  const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('privateDownloadAddress');const address=addresses[0];
  const response=await new Promise<import('node:http').IncomingMessage>((resolve,reject)=>{const req=request(url,{signal:timeout,headers:{'User-Agent':'Choirloom voicebank importer','Accept-Encoding':'identity'},lookup:((_host:any,options:any,cb:any)=>options.all?cb(null,addresses):cb(null,address.address,address.family)) as any},resolve);req.on('error',reject);req.end();});
  if([301,302,303,307,308].includes(response.statusCode||0)){response.resume();if(!response.headers.location)throw Error('invalidDownloadRedirect');url=sourceUrl(new URL(response.headers.location,url).href);continue;}
  if(response.statusCode!==200){response.resume();throw Error('downloadHttp:'+response.statusCode);}
  if((response.headers['content-type']||'').includes('text/html')){response.destroy();throw Error('downloadIsHtml: Use a public direct ZIP download URL, not a sign-in or release page');}
  const total=Number(response.headers['content-length'])||0;let free:number;try{const s=await statfs(path.dirname(file));free=Number(s.bavail)*Number(s.bsize);}catch{response.destroy();throw Error('storageCheckUnavailable');}
  if(total>LIMIT||free<Math.max(total,128*1024**2)+RESERVE){response.destroy();throw Error('insufficientVoiceStorage');}
  const hash=createHash('sha256');let bytes=0,last=0;const temporary=file+'.partial';
  try{await pipeline(response,new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>LIMIT||bytes>free-RESERVE)return callback(Error('voiceDownloadTooLarge'));hash.update(chunk);if(Date.now()-last>1500){last=Date.now();progress(bytes,total);}callback(null,chunk);}}),createWriteStream(temporary,{flags:'wx'}),{signal:timeout});if(total&&bytes!==total)throw Error('incompleteDownload');const sha256=hash.digest('hex');if(expected&&sha256!==expected)throw Error('assetChecksum');await rename(temporary,file);return {url:sourceUrl(urlValue).href,bytes,sha256,archive:true};}catch(error){await rm(temporary,{force:true});throw error;}
 }
 throw Error('tooManyDownloadRedirects');
}
