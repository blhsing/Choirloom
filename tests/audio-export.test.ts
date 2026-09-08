import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {unzipSync} from 'fflate';
const singer=path.resolve('.runtime/singer/Singer.exe');
test('native audio export mixes only selected stems, preserves separate files, and encodes MP3',{skip:!existsSync(singer)},()=>{
 const root=mkdtempSync(path.join(tmpdir(),'choirloom-audio-test-'));
 try{
  const wave=(sample:number)=>{const bytes=Buffer.alloc(44+44100*2);bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(44100,24);bytes.writeUInt32LE(88200,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);for(let i=44;i<bytes.length;i+=2)bytes.writeInt16LE(Math.round(sample*32767),i);return bytes;};
  for(const [name,value] of [['A',.1],['B',.2],['excluded',.7]] as const)writeFileSync(path.join(root,name+'.wav'),wave(value));
  const parts=[{id:'a',name:'Soprano',file:path.join(root,'A.wav'),gain:.5},{id:'b',name:'Bass',file:path.join(root,'B.wav'),gain:.25}];
  function render(name:string,selected:any[],format='wav',separate=false){const output=path.join(root,name);mkdirSync(output);const input=path.join(output,'input.json');writeFileSync(input,JSON.stringify({parts:selected,format,separate}));execFileSync(singer,['--mix',input,'--output',output],{windowsHide:true,timeout:30000});return readFileSync(path.join(output,'export.'+(separate&&selected.length>1?'zip':format)));}
  const mixed=render('combined',parts),at=mixed.indexOf(Buffer.from('data'));assert(at>0);assert(Math.abs(mixed.readInt16LE(at+8)/32767-.1)<.0002);
  const separate=unzipSync(render('separate',parts,'wav',true));assert.equal(Object.keys(separate).length,2);assert.deepEqual(Buffer.from(Object.values(separate)[0]),readFileSync(parts[0].file));assert.deepEqual(Buffer.from(Object.values(separate)[1]),readFileSync(parts[1].file));
  assert.deepEqual(render('single',[parts[1]],'wav',true),readFileSync(parts[1].file));
  const mp3=render('encoded',parts,'mp3');assert(mp3.length>1000);assert(mp3.subarray(0,100).some((value,i)=>value===255&&(mp3[i+1]&224)===224)||mp3.subarray(0,3).toString()==='ID3');
  const clipped=render('louder',Array.from({length:3},()=>({...parts[1],gain:2})));const start=clipped.indexOf(Buffer.from('data'))+8;assert(Math.abs(clipped.readInt16LE(start)/32767-.95)<.001);
 }finally{assert(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));rmSync(root,{recursive:true,force:true});}
});
