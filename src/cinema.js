import * as THREE from '../vendor/three.module.min.js';
import { glowSprite } from './textures.js';

export function coverUV(imageAspect, viewportAspect) {
  if (!(imageAspect>0 && viewportAspect>0)) return {x:1,y:1,ox:0,oy:0};
  const x=Math.min(1,viewportAspect/imageAspect),y=Math.min(1,imageAspect/viewportAspect);
  return {x,y,ox:(1-x)/2,oy:(1-y)/2};
}

/** Fixed-view photographic plate; all interactive subjects remain real 3D objects. */
export class CinemaPlate {
  constructor(scene, fallbackObjects, {loadTexture=(url,ok,fail)=>new THREE.TextureLoader().load(url,ok,undefined,fail)}={}) {
    this.scene=scene;this.fallbackObjects=fallbackObjects;this.ready=false;this.disposed=false;this.aspect=16/9;
    this.layer=new THREE.Group();this.layer.visible=false;scene.add(this.layer);
    // Receives real scene shadows without drawing a second floor over the image.
    this.floor=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.ShadowMaterial({opacity:.28,depthWrite:false}));
    this.floor.rotation.x=-Math.PI/2;this.floor.position.y=.002;this.floor.receiveShadow=true;this.layer.add(this.floor);
    const soft=glowSprite();
    this.contact=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:soft,color:0x000000,transparent:true,opacity:.58,depthWrite:false,fog:false}));
    this.contact.rotation.x=-Math.PI/2;this.contact.position.y=.008;this.layer.add(this.contact);
    this.spill=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:soft,color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
    this.spill.rotation.x=-Math.PI/2;this.spill.position.y=.014;this.layer.add(this.spill);
    loadTexture(new URL('../assets/cinema/hall.webp',import.meta.url).href,tex=>{
      if(this.disposed){tex.dispose();return;}
      this.texture=tex;tex.colorSpace=THREE.SRGBColorSpace;
      this.ready=true;this.resize(this.aspect);
      scene.background=tex;
      // Keep background intensity neutral; interactive meshes use the scene lights.
      scene.backgroundIntensity=1;
      fallbackObjects.forEach(o=>o.visible=false);this.layer.visible=true;
    },()=>{this.error='背景画像を読み込めなかったため立体背景を使用';});
  }
  resize(aspect){
    this.aspect=aspect;if(!this.texture)return;
    const image=this.texture.image;
    const uv=coverUV(image.width/image.height,aspect);
    this.texture.repeat.set(uv.x,uv.y);this.texture.offset.set(uv.ox,uv.oy);this.texture.updateMatrix();
  }
  update(subject,effects,collapse=0){
    if(!this.ready)return;
    this.contact.position.x=subject.position.x;this.contact.position.z=subject.position.z-collapse*.8;
    this.contact.scale.set(1.35+collapse*.3, .8+collapse*1.9,1);
    const light=effects.light;
    this.spill.position.x=light.position.x;this.spill.position.z=light.position.z;
    this.spill.scale.set(4.5,4.5,1);this.spill.material.color.copy(light.color);
    this.spill.material.opacity=Math.min(.22,light.intensity*.012);
  }
  dispose(){this.disposed=true;if(this.scene.background===this.texture)this.scene.background=null;this.texture?.dispose();this.layer.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.contact.material.map.dispose();this.scene.remove(this.layer);}
}
