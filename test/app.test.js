import test from 'node:test';
import assert from 'node:assert/strict';
import { WandApp, SETTINGS_KEY, WORLD_KEY } from '../src/app.js';
const make = t => {
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1800000000000});
 const storage=new Map([[SETTINGS_KEY,JSON.stringify({enableAllSpells:false})]]);
 t.mock.method(globalThis,'setTimeout',globalThis.setTimeout); // timers remain under node:test control
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const scene={setWorld(){},render(){},dispose(){},cancelEffects(){},charge(){},fizzle(){},gentle(){},preview(){},castSpellEffect(){return {swingMs:0,impactMs:300,totalMs:1400};}};
 const app=new WandApp({canvas:null,sceneFactory:()=>scene,gestureFactory:()=>({active:true,stop(){this.active=false;},dispose(){}})});
 t.after(()=>app.dispose());return {app,storage};
};
test('saved three-spell restriction is migrated and cannot be reenabled',t=>{const {app}=make(t);assert.equal(app.enabledSpellIds.length,14);app.updateSettings({enableAllSpells:false});assert.equal(app.settings.enableAllSpells,true);});
test('reset during cast delay cancels pending mutation',t=>{const {app}=make(t);app.castSpell('accio');app.resetWorld();t.mock.timers.tick(9000);assert.equal(app.world.treasures.length,0);assert.equal(app.inFlight,null);});
test('reset after launch but before impact cancels mutation',t=>{const {app}=make(t);app.castSpell('accio','gesture');app.resetWorld();t.mock.timers.tick(9000);assert.equal(app.world.treasures.length,0);});
test('voice arms spell; downstroke launches once without configured delay',t=>{
 const {app}=make(t);app.speech.onFinalResult({transcript:'Accio'});assert.equal(app.inFlight,null);assert.equal(app.castGate.pending.spellId,'accio');
 app.onStroke(performance.now());app.onStroke(performance.now()+10);t.mock.timers.tick(301);assert.equal(app.world.treasures.length,1);
});
test('preview does not persist or replace the ordinary world',t=>{
 const {app,storage}=make(t);const before=structuredClone(app.world);const saved=storage.get(WORLD_KEY);
 app.previewSpell('accio');t.mock.timers.tick(1200);t.mock.timers.tick(301);assert.equal(app.world.treasures.length,1);assert.equal(storage.get(WORLD_KEY),saved);
 app.endPreview();assert.deepEqual(app.world,before);
});
test('input mode changes cancel an armed spell',t=>{const {app}=make(t);app.speech.onFinalResult({transcript:'Accio'});app.updateSettings({triggerMode:'voice'});assert.equal(app.castGate.pending,null);app.onStroke(performance.now());assert.equal(app.inFlight,null);});
test('old installs migrate once to Japanese child recognition and keep later preferences',t=>{
 const {app,storage}=make(t);assert.equal(app.settings.lang,'ja-JP');assert.equal(app.settings.strictness,'easy');assert.equal(JSON.parse(storage.get(SETTINGS_KEY)).recognitionVersion,3);
 app.updateSettings({lang:'en-US',strictness:'strict'});assert.equal(JSON.parse(storage.get(SETTINGS_KEY)).strictness,'strict');
});
test('child pronunciation arms the intended spell before a downstroke',t=>{
 const {app}=make(t);app.speech.onFinalResult({transcript:'ぷよてご'});assert.equal(app.castGate.pending.spellId,'protego');
});
test('each spell has its own impact audio and remains busy while the visual finishes',t=>{
 const {app}=make(t);const calls=[];app.audio.playImpact=id=>{calls.push(id);return 100;};
 app.scene.castSpellEffect=()=>({swingMs:0,impactMs:900,totalMs:4600});
 app.castSpell('episkey','gesture');t.mock.timers.tick(899);assert.equal(calls.length,0);
 t.mock.timers.tick(1);assert.deepEqual(calls,['episkey']);assert.equal(app.world.armor.dented,false);
 t.mock.timers.tick(1000);assert.ok(app.inFlight);t.mock.timers.tick(2700);assert.equal(app.inFlight,null);
});
