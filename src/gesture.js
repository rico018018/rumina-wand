/** Fixed-camera, local-only experimental downward-motion detector.
 * Detects image motion, NOT the identity of a hand/wand. No video is stored/uploaded.
 */
export class DownstrokeGate {
  constructor({ travel = 0.065, cooldownMs = 1100 } = {}) { this.travel = travel; this.cooldownMs = cooldownMs; this.reset(); }
  reset() { this.samples = []; this.lastFire = -Infinity; }
  feed({ time, dx = 0, dy = 0, confidence = 0, globalMotion = false }) {
    if (globalMotion || confidence < 0.35 || dy <= 0 || Math.abs(dx) > dy * 1.6) {
      this.samples = []; return false;
    }
    this.samples.push({ time, dy });
    this.samples = this.samples.filter(s => time - s.time <= 320);
    if (this.samples.length >= 2 && this.samples.reduce((n, s) => n + s.dy, 0) >= this.travel && time - this.lastFire > this.cooldownMs) {
      this.lastFire = time; this.samples = []; return true;
    }
    return false;
  }
}

// Robust small-block matching: positive dy means movement downward in camera pixels.
export function estimateFlow(previous, current, width, height, roi = { x: .15, y: .08, w: .7, h: .75 }) {
  const vectors = []; let changed = 0;
  for (let i = 0; i < current.length; i++) if (Math.abs(current[i] - previous[i]) > 25) changed++;
  if (changed / current.length > .48) return { dx: 0, dy: 0, confidence: 0, globalMotion: true };
  for (let y = Math.max(10, Math.floor(roi.y * height)); y < Math.min(height - 10, (roi.y + roi.h) * height); y += 8) {
    for (let x = Math.max(10, Math.floor(roi.x * width)); x < Math.min(width - 10, (roi.x + roi.w) * width); x += 8) {
      let min = 255, max = 0, still = 0;
      for (let by = -2; by <= 2; by++) for (let bx = -2; bx <= 2; bx++) {
        const i = (y + by) * width + x + bx; min = Math.min(min, previous[i]); max = Math.max(max, previous[i]); still += Math.abs(previous[i] - current[i]);
      }
      if (max - min < 22 || still / 25 < 8) continue;
      let best = still, vx = 0, vy = 0;
      for (let dy = -8; dy <= 8; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
        let err = 0;
        for (let by = -2; by <= 2; by++) for (let bx = -2; bx <= 2; bx++) err += Math.abs(previous[(y + by) * width + x + bx] - current[(y + by + dy) * width + x + bx + dx]);
        if (err < best) { best = err; vx = dx; vy = dy; }
      }
      if (best < still * .65 && best / 25 < 30) vectors.push({ dx: vx, dy: vy });
    }
  }
  const down = vectors.filter(v => v.dy > 0 && Math.abs(v.dx) <= v.dy * 1.6);
  const median = a => a.sort((a,b) => a-b)[Math.floor(a.length / 2)] || 0;
  // Broad coherent motion is probably a moved phone, not a local arm movement.
  const globalMotion = vectors.length > 60 && down.length / vectors.length > .8;
  return { dx: median(down.map(v => v.dx)) / width, dy: median(down.map(v => v.dy)) / height,
    confidence: down.length < 3 ? 0 : down.length / Math.max(vectors.length, 1), globalMotion };
}

export class CameraGesture {
  constructor({ onStroke, onState }) {
    this.onStroke = onStroke; this.onState = onState; this.gate = new DownstrokeGate();
    this.roi = { x: .15, y: .08, w: .7, h: .75 }; this.active = false; this.starting = false; this.error = null; this.generation = 0;
    this.video = document.createElement('video'); this.video.muted = true; this.video.playsInline = true;
    this.video.setAttribute('playsinline', ''); this.video.className = 'camera-source';
    document.body.append(this.video);
    this.canvas = document.createElement('canvas'); this.canvas.width = 160; this.canvas.height = 120;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }
  async start(facingMode = 'user') {
    this.stop(); const generation = this.generation;
    this.starting = true; this.error = null;
    this.onState('カメラの許可を待っています');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('カメラにはHTTPSと対応ブラウザが必要です');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
      this.stream = stream; this.video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (this.active) { this.stop(); this.onState('カメラが切断されました。開始し直してください'); } });
      await this.video.play();
      if (generation !== this.generation) return false;
      this.starting = false; this.active = true; this.previous = null; this.startedAt = performance.now(); this.lastFrame = 0;
      this.onState('準備中：iPhoneを固定してください');
      const step = now => {
        if (!this.active || generation !== this.generation) return;
        if (now - this.lastFrame >= 45 && this.video.readyState >= 2) {
          const gap = now - this.lastFrame; this.lastFrame = now;
          try { this.process(now, gap); } catch (err) { this.stop(); this.onState(`カメラ処理を停止：${err.message}`); return; }
        }
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step); return true;
    } catch (err) { if (generation !== this.generation) return false; this.stop(); this.error = err.message; this.onState(`開始できません：${err.message}`); return false; }
  }
  process(now, gap) {
    this.ctx.drawImage(this.video, 0, 0, 160, 120);
    const data = this.ctx.getImageData(0, 0, 160, 120).data;
    const gray = new Uint8Array(160 * 120);
    for (let i = 0; i < gray.length; i++) gray[i] = (data[i*4] + data[i*4+1]*2 + data[i*4+2]) / 4;
    if (this.previous && gap < 200 && now - this.startedAt > 1500) {
      const flow = estimateFlow(this.previous, gray, 160, 120, this.roi);
      if (this.gate.feed({ ...flow, time: now })) { this.onStroke(now); this.onState('振り下ろし候補を検知'); }
      else if (now - (this.lastState || 0) > 600) { this.onState(flow.globalMotion ? '画面全体が動いています：固定してください' : '検知中：唱えてから振り下ろす'); this.lastState = now; }
    }
    this.previous = gray;
    if (this.preview && !this.preview.hidden) {
      const c = this.preview.getContext('2d'); c.drawImage(this.video, 0, 0, 320, 240);
      c.strokeStyle = '#6df5cf'; c.lineWidth = 2; c.strokeRect(this.roi.x*320, this.roi.y*240, this.roi.w*320, this.roi.h*240);
    }
  }
  stop() {
    this.generation++; this.active = false; this.starting = false; this.error = null; cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null; this.previous = null; this.gate.reset();
    this.onState('カメラ停止');
  }
  dispose() { this.stop(); this.video.remove(); }
}

// Pure speech/motion rendezvous: late recognition only accepts a recent stroke.
export class CastGate {
  constructor({ recentMs = 450, expiryMs = 8000 } = {}) { this.recentMs = recentMs; this.expiryMs = expiryMs; this.reset(); }
  reset() { this.pending = null; this.lastStroke = -Infinity; }
  arm(spellId, now) {
    if (now - this.lastStroke <= this.recentMs) { this.lastStroke = -Infinity; this.pending = null; return spellId; }
    this.pending = { spellId, at: now }; return null;
  }
  stroke(now) {
    const p = this.pending;
    if (p && now - p.at <= this.expiryMs) { this.reset(); return p.spellId; }
    this.pending = null; this.lastStroke = now; return null;
  }
  expire(now) { if (this.pending && now - this.pending.at > this.expiryMs) { this.reset(); return true; } return false; }
}
