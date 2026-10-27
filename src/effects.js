/**
 * 呪文の演出。
 *
 * 【考えかた】
 * 子どもはテレビの前で、自分の手で杖を振る。だから画面の中の魔法も
 * 「いま自分が振った杖から出た」ように見えないといけない。
 * そこで、どの呪文も必ず次の順で動かす。
 *
 *   1) 振り（swing）  手前を横切る光の軌跡。子どもの杖の動きに重ねる想定。
 *   2) 溜め（gather） 軌跡の終点に光が集まる。
 *   3) 飛翔（launch） そこから対象へ飛ぶ。
 *   4) 着弾（burst）  対象で弾けて、粒が散り、床に輪が広がる。
 *
 * 呪文ごとに振りの形を変える（叩きつける／丸く囲う／横に薙ぐ／跳ね上げる）。
 * 同じ呪文でも左右の向きを毎回変えるので、振るたびに少し違って見える。
 *
 * 全画面を白く飛ばさない、点滅させない、という要件は守る。
 * 光は手前の軌跡・対象・床の輪に限定し、立ち上がりと減衰はなだらかにする。
 */

import * as THREE from '../vendor/three.module.min.js';
import { glowSprite } from './textures.js';

/** 粒の最大数。端末が重くならない範囲で、画面が賑やかに見える量。 */
const MAX_PARTICLES = 1600;

/**
 * 呪文ごとの「振り」。
 * kind は軌跡の形、speed は振りの速さ、hue は添える色のずらし幅（度）。
 * 2色めを混ぜることで、1色だけの地味な光にならないようにする。
 */
export const SWINGS = {
  accio:             { kind: 'pull',    swingMs: 420, hue: 28,  particles: 1.0, label: '手前へ引き寄せる' },
  stupefy:           { kind: 'slash',   swingMs: 300, hue: -24, particles: 1.3, label: '叩きつける' },
  reducto:           { kind: 'slash',   swingMs: 280, hue: 18,  particles: 1.6, label: '叩きつける' },
  protego:           { kind: 'circle',  swingMs: 520, hue: 34,  particles: 0.9, label: '丸く囲う' },
  rennervate:        { kind: 'lift',    swingMs: 480, hue: 40,  particles: 0.9, label: '跳ね上げる' },
  episkey:           { kind: 'lift',    swingMs: 520, hue: 30,  particles: 0.8, label: 'すくい上げる' },
  expelliarmus:      { kind: 'flick',   swingMs: 260, hue: -30, particles: 1.2, label: '弾き上げる' },
  rictusempra:       { kind: 'zigzag',  swingMs: 420, hue: 46,  particles: 1.1, label: 'くねらせる' },
  serpensortia:      { kind: 'scurve',  swingMs: 460, hue: -38, particles: 1.0, label: 'S字に薙ぐ' },
  slugulas_eructo:   { kind: 'scurve',  swingMs: 440, hue: 30,  particles: 1.0, label: 'S字に薙ぐ' },
  impedimenta:       { kind: 'press',   swingMs: 560, hue: 26,  particles: 0.8, label: '押さえつける' },
  vipera_evanesca:   { kind: 'sweep',   swingMs: 380, hue: 24,  particles: 1.0, label: '横に薙ぐ' },
  finite_incantatem: { kind: 'sweep',   swingMs: 600, hue: 50,  particles: 1.4, label: '大きく薙ぐ' },
  everte_statum:     { kind: 'slash',   swingMs: 300, hue: -20, particles: 1.3, label: '突き飛ばす' },
};

const DEFAULT_SWING = { kind: 'slash', swingMs: 340, hue: 24, particles: 1.0, label: '振る' };

/** 手前の板。ここに軌跡を描く＝子どもの杖が通る面。 */
const SWING_PLANE_Z = 3.1;
const SWING_W = 3.4;
const SWING_H = 1.9;
const SWING_Y = 1.45;

/** 振りの形ごとの通り道。t=0→1 で、手前の面の上を動く。 */
function swingPath(kind, t, dir) {
  const d = dir; // +1 / -1 で左右を反転する
  switch (kind) {
    case 'slash': // 斜めに叩きつける
      return [d * (0.95 - t * 1.9), 0.95 - t * 1.9];
    case 'sweep': // 水平に薙ぐ
      return [d * (-1 + t * 2), Math.sin(t * Math.PI) * 0.22];
    case 'circle': { // ぐるりと囲う
      const a = t * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(a) * 0.85 * d, Math.sin(a) * 0.85];
    }
    case 'lift': // 下からすくい上げる
      return [d * (-0.7 + t * 1.4), -0.95 + t * 1.9];
    case 'flick': { // 小さく溜めて跳ね上げる
      const p = t < 0.45 ? -t * 0.8 : -0.36 + (t - 0.45) * 2.6;
      return [d * (-0.5 + t * 1.0), p];
    }
    case 'zigzag': { // くすぐる
      return [d * (-0.95 + t * 1.9), Math.sin(t * Math.PI * 3.4) * 0.6];
    }
    case 'scurve': { // S字
      return [d * Math.sin(t * Math.PI * 1.6) * 0.95, -0.9 + t * 1.8];
    }
    case 'press': // 上から押さえる
      return [d * (-0.35 + t * 0.7), 1.0 - t * 1.75];
    case 'pull': // 奥から手前へ引く（Accio）
      return [d * (-0.8 + t * 1.6) * (1 - t * 0.4), 0.55 - t * 1.0];
    default:
      return [d * (-1 + t * 2), 0];
  }
}

/** 色をHSLでずらして2色めを作る。1色だけだと平板に見える。 */
function shiftHue(color, degrees) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const out = new THREE.Color();
  out.setHSL((hsl.h + degrees / 360 + 1) % 1, Math.min(1, hsl.s * 1.15 + 0.12), Math.min(0.92, hsl.l * 1.05 + 0.06));
  return out;
}

export class SpellEffects {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(scene, camera, { lowPower = false } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.lowPower = lowPower;
    this.sprite = glowSprite();
    this.active = [];

    this.#buildParticles();
    this.#buildTrail();
    this.#buildOrbs();
    this.#buildRing();

    // 対象を照らす明かり。色が周りの石や金属に乗ることで「光った」と分かる。
    this.light = new THREE.PointLight(0xffffff, 0, 16, 2);
    this.light.position.set(0, 1.4, 1.5);
    scene.add(this.light);
    // 手前（子どもの側）からの照り返し
    this.nearLight = new THREE.PointLight(0xffffff, 0, 10, 2);
    this.nearLight.position.set(0, SWING_Y, SWING_PLANE_Z);
    scene.add(this.nearLight);
  }

  // ------------------------------------------------------------ 作る

  #buildParticles() {
    this.maxParticles = this.lowPower ? 600 : MAX_PARTICLES;
    const n = this.maxParticles;
    this.p = {
      pos: new Float32Array(n * 3),
      vel: new Float32Array(n * 3),
      col: new Float32Array(n * 3),
      size: new Float32Array(n),
      baseSize: new Float32Array(n),
      life: new Float32Array(n),
      maxLife: new Float32Array(n),
      drag: new Float32Array(n),
      gravity: new Float32Array(n),
      next: 0,
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.p.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.p.size, 1).setUsage(THREE.DynamicDrawUsage));

    // 粒ごとに大きさを変えたいので、PointsMaterial ではなく小さな自前シェーダを使う
    this.particleMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.sprite }, uScale: { value: 1 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 900.0 / max(0.001, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor * t.a, t.a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.particles = new THREE.Points(geo, this.particleMat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  #buildTrail() {
    // 振りの軌跡。帯状のリボンで、手前の面の上を走る。
    this.trailSegments = this.lowPower ? 22 : 40;
    const n = this.trailSegments;
    const positions = new Float32Array(n * 2 * 3);
    const alphas = new Float32Array(n * 2);
    const sides = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) { sides[i * 2] = -1; sides[i * 2 + 1] = 1; }
    const indices = [];
    for (let i = 0; i < n - 1; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    geo.setIndex(indices);
    this.trailMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0 } },
      vertexShader: `
        attribute float aAlpha;
        attribute float aSide;
        varying float vAlpha;
        varying float vSide;
        void main() {
          vAlpha = aAlpha;
          vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlpha;
        varying float vSide;
        void main() {
          // 帯の中心を明るく、縁をぼかす。これで「板」ではなく「光の筋」に見える。
          float edge = 1.0 - abs(vSide);
          float core = pow(edge, 1.8);
          float a = vAlpha * uOpacity * core;
          if (a < 0.004) discard;
          vec3 c = mix(uColor, vec3(1.0), pow(edge, 4.0) * 0.75);
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.trail = new THREE.Mesh(geo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.scene.add(this.trail);
    this.trailPoints = new Array(n).fill(null).map(() => new THREE.Vector3());
  }

  #buildOrbs() {
    const mk = (size) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.sprite, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      m.scale.setScalar(size);
      this.scene.add(m);
      return m;
    };
    this.gatherOrb = mk(1.3);  // 軌跡の終点に集まる光
    this.boltOrb = mk(1.6);    // 対象へ飛ぶ光
    this.burstOrb = mk(2.6);   // 着弾の光
  }

  #buildRing() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.scene.add(this.ring);

    // 縦の衝撃波。床だけだと「下で何か起きた」で終わるので、立ち上がりも出す。
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.BackSide,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
    );
    this.scene.add(this.dome);
  }

  // ------------------------------------------------------------ 粒を出す

  #spawn(origin, {
    count, color, color2, speed = 2.4, spread = 1, size = 0.1, life = 0.9,
    gravity = -1.4, drag = 1.6, dir = null, cone = Math.PI,
  }) {
    const p = this.p;
    for (let i = 0; i < count; i += 1) {
      const idx = p.next;
      p.next = (p.next + 1) % this.maxParticles;

      let vx; let vy; let vz;
      if (dir) {
        // 指定方向へ円錐状に飛ばす
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * Math.tan(cone / 2);
        const perp1 = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
        const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
        const v = dir.clone()
          .addScaledVector(perp1, Math.cos(a) * r)
          .addScaledVector(perp2, Math.sin(a) * r)
          .normalize()
          .multiplyScalar(speed * (0.45 + Math.random() * 0.9));
        vx = v.x; vy = v.y; vz = v.z;
      } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const s = speed * (0.3 + Math.random() * 1.0);
        vx = Math.sin(phi) * Math.cos(theta) * s * spread;
        vy = Math.cos(phi) * s * spread;
        vz = Math.sin(phi) * Math.sin(theta) * s * spread;
      }

      p.pos[idx * 3] = origin.x + (Math.random() - 0.5) * 0.12;
      p.pos[idx * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.12;
      p.pos[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.12;
      p.vel[idx * 3] = vx;
      p.vel[idx * 3 + 1] = vy;
      p.vel[idx * 3 + 2] = vz;

      const c = Math.random() < 0.34 ? color2 : color;
      const bright = 0.75 + Math.random() * 0.6;
      p.col[idx * 3] = c.r * bright;
      p.col[idx * 3 + 1] = c.g * bright;
      p.col[idx * 3 + 2] = c.b * bright;

      p.baseSize[idx] = size * (0.55 + Math.random() * 0.95);
      p.size[idx] = p.baseSize[idx];
      p.maxLife[idx] = life * (0.6 + Math.random() * 0.8);
      p.life[idx] = p.maxLife[idx];
      p.drag[idx] = drag;
      p.gravity[idx] = gravity;
    }
  }

  // ------------------------------------------------------------ 公開API

  /**
   * 呪文を1回ぶん演出する。
   * @param {string} spellId
   * @param {string} hexColor 保護者が設定した発光色
   * @param {THREE.Vector3} target 対象の位置
   * @param {{strength?:number}} options
   * @returns {{swingMs:number, impactMs:number, totalMs:number}} 時間の目安（音と状態変更の同期に使う）
   */
  cast(spellId, hexColor, target, options = {}) {
    this.particles.visible=true;
    const cfg = SWINGS[spellId] || DEFAULT_SWING;
    const color = new THREE.Color(hexColor);
    const color2 = shiftHue(color, cfg.hue);
    const strength = options.strength ?? 1;
    const dir = 1;

    const swingMs = options.immediate ? 0 : Math.min(180, cfg.swingMs);
    const flyMs = 300;
    const burstMs = 1100;

    this.active.push({
      spellId, cfg, color, color2, dir, strength,
      start: performance.now(),
      swingMs, flyMs, burstMs,
      target: target.clone(),
      phase: 'swing',
      lastTrailT: 0,
      burstDone: false,
    });

    return { swingMs, impactMs: swingMs + flyMs, totalMs: swingMs + flyMs + burstMs };
  }

  /** 認識できなかったときの、小さくしぼむ光。驚かせない。 */
  fizzle() {
    const pale = new THREE.Color(0x9aa2c4);
    const origin = new THREE.Vector3(0, SWING_Y - 0.25, SWING_PLANE_Z);
    this.#spawn(origin, {
      count: this.lowPower ? 14 : 26, color: pale, color2: pale,
      speed: 0.7, size: 0.07, life: 0.55, gravity: -1.9, drag: 3.2,
    });
    this.active.push({
      spellId: null, cfg: DEFAULT_SWING, color: pale, color2: pale, dir: 1, strength: 0.25,
      start: performance.now(), swingMs: 0, flyMs: 0, burstMs: 520,
      target: origin.clone(), phase: 'fizzle', lastTrailT: 1, burstDone: true,
    });
  }

  /** 正しく唱えたが対象がないときの、穏やかな光。 */
  gentle(hexColor, target) {
    const color = new THREE.Color(hexColor);
    const color2 = shiftHue(color, 26);
    this.#spawn(target, {
      count: this.lowPower ? 20 : 42, color, color2,
      speed: 0.9, size: 0.09, life: 1.1, gravity: 0.25, drag: 2.2,
    });
    this.active.push({
      spellId: null, cfg: DEFAULT_SWING, color, color2, dir: 1, strength: 0.45,
      start: performance.now(), swingMs: 0, flyMs: 0, burstMs: 760,
      target: target.clone(), phase: 'gentle', lastTrailT: 1, burstDone: true,
    });
  }

  /** 設定画面のプレビュー。手前で短く光らせるだけで、世界は変えない。 */
  preview(hexColor) {
    const color = new THREE.Color(hexColor);
    const color2 = shiftHue(color, 30);
    const origin = new THREE.Vector3(0, SWING_Y, SWING_PLANE_Z);
    this.#spawn(origin, {
      count: this.lowPower ? 26 : 56, color, color2,
      speed: 1.5, size: 0.1, life: 0.9, gravity: -0.5, drag: 2.0,
    });
    this.active.push({
      spellId: null, cfg: DEFAULT_SWING, color, color2, dir: 1, strength: 0.6,
      start: performance.now(), swingMs: 0, flyMs: 0, burstMs: 820,
      target: origin.clone(), phase: 'preview', lastTrailT: 1, burstDone: true,
    });
  }

  /** 発動待ち時間の「ためる」。まだ呪文の色は出さない（要件の順番を守る）。 */
  charge(durationMs) {
    this.chargeStart = performance.now();
    this.chargeUntil = this.chargeStart + durationMs;
  }

  cancelCharge() {
    this.chargeUntil = 0;
  }

  setLowPower(lowPower) {
    this.lowPower = lowPower;
  }

  // ------------------------------------------------------------ 毎フレーム

  update(nowMs, dt) {
    this.#updateParticles(dt);
    this.#updateCharge(nowMs, dt);
    this.#updateActive(nowMs, dt);
  }

  #updateParticles(dt) {
    const p = this.p;
    const pos = p.pos;
    const vel = p.vel;
    const n = this.maxParticles;
    for (let i = 0; i < n; i += 1) {
      if (p.life[i] <= 0) {
        p.size[i] = 0;
        continue;
      }
      p.life[i] -= dt;
      if (p.life[i] <= 0) {
        p.size[i] = 0;
        continue;
      }
      const i3 = i * 3;
      vel[i3 + 1] += p.gravity[i] * dt;
      const d = Math.max(0, 1 - p.drag[i] * dt);
      vel[i3] *= d; vel[i3 + 1] *= d; vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      // 床で跳ねる
      if (pos[i3 + 1] < 0.02) {
        pos[i3 + 1] = 0.02;
        vel[i3 + 1] = Math.abs(vel[i3 + 1]) * 0.28;
      }
      // 寿命に応じて細くなる。
      // 元の大きさは baseSize に残しておき、毎フレームそこから計算し直す。
      // （size を直接縮めると縮小が累積して、すぐ見えなくなってしまう）
      const k = p.life[i] / p.maxLife[i];
      const fade = Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5); // 出た瞬間から明るく、終わりでなだらかに消える
      p.size[i] = p.baseSize[i] * (0.25 + fade * 0.95);
    }
    const g = this.particles.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }

  #updateCharge(nowMs, dt) {
    if (!this.chargeUntil || nowMs > this.chargeUntil) {
      this.gatherOrb.material.opacity *= 0.88;
      if (this.gatherOrb.material.opacity < 0.01) this.gatherOrb.material.opacity = 0;
      return;
    }
    const total = Math.max(1, this.chargeUntil - this.chargeStart);
    const t = Math.min(1, (nowMs - this.chargeStart) / total);
    // 中立色。まだ呪文の色は出さない。
    this.gatherOrb.material.color.setRGB(0.95, 0.93, 0.85);
    this.gatherOrb.position.set(0, SWING_Y - 0.1, SWING_PLANE_Z);
    this.gatherOrb.material.opacity = 0.12 + t * 0.3;
    this.gatherOrb.scale.setScalar(0.35 + t * 0.5);
    if (Math.random() < dt * 26 * t) {
      const pale = new THREE.Color(0xf2f0e4);
      this.#spawn(this.gatherOrb.position, {
        count: 1, color: pale, color2: pale,
        speed: 0.5, size: 0.05, life: 0.5, gravity: 0.4, drag: 2.4,
      });
    }
  }

  #updateActive(nowMs, dt) {
    let lightI = 0;
    let nearI = 0;
    let lightColor = null;
    let boltOp = 0;
    let burstOp = 0;
    let ringOp = 0;
    let domeOp = 0;
    let trailOp = 0;

    this.active = this.active.filter((fx) => {
      const el = nowMs - fx.start;
      const total = fx.swingMs + fx.flyMs + fx.burstMs;
      if (el > total) return false;

      // --- 1) 振り ---
      if (el < fx.swingMs) {
        const t = el / fx.swingMs;
        const eased = t * t * (3 - 2 * t);
        const [sx, sy] = swingPath(fx.cfg.kind, eased, fx.dir);
        const point = new THREE.Vector3((this.originX || 0) + sx * .4 * t, -.2 + t*.65, SWING_PLANE_Z);
        this.#pushTrail(point, t === 0);
        trailOp = Math.max(trailOp, Math.min(1, t * 4) * 0.95 * fx.strength);
        this.trailMat.uniforms.uColor.value.copy(fx.color);

        // 軌跡から粒が散る
        const rate = (this.lowPower ? 150 : 330) * fx.cfg.particles * fx.strength;
        const count = Math.max(2, Math.round(rate * dt));
        this.#spawn(point, {
          count, color: fx.color, color2: fx.color2,
          speed: 2.0, size: 0.14, life: 0.7, gravity: -1.1, drag: 2.3, spread: 0.55,
        });
        nearI = Math.max(nearI, 4.5 * fx.strength);
        lightColor = fx.color;
        this.gatherOrb.position.copy(point);
        this.gatherOrb.material.color.copy(fx.color);
        this.gatherOrb.material.opacity = Math.max(this.gatherOrb.material.opacity, 0.35 + t * 0.45);
        this.gatherOrb.scale.setScalar(0.4 + t * 0.55);
        return true;
      }

      // 振り終わりの位置＝魔法が飛び出す点
      const [ex, ey] = swingPath(fx.cfg.kind, 1, fx.dir);
      const from = new THREE.Vector3(this.originX || 0, -.2, SWING_PLANE_Z);

      // --- 2) 飛翔 ---
      if (el < fx.swingMs + fx.flyMs) {
        const t = (el - fx.swingMs) / fx.flyMs;
        const eased = t * t;
        const pos = from.clone().lerp(fx.target, eased);
        const arc = ['accio','protego','rennervate','episkey'].includes(fx.spellId) ? .8 : .12;
        pos.y += Math.sin(t*Math.PI)*arc;
        if (['rictusempra','serpensortia','slugulas_eructo'].includes(fx.spellId)) pos.x += Math.sin(t*Math.PI*3)*.4;
        this.#pushTrail(pos, t < .1); this.trailMat.uniforms.uColor.value.copy(fx.color);
        this.boltOrb.position.copy(pos);
        this.boltOrb.material.color.copy(fx.color);
        this.boltOrb.scale.setScalar(1.0 + t * 0.7);
        boltOp = Math.max(boltOp, 0.9 * fx.strength);
        this.light.position.copy(pos);
        lightI = Math.max(lightI, 6.0 * fx.strength);
        lightColor = fx.color;
        trailOp = Math.max(trailOp, (1 - t) * 0.7 * fx.strength);
        // 尾を引く
        this.#spawn(pos, {
          count: Math.max(2, Math.round((this.lowPower ? 110 : 240) * dt)),
          color: fx.color, color2: fx.color2,
          speed: 1.3, size: 0.14, life: 0.5, gravity: -0.6, drag: 3.0, spread: 0.45,
        });
        this.gatherOrb.material.opacity *= 0.82;
        return true;
      }

      // --- 3) 着弾 ---
      const bt = (el - fx.swingMs - fx.flyMs) / fx.burstMs;
      if (!fx.burstDone) {
        fx.burstDone = true;
        const n = Math.round((this.lowPower ? 130 : 320) * fx.cfg.particles * fx.strength);
        this.#spawn(fx.target, {
          count: n, color: fx.color, color2: fx.color2,
          speed: 6.4 * fx.strength, size: 0.085, life: 1.4, gravity: -2.8, drag: 1.1, spread: 1,
        });
        // 奥へ抜ける芯
        this.#spawn(fx.target, {
          count: Math.round(n * 0.35), color: fx.color2, color2: fx.color,
          speed: 9.0 * fx.strength, size: 0.15, life: 0.9, gravity: -1.2, drag: 0.9,
          dir: new THREE.Vector3(0, 0.25, -1).normalize(), cone: Math.PI / 3,
        });
        // こちらへ飛んでくる火花。画面の前にいる子どもに向かって来るほど臨場感が出る。
        this.#spawn(fx.target, {
          count: Math.round(n * 0.3), color: fx.color, color2: fx.color2,
          speed: 7.5 * fx.strength, size: 0.09, life: 1.0, gravity: -2.2, drag: 0.8,
          dir: new THREE.Vector3(0, 0.3, 1).normalize(), cone: Math.PI / 2.4,
        });
        this.ring.position.set(fx.target.x, 0.03, fx.target.z);
        this.dome.position.copy(fx.target);
      }

      const env = Math.sin(Math.min(1, bt) * Math.PI);
      const decay = Math.max(0, 1 - bt);
      this.burstOrb.position.copy(fx.target);
      this.burstOrb.material.color.copy(fx.color);
      this.burstOrb.scale.setScalar((2.0 + bt * 5.4) * fx.strength);
      burstOp = Math.max(burstOp, decay * decay * 0.95 * fx.strength);

      this.ring.material.color.copy(fx.color2);
      this.ring.scale.setScalar(0.6 + bt * 7.5 * fx.strength);
      ringOp = Math.max(ringOp, decay * 0.23 * fx.strength);

      this.dome.material.color.copy(fx.color);
      this.dome.scale.setScalar(0.5 + bt * 5.0 * fx.strength);
      domeOp = Math.max(domeOp, Math.max(0, 1 - bt * 1.7) * 0.12 * fx.strength);

      this.light.position.copy(fx.target);
      lightI = Math.max(lightI, env * 11 * fx.strength);
      lightColor = fx.color;
      return true;
    });

    // まとめて反映
    this.trailMat.uniforms.uOpacity.value = trailOp;
    this.trail.visible = trailOp > 0.004;
    this.boltOrb.material.opacity = boltOp;
    this.burstOrb.material.opacity = burstOp;
    this.ring.material.opacity = ringOp;
    this.dome.material.opacity = domeOp;
    this.light.intensity = lightI;
    this.nearLight.intensity = nearI;
    if (lightColor) {
      this.light.color.copy(lightColor);
      this.nearLight.color.copy(lightColor);
    }
    if (trailOp <= 0.004) this.trailLive = false;
  }

  /** 軌跡のリボンを伸ばす */
  #pushTrail(point, reset) {
    const pts = this.trailPoints;
    if (reset || !this.trailLive) {
      for (const v of pts) v.copy(point);
      this.trailLive = true;
    } else {
      for (let i = pts.length - 1; i > 0; i -= 1) pts[i].copy(pts[i - 1]);
      pts[0].copy(point);
    }

    const posAttr = this.trail.geometry.attributes.position;
    const alphaAttr = this.trail.geometry.attributes.aAlpha;
    const arr = posAttr.array;
    const aArr = alphaAttr.array;
    const up = new THREE.Vector3(0, 0, 1); // 手前の面の法線
    const tmp = new THREE.Vector3();
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      tmp.subVectors(a, b);
      if (tmp.lengthSq() < 1e-8) tmp.set(1, 0, 0);
      tmp.normalize();
      // 進行方向に直交する向きへ、先細りの幅を取る
      const side = new THREE.Vector3().crossVectors(tmp, up).normalize();
      const taper = 1 - i / pts.length;
      const halfW = 0.34 * taper + 0.025;
      const i6 = i * 6;
      arr[i6] = a.x + side.x * halfW;
      arr[i6 + 1] = a.y + side.y * halfW;
      arr[i6 + 2] = a.z + side.z * halfW;
      arr[i6 + 3] = a.x - side.x * halfW;
      arr[i6 + 4] = a.y - side.y * halfW;
      arr[i6 + 5] = a.z - side.z * halfW;
      const al = taper * taper;
      aArr[i * 2] = al;
      aArr[i * 2 + 1] = al;
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  cancel() {
    this.active=[]; this.chargeState=null; this.chargeUntil=0; this.trailLive=false;
    this.p.life.fill(0); this.p.size.fill(0);
    for(const name of ['gatherOrb','boltOrb','burstOrb','ring','dome']) if(this[name]?.material)this[name].material.opacity=0;
    this.trail.visible=false; this.light.intensity=0; this.nearLight.intensity=0;
    this.particles.geometry.attributes.size.needsUpdate=true;
  }
  dispose() {
    this.particles.geometry.dispose();
    this.particleMat.dispose();
    this.trail.geometry.dispose();
    this.trailMat.dispose();
  }
}

export { SWING_PLANE_Z, SWING_Y };
