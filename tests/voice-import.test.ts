import test from 'node:test';
import assert from 'node:assert/strict';
import {publicAddress,sourceUrl,chooseConfiguration,verifyWave} from '../shared/voice-import.ts';

test('voice downloads reject local destinations and normalize public Drive links',()=>{
 for(const ip of ['127.0.0.1','10.0.0.8','169.254.169.254','172.16.0.4','192.168.1.2','100.64.1.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const url of ['http://example.com/voice.zip','https://user:password@example.com/voice.zip','https://localhost/x','https://host.internal/x'])assert.throws(()=>sourceUrl(url));
 assert.equal(sourceUrl('https://drive.google.com/file/d/ABC_xyz/view').href,'https://drive.usercontent.google.com/download?id=ABC_xyz&export=download&confirm=t');
});
test('configuration selection excludes unsupported audio timing and supports explicit nested choices',()=>{
 const base={engine:"nnsvs",sampleRate:48000,wordless:true};const choices=[{...base,modelConfig:'voice/style/config.yaml'},{...base,modelConfig:'voice/config.yaml'},{...base,modelConfig:'unsupported.yaml',sampleRate:22050}];
 assert.equal(chooseConfiguration(choices).modelConfig,'voice/config.yaml');assert.equal(chooseConfiguration(choices,'voice/style/config.yaml').modelConfig,'voice/style/config.yaml');assert.throws(()=>chooseConfiguration(choices,'unsupported.yaml'));
});
test('render verification ignores headers and rejects silence, incomplete PCM, and missing MP3',()=>{
 const wave=Buffer.alloc(44+8820);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(44100,24);wave.writeUInt32LE(88200,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(8820,40);
 assert.throws(()=>verifyWave(wave,500),/silent/);for(let i=44;i<wave.length;i+=2)wave.writeInt16LE(i%4?1000:-1000,i);assert.equal(verifyWave(wave,500).peak,1000);assert.throws(()=>verifyWave(wave,0));assert.throws(()=>verifyWave(wave.subarray(0,100),500),/truncated/);
});
