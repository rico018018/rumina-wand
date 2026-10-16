/**
 * 3Dの魔法世界（要件書 5章）。
 *
 * 【方針】
 * - 固定カメラ。急な視点移動をしない。
 * - 紺・金・青い光を中心にした、魔法学校の大広間/中庭を思わせる世界。
 * - 呪文の対象が大きく見える構図。
 * - 瞬間的な全画面の強い白光や激しい点滅をしない。発光は局所・なだらか。
 * - 発動の光は「登録色」で、発動待ち時間のあとに出す。待ち時間中は色を出さない
 *   （要件の順番：認識成功 → 待ち時間 → 登録色の光 → 演出）。
 * - 状態の同期は setWorld() だけで行う。描画はこのファイルの外の状態を書き換えない。
 */

import * as THREE from '../vendor/three.module.min.js';

const NAVY = 0x0b1030;
const STONE = 0x515a8c;
const GOLD = 0xe8b854;
const BLUE_GLOW = 0x5f8fff;

/** 構図の基準。これより縦長の画面では画角を広げて横の見える範囲を保つ。 */
const BASE_FOV_DEG = 42;
const BASE_ASPECT = 16 / 9;
/** 縦長の画面で画角を広げる上限。これ以上広げると魚眼のように歪むため、端は切れてよいことにする。 */
const MAX_FOV_DEG = 72;

/** 呪文ごとの「光と演出が向かう先」 */
const TARGET_POINTS = {
  accio: new THREE.Vector3(-2.05, 0.7, 1.35),
  serpensortia: new THREE.Vector3(0.9, 0.1, 2.0),
  slugulas_eructo: new THREE.Vector3(2.35, 0.35, 0.7),
  reducto: new THREE.Vector3(2.35, 0.42, -0.5),
  vipera_evanesca: new THREE.Vector3(0.9, 0.2, 2.0),
  finite_incantatem: new THREE.Vector3(0, 1.4, 0),
  default: new THREE.Vector3(0, 1.25, 0),
};

/**
 * 魔法が画面へ入ってくる地点（子どもが杖を振る側＝手前）。
 * 画面下の状態表示に光が隠れないよう、床すれすれではなく少し高い位置に置く。
 */
const CAST_ORIGIN = new THREE.Vector3(0, 0.8, 3.5);

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

function makeFloorTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#434d80';
  g.fillRect(0, 0, size, size);
  const tile = size / 4;
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const shade = (x + y) % 2 === 0 ? '#4c5790' : '#3b4472';
      g.fillStyle = shade;
      g.fillRect(x * tile + 1.5, y * tile + 1.5, tile - 3, tile - 3);
    }
  }
  g.strokeStyle = 'rgba(232,184,84,0.16)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    g.beginPath();
    g.moveTo(i * tile, 0);
    g.lineTo(i * tile, size);
    g.moveTo(0, i * tile);
    g.lineTo(size, i * tile);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * アーチ窓に貼る夜空。
 * 奥の壁は不透明なので、壁の裏に星を置いても見えない。窓そのものに星空を描く。
 */
function makeWindowTexture() {
  const w = 128;
  const h = 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1b3fa8');
  grad.addColorStop(0.45, '#2e5ed6');
  grad.addColorStop(1, '#6f9bff');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.8;
    const r = Math.random() * 1.5 + 0.5;
    g.globalAlpha = 0.35 + Math.random() * 0.6;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // 窓の格子
  g.globalAlpha = 0.5;
  g.strokeStyle = '#2b3160';
  g.lineWidth = 3;
  for (let i = 1; i < 3; i += 1) {
    g.beginPath();
    g.moveTo((w / 3) * i, 0);
    g.lineTo((w / 3) * i, h);
    g.stroke();
  }
  for (let i = 1; i < 7; i += 1) {
    g.beginPath();
    g.moveTo(0, (h / 7) * i);
    g.lineTo(w, (h / 7) * i);
    g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class MagicScene {
  constructor(canvas, { lowPower = false } = {}) {
    this.canvas = canvas;
    this.lowPower = lowPower;
    this.clock = new THREE.Clock();
    this.effects = [];
    this.pools = { snakes: [], treasures: [], slugs: [], debris: [], wands: [] };
    this.visibleCounts = { snakes: 0, treasures: 0, slugs: 0, debris: 0, wands: 0 };
    this.world = null;
    this.chargeUntil = 0;
    this.renderError = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower,
      alpha: false,
      powerPreference: lowPower ? 'low-power' : 'default',
    });
    this.renderer.setClearColor(NAVY, 1);
    this.maxPixelRatio = lowPower ? 1.25 : 2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(NAVY);
    this.scene.fog = new THREE.Fog(0x1a2250, 12, 30);

    this.camera = new THREE.PerspectiveCamera(BASE_FOV_DEG, BASE_ASPECT, 0.1, 60);
    this.camera.position.set(0, 2.15, 6.9);
    this.camera.lookAt(0, 1.15, 0.2);

    this.#buildLights();
    this.#buildHall();
    this.#buildProps();
    this.#buildWizard();
    this.#buildCastVisuals();
    this.resize();
  }

  // ---------------------------------------------------------------- 構築

  #buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x5570c8, 0x18204a, 1.25));
    this.scene.add(new THREE.AmbientLight(0x7a88c8, 0.55));

    const key = new THREE.DirectionalLight(0xcfdcff, 1.0);
    key.position.set(-3.5, 7, 6);
    this.scene.add(key);

    // 呪文の対象（魔法使い）が大きく・明るく見えるようにする専用の明かり
    const subject = new THREE.SpotLight(0xfff0d0, 2.1, 16, Math.PI / 5, 0.55, 1.4);
    subject.position.set(0.6, 6.2, 4.2);
    subject.target.position.set(0, 1.0, 0);
    this.scene.add(subject);
    this.scene.add(subject.target);

    // かがり火（暖色）。ゆっくり揺らす。激しい点滅にしない。
    this.braziers = [];
    for (const x of [-4.2, 4.2]) {
      const light = new THREE.PointLight(0xffb45c, 2.0, 16, 2);
      light.position.set(x, 2.1, -1.2);
      this.scene.add(light);
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.16, 0.26, 10),
        new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 }),
      );
      bowl.position.set(x, 1.75, -1.2);
      this.scene.add(bowl);
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85 }),
      );
      flame.position.set(x, 1.95, -1.2);
      this.scene.add(flame);
      this.braziers.push({ light, flame, phase: Math.random() * Math.PI * 2, baseY: 1.95 });
    }

    // 発動の光に使う明かり（色は呪文設定で変える）
    this.castLight = new THREE.PointLight(0xffffff, 0, 12, 2);
    this.castLight.position.copy(CAST_ORIGIN);
    this.scene.add(this.castLight);
  }

  #buildHall() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.85, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // 奥の壁
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 11),
      new THREE.MeshStandardMaterial({ color: 0x2c3566, roughness: 0.95 }),
    );
    wall.position.set(0, 5.5, -7);
    this.scene.add(wall);

    // アーチ窓。窓の中に夜空を描いてある（壁の裏の星は壁に隠れて見えないため）。
    const skyTex = makeWindowTexture();
    const windowMat = new THREE.MeshBasicMaterial({ map: skyTex });
    const frameMat = new THREE.MeshStandardMaterial({ color: STONE, roughness: 0.75 });
    for (const x of [-4.6, 0, 4.6]) {
      const winGeo = new THREE.ShapeGeometry(arcWindowShape(2.2, 5.2));
      // 形に合わせてテクスチャを貼り直す
      winGeo.computeBoundingBox();
      const bb = winGeo.boundingBox;
      const uv = winGeo.attributes.position;
      const uvs = new Float32Array(uv.count * 2);
      for (let i = 0; i < uv.count; i += 1) {
        uvs[i * 2] = (uv.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
        uvs[i * 2 + 1] = (uv.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
      }
      winGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      const win = new THREE.Mesh(winGeo, windowMat);
      win.position.set(x, 1.1, -6.9);
      this.scene.add(win);

      const frame = new THREE.Mesh(new THREE.ShapeGeometry(arcWindowShape(2.6, 5.55)), frameMat);
      frame.position.set(x, 0.98, -6.95);
      this.scene.add(frame);
    }

    // 左右の列柱（奥行きを出す）
    const colGeo = new THREE.CylinderGeometry(0.34, 0.4, 6.4, 12);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x47507f, roughness: 0.85 });
    const capGeo = new THREE.BoxGeometry(1.0, 0.26, 1.0);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x5d6697, roughness: 0.7, metalness: 0.15 });
    for (const x of [-6.2, 6.2]) {
      for (const z of [-4.5, -1.5, 1.5]) {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(x, 3.2, z);
        this.scene.add(col);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(x, 6.5, z);
        this.scene.add(cap);
      }
    }

    // 浮遊する蝋燭
    this.candles = [];
    const candleGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const candleMat = new THREE.MeshBasicMaterial({ color: 0xffd79a });
    const candleCount = this.lowPower ? 8 : 14;
    for (let i = 0; i < candleCount; i += 1) {
      const c = new THREE.Mesh(candleGeo, candleMat);
      const x = (Math.random() - 0.5) * 11;
      const y = 3.6 + Math.random() * 2.4;
      const z = -5.5 + Math.random() * 6;
      c.position.set(x, y, z);
      this.scene.add(c);
      this.candles.push({ mesh: c, baseY: y, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.4 });
    }
  }

  #buildProps() {
    // 宝物置き場（手前・左）
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.68, 0.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x5a63a0, roughness: 0.75 }),
    );
    plinth.position.set(-2.05, 0.25, 1.35);
    this.scene.add(plinth);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.045, 8, 24),
      new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(-2.05, 0.51, 1.35);
    this.scene.add(rim);
    this.treasurePlinth = plinth;

    // 宝物プール（10個）
    const treasureGeos = [
      new THREE.IcosahedronGeometry(0.19, 0),
      new THREE.BoxGeometry(0.27, 0.2, 0.27),
      new THREE.TorusGeometry(0.15, 0.062, 8, 16),
    ];
    const treasureMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.2, metalness: 0.9, emissive: 0x6a4d10 });
    for (let i = 0; i < 10; i += 1) {
      const mesh = new THREE.Mesh(treasureGeos[i % 3], treasureMat);
      const angle = (i / 10) * Math.PI * 2;
      const radius = 0.3 + (i % 3) * 0.09;
      mesh.position.set(-2.05 + Math.cos(angle) * radius, 0.64 + Math.floor(i / 5) * 0.24, 1.35 + Math.sin(angle) * radius * 0.8);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.treasures.push({ mesh, home: mesh.position.clone(), phase: Math.random() * Math.PI * 2 });
    }

    // 壊せる岩（3個）と破片
    this.rockMeshes = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7f8599, roughness: 1, flatShading: true });
    const rockPositions = [
      new THREE.Vector3(2.35, 0.42, -0.5),
      new THREE.Vector3(3.3, 0.34, -1.6),
      new THREE.Vector3(1.75, 0.3, -2.0),
    ];
    rockPositions.forEach((pos, i) => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 - i * 0.05, 0), rockMat);
      mesh.position.copy(pos);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      // world.js の rocks[i].id と対応させる（破片を壊れた岩の位置に出すため）
      mesh.userData.rockId = `rock-${i + 1}`;
      this.scene.add(mesh);
      this.rockMeshes.push(mesh);
    });
    const debrisGeo = new THREE.TetrahedronGeometry(0.11, 0);
    for (let i = 0; i < 12; i += 1) {
      const mesh = new THREE.Mesh(debrisGeo, rockMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.debris.push({ mesh });
    }

    // ヘビ（最大10匹。1匹=6個の球をつないだ体）
    const snakeBodyGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const snakeHeadGeo = new THREE.SphereGeometry(0.13, 10, 8);
    const snakeMat = new THREE.MeshStandardMaterial({ color: 0x3fbd73, roughness: 0.5 });
    const snakeHeadMat = new THREE.MeshStandardMaterial({ color: 0x55d98c, roughness: 0.45 });
    for (let i = 0; i < 10; i += 1) {
      const group = new THREE.Group();
      const segs = [];
      for (let s = 0; s < 6; s += 1) {
        const seg = new THREE.Mesh(s === 0 ? snakeHeadGeo : snakeBodyGeo, s === 0 ? snakeHeadMat : snakeMat);
        seg.scale.setScalar(1 - s * 0.08);
        group.add(seg);
        segs.push(seg);
      }
      group.visible = false;
      this.scene.add(group);
      this.pools.snakes.push({ group, segs, phase: Math.random() * Math.PI * 2, home: new THREE.Vector3() });
    }

    // 桶とナメクジ
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.34, 0.3, 14, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xa9743f, roughness: 0.85, side: THREE.DoubleSide }),
    );
    bucket.position.set(2.35, 0.15, 0.7);
    this.scene.add(bucket);
    const bucketBottom = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 14),
      new THREE.MeshStandardMaterial({ color: 0x7d5329, roughness: 0.9 }),
    );
    bucketBottom.rotation.x = -Math.PI / 2;
    bucketBottom.position.set(2.35, 0.01, 0.7);
    this.scene.add(bucketBottom);
    this.bucket = bucket;

    const slugGeo = new THREE.SphereGeometry(0.075, 8, 6);
    const slugMat = new THREE.MeshStandardMaterial({ color: 0xb6d95e, roughness: 0.35 });
    for (let i = 0; i < 10; i += 1) {
      const mesh = new THREE.Mesh(slugGeo, slugMat);
      mesh.scale.set(1.6, 0.8, 1);
      const a = (i / 10) * Math.PI * 2;
      mesh.position.set(2.35 + Math.cos(a) * 0.2, 0.24 + Math.floor(i / 5) * 0.11, 0.7 + Math.sin(a) * 0.2);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.slugs.push({ mesh });
    }

    // 床に落ちた杖
    const wandGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.62, 6);
    const wandMat = new THREE.MeshStandardMaterial({ color: 0xc09454, roughness: 0.6 });
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(wandGeo, wandMat);
      mesh.rotation.set(Math.PI / 2, 0, 0.5 + i * 0.4);
      mesh.position.set(-0.6 - i * 0.35, 0.03, 1.1 + i * 0.2);
      mesh.visible = false;
      this.scene.add(mesh);
      this.pools.wands.push({ mesh });
    }

    // 盾（Protego）。要件どおり盾本体は青。発動の光の色とは別の項目。
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.75, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x5b8cff, transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
    );
    this.shield.position.set(0, 0.02, 0.2);
    this.scene.add(this.shield);
    this.shieldEdge = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.03, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x9dbcff, transparent: true, opacity: 0 }),
    );
    this.shieldEdge.rotation.x = Math.PI / 2;
    this.shieldEdge.position.set(0, 0.03, 0.2);
    this.scene.add(this.shieldEdge);

    // 柔らかい着地点（Stupefy / Everte Statum のときだけ見せる）
    this.cushion = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.16, 18),
      new THREE.MeshStandardMaterial({ color: 0x7a63c4, roughness: 0.9 }),
    );
    this.cushion.position.set(0, 0.08, -0.9);
    this.cushion.visible = false;
    this.scene.add(this.cushion);
  }

  #buildWizard() {
    const g = new THREE.Group();
    const robe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.56, 1.15, 14),
      new THREE.MeshStandardMaterial({ color: 0x3b4bc4, roughness: 0.72 }),
    );
    robe.position.y = 0.575;
    g.add(robe);

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.035, 8, 20),
      new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.4, metalness: 0.6 }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 1.13;
    g.add(trim);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 16, 12),
      // 青い環境光で灰色に見えないよう、わずかに自発光させる
      new THREE.MeshStandardMaterial({ color: 0xffd9b0, roughness: 0.55, emissive: 0x4a2c16, emissiveIntensity: 0.5 }),
    );
    head.position.y = 1.32;
    g.add(head);

    // 目。文字が読めない子でも「人がいる」「こちらを向いている」と分かるようにする
    const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x241a10 });
    for (const ex of [-0.062, 0.062]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, 1.345, 0.155);
      g.add(eye);
    }
    // 口（くすぐられたときに大きくなる）
    this.mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x7a3328 }),
    );
    this.mouth.position.set(0, 1.265, 0.155);
    this.mouth.scale.set(1.3, 0.7, 0.6);
    g.add(this.mouth);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.5, 14),
      new THREE.MeshStandardMaterial({ color: 0x2b36a0, roughness: 0.78 }),
    );
    hat.position.y = 1.68;
    hat.rotation.z = 0.12;
    g.add(hat);
    const brim = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 16),
      new THREE.MeshStandardMaterial({ color: 0x2b36a0, roughness: 0.78, side: THREE.DoubleSide }),
    );
    brim.rotation.x = -Math.PI / 2;
    brim.position.y = 1.44;
    g.add(brim);

    // 腕は「肩を基点に下へ垂らす」。肩のグループを回すことで、手が必ず腕の先に付く。
    const ARM_LENGTH = 0.58;
    const armMat = new THREE.MeshStandardMaterial({ color: 0x4555d4, roughness: 0.74 });
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, ARM_LENGTH, 8);
    const handGeo = new THREE.SphereGeometry(0.065, 10, 8);
    const handMat = new THREE.MeshStandardMaterial({ color: 0xffd9b0, roughness: 0.55, emissive: 0x4a2c16, emissiveIntensity: 0.4 });
    this.hands = {};
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.27, 1.04, 0.06);
      shoulder.rotation.set(-0.16, 0, side * 0.34); // 体から少し離して下へ垂らす
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.y = -ARM_LENGTH / 2;
      shoulder.add(arm);
      const hand = new THREE.Mesh(handGeo, handMat);
      hand.position.y = -ARM_LENGTH;
      shoulder.add(hand);
      g.add(shoulder);
      this.hands[side === -1 ? 'left' : 'right'] = shoulder;
    }

    // 手に持つ杖（Expelliarmus で消える）。右手のグループに入れて、手の先から生えるようにする。
    this.heldWand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.026, 0.52, 6),
      new THREE.MeshStandardMaterial({ color: 0xd9ab63, roughness: 0.5 }),
    );
    this.heldWand.position.set(0.02, -0.62, 0.2);
    this.heldWand.rotation.set(-1.0, 0, 0);
    this.hands.right.add(this.heldWand);

    // 控えめなけがの表現（小さな淡い光。傷の描写はしない）
    this.injuryMark = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb3c9, transparent: true, opacity: 0.55 }),
    );
    this.injuryMark.position.set(-0.42, 0.52, 0.16);
    this.injuryMark.visible = false;
    g.add(this.injuryMark);

    // 笑っているときの印（くすぐり）
    this.laughMark = new THREE.Group();
    const noteMat = new THREE.MeshBasicMaterial({ color: 0xffe89a });
    for (let i = 0; i < 3; i += 1) {
      const note = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), noteMat);
      note.position.set(0.22 + i * 0.16, 1.62 + i * 0.12, 0.1);
      this.laughMark.add(note);
    }
    this.laughMark.visible = false;
    g.add(this.laughMark);

    g.position.set(0, 0, 0.2);
    g.scale.setScalar(1.18);
    this.scene.add(g);
    this.wizard = g;
    this.wizardBaseZ = 0.2;
  }

  #buildCastVisuals() {
    // 発動地点の光の玉（登録色）
    this.castOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 14, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.castOrb.position.copy(CAST_ORIGIN);
    this.scene.add(this.castOrb);

    // 対象へ飛ぶ光の弾
    this.bolt = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.scene.add(this.bolt);

    // 床に広がる輪
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0, 0.02, 0.4);
    this.scene.add(this.ring);

    // 待ち時間中の「ためる」表示（色は出さない。淡い中立色のみ）
    this.chargeOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xf2f0e4, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.chargeOrb.position.copy(CAST_ORIGIN);
    this.scene.add(this.chargeOrb);
  }

  // ---------------------------------------------------------------- 公開API

  resize() {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth || this.canvas.clientWidth || 640);
    const h = Math.max(1, parent?.clientHeight || this.canvas.clientHeight || 360);
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);

    const aspect = w / h;
    this.camera.aspect = aspect;
    // 16:9 より縦長の画面では、横に見える範囲が狭まらないよう縦の画角を広げる。
    // 16:9 より横長（iPhoneの19.5:9 など）では、そのまま横に広く見える。
    if (aspect < BASE_ASPECT) {
      const halfWidth = Math.tan((BASE_FOV_DEG * Math.PI) / 360) * BASE_ASPECT;
      const needed = (2 * Math.atan(halfWidth / aspect) * 180) / Math.PI;
      this.camera.fov = Math.min(MAX_FOV_DEG, needed);
    } else {
      this.camera.fov = BASE_FOV_DEG;
    }
    this.camera.updateProjectionMatrix();
  }

  setLowPower(lowPower) {
    this.lowPower = lowPower;
    this.maxPixelRatio = lowPower ? 1.25 : 2;
    this.resize();
  }

  /** 世界の状態を見た目へ反映する */
  setWorld(world) {
    this.world = world;

    // 宝物
    this.pools.treasures.forEach((t, i) => {
      t.mesh.visible = i < world.treasures.length;
    });
    // ヘビ
    this.pools.snakes.forEach((s, i) => {
      const active = i < world.snakes.length;
      s.group.visible = active;
      if (active) {
        const seed = world.snakes[i].seed ?? i / 10;
        const angle = seed * Math.PI * 2;
        const radius = 0.55 + (seed % 0.5) * 1.1;
        s.home.set(0.75 + Math.cos(angle) * radius, 0.1, 2.15 + Math.sin(angle) * radius * 0.4);
        s.phase = seed * Math.PI * 2;
      }
    });
    // ナメクジ
    this.pools.slugs.forEach((s, i) => {
      s.mesh.visible = i < world.slugs.length;
    });
    // 岩と破片
    this.rockMeshes.forEach((mesh, i) => {
      mesh.visible = !world.rocks[i]?.broken;
    });
    this.pools.debris.forEach((d, i) => {
      const active = i < world.debris.length;
      d.mesh.visible = active;
      if (active && !d.placed) {
        const item = world.debris[i];
        const src = this.rockMeshes.find((m) => m.userData.rockId === item.from) || this.rockMeshes[i % this.rockMeshes.length];
        const base = src ? src.position : new THREE.Vector3(2.5, 0.2, -0.4);
        const seed = item.seed ?? Math.random();
        d.mesh.position.set(base.x + (seed - 0.5) * 1.5, 0.09, base.z + ((seed * 7) % 1 - 0.5) * 1.3);
        d.mesh.rotation.set(seed * 6, seed * 3, seed * 9);
        d.placed = true;
      }
      if (!active) d.placed = false;
    });
    // 落ちた杖
    this.pools.wands.forEach((w, i) => {
      w.mesh.visible = i < world.droppedWands.length;
    });
    // 盾
    const shieldOn = world.shield.active;
    this.shieldTargetOpacity = shieldOn ? Math.min(0.42, 0.18 + world.shield.level * 0.05) : 0;
    this.shieldTargetScale = shieldOn ? Math.min(1.18, 1 + world.shield.level * 0.03) : 1;
    // 魔法使い
    this.heldWand.visible = world.wizard.holdsWand;
    this.injuryMark.visible = world.wizard.injured;
    this.laughMark.visible = world.wizard.tickling;
    this.cushion.visible = world.wizard.onSoftLanding;
  }

  /** 発動待ち時間中の「ためる」表示。登録色はまだ出さない。 */
  charge(durationMs) {
    this.chargeUntil = performance.now() + durationMs;
    this.chargeStart = performance.now();
  }

  /**
   * 登録色の光を出す（要件の順番で、待ち時間のあとに呼ぶ）。
   * 全画面の白光や点滅はしない。発動地点と軌跡に限定する。
   */
  castLightFor(spellId, hexColor, { intensity = 1 } = {}) {
    const color = new THREE.Color(hexColor);
    const target = (TARGET_POINTS[spellId] || TARGET_POINTS.default).clone();
    this.chargeUntil = 0;

    this.castOrb.material.color.copy(color);
    this.bolt.material.color.copy(color);
    this.ring.material.color.copy(color);
    this.castLight.color.copy(color);

    this.ring.position.set(target.x, 0.02, target.z);
    this.bolt.position.copy(CAST_ORIGIN);

    this.effects.push({
      kind: 'cast',
      start: performance.now(),
      duration: 1100,
      from: CAST_ORIGIN.clone(),
      to: target,
      intensity,
    });
  }

  /** 認識できなかったときの小さな光のしぼみ（驚かせない） */
  failureLight() {
    this.chargeUntil = 0;
    const pale = new THREE.Color(0x8e95b5);
    this.castOrb.material.color.copy(pale);
    this.castLight.color.copy(pale);
    this.effects.push({ kind: 'fail', start: performance.now(), duration: 520 });
  }

  /** 正しく唱えたが対象がないときの穏やかな光 */
  noTargetLight(hexColor) {
    const color = new THREE.Color(hexColor);
    this.castOrb.material.color.copy(color);
    this.castLight.color.copy(color);
    this.effects.push({ kind: 'gentle', start: performance.now(), duration: 700 });
  }

  /** 設定画面のプレビュー。短い光の見本だけで、世界の状態は変えない。 */
  previewLight(hexColor) {
    const color = new THREE.Color(hexColor);
    this.castOrb.material.color.copy(color);
    this.castLight.color.copy(color);
    this.effects.push({ kind: 'preview', start: performance.now(), duration: 850 });
  }

  // ---------------------------------------------------------------- 毎フレーム

  render(nowMs = performance.now()) {
    const t = nowMs / 1000;
    const dt = Math.min(0.05, this.clock.getDelta());

    // かがり火のゆらぎ（ゆっくり）
    for (const b of this.braziers) {
      const f = Math.sin(t * 1.7 + b.phase) * 0.5 + Math.sin(t * 3.1 + b.phase) * 0.25;
      b.light.intensity = 1.9 + f * 0.3;
      b.flame.position.y = b.baseY + f * 0.02;
      b.flame.scale.setScalar(1 + f * 0.06);
    }
    // 浮遊する蝋燭
    for (const c of this.candles) {
      c.mesh.position.y = c.baseY + Math.sin(t * c.speed + c.phase) * 0.12;
    }

    // 宝物のゆっくりした回転
    this.pools.treasures.forEach((item, i) => {
      if (!item.mesh.visible) return;
      item.mesh.rotation.y = t * 0.5 + i;
      item.mesh.position.y = item.home.y + Math.sin(t * 1.1 + item.phase) * 0.035;
    });

    // ヘビの蛇行
    const speed = this.world ? this.world.wizard.speedFactor : 1;
    this.pools.snakes.forEach((s) => {
      if (!s.group.visible) return;
      s.group.position.copy(s.home);
      const head = Math.sin(t * 1.1 * speed + s.phase);
      s.group.rotation.y = head * 0.9;
      s.segs.forEach((seg, k) => {
        const wave = Math.sin(t * 4 * speed + s.phase - k * 0.8);
        seg.position.set(wave * 0.12, 0.1 - k * 0.004, -k * 0.16);
      });
    });

    // ナメクジのもぞもぞ
    this.pools.slugs.forEach((s, i) => {
      if (!s.mesh.visible) return;
      s.mesh.rotation.y = Math.sin(t * 1.4 + i) * 0.4;
    });

    // 盾のなだらかな追従と呼吸
    if (this.shieldTargetOpacity !== undefined) {
      const breathe = 1 + Math.sin(t * 1.4) * 0.02;
      this.shield.material.opacity += (this.shieldTargetOpacity - this.shield.material.opacity) * Math.min(1, dt * 5);
      this.shieldEdge.material.opacity = this.shield.material.opacity * 1.5;
      const scale = (this.shieldTargetScale ?? 1) * breathe;
      this.shield.scale.setScalar(scale);
      this.shieldEdge.scale.setScalar(scale);
    }

    // 魔法使いの姿勢
    if (this.world) {
      const wz = this.world.wizard;
      const targetZ = this.wizardBaseZ + wz.offsetZ;
      this.wizard.position.z += (targetZ - this.wizard.position.z) * Math.min(1, dt * 4);
      if (!wz.conscious) {
        // 柔らかい場所に横たわる
        this.wizard.rotation.x += (-Math.PI / 2.2 - this.wizard.rotation.x) * Math.min(1, dt * 4);
        this.wizard.position.y += (0.42 - this.wizard.position.y) * Math.min(1, dt * 4);
        this.wizard.rotation.z += (0 - this.wizard.rotation.z) * Math.min(1, dt * 5);
      } else {
        this.wizard.rotation.x += (0 - this.wizard.rotation.x) * Math.min(1, dt * 4);
        this.wizard.position.y += (Math.sin(t * 1.2) * 0.02 - this.wizard.position.y) * Math.min(1, dt * 4);
        const wiggle = wz.tickling ? Math.sin(t * 9) * 0.1 : 0;
        this.wizard.rotation.z += (wiggle - this.wizard.rotation.z) * Math.min(1, dt * 8);
      }
      if (this.mouth) {
        const open = wz.tickling ? 1 + Math.abs(Math.sin(t * 9)) * 1.1 : 1;
        this.mouth.scale.set(1.3 * open, 0.7 * open, 0.6);
      }
      if (this.laughMark.visible) {
        this.laughMark.children.forEach((n, i) => {
          n.position.y = 1.62 + i * 0.12 + Math.sin(t * 3 + i) * 0.06;
        });
      }
    }

    // 待ち時間中の「ためる」表示
    if (this.chargeUntil > nowMs) {
      const total = Math.max(1, this.chargeUntil - this.chargeStart);
      const p = Math.min(1, (nowMs - this.chargeStart) / total);
      this.chargeOrb.material.opacity = 0.16 + p * 0.3;
      this.chargeOrb.scale.setScalar(0.6 + p * 0.8);
    } else {
      this.chargeOrb.material.opacity *= 0.86;
      if (this.chargeOrb.material.opacity < 0.01) this.chargeOrb.material.opacity = 0;
    }

    // 発動の光
    this.#updateEffects(nowMs);

    try {
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      this.renderError = err?.message || String(err);
    }
  }

  #updateEffects(nowMs) {
    let orbOpacity = 0;
    let lightIntensity = 0;
    let boltOpacity = 0;
    let ringOpacity = 0;

    this.effects = this.effects.filter((fx) => {
      const p = (nowMs - fx.start) / fx.duration;
      if (p >= 1) return false;

      if (fx.kind === 'cast') {
        // 立ち上がり→減衰。なだらかで、全画面を白くしない。
        const rise = Math.min(1, p / 0.18);
        const decay = Math.max(0, 1 - Math.max(0, (p - 0.18) / 0.82));
        const env = rise * decay;
        orbOpacity = Math.max(orbOpacity, env * 0.6);
        lightIntensity = Math.max(lightIntensity, env * 2.6 * (fx.intensity ?? 1));
        this.castOrb.scale.setScalar(0.75 + env * 0.55);

        // 光の弾が対象へ飛ぶ
        const travel = Math.min(1, Math.max(0, (p - 0.1) / 0.45));
        if (travel > 0 && travel < 1) {
          const pos = fx.from.clone().lerp(fx.to, travel);
          pos.y += Math.sin(travel * Math.PI) * 0.95;
          this.bolt.position.copy(pos);
          boltOpacity = Math.max(boltOpacity, 0.78);
          this.castLight.position.copy(pos);
        } else if (travel >= 1) {
          this.castLight.position.copy(fx.to);
        }

        // 着弾の輪が床に広がる
        const ringP = Math.min(1, Math.max(0, (p - 0.5) / 0.5));
        if (ringP > 0) {
          this.ring.scale.setScalar(0.5 + ringP * 2.0);
          ringOpacity = Math.max(ringOpacity, (1 - ringP) * 0.55);
        }
        return true;
      }

      if (fx.kind === 'fail') {
        // 小さな光がしぼむ
        const env = Math.max(0, 1 - p);
        orbOpacity = Math.max(orbOpacity, env * 0.34);
        lightIntensity = Math.max(lightIntensity, env * 0.5);
        this.castOrb.scale.setScalar(0.5 * env + 0.12);
        this.castLight.position.copy(CAST_ORIGIN);
        return true;
      }

      if (fx.kind === 'gentle' || fx.kind === 'preview') {
        const env = Math.sin(Math.min(1, p) * Math.PI);
        orbOpacity = Math.max(orbOpacity, env * 0.5);
        lightIntensity = Math.max(lightIntensity, env * 1.4);
        this.castOrb.scale.setScalar(0.6 + env * 0.4);
        this.castLight.position.copy(CAST_ORIGIN);
        return true;
      }

      return false;
    });

    this.castOrb.material.opacity = orbOpacity;
    this.bolt.material.opacity = boltOpacity;
    this.ring.material.opacity = ringOpacity;
    this.castLight.intensity = lightIntensity;
    if (lightIntensity === 0) this.castLight.position.copy(CAST_ORIGIN);
  }

  dispose() {
    this.renderer.dispose();
  }
}

export { CAST_ORIGIN, TARGET_POINTS };
