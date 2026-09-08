import {isIP} from 'node:net';

export function publicAddress(ip:string):boolean {
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));}
 // Require globally routed IPv6; mapped IPv4 and local ranges are excluded.
 return isIP(ip)===6&&/^[23]/i.test(ip)&&!ip.toLowerCase().startsWith('2001:db8:');
}
export function sourceUrl(value:string):URL {
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hostname==='localhost'||url.hostname.endsWith('.local')||url.hostname.endsWith('.internal'))throw Error('publicHttpsUrlRequired');
 if(url.hostname==='drive.google.com'){const id=/\/file\/d\/([\w-]+)/.exec(url.pathname)?.[1]||url.searchParams.get('id');if(!id||!/^[\w-]+$/.test(id))throw Error('directDownloadUrlRequired');return new URL('https://drive.usercontent.google.com/download?id='+id+'&export=download&confirm=t');}
 url.hash='';return url;
}
export function chooseConfiguration(choices:any[],selected?:string){
 const eligible=choices.filter(c=>c.sampleRate===44100&&c.hopSize===512&&c.numMelBins===128&&c.wordless);
 const chosen=selected?eligible.find(c=>c.dsConfig===selected):eligible.sort((a,b)=>a.dsConfig.split('/').length-b.dsConfig.split('/').length||a.dsConfig.localeCompare(b.dsConfig))[0];
 if(!chosen)throw Error(selected?'selectedConfigurationUnsupported':'noSupportedConfiguration: Requires 44.1 kHz / hop 512 / 128 mel bins and supported wordless phonemes');return chosen;
}
export function verifyWave(wav:Buffer,mp3Bytes:number){
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('invalidRenderedWave');
 let start=0,length=0,format=false;for(let p=12;p+8<=wav.length;){const id=wav.toString('ascii',p,p+4),n=wav.readUInt32LE(p+4);if(p+8+n>wav.length)throw Error('truncatedRenderedWave');if(id==='fmt ')format=n>=16&&wav.readUInt16LE(p+8)===1&&wav.readUInt16LE(p+22)===16;if(id==='data'){start=p+8;length=n;}p+=8+n+(n%2);}
 if(!format||length<8820||length%2||mp3Bytes<128)throw Error('incompleteRenderedAudio');let peak=0,sum=0;for(let p=start;p<start+length;p+=2){const v=wav.readInt16LE(p);peak=Math.max(peak,Math.abs(v));sum+=v*v;}if(peak<32)throw Error('silentRenderedAudio');return {peak,rms:Math.sqrt(sum/(length/2))/32768,wavBytes:wav.length,mp3Bytes};
}
