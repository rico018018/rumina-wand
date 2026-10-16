/**
 * 呪文ごとの発光色設定（要件書 5章「呪文ごとの発光色設定」）。
 *
 * 【前提】
 * - 実物の玩具の杖のLED色を検知・自動同期する機能ではありません。
 *   カメラ権限も使いません。保護者がテレビを見ながら近い色へ手で寄せるための設定です。
 * - 初期色はすべて「仮の色」です。実物確認済みかどうかは保護者が明示的に設定します。
 *   色を変更しただけでは自動的に確認済みになりません。
 * - 保存先はブラウザ内の保存領域（localStorage）。設定用サーバーやアカウントは不要です。
 *   同じURLなら再公開後も同じ保存領域を引き継ぎます。
 */

import { SPELLS, SPELL_BY_ID } from './spells.js';

export const STORAGE_KEY = 'rumina-wand.spell-colors.v1';
export const EXPORT_VERSION = 1;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value);
}

export function normalizeHexColor(value) {
  return String(value).toUpperCase();
}

function defaultsFor(spellId) {
  const spell = SPELL_BY_ID.get(spellId);
  return { color: spell.defaultColor, source: 'default', verified: false };
}

function assertKnownSpell(spellId) {
  if (!SPELL_BY_ID.has(spellId)) {
    throw new Error(`知らない呪文IDです: ${spellId}`);
  }
}

export class ColorStore {
  /**
   * @param {{getItem:Function,setItem:Function,removeItem:Function}} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.loadError = null;
    this.saveError = null;
    this.listeners = new Set();
    this.entries = new Map(SPELLS.map((s) => [s.id, defaultsFor(s.id)]));
    this.#load();
  }

  #load() {
    let raw = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch (err) {
      this.loadError = `保存領域を読めませんでした: ${err.message}`;
      return;
    }
    if (raw === null || raw === '') return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.loadError = '保存されていた色設定が壊れていたため、仮の初期色で起動しました。';
      return;
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.spells !== 'object' || parsed.spells === null) {
      this.loadError = '保存されていた色設定の形式が違ったため、仮の初期色で起動しました。';
      return;
    }
    for (const [spellId, value] of Object.entries(parsed.spells)) {
      if (!SPELL_BY_ID.has(spellId) || !value || typeof value !== 'object') continue;
      const entry = this.entries.get(spellId);
      if (isValidHexColor(value.color)) {
        entry.color = normalizeHexColor(value.color);
        entry.source = value.source === 'user' ? 'user' : 'default';
      }
      if (typeof value.verified === 'boolean') entry.verified = value.verified;
    }
  }

  #save() {
    const payload = {
      version: EXPORT_VERSION,
      savedAt: new Date().toISOString(),
      spells: Object.fromEntries([...this.entries].map(([id, e]) => [id, { ...e }])),
    };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.saveError = null;
    } catch (err) {
      this.saveError = `色設定を保存できませんでした（${err.message}）。このページを閉じると設定が消えます。`;
    }
  }

  #emit(changedSpellIds) {
    for (const fn of this.listeners) {
      try {
        fn(changedSpellIds);
      } catch (_) { /* 購読側の失敗で設定操作を壊さない */ }
    }
  }

  /** 色が変わったときに呼ばれる購読を登録する */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** @returns {{color:string, source:'default'|'user', verified:boolean, isProvisional:boolean}} */
  get(spellId) {
    assertKnownSpell(spellId);
    const e = this.entries.get(spellId);
    return { ...e, isProvisional: e.source === 'default' };
  }

  getColor(spellId) {
    return this.get(spellId).color;
  }

  /** 14呪文を定義順で一覧する（設定画面の表示順） */
  list() {
    return SPELLS.map((spell) => ({ spell, ...this.get(spell.id) }));
  }

  setColor(spellId, color) {
    assertKnownSpell(spellId);
    if (!isValidHexColor(color)) {
      throw new Error(`色は #RRGGBB の形式で指定してください: ${String(color)}`);
    }
    const entry = this.entries.get(spellId);
    entry.color = normalizeHexColor(color);
    entry.source = 'user';
    this.#save();
    this.#emit([spellId]);
  }

  /** 実物確認済みかどうか。保護者が明示的に操作したときだけ変わる。 */
  setVerified(spellId, verified) {
    assertKnownSpell(spellId);
    this.entries.get(spellId).verified = Boolean(verified);
    this.#save();
    this.#emit([spellId]);
  }

  resetSpell(spellId) {
    assertKnownSpell(spellId);
    this.entries.set(spellId, defaultsFor(spellId));
    this.#save();
    this.#emit([spellId]);
  }

  resetAll() {
    for (const spell of SPELLS) this.entries.set(spell.id, defaultsFor(spell.id));
    this.#save();
    this.#emit(SPELLS.map((s) => s.id));
  }

  exportJSON() {
    return JSON.stringify(
      {
        version: EXPORT_VERSION,
        app: 'ハリーポッターとるみなのまほうのつえ',
        exportedAt: new Date().toISOString(),
        spells: Object.fromEntries([...this.entries].map(([id, e]) => [id, { ...e }])),
      },
      null,
      2,
    );
  }

  /**
   * 書き出したデータを読み込む。呪文IDと色形式を検証し、不正な項目は適用しない。
   * @returns {{applied:number, rejected:Array<{spellId:string, reason:string}>}}
   */
  importJSON(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error('読み込みに失敗しました: JSONとして解釈できません。');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('読み込みに失敗しました: 色設定のデータではありません。');
    }
    if (parsed.version !== EXPORT_VERSION) {
      throw new Error(`読み込みに失敗しました: 対応していない形式です（version=${String(parsed.version)}）。`);
    }
    if (!parsed.spells || typeof parsed.spells !== 'object' || Array.isArray(parsed.spells)) {
      throw new Error('読み込みに失敗しました: spells がありません。');
    }

    const rejected = [];
    const changed = [];
    for (const [spellId, value] of Object.entries(parsed.spells)) {
      if (!SPELL_BY_ID.has(spellId)) {
        rejected.push({ spellId, reason: '知らない呪文ID' });
        continue;
      }
      if (!value || typeof value !== 'object' || !isValidHexColor(value.color)) {
        rejected.push({ spellId, reason: '色が #RRGGBB 形式ではない' });
        continue;
      }
      const entry = this.entries.get(spellId);
      entry.color = normalizeHexColor(value.color);
      entry.source = value.source === 'default' ? 'default' : 'user';
      if (typeof value.verified === 'boolean') entry.verified = value.verified;
      changed.push(spellId);
    }
    this.#save();
    this.#emit(changed);
    return { applied: changed.length, rejected };
  }
}

/** ブラウザ用。localStorage が使えない環境でも落ちない代替を渡す。 */
export function createBrowserColorStore() {
  const fallback = new Map();
  const safe = {
    getItem(k) {
      return globalThis.localStorage.getItem(k);
    },
    setItem(k, v) {
      globalThis.localStorage.setItem(k, v);
    },
    removeItem(k) {
      globalThis.localStorage.removeItem(k);
    },
  };
  try {
    const probe = '__rumina_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return new ColorStore(safe);
  } catch (_) {
    return new ColorStore({
      getItem: (k) => (fallback.has(k) ? fallback.get(k) : null),
      setItem: (k, v) => {
        fallback.set(k, v);
        throw new Error('このブラウザでは保存領域が使えません（プライベートモードなど）');
      },
      removeItem: (k) => fallback.delete(k),
    });
  }
}
