import test from 'node:test';
import assert from 'node:assert/strict';
import {impactScore,scoreDuration} from '../src/sound-score.js';
import {SPELLS} from '../src/spells.js';
test('all 14 scores are distinct, finite, bounded and end inside the visual hold',()=>{
 const signatures=[];
 for(const s of SPELLS){const events=impactScore(s.id);signatures.push(JSON.stringify(events));assert.ok(events.length>=8&&events.length<90,s.id);
  assert.ok(events.some(e=>e.at===0));assert.ok(events.some(e=>e.kind==='noise'));
  assert.ok(scoreDuration(events)<=3.7);
  for(const e of events){assert.ok(e.at>=0&&e.dur>0&&e.gain>0&&e.gain<=.65);for(const val of Object.values(e))if(typeof val==='number')assert.ok(Number.isFinite(val));assert.ok(Math.abs(e.pan||0)<=1);}
 }assert.equal(new Set(signatures).size,14);
});
test('arrival Foley follows each object animation rather than playing at launch',()=>{
 for(const [id,time] of [['accio',1.5],['expelliarmus',1.1],['slugulas_eructo',.95]])assert.ok(impactScore(id).some(e=>Math.abs(e.at-time)<.001&&e.kind==='noise'),id);
 const impacts=impactScore('reducto').filter(e=>e.kind==='noise');assert.ok(impacts.length>=15);
});
