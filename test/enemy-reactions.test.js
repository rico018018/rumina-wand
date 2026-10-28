import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import {PROP_REACTIONS,reactionPose,applyReaction} from '../src/enemy-reactions.js';
import {SPELL_STORIES} from '../src/spell-focus.js';
test('every non-person spell has a distinct bounded reaction',()=>{
 const ids=Object.keys(SPELL_STORIES).filter(id=>SPELL_STORIES[id].subject!=='person');
 assert.deepEqual(Object.keys(PROP_REACTIONS).sort(),ids.sort());
 const poses=[];
 for(const id of ids){
  assert.equal(reactionPose(id,-1),null);assert.equal(reactionPose(id,2800),null);
  const p=reactionPose(id,500);assert.equal(p.weight,1);poses.push(JSON.stringify(p));
  for(let t=0;t<2800;t+=50)for(const x of Object.values(reactionPose(id,t)))assert.ok(Number.isFinite(x));
  assert.ok(reactionPose(id,2750).weight<.01);
 }assert.equal(new Set(poses).size,6);
});
test('rock dodge bends forward and guards head; snake reaction recoils',()=>{
 const dodge=reactionPose('reducto',500),snake=reactionPose('serpensortia',500);
 assert.ok(dodge.lean>.4&&dodge.duck>0&&dodge.arm<-1);
 assert.ok(snake.lean<0&&snake.arm<-.7&&snake.step<0);
});
test('a fallen enemy reacts with head and arms without changing its fallen body position',()=>{
 const actor={root:new THREE.Group(),head:new THREE.Group(),arms:{left:new THREE.Group(),right:new THREE.Group()}};
 actor.root.rotation.x=-1.4;actor.root.position.set(0,-.16,-.9);
 for(const id of Object.keys(PROP_REACTIONS)){
  const position=actor.root.position.clone(),rotation=actor.root.rotation.x;
  applyReaction(actor,reactionPose(id,500,false));
  assert.deepEqual(actor.root.position,position);assert.equal(actor.root.rotation.x,rotation);
 }assert.notEqual(actor.arms.left.rotation.x,0);
});
