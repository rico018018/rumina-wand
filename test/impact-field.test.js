import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {ImpactField,IMPACT_SHAPES} from '../src/impact-field.js';
import {SpellEffects} from '../src/effects.js';
import {SPELLS} from '../src/spells.js';
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
test('all spells have finite spatial impact geometry and bounded screen wash',()=>{
 const scene=new THREE.Scene(),field=new ImpactField(scene);
 for(const spell of SPELLS){assert.ok(IMPACT_SHAPES[spell.id]);for(const p of [0,.1,.4,.8,1]){
  field.show({spellId:spell.id,color:new THREE.Color(spell.defaultColor),color2:new THREE.Color('white'),target:new THREE.Vector3(0,1,-1),strength:1},p);
  assert.ok(field.rayPositions.every(Number.isFinite));assert.ok(field.wash.material.uniforms.uOpacity.value<=.26);
 }}
 field.clear();assert.equal(field.group.visible,false);assert.equal(field.wash.material.uniforms.uOpacity.value,0);field.dispose();assert.equal(scene.children.length,0);
});
test('all 14 full effects run through impact and cancellation at both quality levels',()=>{
 for(const lowPower of [false,true]){
  const scene=new THREE.Scene(),fx=new SpellEffects(scene,new THREE.PerspectiveCamera(),{lowPower});
  for(const spell of SPELLS){
   const timing=fx.cast(spell.id,spell.defaultColor,new THREE.Vector3(0,1,-1),{immediate:true});const start=fx.active[0].start;
   assert.equal(timing.impactMs,300);assert.equal(timing.totalMs,2100);
   for(let elapsed=0;elapsed<=2300;elapsed+=50)fx.update(start+elapsed,.05);
   assert.ok(fx.p.pos.every(Number.isFinite));assert.equal(fx.active.length,0);
   fx.cancel();assert.equal(fx.impactField.group.visible,false);assert.equal(fx.p.life.some(v=>v>0),false);
  }fx.dispose();
 }
});
