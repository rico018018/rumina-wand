import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {SpellFocus,SPELL_STORIES} from '../src/spell-focus.js';
import {preparePlayTarget} from '../src/play-targets.js';
import {createInitialWorld,applySpell} from '../src/world.js';
import {SPELLS} from '../src/spells.js';
import {matchSpell,EASY_ALIASES} from '../src/matcher.js';
import {AudioKit,SPELL_SOUNDS} from '../src/audio.js';
test('every spell has a visual sentence and works repeatedly with automatically prepared prerequisites',()=>{
 for(const spell of SPELLS){assert.ok(SPELL_STORIES[spell.id]);const w=createInitialWorld();for(let i=0;i<13;i++){
  preparePlayTarget(w,spell.id,1000);assert.equal(applySpell(w,spell.id,{now:1100}).status,'applied',spell.id);
 }}
});
test('foreground transforms restore exactly without modifying visibility or accumulating scale',()=>{
 for(const id of Object.keys(SPELL_STORIES)){
  const f=new SpellFocus(),node=new THREE.Group();node.position.set(2,1,-3);node.scale.set(1,2,3);const pos=node.position.clone(),scale=node.scale.clone();
  f.start(id,pos,0);for(const t of [0,650,900,2000,3700,4500]){f.update(t,[node]);assert.ok(node.position.toArray().every(Number.isFinite));f.restore();assert.deepEqual(node.position,pos);assert.deepEqual(node.scale,scale);}
  f.update(2000,[node]);f.cancel();assert.deepEqual(node.position,pos);assert.deepEqual(node.scale,scale);assert.equal(f.active,null);
 }
});
test('all short easy aliases uniquely activate and stricter mode remains available',()=>{
 for(const [id,text] of Object.entries(EASY_ALIASES))assert.equal(matchSpell(text).spellId,id,text);
 assert.equal(matchSpell('エピ',{strictness:'child'}).matched,false);
 for(const text of ['','あ','ママ','パパ'])assert.equal(matchSpell(text).matched,false,text);
});
// Test the actual synth graph schedule without speakers or microphone access.
const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
class FakeAudio {
 constructor(){this.currentTime=10;this.sampleRate=8000;this.state='running';this.destination={};this.events=[];}
 node(){return {connect(x){return x;},frequency:param(),detune:param(),gain:param(),Q:param()};}
 createGain(){return this.node();}createBiquadFilter(){return this.node();}
 createStereoPanner(){return {...this.node(),pan:param()};}
 createDynamicsCompressor(){return {...this.node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
 createOscillator(){return this.source('tone');}createBufferSource(){return this.source('noise');}
 source(type){const o=this.node();o.start=t=>this.events.push({type,start:t});o.stop=t=>this.events.push({type,stop:t});return o;}
 createBuffer(ch,n){return {getChannelData:()=>new Float32Array(n)};}
}
test('14 distinct sound profiles generate launch and impact layers with cancellable sources',()=>{
 globalThis.AudioContext=FakeAudio;
 const kit=new AudioKit();kit.unlock();assert.equal(Object.keys(SPELL_SOUNDS).length,14);assert.equal(new Set(Object.values(SPELL_SOUNDS).map(JSON.stringify)).size,14);
 for(const s of SPELLS){kit.ctx.events=[];assert.equal(kit.playLaunch(s.id,{swingMs:0,impactMs:900}),900);assert.ok(kit.ctx.events.some(e=>e.stop>=10.9));const end=kit.playImpact(s.id);assert.ok(end>=1400);assert.ok(kit.sources.size>0);kit.stopAll();assert.equal(kit.sources.size,0);}
 delete globalThis.AudioContext;
});
