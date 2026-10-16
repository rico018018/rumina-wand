import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialWorld, applySpell, tickWorld, CAPS, INITIAL_ROCK_COUNT } from '../src/world.js';

const T0 = 1_000_000;

test('初期状態', () => {
  const w = createInitialWorld();
  assert.deepEqual(w.snakes, []);
  assert.deepEqual(w.treasures, []);
  assert.deepEqual(w.slugs, []);
  assert.deepEqual(w.debris, []);
  assert.deepEqual(w.droppedWands, []);
  assert.equal(w.rocks.length, INITIAL_ROCK_COUNT);
  assert.equal(w.rocks.every((r) => !r.broken), true);
  assert.equal(w.shield.active, false);
  assert.equal(w.wizard.conscious, true);
  assert.equal(w.wizard.injured, false);
  assert.equal(w.wizard.holdsWand, true);
  assert.equal(w.wizard.speedFactor, 1);
});

test('Accio: 毎回宝物が1個増える', () => {
  const w = createInitialWorld();
  const a = applySpell(w, 'accio', { now: T0 });
  assert.equal(a.status, 'applied');
  assert.equal(w.treasures.length, 1);
  applySpell(w, 'accio', { now: T0 + 1 });
  assert.equal(w.treasures.length, 2);
  assert.ok(a.events.some((e) => e.type === 'treasure_added'));
});

test('Accio: 上限に達したら「いっぱい」を示す（失敗ではない）', () => {
  const w = createInitialWorld();
  for (let i = 0; i < CAPS.treasures; i += 1) applySpell(w, 'accio', { now: T0 + i });
  assert.equal(w.treasures.length, CAPS.treasures);
  const r = applySpell(w, 'accio', { now: T0 + 999 });
  assert.equal(r.status, 'at_cap');
  assert.equal(w.treasures.length, CAPS.treasures, '上限を超えて増えない');
});

test('Serpensortia: 毎回ヘビが1匹増え、上限で止まる', () => {
  const w = createInitialWorld();
  applySpell(w, 'serpensortia', { now: T0 });
  applySpell(w, 'serpensortia', { now: T0 + 1 });
  assert.equal(w.snakes.length, 2);
  for (let i = 0; i < 20; i += 1) applySpell(w, 'serpensortia', { now: T0 + 10 + i });
  assert.equal(w.snakes.length, CAPS.snakes);
});

test('Protego: 繰り返しても盾は1つで、強化される', () => {
  const w = createInitialWorld();
  const first = applySpell(w, 'protego', { now: T0 });
  assert.equal(first.status, 'applied');
  assert.equal(w.shield.active, true);
  assert.equal(w.shield.level, 1);
  const second = applySpell(w, 'protego', { now: T0 + 1 });
  assert.equal(second.status, 'applied');
  assert.equal(w.shield.level, 2, '重ねると強化');
  assert.ok(second.events.some((e) => e.type === 'shield_reinforced'));
});

test('Reducto: 岩を1個ずつ壊し、破片が残る', () => {
  const w = createInitialWorld();
  for (let i = 0; i < INITIAL_ROCK_COUNT; i += 1) {
    const r = applySpell(w, 'reducto', { now: T0 + i });
    assert.equal(r.status, 'applied');
  }
  assert.equal(w.rocks.every((r) => r.broken), true);
  assert.ok(w.debris.length > 0, '破片が残る');
});

test('Reducto: 壊す岩がなければ「対象がない」。認識失敗ではない', () => {
  const w = createInitialWorld();
  for (let i = 0; i < INITIAL_ROCK_COUNT; i += 1) applySpell(w, 'reducto', { now: T0 + i });
  const r = applySpell(w, 'reducto', { now: T0 + 100 });
  assert.equal(r.status, 'no_target');
  assert.notEqual(r.status, 'failed');
  assert.match(r.message, /こわせる/);
});

test('Stupefy: 気絶させる。気絶済みなら再度倒さない', () => {
  const w = createInitialWorld();
  const first = applySpell(w, 'stupefy', { now: T0 });
  assert.equal(first.status, 'applied');
  assert.equal(w.wizard.conscious, false);
  const second = applySpell(w, 'stupefy', { now: T0 + 1 });
  assert.equal(second.status, 'already');
  assert.equal(w.wizard.conscious, false);
});

test('気絶中はくすぐりなどの不整合な動作を実行しない', () => {
  const w = createInitialWorld();
  applySpell(w, 'stupefy', { now: T0 });
  const tickle = applySpell(w, 'rictusempra', { now: T0 + 1 });
  assert.equal(tickle.status, 'no_target');
  assert.equal(w.wizard.tickling, false);

  const push = applySpell(w, 'everte_statum', { now: T0 + 2 });
  assert.equal(push.status, 'no_target');

  const slow = applySpell(w, 'impedimenta', { now: T0 + 3 });
  assert.equal(slow.status, 'no_target');

  const slugs = applySpell(w, 'slugulas_eructo', { now: T0 + 4 });
  assert.equal(slugs.status, 'no_target');
  assert.equal(w.slugs.length, 0);
});

test('Rennervate: 気絶から回復する。起きていれば光だけ', () => {
  const w = createInitialWorld();
  const noop = applySpell(w, 'rennervate', { now: T0 });
  assert.equal(noop.status, 'no_target');
  assert.equal(w.wizard.conscious, true);

  applySpell(w, 'stupefy', { now: T0 + 1 });
  const wake = applySpell(w, 'rennervate', { now: T0 + 2 });
  assert.equal(wake.status, 'applied');
  assert.equal(w.wizard.conscious, true);
});

test('Episkey: けがを治す。けががなければ光だけ', () => {
  const w = createInitialWorld();
  const noop = applySpell(w, 'episkey', { now: T0 });
  assert.equal(noop.status, 'no_target');

  applySpell(w, 'everte_statum', { now: T0 + 1 });
  assert.equal(w.wizard.injured, true, '吹き飛ばされると小さなすりきずができる（初期案）');
  const heal = applySpell(w, 'episkey', { now: T0 + 2 });
  assert.equal(heal.status, 'applied');
  assert.equal(w.wizard.injured, false);
});

test('Expelliarmus: 杖を持っていれば飛ばし、持っていなければ対象なし', () => {
  const w = createInitialWorld();
  const first = applySpell(w, 'expelliarmus', { now: T0 });
  assert.equal(first.status, 'applied');
  assert.equal(w.wizard.holdsWand, false);
  assert.equal(w.droppedWands.length, 1, '杖が床に残る');

  const second = applySpell(w, 'expelliarmus', { now: T0 + 1 });
  assert.equal(second.status, 'no_target');
  assert.equal(w.droppedWands.length, 1);
});

test('Rictusempra: くすぐりは有限時間で元に戻る', () => {
  const w = createInitialWorld();
  const r = applySpell(w, 'rictusempra', { now: T0 });
  assert.equal(r.status, 'applied');
  assert.equal(w.wizard.tickling, true);
  tickWorld(w, T0 + 500);
  assert.equal(w.wizard.tickling, true);
  const changed = tickWorld(w, T0 + 60_000);
  assert.equal(w.wizard.tickling, false);
  assert.equal(changed.changed, true);
});

test('Impedimenta: 速度を下げるが負にならず、有限時間で戻る', () => {
  const w = createInitialWorld();
  applySpell(w, 'impedimenta', { now: T0 });
  assert.ok(w.wizard.speedFactor < 1);
  for (let i = 0; i < 20; i += 1) applySpell(w, 'impedimenta', { now: T0 + 1 + i });
  assert.ok(w.wizard.speedFactor > 0, '負値やゼロまで下げない');
  assert.ok(w.wizard.speedFactor >= 0.2);
  tickWorld(w, T0 + 10 * 60_000);
  assert.equal(w.wizard.speedFactor, 1, '有限時間で元に戻る');
});

test('Slugulas Eructo: 桶にナメクジが増え、上限で止まる', () => {
  const w = createInitialWorld();
  applySpell(w, 'slugulas_eructo', { now: T0 });
  assert.equal(w.slugs.length, 1);
  for (let i = 0; i < 20; i += 1) applySpell(w, 'slugulas_eructo', { now: T0 + 1 + i });
  assert.equal(w.slugs.length, CAPS.slugs);
});

test('Vipera Evanesca: ヘビを消す。いなければ対象なし', () => {
  const w = createInitialWorld();
  const none = applySpell(w, 'vipera_evanesca', { now: T0 });
  assert.equal(none.status, 'no_target');

  applySpell(w, 'serpensortia', { now: T0 + 1 });
  applySpell(w, 'serpensortia', { now: T0 + 2 });
  const r = applySpell(w, 'vipera_evanesca', { now: T0 + 3 });
  assert.equal(r.status, 'applied');
  assert.equal(w.snakes.length, 0, '初期案は1回で全部消す');
});

test('Vipera Evanesca: 消す数は設定で変えられる構造', () => {
  const w = createInitialWorld();
  for (let i = 0; i < 3; i += 1) applySpell(w, 'serpensortia', { now: T0 + i });
  applySpell(w, 'vipera_evanesca', { now: T0 + 10, vanishCount: 1 });
  assert.equal(w.snakes.length, 2);
});

test('Finite Incantatem: 世界全体を初期状態へ戻す', () => {
  const w = createInitialWorld();
  applySpell(w, 'accio', { now: T0 });
  applySpell(w, 'serpensortia', { now: T0 + 1 });
  applySpell(w, 'protego', { now: T0 + 2 });
  applySpell(w, 'reducto', { now: T0 + 3 });
  applySpell(w, 'expelliarmus', { now: T0 + 4 });
  applySpell(w, 'impedimenta', { now: T0 + 5 });
  applySpell(w, 'slugulas_eructo', { now: T0 + 6 });
  applySpell(w, 'stupefy', { now: T0 + 7 });

  const r = applySpell(w, 'finite_incantatem', { now: T0 + 8 });
  assert.equal(r.status, 'applied');
  const fresh = createInitialWorld();
  assert.deepEqual({ ...w, revision: 0 }, { ...fresh, revision: 0 });
});

test('Everte Statum: 後ろへ飛ばし、柔らかい着地点を持つ', () => {
  const w = createInitialWorld();
  const r = applySpell(w, 'everte_statum', { now: T0 });
  assert.equal(r.status, 'applied');
  assert.ok(w.wizard.offsetZ < 0, '奥へ下がる');
  assert.equal(w.wizard.onSoftLanding, true);
});

test('知らない呪文IDは適用しない', () => {
  const w = createInitialWorld();
  const r = applySpell(w, 'not_a_spell', { now: T0 });
  assert.equal(r.status, 'unknown_spell');
});

test('状態を変える呪文はすべて revision を進める（保存の目印）', () => {
  const w = createInitialWorld();
  const before = w.revision;
  applySpell(w, 'accio', { now: T0 });
  assert.equal(w.revision, before + 1);
  applySpell(w, 'rennervate', { now: T0 + 1 }); // no_target
  assert.equal(w.revision, before + 1, '変化がなければ進めない');
});
