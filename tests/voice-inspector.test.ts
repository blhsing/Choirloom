import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,readdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {zipSync,strToU8} from 'fflate';
const singer=path.resolve('.runtime/singer/Singer.exe');
test('native package inspector discovers nested configurations and rejects archive traversal',{skip:!existsSync(singer)},()=>{
 const root=mkdtempSync(path.join(tmpdir(),'choirloom-inspector-'));try{
  const inner=zipSync({'Voice/dsconfig.yaml':strToU8('acoustic: acoustic.onnx\nphonemes: phonemes.txt\nmel_base: e\nvocoder: nsf_hifigan\n'),'Voice/acoustic.onnx':new Uint8Array([1]),'Voice/phonemes.txt':strToU8('SP\naa\nb\nd\nm\nw\nuw\nah\nae\np\niy')});
  const archive=path.join(root,'bank.zip');writeFileSync(archive,zipSync({'Package/voice.zip':inner}));const result=JSON.parse(execFileSync(singer,['--inspect-bank',archive],{windowsHide:true,encoding:'utf8',timeout:30000}));assert.equal(result.choices.length,1);assert.equal(result.choices[0].innerArchive,'Package/voice.zip');assert.equal(result.choices[0].wordless,true);assert.deepEqual(result.choices[0].languageCodes,[]);
  const unsafe=path.join(root,'unsafe.zip');writeFileSync(unsafe,zipSync({'../escaped.txt':strToU8('bad')}));assert.throws(()=>execFileSync(singer,['--inspect-bank',unsafe],{windowsHide:true,stdio:'pipe',timeout:30000}));assert.equal(existsSync(path.join(root,'escaped.txt')),false);
  const long=path.join(root,'long.zip'),nested='Publisher'.repeat(12)+'/'+'Voice'.repeat(25)+'.zip';writeFileSync(long,zipSync({[nested]:inner}));const inspected=JSON.parse(execFileSync(singer,['--inspect-bank',long],{windowsHide:true,encoding:'utf8',timeout:30000}));assert.equal(inspected.choices[0].innerArchive,nested);const short=readdirSync(long+'.files').find(n=>n.startsWith('.voice-'))!;assert(short);assert(path.join(long+'.files',short,'Voice','acoustic.onnx').length<260);
 }finally{assert(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));rmSync(root,{recursive:true,force:true});}
});
