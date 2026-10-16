/**
 * 保護者向けの診断と試験記録（要件書 4章・8章）。
 *
 * 【方針】
 * - 認識テキスト・候補・失敗理由をそのまま残す。都合の悪いログも消さない。
 * - 成功率は計算しない。実際に押された回数だけを数え、そのまま出す。
 *   「測定していない成功率」を表示しないため、分母は保護者が記録した試行数に限る。
 * - 「誤発動」は人間しか判定できない。保護者が印を付けたものだけを誤発動として数える。
 * - 認識候補の追加は保護者の明示操作。アプリが勝手に学習して一番近い呪文へ寄せることはしない。
 * - 保存先は色設定と別のキー。色設定を消さない（要件書 5章）。
 */

export const DIAG_STORAGE_KEY = 'rumina-wand.diagnostics.v1';
const MAX_LOG_ENTRIES = 600;

export const TESTER_TAGS = [
  { value: 'adult', label: '大人の声' },
  { value: 'child', label: '娘の声' },
  { value: 'wrong', label: '誤った発話（わざと違う言葉）' },
  { value: 'unset', label: '記録しない' },
];

function emptyCounts() {
  return { utterances: 0, matched: 0, applied: 0, noTarget: 0, atCap: 0, noMatch: 0, ambiguous: 0, misfire: 0 };
}

export class Diagnostics {
  constructor(storage) {
    this.storage = storage;
    this.entries = [];
    this.tester = 'unset';
    this.extraCandidates = {};
    this.counts = { adult: emptyCounts(), child: emptyCounts(), wrong: emptyCounts(), unset: emptyCounts() };
    this.lastCast = null;
    this.saveError = null;
    this.listeners = new Set();
    this.#load();
  }

  #load() {
    let raw = null;
    try {
      raw = this.storage.getItem(DIAG_STORAGE_KEY);
    } catch (_) {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.extraCandidates === 'object' && parsed.extraCandidates !== null) {
        for (const [spellId, list] of Object.entries(parsed.extraCandidates)) {
          if (Array.isArray(list)) {
            this.extraCandidates[spellId] = list.filter((x) => typeof x === 'string' && x.trim().length > 0);
          }
        }
      }
      if (parsed && typeof parsed.counts === 'object' && parsed.counts !== null) {
        for (const key of Object.keys(this.counts)) {
          if (parsed.counts[key] && typeof parsed.counts[key] === 'object') {
            this.counts[key] = { ...emptyCounts(), ...parsed.counts[key] };
          }
        }
      }
    } catch (_) {
      // 壊れていたら無視して空から始める
    }
  }

  #save() {
    try {
      this.storage.setItem(
        DIAG_STORAGE_KEY,
        JSON.stringify({ version: 1, extraCandidates: this.extraCandidates, counts: this.counts }),
      );
      this.saveError = null;
    } catch (err) {
      this.saveError = `診断データを保存できませんでした: ${err.message}`;
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (_) { /* 購読側の失敗で記録を壊さない */ }
    }
  }

  /** 何が起きたかをそのまま残す */
  log(entry) {
    const row = { at: Date.now(), ...entry };
    this.entries.push(row);
    if (this.entries.length > MAX_LOG_ENTRIES) this.entries.splice(0, this.entries.length - MAX_LOG_ENTRIES);
    this.#emit();
    return row;
  }

  setTester(tag) {
    this.tester = TESTER_TAGS.some((t) => t.value === tag) ? tag : 'unset';
    this.log({ type: 'tester_changed', tester: this.tester });
  }

  #bucket() {
    return this.counts[this.tester] || this.counts.unset;
  }

  /**
   * 発話を1回受け付けたことを記録する（無音・権限エラーは含めない）。
   * @param {object} matchResult matcher.matchSpell() の戻り値
   */
  recordUtterance(matchResult, transcript) {
    const b = this.#bucket();
    b.utterances += 1;
    if (matchResult.matched) {
      b.matched += 1;
    } else if (matchResult.reason === 'ambiguous') {
      b.ambiguous += 1;
    } else {
      b.noMatch += 1;
    }
    this.log({
      type: 'utterance',
      tester: this.tester,
      transcript,
      normalized: matchResult.normalized?.compact ?? '',
      matched: matchResult.matched,
      spellId: matchResult.matched ? matchResult.spellId : null,
      mode: matchResult.matched ? matchResult.mode : null,
      distance: matchResult.distance ?? null,
      reason: matchResult.matched ? null : matchResult.reason,
      candidate: matchResult.matched ? matchResult.candidate?.display : null,
      near: (matchResult.near || []).map((n) => `${n.spellId}:${n.display}(距離${n.distance})`),
      strictness: matchResult.strictness,
    });
    this.#save();
    this.#emit();
  }

  /** 呪文が実際に発動したときの結果（world.js の status）を記録する */
  recordCast({ spellId, source, status, message, color }) {
    const b = this.#bucket();
    if (status === 'applied') b.applied += 1;
    else if (status === 'no_target' || status === 'already') b.noTarget += 1;
    else if (status === 'at_cap') b.atCap += 1;
    const row = this.log({ type: 'cast', tester: this.tester, spellId, source, status, message, color });
    this.lastCast = row;
    this.#save();
    this.#emit();
    return row;
  }

  /**
   * 直前の発動を「誤発動」として印を付ける。保護者の判断だけで数える。
   * @returns {boolean} 印を付けられたか
   */
  markLastCastAsMisfire(note = '') {
    if (!this.lastCast) return false;
    if (this.lastCast.misfire) return true;
    this.lastCast.misfire = true;
    this.lastCast.misfireNote = note;
    const tester = this.counts[this.lastCast.tester] || this.counts.unset;
    tester.misfire += 1;
    this.log({ type: 'misfire_marked', spellId: this.lastCast.spellId, source: this.lastCast.source, note });
    this.#save();
    this.#emit();
    return true;
  }

  /** 保護者が明示的に認識候補を追加する */
  addCandidate(spellId, text) {
    const value = String(text || '').trim();
    if (!value) throw new Error('追加する認識テキストが空です。');
    if (!this.extraCandidates[spellId]) this.extraCandidates[spellId] = [];
    if (!this.extraCandidates[spellId].includes(value)) {
      this.extraCandidates[spellId].push(value);
    }
    this.log({ type: 'candidate_added', spellId, text: value });
    this.#save();
    this.#emit();
  }

  removeCandidate(spellId, text) {
    const list = this.extraCandidates[spellId];
    if (!list) return;
    const i = list.indexOf(text);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) delete this.extraCandidates[spellId];
    this.log({ type: 'candidate_removed', spellId, text });
    this.#save();
    this.#emit();
  }

  clearCandidates() {
    this.extraCandidates = {};
    this.log({ type: 'candidates_cleared' });
    this.#save();
    this.#emit();
  }

  resetCounts() {
    this.counts = { adult: emptyCounts(), child: emptyCounts(), wrong: emptyCounts(), unset: emptyCounts() };
    this.lastCast = null;
    this.log({ type: 'counts_reset' });
    this.#save();
    this.#emit();
  }

  clearLog() {
    this.entries = [];
    this.#emit();
  }

  /**
   * 実機試験の報告用テキスト。測った数だけを書く。成功率は書かない。
   */
  exportReport(extra = {}) {
    const lines = [];
    lines.push('# 実機試験の記録（ハリーポッターとるみなのまほうのつえ）');
    lines.push(`書き出し日時: ${new Date().toISOString()}`);
    if (extra.support) {
      lines.push('');
      lines.push('## 端末・ブラウザ');
      for (const [k, v] of Object.entries(extra.support)) lines.push(`- ${k}: ${v}`);
    }
    if (extra.settings) {
      lines.push('');
      lines.push('## 設定');
      for (const [k, v] of Object.entries(extra.settings)) lines.push(`- ${k}: ${v}`);
    }
    if (extra.speechStats) {
      lines.push('');
      lines.push('## 音声認識の内部カウンタ');
      for (const [k, v] of Object.entries(extra.speechStats)) lines.push(`- ${k}: ${v}`);
    }
    if (extra.performance) {
      lines.push('');
      lines.push('## 描画の負荷（実測）');
      for (const [k, v] of Object.entries(extra.performance)) lines.push(`- ${k}: ${v}`);
    }
    lines.push('');
    lines.push('## 話者別の実測回数（保護者が記録したぶんだけ）');
    for (const tag of TESTER_TAGS) {
      const c = this.counts[tag.value];
      if (!c || c.utterances === 0) continue;
      lines.push(`### ${tag.label}`);
      lines.push(`- 受け付けた発話: ${c.utterances}`);
      lines.push(`- 呪文と一致: ${c.matched}`);
      lines.push(`- 演出まで実行（applied）: ${c.applied}`);
      lines.push(`- 正しく唱えたが対象なし（no_target/already）: ${c.noTarget}`);
      lines.push(`- 上限に達した（at_cap）: ${c.atCap}`);
      lines.push(`- 一致しなかった: ${c.noMatch}`);
      lines.push(`- 曖昧で失敗にした: ${c.ambiguous}`);
      lines.push(`- 保護者が誤発動と印を付けた: ${c.misfire}`);
    }
    const anyRecorded = Object.values(this.counts).some((c) => c.utterances > 0);
    if (!anyRecorded) lines.push('（まだ記録がありません）');
    lines.push('');
    lines.push('## 保護者が追加した認識候補');
    const entries = Object.entries(this.extraCandidates);
    if (entries.length === 0) lines.push('（なし）');
    for (const [spellId, list] of entries) lines.push(`- ${spellId}: ${list.join(' / ')}`);
    lines.push('');
    lines.push('## イベントログ');
    for (const e of this.entries) {
      const time = new Date(e.at).toLocaleTimeString('ja-JP', { hour12: false });
      const rest = Object.entries(e)
        .filter(([k]) => k !== 'at' && k !== 'type')
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : String(v)}`)
        .join(' ');
      lines.push(`${time} [${e.type}] ${rest}`);
    }
    return lines.join('\n');
  }
}

export function createBrowserDiagnostics() {
  const fallback = new Map();
  try {
    const probe = '__rumina_diag_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return new Diagnostics({
      getItem: (k) => globalThis.localStorage.getItem(k),
      setItem: (k, v) => globalThis.localStorage.setItem(k, v),
      removeItem: (k) => globalThis.localStorage.removeItem(k),
    });
  } catch (_) {
    return new Diagnostics({
      getItem: (k) => (fallback.has(k) ? fallback.get(k) : null),
      setItem: (k, v) => fallback.set(k, v),
      removeItem: (k) => fallback.delete(k),
    });
  }
}
