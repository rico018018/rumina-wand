import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {CinemaPlate,coverUV} from '../src/cinema.js';
const setup=()=>{
 globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 const scene=new THREE.Scene(),staticRoom=new THREE.Group(),enemy=new THREE.Group();scene.add(staticRoom,enemy);
 let success,fail;
 const plate=new CinemaPlate(scene,[staticRoom],{loadTexture:(_,ok,no)=>{success=ok;fail=no;}});
 return {scene,staticRoom,enemy,plate,success:t=>success(t),fail:()=>fail()};
};
test('background crop preserves image proportions and centers different aspect ratios',()=>{
 assert.deepEqual(coverUV(16/9,16/9),{x:1,y:1,ox:0,oy:0});
 const portrait=coverUV(16/9,9/16);assert.equal(portrait.y,1);assert.ok(portrait.x<1);assert.equal(portrait.ox,(1-portrait.x)/2);
 const wide=coverUV(16/9,21/9);assert.equal(wide.x,1);assert.ok(wide.y<1);
});
test('photo success hides only architecture, keeping interactive objects',()=>{
 const a=setup();assert.equal(a.staticRoom.visible,true);assert.equal(a.plate.layer.visible,false);
 a.success(new THREE.Texture({width:1672,height:941}));
 assert.equal(a.staticRoom.visible,false);assert.equal(a.enemy.visible,true);assert.equal(a.plate.ready,true);assert.equal(a.plate.layer.visible,true);a.plate.dispose();
});
test('missing background leaves the fully playable 3D room visible',()=>{
 const a=setup();a.fail();assert.equal(a.staticRoom.visible,true);assert.equal(a.enemy.visible,true);assert.equal(a.plate.ready,false);assert.ok(a.plate.error);a.plate.dispose();
});
test('late image load after disposal cannot change the scene',()=>{
 const a=setup();a.plate.dispose();a.success(new THREE.Texture({width:1672,height:941}));assert.equal(a.scene.background,null);assert.equal(a.staticRoom.visible,true);
});
