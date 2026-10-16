import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diagnostics, DIAG_STORAGE_KEY } from '../src/diagnostics.js';
import { STORAGE_KEY as COLOR_KEY, ColorStore } from '../src/colors.js';
import { matchSpell } from '../src/matcher.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _keys: () => [...map.keys()],
  };
}

test('発話の記録は話者別に数える', () => {
  const d = new Diagnostics(memoryStorage());
  d.setTester('adult');
  d.recordUtterance(matchSpell('Accio'), 'Accio');
  d.recordUtterance(matchSpell('banana'), 'banana');
  d.setTester('child');
  d.recordUtterance(matchSpell('Protego'), 'Protego');

  assert.equal(d.counts.adult.utterances, 2);
  assert.equal(d.counts.adult.matched, 1);
  assert.equal(d.counts.adult.noMatch, 1);
  assert.equal(d.counts.child.utterances, 1);
  assert.equal(d.counts.child.matched, 1);
});

test('誤発動は保護者が印を付けたときだけ数える', () => {
  const d = new Diagnostics(memoryStorage());
  d.setTester('adult');
  d.recordCast({ spellId: 'accio', source: 'voice', status: 'applied', message: 'ok', color: '#FFC83D' });
  assert.equal(d.counts.adult.misfire, 0, '自動では誤発動にしない');
  assert.equal(d.markLastCastAsMisfire('テレビの音で出た'), true);
  assert.equal(d.counts.adult.misfire, 1);
  // 同じ発動に二重に印を付けても増えない
  d.markLastCastAsMisfire();
  assert.equal(d.counts.adult.misfire, 1);
});

test('印を付ける発動がなければ何もしない', () => {
  const d = new Diagnostics(memoryStorage());
  assert.equal(d.markLastCastAsMisfire(), false);
});

test('「対象がない」は失敗と別に数える', () => {
  const d = new Diagnostics(memoryStorage());
  d.setTester('adult');
  d.recordCast({ spellId: 'reducto', source: 'voice', status: 'no_target', message: 'ない', color: '#FF7A1A' });
  assert.equal(d.counts.adult.noTarget, 1);
  assert.equal(d.counts.adult.noMatch, 0);
  assert.equal(d.counts.adult.applied, 0);
});

test('保護者が追加した候補は保存され、照合に使える', () => {
  const storage = memoryStorage();
  const d = new Diagnostics(storage);
  d.addCandidate('accio', '明夫');
  assert.equal(matchSpell('明夫', { strictness: 'strict' }).matched, false, '追加前は一致しない');
  const r = matchSpell('明夫', { strictness: 'strict', extraCandidates: d.extraCandidates });
  assert.equal(r.matched, true);
  assert.equal(r.spellId, 'accio');

  const d2 = new Diagnostics(storage);
  assert.deepEqual(d2.extraCandidates.accio, ['明夫'], '再読み込みでも残る');
});

test('空の候補は追加できない', () => {
  const d = new Diagnostics(memoryStorage());
  assert.throws(() => d.addCandidate('accio', '   '), /空/);
});

test('候補の削除', () => {
  const d = new Diagnostics(memoryStorage());
  d.addCandidate('accio', 'あきお');
  d.removeCandidate('accio', 'あきお');
  assert.equal(d.extraCandidates.accio, undefined);
});

test('診断データの保存は色設定を消さない', () => {
  const storage = memoryStorage();
  const colors = new ColorStore(storage);
  colors.setColor('accio', '#010203');
  const d = new Diagnostics(storage);
  d.addCandidate('accio', 'あきお');
  d.recordCast({ spellId: 'accio', source: 'manual', status: 'applied', message: '', color: '#010203' });

  assert.ok(storage._keys().includes(COLOR_KEY));
  assert.ok(storage._keys().includes(DIAG_STORAGE_KEY));
  assert.equal(new ColorStore(storage).get('accio').color, '#010203');
});

test('報告テキストには測った数だけが入り、成功率は書かない', () => {
  const d = new Diagnostics(memoryStorage());
  d.setTester('child');
  d.recordUtterance(matchSpell('Accio'), 'Accio');
  d.recordCast({ spellId: 'accio', source: 'voice', status: 'applied', message: 'ok', color: '#FFC83D' });
  const report = d.exportReport({ support: { hasApi: true }, settings: { strictness: 'strict' } });
  assert.match(report, /娘の声/);
  assert.match(report, /受け付けた発話: 1/);
  assert.doesNotMatch(report, /成功率/);
  assert.doesNotMatch(report, /%/);
});

test('記録がないときは「まだ記録がありません」と書く', () => {
  const d = new Diagnostics(memoryStorage());
  assert.match(d.exportReport(), /まだ記録がありません/);
});

test('ログは上限を超えても壊れない', () => {
  const d = new Diagnostics(memoryStorage());
  for (let i = 0; i < 1000; i += 1) d.log({ type: 'test', i });
  assert.ok(d.entries.length <= 600);
  assert.equal(d.entries[d.entries.length - 1].i, 999, '新しいログが残る');
});
