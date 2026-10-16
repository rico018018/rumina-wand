/**
 * 魔法世界の状態と、呪文による状態変更（要件書 7章）。
 *
 * この章の内容は要件書で「実装の初期案」とされている部分です。確定要件と区別するため、
 * 初期案に由来する数値は下の定数にまとめ、コメントで明示しています。
 *
 * ここは描画も音も音声認識も知りません。純粋な状態機械です。
 * 音声発動と手動発動は、どちらも applySpell を通ります（要件書 8章・第2段階）。
 */

/** 増やせる対象の上限（初期案：10個・10匹） */
export const CAPS = { snakes: 10, treasures: 10, slugs: 10 };
/** 壊せる岩の数（初期案） */
export const INITIAL_ROCK_COUNT = 3;
/** 岩1個が割れてできる破片の数（初期案） */
export const DEBRIS_PER_ROCK = 4;
/** くすぐりが続く時間（初期案） */
export const TICKLE_DURATION_MS = 6000;
/** 鈍足が続く時間と、下げ幅の下限（初期案。負値まで下げない） */
export const SLOW_DURATION_MS = 8000;
export const SLOW_STEP = 0.6;
export const SLOW_FLOOR = 0.2;
/** 吹き飛ばしで下がる距離と、下がれる限界（初期案） */
export const KNOCKBACK_STEP = 1.2;
export const KNOCKBACK_LIMIT = -3.6;

let nextId = 1;
function makeId(prefix) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/** テスト用。ID採番を初期化する。 */
export function __resetIds() {
  nextId = 1;
}

export function createInitialWorld() {
  return {
    revision: 0,
    snakes: [],
    treasures: [],
    slugs: [],
    debris: [],
    droppedWands: [],
    rocks: Array.from({ length: INITIAL_ROCK_COUNT }, (_, i) => ({
      id: `rock-${i + 1}`,
      broken: false,
      slot: i,
    })),
    shield: { active: false, level: 0 },
    wizard: {
      conscious: true,
      injured: false,
      tickling: false,
      tickleUntil: null,
      speedFactor: 1,
      slowUntil: null,
      offsetZ: 0,
      onSoftLanding: false,
      holdsWand: true,
    },
  };
}

function ok(message, events = []) {
  return { status: 'applied', message, events };
}
function noTarget(message) {
  return { status: 'no_target', message, events: [] };
}
function already(message) {
  return { status: 'already', message, events: [] };
}
function atCap(message) {
  return { status: 'at_cap', message, events: [] };
}

/** 気絶中に実行すると不整合になる呪文 */
function requiresConscious(world, what) {
  if (world.wizard.conscious) return null;
  return noTarget(`まほうつかいは ねているよ。${what}`);
}

/**
 * 呪文を世界へ適用する。
 *
 * 戻り値の status は演出の出し分けに使う。重要なのは「認識成功」と「対象がない」の区別で、
 * no_target / already / at_cap はどれも“正しく唱えられた”扱いであり、発音の失敗ではない。
 *
 * @param {object} world createInitialWorld() の戻り値（破壊的に更新する）
 * @param {string} spellId
 * @param {{now:number, vanishCount?:number}} options
 * @returns {{status:'applied'|'no_target'|'already'|'at_cap'|'unknown_spell', message:string, events:Array}}
 */
export function applySpell(world, spellId, options = {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  tickWorld(world, now);
  const w = world.wizard;
  let result;

  switch (spellId) {
    case 'accio': {
      if (world.treasures.length >= CAPS.treasures) {
        result = atCap('たからものが いっぱいだよ');
        break;
      }
      const treasure = { id: makeId('treasure'), kind: world.treasures.length % 3, bornAt: now };
      world.treasures.push(treasure);
      result = ok('たからものが とんできた', [{ type: 'treasure_added', id: treasure.id }]);
      break;
    }

    case 'serpensortia': {
      if (world.snakes.length >= CAPS.snakes) {
        result = atCap('ヘビが いっぱいだよ');
        break;
      }
      const snake = { id: makeId('snake'), seed: Math.random(), bornAt: now };
      world.snakes.push(snake);
      result = ok('ヘビが あらわれた', [{ type: 'snake_added', id: snake.id }]);
      break;
    }

    case 'protego': {
      // 重ねても盾は1つ。見えなくならないように更新・強化演出にする。
      const wasActive = world.shield.active;
      world.shield.active = true;
      world.shield.level += 1;
      result = ok(wasActive ? 'たてが つよくなった' : 'あおい たてが でた', [
        { type: wasActive ? 'shield_reinforced' : 'shield_raised', level: world.shield.level },
      ]);
      break;
    }

    case 'reducto': {
      const target = world.rocks.find((r) => !r.broken);
      if (!target) {
        result = noTarget('こわせる いわは もうないよ');
        break;
      }
      target.broken = true;
      for (let i = 0; i < DEBRIS_PER_ROCK; i += 1) {
        world.debris.push({ id: makeId('debris'), from: target.id, seed: Math.random() });
      }
      result = ok('いわが くだけた', [{ type: 'rock_broken', id: target.id }]);
      break;
    }

    case 'stupefy': {
      if (!w.conscious) {
        result = already('まほうつかいは もう ねているよ');
        break;
      }
      w.conscious = false;
      w.tickling = false;
      w.tickleUntil = null;
      w.onSoftLanding = true;
      result = ok('まほうつかいが たおれた', [{ type: 'wizard_stunned' }]);
      break;
    }

    case 'rennervate': {
      if (w.conscious) {
        // 元から起きている場合は回復の光のみ（世界は変えない）
        result = noTarget('まほうつかいは もう おきているよ');
        break;
      }
      w.conscious = true;
      w.onSoftLanding = false;
      result = ok('まほうつかいが おきた', [{ type: 'wizard_revived' }]);
      break;
    }

    case 'episkey': {
      if (!w.injured) {
        result = noTarget('けがは していないよ');
        break;
      }
      w.injured = false;
      result = ok('けがが なおった', [{ type: 'wizard_healed' }]);
      break;
    }

    case 'expelliarmus': {
      if (!w.holdsWand) {
        result = noTarget('まほうつかいは つえを もっていないよ');
        break;
      }
      w.holdsWand = false;
      const wand = { id: makeId('wand'), seed: Math.random() };
      world.droppedWands.push(wand);
      result = ok('つえが とんでいった', [{ type: 'wand_disarmed', id: wand.id }]);
      break;
    }

    case 'rictusempra': {
      const blocked = requiresConscious(world, 'くすぐれないよ');
      if (blocked) {
        result = blocked;
        break;
      }
      w.tickling = true;
      w.tickleUntil = now + TICKLE_DURATION_MS;
      result = ok('くすぐったくて わらっている', [{ type: 'wizard_tickled' }]);
      break;
    }

    case 'slugulas_eructo': {
      const blocked = requiresConscious(world, 'ナメクジは でてこないよ');
      if (blocked) {
        result = blocked;
        break;
      }
      if (world.slugs.length >= CAPS.slugs) {
        result = atCap('おけが いっぱいだよ');
        break;
      }
      const slug = { id: makeId('slug'), seed: Math.random(), bornAt: now };
      world.slugs.push(slug);
      result = ok('ナメクジが おけに おちた', [{ type: 'slug_added', id: slug.id }]);
      break;
    }

    case 'impedimenta': {
      const blocked = requiresConscious(world, 'おそくできないよ');
      if (blocked) {
        result = blocked;
        break;
      }
      // 延々と負値へ下げない。下限で止める。
      w.speedFactor = Math.max(SLOW_FLOOR, w.speedFactor * SLOW_STEP);
      w.slowUntil = now + SLOW_DURATION_MS;
      result = ok('うごきが おそくなった', [{ type: 'wizard_slowed', speedFactor: w.speedFactor }]);
      break;
    }

    case 'vipera_evanesca': {
      if (world.snakes.length === 0) {
        result = noTarget('けす ヘビが いないよ');
        break;
      }
      // 初期案は1回で全部消す。消去数は設定で変えられる構造にしてある。
      const count = Number.isInteger(options.vanishCount) && options.vanishCount > 0
        ? Math.min(options.vanishCount, world.snakes.length)
        : world.snakes.length;
      const removed = world.snakes.splice(0, count);
      result = ok(
        count === 1 ? 'ヘビが きえた' : 'ヘビが みんな きえた',
        removed.map((s) => ({ type: 'snake_removed', id: s.id })),
      );
      break;
    }

    case 'finite_incantatem': {
      // 全追加物・破片・盾・状態異常を除去し、人物・岩・宝物供給源を初期状態へ戻す。
      const fresh = createInitialWorld();
      const revision = world.revision;
      for (const key of Object.keys(fresh)) world[key] = fresh[key];
      world.revision = revision;
      result = ok('せかいが もとに もどった', [{ type: 'world_reset' }]);
      break;
    }

    case 'everte_statum': {
      const blocked = requiresConscious(world, 'とばせないよ');
      if (blocked) {
        result = blocked;
        break;
      }
      w.offsetZ = Math.max(KNOCKBACK_LIMIT, w.offsetZ - KNOCKBACK_STEP);
      w.onSoftLanding = true;
      // 初期案：吹き飛ばされると小さなすりきずができる（Episkey に対象を作るため）
      w.injured = true;
      result = ok('うしろへ とんでいった', [{ type: 'wizard_knocked_back', offsetZ: w.offsetZ }]);
      break;
    }

    default:
      return { status: 'unknown_spell', message: `知らない呪文です: ${spellId}`, events: [] };
  }

  if (result.status === 'applied') world.revision += 1;
  return result;
}

/**
 * 時間で切れる状態（くすぐり・鈍足）を更新する。描画ループから毎フレーム呼ぶ。
 * @returns {{changed:boolean}}
 */
export function tickWorld(world, now = Date.now()) {
  const w = world.wizard;
  let changed = false;
  if (w.tickling && w.tickleUntil !== null && now >= w.tickleUntil) {
    w.tickling = false;
    w.tickleUntil = null;
    changed = true;
  }
  if (w.speedFactor !== 1 && w.slowUntil !== null && now >= w.slowUntil) {
    w.speedFactor = 1;
    w.slowUntil = null;
    changed = true;
  }
  return { changed };
}

/** 保護者向けの「世界の初期化」。Finite Incantatem と同じ結果にする。 */
export function resetWorld(world) {
  return applySpell(world, 'finite_incantatem', { now: Date.now() });
}

/** 子ども向け表示に使う、いま世界にあるものの数 */
export function worldSummary(world) {
  return {
    snakes: world.snakes.length,
    treasures: world.treasures.length,
    slugs: world.slugs.length,
    rocksLeft: world.rocks.filter((r) => !r.broken).length,
    debris: world.debris.length,
    shieldLevel: world.shield.active ? world.shield.level : 0,
    wandsOnFloor: world.droppedWands.length,
    wizard: { ...world.wizard },
  };
}
