import * as THREE from '../vendor/three.module.min.js';
// One visual sentence per spell. Scene state is authoritative; the focus never changes game state.
export const SPELL_STORIES={
 accio:{subject:'treasure',label:'たからものが とんでくる',scale:2.8},
 stupefy:{subject:'person',label:'てきが たおれる',scale:1.12},
 reducto:{subject:'rock',label:'いわが くだける',scale:1.7},
 protego:{subject:'shield',label:'まもる かべが できる',scale:1.15},
 rennervate:{subject:'person',label:'てきが おきあがる',scale:1.12},
 episkey:{subject:'person',label:'いたいのが なおる',scale:1.12},
 expelliarmus:{subject:'person',label:'てきの つえが とぶ',scale:1.12},
 rictusempra:{subject:'person',label:'くすぐったくて わらう',scale:1.12},
 serpensortia:{subject:'snake',label:'へびが あらわれる',scale:2.3},
 slugulas_eructo:{subject:'person',label:'ナメクジが おちる',scale:1.12},
 impedimenta:{subject:'person',label:'うごきが ゆっくりに',scale:1.12},
 vipera_evanesca:{subject:'snake',label:'へびが きえる',scale:2.3},
 finite_incantatem:{subject:'world',label:'まほうが とけて もとどおり',scale:1},
 everte_statum:{subject:'person',label:'てきが うしろへ とぶ',scale:1.12},
};
const smooth=x=>{x=THREE.MathUtils.clamp(x,0,1);return x*x*(3-2*x);};
export class SpellFocus {
 constructor(){this.saved=[];this.active=null;}
 start(id,anchor,now=performance.now()){
  this.restore();this.active={id,anchor:anchor.clone(),start:now};
  return {impactMs:900,totalMs:4600};
 }
 restore(){for(const s of this.saved){s.node.position.copy(s.position);s.node.scale.copy(s.scale);}this.saved=[];}
 cancel(){this.restore();this.active=null;}
 target(){return new THREE.Vector3(0,1.2,1.15);}
 update(now,subjectNodes){
  this.restore();if(!this.active)return;
  const elapsed=now-this.active.start;
  if(elapsed>=4600){this.active=null;return;}
  const story=SPELL_STORIES[this.active.id];
  if(!story)return;
  const weight=smooth(elapsed/650)*(1-smooth((elapsed-3700)/900));
  const anchor=this.active.anchor, dest=new THREE.Vector3(0,story.subject==='person'?0:.85,1.15);
  if(story.subject==='shield')dest.set(0,0,2.4);
  const scale=1+(story.scale-1)*weight;
  const offset=dest.clone().sub(anchor).multiplyScalar(weight);
  for(const node of new Set(subjectNodes.filter(Boolean))){
   this.saved.push({node,position:node.position.clone(),scale:node.scale.clone()});
   if(story.subject==='world') {
    const close=new THREE.Vector3(node.position.x*.45,node.position.y*.85,node.position.z*.25+1.2);
    node.position.lerp(close,weight);node.scale.multiplyScalar(1+weight*.12);
   } else {node.position.sub(anchor).multiplyScalar(scale).add(anchor).add(offset);node.scale.multiplyScalar(scale);}
  }
 }
}
