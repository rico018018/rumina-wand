import * as THREE from '../vendor/three.module.min.js';
const cache = new Map();
/** Locally hosted CC0 photographic maps; original material stays until all files load. */
export function applyPhotographicStone(material, asset, repeat = [1,1]) {
  const key = `${asset}:${repeat}`;
  if (!cache.has(key)) {
    const loader = new THREE.TextureLoader();
    cache.set(key, Promise.all(['diff','nor_gl','rough'].map(kind => new Promise((resolve,reject) => {
      loader.load(new URL(`../assets/materials/${asset}_${kind}.webp`, import.meta.url).href, tex => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...repeat); tex.anisotropy=4;
        if (kind==='diff') tex.colorSpace=THREE.SRGBColorSpace;
        resolve(tex);
      }, undefined, reject);
    }))));
  }
  cache.get(key).then(([map, normalMap, roughnessMap]) => {
    material.map=map; material.normalMap=normalMap; material.normalScale.set(.7,.7);
    material.roughnessMap=roughnessMap; material.metalness=0; material.needsUpdate=true;
    material.userData.photographicMaps='loaded';
  }).catch(() => { material.userData.photographicMaps='failed'; });
  return material;
}

/** World-sized stone blocks on differently sized box faces. */
export function masonryUV(geometry, metresPerTile=2.5) {
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    if(Math.abs(n.getY(i))>.5) uv.setXY(i,x/metresPerTile,z/metresPerTile);
    else if(Math.abs(n.getX(i))>.5) uv.setXY(i,z/metresPerTile,y/metresPerTile);
    else uv.setXY(i,x/metresPerTile,y/metresPerTile);
  }
  return geometry;
}
