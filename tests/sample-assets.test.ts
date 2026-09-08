import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {previewInstruments} from '../src/preview-instruments.ts';
test('every recorded instrument has intact, licensed samples and valid sustain loops',()=>{
 const banks=JSON.parse(readFileSync('public/instrument-samples/index.json','utf8'));
 for(const instrument of previewInstruments.filter(i=>i.id!=='voice')){
  const bank=banks[instrument.id];assert.equal(bank.license,'CC0-1.0');assert.ok(bank.samples.length>=3,instrument.id);
  for(const s of bank.samples){const bytes=readFileSync('public/instrument-samples/'+s.file);assert.equal(bytes.subarray(0,4).toString(),'fLaC');assert.equal(createHash('sha256').update(bytes).digest('hex'),s.sha256);assert.ok(Number.isInteger(s.pitch)&&s.pitch>=0&&s.pitch<=127);if(s.loopStart!==undefined)assert.ok(s.loopStart>0&&s.loopEnd>s.loopStart);}
 }
 assert.notEqual(banks['classical-guitar'].source,banks.guitar.source);
});
