import * as THREE from '../vendor/three.module.min.js';

// Large spatial silhouettes with bounded geometry, including on the phone's low-power setting.
export const IMPACT_SHAPES = {
  accio:'vortex',stupefy:'shock',reducto:'shock',protego:'shield',rennervate:'rise',episkey:'rise',
  expelliarmus:'shock',rictusempra:'vortex',serpensortia:'vortex',slugulas_eructo:'vortex',
  impedimenta:'shield',vipera_evanesca:'vortex',finite_incantatem:'nova',everte_statum:'shock',
};
export class ImpactField {
  constructor(scene) {
    this.scene=scene;
    this.group=new THREE.Group();scene.add(this.group);
    this.uniforms={uColor:{value:new THREE.Color()},uAccent:{value:new THREE.Color()},uTime:{value:0},uOpacity:{value:0}};
    this.shell=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),new THREE.ShaderMaterial({
      uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending,
      vertexShader:`varying vec3 vNormal; varying vec3 vView; varying vec3 vP;
        void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);vP=position;gl_Position=projectionMatrix*p;}`,
      fragmentShader:`uniform vec3 uColor;uniform vec3 uAccent;uniform float uTime;uniform float uOpacity;
        varying vec3 vNormal;varying vec3 vView;varying vec3 vP;
        void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.8);
        float bands=pow(.5+.5*sin(vP.y*34.+vP.x*9.-uTime*9.),12.);
        float filaments=pow(.5+.5*sin(atan(vP.z,vP.x)*17.+vP.y*13.+uTime*4.),18.);
        float a=(rim*.7+bands*.14+filaments*.16)*uOpacity;
        gl_FragColor=vec4(mix(uColor,uAccent,bands)*1.35,a);}`,
    }));this.group.add(this.shell);
    this.rings=[];
    for(let i=0;i<3;i++){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.012,5,96),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      this.group.add(ring);this.rings.push(ring);
    }
    this.rayPositions=new Float32Array(64*2*3);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(this.rayPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.rays=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));this.rays.frustumCulled=false;this.group.add(this.rays);
    // A soft coloured edge wash also lights the photographic background without white flashing.
    this.wash=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      uniforms:{uColor:{value:new THREE.Color()},uOpacity:{value:0}},transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;void main(){float edge=smoothstep(.12,.72,length(vUv-.5));gl_FragColor=vec4(uColor,(.12+edge*.88)*uOpacity);}',
    }));this.wash.frustumCulled=false;this.wash.renderOrder=900;scene.add(this.wash);this.clear();
  }
  show(fx,progress) {
    const p=THREE.MathUtils.clamp(progress,0,1),kind=IMPACT_SHAPES[fx.spellId];
    if(!kind)return;
    const fade=Math.sin(Math.PI*Math.min(1,p*3))*Math.pow(1-p,.7);
    const sustain=Math.sin(Math.PI*p)*.6;
    const opacity=Math.max(fade,sustain)*Math.min(1.3,fx.strength);
    this.group.visible=true;this.group.position.copy(fx.target);
    const radius=kind==='nova'?1+p*9:kind==='shield'?1.3+p*1.7:.7+p*4.4;
    this.shell.scale.set(radius,kind==='rise'?radius*1.7:radius,radius);
    this.uniforms.uTime.value=p*3;this.uniforms.uOpacity.value=opacity*(fx.readable?.30:.68);
    this.uniforms.uColor.value.copy(fx.color);this.uniforms.uAccent.value.copy(fx.color2);
    this.shell.visible=kind==='shield'||kind==='nova'||kind==='shock';
    for(let i=0;i<3;i++){
      const ring=this.rings[i],r=radius*(.7+i*.18);
      ring.scale.setScalar(r);ring.position.y=kind==='rise'?(p*3+i*.45-1):0;
      ring.rotation.set(kind==='vortex'?p*2+i*.8:Math.PI/2+i*.25,kind==='shield'?i*.7:0,p*2+i);
      ring.material.color.copy(i===1?fx.color2:fx.color);ring.material.opacity=opacity*(kind==='shock'?.32:.65);
    }
    for(let i=0;i<64;i++){
      const a=i*2.399963, y=1-2*(i+.5)/64,flat=Math.sqrt(1-y*y);
      const inner=kind==='vortex'?.4+p*1.2:radius*.45,outer=radius*(1.1+(i%7)*.1);
      for(let j=0;j<2;j++){
        const r=j?outer:inner,theta=a+(kind==='vortex'?p*5+j*.8:0),k=(i*2+j)*3;
        this.rayPositions[k]=Math.cos(theta)*flat*r;
        this.rayPositions[k+1]=kind==='rise'?y+ p*4+j*.7:y*r;
        this.rayPositions[k+2]=Math.sin(theta)*flat*r;
      }
    }
    this.rays.geometry.attributes.position.needsUpdate=true;this.rays.material.color.copy(fx.color2);this.rays.material.opacity=opacity*.62;
    this.wash.material.uniforms.uColor.value.copy(fx.color);this.wash.material.uniforms.uOpacity.value=opacity*.20;
  }
  clear(){this.group.visible=false;this.wash.material.uniforms.uOpacity.value=0;}
  dispose(){this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.group.removeFromParent();this.wash.geometry.dispose();this.wash.material.dispose();this.wash.removeFromParent();}
}
