import { SpellFocus, SPELL_STORIES } from './spell-focus.js';
/**
 * 3Dの魔法世界（要件書 5章）。
 *
 * 【方針】
 * - 固定カメラ。急な視点移動をしない。
 * - 魔法学校の大広間。天井は夜空で、壁と柱はそこで途切れる。
 * - 呪文の対象が大きく見える構図。
 * - 全画面の白光や激しい点滅はしない。光は手前の軌跡・対象・床の輪に限る。
 * - 画面の中に「子どもの分身」は置かない。子ども自身が画面の前で杖を振る側なので、
 *   人型を置くと視点が二重になる。人に作用する呪文の対象は「動くよろい」。
 *
 * 【質感】
 * 面がのっぺり単色だと絵に見えるので、石・鋼・木には手続き的なテクスチャと
 * 粗さのムラを入れ、影を落とし、トーンマッピングで白飛びを抑える。
 */

import * as THREE from '../vendor/three.module.min.js';
import { CinemaPlate } from './cinema.js';
import { floorMaps, wallMaps, steelMaps, rockMaps, woodMaps, starSprite, glowSprite } from './textures.js';
import { SpellEffects } from './effects.js';
import { applyPhotographicStone, masonryUV } from './photo-materials.js';
import { createDarkWizard, disposeDarkWizard } from './dark-wizard.js';

const NIGHT = 0x070b1e;
const GOLD = 0xd8a94e;
const STONE = 0x51565e;

/** 構図の基準。これより縦長の画面では画角を広げて横の見える範囲を保つ。 */
const BASE_FOV_DEG = 42;
const BASE_ASPECT = 16 / 9;
const MAX_FOV_DEG = 72;

/** よろいが見回りする範囲（Impedimenta で遅くなるのが見えるように） */
const PATROL_X = 0.85;
const ARMOR_Z = -0.9;

/** 呪文ごとの「光と演出が向かう先」。全14呪文ぶん用意する。 */
const TARGET_POINTS = {
  accio: new THREE.Vector3(-2.45, 0.75, 0.35),            // 手前の宝物置き場
  stupefy: new THREE.Vector3(0, 1.15, ARMOR_Z),            // よろい
  reducto: new THREE.Vector3(2.45, 0.5, -1.35),            // 壊せる岩
  protego: new THREE.Vector3(0, 1.0, ARMOR_Z + 0.5),       // よろいの前
  rennervate: new THREE.Vector3(0, 0.6, ARMOR_Z),
  episkey: new THREE.Vector3(-0.25, 1.1, ARMOR_Z + 0.35),
  expelliarmus: new THREE.Vector3(0.5, 0.95, ARMOR_Z + 0.2),
  rictusempra: new THREE.Vector3(0, 1.2, ARMOR_Z),
  serpensortia: new THREE.Vector3(1.5, 0.12, -0.2),        // ヘビが湧く床
  slugulas_eructo: new THREE.Vector3(0, 1.75, ARMOR_Z),    // かぶと
  impedimenta: new THREE.Vector3(0, 0.5, ARMOR_Z),         // 足もと
  vipera_evanesca: new THREE.Vector3(1.5, 0.15, -0.2),
  finite_incantatem: new THREE.Vector3(0, 1.7, -1.6),      // 大広間の中央
  everte_statum: new THREE.Vector3(0, 1.1, ARMOR_Z),
  default: new THREE.Vector3(0, 1.3, ARMOR_Z),
};

function arcWindowShape(width, height) {
  const hw = width / 2;
  const straight = height - hw;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(-hw, straight);
  shape.absarc(0, straight, hw, Math.PI, 0, true);
  shape.lineTo(hw, 0);
  shape.lineTo(-hw, 0);
  return shape;
}

/** 形に合わせてUVを貼り直す（ShapeGeometry は原寸UVなので） */
function fitUV(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uvs[i * 2] = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
    uvs[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

/** 窓の中に見える夜空。球に貼る空とは別に、明るい帯だけを描く。 */
function makeWindowSky() {
  const w = 160;
  const h = 400;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1d2a35');
  grad.addColorStop(0.5, '#34434d');
  grad.addColorStop(1, '#6a7b83');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.92;
    const r = Math.random() * 1.2 + 0.8;
    g.globalAlpha = 0.3 + Math.random() * 0.7;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 窓とアーチの奥に貼る夜空 */
function makeSkyTexture() {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#05081c');
  grad.addColorStop(0.24, '#101a46');
  grad.addColorStop(0.38, '#1e3070');
  grad.addColorStop(0.58, '#141f48');
  grad.addColorStop(1, '#080c22');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  const band = g.createLinearGradient(0, h * 0.18, w, h * 0.5);
  band.addColorStop(0, 'rgba(130,160,255,0)');
  band.addColorStop(0.5, 'rgba(160,185,255,0.14)');
  band.addColorStop(1, 'rgba(130,160,255,0)');
  g.fillStyle = band;
  g.fillRect(0, h * 0.14, w, h * 0.4);

  // 月とその暈
  const mx = w * 0.72;
  const my = h * 0.3;
  const halo = g.createRadialGradient(mx, my, 4, mx, my, 70);
  halo.addColorStop(0, 'rgba(255,246,218,0.5)');
  halo.addColorStop(1, 'rgba(255,246,218,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(mx, my, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff4d4';
  g.beginPath();
  g.arc(mx, my, 14, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MagicScene {
  constructor(canvas, { lowPower = false, enemyVariant = 'silver' } = {}) {
    this.canvas = canvas;
    this.lowPower = lowPower;
    this.enemyVariant = enemyVariant;
    this.clock = new THREE.Clock();
    this.pools = { snakes: [], treasures: [], slugs: [], debris: [], swords: [] };
    this.world = null;
    this.renderError = null;
    this.collapse = 0;
    this.focus = new SpellFocus();
    this.vanishGhosts = [];
    this.patrolPhase = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower,
      alpha: false,
      powerPreference: lowPower ? 'low-power' : 'high-performance',
    });
    this.renderer.setClearColor(0x0a1030, 1);
    // 明るいところが白く潰れないようにする。質感が出る。
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxPixelRatio = lowPower ? 1.25 : 2;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x111b26, 0.024);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV_DEG, BASE_ASPECT, 0.1, 80);
    this.camera.position.set(0, 1.8, 6.3);
    this.camera.lookAt(0, 1.25, -0.6);

    this.tex = {
      floor: floorMaps(),
      wall: wallMaps(),
      steel: steelMaps(),
      rock: rockMaps(),
      wood: woodMaps(),
    };

    this.#buildLights();
    const lightDecor=this.scene.children.filter(o=>o.isMesh||o.isSprite);
    const beforeHall=new Set(this.scene.children);
    this.#buildHall();
    const fallbackHall=[...lightDecor,...this.scene.children.filter(o=>!beforeHall.has(o))];
    this.#buildTreasury();
    this.#buildProps();
    this.#buildArmor();
    this.#buildDust();

    this.effects = new SpellEffects(this.scene, this.camera, { lowPower });
    this.cinema = new CinemaPlate(this.scene, fallbackHall);
    this.resize();
  }

  // ---------------------------------------------------------------- 構築

  #buildLights() {
    // ライトは数を絞る。材質の計算はライトの数に比例して重くなるため、
    // 半球光1つで全体の地明かりをまかない、個別の点光源は最小限にする。
    this.scene.add(new THREE.HemisphereLight(0xb5c2c9, 0x4b3825, .6));

    // 月あかり。これが影を落とす。
    const moon = new THREE.DirectionalLight(0xd4dfe5, 2.8);
    moon.position.set(4, 8, -5);
    moon.target.position.set(0, 0.6, -1);
    if (!this.lowPower) {
      moon.castShadow = true;
      moon.shadow.mapSize.set(2048, 2048);
      moon.shadow.camera.near = 1;
      moon.shadow.camera.far = 26;
      moon.shadow.camera.left = -8;
      moon.shadow.camera.right = 8;
      moon.shadow.camera.top = 8;
      moon.shadow.camera.bottom = -6;
      moon.shadow.bias = -0.0012;
      moon.shadow.normalBias = 0.02;
      moon.shadow.radius = 2.5;
    }
    this.scene.add(moon);
    this.scene.add(moon.target);
    this.moon = moon;

    // 対象（よろい）を浮かび上がらせる明かり
    const subject = new THREE.SpotLight(0xffddb0, 40, 20, Math.PI / 5.0, 0.55, 1.5);
    subject.position.set(-4, 4.5, 2.0);
    subject.target.position.set(0, 1.0, ARMOR_Z);
    this.scene.add(subject);
    this.scene.add(subject.target);
    const rim = new THREE.DirectionalLight(0x9eafb8,1.8);rim.position.set(-2,4,-5);this.scene.add(rim);

    // かがり火。暖色で、青い世界に対比を作る。ゆっくり揺らす。
    this.braziers = [];
    const bowlGeo = new THREE.CylinderGeometry(0.32, 0.17, 0.3, 14);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x4a3c28, roughness: 0.85, metalness: 0.35 });
    const flameSprite = glowSprite();
    for (const x of [-5.0, 5.0]) {
      // 明かりは左右で1つずつだが、強さを分けて片方を主にする
      const light = new THREE.PointLight(0xffa552, x < 0 ? 30 : 18, 15, 2);
      light.position.set(x, 2.5, -1.6);
      this.scene.add(light);

      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      bowl.position.set(x, 2.15, -1.6);
      bowl.castShadow = !this.lowPower;
      this.scene.add(bowl);

      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameSprite, color: 0xffb257, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      flame.scale.set(0.95, 1.2, 1);
      flame.position.set(x, 2.45, -1.6);
      this.scene.add(flame);

      this.braziers.push({ light, flame, phase: Math.random() * Math.PI * 2, baseY: 2.45 });
    }
  }

  #buildHall() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({
        map: this.tex.floor.map,
        roughnessMap: this.tex.floor.roughnessMap,
        roughness: 1,
        metalness: 0.08,
        envMapIntensity: 0.5,
      }),
    );
    applyPhotographicStone(floor.material,'stone_floor',[70/1.8,70/1.8]);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !this.lowPower;
    this.scene.add(floor);

    // 天井は無い。壁の上はぜんぶ夜空。
    const skyMap = makeSkyTexture();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(52, 32, 20),
      new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);

    // 金属に映り込む空。これが無いと metalness の高い材質が真っ黒になる。
    try {
      skyMap.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.envRT = pmrem.fromEquirectangular(skyMap);
      this.scene.environment = this.envRT.texture;
      pmrem.dispose();
    } catch (err) {
      this.envError = err?.message || String(err);
    }

    const WALL_TOP = 4.8;
    const wallMat = new THREE.MeshStandardMaterial({
      map: this.tex.wall.map,
      roughnessMap: this.tex.wall.roughnessMap,
      roughness: 1,
      metalness: 0.05,
      envMapIntensity: 0.35,
    });

    applyPhotographicStone(wallMat,'castle_wall_slates');

    // 奥の壁（窓の左右と上に分けて作り、窓の部分は抜く）
    const seg = (w, h, x, y, z) => {
      const m = new THREE.Mesh(masonryUV(new THREE.BoxGeometry(w, h, 0.5)), wallMat);
      m.position.set(x, y, z);
      m.castShadow = !this.lowPower;
      m.receiveShadow = !this.lowPower;
      this.scene.add(m);
      return m;
    };
    const WIN_W = 2.1;
    const WIN_H = 3.5;
    const WIN_Y = 0.6;
    const xs = [-4.6, 0, 4.6];
    // 窓と窓のあいだの柱部分
    const edges = [-13, -3.2, 1.4, 3.2 + 2.9, 13];
    seg(5.6, WALL_TOP, -8.0, WALL_TOP / 2, -7);
    seg(2.5, WALL_TOP, -2.3, WALL_TOP / 2, -7);
    seg(2.5, WALL_TOP, 2.3, WALL_TOP / 2, -7);
    seg(5.6, WALL_TOP, 8.0, WALL_TOP / 2, -7);
    // 窓の上の帯
    const lintel = new THREE.Mesh(masonryUV(new THREE.BoxGeometry(26, WALL_TOP - (WIN_Y + WIN_H), 0.5)), wallMat);
    lintel.position.set(0, (WIN_Y + WIN_H) + (WALL_TOP - (WIN_Y + WIN_H)) / 2, -7);
    lintel.castShadow = !this.lowPower;
    this.scene.add(lintel);
    // 窓の下の腰壁
    const sill = new THREE.Mesh(masonryUV(new THREE.BoxGeometry(26, WIN_Y, 0.5)), wallMat);
    sill.position.set(0, WIN_Y / 2, -7);
    sill.castShadow = !this.lowPower;
    this.scene.add(sill);

    // 壁の天端
    const coping = new THREE.Mesh(
      new THREE.BoxGeometry(26.6, 0.38, 0.9),
      new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.6 }),
    );
    coping.position.set(0, WALL_TOP + 0.19, -7);
    coping.castShadow = !this.lowPower;
    this.scene.add(coping);

    // アーチ窓（夜空が見える）
    const winMat = new THREE.MeshBasicMaterial({ map: makeWindowSky(), fog: false });
    for (const x of xs) {
      const win = new THREE.Mesh(fitUV(new THREE.ShapeGeometry(arcWindowShape(WIN_W, WIN_H))), winMat);
      win.position.set(x, WIN_Y, -7.2);
      this.scene.add(win);
      const frame = new THREE.Mesh(
        fitUV(new THREE.ShapeGeometry(arcWindowShape(WIN_W + 0.36, WIN_H + 0.3))),
        new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.75, metalness: 0.15 }),
      );
      frame.position.set(x, WIN_Y - 0.12, -7.26);
      this.scene.add(frame);
      // 窓の格子
      const barMat = new THREE.MeshStandardMaterial({ color: 0x2b3158, roughness: 0.6, metalness: 0.6 });
      for (let i = 1; i <= 3; i += 1) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(WIN_W, 0.05, 0.05), barMat);
        bar.position.set(x, WIN_Y + (WIN_H / 4) * i, -7.15);
        this.scene.add(bar);
      }
      const vbar = new THREE.Mesh(new THREE.BoxGeometry(0.05, WIN_H, 0.05), barMat);
      vbar.position.set(x, WIN_Y + WIN_H / 2, -7.15);
      this.scene.add(vbar);
    }

    // Real architecture: vaulted ribs and dark stone ceiling, no oversized sky stars.
    const ceilingMat=wallMat.clone();applyPhotographicStone(ceilingMat,'castle_wall_slates',[4,4]);
    const ceiling=new THREE.Mesh(new THREE.PlaneGeometry(27,22),ceilingMat);
    ceiling.rotation.x=Math.PI/2;ceiling.position.set(0,6.8,-2);ceiling.receiveShadow=true;this.scene.add(ceiling);
    const ribMat=new THREE.MeshStandardMaterial({color:0x68645b,roughness:.94});
    for(const z of [-6,-2,2]) {
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-6.4,3.9,z),new THREE.Vector3(-4.5,5.6,z),new THREE.Vector3(0,6.7,z),new THREE.Vector3(4.5,5.6,z),new THREE.Vector3(6.4,3.9,z)]);
      const rib=new THREE.Mesh(new THREE.TubeGeometry(curve,60,.16,8,false),ribMat);rib.castShadow=true;this.scene.add(rib);
    }

    // 左右の列柱
    const colMat = new THREE.MeshStandardMaterial({
      map: this.tex.wall.map, roughnessMap: this.tex.wall.roughnessMap,
      roughness: 1, metalness: 0.06, envMapIntensity: 0.4,
    });
    applyPhotographicStone(colMat,'castle_wall_slates',[1,2]);
    const capMat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.65, metalness: 0.25, envMapIntensity: 0.7 });
    for (const x of [-6.4, 6.4]) {
      for (const z of [-5.2, -2.4, 0.4]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, WALL_TOP, 16), colMat);
        col.position.set(x, WALL_TOP / 2, z);
        col.castShadow = !this.lowPower;
        col.receiveShadow = !this.lowPower;
        this.scene.add(col);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.26, 1.15), capMat);
        base.position.set(x, 0.13, z);
        base.castShadow = !this.lowPower;
        this.scene.add(base);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 1.1), capMat);
        cap.position.set(x, WALL_TOP + 0.17, z);
        cap.castShadow = !this.lowPower;
        this.scene.add(cap);
      }
    }

    // 浮遊する蝋燭
    // 蝋燭。軸は InstancedMesh でまとめて1回で描き、炎だけ個別のスプライトにする。
    this.candles = [];
    const count = this.lowPower ? 10 : 18;
    const stickGeo = new THREE.CylinderGeometry(0.03, 0.034, 0.3, 6);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xece2cb, roughness: 0.85 });
    this.candleSticks = new THREE.InstancedMesh(stickGeo, stickMat, count);
    this.candleSticks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.candleSticks);
    const flameTex = glowSprite();
    const flameMat = new THREE.SpriteMaterial({
      map: flameTex, color: 0xffcf8a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.candleDummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const flame = new THREE.Sprite(flameMat);
      flame.scale.set(0.3, 0.38, 1);
      const y = 4.2 + Math.random() * 3.2;
      const x = (Math.random() - 0.5) * 16;
      const z = -6.8 + Math.random() * 5.0;
      flame.position.set(x, y, z);
      this.scene.add(flame);
      this.candles.push({ flame, x, z, baseY: y, phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.4 });
    }
  }

  #buildStars() {
    const n = this.lowPower ? 420 : 900;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - Math.random() * 0.95);
      const r = 44 * (0.86 + Math.random() * 0.14);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.8 + 5.5;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const warm = Math.random() < 0.16;
      const b = 0.55 + Math.random() * 0.45;
      col[i * 3] = b;
      col[i * 3 + 1] = (warm ? 0.9 : 0.97) * b;
      col[i * 3 + 2] = (warm ? 0.74 : 1) * b;
      size[i] = 0.5 + Math.random() * 0.9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: starSprite() } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 60.0 / max(0.001, -mv.z) * 14.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.02) discard;
          gl_FragColor = vec4(vColor * t.a, t.a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexColors: true, fog: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  /**
   * Accio の宝物が「奥から」飛んでくる元。
   * 供給源が見えないと、宝物がどこから来たのか分からない。
   */
  #buildTreasury() {
    const alcoveMat = new THREE.MeshStandardMaterial({ color: 0x222421, roughness: 0.95, metalness: 0.05 });
    const alcove = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.5), alcoveMat);
    alcove.position.set(-6.9, 1.3, -6.55);
    this.scene.add(alcove);

    // 中が金色に光る＝宝物がしまってある場所だと分かる
    const innerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSprite(), color: 0xffcf6a, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    innerGlow.scale.set(3.0, 3.0, 1);
    innerGlow.position.set(-6.9, 1.35, -6.3);
    this.scene.add(innerGlow);
    this.treasuryGlow = innerGlow;
    // 点光源は増やさず、棚の中を自発光させて「光っている場所」に見せる

    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x6b5526, roughness: 0.6, metalness: 0.55, envMapIntensity: 0.8, emissive: 0x3a2a08, emissiveIntensity: 0.1 });
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.22, metalness: 0.95, envMapIntensity: 1.6, emissive: 0x6a4a10, emissiveIntensity: 0.15 });
    for (let s = 0; s < 3; s += 1) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.42), shelfMat);
      shelf.position.set(-6.9, 0.5 + s * 0.78, -6.4);
      this.scene.add(shelf);
      for (let i = 0; i < 4; i += 1) {
        const item = new THREE.Mesh(
          i % 2 === 0 ? new THREE.IcosahedronGeometry(0.11, 0) : new THREE.TorusGeometry(0.09, 0.035, 8, 14),
          goldMat,
        );
        item.position.set(-7.8 + i * 0.6, 0.63 + s * 0.78, -6.4);
        item.rotation.set(Math.random(), Math.random(), Math.random());
        this.scene.add(item);
      }
    }
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.11, 10, 26, Math.PI),
      new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.7, metalness: 0.3 }),
    );
    arch.position.set(-6.9, 2.6, -6.35);
    this.scene.add(arch);
  }

  #buildProps() {
    const shadow = !this.lowPower;
    const goldMat = new THREE.MeshStandardMaterial({
      color: GOLD, roughness: 0.2, metalness: 0.96, envMapIntensity: 1.8,
      emissive: 0x5a3f0c, emissiveIntensity: 0.75,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      map: this.tex.wall.map, roughnessMap: this.tex.wall.roughnessMap,
      roughness: 1, metalness: 0.08, envMapIntensity: 0.5,
    });

    // --- 宝物置き場（Accio の着地点） ---
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.76, 0.62, 18), stoneMat);
    plinth.position.set(-2.45, 0.31, 0.35);
    plinth.castShadow = shadow;
    plinth.receiveShadow = shadow;
    this.scene.add(plinth);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.05, 10, 28), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(-2.45, 0.63, 0.35);
    rim.castShadow = shadow;
    this.scene.add(rim);

    const treasureGeos = [
      new THREE.IcosahedronGeometry(0.2, 0),
      new THREE.BoxGeometry(0.28, 0.21, 0.28),
      new THREE.TorusGeometry(0.16, 0.065, 10, 18),
      new THREE.OctahedronGeometry(0.19, 0),
    ];
    for (let i = 0; i < 10; i += 1) {
      const mesh = new THREE.Mesh(treasureGeos[i % 4], goldMat);
      const a = (i / 10) * Math.PI * 2;
      const r = 0.3 + (i % 3) * 0.1;
      mesh.position.set(-2.45 + Math.cos(a) * r, 0.72 + Math.floor(i / 5) * 0.26, 0.35 + Math.sin(a) * r * 0.8);
      mesh.castShadow = shadow;
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.treasures.push({ mesh, home: mesh.position.clone(), phase: Math.random() * Math.PI * 2 });
    }

    // --- 壊せる岩（Reducto） ---
    this.rockMeshes = [];
    const rockMat = new THREE.MeshStandardMaterial({
      map: this.tex.rock.map, roughnessMap: this.tex.rock.roughnessMap,
      roughness: 1, metalness: 0.04, flatShading: false, envMapIntensity: 0.5,
    });
    applyPhotographicStone(rockMat,'castle_wall_slates');
    const rockPos = [
      new THREE.Vector3(2.45, 0.5, -1.35),
      new THREE.Vector3(3.5, 0.4, -2.4),
      new THREE.Vector3(1.9, 0.34, -2.9),
    ];
    rockPos.forEach((p, i) => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 - i * 0.06, 3), rockMat);
      const verts=mesh.geometry.attributes.position;
      for(let v=0;v<verts.count;v++){const x=verts.getX(v),y=verts.getY(v),z=verts.getZ(v);const scale=1+.12*Math.sin(x*17+z*11)*Math.cos(y*13);verts.setXYZ(v,x*scale,y*scale*.85,z*scale);}
      mesh.geometry.computeVertexNormals();
      mesh.position.copy(p);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      mesh.userData.rockId = `rock-${i + 1}`;
      this.scene.add(mesh);
      this.rockMeshes.push(mesh);
    });
    const debrisGeo = new THREE.TetrahedronGeometry(0.14, 0);
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(debrisGeo, rockMat);
      mesh.castShadow = shadow;
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.debris.push({ mesh });
    }

    // --- ヘビ（Serpensortia / Vipera Evanesca） ---
    const bodyGeo = new THREE.SphereGeometry(0.095, 14, 10);
    const headGeo = new THREE.SphereGeometry(0.11, 16, 12);
    const snakeMat = new THREE.MeshStandardMaterial({ color: 0x484d32, roughness: 0.45, metalness: 0.2, envMapIntensity: 0.8 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x666449, roughness: 0.38, metalness: 0.25, envMapIntensity: 1 });
    for (let i = 0; i < 10; i += 1) {
      const group = new THREE.Group();
      const segs = [];
      for (let s = 0; s < 16; s += 1) {
        const seg = new THREE.Mesh(s === 0 ? headGeo : bodyGeo, s === 0 ? headMat : snakeMat);
        seg.scale.set(1-s*.045,.62*(1-s*.04),1.2);
        seg.castShadow = shadow;
        group.add(seg);
        segs.push(seg);
      }
      group.visible = false;
      this.scene.add(group);
      this.pools.snakes.push({ group, segs, phase: Math.random() * Math.PI * 2, home: new THREE.Vector3() });
    }

    // --- 桶とナメクジ（Slugulas Eructo） ---
    const woodMat = new THREE.MeshStandardMaterial({
      map: this.tex.wood.map, roughnessMap: this.tex.wood.roughnessMap,
      roughness: 1, metalness: 0.03, side: THREE.DoubleSide, envMapIntensity: 0.4,
    });
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.42, 18, 1, true), woodMat);
    bucket.position.set(2.55, 0.21, 0.15);
    bucket.castShadow = shadow;
    bucket.receiveShadow = shadow;
    this.scene.add(bucket);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), woodMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(2.55, 0.015, 0.15);
    this.scene.add(bottom);
    for (const y of [0.05, 0.36]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(y > 0.2 ? 0.5 : 0.41, 0.025, 8, 20), new THREE.MeshStandardMaterial({ color: 0x5a5a62, roughness: 0.5, metalness: 0.8 }));
      band.rotation.x = Math.PI / 2;
      band.position.set(2.55, y, 0.15);
      this.scene.add(band);
    }
    const slugGeo = new THREE.CapsuleGeometry(0.075, 0.1, 4, 8);
    const slugMat = new THREE.MeshStandardMaterial({ color: 0x72664e, roughness: 0.25, metalness: 0.1, envMapIntensity: 1.2 });
    for (let i = 0; i < 10; i += 1) {
      const mesh = new THREE.Mesh(slugGeo, slugMat);
      mesh.rotation.z = Math.PI / 2;
      const a = (i / 10) * Math.PI * 2;
      mesh.position.set(2.55 + Math.cos(a) * 0.22, 0.3 + Math.floor(i / 5) * 0.12, 0.15 + Math.sin(a) * 0.22);
      mesh.castShadow = shadow;
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.slugs.push({ mesh });
    }

    // --- 床に落ちた剣（Expelliarmus） ---
    const steelMat = new THREE.MeshStandardMaterial({
      map: this.tex.steel.map, roughnessMap: this.tex.steel.roughnessMap,
      roughness: 1, metalness: 0.92, envMapIntensity: 1.9, color: 0xdfe6f5,
    });
    this.steelMat = steelMat;
    for (let i = 0; i < 3; i += 1) {
      const g = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(.009, .023, .78, 10), new THREE.MeshStandardMaterial({color:0x553b29,roughness:.7}));
      blade.position.y = 0.39;
      blade.castShadow = shadow;
      g.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.04), goldMat);
      guard.castShadow = shadow;
      g.add(guard);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8 }));
      grip.position.y = -0.12;
      g.add(grip);
      g.rotation.set(Math.PI / 2, 0, 0.7 + i * 0.5);
      g.position.set(-1.2 - i * 0.45, 0.04, 0.5 + i * 0.3);
      g.visible = false;
      this.scene.add(g);
      this.pools.swords.push({ mesh: g });
    }

    // --- 盾（Protego）。盾本体の青は演出側の仕様で、発動の光とは別項目。 ---
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.85, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      // transmission は使わない。使うと毎フレーム場面をもう一度描き直すことになり、
      // 端末が重くなる。半透明＋環境の映り込みで十分それらしく見える。
      new THREE.MeshStandardMaterial({
        color: 0x5b8cff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        roughness: 0.12, metalness: 0.1, envMapIntensity: 1.8, depthWrite: false,
      }),
    );
    this.shield.position.set(0, .02, 2.4);
    this.scene.add(this.shield);
    this.shieldEdge = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.035, 10, 44),
      new THREE.MeshBasicMaterial({ color: 0xa6c5ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.shieldEdge.rotation.x = Math.PI / 2;
    this.shieldEdge.position.set(0, .04, 2.4);
    this.scene.add(this.shieldEdge);

    // --- 柔らかい着地点（Stupefy / Everte Statum） ---
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x5c3f86, roughness: 0.96, metalness: 0 });
    this.cushion = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.2, 22), cushionMat);
    this.cushion.position.set(0, 0.1, ARMOR_Z - 1.1);
    this.cushion.receiveShadow = shadow;
    this.cushion.visible = false;
    this.scene.add(this.cushion);
    const tuft = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.07, 8, 26), new THREE.MeshStandardMaterial({ color: 0x7a57ad, roughness: 0.95 }));
    tuft.rotation.x = Math.PI / 2;
    tuft.position.copy(this.cushion.position);
    tuft.position.y = 0.19;
    tuft.visible = false;
    this.scene.add(tuft);
    this.cushionTuft = tuft;
  }

  /**
   * 人に作用する8呪文の対象。大広間を見回る「動くよろい」。
   * Impedimenta が効いたことが見えるよう、左右にゆっくり歩かせる。
   */
  #buildArmor() { this.setEnemyVariant(this.enemyVariant); }

  setEnemyVariant(id) {
    const w = createDarkWizard(id);
    if(this.armor) disposeDarkWizard(this.armor);
    this.enemyVariant=w.root.userData.variantId;
    this.armor=w.root; this.armorHelmet=w.head; this.armorArms=w.arms; this.armorLegs=w.legs;
    this.heldSword=w.wand; this.dentMark=w.pain; this.laughMark=w.laugh;
    this.armor.position.z=ARMOR_Z; this.scene.add(this.armor);
  }

  /** 空気中の塵。光の中を漂うと、空間に奥行きが出る。 */
  #buildDust() {
    const n = this.lowPower ? 35 : 80;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    this.dustSeed = [];
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = 0.2 + Math.random() * 4.2;
      pos[i * 3 + 2] = -6 + Math.random() * 9;
      size[i] = 0.018 + Math.random() * 0.025;
      this.dustSeed.push({ phase: Math.random() * Math.PI * 2, speed: 0.1 + Math.random() * 0.22, baseY: pos[i * 3 + 1] });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    this.dust = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: starSprite() } },
      vertexShader: `
        attribute float size;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 170.0 / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.02) discard;
          gl_FragColor = vec4(vec3(0.75, 0.78, 0.95) * t.a * 0.5, t.a * 0.5);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // ---------------------------------------------------------------- 公開API

  targetFor(spellId) {
    if (spellId === 'accio') return new THREE.Vector3(-6.9,1.35,-6.3);
    if (spellId === 'protego') return new THREE.Vector3(0,1.3,2.4);
    if (spellId === 'reducto') return this.rockMeshes.find(m=>m.visible)?.position.clone() || TARGET_POINTS.reducto.clone();
    if (spellId === 'vipera_evanesca') return this.pools.snakes.find(s=>s.group.visible)?.home.clone() || TARGET_POINTS.serpensortia.clone();
    if (['stupefy','rennervate','episkey','expelliarmus','rictusempra','slugulas_eructo','impedimenta','everte_statum'].includes(spellId)) {
      return this.armor.position.clone().add(new THREE.Vector3(0, this.world?.armor.standing ? 1.65 : .35, 0));
    }
    return (TARGET_POINTS[spellId] || TARGET_POINTS.default).clone();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth || this.canvas.clientWidth || 640);
    const h = Math.max(1, parent?.clientHeight || this.canvas.clientHeight || 360);
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);

    const aspect = w / h;
    this.camera.aspect = aspect;
    if (aspect < BASE_ASPECT) {
      const halfWidth = Math.tan((BASE_FOV_DEG * Math.PI) / 360) * BASE_ASPECT;
      this.camera.fov = Math.min(MAX_FOV_DEG, (2 * Math.atan(halfWidth / aspect) * 180) / Math.PI);
    } else {
      this.camera.fov = BASE_FOV_DEG;
    }
    this.camera.updateProjectionMatrix();
    this.cinema?.resize(aspect);
  }

  setLowPower(lowPower) {
    this.lowPower = lowPower;
    this.maxPixelRatio = lowPower ? 1.25 : 2;
    this.renderer.shadowMap.enabled = !lowPower;
    this.effects.setLowPower(lowPower);
    this.resize();
  }

  setWorld(world) {
    this.focus.restore();
    if(this.focus.active?.id==='vipera_evanesca')this.pools.snakes.forEach((s,i)=>{
      if(s.group.visible && i>=world.snakes.length){
        const mesh=s.group.clone(true);mesh.position.copy(s.home);mesh.visible=true;
        mesh.traverse(o=>{if(o.material){o.material=o.material.clone();o.material.transparent=true;}});
        this.scene.add(mesh);this.vanishGhosts.push({mesh,born:performance.now()});
      }
    });
    this.world = world;

    this.pools.treasures.forEach((t, i) => { t.mesh.visible = i < world.treasures.length; t.bornAt=world.treasures[i]?.bornAt; });
    this.pools.slugs.forEach((s, i) => { s.mesh.visible = i < world.slugs.length; s.bornAt=world.slugs[i]?.bornAt; if(!s.home)s.home=s.mesh.position.clone(); });
    this.pools.swords.forEach((s, i) => { const was=s.mesh.visible; s.mesh.visible=i<world.droppedSwords.length;
      if(!s.home)s.home=s.mesh.position.clone();
      if(s.mesh.visible&&!was){s.bornAt=Date.now();s.from=this.armor.position.clone().add(new THREE.Vector3(.5,1.2,0));} });

    this.pools.snakes.forEach((s, i) => {
      const active = i < world.snakes.length;
      s.group.visible = active;
      if (active) {
        const seed = world.snakes[i].seed ?? i / 10;
        const angle = seed * Math.PI * 2;
        const radius = 0.75 + (seed % 0.5) * 1.6;
        s.home.set(1.5 + Math.cos(angle) * radius * 0.95, 0.12, -0.2 + Math.sin(angle) * radius * 0.55);
        s.phase = seed * Math.PI * 2;
      }
    });

    this.rockMeshes.forEach((mesh, i) => { mesh.visible = !world.rocks[i]?.broken; });
    this.pools.debris.forEach((d, i) => {
      const active = i < world.debris.length;
      d.mesh.visible = active;
      if (active && !d.placed) {
        const item = world.debris[i];
        const src = this.rockMeshes.find((m) => m.userData.rockId === item.from) || this.rockMeshes[i % this.rockMeshes.length];
        const base = src ? src.position : new THREE.Vector3(2.45, 0.2, -1.35);
        const seed = item.seed ?? Math.random();
        d.mesh.position.set(base.x + (seed - 0.5) * 1.8, 0.12, base.z + ((seed * 7) % 1 - 0.5) * 1.6);
        d.mesh.rotation.set(seed * 6, seed * 3, seed * 9);
        d.placed = true;
      }
      if (!active) d.placed = false;
    });

    const on = world.shield.active;
    this.shieldTargetOpacity = on ? Math.min(0.5, 0.22 + world.shield.level * 0.055) : 0;
    this.shieldTargetScale = on ? Math.min(1.16, 1 + world.shield.level * 0.03) : 1;

    this.heldSword.visible = world.armor.holdsSword;
    this.dentMark.visible = world.armor.dented;
    this.laughMark.visible = world.armor.tickling;
    this.cushion.visible = false;
    this.cushionTuft.visible = false;
  }

  // --- 演出の入口（app.js から呼ぶ） ---

  /** @returns {{swingMs:number, impactMs:number, totalMs:number}} */
  castSpellEffect(spellId, hexColor, options) {
    this.focus.cancel();
    this.clearVanishGhosts();
    if(spellId==='rennervate')this.collapse=1;
    if(['stupefy','everte_statum','rictusempra','impedimenta','expelliarmus','slugulas_eructo','episkey'].includes(spellId))this.collapse=0;
    const anchor=this.focusAnchor(spellId);
    const timing=this.focus.start(spellId,anchor);
    const target=SPELL_STORIES[spellId]?.subject==='world'?this.targetFor(spellId):this.focus.target();
    this.effects.cast(spellId,hexColor,target,{...options,immediate:true,flyMs:timing.impactMs,readable:true});
    return {...timing,swingMs:0};
  }

  focusAnchor(id) {
    const subject=SPELL_STORIES[id]?.subject;
    if(subject==='person')return this.armor.position.clone();
    if(subject==='rock')return (this.rockMeshes.find(m=>m.visible)||this.rockMeshes[0]).position.clone();
    if(subject==='snake')return (this.pools.snakes.find(s=>s.group.visible)||this.pools.snakes[0]).home.clone();
    if(subject==='treasure')return this.pools.treasures[0].home.clone();
    return new THREE.Vector3(0,0,2.4);
  }
  focusNodes() {
    const id=this.focus.active?.id,subject=SPELL_STORIES[id]?.subject;
    if(subject==='person')return [this.armor,...this.pools.swords.map(x=>x.mesh),...(id==='slugulas_eructo'?this.pools.slugs.map(x=>x.mesh):[])];
    if(subject==='rock')return [...this.rockMeshes,...this.pools.debris.map(x=>x.mesh)];
    if(subject==='snake')return [...this.pools.snakes.map(x=>x.group),...this.vanishGhosts.map(x=>x.mesh)];
    if(subject==='treasure')return this.pools.treasures.map(x=>x.mesh);
    if(subject==='shield')return [this.shield,this.shieldEdge];
    if(subject==='world')return [this.armor,this.shield,this.shieldEdge,...this.rockMeshes,...Object.values(this.pools).flat().map(x=>x.mesh||x.group)];
    return [];
  }
  clearVanishGhosts() {for(const g of this.vanishGhosts){g.mesh.removeFromParent();g.mesh.traverse(o=>o.material?.dispose());}this.vanishGhosts=[];}
  cancelEffects() { this.focus.cancel(); this.clearVanishGhosts(); this.effects.cancel(); }
  setOrigin(x) { this.effects.originX = x; }
  charge(ms) { this.effects.charge(ms); }
  fizzle() { this.effects.fizzle(); }
  gentle(hexColor, spellId) { this.effects.gentle(hexColor, this.targetFor(spellId)); }
  preview(hexColor) { this.effects.preview(hexColor); }

  // ---------------------------------------------------------------- 毎フレーム

  render(nowMs = performance.now()) {
    this.focus.restore();
    const t = nowMs / 1000;
    const dt = Math.min(0.05, this.clock.getDelta());

    for (const b of this.braziers) {
      const f = Math.sin(t * 1.9 + b.phase) * 0.5 + Math.sin(t * 3.3 + b.phase) * 0.25;
      b.light.intensity = 25 + f * 4.5;
      b.flame.position.y = b.baseY + f * 0.03;
      b.flame.scale.set(0.95 + f * 0.07, 1.2 + f * 0.12, 1);
    }
    for (let i = 0; i < this.candles.length; i += 1) {
      const c = this.candles[i];
      const y = c.baseY + Math.sin(t * c.speed + c.phase) * 0.16;
      c.flame.position.y = y;
      this.candleDummy.position.set(c.x, y - 0.2, c.z);
      this.candleDummy.updateMatrix();
      this.candleSticks.setMatrixAt(i, this.candleDummy.matrix);
    }
    this.candleSticks.instanceMatrix.needsUpdate = true;
    if (this.treasuryGlow) {
      this.treasuryGlow.material.opacity = 0.42 + Math.sin(t * 0.9) * 0.08;
    }

    // 塵がゆっくり漂う
    if (this.dust) {
      const arr = this.dust.geometry.attributes.position.array;
      for (let i = 0; i < this.dustSeed.length; i += 1) {
        const s = this.dustSeed[i];
        arr[i * 3 + 1] = s.baseY + Math.sin(t * s.speed + s.phase) * 0.5;
        arr[i * 3] += Math.sin(t * 0.17 + s.phase) * dt * 0.1;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }

    this.pools.treasures.forEach((item, i) => {
      if (!item.mesh.visible) return;
      item.mesh.rotation.y = t * 0.55 + i;
      item.mesh.rotation.x = Math.sin(t * 0.4 + i) * 0.2;
      const progress=Math.min(1, Math.max(0,(Date.now()-(item.bornAt||0))/1500));
      item.mesh.position.copy(new THREE.Vector3(-6.9,1.35,-6.3).lerp(item.home,progress));
      item.mesh.position.y += Math.sin(progress*Math.PI)*2 + Math.sin(t*1.2+item.phase)*.045;
    });

    const speed = this.world ? this.world.armor.speedFactor : 1;
    this.pools.snakes.forEach((s) => {
      if (!s.group.visible) return;
      s.group.position.copy(s.home);
      s.group.rotation.y = Math.sin(t * 1.0 * speed + s.phase) * 1.0;
      s.segs.forEach((seg, k) => {
        const wave = Math.sin(t * 4.2 * speed + s.phase - k * 0.28);
        seg.position.set(wave * 0.13, 0.07 - k * 0.002, -k * 0.09);
        seg.rotation.y = wave * 0.3;
      });
    });

    this.pools.slugs.forEach((s, i) => {
      if (!s.mesh.visible) return;
      s.mesh.rotation.y = Math.sin(t * 1.3 + i) * 0.5;
      const progress=Math.min(1,Math.max(0,(Date.now()-(s.bornAt||0))/950));
      s.mesh.position.copy(this.armor.position.clone().add(new THREE.Vector3(0,2.1,.2)).lerp(s.home,progress));
      s.mesh.position.y+=Math.sin(progress*Math.PI)*.6;
    });

    this.pools.swords.forEach(s=>{if(!s.mesh.visible)return;const progress=Math.min(1,(Date.now()-(s.bornAt||0))/1100);s.mesh.position.copy((s.from||s.home).clone().lerp(s.home,progress));s.mesh.position.y+=Math.sin(progress*Math.PI)*1.8;s.mesh.rotation.z=.7+progress*6;});
    if (this.shieldTargetOpacity !== undefined) {
      const breathe = 1 + Math.sin(t * 1.3) * 0.018;
      const m = this.shield.material;
      m.opacity += (this.shieldTargetOpacity - m.opacity) * Math.min(1, dt * 5);
      this.shieldEdge.material.opacity = m.opacity * 1.5;
      const sc = (this.shieldTargetScale ?? 1) * breathe;
      this.shield.scale.setScalar(sc);
      this.shieldEdge.scale.setScalar(sc);
    }

    this.#updateArmor(t, dt);
    if(this.armor.userData.clothMeshes)for(const m of this.armor.userData.clothMeshes){
      const base=m.userData.rest,p=m.geometry.attributes.position;
      for(let i=0;i<p.count;i++){const y=base[i*3+1];const weight=Math.max(0,1-y/1.4);p.setZ(i,base[i*3+2]+Math.sin(t*1.1+y*2+base[i*3]*3)*.012*weight);}
      p.needsUpdate=true;
    }
    this.vanishGhosts=this.vanishGhosts.filter(g=>{
      const k=Math.max(0,1-(nowMs-g.born)/800);
      if(!k){g.mesh.removeFromParent();g.mesh.traverse(o=>o.material?.dispose());return false;}
      g.mesh.scale.setScalar(k);g.mesh.position.y+=dt*.3;
      g.mesh.traverse(o=>{if(o.material)o.material.opacity=k;});return true;
    });
    this.focus.update(nowMs,this.focusNodes());
    this.effects.update(nowMs, dt);
    this.cinema.update(this.armor,this.effects,this.collapse);

    try {
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      this.renderError = err?.message || String(err);
    }
  }

  #updateArmor(t, dt) {
    if (!this.world) return;
    const ar = this.world.armor;

    const wantCollapse = ar.standing ? 0 : 1;
    this.collapse += (wantCollapse - this.collapse) * Math.min(1, dt * 5);
    const c = this.collapse;

    // 見回り。Impedimenta で speedFactor が下がると、歩きも揺れも遅くなる。
    if (ar.standing) this.patrolPhase += dt * 0.55 * ar.speedFactor;
    const walk = Math.sin(this.patrolPhase);
    const step = Math.sin(this.patrolPhase * 4);
    const rattle = ar.tickling ? Math.sin(t * 12) * 0.16 : 0;

    this.armor.position.x = (1 - c) * walk * PATROL_X + rattle * 1.8;
    this.armor.position.z += (ARMOR_Z + ar.offsetZ - this.armor.position.z) * Math.min(1, dt * 5);
    this.armor.position.y = -c * 0.16 + (1 - c) * Math.abs(step) * 0.009;
    this.armor.rotation.x = -c * (Math.PI / 2.25) + (ar.tickling ? .16 : (ar.dented && ar.standing ? .14 : 0));
    this.armor.rotation.y = (1 - c) * walk * 0.22;
    this.armor.rotation.z = (1 - c) * (step * 0.012 + rattle);

    // 歩幅
    this.armorLegs.forEach((leg, i) => {
      const s = Math.sin(this.patrolPhase * 4 + (i === 0 ? 0 : Math.PI));
      leg.rotation.x = (1 - c) * s * 0.18 - c * 0.5;
      leg.position.z = (1 - c) * s * 0.07;
    });

    // 兜がごろんと外れる
    this.armorHelmet.position.set(0, 1.73, 0);
    this.armorHelmet.rotation.set(ar.tickling ? .12 : 0, Math.sin(t*.7)*.08, 0);

    for (const [side, group] of [[-1, this.armorArms.left], [1, this.armorArms.right]]) {
      const swing = (1 - c) * Math.sin(this.patrolPhase * 4 + (side > 0 ? Math.PI : 0)) * 0.26;
      group.rotation.x = ar.tickling ? -.9 + rattle : (ar.dented && side < 0 ? -.75 : -.1 + swing - c*.55);
      group.rotation.z = side * (0.24 + c * 0.55);
    }

    if (this.laughMark.visible) {
      this.laughMark.children.forEach((n, i) => {
        n.position.y = 1.9 + i * 0.15 + Math.sin(t * 3.2 + i) * 0.07;
        n.material.opacity = 0.65 + Math.sin(t * 4 + i) * 0.3;
      });
    }
  }

  dispose() {
    this.focus.cancel();
    this.clearVanishGhosts();
    disposeDarkWizard(this.armor);
    this.cinema?.dispose();
    if (this.envRT) this.envRT.dispose();
    this.effects.dispose();
    this.renderer.dispose();
  }
}

export { TARGET_POINTS, ARMOR_Z };
