import {applySpell,CAPS} from './world.js';
/** Replenish only missing prerequisites so toddlers can see every spell's cause and effect. */
export function preparePlayTarget(world,id,now=Date.now()) {
 const a=world.armor;
 if(['stupefy','everte_statum','rictusempra','impedimenta','expelliarmus','slugulas_eructo'].includes(id)) {a.standing=true;a.offsetZ=0;a.onSoftLanding=false;}
 if(id==='rennervate')a.standing=false;
 if(id==='episkey'){a.standing=true;a.dented=true;}
 if(id==='expelliarmus')a.holdsSword=true;
 if(id==='rictusempra'){a.tickling=false;a.tickleUntil=null;}
 if(id==='impedimenta'){a.speedFactor=1;a.slowUntil=null;}
 if(id==='reducto'&&world.rocks.every(r=>r.broken)){
  const rock=world.rocks[0];rock.broken=false;world.debris=world.debris.filter(d=>d.from!==rock.id);
 }
 if(id==='vipera_evanesca'&&!world.snakes.length)applySpell(world,'serpensortia',{now});
 if(id==='finite_incantatem'&&!world.snakes.length&&!world.treasures.length&&!world.shield.active&&!world.debris.length){
  applySpell(world,'serpensortia',{now});applySpell(world,'protego',{now});applySpell(world,'reducto',{now});
 }
 // Free one slot when a collection is full; the new object can visibly arrive.
 for(const [spell,key] of [['accio','treasures'],['serpensortia','snakes'],['slugulas_eructo','slugs']])if(id===spell&&world[key].length>=CAPS[key])world[key].pop();
 return world;
}
