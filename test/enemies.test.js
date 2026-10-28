import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {ENEMY_VARIANTS,enemyVariant} from '../src/enemy-variants.js';
import {createDarkWizard,disposeDarkWizard} from '../src/dark-wizard.js';
import {MagicScene} from '../src/scene.js';
// Canvas drawing is irrelevant to geometry/resource tests; keep CI dependency-free.
const context=new Proxy({getImageData:()=>({data:new Uint8ClampedArray(256*256*4)}),createImageData:()=>({data:new Uint8ClampedArray(256*256*4)}),createRadialGradient:()=>({addColorStop(){}})}, {get:(o,k)=>o[k]??(()=>{})});
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>context})};
test('all four costumes have distinct sculpted geometry and usable spell joints',()=>{
 const shapes=[];
 for(const v of ENEMY_VARIANTS){
  const w=createDarkWizard(v.id);let count=0;const signature=[];
  w.root.traverse(o=>{if(o.geometry){const a=o.geometry.attributes.position.array;assert.ok(a.every(Number.isFinite));count+=a.length;signature.push(...a.slice(0,12));}});
  assert.ok(count>10000);assert.ok(w.head&&w.arms.right&&w.wand&&w.legs.length===2);
  assert.equal(w.root.userData.variantId,v.id);shapes.push(JSON.stringify(signature));disposeDarkWizard(w.root);
 }
 assert.equal(new Set(shapes).size,4);assert.equal(enemyVariant('corrupt').id,'silver');
});
test('changing costume retains world and collapsed progress, releases old GPU resources',()=>{
 const s=Object.create(MagicScene.prototype);s.scene=new THREE.Scene();
 s.armor=createDarkWizard().root;s.scene.add(s.armor);s.world={armor:{collapsed:true,holdsSword:false}};s.collapse=.75;
 const world=s.world,old=s.armor,resources=new Set();let disposed=0;
 old.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material){resources.add(o.material);Object.values(o.material).filter(x=>x?.isTexture).forEach(x=>resources.add(x));}});
 resources.forEach(r=>r.addEventListener('dispose',()=>disposed++));
 s.setEnemyVariant('warden');assert.equal(old.parent,null);assert.equal(s.scene.children.length,1);assert.equal(disposed,resources.size);
 assert.equal(s.world,world);assert.equal(s.collapse,.75);assert.equal(s.armor.userData.variantId,'warden');disposeDarkWizard(s.armor);
});

test('all costumes retain adult head-to-body ratios and grounded feet',()=>{
 for(const v of ENEMY_VARIANTS){
  const w=createDarkWizard(v.id);w.root.updateMatrixWorld(true);
  const body=new THREE.Box3().setFromObject(w.root);
  const face=new THREE.Box3().setFromObject(w.root.getObjectByName('adult-faceplate'));
  const head=new THREE.Box3().setFromObject(w.head);
  const ratio=(body.max.y-body.min.y)/(face.max.y-face.min.y);
  assert.ok(ratio>7&&ratio<8.3,`${v.id}: ${ratio}`);
  assert.ok((head.max.y-head.min.y)/(body.max.y-body.min.y)<.20);
  assert.ok(Math.abs(body.min.y)<.015);
  for(const leg of w.legs){
   const foot=new THREE.Box3().setFromObject(leg.getObjectByName('adult-boot'));
   assert.ok(Math.abs(foot.min.y)<.015);assert.ok(leg.position.y>.9);
  }
  const shoulderSpan=w.arms.right.position.x-w.arms.left.position.x;
  assert.ok(shoulderSpan>.42&&shoulderSpan<.54);
  disposeDarkWizard(w.root);
 }
});
