/**
 * 効果音。音声ファイルは使わず WebAudio で合成する（無料運用・追加ダウンロードなし）。
 *
 * 【実物の杖の音との関係】
 * 実物の録音ではなく、呪文のイメージをもとに独自に合成します。
 * ここで鳴らすのは合成音です。実物に寄せられるのは「音の種類・長さ・鳴るタイミング」で、
 * それらは下の SPELL_SOUNDS を書き換えるだけで調整できるようにしてあります。
 *
 * 【構成】
 * 画面の魔法は「振り → 飛翔 → 着弾」で動くので、音も2段に分ける。
 *   playSwing(spellId, ms)  振っている間の風切り音。杖を振る手の動きに重なる。
 *   playImpact(spellId)     着弾の音。呪文ごとに性格を変える。
 * 振りの音が鳴り終わる頃に着弾音が始まるので、1本の動作として聞こえる。
 */

const MASTER_CEILING = 0.6;

/**
 * 呪文ごとの音の性格。
 * swing: 振りの風切り（start/end は周波数、noise は擦過音の量）
 * impact: 着弾（type は音の作り、notes は音階、dur は長さ）
 */
export const SPELL_SOUNDS = {
  accio:             { swing: { start: 260, end: 760, noise: 0.25 }, impact: { type: 'chime', notes: [523.25, 659.25, 783.99, 1046.5], dur: 0.5, wave: 'triangle' } },
  stupefy:           { swing: { start: 520, end: 150, noise: 0.5 },  impact: { type: 'boom', notes: [98, 73.4], dur: 0.6, wave: 'sine' } },
  reducto:           { swing: { start: 600, end: 120, noise: 0.7 },  impact: { type: 'crash', notes: [160, 110, 78], dur: 0.75, wave: 'sawtooth' } },
  protego:           { swing: { start: 220, end: 540, noise: 0.2 },  impact: { type: 'shield', notes: [392, 493.88, 587.33, 739.99], dur: 0.7, wave: 'sine' } },
  rennervate:        { swing: { start: 200, end: 620, noise: 0.18 }, impact: { type: 'chime', notes: [329.63, 440, 554.37, 659.25, 880], dur: 0.62, wave: 'sine' } },
  episkey:           { swing: { start: 300, end: 700, noise: 0.14 }, impact: { type: 'heal', notes: [659.25, 783.99, 987.77], dur: 0.7, wave: 'sine' } },
  expelliarmus:      { swing: { start: 420, end: 980, noise: 0.42 }, impact: { type: 'clang', notes: [880, 587.33, 392], dur: 0.5, wave: 'triangle' } },
  rictusempra:       { swing: { start: 480, end: 880, noise: 0.3 },  impact: { type: 'giggle', notes: [784, 880, 784, 988, 880], dur: 0.6, wave: 'triangle' } },
  serpensortia:      { swing: { start: 340, end: 180, noise: 0.55 }, impact: { type: 'hiss', notes: [311.13, 349.23, 293.66], dur: 0.8, wave: 'sine' } },
  slugulas_eructo:   { swing: { start: 300, end: 140, noise: 0.5 },  impact: { type: 'blurp', notes: [196, 165, 139], dur: 0.65, wave: 'sine' } },
  impedimenta:       { swing: { start: 420, end: 170, noise: 0.3 },  impact: { type: 'slow', notes: [330, 262, 196, 147], dur: 0.9, wave: 'sine' } },
  vipera_evanesca:   { swing: { start: 560, end: 260, noise: 0.35 }, impact: { type: 'vanish', notes: [880, 587.33, 392, 262], dur: 0.6, wave: 'sine' } },
  finite_incantatem: { swing: { start: 240, end: 660, noise: 0.22 }, impact: { type: 'chime', notes: [523.25, 392, 523.25, 659.25, 784], dur: 0.85, wave: 'sine' } },
  everte_statum:     { swing: { start: 560, end: 190, noise: 0.5 },  impact: { type: 'boom', notes: [147, 110], dur: 0.55, wave: 'triangle' } },
};

const FALLBACK = { swing: { start: 320, end: 640, noise: 0.3 }, impact: { type: 'chime', notes: [523.25, 659.25], dur: 0.5, wave: 'sine' } };

export class AudioKit {
  constructor() {
    this.ctx = null; this.sources = new Set();
    this.master = null;
    this.volume = 0.7;
    this.unlockError = null;
    this.noiseBuffer = null;
    this.supported = typeof globalThis.AudioContext === 'function' || typeof globalThis.webkitAudioContext === 'function';
  }

  /** 必ずユーザー操作（ボタン）から呼ぶ。iOS は操作なしで音を鳴らせない。 */
  unlock() {
    if (!this.supported) {
      this.unlockError = 'このブラウザは音の合成に対応していません。音なしで遊べます。';
      return false;
    }
    try {
      if (!this.ctx) {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * MASTER_CEILING;
        // 全体をわずかに丸めて、テレビのスピーカーで耳に刺さらないようにする
        this.shelf = this.ctx.createBiquadFilter();
        this.shelf.type = 'highshelf';
        this.shelf.frequency.value = 4200;
        this.shelf.gain.value = -5;
        this.master.connect(this.shelf).connect(this.ctx.destination);
        this.#makeNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
    this.sources.add(osc); osc.onended = () => this.sources.delete(osc);
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g).connect(this.master);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.02);
      this.unlockError = null;
      return true;
    } catch (err) {
      this.unlockError = `音を準備できませんでした: ${err.message}`;
      return false;
    }
  }

  #makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      // ピンクノイズ寄りにして、ザラつきを和らげる
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    this.noiseBuffer = buf;
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master) this.master.gain.value = this.volume * MASTER_CEILING;
  }

  stopAll() { for (const source of this.sources) { try { source.stop(); } catch (_) {} } this.sources.clear(); }

  get ready() { return Boolean(this.ctx && this.master); }

  // ------------------------------------------------------------ 部品

  #tone({ freq, at, dur, type = 'sine', gain = 0.5, slideTo = null, vibrato = 0, detune = 0 }) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    this.sources.add(osc); osc.onended = () => this.sources.delete(osc);
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), at + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.035, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(env).connect(this.master);
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
    this.sources.add(lfo); lfo.onended = () => this.sources.delete(lfo);
      const lg = ctx.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = freq * vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur);
    }
    osc.start(at);
    osc.stop(at + dur + 0.03);
  }

  /** 擦過音。風切り・砕ける音・ヘビの音に使う。 */
  #noise({ at, dur, gain = 0.3, from = 900, to = 300, q = 1.2, type = 'bandpass' }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    this.sources.add(src); src.onended = () => this.sources.delete(src);
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(from, at);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, to), at + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + dur * 0.22);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt).connect(env).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.03);
  }

  // ------------------------------------------------------------ 呪文の音

  /**
   * 振っている間の風切り音。画面の軌跡と同じ長さで鳴らす。
   * @returns {number} 鳴る長さ（ミリ秒）
   */
  playSwing(spellId, swingMs) {
    if (!this.ready) return 0;
    const cfg = (SPELL_SOUNDS[spellId] || FALLBACK).swing;
    const at = this.ctx.currentTime + 0.005;
    const dur = Math.max(0.12, swingMs / 1000);
    this.#noise({ at, dur, gain: 0.16 + cfg.noise * 0.2, from: cfg.start * 2.2, to: cfg.end * 2.2, q: 0.9 });
    this.#tone({ freq: cfg.start, at, dur: dur * 0.9, type: 'sine', gain: 0.16, slideTo: cfg.end });
    return swingMs;
  }

  /** Launch starts with the visual; the travel tone lasts until the reported impact time. */
  playLaunch(spellId, timing) {
    if (!this.ready) return 0;
    const cfg=(SPELL_SOUNDS[spellId]||FALLBACK).swing;
    const ms=Math.max(120,timing.impactMs);
    this.playSwing(spellId,Math.min(ms,Math.max(120,timing.swingMs)));
    const at=this.ctx.currentTime+Math.max(0,timing.swingMs)/1000;
    const dur=Math.max(.12,(timing.impactMs-timing.swingMs)/1000);
    this.#tone({freq:cfg.start*1.3,at,dur,type:'triangle',gain:.13,slideTo:cfg.end*1.5});
    this.#noise({at,dur,gain:.14+cfg.noise*.16,from:cfg.start*3,to:cfg.end*4,q:1.5});
    return ms;
  }

  /** 着弾の音。呪文ごとに作りを変える。@returns 鳴る長さ（ミリ秒） */
  playImpact(spellId) {
    if (!this.ready) return 0;
    const cfg = (SPELL_SOUNDS[spellId] || FALLBACK).impact;
    const at = this.ctx.currentTime + 0.005;
    const n = cfg.notes;
    let total = cfg.dur;

    switch (cfg.type) {
      case 'boom': { // 重く沈む
        this.#noise({ at, dur: 0.25, gain: 0.3, from: 1400, to: 120, q: 0.6, type: 'lowpass' });
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.07, dur: cfg.dur, type: cfg.wave, gain: 0.5, slideTo: f * 0.55 }));
        break;
      }
      case 'crash': { // 砕ける
        this.#noise({ at, dur: 0.42, gain: 0.42, from: 5200, to: 420, q: 0.5 });
        this.#noise({ at: at + 0.1, dur: 0.5, gain: 0.22, from: 2400, to: 180, q: 0.8 });
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.05, dur: 0.38, type: cfg.wave, gain: 0.26, slideTo: f * 0.5 }));
        break;
      }
      case 'shield': { // 張られる
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.065, dur: cfg.dur, type: cfg.wave, gain: 0.34 }));
        this.#noise({ at, dur: 0.5, gain: 0.1, from: 400, to: 1900, q: 2.2 });
        break;
      }
      case 'heal': {
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.1, dur: cfg.dur, type: cfg.wave, gain: 0.3, vibrato: 0.006 }));
        break;
      }
      case 'clang': { // 金属が弾かれる
        this.#noise({ at, dur: 0.14, gain: 0.3, from: 6000, to: 1800, q: 0.8 });
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.045, dur: 0.45, type: cfg.wave, gain: 0.38, detune: i * 7 }));
        break;
      }
      case 'giggle': {
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.085, dur: 0.16, type: cfg.wave, gain: 0.3, vibrato: 0.02 }));
        break;
      }
      case 'hiss': { // ヘビ
        this.#noise({ at, dur: 0.62, gain: 0.26, from: 3600, to: 1500, q: 1.8 });
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.1, dur: 0.4, type: cfg.wave, gain: 0.24, vibrato: 0.03 }));
        break;
      }
      case 'blurp': { // ナメクジが落ちる
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.11, dur: 0.22, type: cfg.wave, gain: 0.36, slideTo: f * 0.6 }));
        this.#noise({ at: at + 0.3, dur: 0.2, gain: 0.14, from: 900, to: 260, q: 1.4 });
        break;
      }
      case 'slow': { // だんだん遅く
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.14 + i * i * 0.02, dur: 0.34, type: cfg.wave, gain: 0.3, slideTo: f * 0.85 }));
        total = cfg.dur + 0.2;
        break;
      }
      case 'vanish': {
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.055, dur: 0.3, type: cfg.wave, gain: 0.3 - i * 0.05 }));
        this.#noise({ at, dur: 0.4, gain: 0.12, from: 2600, to: 300, q: 1.2 });
        break;
      }
      default: { // chime
        n.forEach((f, i) => this.#tone({ freq: f, at: at + i * 0.075, dur: cfg.dur, type: cfg.wave, gain: 0.34 }));
      }
    }
    // A lower resonant layer and delayed harmonics give the visual bloom a spatial tail.
    const root=n[0];
    this.#tone({freq:Math.max(55,root/3),at,dur:.8,type:'sine',gain:.12,slideTo:Math.max(45,root/4)});
    for(let i=0;i<3;i++)this.#tone({freq:n[i%n.length]*(i===2?2:1),at:at+.28+i*.22,dur:.65,type:'sine',gain:.085/(i+1),detune:(i-1)*6});
    total=Math.max(total,(n.length-1)*.14+cfg.dur,1.4);
    return Math.round(total * 1000) + 120;
  }

  /** 発動待ち時間の「ためる音」。静かに上がる。 */
  playCharge(durationMs) {
    if (!this.ready) return 0;
    const at = this.ctx.currentTime;
    const dur = Math.max(0.12, durationMs / 1000);
    const osc = this.ctx.createOscillator();
    this.sources.add(osc); osc.onended = () => this.sources.delete(osc);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, at);
    osc.frequency.linearRampToValueAtTime(430, at + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.14, at + dur * 0.85);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    this.#noise({ at, dur, gain: 0.05, from: 300, to: 1200, q: 3 });
    return durationMs;
  }

  /** 認識できなかったときの小さな不発音（叱る音にしない） */
  playFailure() {
    if (!this.ready) return 0;
    const at = this.ctx.currentTime + 0.005;
    this.#tone({ freq: 210, at, dur: 0.26, type: 'sine', gain: 0.26, slideTo: 132 });
    this.#noise({ at, dur: 0.18, gain: 0.08, from: 800, to: 220, q: 1.5 });
    return 300;
  }

  /** 正しく唱えたが対象がないとき。失敗音とは別の、穏やかな音。 */
  playNoTarget() {
    if (!this.ready) return 0;
    const at = this.ctx.currentTime + 0.005;
    this.#tone({ freq: 440, at, dur: 0.2, type: 'sine', gain: 0.26 });
    this.#tone({ freq: 440, at: at + 0.22, dur: 0.2, type: 'sine', gain: 0.18 });
    return 460;
  }

  playAtCap() {
    if (!this.ready) return 0;
    const at = this.ctx.currentTime + 0.005;
    this.#tone({ freq: 523.25, at, dur: 0.17, type: 'triangle', gain: 0.24 });
    this.#tone({ freq: 523.25, at: at + 0.19, dur: 0.17, type: 'triangle', gain: 0.18 });
    return 400;
  }

  playListenStart() {
    if (!this.ready) return 0;
    this.#tone({ freq: 880, at: this.ctx.currentTime + 0.005, dur: 0.13, type: 'sine', gain: 0.2 });
    return 150;
  }

  /** 色設定のプレビュー用。世界の状態は変えない短い光に添える音。 */
  playPreview() {
    if (!this.ready) return 0;
    const at = this.ctx.currentTime + 0.005;
    this.#noise({ at, dur: 0.22, gain: 0.1, from: 700, to: 1800, q: 1.2 });
    this.#tone({ freq: 659.25, at: at + 0.04, dur: 0.2, type: 'sine', gain: 0.26 });
    return 280;
  }
}
