import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceState } from '../src/device-state.js';
class Recognition {
 static instances=[];
 constructor(){Recognition.instances.push(this);}
 start(){} stop(){this.stopped=true;} abort(){this.aborted=true;}
}
globalThis.SpeechRecognition=Recognition;
const {SpeechEngine}=await import('../src/speech.js');
const make=t=>{const e=new SpeechEngine();t.after(()=>e.dispose());return e;};
test('mic OFF on load, pending before capture, ON only after audio callback',t=>{
 const e=make(t);assert.equal(deviceState('mic',e).label,'OFF');
 e.start();const r=e.recognition;assert.equal(deviceState('mic',e).tone,'pending');
 r.onstart();assert.notEqual(deviceState('mic',e).tone,'on');
 r.onaudiostart();assert.equal(deviceState('mic',e).label,'ON・集音中');
 r.onaudioend();assert.notEqual(deviceState('mic',e).tone,'on');
});
test('OFF during permission wait aborts pending recognizer and ignores late result',t=>{
 const e=make(t);let results=0;e.onFinalResult=()=>results++;
 e.start();const r=e.recognition;e.stop();assert.equal(r.aborted,true);
 r.onstart();r.onresult({});assert.equal(results,0);r.onend();assert.equal(deviceState('mic',e).label,'OFF');assert.equal(e.wantListening,false);
});
test('suppress distinguishes active capture from paused auto resume',t=>{
 const e=make(t);e.start();const r=e.recognition;r.onstart();r.onaudiostart();e.suppress(3000);
 assert.equal(deviceState('mic',e).label,'ON・入力無視');r.onaudioend();assert.equal(deviceState('mic',e).label,'一時停止');
 e.stop();r.onend();assert.equal(deviceState('mic',e).label,'OFF');
});
test('permission failure produces visible error and no automatic restart',t=>{
 const e=make(t);e.start();const r=e.recognition;r.onerror({error:'not-allowed'});r.onend();
 assert.equal(e.wantListening,false);assert.equal(deviceState('mic',e).label,'OFF・エラー');
});
test('previous recognizer cannot reactivate a new session',t=>{
 const e=make(t);e.start();const old=e.recognition;e.stop();old.onend();e.start();
 old.onaudiostart();old.onstart();assert.equal(e.audioActive,false);assert.equal(e.startPending,true);
});
test('camera display covers OFF, pending cancellation, ON and error',()=>{
 assert.equal(deviceState('camera',{}).label,'OFF');
 assert.equal(deviceState('camera',{starting:true}).action,'キャンセル');
 assert.equal(deviceState('camera',{active:true}).label,'ON・検知中');
 assert.equal(deviceState('camera',{error:'denied'}).tone,'error');
});

test('cancelled camera permission request stops any stream arriving later',async t=>{
 const {CameraGesture}=await import('../src/gesture.js');
 let resolve,stops=0;
 const video={setAttribute(){},pause(){},remove(){},play:async()=>{}};
 const oldCancel=globalThis.cancelAnimationFrame; globalThis.cancelAnimationFrame=()=>{};
 t.after(()=>{globalThis.cancelAnimationFrame=oldCancel;});
 const oldDoc=globalThis.document;
 globalThis.document={createElement:tag=>tag==='video'?video:{getContext:()=>({})},body:{append(){}}};
 t.after(()=>{globalThis.document=oldDoc;});
 const oldMedia=Object.getOwnPropertyDescriptor(navigator,'mediaDevices');
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(r=>resolve=r)}});
 t.after(()=>{if(oldMedia)Object.defineProperty(navigator,'mediaDevices',oldMedia);else delete navigator.mediaDevices;});
 const camera=new CameraGesture({onStroke(){},onState(){}});
 const pending=camera.start();assert.equal(camera.starting,true);camera.stop();
 resolve({getTracks:()=>[{stop(){stops++;}}]});await pending;
 assert.equal(stops,1);assert.equal(camera.active,false);assert.equal(camera.starting,false);
});
