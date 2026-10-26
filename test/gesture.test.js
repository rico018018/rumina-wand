import test from 'node:test';
import assert from 'node:assert/strict';
import { DownstrokeGate, CastGate, estimateFlow } from '../src/gesture.js';
import { createPreviewWorld } from '../src/preview-world.js';
import { SPELLS } from '../src/spells.js';
import { applySpell } from '../src/world.js';

test('downstroke requires sustained downward travel and cannot fire twice on follow-through',()=>{
 const g=new DownstrokeGate();assert.equal(g.feed({time:100,dy:.04,confidence:.9}),false);
 assert.equal(g.feed({time:160,dy:.04,confidence:.9}),true);
 assert.equal(g.feed({time:200,dy:.06,confidence:.9}),false);
 assert.equal(g.feed({time:260,dy:.06,confidence:.9}),false);
});
test('upward, sideways, weak and camera-wide motion do not fire',()=>{
 for(const f of [{dy:-.1},{dx:.2,dy:.05},{dy:.1,confidence:.1},{dy:.1,globalMotion:true}]){
 const g=new DownstrokeGate();for(let i=0;i<10;i++)assert.equal(g.feed({time:i*50,confidence:.9,...f}),false);
 }
});
test('stationary frames have no downward flow',()=>{
 const a=Uint8Array.from({length:160*120},(_,i)=>i%255);assert.equal(estimateFlow(a,a,160,120).confidence,0);
});
test('translated textured patch is measured downward rather than upward',()=>{
 const w=160,h=120;const a=new Uint8Array(w*h),b=new Uint8Array(w*h);
 for(let y=25;y<70;y++)for(let x=55;x<95;x++){const v=(x*73+y*39+x*y*11)%230+20;a[y*w+x]=v;b[(y+4)*w+x]=v;}
 const f=estimateFlow(a,b,w,h);assert.ok(f.dy>0);assert.ok(f.confidence>.35);assert.equal(f.globalMotion,false);
});
test('a recognized spell needs a stroke and is consumed only once',()=>{
 const g=new CastGate();assert.equal(g.arm('accio',1000),null);assert.equal(g.stroke(1200),'accio');assert.equal(g.stroke(1250),null);
});
test('recognition can use a recent stroke, but not a stale one',()=>{
 const g=new CastGate();g.stroke(1000);assert.equal(g.arm('accio',1300),'accio');
 g.reset();g.stroke(1000);assert.equal(g.arm('accio',1600),null);assert.equal(g.pending.spellId,'accio');
});
test('expiry and reset discard pending spells',()=>{
 const g=new CastGate();g.arm('accio',1000);assert.equal(g.expire(9001),true);assert.equal(g.stroke(9002),null);
 g.arm('protego',10000);g.reset();assert.equal(g.stroke(10001),null);
});
for(const s of SPELLS)test(`preview prepares an applicable state: ${s.id}`,()=>{
 const w=createPreviewWorld(s.id,100000);assert.equal(applySpell(w,s.id,{now:101200}).status,'applied');
});
