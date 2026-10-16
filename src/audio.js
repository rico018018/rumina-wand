/**
 * 効果音。音声ファイルは使わず WebAudio で合成する（無料運用・追加ダウンロードなし）。
 *
 * 【方針】
 * - 3歳が驚かない音にする。立ち上がりをなだらかにし、短く、音量を控えめにする。
 * - 失敗音は「小さな不発音」。叱るような音にしない。
 * - 鳴っている長さを返す。呼び出し側がその分だけマイクを抑制して誤発動を防ぐ。
 */

const MASTER_CEILING = 0.55;

/** 呪文ごとの音の性格（音階と波形だけ変える。けたたましくしない） */
const SPELL_TONES = {
  accio: { notes: [523.25, 659.25, 783.99], type: 'triangle', noteMs: 130 },
  stupefy: { notes: [349.23, 261.63], type: 'sine', noteMs: 180 },
  reducto: { notes: [196.0, 146.83], type: 'sawtooth', noteMs: 150, gain: 0.5 },
  protego: { notes: [392.0, 493.88, 587.33], type: 'sine', noteMs: 170 },
  rennervate: { notes: [440.0, 554.37, 659.25, 880.0], type: 'sine', noteMs: 120 },
  episkey: { notes: [659.25, 783.99], type: 'sine', noteMs: 190 },
  expelliarmus: { notes: [587.33, 392.0, 293.66], type: 'triangle', noteMs: 110 },
  rictusempra: { notes: [783.99, 880.0, 783.99, 987.77], type: 'triangle', noteMs: 90 },
  serpensortia: { notes: [311.13, 349.23, 311.13], type: 'sine', noteMs: 160, vibrato: true },
  slugulas_eructo: { notes: [196.0, 174.61, 155.56], type: 'sine', noteMs: 150 },
  impedimenta: { notes: [329.63, 261.63, 196.0], type: 'sine', noteMs: 200 },
  vipera_evanesca: { notes: [587.33, 440.0, 329.63], type: 'sine', noteMs: 140 },
  finite_incantatem: { notes: [523.25, 392.0, 523.25, 659.25], type: 'sine', noteMs: 150 },
  everte_statum: { notes: [440.0, 293.66], type: 'triangle', noteMs: 150 },
};

const FALLBACK_TONE = { notes: [523.25, 659.25], type: 'sine', noteMs: 150 };

export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.unlockError = null;
    this.supported = typeof globalThis.AudioContext === 'function' || typeof globalThis.webkitAudioContext === 'function';
  }

  /** 必ずユーザー操作（開始ボタン）から呼ぶ。iOS は操作なしで音を鳴らせない。 */
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
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // 無音を一瞬鳴らして iOS の出力を起こす
      const osc = this.ctx.createOscillator();
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

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master) {
      this.master.gain.value = this.volume * MASTER_CEILING;
    }
  }

  get ready() {
    return Boolean(this.ctx && this.master);
  }

  #tone({ freq, startAt, durationMs, type = 'sine', gain = 0.6, vibrato = false, slideTo = null }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = startAt;
    const dur = durationMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);

    const env = ctx.createGain();
    // なだらかな立ち上がり（驚かせない）
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.05, dur * 0.35));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    // 耳に刺さる高域を落とす
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;

    osc.connect(env).connect(lp).connect(this.master);

    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 6;
      lfoGain.gain.value = freq * 0.03;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur);
    }

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 発動待ち時間に鳴らす「ためる音」。指定時間だけ静かに上がる。 */
  playCharge(durationMs, colorHint = 0) {
    if (!this.ready) return 0;
    const t0 = this.ctx.currentTime;
    const dur = Math.max(120, durationMs) / 1000;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const base = 220 + (colorHint % 7) * 15;
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.linearRampToValueAtTime(base * 2, t0 + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.18, t0 + dur * 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    return durationMs;
  }

  /** 呪文の成功音。@returns 鳴っている長さ（ミリ秒） */
  playCast(spellId) {
    if (!this.ready) return 0;
    const tone = SPELL_TONES[spellId] || FALLBACK_TONE;
    const t0 = this.ctx.currentTime + 0.01;
    tone.notes.forEach((freq, i) => {
      this.#tone({
        freq,
        startAt: t0 + (i * tone.noteMs) / 1000,
        durationMs: tone.noteMs * 1.6,
        type: tone.type,
        gain: tone.gain ?? 0.5,
        vibrato: Boolean(tone.vibrato),
      });
    });
    return tone.notes.length * tone.noteMs + tone.noteMs * 0.6 + 60;
  }

  /** 認識できなかったときの小さな不発音（叱る音にしない） */
  playFailure() {
    if (!this.ready) return 0;
    const t0 = this.ctx.currentTime + 0.01;
    this.#tone({ freq: 196, startAt: t0, durationMs: 220, type: 'sine', gain: 0.3, slideTo: 130 });
    return 260;
  }

  /** 正しく唱えられたが対象がないとき。失敗音とは別の、穏やかな音。 */
  playNoTarget() {
    if (!this.ready) return 0;
    const t0 = this.ctx.currentTime + 0.01;
    this.#tone({ freq: 440, startAt: t0, durationMs: 180, type: 'sine', gain: 0.3 });
    this.#tone({ freq: 440, startAt: t0 + 0.2, durationMs: 180, type: 'sine', gain: 0.22 });
    return 420;
  }

  /** 上限に達したとき */
  playAtCap() {
    if (!this.ready) return 0;
    const t0 = this.ctx.currentTime + 0.01;
    this.#tone({ freq: 523.25, startAt: t0, durationMs: 160, type: 'triangle', gain: 0.28 });
    this.#tone({ freq: 523.25, startAt: t0 + 0.18, durationMs: 160, type: 'triangle', gain: 0.22 });
    return 380;
  }

  /** 聞き取りを始めたことを知らせる小さな音 */
  playListenStart() {
    if (!this.ready) return 0;
    this.#tone({ freq: 880, startAt: this.ctx.currentTime + 0.01, durationMs: 120, type: 'sine', gain: 0.22 });
    return 140;
  }

  /** 色設定のプレビュー用。世界の状態は変えない短い光に添える音。 */
  playPreview() {
    if (!this.ready) return 0;
    this.#tone({ freq: 659.25, startAt: this.ctx.currentTime + 0.01, durationMs: 180, type: 'sine', gain: 0.3 });
    return 220;
  }
}
