import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColorStore, STORAGE_KEY, isValidHexColor, normalizeHexColor } from '../src/colors.js';
import { SPELLS } from '../src/spells.js';

/** localStorage の代わり（テスト用） */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

test('色の形式チェック', () => {
  assert.equal(isValidHexColor('#FFC83D'), true);
  assert.equal(isValidHexColor('#ffc83d'), true);
  assert.equal(isValidHexColor('#FFF'), false, '3桁は受け付けない');
  assert.equal(isValidHexColor('FFC83D'), false, '#なしは受け付けない');
  assert.equal(isValidHexColor('rgb(1,2,3)'), false);
  assert.equal(isValidHexColor('#GGGGGG'), false);
  assert.equal(isValidHexColor(null), false);
  assert.equal(normalizeHexColor('#ffc83d'), '#FFC83D');
});

test('初期状態は14呪文すべてが「仮の初期色」', () => {
  const store = new ColorStore(memoryStorage());
  assert.equal(store.list().length, 14);
  for (const spell of SPELLS) {
    const entry = store.get(spell.id);
    assert.equal(entry.color, spell.defaultColor);
    assert.equal(entry.source, 'default');
    assert.equal(entry.isProvisional, true, '仮の色として扱う');
    assert.equal(entry.verified, false);
  }
});

test('1呪文の色を変えても他の呪文は変わらない', () => {
  const store = new ColorStore(memoryStorage());
  const before = SPELLS.filter((s) => s.id !== 'accio').map((s) => store.get(s.id).color);
  store.setColor('accio', '#123456');
  assert.equal(store.get('accio').color, '#123456');
  assert.equal(store.get('accio').source, 'user');
  assert.equal(store.get('accio').isProvisional, false);
  const after = SPELLS.filter((s) => s.id !== 'accio').map((s) => store.get(s.id).color);
  assert.deepEqual(after, before);
});

test('色を変えただけでは「実物確認済み」にならない', () => {
  const store = new ColorStore(memoryStorage());
  store.setColor('protego', '#0000FF');
  assert.equal(store.get('protego').verified, false);
  store.setVerified('protego', true);
  assert.equal(store.get('protego').verified, true);
  // 色を変えても確認済みフラグは保護者が操作するまで勝手に変わらない
  store.setColor('protego', '#00FF00');
  assert.equal(store.get('protego').verified, true);
});

test('不正な色は適用しない', () => {
  const store = new ColorStore(memoryStorage());
  for (const bad of ['red', '#FFF', 'rgb(0,0,0)', '', null, undefined, 123]) {
    assert.throws(() => store.setColor('accio', bad), /色/);
  }
  assert.equal(store.get('accio').color, '#FFC83D');
});

test('既知でない呪文IDは拒否する', () => {
  const store = new ColorStore(memoryStorage());
  assert.throws(() => store.setColor('not_a_spell', '#112233'), /呪文/);
  assert.throws(() => store.get('not_a_spell'), /呪文/);
});

test('保存したら同じ保存領域から読み直せる（再読み込み相当）', () => {
  const storage = memoryStorage();
  const a = new ColorStore(storage);
  a.setColor('serpensortia', '#00FF88');
  a.setVerified('serpensortia', true);

  const b = new ColorStore(storage);
  assert.equal(b.get('serpensortia').color, '#00FF88');
  assert.equal(b.get('serpensortia').verified, true);
  assert.equal(b.get('serpensortia').source, 'user');
  assert.ok(Object.keys(storage._dump()).includes(STORAGE_KEY));
});

test('1呪文だけ初期値に戻す', () => {
  const store = new ColorStore(memoryStorage());
  store.setColor('accio', '#111111');
  store.setColor('protego', '#222222');
  store.resetSpell('accio');
  assert.equal(store.get('accio').color, '#FFC83D');
  assert.equal(store.get('accio').source, 'default');
  assert.equal(store.get('protego').color, '#222222', '他の呪文は残る');
});

test('全呪文を初期値に戻す', () => {
  const store = new ColorStore(memoryStorage());
  store.setColor('accio', '#111111');
  store.setVerified('accio', true);
  store.resetAll();
  for (const spell of SPELLS) {
    assert.equal(store.get(spell.id).color, spell.defaultColor);
    assert.equal(store.get(spell.id).source, 'default');
    assert.equal(store.get(spell.id).verified, false);
  }
});

test('書き出し→読み込みで設定が復元できる', () => {
  const a = new ColorStore(memoryStorage());
  a.setColor('accio', '#ABCDEF');
  a.setVerified('accio', true);
  a.setColor('reducto', '#FEDCBA');
  const json = a.exportJSON();

  const b = new ColorStore(memoryStorage());
  const result = b.importJSON(json);
  // 書き出しは14呪文すべてのスナップショット（端末やブラウザを変えても丸ごと移せるように）
  assert.equal(result.applied, 14);
  assert.deepEqual(result.rejected, []);
  assert.equal(b.get('accio').color, '#ABCDEF');
  assert.equal(b.get('accio').verified, true);
  assert.equal(b.get('accio').source, 'user');
  assert.equal(b.get('reducto').color, '#FEDCBA');
  // 触っていない呪文は「仮の色」のまま引き継がれる
  assert.equal(b.get('protego').color, '#3B82F6');
  assert.equal(b.get('protego').source, 'default');
  assert.equal(b.get('protego').isProvisional, true);
});

test('読み込みデータを検証し、不正な内容は適用しない', () => {
  const store = new ColorStore(memoryStorage());
  const result = store.importJSON(JSON.stringify({
    version: 1,
    spells: {
      accio: { color: '#ABCDEF' },
      protego: { color: 'blue' },
      not_a_spell: { color: '#000000' },
      reducto: { color: '#FFF' },
      stupefy: { color: '#001122', verified: 'yes' },
    },
  }));
  assert.equal(store.get('accio').color, '#ABCDEF', '正しい項目は適用する');
  assert.equal(store.get('protego').color, '#3B82F6', '色名は拒否');
  assert.equal(store.get('reducto').color, '#FF7A1A', '3桁は拒否');
  assert.equal(store.get('stupefy').color, '#001122', '色は正しいので適用');
  assert.equal(store.get('stupefy').verified, false, 'verified が真偽値でないので無視');
  assert.equal(result.applied, 2);
  assert.equal(result.rejected.length, 3);
});

test('壊れた読み込みデータは全体を拒否する', () => {
  const store = new ColorStore(memoryStorage());
  for (const bad of ['', '{', 'null', '[]', '{"version":99,"spells":{}}', '{"spells":"x"}']) {
    assert.throws(() => store.importJSON(bad), /読み込/);
  }
  assert.equal(store.get('accio').color, '#FFC83D');
});

test('保存領域が壊れていても初期色で動く', () => {
  const store = new ColorStore(memoryStorage({ [STORAGE_KEY]: 'not json at all' }));
  assert.equal(store.get('accio').color, '#FFC83D');
  assert.equal(store.loadError !== null, true, '読み込み失敗を保護者へ伝えられる');
});

test('保存領域が使えない環境でも例外を投げずに動く', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  const store = new ColorStore(broken);
  assert.equal(store.get('accio').color, '#FFC83D');
  store.setColor('accio', '#010203');
  assert.equal(store.get('accio').color, '#010203', 'メモリ上では反映される');
  assert.equal(store.saveError !== null, true, '保存できなかったことを伝えられる');
});
