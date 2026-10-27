import * as THREE from '../vendor/three.module.min.js';
export const CHEST_LEVELS=5;
export const CHEST_STEP=.68;
export function chestHome(level){return new THREE.Vector3(-2.45,.65+Math.min(4,Math.max(0,level))*CHEST_STEP,-2.4);}
export function createTreasureChest(wood) {
 const root=new THREE.Group();root.name='wooden-treasure-chest';
 const timber=new THREE.MeshStandardMaterial({color:0x795032,map:wood.map,roughnessMap:wood.roughnessMap,bumpMap:wood.map,bumpScale:.012,roughness:.78,metalness:0});
 const brass=new THREE.MeshStandardMaterial({color:0xb58e48,roughness:.4,metalness:.82});
 const dark=new THREE.MeshStandardMaterial({color:0x211a14,roughness:.9});
 const add=(g,m,x,y,z)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;};
 add(new THREE.BoxGeometry(.94,.34,.60),timber,0,.17,0);
 // Extruded semicircle: a recognisable barrel lid, with a flat stacking support on top.
 const shape=new THREE.Shape();shape.moveTo(-.3,0);shape.absarc(0,0,.3,Math.PI,0,true);shape.lineTo(-.3,0);
 const lid=add(new THREE.ExtrudeGeometry(shape,{depth:.94,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:2,steps:1,curveSegments:18}),timber,-.47,.34,0);lid.rotation.y=Math.PI/2;
 for(const x of [-.34,.34]){
  add(new THREE.BoxGeometry(.055,.35,.625),brass,x,.175,0);
  const band=add(new THREE.TorusGeometry(.307,.018,5,32,Math.PI),brass,x,.34,0);band.rotation.y=Math.PI/2;
  for(const z of [-.305,.305])for(const y of [.07,.27])add(new THREE.SphereGeometry(.018,8,6),brass,x,y,z);
 }
 add(new THREE.BoxGeometry(.22,.19,.035),brass,0,.31,.32);
 add(new THREE.SphereGeometry(.024,12,8),dark,0,.32,.342);
 add(new THREE.BoxGeometry(.018,.045,.012),dark,0,.285,.344);
 add(new THREE.BoxGeometry(.76,.035,.20),timber,0,.655,0);
 for(const x of [-.43,.43])add(new THREE.BoxGeometry(.07,.04,.57),brass,x,.02,0);
 return root;
}
function scaleTexture(){
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#344a26';g.fillRect(0,0,256,256);
 for(let y=-1;y<17;y++)for(let x=-1;x<17;x++){
  const xx=x*16+(y%2)*8,yy=y*16;g.fillStyle=(x+y)%4===0?'#8a9651':'#607b39';g.beginPath();g.ellipse(xx,yy,7,9,0,0,Math.PI*2);g.fill();g.strokeStyle='#293b21';g.lineWidth=1;g.stroke();
 }
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,7);return t;
}
let skin;
export function createSnake() {
 skin ||= scaleTexture();
 const group=new THREE.Group();group.name='scaled-snake';
 const material=new THREE.MeshStandardMaterial({color:0xb1ba77,map:skin,bumpMap:skin,bumpScale:.018,roughness:.48,metalness:0});
 const rings=64,sides=12,p=new Float32Array((rings+1)*(sides+1)*3),uv=[],indices=[];
 for(let i=0;i<=rings;i++)for(let j=0;j<=sides;j++){
  uv.push(j/sides,i/rings);if(i<rings&&j<sides){const a=i*(sides+1)+j;indices.push(a,a+sides+1,a+1,a+1,a+sides+1,a+sides+2);}
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(p,3).setUsage(THREE.DynamicDrawUsage));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);
 const body=new THREE.Mesh(geo,material);body.castShadow=body.receiveShadow=true;body.frustumCulled=false;group.add(body);
 const head=new THREE.Group();group.add(head);
 const skull=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),material);skull.scale.set(.19,.12,.29);head.add(skull);
 const jaw=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),new THREE.MeshStandardMaterial({color:0xb6ad72,roughness:.7}));jaw.scale.set(.17,.045,.25);jaw.position.y=-.075;head.add(jaw);
 for(const side of [-1,1]){
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.036,16,10),new THREE.MeshStandardMaterial({color:0xc29b35,roughness:.2}));eye.position.set(side*.16,.035,.12);head.add(eye);
  const pupil=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color:0x080b05,roughness:.16}));pupil.scale.set(.009,.027,.018);pupil.position.set(side*.18,.038,.135);head.add(pupil);
 }
 function update(time){
  for(let i=0;i<=rings;i++){
   const u=i/rings,phase=time*2.4-u*9,x=Math.sin(phase)*.28*u,y=.20+.18*Math.exp(-u*7),z=-u*2.7;
   const radius=.145*Math.pow(1-u,.65)+.009;
   for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2,k=(i*(sides+1)+j)*3;p[k]=x+Math.cos(a)*radius;p[k+1]=y+Math.sin(a)*radius*.78;p[k+2]=z;}
  }
  geo.attributes.position.needsUpdate=true;geo.computeVertexNormals();
  head.position.set(0,.38,.05);head.rotation.y=Math.sin(time*2.4)*.16;
 }
 update(0);group.visible=false;return {group,update};
}
