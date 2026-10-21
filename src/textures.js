/**
 * 手続き的に作るテクスチャ。
 *
 * 画像ファイルを持たずに質感を出すため、canvas に描いて使う。
 * 面がのっぺり単色だと「絵」に見えるので、石・金属・布に細かいムラを入れる。
 * 粗さ（roughness）マップも作り、同じ材質の中でも照りの差が出るようにする。
 */

import * as THREE from '../vendor/three.module.min.js';

const canvasCache = new Map();

function makeCanvas(key, w, h, draw) {
  if (canvasCache.has(key)) return canvasCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  canvasCache.set(key, canvas);
  return canvas;
}

function toTexture(canvas, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (Array.isArray(repeat)) tex.repeat.set(repeat[0], repeat[1]);
  else tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

/** 値ノイズ。細かいムラを作るのに使う。 */
function noise(ctx, w, h, { amount = 18, scale = 1, alpha = 1 } = {}) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const n = (Math.random() - 0.5) * amount * scale;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
      d[i + 3] = Math.round(d[i + 3] * alpha);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** しみ・汚れ。石や金属が新品に見えないようにする。 */
function blotches(ctx, w, h, { count = 60, radius = 40, color = 'rgba(0,0,0,0.06)' } = {}) {
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = radius * (0.3 + Math.random() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- 床の石畳

export function floorMaps() {
  const S = 512;
  const color = makeCanvas('floor-color', S, S, (g, w, h) => {
    g.fillStyle = '#3b4166';
    g.fillRect(0, 0, w, h);
    const tile = w / 4;
    for (let ty = 0; ty < 4; ty += 1) {
      for (let tx = 0; tx < 4; tx += 1) {
        // 1枚ずつ色をわずかに変える。同じ石が並ぶと作り物に見える。
        const v = 0.86 + Math.random() * 0.28;
        const base = (ty + tx) % 2 === 0 ? [72, 79, 120] : [60, 66, 104];
        g.fillStyle = `rgb(${base.map((c) => Math.round(c * v)).join(',')})`;
        g.fillRect(tx * tile + 2, ty * tile + 2, tile - 4, tile - 4);
        // 面取りのハイライト
        g.strokeStyle = 'rgba(190,205,255,0.07)';
        g.lineWidth = 2;
        g.strokeRect(tx * tile + 3, ty * tile + 3, tile - 6, tile - 6);
      }
    }
    blotches(g, w, h, { count: 90, radius: 46, color: 'rgba(10,14,36,0.16)' });
    blotches(g, w, h, { count: 26, radius: 30, color: 'rgba(230,220,190,0.04)' });
    noise(g, w, h, { amount: 20 });
  });

  const rough = makeCanvas('floor-rough', S, S, (g, w, h) => {
    g.fillStyle = '#b4b4b4';
    g.fillRect(0, 0, w, h);
    // 歩く場所だけ磨り減って照りが出る
    const worn = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.55);
    worn.addColorStop(0, 'rgba(90,90,90,0.75)');
    worn.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = worn;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, { count: 70, radius: 50, color: 'rgba(255,255,255,0.12)' });
    noise(g, w, h, { amount: 26 });
  });

  return {
    map: toTexture(color, { repeat: 7 }),
    roughnessMap: toTexture(rough, { repeat: 7, srgb: false }),
  };
}

// ---------------------------------------------------------------- 壁の石積み

export function wallMaps() {
  const W = 512;
  const H = 256;
  const color = makeCanvas('wall-color', W, H, (g, w, h) => {
    g.fillStyle = '#2a3058';
    g.fillRect(0, 0, w, h);
    const rows = 6;
    const bh = h / rows;
    for (let r = 0; r < rows; r += 1) {
      const offset = (r % 2) * 0.5;
      const cols = 5;
      const bw = w / cols;
      for (let c = -1; c <= cols; c += 1) {
        const x = (c + offset) * bw;
        const v = 0.82 + Math.random() * 0.34;
        g.fillStyle = `rgb(${Math.round(56 * v)},${Math.round(63 * v)},${Math.round(104 * v)})`;
        g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
        g.strokeStyle = 'rgba(180,195,255,0.055)';
        g.lineWidth = 1.5;
        g.strokeRect(x + 2.5, r * bh + 2.5, bw - 5, bh - 5);
      }
    }
    blotches(g, w, h, { count: 80, radius: 40, color: 'rgba(8,12,32,0.22)' });
    noise(g, w, h, { amount: 18 });
  });

  const rough = makeCanvas('wall-rough', W, H, (g, w, h) => {
    g.fillStyle = '#d2d2d2';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, { count: 60, radius: 38, color: 'rgba(255,255,255,0.1)' });
    noise(g, w, h, { amount: 24 });
  });

  return {
    map: toTexture(color, { repeat: [3, 1.4] }),
    roughnessMap: toTexture(rough, { repeat: [3, 1.4], srgb: false }),
  };
}

// ---------------------------------------------------------------- 鋼（よろい・剣）

export function steelMaps() {
  const S = 256;
  const color = makeCanvas('steel-color', S, S, (g, w, h) => {
    g.fillStyle = '#9aa3bb';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, { count: 40, radius: 28, color: 'rgba(20,26,48,0.14)' });
    blotches(g, w, h, { count: 20, radius: 20, color: 'rgba(255,250,235,0.06)' });
    noise(g, w, h, { amount: 12 });
  });

  const rough = makeCanvas('steel-rough', S, S, (g, w, h) => {
    g.fillStyle = '#4e4e4e';
    g.fillRect(0, 0, w, h);
    // 使い込まれた擦り傷。これが入るだけで「作り物の金属」から離れる。
    for (let i = 0; i < 180; i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 6 + Math.random() * 40;
      const a = Math.random() * Math.PI;
      g.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`;
      g.lineWidth = 0.6 + Math.random() * 1.1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    blotches(g, w, h, { count: 34, radius: 34, color: 'rgba(0,0,0,0.18)' });
    noise(g, w, h, { amount: 22 });
  });

  return {
    map: toTexture(color, { repeat: 2 }),
    roughnessMap: toTexture(rough, { repeat: 2, srgb: false }),
  };
}

// ---------------------------------------------------------------- 岩

export function rockMaps() {
  const S = 256;
  const color = makeCanvas('rock-color', S, S, (g, w, h) => {
    g.fillStyle = '#6e7486';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, { count: 70, radius: 36, color: 'rgba(24,28,44,0.26)' });
    blotches(g, w, h, { count: 30, radius: 26, color: 'rgba(225,230,245,0.08)' });
    noise(g, w, h, { amount: 30 });
  });
  const rough = makeCanvas('rock-rough', S, S, (g, w, h) => {
    g.fillStyle = '#e4e4e4';
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, { count: 50, radius: 34, color: 'rgba(120,120,120,0.3)' });
    noise(g, w, h, { amount: 28 });
  });
  return {
    map: toTexture(color, { repeat: 1.6 }),
    roughnessMap: toTexture(rough, { repeat: 1.6, srgb: false }),
  };
}

// ---------------------------------------------------------------- 木（桶）

export function woodMaps() {
  const S = 256;
  const color = makeCanvas('wood-color', S, S, (g, w, h) => {
    g.fillStyle = '#7a5433';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i += 1) {
      const x = (i / 26) * w + (Math.random() - 0.5) * 6;
      const v = 0.75 + Math.random() * 0.5;
      g.strokeStyle = `rgba(${Math.round(120 * v)},${Math.round(82 * v)},${Math.round(48 * v)},0.85)`;
      g.lineWidth = 2 + Math.random() * 5;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (Math.random() - 0.5) * 10, h);
      g.stroke();
    }
    blotches(g, w, h, { count: 36, radius: 30, color: 'rgba(30,18,8,0.22)' });
    noise(g, w, h, { amount: 20 });
  });
  const rough = makeCanvas('wood-rough', S, S, (g, w, h) => {
    g.fillStyle = '#cfcfcf';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, { amount: 30 });
  });
  return {
    map: toTexture(color, { repeat: [2, 1] }),
    roughnessMap: toTexture(rough, { repeat: [2, 1], srgb: false }),
  };
}

// ---------------------------------------------------------------- 光の粒

/** 加算合成で使う、中心が明るい丸。粒・光球・軌跡に使い回す。 */
export function glowSprite() {
  const S = 128;
  const canvas = makeCanvas('glow', S, S, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 星。四角い点にならないよう、丸く描いたものを貼る。 */
export function starSprite() {
  const S = 64;
  const canvas = makeCanvas('star', S, S, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
