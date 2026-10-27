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
function drape(rings, {segments=80, depth=.68, open=0, fold=.014, folds=13}={}) {
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
  const cloth=new THREE.MeshStandardMaterial({color:v.cloth,roughness:.97,metalness:0,bumpMap:weave,bumpScale:.006,side:THREE.DoubleSide});
  const lining=new THREE.MeshStandardMaterial({color:0x0a0d0d,roughness:1,side:THREE.DoubleSide});
  const leather=new THREE.MeshStandardMaterial({color:0x181a18,roughness:.62,bumpMap:weave,bumpScale:.003});
  const silver=new THREE.MeshStandardMaterial({color:v.metal,map:metal.map,roughnessMap:metal.roughnessMap,bumpMap:metal.roughnessMap,bumpScale:.0015,roughness:v.roughness,metalness:.83,side:THREE.DoubleSide});
  const engraved=new THREE.MeshStandardMaterial({color:0x3b3d39,roughness:.8,metalness:.45});
  const add=(parent,g,m,xyz,scale)=>{const o=new THREE.Mesh(g,m);o.position.set(...xyz);if(scale)o.scale.set(...scale);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
  const rings=[];
  const profile=[[.09,.39],[.3,.38],[.6,.34],[.85,.28],[1.05,.235],[1.18,.245],[1.36,.32],[1.46,.29],[1.53,.13]];
  for(let k=0;k<profile.length-1;k++)for(let i=0;i<4;i++)rings.push([THREE.MathUtils.lerp(profile[k][0],profile[k+1][0],i/4),THREE.MathUtils.lerp(profile[k][1],profile[k+1][1],i/4)]);
  rings.push(profile.at(-1));
  for(const ring of rings) ring[1]*=THREE.MathUtils.lerp(v.hem,v.shoulder,ring[0]/1.53);
  const under=add(root,drape(rings,{fold:.009}),lining,[0,0,0]);
  const robe=add(root,drape(rings,{open:.075,folds:v.folds}),cloth,[0,0,0]);
  robe.userData.rest=robe.geometry.attributes.position.array.slice();root.userData.clothMeshes=[robe];
  // Overlapping draped collar instead of a spherical torso.
  add(root,drape([[1.25,.27],[1.36,.34],[1.44,.31],[1.51,.18]],{open:.21,fold:.018,depth:.73}),cloth,[0,0,.01]);
  if(v.mantle) {
    const mantle=add(root,drape([[.97,.29],[1.16,.35],[1.35,.39],[1.46,.34],[1.53,.15]],{open:.34,depth:.79,fold:.011,folds:v.folds}),cloth,[0,0,-.025]);
    mantle.scale.x=v.shoulder;
    mantle.userData.rest=mantle.geometry.attributes.position.array.slice();root.userData.clothMeshes.push(mantle);
  }
  const clasp=add(root,new THREE.TorusGeometry(.029,.006,6,18),silver,[0,1.43,.163]);
  const legs=[];
  for(const side of [-1,1]) {
    const leg=new THREE.Group();leg.position.set(side*.125,.72,0);root.add(leg);
    add(leg,new THREE.CapsuleGeometry(.068,.35,6,12),lining,[0,-.24,0]);
    add(leg,new THREE.SphereGeometry(1,20,12),leather,[0,-.64,.055],[.081,.083,.17]);legs.push(leg);
  }
  const head=new THREE.Group();head.position.y=1.73;root.add(head);
  // Hood is an open, thick cloth shell framing the face, not a round helmet.
  const hood=add(head,drape([[-.29,.20,-.04],[-.17,.24,-.03],[.02,.245,-.04],[.18,.22,-.07],[.27,.14,-.07],[.30,.025,-.06]],{open:.7,depth:1,fold:.009}),cloth,[0,0,0]);
  add(head,new THREE.SphereGeometry(1,32,24),lining,[0,-.015,.09],[.17,.24,.13]);
  hood.scale.set(1,v.hood,1.04);
  add(head,maskGeometry(v),silver,[0,0,0]);
  // Etched face ornament stays thin and irregular like engraved metal.
  for(const side of [-1,1])for(let j=0;j<3;j++){
    const a=.012*j;
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*(.026+a),.175,.254),new THREE.Vector3(side*(.105+a*.4),.116,.255),new THREE.Vector3(side*(.13-a*.15),-.055,.255),new THREE.Vector3(side*(.06+a),-.177,.255)]);
    add(head,new THREE.TubeGeometry(curve,30,.0011,4,false),engraved,[0,0,0],[v.width,1,1]);
  }
  const arms={};
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.29,1.36,0);root.add(arm);
    add(arm,drape([[-.5,.105],[-.42,.125],[-.3,.11],[-.15,.105],[0,.115]],{depth:.83,fold:.008}),cloth,[0,0,0]);
    add(arm,new THREE.SphereGeometry(1,18,12),leather,[0,-.525,.015],[.048,.07,.038]);
    for(let j=0;j<4;j++)add(arm,new THREE.CapsuleGeometry(.011,.06,4,8),leather,[(j-1.5)*.021,-.585,.025]);
    add(arm,new THREE.CapsuleGeometry(.014,.045,4,8),leather,[-side*.049,-.535,.045]).rotation.z=side*.45;
    arms[side<0?'left':'right']=arm;
  }
  const wand=new THREE.Group();add(wand,new THREE.CylinderGeometry(.006,.016,.65,12),new THREE.MeshStandardMaterial({color:0x342a20,roughness:.8}),[0,-.23,0]);
  wand.position.set(.02,-.57,.04);wand.rotation.z=-.3;arms.right.add(wand);
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
