import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {zipSync,strToU8} from 'fflate';
const python=process.env.NNSVS_PYTHON,worker=path.resolve('workers/Nnsvs/worker.py');
test('NNSVS package inspection rejects traversal, incomplete models and executable Hydra targets',{skip:!python||!existsSync(python)},()=>{
 const root=mkdtempSync(path.join(tmpdir(),'choirloom-nnsvs-'));try{
  const archive=path.join(root,'voice.zip');const inspect=()=>JSON.parse(execFileSync(python!,['-X','utf8',worker,'--inspect-bank',archive],{windowsHide:true,encoding:'utf8',stdio:'pipe',timeout:30000}));
  writeFileSync(archive,zipSync({'../escaped.txt':strToU8('bad')}));assert.throws(inspect);assert(!existsSync(path.join(root,'escaped.txt')));
  const files:Record<string,Uint8Array>={'Voice/config.yaml':strToU8('sample_rate: 48000'),'Voice/qst.hed':strToU8(''),'Voice/kana.table':strToU8('あ a')};
  writeFileSync(archive,zipSync(files));assert.deepEqual(inspect().choices,[]);
  for(const kind of ['timelag','duration','acoustic']){files[`Voice/${kind}_model.yaml`]=strToU8('netG:\n  _target_: nnsvs.model.FeedForwardNet');files[`Voice/${kind}_model.pth`]=new Uint8Array([1]);for(const [side,stats] of [['in',['min','scale']],['out',['mean','var','scale']]] as const)for(const stat of stats)files[`Voice/${side}_${kind}_scaler_${stat}.npy`]=new Uint8Array([1]);}
  writeFileSync(archive,zipSync(files));assert.equal(inspect().choices[0].modelConfig,'Voice/config.yaml');
  const launcher=path.resolve('.runtime/singer-nnsvs/Singer.exe');if(existsSync(launcher)){const result=JSON.parse(execFileSync(launcher,['--inspect-bank',archive],{env:{...process.env,NNSVS_WORKER:worker},windowsHide:true,encoding:'utf8',timeout:30000}));assert.equal(result.choices[0].engine,'nnsvs');}
  files['Voice/acoustic_model.yaml']=strToU8('netG:\n  _target_: nnsvs.model.os.system');writeFileSync(archive,zipSync(files));assert.throws(inspect);
 }finally{assert(path.resolve(root).startsWith(path.resolve(tmpdir())+path.sep));rmSync(root,{recursive:true,force:true});}
});
