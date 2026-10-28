import * as THREE from '../vendor/three.module.min.js';
import { enemyVariant } from './enemy-variants.js';
import { steelMaps } from './textures.js';

function fabric() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'), img=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
    const v=105+((x%3===0)?18:0)+((y%3===0)?18:0)+Math.sin(x*.19+y*.2)*7;
    const i=(y*256+x)*4;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;
  }
  ctx.putImageData(img,0,0);const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,8);
  return t;
}

/** Ring profile tailoring: narrow waist, weight-bearing shoulders and cloth folds. */
function drape(rings, {segments=80, depth=.68, open=0, fold=.006, folds=7}={}) {
  const p=[],uv=[],ix=[];
  for(let j=0;j<rings.length;j++) {
    const [y,r,offset=0]=rings[j];
    for(let k=0;k<=segments;k++) {
      const a=open+(Math.PI*2-2*open)*k/segments;
      const ripple=fold*(Math.sin(a*folds+y*2.5)+.45*Math.sin(a*23-y*3));
      p.push(Math.sin(a)*(r+ripple),y,Math.cos(a)*(r+ripple)*depth+offset);
      uv.push(k/segments,j/(rings.length-1));
      if(j<rings.length-1&&k<segments){const n=j*(segments+1)+k;ix.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

/** Sculpted faceplate with real eye openings, a nose bridge, brows and tapered jaw. */
function maskGeometry(v) {
  const nx=64,ny=72,p=[],uv=[],ix=[];
  const shape=(x,y)=>{
    const jaw=1-v.jaw*Math.max(0,-y/.22),w=.157*v.width*jaw*Math.sqrt(Math.max(.14,1-(y/.27)**2));
    const px=x*w;
    const gauss=(cx,cy,sx,sy)=>Math.exp(-(((px-cx)/sx)**2+((y-cy)/sy)**2));
    let z=.235+.033*(1-x*x);
    z+=.064*v.nose*gauss(0,-.012,.023,.085); // nose ridge
    z+=.014*gauss(0,-.062,.035,.022);
    z+=.013*(gauss(-.071,.081,.052,.017)+gauss(.071,.081,.052,.017));
    z+=.018*(gauss(-.1,-.045,.037,.035)+gauss(.1,-.045,.037,.035));
    z-=.009*gauss(0,-.135,.062,.009);
    return [px,y,z];
  };
  const eye=(x,y)=>[-.068,.068].some(cx=>((x-cx)/(.047*v.eyes))**2+((y-.044)/.020)**2<1);
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const q=shape(i/nx*2-1,.22-j/ny*.44);p.push(...q);uv.push(i/nx,j/ny);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const q=shape((i+.5)/nx*2-1,.22-(j+.5)/ny*.44);if(eye(q[0],q[1]))continue;
    const a=j*(nx+1)+i;ix.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}

export function createDarkWizard(id = 'silver') {
  const v=enemyVariant(id);
  const root=new THREE.Group(),weave=fabric(),metal=steelMaps();
  const cloth=new THREE.MeshPhysicalMaterial({color:v.cloth,roughness:.91,metalness:0,bumpMap:weave,bumpScale:.004,sheen:.35,sheenColor:0x504c48,sheenRoughness:.85,side:THREE.DoubleSide});
  const lining=new THREE.MeshStandardMaterial({color:0x0a0d0d,roughness:1,side:THREE.DoubleSide});
  const leather=new THREE.MeshStandardMaterial({color:0x181a18,roughness:.62,bumpMap:weave,bumpScale:.003});
  const silver=new THREE.MeshStandardMaterial({color:v.metal,map:metal.map,roughnessMap:metal.roughnessMap,bumpMap:metal.roughnessMap,bumpScale:.0015,roughness:v.roughness,metalness:.83,side:THREE.DoubleSide});
  const engraved=new THREE.MeshStandardMaterial({color:0x3b3d39,roughness:.8,metalness:.45});
  const add=(parent,g,m,xyz,scale)=>{const o=new THREE.Mesh(g,m);o.position.set(...xyz);if(scale)o.scale.set(...scale);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
  const rings=[];
  const profile=[[.09,.285],[.3,.27],[.6,.235],[.85,.195],[1.05,.175],[1.18,.18],[1.36,.225],[1.46,.235],[1.53,.09]];
  for(let k=0;k<profile.length-1;k++)for(let i=0;i<4;i++)rings.push([THREE.MathUtils.lerp(profile[k][0],profile[k+1][0],i/4),THREE.MathUtils.lerp(profile[k][1],profile[k+1][1],i/4)]);
  rings.push(profile.at(-1));
  for(const ring of rings) ring[1]*=THREE.MathUtils.lerp(v.hem,v.shoulder,ring[0]/1.53);
  const under=add(root,drape(rings,{fold:.003}),lining,[0,0,0]);
  const robe=add(root,drape(rings,{open:.16,fold:.006,folds:Math.round(v.folds*.45)}),cloth,[0,0,0]);
  robe.userData.rest=robe.geometry.attributes.position.array.slice();root.userData.clothMeshes=[robe];
  // Overlapping draped collar instead of a spherical torso.
  add(root,drape([[1.32,.20],[1.40,.245],[1.47,.23],[1.55,.095]],{open:.34,fold:.004,depth:.73}),cloth,[0,0,.01]);
  if(v.mantle) {
    const mantle=add(root,drape([[.97,.205],[1.16,.235],[1.35,.27],[1.46,.255],[1.55,.10]],{open:.42,depth:.79,fold:.006,folds:7}),cloth,[0,0,-.025]);
    mantle.scale.x=v.shoulder;
    mantle.userData.rest=mantle.geometry.attributes.position.array.slice();root.userData.clothMeshes.push(mantle);
  }
  const clasp=add(root,new THREE.TorusGeometry(.029,.006,6,18),silver,[0,1.43,.175]);
  // Fitted leather waist belt follows the torso; understated metal fasteners.
  add(root,drape([[1.025,.18],[1.075,.18]],{depth:.70,fold:.002}),leather,[0,0,.005]);
  const buckle=add(root,new THREE.TorusGeometry(.028,.004,6,20),silver,[0,1.05,.137]);buckle.scale.x=1.3;
  for(let y=1.17;y<1.4;y+=.065)add(root,new THREE.SphereGeometry(.009,10,8),engraved,[.023,y,.152]);
  const legs=[];
  for(const side of [-1,1]) {
    const leg=new THREE.Group();leg.position.set(side*.105,.96,0);root.add(leg);
    // Hip-to-knee and knee-to-ankle volumes retain adult leg length under the open robe.
    add(leg,new THREE.CapsuleGeometry(.075,.31,8,16),lining,[0,-.23,0],[1,1,.88]);
    add(leg,new THREE.CapsuleGeometry(.055,.30,8,16),lining,[0,-.65,0],[1,1,.85]);
    const boot=add(leg,new THREE.SphereGeometry(1,24,16),leather,[0,-.89,.065],[.069,.07,.14]);boot.name='adult-boot';legs.push(leg);
  }
  const head=new THREE.Group();head.position.y=1.73;head.scale.setScalar(.58);root.add(head);
  head.name="adult-head";
  add(root,new THREE.CylinderGeometry(.065,.075,.14,24),lining,[0,1.565,.015]);
  // Hood is an open, thick cloth shell framing the face, not a round helmet.
  const hood=add(head,drape([[-.29,.20,-.04],[-.17,.24,-.03],[.02,.245,-.04],[.18,.22,-.07],[.27,.14,-.07],[.30,.025,-.06]],{open:.7,depth:1,fold:.009}),cloth,[0,0,0]);
  add(head,new THREE.SphereGeometry(1,32,24),lining,[0,-.015,.09],[.17,.24,.13]);
  hood.scale.set(1,1+(v.hood-1)*.35,1.04);
  const face=add(head,maskGeometry(v),silver,[0,0,0]);face.name="adult-faceplate";
  // Recessed human eyes: no glowing cartoon eye dots. Faceplate remains in front.
  const eyeWhite=new THREE.MeshStandardMaterial({color:0x756b5f,roughness:.7});
  const iris=new THREE.MeshStandardMaterial({color:0x221a13,roughness:.4});
  for(const side of [-1,1]){
    add(head,new THREE.SphereGeometry(1,20,12),eyeWhite,[side*.068,.044,.234],[.034,.015,.014]);
    add(head,new THREE.SphereGeometry(1,16,10),iris,[side*.068,.044,.246],[.011,.013,.004]);
  }
  // Etched face ornament stays thin and irregular like engraved metal.
  for(const side of [-1,1])for(let j=0;j<3;j++){
    const a=.012*j;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*(.026+a),.175,.254),new THREE.Vector3(side*(.105+a*.4),.116,.255),new THREE.Vector3(side*(.13-a*.15),-.055,.255),new THREE.Vector3(side*(.06+a),-.177,.255)]);
    add(head,new THREE.TubeGeometry(curve,30,.0011,4,false),engraved,[0,0,0],[v.width,1,1]);
  }
  const arms={};
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.235*v.shoulder,1.44,0);root.add(arm);
    // Tapered upper arm, elbow and forearm. Wrists reach the upper thigh.
    add(arm,drape([[-.60,.052,.035],[-.51,.063,.025],[-.38,.068,.01],[-.30,.077,0],[-.15,.084,0],[0,.09,0]],{depth:.85,fold:.003,folds:5}),cloth,[0,0,0]);
    add(arm,new THREE.SphereGeometry(1,20,14),leather,[0,-.64,.04],[.041,.052,.028]);
    const lengths=[.049,.065,.071,.061];
    for(let j=0;j<4;j++){
      const finger=add(arm,new THREE.CapsuleGeometry(.0085,lengths[j],5,10),leather,[(j-1.5)*.018,-.684-lengths[j]/2,.048]);
      finger.rotation.x=-.12;
    }
    add(arm,new THREE.CapsuleGeometry(.012,.036,5,10),leather,[-side*.039,-.644,.059]).rotation.z=side*.45;
    add(arm,drape([[-.60,.054,.035],[-.57,.056,.03]],{depth:.85,fold:.001}),leather,[0,0,0]);
    arm.rotation.x=-.08;arm.rotation.z=side*.08;
    arms[side<0?'left':'right']=arm;
  }
  const wand=new THREE.Group();add(wand,new THREE.CylinderGeometry(.006,.016,.65,12),new THREE.MeshStandardMaterial({color:0x342a20,roughness:.8}),[0,-.23,0]);
  wand.position.set(.02,-.70,.063);wand.rotation.z=-.3;arms.right.add(wand);
  const pain=new THREE.Group();pain.visible=false;root.add(pain);
  const laugh=new THREE.Group();laugh.visible=false;root.add(laugh);
  root.scale.setScalar(1.35);
  root.userData.variantId=v.id;
  root.name=`dark-wizard-${v.id}`;
  return {root,head,arms,legs,wand,pain,laugh};
}

/** Dispose each unique GPU resource exactly once when changing costumes. */
export function disposeDarkWizard(root) {
  const geometries=new Set(),materials=new Set(),textures=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m);});
  for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
  textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
  root.removeFromParent();
}
