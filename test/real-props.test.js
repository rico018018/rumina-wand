import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {createTreasureChest,createSnake,chestHome,CHEST_LEVELS,CHEST_STEP} from '../src/real-props.js';
import {createInitialWorld,applySpell,CAPS} from '../src/world.js';
import {preparePlayTarget} from '../src/play-targets.js';
const context=new Proxy({}, {get:(o,k)=>o[k]??(()=>{})});
globalThis.document={createElement:()=>({width:256,height:256,getContext:()=>context})};
test('five chests form a stable tower without intersecting their lids',()=>{
 let last;
 for(let i=0;i<CHEST_LEVELS;i++){
  const chest=createTreasureChest({map:null,roughnessMap:null});chest.position.copy(chestHome(i));
  const box=new THREE.Box3().setFromObject(chest);
  assert.ok(box.max.y-box.min.y<=CHEST_STEP+.001);
  if(last){assert.ok(box.min.y>=last.max.y-.001);assert.ok(box.min.y-last.max.y<.02);}
  assert.ok(box.max.x-box.min.x>.9);last=box;
 }
 assert.equal(CHEST_LEVELS,CAPS.treasures);assert.ok(last.max.y<4.1);
});
test('sixth summon replaces the top chest and preserves the bottom four',()=>{
 const w=createInitialWorld();for(let i=0;i<5;i++)applySpell(w,'accio',{now:100+i});
 const bottom=w.treasures.slice(0,4);const oldTop=w.treasures[4];
 preparePlayTarget(w,'accio',200);applySpell(w,'accio',{now:200});
 assert.equal(w.treasures.length,5);assert.deepEqual(w.treasures.slice(0,4),bottom);assert.notEqual(w.treasures[4],oldTop);
});
test('large continuous snake moves without invalid vertices or detached body rings',()=>{
 const snake=createSnake(),body=snake.group.children[0],initial=body.geometry.attributes.position.array.slice();
 for(const t of [0,.5,2,100]){
  snake.update(t);const a=body.geometry.attributes.position.array;
  assert.ok(a.every(Number.isFinite));assert.ok(body.geometry.attributes.normal.array.every(Number.isFinite));
  body.geometry.computeBoundingBox();const box=body.geometry.boundingBox;assert.ok(box.max.z-box.min.z>=2.69);
  for(let i=1;i<65;i++){const k=i*13*3;assert.ok(Math.abs(a[k]-a[k-39])<.1);}
 }
 assert.notDeepEqual(body.geometry.attributes.position.array,initial);
});

test('five-level tower stays inside the landscape camera frame',()=>{
 const camera=new THREE.PerspectiveCamera(42,16/9,.1,80);camera.position.set(0,1.8,6.3);camera.lookAt(0,1.25,-.6);camera.updateMatrixWorld();
 const chest=createTreasureChest({map:null,roughnessMap:null});chest.position.copy(chestHome(4));const b=new THREE.Box3().setFromObject(chest);
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95);}
});
