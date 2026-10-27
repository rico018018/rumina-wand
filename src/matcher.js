/**
 * 呪文の判定。
 *
 * 【方針（要件書 4章）】
 * - これは「音声を文字にした結果の文字列照合」です。発音の正しさを採点する機能ではありません。
 *   一致したことを「発音を正確に評価できた」とは称しません。
 * - strictは登録表記の一致。childは登録表記・短縮形を基に音の揺れも比較します。
 * - 「何でも一番近い呪文へ割り当てる」処理は実装しません。複数の呪文に一致した場合は失敗にします。
 * - 既定は child。日本語の音の揺れと限定した短縮形を許容し、僅差なら棄却します。
 */

import { SPELLS } from './spells.js';

export const STRICTNESS_LEVELS = {
  child: {
    label: 'こども向け（おすすめ）',
    description: '日本語の音の抜け・言い換え・長い呪文の短縮形に対応。複数の呪文に近い場合は聞き直します。',
    isDefault: true, maxDistanceShort: 0, maxDistanceLong: 0,
  },
  strict: {
    label: 'きびしい',
    description: '正規化後の完全一致だけを成功にする。1文字でも違えば失敗。',
    isDefault: false,
    maxDistanceShort: 0,
    maxDistanceLong: 0,
  },
  normal: {
    label: 'ふつう',
    description: '1文字違いまで成功にする。ただし一致する呪文がちょうど1つのときだけ。',
    isDefault: false,
    maxDistanceShort: 1,
    maxDistanceLong: 1,
  },
  loose: {
    label: 'ゆるい',
    description: '短い呪文は1文字違い、7文字以上の呪文は2文字違いまで成功にする。曖昧なら失敗。',
    isDefault: false,
    maxDistanceShort: 1,
    maxDistanceLong: 2,
  },
};

export const DEFAULT_STRICTNESS = 'child';
const LONG_CANDIDATE_MIN_LENGTH = 7;
/** 文中から呪文を取り出すとき、候補の語数＋この数までの発話なら探す */
const WINDOW_TOKEN_SLACK = 2;

const SEPARATOR_RE = /[\s　\-_/,.!?;:'"“”‘’()[\]{}。、，．！？・…ー~]+/g;
const STRIP_RE = /[^0-9a-z぀-ゟ゠-ヿ一-鿿ｦ-ﾟ]/g;

function hiraganaToKatakana(text) {
  return text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/**
 * 認識テキストを比較用に正規化する。
 * @returns {{raw: string, tokens: string[], spaced: string, compact: string}}
 */
export function normalizeUtterance(text) {
  const raw = typeof text === 'string' ? text : '';
  let s = raw.normalize('NFKC').toLowerCase();
  s = hiraganaToKatakana(s);
  const tokens = s
    .split(SEPARATOR_RE)
    .map((t) => t.replace(STRIP_RE, ''))
    .filter((t) => t.length > 0);
  return { raw, tokens, spaced: tokens.join(' '), compact: tokens.join('') };
}

/** 上限付きレーベンシュタイン距離。上限を超えたら maxDistance + 1 を返す。 */
function boundedDistance(a, b, maxDistance) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (maxDistance === 0) return 1;

  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    let rowMin = cur[0];
    const from = Math.max(1, i - maxDistance);
    const to = Math.min(b.length, i + maxDistance);
    for (let j = 1; j <= b.length; j += 1) {
      if (j < from || j > to) {
        cur[j] = maxDistance + 1;
        continue;
      }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length];
}

/**
 * 呪文ごとの候補索引を組み立てる。
 * 綴り・発音ガイド・カタカナ目安・内蔵候補・保護者が追加した候補を使う。
 */
export function buildCandidateIndex(extraCandidates = {}) {
  const index = [];
  for (const spell of SPELLS) {
    const seen = new Set();
    const sources = [
      [spell.spelling, 'spelling'],
      [spell.guide, 'guide'],
      [spell.katakana, 'katakana'],
      ...spell.candidates.en.map((c) => [c, 'builtin-en']),
      ...spell.candidates.ja.map((c) => [c, 'builtin-ja']),
    ];
    const extra = extraCandidates[spell.id];
    if (Array.isArray(extra)) {
      for (const c of extra) {
        if (typeof c === 'string') sources.push([c, 'parent-added']);
      }
    }
    for (const [text, origin] of sources) {
      const norm = normalizeUtterance(text);
      if (!norm.compact || seen.has(norm.compact)) continue;
      seen.add(norm.compact);
      index.push({
        spellId: spell.id,
        display: text,
        origin,
        compact: norm.compact,
        tokenCount: norm.tokens.length,
      });
    }
  }
  // 注: extraCandidates のうち既知でない呪文IDは、SPELLS を基準に走査しているため自動的に無視される。
  return index;
}

/**
 * 認識テキストを呪文へ照合する。
 *
 * @param {string} text 認識テキスト
 * @param {{strictness?: 'child'|'strict'|'normal'|'loose', extraCandidates?: Record<string,string[]>}} options
 * @returns {object} 成功: {matched:true, spellId, candidate, mode, distance, normalized}
 *                   失敗: {matched:false, reason:'empty'|'no_match'|'ambiguous', near, normalized}
 */
export function matchSpell(text, options = {}) {
  const strictness = STRICTNESS_LEVELS[options.strictness] ? options.strictness : DEFAULT_STRICTNESS;
  const level = STRICTNESS_LEVELS[strictness];
  const normalized = normalizeUtterance(text);
  const index = buildCandidateIndex(options.extraCandidates || {});

  const base = { normalized, strictness };

  if (!normalized.compact) {
    return { ...base, matched: false, reason: 'empty', near: [] };
  }

  // 1) 完全一致（正規化後の全文）
  const exact = index.filter((c) => c.compact === normalized.compact);
  const exactSpellIds = [...new Set(exact.map((c) => c.spellId))];
  if (exactSpellIds.length === 1) {
    return { ...base, matched: true, spellId: exactSpellIds[0], candidate: exact[0], mode: 'exact', distance: 0 };
  }
  if (exactSpellIds.length > 1) {
    return { ...base, matched: false, reason: 'ambiguous', ambiguousSpellIds: exactSpellIds, near: [] };
  }

  // 2) 文中からの切り出し（完全一致のみ。前後の語数が少ないときだけ探す）
  const windowHits = [];
  for (const cand of index) {
    if (normalized.tokens.length <= cand.tokenCount) continue;
    if (normalized.tokens.length > cand.tokenCount + WINDOW_TOKEN_SLACK) continue;
    for (let i = 0; i + cand.tokenCount <= normalized.tokens.length; i += 1) {
      const window = normalized.tokens.slice(i, i + cand.tokenCount).join('');
      if (window === cand.compact) {
        windowHits.push(cand);
        break;
      }
    }
  }
  const windowSpellIds = [...new Set(windowHits.map((c) => c.spellId))];
  if (windowSpellIds.length === 1) {
    return { ...base, matched: true, spellId: windowSpellIds[0], candidate: windowHits[0], mode: 'window', distance: 0 };
  }
  if (windowSpellIds.length > 1) {
    return { ...base, matched: false, reason: 'ambiguous', ambiguousSpellIds: windowSpellIds, near: [] };
  }

  if (strictness === 'child') return matchChild(normalized, index, base);

  // 3) 近さの計算（診断表示用。成功にするかは厳しさ設定で決める）
  const scored = [];
  for (const cand of index) {
    const limit = cand.compact.length >= LONG_CANDIDATE_MIN_LENGTH
      ? Math.max(level.maxDistanceLong, 2)
      : Math.max(level.maxDistanceShort, 2);
    const d = boundedDistance(normalized.compact, cand.compact, limit);
    if (d <= limit) scored.push({ ...cand, distance: d });
  }
  scored.sort((a, b) => a.distance - b.distance || a.compact.length - b.compact.length);
  const near = scored.slice(0, 5).map((c) => ({
    spellId: c.spellId,
    display: c.display,
    origin: c.origin,
    distance: c.distance,
  }));

  // 4) 厳しさ設定の範囲内で一致を探す
  const allowed = scored.filter((c) => {
    const max = c.compact.length >= LONG_CANDIDATE_MIN_LENGTH ? level.maxDistanceLong : level.maxDistanceShort;
    return max > 0 && c.distance <= max;
  });
  if (allowed.length > 0) {
    const best = allowed[0].distance;
    const bestHits = allowed.filter((c) => c.distance === best);
    const bestSpellIds = [...new Set(bestHits.map((c) => c.spellId))];
    if (bestSpellIds.length === 1) {
      return {
        ...base,
        matched: true,
        spellId: bestSpellIds[0],
        candidate: bestHits[0],
        mode: 'fuzzy',
        distance: best,
        near,
      };
    }
    // 同じ距離で複数の呪文に一致 → 曖昧なので失敗にする
    return { ...base, matched: false, reason: 'ambiguous', ambiguousSpellIds: bestSpellIds, near };
  }

  return { ...base, matched: false, reason: 'no_match', near };
}

// Explicit play aliases; these are not pronunciation assessments or observed child recordings.
export const CHILD_ALIASES = {
  accio:['アクシオ','アチオ'], stupefy:['ステューピファイ','ステューペファイ','ステュピファイ','スチュピファイ'],
  reducto:['レダクト'], protego:['プロテゴ'], rennervate:['レネルベート','レナベート'], episkey:['エピスキー'],
  expelliarmus:['エクスペリアームス','エクスペリアムス','エクスペリ'], rictusempra:['リクタセンプラ','リクセンプラ'],
  serpensortia:['サーペンソーティア','サーペン','セルペンソーティア'], slugulas_eructo:['スラグラス','スラギュラス'],
  impedimenta:['インペディメンタ','インペリメンタ'], vipera_evanesca:['ビペラエバネスカ','ビペラ'],
  finite_incantatem:['フィニートインカンターテム','フィニート','フィニーテ'], everte_statum:['エバーテスタタム','エベルテスタートゥム','エバーテ'],
};
export function childPhonetics(text) {
  return normalizeUtterance(text).compact
    .replace(/ヴァ/g,'バ').replace(/ヴィ/g,'ビ').replace(/ヴェ/g,'ベ').replace(/ヴォ/g,'ボ').replace(/ヴ/g,'ブ')
    .replace(/ティ/g,'チ').replace(/ディ/g,'ジ').replace(/トゥ/g,'ツ').replace(/ドゥ/g,'ズ')
    .replace(/ファ/g,'ハ').replace(/フィ/g,'ヒ').replace(/フェ/g,'ヘ').replace(/フォ/g,'ホ')
    .replace(/チュ|シュ/g,'ス')
    .replace(/[ァィゥェォャュョ]/g,c=>String.fromCharCode(c.charCodeAt(0)+1)).replace(/ッ/g,'');
}
function matchChild(normalized,index,base) {
  const input=childPhonetics(normalized.compact);
  const aliases=Object.entries(CHILD_ALIASES).flatMap(([spellId,values])=>values.map(display=>({spellId,display,origin:'child-alias',compact:normalizeUtterance(display).compact})));
  const scores=new Map();
  for(const c of [...index,...aliases]) {
    const target=childPhonetics(c.compact),length=Math.max(input.length,target.length);
    const exact=input===target;
    // Short names need phonetic equality; never rescue unrelated 1–2 syllable speech.
    const limit=Math.min(3,Math.floor(length*.28));
    const d=boundedDistance(input,target,limit);
    if(!exact && (input.length<4 || target.length<4 || d>limit))continue;
    const score=d/length;
    const old=scores.get(c.spellId);
    if(!old||score<old.score)scores.set(c.spellId,{...c,distance:d,score});
  }
  const hits=[...scores.values()].sort((a,b)=>a.score-b.score);
  const near=hits.slice(0,5);
  if(!hits.length)return {...base,matched:false,reason:'no_match',near};
  if(hits[1] && hits[1].score-hits[0].score<.09)return {...base,matched:false,reason:'ambiguous',ambiguousSpellIds:hits.filter(h=>h.score-hits[0].score<.09).map(h=>h.spellId),near};
  const best=hits[0];return {...base,matched:true,spellId:best.spellId,candidate:best,mode:'child',distance:best.distance,score:best.score,near};
}

/** Prefer literal matches over fuzzy matches across recognition alternatives; reject conflicting equals. */
export function matchRecognition(transcript,alternatives=[],options={}) {
  const texts=[...new Set([transcript,...(alternatives||[]).slice(0,5).map(a=>a?.transcript)].filter(t=>typeof t==='string'&&t.trim()).map(t=>t.trim()))];
  const results=texts.map(text=>({text,result:matchSpell(text,options)}));
  const ranked=results.filter(x=>x.result.matched).map(x=>({...x,rank:['exact','window'].includes(x.result.mode)?0:(x.result.score??x.result.distance/Math.max(1,x.result.candidate.compact.length))+.05})).sort((a,b)=>a.rank-b.rank);
  if(!ranked.length)return {text:transcript,result:results[0]?.result||matchSpell('',options)};
  const best=ranked[0],conflicts=ranked.filter(x=>x.result.spellId!==best.result.spellId&&x.rank-best.rank<.09);
  if(conflicts.length)return {text:transcript,result:{matched:false,reason:'ambiguous',near:[],ambiguousSpellIds:[...new Set([best.result.spellId,...conflicts.map(x=>x.result.spellId)])]}};
  return {text:best.text,result:best.result};
}
