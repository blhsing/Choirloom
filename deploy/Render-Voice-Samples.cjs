// Run from the deployed app directory after installing the catalog voices.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const data=process.env.DATA_DIR||'C:/home/data/choirloom';
const work=path.join(data,'voice-samples'),output=path.resolve('dist/voice-samples');
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(output,{recursive:true});
const banks=JSON.parse(fs.readFileSync('config/voicebanks.json','utf8'));
const results=[];
(async()=>{const {demoScore}=await import(path.resolve('app/shared/music.js').replaceAll('\\','/').replace(/^/,'file:///'));
for(const bank of banks.filter(b=>b.installable!==false)){
 const dir=path.join(work,bank.id);fs.mkdirSync(dir,{recursive:true});
 const score=demoScore();score.title='Voice sample';score.parts[0].voicebank=bank.id;
 score.parts[0].notes=score.parts[0].notes.slice(0,3).map((n,i)=>({...n,lyric:(bank.testLyrics||['ah','hello','woo'])[i],duration:480,syllabic:'single'}));
 const file=path.join(dir,'score.json');fs.writeFileSync(file,JSON.stringify(score));
 const result=cp.spawnSync('singer/Singer.exe',['--voicebanks','config/voicebanks.json','--cache',path.join(data,'voices/shared'),'--score',file,'--output',dir],{windowsHide:true,encoding:'utf8',timeout:240000});
 fs.writeFileSync(path.join(dir,'render.log'),result.stdout+'\n'+result.stderr);
 try{if(result.status!==0)throw Error('renderFailed');const wav=fs.readFileSync(path.join(dir,'mix.wav'));let peak=0;for(let i=44;i+1<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));if(peak<32)throw Error('silent');const mp3=path.join(dir,'mix.mp3');if(fs.statSync(mp3).size<100)throw Error('empty');fs.copyFileSync(mp3,path.join(output,bank.id+'.mp3'));results.push({id:bank.id,status:'complete',peak});}catch(e){results.push({id:bank.id,status:'failed',error:e.message});}
 fs.writeFileSync(path.join(work,'status.json'),JSON.stringify(results));
 fs.writeFileSync(path.join(output,'index.json'),JSON.stringify(results.filter(r=>r.status==='complete').map(r=>r.id)));
}
})();
