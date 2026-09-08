import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {request as httpRequest} from 'node:http';
process.env.NODE_ENV='test';process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),'choirloom-test-'));process.env.VOICE_IMPORT_TEMP=path.join(process.env.DATA_DIR,'imports');process.env.APP_ORIGIN='http://localhost:5173';process.env.VOICEBANK_MANIFEST=path.join(process.env.DATA_DIR,'voicebanks.json');
const {app}=await import('../server/index.ts');const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const root=`http://127.0.0.1:${(server.address() as any).port}/api`;
test.after(()=>server.close());
test('Azure named-pipe requests work with forwarded IPv4 ports and IPv6', {skip:process.platform!=='win32'},async()=>{
 const http=await import('node:http');const pipe=`\\\\.\\pipe\\choirloom-http-test-${process.pid}`;const named=app.listen(pipe);await new Promise<void>(r=>named.once('listening',r));
 try{for(const address of ['','203.0.113.4:54321','2001:db8::1']){const status=await new Promise<number>((resolve,reject)=>{http.get({socketPath:pipe,path:'/api/health',headers:address?{'x-forwarded-for':address}:{}},r=>{r.resume();r.on('end',()=>resolve(r.statusCode!));}).on('error',reject);});assert.equal(status,200);}}finally{await new Promise<void>(r=>named.close(()=>r()));}
});
test('voice downloads migrate to a shared cache and only admins can remove them',async()=>{
 const {writeFileSync,mkdirSync,existsSync}=await import('node:fs'),{run,one}=await import('../server/db.ts'),{voiceCache,migrateSharedVoices}=await import('../server/voicebanks.ts');
 const sha='a'.repeat(64);writeFileSync(path.join(process.env.DATA_DIR!,'voicebanks.json'),JSON.stringify([{id:'test-bank',name:'Test voice',bundle:{sha256:sha,bytes:100},supportedLanguages:['en']}]))
 const a=await request('/auth/signup','POST',{name:'Singer A',email:'singer-a@example.com',password:'long password 123'}),b=await request('/auth/signup','POST',{name:'Singer B',email:'singer-b@example.com',password:'long password 123'});
 const publicCatalog=await request('/voicebanks');assert.equal(publicCatalog.status,200);assert.equal(publicCatalog.data.canManage,false);run("UPDATE users SET role='admin' WHERE id=?",a.data.user.id);
 const old=path.join(process.env.DATA_DIR!,'voices',a.data.user.id);mkdirSync(old,{recursive:true});writeFileSync(path.join(old,sha),'model');run("INSERT INTO voice_installs(user_id,bank_id,status,progress,bytes) VALUES(?,?,'installed',100,100)",a.data.user.id,'test-bank');migrateSharedVoices();
 assert(existsSync(path.join(voiceCache(),sha)));assert(!existsSync(path.join(old,sha)));assert.equal(voiceCache(a.data.user.id),voiceCache(b.data.user.id));assert.equal((await request('/voicebanks','GET',undefined,b.cookie)).data.banks[0].status,'installed');
 assert.equal((await request('/voicebanks/test-bank','DELETE',{},b.cookie,b.data.csrf)).status,403);
 const project=await request('/projects','POST',{demo:true},b.cookie,b.data.csrf),before=one('SELECT score FROM projects WHERE id=?',project.data.id).score;run("INSERT INTO jobs(id,project_id,user_id,kind,status,payload) VALUES('render-lock',?,?,'render','running','{}')",project.data.id,b.data.user.id);
 assert.equal((await request('/voicebanks/test-bank','DELETE',{},a.cookie,a.data.csrf)).data.error,'voiceInUse');run("UPDATE jobs SET status='cancelled' WHERE id='render-lock'");
 assert.equal((await request('/voicebanks/test-bank','DELETE',{},a.cookie,'wrong')).status,403);assert.equal((await request('/voicebanks/test-bank','DELETE',{},a.cookie,a.data.csrf)).status,200);assert(!existsSync(path.join(voiceCache(),sha)));assert.equal(one('SELECT score FROM projects WHERE id=?',project.data.id).score,before);assert.equal((await request('/voicebanks','GET',undefined,b.cookie)).data.banks[0].status,'available');
});

// Windows may assign an ephemeral port that Fetch reserves for non-HTTP protocols.
// Use Node's HTTP test client for the OS-assigned loopback listener.
async function request(url:string,method='GET',body?:any,cookie='',csrf=''){return new Promise<{status:number,data:any,cookie:string}>((resolve,reject)=>{const req=httpRequest(root+url,{method,headers:{origin:process.env.APP_ORIGIN!,cookie,'x-csrf-token':csrf,'content-type':'application/json',...(body?{'content-length':Buffer.byteLength(JSON.stringify(body))}:{})}},res=>{let text='';res.on('data',chunk=>{text+=chunk;});res.on('end',()=>{try{resolve({status:res.statusCode!,data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]||cookie});}catch(error){reject(error);}});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
test('only admins can import voices and durable imported manifests join the shared catalog',async()=>{
 const user=await request('/auth/signup','POST',{name:'Import tester',email:'voice-import-test@example.com',password:'long password 123'});
 assert.equal((await request('/voicebanks/import','POST',{name:'Voice',url:'https://example.com/voice.zip',publisher:'Publisher',licenseUrl:'https://example.com/terms'},user.cookie,user.data.csrf)).status,403);
 const {run}=await import('../server/db.ts'),{catalog,catalogPath}=await import('../server/voicebanks.ts'),{readFileSync}=await import('node:fs');run('INSERT INTO voice_custom(bank_id,manifest) VALUES(?,?)','import-fixture',JSON.stringify({id:'import-fixture',name:'Imported fixture',installable:true,imported:true}));
 assert(catalog().some(b=>b.id==='import-fixture'));assert(JSON.parse(readFileSync(catalogPath,'utf8')).some((b:any)=>b.id==='import-fixture'));assert((await request('/voicebanks','GET',undefined,user.cookie)).data.banks.some((b:any)=>b.id==='import-fixture'));assert.deepEqual((await request('/voicebanks','GET',undefined,user.cookie)).data.imports,[]);
 run('DELETE FROM voice_custom WHERE bank_id=?','import-fixture');
});
test('interrupted import cleanup preserves committed shared voices',async()=>{
 const {randomUUID}=await import('node:crypto'),{mkdirSync,writeFileSync,existsSync,rmSync}=await import('node:fs'),{run,one}=await import('../server/db.ts'),{voiceCache}=await import('../server/voicebanks.ts'),{recoverVoiceImports}=await import('../server/voice-imports.ts');
 const id=randomUUID(),work=path.join(process.env.VOICE_IMPORT_TEMP!,id),asset=path.join(voiceCache(),'c'.repeat(64));mkdirSync(work,{recursive:true});mkdirSync(voiceCache(),{recursive:true});writeFileSync(asset,'retained voice');writeFileSync(path.join(work,'cleanup.json'),JSON.stringify([asset]));run("INSERT INTO voice_imports(id,request,status,stage,bank_id) VALUES(?,'{}','running','installing','committed-voice')",id);
 recoverVoiceImports();assert.equal(existsSync(work),false);assert.equal(existsSync(asset),true);assert.equal(one('SELECT status FROM voice_imports WHERE id=?',id).status,'failed');rmSync(asset);run('DELETE FROM voice_imports WHERE id=?',id);
});
test('email identity, private projects, optimistic revisions and revocable sharing',async()=>{const a=await request('/auth/signup','POST',{name:'Same name',email:' Alice@example.com '.trim(),password:'long password 123'});assert.equal(a.status,201);const b=await request('/auth/signup','POST',{name:'Same name',email:'bob@example.com',password:'long password 123'});assert.equal(b.status,201);const duplicate=await request('/auth/signup','POST',{name:'Other',email:'ALICE@example.com',password:'long password 123'});assert(!duplicate.data.user);
 const create=await request('/projects','POST',{demo:true},a.cookie,a.data.csrf);assert.equal(create.status,200);const id=create.data.id;assert.equal((await request(`/projects/${id}`,'GET',undefined,b.cookie)).status,403);const p=await request(`/projects/${id}`,'GET',undefined,a.cookie);assert.equal(p.data.version,1);
 const save=await request(`/projects/${id}`,'PUT',{version:1,score:p.data.score},a.cookie,a.data.csrf);assert.equal(save.status,200);assert.equal((await request(`/projects/${id}`,'PUT',{version:1,score:p.data.score},a.cookie,a.data.csrf)).status,409);
 assert.equal((await request(`/projects/${id}`,'PUT',{version:2,score:p.data.score},a.cookie,'wrong')).status,403);
 const link=await request(`/projects/${id}/shares`,'POST',{downloads:false,days:1},a.cookie,a.data.csrf);assert.equal(link.status,200);const value=new URL(link.data.url).searchParams.get('share');assert.equal((await request(`/shared/${value}`)).status,200);assert.equal((await request(`/projects/${id}/export/musicxml?share=${value}`)).status,403);await request(`/projects/${id}/shares/${link.data.id}`,'DELETE',{},a.cookie,a.data.csrf);assert.equal((await request(`/shared/${value}`)).status,404);
 const prefs=await request('/preferences','PATCH',{version:0,patch:{locale:'en'}},a.cookie,a.data.csrf);assert.equal(prefs.status,200);assert.equal((await request('/session','GET',undefined,b.cookie)).data.user.prefs.locale,'en');
});
test('only server-appointed admins manage a shared ChatGPT connection for all users',async()=>{
 const {run}=await import('../server/db.ts');const {homes,connected}=await import('../server/ai.ts');const {writeFileSync,existsSync}=await import('node:fs');
 const admin=await request('/auth/signup','POST',{name:'Admin',email:'admin-test@example.com',password:'long password 123',role:'admin'}),user=await request('/auth/signup','POST',{name:'User',email:'service-user@example.com',password:'long password 123'});
 assert.equal(admin.data.user.role,'user');
 await request('/preferences','PATCH',{version:0,patch:{role:'admin',isAdmin:true}},user.cookie,user.data.csrf);
 assert.equal((await request('/session','GET',undefined,user.cookie)).data.user.role,'user');
 for(const action of ['connect','disconnect'])assert.equal((await request('/ai/'+action,'POST',{},user.cookie,user.data.csrf)).data.error,'adminRequired');
 run("UPDATE users SET role='admin' WHERE id=?",admin.data.user.id);
 assert.equal((await request('/session','GET',undefined,admin.cookie)).data.user.role,'admin');
 writeFileSync(path.join(homes(),'auth.json'),JSON.stringify({tokens:{access_token:'TEST_ONLY_NOT_A_CREDENTIAL'}}));
 const status=await request('/ai/status','GET',undefined,user.cookie);assert.equal(status.data.connected,true);assert.equal(status.data.canManage,false);assert(!('url' in status.data));assert(!('code' in status.data));assert(!JSON.stringify(status.data).includes('TEST_ONLY'));
 assert.equal((await request('/ai/connect','POST',{},admin.cookie,'wrong')).status,403);
 assert.equal((await request('/ai/connect','POST',{},admin.cookie,admin.data.csrf)).data.connected,true);
 const project=await request('/projects','POST',{demo:true},user.cookie,user.data.csrf);
 const job=await request(`/projects/${project.data.id}/ai`,'POST',{prompt:'Arrange this melody',effort:'medium',locale:'en'},user.cookie,user.data.csrf);assert.equal(job.status,200);
 assert.equal((await request(`/projects/${project.data.id}`,'GET',undefined,admin.cookie)).data.role,'viewer');
 assert.equal((await request(`/projects/${project.data.id}`,'PUT',{version:1,score:{}},admin.cookie,admin.data.csrf)).status,403);
 assert.equal((await request('/ai/disconnect','POST',{},admin.cookie,admin.data.csrf)).data.connected,false);
 assert(!existsSync(path.join(homes(),'auth.json')));assert(!connected());
 assert.equal((await request(`/jobs/${job.data.id}`,'GET',undefined,user.cookie)).data.status,'cancelled');
 // A late token refresh from a cancelled process must not re-enable the service.
 writeFileSync(path.join(homes(),'auth.json'),'{}');assert(!connected());
});
test('selected score exports preserve parts, enforce access, and pin shared revisions',async()=>{
 const {unzipSync,strFromU8}=await import('fflate');const {fromMusicXML,readMXL,uid,createPart}=await import('../shared/music.ts');
 const a=await request('/auth/signup','POST',{name:'Exporter',email:'exporter@example.com',password:'long password 123'}),b=await request('/auth/signup','POST',{name:'Unrelated',email:'unrelated-export@example.com',password:'long password 123'});
 const created=await request('/projects','POST',{demo:true},a.cookie,a.data.csrf),p=await request(`/projects/${created.data.id}`,'GET',undefined,a.cookie);const score=p.data.score;
 score.parts.push(createPart('alto'),createPart('tenor'),createPart('bass'));
 for(let i=1;i<score.parts.length;i++)score.parts[i].notes=score.parts[0].notes.map((n:any)=>({...n,id:uid(),pitch:n.pitch-i*5}));
 await request(`/projects/${created.data.id}`,'PUT',{version:1,score},a.cookie,a.data.csrf);
 const chosen=[score.parts[1].id,score.parts[3].id],url=`/projects/${created.data.id}/export/`;
 const combined=await request(url+'json?parts='+chosen.join(','),'GET',undefined,a.cookie);assert.equal(combined.status,200);assert.deepEqual(combined.data.parts.map((v:any)=>v.id),chosen);assert.equal(combined.data.leadId,chosen[0]);assert.deepEqual(combined.data.parts[1].notes,score.parts[3].notes);
 for(const parts of ['',chosen[0]+','+chosen[0],'unknown','../../outside'])assert.equal((await request(url+'json?parts='+encodeURIComponent(parts),'GET',undefined,a.cookie)).status,400);
 assert.equal((await request(url+'json?parts='+chosen.join(','),'GET',undefined,b.cookie)).status,403);
 for(const format of ['musicxml','mxl','mid']){const r=await fetch(root+url+format+'?parts='+chosen.join(',')+'&separate=1',{headers:{cookie:a.cookie}});assert.equal(r.status,200);const files=Object.values(unzipSync(new Uint8Array(await r.arrayBuffer())));assert.equal(files.length,2);for(const bytes of files){if(format==='mid'){assert.equal(strFromU8(bytes.slice(0,4)),'MThd');}else assert.equal(fromMusicXML(format==='mxl'?readMXL(bytes):strFromU8(bytes)).parts.length,1);}}
 const link=await request(`/projects/${created.data.id}/shares`,'POST',{downloads:true,days:1},a.cookie,a.data.csrf);const share=new URL(link.data.url).searchParams.get('share');
 const changed=structuredClone(score);changed.parts[3].notes[0].lyric='changed';await request(`/projects/${created.data.id}`,'PUT',{version:2,score:changed},a.cookie,a.data.csrf);
 const pinned=await request(url+'json?share='+share+'&parts='+chosen.join(','));assert.equal(pinned.data.parts[1].notes[0].lyric,score.parts[3].notes[0].lyric);
 assert.equal((await request(url+'wav?parts='+chosen.join(','),'GET',undefined,a.cookie)).data.error,'renderRequired');
 await request(`/projects/${created.data.id}/shares/${link.data.id}`,'DELETE',{},a.cookie,a.data.csrf);assert.equal((await request(url+'json?share='+share)).status,404);
});

test('SVG upload queues Audiveris with a raster PNG instead of an SVG file',async()=>{const {readFileSync}=await import('node:fs'),{one}=await import('../server/db.ts');const previous=process.env.AUDIVERIS_BIN;process.env.AUDIVERIS_BIN=process.execPath;try{const a=await request('/auth/signup','POST',{name:'SVG test',email:'svg-import@example.com',password:'long password 123'}),p=await request('/projects','POST',{demo:true},a.cookie,a.data.csrf);const boundary='choirloom-svg-test',body=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="score.svg"\r\nContent-Type: image/svg+xml\r\n\r\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 25h100" stroke="black"/></svg>\r\n--${boundary}--\r\n`);const r:any=await new Promise((resolve,reject)=>{const req=httpRequest(root+`/projects/${p.data.id}/import`,{method:'POST',headers:{origin:process.env.APP_ORIGIN!,cookie:a.cookie!,'x-csrf-token':a.data.csrf,'content-type':`multipart/form-data; boundary=${boundary}`,'content-length':body.length}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});req.on('error',reject);req.end(body);});assert.equal(r.status,200);assert.equal(r.data.job.kind,'import');const payload=JSON.parse(one('SELECT payload FROM jobs WHERE id=?',r.data.job.id).payload);assert(payload.file.endsWith('.png'));assert.equal(readFileSync(payload.file).subarray(1,4).toString(),'PNG');}finally{if(previous===undefined)delete process.env.AUDIVERIS_BIN;else process.env.AUDIVERIS_BIN=previous;}});
