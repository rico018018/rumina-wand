/** Original procedural Foley scores. Times are seconds after the visual impact. */
export function impactScore(id) {
 const e=[];
 const tone=(freq,at,dur,gain=.16,extra={})=>e.push({kind:'tone',freq,at,dur,gain,attack:.003,...extra});
 const noise=(at,dur,gain,from,to,extra={})=>e.push({kind:'noise',at,dur,gain,from,to,q:.65,attack:.006,...extra});
 const thud=(at,weight=1)=>{tone(110,at,.42,.34*weight,{slideTo:38});noise(at,.16,.24*weight,750,90,{type:'lowpass'});};
 const wood=(at,weight=1)=>{[143,219,367,611].forEach((f,i)=>tone(f,at+i*.003,.22/(1+i*.3),.16*weight/(1+i*.55)));noise(at,.055,.25*weight,2400,500);};
 const metal=(at,base=330,weight=1)=>{[1,1.47,2.09,2.56,3.81].forEach((r,i)=>tone(base*r,at,.95/(1+i*.25),.12*weight/(1+i*.5)));noise(at,.035,.18*weight,6500,2100);};
 const cloth=(at,dur=.4)=>noise(at,dur,.17,900,220,{attack:.06});
 const air=(at,dur,reverse=false)=>noise(at,dur,.3,reverse?220:3400,reverse?3400:180,{attack:reverse?dur*.7:.025,pan:reverse?.65:-.65,panTo:reverse?-.65:.65});
 const shimmer=(at,base=700)=>[1,1.51,2.03,2.71].forEach((r,i)=>tone(base*r,at+i*.055,.75,.055,{pan:(i-1.5)*.3}));
 switch(id){
  case 'accio':
   air(0,1.45,true);cloth(.35,.8);metal(.4,410,.3);wood(1.50);metal(1.51,490,.55);thud(1.5,.6);wood(1.64,.35);shimmer(1.55);break;
  case 'stupefy':
   noise(0,.09,.45,4600,250);thud(0);air(.04,.55);cloth(.24,.5);thud(.65,.85);cloth(.68,.35);break;
  case 'reducto':
   thud(0,1.15);noise(0,.09,.6,7800,650);noise(.04,.7,.38,2400,120,{type:'lowpass'});
   for(let i=0;i<15;i++){const at=.09+i*.065+i*i*.003;noise(at,.035+i*.004,.20/(1+i*.12),3100+(i%4)*850,380,{pan:Math.sin(i*2.1)*.85});tone(240+(i%5)*137,at,.065,.08,{slideTo:100});}break;
  case 'protego':
   air(0,.65,true);metal(0,190,.75);tone(62,0,1.7,.19,{slideTo:90,attack:.14});metal(.16,280,.45);shimmer(.28,920);noise(.45,.9,.12,2400,700);break;
  case 'rennervate':
   thud(0,.35);tone(85,.05,1,.13,{slideTo:175,attack:.12});noise(.12,.65,.2,300,1300,{attack:.2});cloth(.38,.75);wood(.85,.3);wood(1.04,.35);shimmer(.42,630);break;
  case 'episkey':
   noise(0,.6,.16,1800,550,{attack:.1});tone(150,0,1.3,.13,{slideTo:300,attack:.22});
   for(let i=0;i<9;i++)noise(.14+i*.08,.03,.06,2600+i*300,1400,{pan:Math.sin(i)*.45});shimmer(.2,820);cloth(.75,.35);break;
  case 'expelliarmus':
   noise(0,.055,.45,5200,1100);wood(0,.8);air(.03,1.03);metal(.05,640,.32);wood(1.1);wood(1.26,.55);wood(1.4,.25);break;
  case 'rictusempra':
   air(0,.35);shimmer(.03,920);
   for(let i=0;i<7;i++){const at=.15+i*.14+(i%2)*.03;noise(at,.09,.16,1200,350);tone(155+(i%3)*23,at,.095,.11,{slideTo:110});tone(690+(i%2)*190,at,.07,.035);cloth(at,.09);}break;
  case 'serpensortia':
   air(0,.42);thud(.05,.5);noise(.18,1.15,.39,4800,2300,{q:1.3,attack:.09,pan:-.35,panTo:.3});
   for(let i=0;i<8;i++)noise(.25+i*.13,.16,.12,1100,280,{pan:Math.sin(i)*.5});break;
  case 'slugulas_eructo':
   tone(135,0,.28,.23,{slideTo:42});noise(.02,.18,.18,700,120);
   for(let i=0;i<5;i++){const at=.95+i*.13;noise(at,.09,.22,2100,230);tone(330-i*28,at,.11,.16,{slideTo:65});wood(at,.25);}
   break;
  case 'impedimenta':
   air(0,.5);tone(170,0,1.8,.25,{slideTo:34});
   for(let i=0;i<5;i++){const at=.08+i*.15+i*i*.045;metal(at,250-i*35,.4);noise(at,.10+i*.02,.13,1600-i*200,180);}break;
  case 'vipera_evanesca':
   noise(0,.38,.29,3600,1800);air(.1,.65,true);tone(190,.15,.55,.19,{slideTo:65});noise(.74,.045,.35,5200,800);shimmer(.8,1100);break;
  case 'finite_incantatem':
   metal(0,210,.65);air(0,1.2,true);tone(95,0,1.4,.23,{slideTo:40});
   for(let i=0;i<7;i++)noise(.12+i*.13,.07,.17,3900-i*300,240,{pan:i%2?.6:-.6});shimmer(1.1,520);air(1.2,.55);break;
  case 'everte_statum':
   thud(0,1.1);noise(0,.08,.4,2600,500);air(.03,.7);cloth(.1,.8);thud(.72,1.05);wood(.75,.35);cloth(.8,.45);break;
  default: thud(0,.5);shimmer(.1);
 }
 // Short early reflections add room depth. Echo sources remain explicitly cancellable.
 const echoes=e.filter(x=>x.kind==='tone'&&x.gain>=.12).slice(0,8).map((x,i)=>({...x,at:x.at+.11+(i%3)*.037,gain:x.gain*.16,pan:-(x.pan||.35),dur:Math.min(x.dur,.65)}));
 return [...e,...echoes];
}
export const scoreDuration=events=>Math.max(1.4,...events.map(e=>e.at+e.dur+.03));
