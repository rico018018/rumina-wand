import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUtterance, matchSpell, STRICTNESS_LEVELS } from '../src/matcher.js';
import { SPELLS } from '../src/spells.js';

test('正規化: 大文字・記号・余分な空白を落とす', () => {
  assert.equal(normalizeUtterance('  Accio!  ').compact, 'accio');
  assert.equal(normalizeUtterance('Everte, Statum.').compact, 'evertestatum');
  assert.equal(normalizeUtterance('Everte Statum').spaced, 'everte statum');
});

test('正規化: ひらがなはカタカナへ、長音符と中黒は落とす', () => {
  assert.equal(normalizeUtterance('アー・キー・オー').compact, 'アキオ');
  assert.equal(normalizeUtterance('ぷろていごー').compact, 'プロテイゴ');
});

test('正規化: 全角英数は半角へ', () => {
  assert.equal(normalizeUtterance('Ａｃｃｉｏ').compact, 'accio');
});

test('完全一致: 綴りそのままは厳しい設定でも成功する', () => {
  for (const spell of SPELLS) {
    const r = matchSpell(spell.spelling, { strictness: 'strict' });
    assert.equal(r.matched, true, `${spell.spelling} が一致しない`);
    assert.equal(r.spellId, spell.id);
    assert.equal(r.mode, 'exact');
  }
});

test('完全一致: カタカナ目安も厳しい設定で成功する', () => {
  for (const spell of SPELLS) {
    const r = matchSpell(spell.katakana, { strictness: 'strict' });
    assert.equal(r.matched, true, `${spell.katakana} (${spell.id}) が一致しない`);
    assert.equal(r.spellId, spell.id);
  }
});

test('完全一致: 発音ガイドの表記も厳しい設定で成功する', () => {
  for (const spell of SPELLS) {
    const r = matchSpell(spell.guide, { strictness: 'strict' });
    assert.equal(r.matched, true, `${spell.guide} (${spell.id}) が一致しない`);
    assert.equal(r.spellId, spell.id);
  }
});

test('不一致: 似ていない語は厳しい設定で失敗する', () => {
  for (const text of ['こんにちは', 'おかあさん', 'banana', 'いちごだいすき', 'television', '', '   ']) {
    const r = matchSpell(text, { strictness: 'strict' });
    assert.equal(r.matched, false, `${JSON.stringify(text)} が誤って一致した`);
  }
});

test('不一致: 一番近い呪文へ自動で割り当てない（厳しい設定）', () => {
  // accio に1文字違いだが、厳しい設定では成功にしない
  const r = matchSpell('accia', { strictness: 'strict' });
  assert.equal(r.matched, false);
  assert.equal(r.reason, 'no_match');
  // 診断用に「近かった候補」は返す
  assert.ok(r.near.length > 0);
  assert.equal(r.near[0].spellId, 'accio');
});

test('普通の設定: 1文字違いは一致、2文字違いは不一致', () => {
  const one = matchSpell('accia', { strictness: 'normal' });
  assert.equal(one.matched, true);
  assert.equal(one.spellId, 'accio');
  assert.equal(one.mode, 'fuzzy');
  assert.equal(one.distance, 1);

  const two = matchSpell('aggia', { strictness: 'normal' });
  assert.equal(two.matched, false);
});

test('ゆるい設定: 長い呪文は2文字違いまで許す（普通の設定では許さない）', () => {
  // serpensortia から2文字違い
  const loose = matchSpell('serpansortix', { strictness: 'loose' });
  assert.equal(loose.matched, true);
  assert.equal(loose.spellId, 'serpensortia');
  assert.equal(loose.distance, 2);

  const normal = matchSpell('serpansortix', { strictness: 'normal' });
  assert.equal(normal.matched, false);
});

test('ゆるい設定でも短い呪文は2文字違いを許さない', () => {
  const r = matchSpell('aggia', { strictness: 'loose' });
  assert.equal(r.matched, false);
});

test('曖昧な場合は失敗にする（複数の呪文に同距離で一致）', () => {
  const r = matchSpell('xxxx', {
    strictness: 'normal',
    extraCandidates: { accio: ['xxxy'], protego: ['xxxz'] },
  });
  assert.equal(r.matched, false);
  assert.equal(r.reason, 'ambiguous');
  assert.deepEqual(r.ambiguousSpellIds.sort(), ['accio', 'protego']);
});

test('文中に呪文が入っていても、前後2語までなら取り出す', () => {
  const r = matchSpell('えっと accio いま', { strictness: 'strict' });
  assert.equal(r.matched, true);
  assert.equal(r.spellId, 'accio');
  assert.equal(r.mode, 'window');
});

test('長い文に紛れている場合は取り出さない', () => {
  const r = matchSpell('きょうは おかあさんと こうえんに いって accio みたいな はなしを した', {
    strictness: 'strict',
  });
  assert.equal(r.matched, false);
});

test('保護者が追加した候補が使える', () => {
  const before = matchSpell('あきおちゃん', { strictness: 'strict' });
  assert.equal(before.matched, false);
  const after = matchSpell('あきおちゃん', {
    strictness: 'strict',
    extraCandidates: { accio: ['アキオチャン'] },
  });
  assert.equal(after.matched, true);
  assert.equal(after.spellId, 'accio');
  assert.equal(after.mode, 'exact');
});

test('追加候補は既知の呪文IDだけを受け付ける', () => {
  const r = matchSpell('ほげ', { strictness: 'strict', extraCandidates: { not_a_spell: ['ほげ'] } });
  assert.equal(r.matched, false);
});

test('2語呪文は空白のあり・なし両方を受け付ける', () => {
  for (const text of ['Finite Incantatem', 'FiniteIncantatem', 'finite  incantatem']) {
    const r = matchSpell(text, { strictness: 'strict' });
    assert.equal(r.matched, true, `${text} が一致しない`);
    assert.equal(r.spellId, 'finite_incantatem');
  }
});

test('厳しさの一覧は3段階、既定値は厳しい', () => {
  assert.deepEqual(Object.keys(STRICTNESS_LEVELS), ['child', 'strict', 'normal', 'loose']);
  assert.equal(STRICTNESS_LEVELS.child.isDefault, true);
});

test('14呪文どうしが互いに誤一致しない（ゆるい設定でも）', () => {
  for (const spell of SPELLS) {
    for (const text of [spell.spelling, spell.katakana, spell.guide]) {
      const r = matchSpell(text, { strictness: 'loose' });
      assert.equal(r.matched, true, `${text} が一致しない`);
      assert.equal(r.spellId, spell.id, `${text} が ${r.spellId} に誤一致した`);
    }
  }
});

test('全呪文の全候補が、ゆるい設定でも自分の呪文だけに一致する', () => {
  const problems = [];
  for (const spell of SPELLS) {
    for (const cand of [...spell.candidates.en, ...spell.candidates.ja]) {
      const r = matchSpell(cand, { strictness: 'loose' });
      if (!r.matched || r.spellId !== spell.id) {
        problems.push(`${spell.id} の候補 "${cand}" → ${r.matched ? r.spellId : r.reason}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
