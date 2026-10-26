/**
 * 音声認識のラッパー（要件書 3章・4章）。
 *
 * 【正直に書いておくこと】
 * - ブラウザの音声認識は端末・ブラウザ・サービスに依存します。無料・連続動作・オフライン・
 *   高精度のいずれも保証できません。ここでは API の有無を検出し、起きたことを全部記録します。
 * - iOS Safari では continuous = true が無視され、1発話ごとに end が来る挙動が報告されています。
 *   そのため「常時待ち受け」は end を受けて自前で start() を呼び直すループで実現しています。
 *   この再開がユーザー操作なしに許可されるかは実機で確認する項目です（確認前に「対応済み」と表示しません）。
 * - これは文字列を得る機能です。発音の正しさを採点する機能ではありません。
 */

export const SpeechRecognitionCtor =
  (typeof globalThis !== 'undefined' && (globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition)) || null;

export function detectSpeechSupport() {
  const ctor = SpeechRecognitionCtor;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    hasApi: Boolean(ctor),
    apiName: globalThis.SpeechRecognition ? 'SpeechRecognition' : (globalThis.webkitSpeechRecognition ? 'webkitSpeechRecognition' : null),
    hasMediaDevices: Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia),
    isSecureContext: typeof isSecureContext !== 'undefined' ? isSecureContext : null,
    userAgent: ua,
    // 画面の読み上げ用に、分かっていることだけを書く
    note: ctor
      ? 'このブラウザに音声認識APIがあります。実際の精度・連続動作は実機で確認します。'
      : 'このブラウザに音声認識APIがありません。手動のボタンだけで遊べます。',
  };
}

export const DEFAULT_PUSH_WINDOW_MS = 5000;
const RAPID_END_MS = 400;
const RESTART_DELAY_MIN_MS = 250;
const RESTART_DELAY_MAX_MS = 5000;
/** 同じ認識結果が続けて通知されたとき、1回しか発動させないための無視時間 */
const DUPLICATE_WINDOW_MS = 1800;

/**
 * @typedef {'idle'|'listening'|'suppressed'|'restarting'|'unavailable'} SpeechState
 */

export class SpeechEngine {
  /**
   * @param {{
   *   lang?: string,
   *   pushWindowMs?: number,
   *   onEvent?: (entry: {type:string, at:number, [k:string]: any}) => void,
   *   onStateChange?: (state: SpeechState, info: object) => void,
   *   onFinalResult?: (payload: {transcript:string, alternatives:Array<{transcript:string,confidence:number}>}) => void,
   *   onInterim?: (text: string) => void,
   * }} options
   */
  constructor(options = {}) {
    this.lang = options.lang || 'en-US';
    this.pushWindowMs = options.pushWindowMs ?? DEFAULT_PUSH_WINDOW_MS;
    this.onEvent = options.onEvent || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.onFinalResult = options.onFinalResult || (() => {});
    this.onInterim = options.onInterim || (() => {});

    this.support = detectSpeechSupport();
    this.mode = 'continuous';
    this.state = this.support.hasApi ? 'idle' : 'unavailable';
    this.wantListening = false;
    this.isActive = false;
    this.audioActive = false; this.startPending = false; this.stopping = false; this.error = null;
    this.recognition = null;

    this.suppressUntil = 0;
    this.restartDelay = RESTART_DELAY_MIN_MS;
    this.lastStartAt = 0;
    this.lastFinal = { text: '', at: 0 };

    this.stats = {
      sessions: 0,
      results: 0,
      finals: 0,
      restarts: 0,
      restartFailures: 0,
      rapidEnds: 0,
      noSpeech: 0,
      aborted: 0,
      networkErrors: 0,
      permissionErrors: 0,
      otherErrors: 0,
      duplicatesIgnored: 0,
      suppressedResults: 0,
    };

    this._timers = { push: null, restart: null, suppress: null };
  }

  #log(type, extra = {}) {
    this.onEvent({ type, at: Date.now(), ...extra });
  }

  #setState(state, info = {}) {
    if (this.state === state && !info.force) return;
    this.state = state;
    this.onStateChange(state, info);
  }

  #clearTimer(name) {
    if (this._timers[name] !== null) {
      clearTimeout(this._timers[name]);
      this._timers[name] = null;
    }
  }

  #build() {
    const rec = new SpeechRecognitionCtor();
    rec.lang = this.lang;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    // iOS では無視される可能性がある。効かない場合は onend からの再開ループで補う。
    try {
      rec.continuous = this.mode === 'continuous';
    } catch (_) {
      this.#log('continuous_set_failed');
    }

    rec.onstart = () => {
      if (rec !== this.recognition) return;
      this.startPending = false;
      if (!this.wantListening) { try { rec.abort(); } catch (_) {} return; }
      this.isActive = true;
      this.lastStartAt = Date.now();
      this.stats.sessions += 1;
      this.#log('start', { mode: this.mode, lang: this.lang });
      this.#setState('listening');
    };

    rec.onaudiostart = () => { if (rec !== this.recognition) return; this.audioActive = true; this.#log('audiostart'); this.#setState(this.state, {force:true}); };
    rec.onaudioend = () => { if (rec !== this.recognition) return; this.audioActive = false; this.#log('audioend'); this.#setState(this.state, {force:true}); };
    rec.onspeechstart = () => this.#log('speechstart');
    rec.onspeechend = () => this.#log('speechend');

    rec.onresult = (event) => {
      if (rec !== this.recognition || !this.wantListening) return;
      this.stats.results += 1;
      const now = Date.now();
      const last = event.results[event.results.length - 1];
      const alternatives = [];
      for (let i = 0; i < last.length; i += 1) {
        alternatives.push({
          transcript: last[i].transcript,
          confidence: typeof last[i].confidence === 'number' ? last[i].confidence : NaN,
        });
      }
      const transcript = (alternatives[0]?.transcript || '').trim();

      if (!last.isFinal) {
        this.#log('interim', { transcript, altCount: alternatives.length });
        this.onInterim(transcript);
        return;
      }

      this.stats.finals += 1;
      this.#log('final', {
        transcript,
        alternatives: alternatives.map((a) => `${a.transcript}${Number.isNaN(a.confidence) ? '' : ` (${a.confidence.toFixed(2)})`}`),
      });

      if (now < this.suppressUntil) {
        this.stats.suppressedResults += 1;
        this.#log('ignored_suppressed', { transcript, remainingMs: this.suppressUntil - now });
        return;
      }
      // 同じ結果が複数回通知されても1回しか発動しない
      if (transcript && transcript === this.lastFinal.text && now - this.lastFinal.at < DUPLICATE_WINDOW_MS) {
        this.stats.duplicatesIgnored += 1;
        this.#log('ignored_duplicate', { transcript });
        return;
      }
      this.lastFinal = { text: transcript, at: now };
      this.onFinalResult({ transcript, alternatives });
    };

    rec.onnomatch = () => this.#log('nomatch');

    rec.onerror = (event) => {
      if (rec !== this.recognition) return;
      const code = event.error || 'unknown';
      this.error = ['no-speech','aborted'].includes(code) ? null : code;
      // 無音・自前の停止は「呪文の失敗」ではない。権限・通信の問題とも区別する。
      if (code === 'no-speech') this.stats.noSpeech += 1;
      else if (code === 'aborted') this.stats.aborted += 1;
      else if (code === 'network') this.stats.networkErrors += 1;
      else if (code === 'not-allowed' || code === 'service-not-allowed') this.stats.permissionErrors += 1;
      else this.stats.otherErrors += 1;
      this.#log('error', { code, message: event.message || '' });
      this.#setState(this.state, {force:true});

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.wantListening = false;
        this.#setState('idle', { permissionDenied: true, code });
      }
    };

    rec.onend = () => {
      if (rec !== this.recognition) return;
      this.isActive = false; this.audioActive = false; this.startPending = false; this.stopping = false; this.recognition = null;
      const sessionMs = Date.now() - this.lastStartAt;
      this.#log('end', { sessionMs, wantListening: this.wantListening, mode: this.mode });

      if (sessionMs < RAPID_END_MS) {
        this.stats.rapidEnds += 1;
        this.restartDelay = Math.min(RESTART_DELAY_MAX_MS, Math.max(RESTART_DELAY_MIN_MS, this.restartDelay * 2));
      } else {
        this.restartDelay = RESTART_DELAY_MIN_MS;
      }

      if (!this.wantListening) {
        this.#setState('idle', {force:true});
        return;
      }
      if (this.mode === 'push') {
        // ボタン入力は1回の受け付けで終わり
        this.wantListening = false;
        this.#setState('idle');
        return;
      }
      // 常時待ち受け：抑制中なら抑制終了後に、そうでなければ少し待って再開する
      const waitMs = Math.max(this.restartDelay, this.suppressUntil - Date.now());
      this.#setState(Date.now() < this.suppressUntil ? 'suppressed' : 'restarting', { waitMs });
      this.#clearTimer('restart');
      this._timers.restart = setTimeout(() => {
        this._timers.restart = null;
        this.#tryStart('auto-restart');
      }, waitMs);
    };

    return rec;
  }

  #tryStart(reason) {
    if (!this.support.hasApi) {
      this.wantListening = false;
      this.#setState('unavailable');
      return false;
    }
    if (this.isActive) {
      this.#log('start_skipped_already_active', { reason });
      return true;
    }
    if (reason === 'auto-restart') this.stats.restarts += 1;
    try {
      this.recognition = this.#build();
      this.startPending = true; this.#setState('starting', {force:true});
      this.recognition.start();
      return true;
    } catch (err) {
      // iOS では、ユーザー操作を伴わない start() が拒否されることがある。隠さずに記録する。
      this.startPending = false; this.error = 'start-failed';
      this.stats.restartFailures += 1;
      this.#log('start_failed', { reason, name: err?.name || '', message: err?.message || String(err) });
      if (reason === 'auto-restart') {
        this.restartDelay = Math.min(RESTART_DELAY_MAX_MS, this.restartDelay * 2);
        if (this.stats.restartFailures >= 3) {
          this.wantListening = false;
          this.#setState('idle', {
            autoRestartBlocked: true,
            hint: '自動の再開ができませんでした。「きく」ボタンをもう一度押してください。',
          });
          return false;
        }
        this.#clearTimer('restart');
        this._timers.restart = setTimeout(() => {
          this._timers.restart = null;
          this.#tryStart('auto-restart');
        }, this.restartDelay);
      } else {
        this.wantListening = false;
        this.#setState('idle', { startFailed: true, message: err?.message || String(err) });
      }
      return false;
    }
  }

  /**
   * 聞き取りを開始する。必ずユーザー操作（ボタン押下）から呼ぶこと。
   * @param {'continuous'|'push'} mode
   */
  start(mode = this.mode) {
    if (this.stopping) return false;
    if (this.startPending || this.isActive) return true;
    this.error = null;
    this.mode = mode === 'push' ? 'push' : 'continuous';
    this.wantListening = true;
    this.restartDelay = RESTART_DELAY_MIN_MS;
    this.stats.restartFailures = 0;
    this.#clearTimer('push');
    const started = this.#tryStart('user');
    if (started && this.mode === 'push') {
      this._timers.push = setTimeout(() => {
        this._timers.push = null;
        this.#log('push_window_elapsed', { ms: this.pushWindowMs });
        this.stop('push_window_elapsed');
      }, this.pushWindowMs);
    }
    return started;
  }

  stop(reason = 'user') {
    this.wantListening = false;
    this.#clearTimer('push');
    this.#clearTimer('restart');
    this.#log('stop_requested', { reason });
    this.#clearTimer('suppress');
    if (this.recognition) {
      this.stopping = true;
      this.#setState('stopping', {force:true});
      try { this.recognition.abort(); }
      catch (_) {
        this.recognition = null; this.isActive = false; this.audioActive = false;
        this.startPending = false; this.stopping = false;
        this.#setState('idle', {force:true});
      }
    } else {
      this.audioActive = false; this.startPending = false; this.stopping = false;
      this.#setState('idle', {force:true});
    }
  }

  /**
   * 演出音が鳴っている間、マイクを止めて誤発動を防ぐ（要件書 4章）。
   * テレビのスピーカーから出た自分の音を拾わないようにするため、無視するだけでなく止める。
   * @param {number} ms
   */
  suppress(ms) {
    const until = Date.now() + ms;
    this.suppressUntil = Math.max(this.suppressUntil, until);
    this.#log('suppress', { ms, until: this.suppressUntil });
    if (this.isActive) {
      // onend の再開ループが suppressUntil を見て待つ
      try {
        this.recognition.stop();
      } catch (_) { /* 無視 */ }
    }
    this.#setState('suppressed', { until: this.suppressUntil, force: true });
  }

  /** 抑制が解けるまでの残り時間（ミリ秒）。子ども向けの「まって」表示に使う。 */
  suppressRemainingMs(now = Date.now()) {
    return Math.max(0, this.suppressUntil - now);
  }

  setLang(lang) {
    this.lang = lang;
    this.#log('lang_changed', { lang });
    if (this.wantListening) {
      // 次の再開から新しい言語になる
      if (this.isActive) {
        try {
          this.recognition.stop();
        } catch (_) { /* 無視 */ }
      }
    }
  }

  setPushWindowMs(ms) {
    this.pushWindowMs = ms;
  }

  dispose() {
    this.wantListening = false;
    for (const name of Object.keys(this._timers)) this.#clearTimer(name);
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (_) { /* 無視 */ }
    }
  }
}

export const RECOGNITION_LANGS = [
  { value: 'en-US', label: '英語（en-US）', note: '呪文は英語の造語。まずこちらで試す' },
  { value: 'ja-JP', label: '日本語（ja-JP）', note: 'カタカナ発音で唱える場合。実機で比較する' },
  { value: 'en-GB', label: '英語・英国（en-GB）', note: '説明書の発音に近い場合がある' },
];
