import * as THREE from '../vendor/three.module.min.js';
/** Original procedural masked human, no external models or network dependency. */
export function createDarkWizard() {
  const root = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: .93, metalness: .03, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: 0x101115, roughness: .65 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: .32, metalness: .78 });
  const black = new THREE.MeshStandardMaterial({ color: 0x020307, roughness: 1 });
  const add = (parent, geometry, material, xyz, scale) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(...xyz); if (scale) m.scale.set(...scale);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  // Pleated, irregular hem instead of rigid armor plates.
  const robe = new THREE.CylinderGeometry(.31, .48, 1.15, 56, 18, true);
  const a = robe.attributes.position;
  for (let i=0;i<a.count;i++) { const x=a.getX(i), y=a.getY(i), z=a.getZ(i), angle=Math.atan2(z,x); const fold=1+.075*Math.sin(angle*14+y*2); a.setXYZ(i,x*fold,y+(y<-.5?.025*Math.sin(angle*9):0),z*fold*.68); }
  robe.computeVertexNormals(); add(root,robe,cloth,[0,.8,0]);
  add(root,new THREE.SphereGeometry(1,24,16),cloth,[0,1.35,0],[.36,.28,.23]);
  const belt=add(root,new THREE.CylinderGeometry(.315,.325,.055,32),leather,[0,1.07,0],[1,1,.7]);
  add(root,new THREE.BoxGeometry(.09,.055,.025),silver,[0,1.07,.24]);
  const legs=[];
  for(const side of [-1,1]) {
    const leg=new THREE.Group();leg.position.set(side*.16,.72,0);root.add(leg);
    add(leg,new THREE.CapsuleGeometry(.075,.38,6,12),cloth,[0,-.22,0]);
    add(leg,new THREE.SphereGeometry(1,16,10),leather,[0,-.65,.065],[.105,.095,.21]);legs.push(leg);
  }
  const head=new THREE.Group();head.position.y=1.65;root.add(head);
  add(head,new THREE.SphereGeometry(1,32,24),cloth,[0,.03,-.035],[.27,.33,.25]);
  add(head,new THREE.SphereGeometry(1,24,16),black,[0,-.01,.14],[.205,.27,.12]);
  // Silver faceplate, eye sockets, cheekbones, nose and engraved seams.
  add(head,new THREE.SphereGeometry(1,32,24),silver,[0,0,.218],[.172,.235,.065]);
  for(const side of [-1,1]) {
    const eye=add(head,new THREE.SphereGeometry(1,20,12),black,[side*.077,.047,.276],[.058,.029,.018]);eye.rotation.z=side*.16;
    add(head,new THREE.SphereGeometry(1,18,12),silver,[side*.115,-.05,.263],[.049,.055,.028]);
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.02,.17,.258),new THREE.Vector3(side*.125,.12,.26),new THREE.Vector3(side*.15,-.04,.26),new THREE.Vector3(side*.08,-.18,.257)]);
    add(head,new THREE.TubeGeometry(curve,22,.0035,5,false),black,[0,0,0]);
  }
  add(head,new THREE.ConeGeometry(.03,.105,4),silver,[0,-.015,.29]).rotation.x=.35;
  for(let i=-2;i<=2;i++)add(head,new THREE.BoxGeometry(.009,.035,.008),black,[i*.018,-.12,.275]);
  const arms={};
  for(const side of [-1,1]) {
    const arm=new THREE.Group();arm.position.set(side*.33,1.34,0);root.add(arm);
    add(arm,new THREE.CylinderGeometry(.10,.15,.52,20,8,true),cloth,[0,-.25,0]);
    add(arm,new THREE.SphereGeometry(1,16,12),leather,[0,-.54,.025],[.07,.105,.065]);arms[side<0?'left':'right']=arm;
  }
  const wand=new THREE.Group();
  add(wand,new THREE.CylinderGeometry(.008,.021,.68,10),new THREE.MeshStandardMaterial({color:0x553b29,roughness:.72}),[0,-.23,0]);
  wand.position.set(.025,-.57,.04);wand.rotation.z=-.3;arms.right.add(wand);
  const pain=add(root,new THREE.TorusGeometry(.13,.018,8,24),new THREE.MeshBasicMaterial({color:0xffb877,transparent:true,opacity:.75}),[-.38,.85,.18]);pain.visible=false;
  const laugh=new THREE.Group();laugh.visible=false;root.add(laugh);
  root.scale.setScalar(1.35);
  return { root, head, arms, legs, wand, pain, laugh };
}
