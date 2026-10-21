/**
 * 全体の組み立て。音声認識・状態管理・描画・音を1本の発動パイプラインにつなぐ。
 *
 * 【発動の順番（要件書 5章の確定要件）】
 *   音声認識の成功 → 発動待ち時間（初期値 約1秒・保護者が調整可） → 登録色の光 → 対応する演出
 * 待ち時間のあいだに子どもが杖を振る。杖の動作・ボタン・光・色はいっさい検知しない。
 *
 * 【音声と手動を同じ道にする（要件書 8章・第2段階）】
 * castSpell() が唯一の入口。音声発動も手動発動も、同じ演出と同じ状態変更を使う。
 */

import { SPELLS, SPELL_BY_ID, PHASE1_SPELL_IDS } from './spells.js';
import { matchSpell, DEFAULT_STRICTNESS, STRICTNESS_LEVELS } from './matcher.js';
import { createInitialWorld, applySpell, tickWorld, resetWorld, worldSummary } from './world.js';
import { createBrowserColorStore } from './colors.js';
import { createBrowserDiagnostics } from './diagnostics.js';
import { SpeechEngine, detectSpeechSupport, DEFAULT_PUSH_WINDOW_MS } from './speech.js';
import { AudioKit } from './audio.js';
import { MagicScene } from './scene.js';

export const SETTINGS_KEY = 'rumina-wand.settings.v1';
export const WORLD_KEY = 'rumina-wand.world.v1';

/**
 * 振り始めから着弾までの時間の目安。
 * 実際の値は呪文ごとに違い、scene.castSpellEffect() が返す impactMs を使う。
 * ここは重複発動の判定に使う保守的な見積もり。
 */
const BOLT_TRAVEL_MS = 900;
/** 演出音が鳴り終わってからマイクを戻すまでの余裕 */
const SUPPRESS_MARGIN_MS = 450;

export const DEFAULT_SETTINGS = {
  inputMode: 'push',          // 'continuous' | 'push'。既定はボタン入力（iOSの自動再開が未検証のため）
  castDelayMs: 1000,          // 発動待ち時間。要件の初期値は約1秒
  strictness: DEFAULT_STRICTNESS,
  lang: 'en-US',
  volume: 0.7,
  pushWindowMs: DEFAULT_PUSH_WINDOW_MS,
  lowPower: false,
  vanishCount: 0,             // 0 = 一度に全部（Vipera Evanesca の初期案）
  enableAllSpells: false,     // 第1段階は3呪文。保護者が明示的に14呪文へ広げる
};

function loadJSON(key, fallback) {
  try {
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export class WandApp {
  constructor({ canvas }) {
    this.support = detectSpeechSupport();
    this.colors = createBrowserColorStore();
    this.diag = createBrowserDiagnostics();
    this.audio = new AudioKit();

    this.settings = { ...DEFAULT_SETTINGS, ...loadJSON(SETTINGS_KEY, {}) };
    // 保存されていた値が壊れていても安全な範囲に収める
    this.settings.castDelayMs = Math.min(4000, Math.max(0, Number(this.settings.castDelayMs) || 0));
    this.settings.pushWindowMs = Math.min(15000, Math.max(1000, Number(this.settings.pushWindowMs) || DEFAULT_PUSH_WINDOW_MS));
    this.settings.volume = Math.min(1, Math.max(0, Number(this.settings.volume) ?? 0.7));
    if (!STRICTNESS_LEVELS[this.settings.strictness]) this.settings.strictness = DEFAULT_STRICTNESS;
    if (this.settings.inputMode !== 'continuous') this.settings.inputMode = 'push';

    this.world = this.#loadWorld();
    this.scene = new MagicScene(canvas, { lowPower: this.settings.lowPower });
    this.scene.setWorld(this.world);

    this.speech = new SpeechEngine({
      lang: this.settings.lang,
      pushWindowMs: this.settings.pushWindowMs,
      onEvent: (e) => this.diag.log({ ...e, type: `speech:${e.type}` }),
      onStateChange: (state, info) => this.#onSpeechState(state, info),
      onFinalResult: (payload) => this.#onFinalResult(payload),
      onInterim: (text) => this.#setStatus({ interim: text }),
    });

    this.audio.setVolume(this.settings.volume);

    this.inFlight = null;          // { spellId, startedAt }
    this.lastCastAt = new Map();   // spellId -> 時刻（同じ呪文の重複発動を防ぐ）
    this.status = {
      speechState: this.support.hasApi ? 'idle' : 'unavailable',
      listening: false,
      suppressedUntil: 0,
      interim: '',
      childMessage: 'したの ボタンを おしてね',
      childMode: 'idle',          // idle | listening | waiting | casting | failed | notarget
      childSpellId: null,
      parentNote: '',
    };
    this.statusListeners = new Set();
    this.worldListeners = new Set();

    this.running = false;
    this.fps = { current: 0, min: 999, samples: 0, lowSince: null, suggestLowPower: false };
    this.#startLoop();
  }

  // ------------------------------------------------------------ 保存と読み出し

  #loadWorld() {
    const saved = loadJSON(WORLD_KEY, null);
    const fresh = createInitialWorld();
    if (!saved) return fresh;
    // 形が合う項目だけを引き継ぐ。壊れていたら初期状態で始める。
    try {
      const w = createInitialWorld();
      if (Array.isArray(saved.snakes)) w.snakes = saved.snakes.slice(0, 10);
      if (Array.isArray(saved.treasures)) w.treasures = saved.treasures.slice(0, 10);
      if (Array.isArray(saved.slugs)) w.slugs = saved.slugs.slice(0, 10);
      if (Array.isArray(saved.debris)) w.debris = saved.debris.slice(0, 40);
      if (Array.isArray(saved.droppedSwords)) w.droppedSwords = saved.droppedSwords.slice(0, 3);
      if (Array.isArray(saved.rocks) && saved.rocks.length === w.rocks.length) {
        w.rocks = w.rocks.map((r, i) => ({ ...r, broken: Boolean(saved.rocks[i]?.broken) }));
      }
      if (saved.shield && typeof saved.shield === 'object') {
        w.shield.active = Boolean(saved.shield.active);
        w.shield.level = Math.min(20, Math.max(0, Number(saved.shield.level) || 0));
      }
      if (saved.armor && typeof saved.armor === 'object') {
        const sa = saved.armor;
        w.armor.standing = sa.standing !== false;
        w.armor.dented = Boolean(sa.dented);
        w.armor.holdsSword = sa.holdsSword !== false;
        w.armor.offsetZ = Math.min(0, Math.max(-3.6, Number(sa.offsetZ) || 0));
        w.armor.onSoftLanding = Boolean(sa.onSoftLanding);
        // 時間で切れる状態は引き継がない（再読み込み後に残り続けないように）
        w.armor.tickling = false;
        w.armor.tickleUntil = null;
        w.armor.speedFactor = 1;
        w.armor.slowUntil = null;
      }
      w.revision = Number(saved.revision) || 0;
      return w;
    } catch (_) {
      return fresh;
    }
  }

  #saveWorld() {
    saveJSON(WORLD_KEY, this.world);
  }

  saveSettings() {
    const ok = saveJSON(SETTINGS_KEY, this.settings);
    if (!ok) this.#setStatus({ parentNote: '設定を保存できませんでした（ブラウザの保存領域が使えません）' });
    return ok;
  }

  updateSettings(patch) {
    Object.assign(this.settings, patch);
    if (patch.volume !== undefined) this.audio.setVolume(this.settings.volume);
    if (patch.lang !== undefined) this.speech.setLang(this.settings.lang);
    if (patch.pushWindowMs !== undefined) this.speech.setPushWindowMs(this.settings.pushWindowMs);
    if (patch.lowPower !== undefined) this.scene.setLowPower(this.settings.lowPower);
    if (patch.inputMode !== undefined && this.status.listening) {
      // 入力モードを変えても色設定や世界の状態は消さない
      this.stopListening('mode_changed');
    }
    this.saveSettings();
    this.diag.log({ type: 'settings_changed', ...patch });
    this.#emitStatus();
  }

  // ------------------------------------------------------------ 状態の通知

  onStatus(fn) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  onWorld(fn) {
    this.worldListeners.add(fn);
    fn(worldSummary(this.world));
    return () => this.worldListeners.delete(fn);
  }

  #setStatus(patch) {
    Object.assign(this.status, patch);
    this.#emitStatus();
  }

  #emitStatus() {
    for (const fn of this.statusListeners) {
      try {
        fn(this.status);
      } catch (_) { /* 表示側の失敗で本体を壊さない */ }
    }
  }

  #emitWorld() {
    const summary = worldSummary(this.world);
    for (const fn of this.worldListeners) {
      try {
        fn(summary);
      } catch (_) { /* 同上 */ }
    }
  }

  // ------------------------------------------------------------ 音声

  /** 必ずユーザー操作から呼ぶ（マイク権限と音の解禁のため） */
  startListening() {
    this.audio.unlock();
    if (!this.support.hasApi) {
      this.#setStatus({
        childMessage: 'おとは つかえないよ',
        childMode: 'idle',
        parentNote: 'このブラウザに音声認識APIがありません。手動のボタンだけで遊べます。',
      });
      return false;
    }
    const started = this.speech.start(this.settings.inputMode);
    if (started) {
      this.audio.playListenStart();
      this.#setStatus({ listening: true, childMode: 'listening', childMessage: 'じゅもんを どうぞ' });
    }
    return started;
  }

  stopListening(reason = 'user') {
    this.speech.stop(reason);
    this.#setStatus({ listening: false, childMode: 'idle', childMessage: 'したの ボタンを おしてね', interim: '' });
  }

  #onSpeechState(state, info) {
    const patch = { speechState: state };
    if (state === 'listening') {
      patch.listening = true;
      if (!this.inFlight) {
        patch.childMode = 'listening';
        patch.childMessage = 'じゅもんを どうぞ';
      }
    }
    if (state === 'idle') {
      patch.listening = false;
      patch.interim = '';
      if (info?.permissionDenied) {
        patch.parentNote = 'マイクの使用が許可されませんでした。Safariの設定でマイクを許可してください。（呪文の失敗ではありません）';
        patch.childMessage = 'マイクが つかえないよ';
      } else if (info?.autoRestartBlocked) {
        patch.parentNote = info.hint || '自動の再開ができませんでした。もう一度「きく」を押してください。';
        patch.childMessage = 'もういちど ボタンを おしてね';
      } else if (!this.inFlight) {
        patch.childMode = 'idle';
      }
    }
    if (state === 'suppressed') {
      // 「まって」の表示は、何も起きていないときだけ出す。
      // 直前に出した失敗・対象なし・発動中の表示を消さない。
      const keep = ['failed', 'notarget', 'casting', 'waiting'];
      patch.childMode = keep.includes(this.status.childMode) ? this.status.childMode : 'waiting';
    }
    this.#setStatus(patch);
  }

  #onFinalResult({ transcript, alternatives }) {
    const text = (transcript || '').trim();
    if (!text) {
      // 無音は呪文の失敗ではない。失敗演出を出さない。
      this.diag.log({ type: 'empty_final_ignored' });
      return;
    }

    // 認識の代替候補を順に見る。最初に一致したものを採用する（曖昧なら失敗のまま）。
    const opts = { strictness: this.settings.strictness, extraCandidates: this.diag.extraCandidates };
    let chosen = matchSpell(text, opts);
    let chosenText = text;
    if (!chosen.matched && Array.isArray(alternatives)) {
      for (const alt of alternatives.slice(1)) {
        const t = (alt?.transcript || '').trim();
        if (!t) continue;
        const r = matchSpell(t, opts);
        if (r.matched) {
          chosen = r;
          chosenText = t;
          this.diag.log({ type: 'matched_via_alternative', transcript: t, spellId: r.spellId });
          break;
        }
      }
    }

    this.diag.recordUtterance(chosen, chosenText);

    if (!chosen.matched) {
      this.#failure(chosen, text);
      return;
    }

    const allowed = this.settings.enableAllSpells || PHASE1_SPELL_IDS.includes(chosen.spellId);
    if (!allowed) {
      // 認識はできている。失敗演出は出さない（要件：認識成功と対象なし・未対応を区別する）
      const spell = SPELL_BY_ID.get(chosen.spellId);
      this.diag.log({ type: 'spell_not_enabled', spellId: chosen.spellId, transcript: chosenText });
      const soundMs = this.audio.playNoTarget();
      this.speech.suppress(soundMs + SUPPRESS_MARGIN_MS);
      this.#setStatus({
        childMode: 'notarget',
        childSpellId: chosen.spellId,
        childMessage: 'その じゅもんは まだ つかえないよ',
        parentNote: `${spell.spelling} を認識しました。第1段階では3呪文だけ有効です（設定で14呪文を有効にできます）。`,
      });
      return;
    }

    this.castSpell(chosen.spellId, 'voice', { transcript: chosenText, match: chosen });
  }

  #failure(matchResult, transcript) {
    const reason = matchResult.reason === 'ambiguous'
      ? 'どの呪文か決められないため失敗にしました（曖昧なものは成功にしません）'
      : '許可リストの表記と一致しませんでした';
    this.scene.fizzle();
    const soundMs = this.audio.playFailure();
    this.speech.suppress(soundMs + SUPPRESS_MARGIN_MS);
    this.#setStatus({
      childMode: 'failed',
      childSpellId: null,
      childMessage: 'もう いちど いってみて',
      parentNote: `認識テキスト「${transcript}」→ 不一致。${reason}。近かった候補: ${
        (matchResult.near || []).map((n) => `${n.spellId}(距離${n.distance})`).join(', ') || 'なし'
      }`,
    });
  }

  // ------------------------------------------------------------ 発動パイプライン

  /**
   * 呪文を発動する。音声・手動の両方がここを通る。
   * @param {string} spellId
   * @param {'voice'|'manual'} source
   */
  castSpell(spellId, source = 'manual', meta = {}) {
    const spell = SPELL_BY_ID.get(spellId);
    if (!spell) {
      this.diag.log({ type: 'cast_rejected_unknown', spellId });
      return false;
    }

    const now = Date.now();
    // 約1秒の待ち時間に同じ呪文を重複発動しない
    const last = this.lastCastAt.get(spellId) || 0;
    const guardMs = this.settings.castDelayMs + BOLT_TRAVEL_MS;
    if (now - last < guardMs) {
      this.diag.log({ type: 'cast_ignored_duplicate', spellId, sinceMs: now - last, source });
      return false;
    }
    if (this.inFlight) {
      this.diag.log({ type: 'cast_ignored_busy', spellId, busyWith: this.inFlight.spellId, source });
      this.#setStatus({ childMessage: 'いま まほうが でているよ', childMode: 'waiting' });
      return false;
    }

    this.lastCastAt.set(spellId, now);
    this.inFlight = { spellId, startedAt: now, source };

    const color = this.colors.getColor(spellId);
    const delay = this.settings.castDelayMs;

    // 演出音が鳴る間はマイクを止める（テレビのスピーカーからの回り込みで誤発動しないように）
    const estimatedSoundMs = 1400;
    this.speech.suppress(delay + BOLT_TRAVEL_MS + estimatedSoundMs + SUPPRESS_MARGIN_MS);

    this.diag.log({
      type: 'cast_started',
      spellId,
      source,
      color,
      delayMs: delay,
      transcript: meta.transcript || null,
      matchMode: meta.match?.mode || null,
    });

    // 待ち時間：色は出さない。中立色の「ためる」表示と「つえを ふって」の合図だけ。
    if (delay > 0) {
      this.scene.charge(delay);
      this.audio.playCharge(delay);
    }
    this.#setStatus({
      childMode: 'waiting',
      childSpellId: spellId,
      childMessage: 'つえを ふって！',
      parentNote: `${spell.spelling} を受け付けました（${source === 'voice' ? '音声' : '手動'}）。${delay}ms 後に発光します。`,
    });

    const afterDelay = () => {
      // ① 登録色の光。まず手前で杖を振った軌跡が走り、そこから対象へ飛ぶ。
      //    （子どもは画面の前で実際に杖を振っているので、画面の魔法もその動きに重なるようにする）
      const timing = this.scene.castSpellEffect(spellId, color, { strength: 1 });
      this.audio.playSwing(spellId, timing.swingMs);
      this.#setStatus({ childMode: 'casting', childSpellId: spellId, childMessage: spell.spelling });

      // ② 光が対象に届いた瞬間に、対応する演出（＝状態変更）
      setTimeout(() => {
        const options = { now: Date.now() };
        if (this.settings.vanishCount > 0) options.vanishCount = this.settings.vanishCount;
        const outcome = applySpell(this.world, spellId, options);

        this.scene.setWorld(this.world);
        this.#saveWorld();
        this.#emitWorld();

        let soundMs;
        if (outcome.status === 'applied') {
          soundMs = this.audio.playImpact(spellId);
        } else if (outcome.status === 'at_cap') {
          soundMs = this.audio.playAtCap();
        } else {
          // 正しく唱えられたが対象がない。失敗ではないので、穏やかに示す。
          soundMs = this.audio.playNoTarget();
          this.scene.gentle(color, spellId);
        }

        this.diag.recordCast({ spellId, source, status: outcome.status, message: outcome.message, color });

        this.#setStatus({
          childMode: outcome.status === 'applied' ? 'casting' : 'notarget',
          childSpellId: spellId,
          childMessage: outcome.message,
          parentNote: `${spell.spelling}: ${outcome.status} / ${outcome.message}`,
        });

        this.speech.suppress(soundMs + SUPPRESS_MARGIN_MS);

        setTimeout(() => {
          this.inFlight = null;
          if (this.status.listening) {
            this.#setStatus({ childMode: 'listening', childMessage: 'じゅもんを どうぞ', childSpellId: null });
          } else {
            this.#setStatus({ childMode: 'idle', childSpellId: null });
          }
        }, Math.max(400, soundMs));
      }, timing.impactMs);
    };

    if (delay > 0) setTimeout(afterDelay, delay);
    else afterDelay();
    return true;
  }

  /** 保護者向けの「世界の初期化」。色設定は消さない。 */
  resetWorld() {
    resetWorld(this.world);
    this.scene.setWorld(this.world);
    this.#saveWorld();
    this.#emitWorld();
    this.diag.log({ type: 'world_reset_manual' });
    this.#setStatus({ childMessage: 'せかいが もとに もどった', childMode: 'idle', childSpellId: null });
  }

  /** 色設定のプレビュー。短い光の見本だけ。世界の状態は変えない。 */
  previewColor(spellId) {
    const color = this.colors.getColor(spellId);
    this.audio.unlock();
    this.scene.preview(color);
    this.audio.playPreview();
    this.diag.log({ type: 'color_preview', spellId, color });
  }

  /** 第1段階で音声が有効な呪文 */
  get enabledSpellIds() {
    return this.settings.enableAllSpells ? SPELLS.map((s) => s.id) : [...PHASE1_SPELL_IDS];
  }

  snapshotForReport() {
    return {
      support: {
        音声認識API: this.support.hasApi ? this.support.apiName : 'なし',
        'getUserMediaの有無': this.support.hasMediaDevices ? 'あり' : 'なし',
        安全なコンテキスト: String(this.support.isSecureContext),
        画面サイズ: `${globalThis.innerWidth}x${globalThis.innerHeight}`,
        devicePixelRatio: String(globalThis.devicePixelRatio),
        UserAgent: this.support.userAgent,
      },
      settings: {
        入力モード: this.settings.inputMode === 'continuous' ? '常時待ち受け' : 'ボタン入力',
        発動待ち時間: `${this.settings.castDelayMs}ms`,
        認識の厳しさ: this.settings.strictness,
        認識言語: this.settings.lang,
        ボタン入力の受付時間: `${this.settings.pushWindowMs}ms`,
        有効な呪文: this.settings.enableAllSpells ? '14呪文' : '3呪文（第1段階）',
        軽量描画: this.settings.lowPower ? 'オン' : 'オフ',
      },
      speechStats: { ...this.speech.stats },
      performance: {
        '直近のフレームレート': `${this.fps.current} fps`,
        '観測した最低フレームレート': this.fps.samples > 2 ? `${this.fps.min} fps` : '（まだ測れていません）',
        '軽量描画の提案が出たか': this.fps.suggestLowPower ? 'はい' : 'いいえ',
      },
    };
  }

  // ------------------------------------------------------------ 描画ループ

  #startLoop() {
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      if (!document.hidden) {
        this.#measureFps(now);
        const changed = tickWorld(this.world, Date.now());
        if (changed.changed) {
          this.scene.setWorld(this.world);
          this.#emitWorld();
        }
        this.scene.render(now);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * 実測のフレームレート。長時間遊んだときの負荷を保護者が見られるようにする。
   * 勝手に軽量描画へ切り替えることはしない（切り替えは保護者の操作）。
   */
  #measureFps(now) {
    if (!this._fpsLast) {
      this._fpsLast = now;
      this._fpsFrames = 0;
      return;
    }
    this._fpsFrames += 1;
    const elapsed = now - this._fpsLast;
    if (elapsed < 1000) return;
    const fps = Math.round((this._fpsFrames * 1000) / elapsed);
    this._fpsLast = now;
    this._fpsFrames = 0;
    this.fps.current = fps;
    this.fps.samples += 1;
    if (this.fps.samples > 2 && fps < this.fps.min) this.fps.min = fps;
    if (fps < 24 && !this.settings.lowPower) {
      if (this.fps.lowSince === null) this.fps.lowSince = now;
      else if (now - this.fps.lowSince > 8000 && !this.fps.suggestLowPower) {
        this.fps.suggestLowPower = true;
        this.diag.log({ type: 'fps_low', fps, hint: '8秒以上 24fps を下回りました。軽量描画を試してください。' });
      }
    } else {
      this.fps.lowSince = null;
    }
  }

  dispose() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.speech.dispose();
    this.scene.dispose();
  }
}
