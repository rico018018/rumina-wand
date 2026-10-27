import { ENEMY_VARIANTS, enemyVariant } from './enemy-variants.js';
/**
 * 画面の組み立てと操作の配線。
 *
 * ここは表示だけを担当し、状態を直接書き換えません。すべて WandApp 経由です。
 * 子ども向け表示は、文字が読めなくても分かるように「色・絵・形・短い音」で伝えます。
 */

import { deviceState } from './device-state.js';
import { WandApp } from './app.js';
import { SPELLS, COLOR_SWATCHES, PHASE1_SPELL_IDS } from './spells.js';
import { STRICTNESS_LEVELS, EASY_ALIASES } from './matcher.js';
import { RECOGNITION_LANGS } from './speech.js';
import { TESTER_TAGS } from './diagnostics.js';
import { CAPS, INITIAL_ROCK_COUNT } from './world.js';
import { isValidHexColor, normalizeHexColor } from './colors.js';

const $ = (id) => document.getElementById(id);

/** 子ども向けの絵。文字の代わりに数が分かるようにする。 */
const TALLY_ICONS = [
  { key: 'treasures', icon: '💎', label: 'たからもの' },
  { key: 'snakes', icon: '🐍', label: 'ヘビ' },
  { key: 'slugs', icon: '🐌', label: 'ナメクジ' },
  { key: 'rocksLeft', icon: '🪨', label: 'いわ' },
  { key: 'debris', icon: '✨', label: 'はへん' },
  { key: 'swordsOnFloor', icon: '✦', label: 'おちた つえ' },
];

const app = new WandApp({ canvas: $('world') });
window.__wandApp = app; // 診断用（コンソールから状態を見られるように）

// ---------------------------------------------------------------- 遊び画面

const wandbar = $('wandbar');
const wandTip = $('wandTip');
const wandLabel = $('wandLabel');
const wandTimerArc = $('wandTimerArc');
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 18;

function paintWand(status) {
  wandbar.dataset.mode = status.childMode;
  wandLabel.textContent = status.childMessage;
  // 発動中・プレビュー中は、その呪文の登録色を杖先に出す
  if (status.childSpellId && (status.childMode === 'armed' || status.childMode === 'casting' || status.childMode === 'notarget')) {
    wandbar.style.setProperty('--tip', app.colors.getColor(status.childSpellId));
  } else {
    wandbar.style.removeProperty('--tip');
  }
}

/** 待ち時間の残りを示す輪。次に唱えられるタイミングが分かるようにする。 */
function paintTimer() {
  const remaining = app.speech.suppressRemainingMs();
  const total = app.settings.castDelayMs + 1400;
  const p = total > 0 ? Math.min(1, remaining / total) : 0;
  wandTimerArc.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
  wandTimerArc.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - p));
  requestAnimationFrame(paintTimer);
}
requestAnimationFrame(paintTimer);

// --- 遊び画面のただ1つのボタン ---
const castBtn = $('castBtn');
const castBtnIcon = $('castBtnIcon');
const castBtnText = $('castBtnText');
const castBtnArc = $('castBtnArc');
const CAST_RING = 2 * Math.PI * 54;
/** ボタン入力モードで、聞き取りを始めた時刻（残り時間の輪に使う） */
let listenStartedAt = 0;

castBtn.addEventListener('click', () => {
  if (castBtn.dataset.state === 'disabled') return;
  if (app.status.listening) {
    app.stopListening();
    return;
  }
  listenStartedAt = Date.now();
  app.startListening();
});

function paintCastButton(status) {
  if (!app.support.hasApi) {
    castBtn.dataset.state = 'disabled';
    castBtnIcon.textContent = '🚫';
    castBtnText.textContent = 'おとが つかえない';
    castBtn.setAttribute('aria-label', 'このブラウザは音声認識に対応していません。保護者パネルの手動ボタンで遊べます');
    return;
  }
  const waiting = status.childMode === 'waiting' || status.childMode === 'casting';
  if (waiting) {
    castBtn.dataset.state = 'waiting';
    castBtnIcon.textContent = '✦';
    castBtnText.textContent = 'まってね';
  } else if (status.listening) {
    castBtn.dataset.state = 'listening';
    castBtnIcon.textContent = '●';
    castBtnText.textContent = 'きいてるよ';
  } else {
    castBtn.dataset.state = 'idle';
    castBtnIcon.textContent = '✦';
    castBtnText.textContent = 'じゅもんを いう';
  }
  castBtn.setAttribute('aria-label', castBtnText.textContent);
}

/** ボタンの輪で、あと何秒聞いているかを示す */
function paintCastRing() {
  const state = castBtn.dataset.state;
  let progress = 0;
  if (state === 'listening' && app.settings.inputMode === 'push' && listenStartedAt) {
    const elapsed = Date.now() - listenStartedAt;
    progress = Math.max(0, 1 - elapsed / app.settings.pushWindowMs);
  } else if (state === 'waiting') {
    const remaining = app.speech.suppressRemainingMs();
    const total = app.settings.castDelayMs + 1400;
    progress = total > 0 ? Math.min(1, remaining / total) : 0;
  } else if (state === 'listening') {
    progress = 1; // 常時待ち受けは満ちたままにする
  }
  castBtnArc.style.strokeDashoffset = String(CAST_RING * (1 - progress));
  requestAnimationFrame(paintCastRing);
}
requestAnimationFrame(paintCastRing);

const tallyEl = $('tally');
function buildTally() {
  tallyEl.innerHTML = '';
  for (const item of TALLY_ICONS) {
    const g = document.createElement('div');
    g.className = 'tally__group';
    g.dataset.key = item.key;
    g.hidden = true;
    g.setAttribute('aria-label', item.label);
    tallyEl.append(g);
  }
}
buildTally();

function paintTally(summary) {
  for (const item of TALLY_ICONS) {
    const g = tallyEl.querySelector(`[data-key="${item.key}"]`);
    const n = summary[item.key] || 0;
    g.hidden = n === 0;
    if (n === 0) continue;
    // 絵の数で分かるようにする（多すぎるときは絵＋数字）
    if (n <= 6) {
      g.innerHTML = Array.from({ length: n }, () => `<span class="tally__icon">${item.icon}</span>`).join('');
    } else {
      g.innerHTML = `<span class="tally__icon">${item.icon}</span><span style="margin-left:4px">×${n}</span>`;
    }
  }
}

function paintDevices() {
  for (const [name, source] of [['mic', app.speech], ['camera', app.gesture]]) {
    const state = deviceState(name, source);
    const btn = $(name + 'Toggle');
    btn.dataset.state = state.tone;
    btn.dataset.compact = state.tone === 'on' ? 'ON' : state.tone === 'pending' ? '待機' : state.tone === 'error' ? 'OFF!' : 'OFF';
    btn.title = `${name === 'mic' ? 'マイク' : 'カメラ'}：${state.label}。${state.action}`;
    btn.setAttribute('aria-pressed', String(state.enabled));
    btn.setAttribute('aria-label', `${name === 'mic' ? 'マイク' : 'カメラ'}：${state.label}。${state.action}`);
    $(name + 'State').textContent = state.label;
    $(name + 'Action').textContent = state.action;
    btn.disabled = state.disabled;
  }
  const note = app.gesture.error ? `カメラ：${app.gesture.error}` : app.speech.error ? 'マイクを開始できません。端末の許可・接続を確認してください。' :
    app.settings.triggerMode === 'gesture' && !app.gesture.active ? '振り下ろしで遊ぶには、カメラをONにしてください' :
    app.settings.triggerMode === 'voice' ? '音声のみで発動' : '音声 ＋ 振り下ろしで発動';
  $('deviceHint').textContent = note;
  $('deviceHint').dataset.attention = String(Boolean(app.gesture.error || app.speech.error));
  $('cameraStart').disabled = app.gesture.starting || app.gesture.active;
  $('cameraStop').disabled = !app.gesture.starting && !app.gesture.active;
}
$('micToggle').addEventListener('click', () => {
  if (app.speech.wantListening || app.speech.isActive || app.speech.startPending || app.speech.audioActive) app.stopListening();
  else { listenStartedAt = Date.now(); app.startListening(); }
  paintDevices();
});
$('cameraToggle').addEventListener('click', () => {
  if (app.gesture.active || app.gesture.starting) { app.cancelCast(); app.gesture.stop(); }
  else startCamera();
});
app.onStatus((status) => {
  paintDevices();
  paintWand(status);
  paintCastButton(status);
  $('parentNote').textContent = status.parentNote || '';
  $('interimLine').textContent = status.interim ? `認識中: ${status.interim}` : '—';
});
app.onWorld(paintTally);

// 画面サイズの変化（横画面への切り替え・HDMI接続）に追従する
const onResize = () => app.scene.resize();
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

// ---------------------------------------------------------------- パネル開閉

const panel = $('panel');
const panelToggle = $('panelToggle');
function setPanel(open) {
  panel.hidden = !open;
  // 開いている間、歯車ボタンはパネルの下に隠れるので出さない（とじるボタンで閉じる）
  panelToggle.hidden = open;
  panelToggle.setAttribute('aria-expanded', String(open));
  // 子ども向けの表示をパネルに隠れない位置へ寄せる（styles.css の .panel-open）
  document.body.classList.toggle('panel-open', open);
  setTimeout(onResize, 50);
}
panelToggle.addEventListener('click', () => setPanel(panel.hidden));
$('panelClose').addEventListener('click', () => setPanel(false));
// 最初は遊び画面を見せる。設定は右上の歯車から開く。
// （テレビに映すので、最初に出るのは設定一覧ではなく魔法の世界にする）
setPanel(false);

// ---------------------------------------------------------------- あそぶ

$('btnStart').addEventListener('click', () => {
  listenStartedAt = Date.now();
  app.startListening();
});
$('btnStop').addEventListener('click', () => app.stopListening());
$('stageReset').addEventListener('click', () => app.resetWorld());
$('btnResetWorld').addEventListener('click', () => {
  if (confirm('世界を初期状態に戻します。色設定は消えません。よろしいですか？')) app.resetWorld();
});

for (const radio of document.querySelectorAll('input[name="inputMode"]')) {
  radio.checked = radio.value === app.settings.inputMode;
  radio.addEventListener('change', () => {
    if (radio.checked) {
      app.updateSettings({ inputMode: radio.value });
      paintModeNote();
    }
  });
}

function paintModeNote() {
  const note = $('modeNote');
  if (app.settings.inputMode === 'continuous') {
    note.innerHTML = '開始後は次の呪文を待ち続けます。<strong>iOS Safari では認識が1発話ごとに終了する挙動が報告されており、自動の再開がユーザー操作なしに許可されるかは実機で確認する項目です。</strong>再開できない場合は、もう一度「はじめる」を押す案内を出します。';
  } else {
    note.innerHTML = `「はじめる」を押してから <strong>${app.settings.pushWindowMs}ms</strong> だけ聞き取ります。実機での自動再開が未検証のため、こちらを既定にしています。`;
  }
}
paintModeNote();

function paintSupport() {
  const s = app.support;
  const el = $('supportStatus');
  if (!s.hasApi) {
    el.innerHTML = '⚠️ このブラウザに音声認識APIがありません。<strong>手動のボタンだけで遊べます。</strong>';
    return;
  }
  el.innerHTML = `音声認識API: <strong>${s.apiName}</strong> を検出。実際の精度・連続動作・オフライン可否は実機で確認します（未確認の動作を「対応済み」とは表示しません）。`;
}
paintSupport();

// ---------------------------------------------------------------- 手動発動

const manualGrid = $('manualSpells');
function buildManualButtons() {
  manualGrid.innerHTML = '';
  for (const spell of SPELLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spellbtn';
    btn.dataset.spell = spell.id;
    btn.innerHTML = `<span class="spellbtn__dot"></span><span class="spellbtn__name">${spell.spelling}<span class="spellbtn__kana">${spell.katakana}</span></span>`;
    btn.title = spell.effectSummary;
    btn.addEventListener('click', () => {
      app.audio.unlock();
      stopTour(); if(app.previewSavedWorld)app.endPreview();
      app.castSpell(spell.id, 'manual');
    });
    manualGrid.append(btn);
  }
  paintManualButtons();
}

function paintManualButtons() {
  const voiceOn = new Set(app.enabledSpellIds);
  for (const btn of manualGrid.querySelectorAll('.spellbtn')) {
    const id = btn.dataset.spell;
    const color = app.colors.getColor(id);
    const dot = btn.querySelector('.spellbtn__dot');
    dot.style.background = color;
    dot.style.color = color;
    btn.dataset.voice = voiceOn.has(id) ? 'on' : 'off';
  }
}
buildManualButtons();

// ---------------------------------------------------------------- 設定

function bindRange(id, outId, key, format) {
  const input = $(id);
  const out = $(outId);
  input.value = String(app.settings[key]);
  const paint = () => { out.textContent = format(Number(input.value)); };
  paint();
  input.addEventListener('input', () => {
    paint();
    app.updateSettings({ [key]: Number(input.value) });
    if (key === 'pushWindowMs') paintModeNote();
  });
}
bindRange('castDelay', 'castDelayOut', 'castDelayMs', (v) => `${v}ms`);
bindRange('volume', 'volumeOut', 'volume', (v) => `${Math.round(v * 100)}%`);
bindRange('pushWindow', 'pushWindowOut', 'pushWindowMs', (v) => `${v}ms`);

const strictnessSel = $('strictness');
for (const [key, level] of Object.entries(STRICTNESS_LEVELS)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = level.label;
  strictnessSel.append(opt);
}
strictnessSel.value = app.settings.strictness;
const paintStrictnessNote = () => {
  $('strictnessNote').textContent = STRICTNESS_LEVELS[strictnessSel.value].description
    + ' 判定を広げると誤発動も増える可能性があります。聞き取り結果は診断欄から追加登録できます。';
};
paintStrictnessNote();
strictnessSel.addEventListener('change', () => {
  app.updateSettings({ strictness: strictnessSel.value });
  paintStrictnessNote();
});

const langSel = $('lang');
for (const l of RECOGNITION_LANGS) {
  const opt = document.createElement('option');
  opt.value = l.value;
  opt.textContent = l.label;
  langSel.append(opt);
}
langSel.value = app.settings.lang;
const paintLangNote = () => {
  const l = RECOGNITION_LANGS.find((x) => x.value === langSel.value);
  $('langNote').textContent = `${l?.note || ''} どちらが合うかは実機で比べて決めます。`;
};
paintLangNote();
langSel.addEventListener('change', () => {
  app.updateSettings({ lang: langSel.value });
  paintLangNote();
});

const vanishSel = $('vanishCount');
vanishSel.value = String(app.settings.vanishCount);
vanishSel.addEventListener('change', () => app.updateSettings({ vanishCount: Number(vanishSel.value) }));

const enemySelect = $('enemyVariant');
for (const v of ENEMY_VARIANTS) {const option=document.createElement('option');option.value=v.id;option.textContent=v.name;enemySelect.append(option);}
enemySelect.value=app.settings.enemyVariant;
const paintEnemy=()=>{$('enemyDescription').textContent=enemyVariant(app.settings.enemyVariant).description;};
paintEnemy();
enemySelect.addEventListener('change',()=>{app.updateSettings({enemyVariant:enemySelect.value});paintEnemy();});

const lowPower = $('lowPower');
lowPower.checked = app.settings.lowPower;
lowPower.addEventListener('change', () => app.updateSettings({ lowPower: lowPower.checked }));

// ---------------------------------------------------------------- 発光色の設定

const colorList = $('colorList');
/** 保存前の下書き。保存を押すまでストアには書かない。 */
const drafts = new Map();

function buildColorRows() {
  colorList.innerHTML = '';
  for (const spell of SPELLS) {
    const entry = app.colors.get(spell.id);
    drafts.set(spell.id, entry.color);

    const row = document.createElement('div');
    row.className = 'colorrow';
    row.dataset.spell = spell.id;
    row.innerHTML = `
      <div class="colorrow__head">
        <span class="colorrow__swatch" data-role="swatch"></span>
        <span class="colorrow__name">${spell.spelling}<span class="colorrow__kana">説明書の色: ${spell.defaultColorName}　/　${spell.effectSummary}</span></span>
        <span class="colorrow__badge" data-role="badge"></span>
      </div>
      <div class="colorrow__controls">
        <input type="color" data-role="picker" aria-label="${spell.spelling} の色">
        <div class="swatches" data-role="swatches"></div>
      </div>
      <div class="colorrow__controls">
        <button type="button" class="btn btn--tiny" data-role="preview">プレビュー</button>
        <button type="button" class="btn btn--tiny btn--primary" data-role="save">保存</button>
        <button type="button" class="btn btn--tiny" data-role="reset">初期値に戻す</button>
        <span class="mono" data-role="hex"></span>
      </div>
      <label class="colorrow__verify">
        <input type="checkbox" data-role="verified">
        実物の杖で確認した色（保護者が確認したときだけ入れる）
      </label>`;

    const swatchBox = row.querySelector('[data-role="swatches"]');
    for (const sw of COLOR_SWATCHES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = sw.hex;
      b.title = `${sw.name} ${sw.hex}`;
      b.setAttribute('aria-label', sw.name);
      b.dataset.hex = sw.hex;
      b.addEventListener('click', () => setDraft(spell.id, sw.hex));
      swatchBox.append(b);
    }

    row.querySelector('[data-role="picker"]').addEventListener('input', (e) => setDraft(spell.id, e.target.value));
    row.querySelector('[data-role="preview"]').addEventListener('click', () => {
      // プレビューは短い光の見本だけ。世界の状態は変えない。
      app.audio.unlock();
      app.scene.preview(drafts.get(spell.id));
      app.audio.playPreview();
      app.diag.log({ type: 'color_preview_draft', spellId: spell.id, color: drafts.get(spell.id) });
    });
    row.querySelector('[data-role="save"]').addEventListener('click', () => {
      const hex = drafts.get(spell.id);
      if (!isValidHexColor(hex)) {
        setColorStatus(`保存できません: ${hex} は #RRGGBB 形式ではありません。`);
        return;
      }
      app.colors.setColor(spell.id, hex);
      setColorStatus(`${spell.spelling} の色を ${normalizeHexColor(hex)} で保存しました。他の呪文は変わりません。`);
    });
    row.querySelector('[data-role="reset"]').addEventListener('click', () => {
      app.colors.resetSpell(spell.id);
      setColorStatus(`${spell.spelling} の色を説明書の色（${spell.defaultColorName} ${spell.defaultColor}）に戻しました。`);
    });
    row.querySelector('[data-role="verified"]').addEventListener('change', (e) => {
      app.colors.setVerified(spell.id, e.target.checked);
    });

    colorList.append(row);
  }
  paintColorRows();
}

function setDraft(spellId, hex) {
  drafts.set(spellId, normalizeHexColor(hex));
  paintColorRow(spellId);
}

function paintColorRow(spellId) {
  const row = colorList.querySelector(`[data-spell="${spellId}"]`);
  if (!row) return;
  const entry = app.colors.get(spellId);
  const draft = drafts.get(spellId) || entry.color;
  const dirty = draft.toUpperCase() !== entry.color.toUpperCase();

  const swatch = row.querySelector('[data-role="swatch"]');
  swatch.style.background = draft;
  swatch.style.color = draft;

  row.querySelector('[data-role="picker"]').value = draft.toLowerCase();
  row.querySelector('[data-role="hex"]').textContent = dirty ? `${draft}（未保存）` : draft;
  row.querySelector('[data-role="verified"]').checked = entry.verified;

  const badge = row.querySelector('[data-role="badge"]');
  if (entry.verified) {
    badge.dataset.kind = 'verified';
    badge.textContent = '実物確認済み';
  } else {
    badge.dataset.kind = entry.source;
    badge.textContent = entry.sourceLabel;
  }

  for (const b of row.querySelectorAll('[data-role="swatches"] button')) {
    b.setAttribute('aria-pressed', String(b.dataset.hex.toUpperCase() === draft.toUpperCase()));
  }
}

function paintColorRows() {
  for (const spell of SPELLS) paintColorRow(spell.id);
  paintManualButtons();
}

function setColorStatus(text) {
  $('colorStatus').textContent = text;
}

buildColorRows();

app.colors.onChange((changed) => {
  for (const id of changed) drafts.set(id, app.colors.getColor(id));
  paintColorRows();
});

if (app.colors.migrationNote) setColorStatus(app.colors.migrationNote);
if (app.colors.loadError) setColorStatus(app.colors.loadError);
if (app.colors.saveError) setColorStatus(app.colors.saveError);

$('btnExportColors').addEventListener('click', async () => {
  const json = app.colors.exportJSON();
  $('colorIO').value = json;
  try {
    await navigator.clipboard.writeText(json);
    setColorStatus('色設定を書き出し、クリップボードにもコピーしました。別の端末では下の欄に貼り付けて読み込んでください。');
  } catch (_) {
    setColorStatus('色設定を下の欄に書き出しました。手で選択してコピーしてください。');
  }
});

$('btnImportColors').addEventListener('click', () => {
  const text = $('colorIO').value.trim();
  if (!text) {
    setColorStatus('読み込む内容が空です。書き出した内容を下の欄に貼り付けてください。');
    return;
  }
  try {
    const result = app.colors.importJSON(text);
    const rejected = result.rejected.length
      ? ` 適用しなかった項目: ${result.rejected.map((r) => `${r.spellId}(${r.reason})`).join(', ')}`
      : '';
    setColorStatus(`${result.applied}件の色設定を読み込みました。${rejected}`);
  } catch (err) {
    setColorStatus(`${err.message} 元の設定は変えていません。`);
  }
});

$('btnResetAllColors').addEventListener('click', () => {
  if (!confirm('14呪文すべての色を説明書の色に戻します。実物確認済みの印も外れます。よろしいですか？')) return;
  app.colors.resetAll();
  setColorStatus('全呪文の色を説明書の色に戻しました。');
});

// ---------------------------------------------------------------- 診断

const testerSel = $('tester');
for (const t of TESTER_TAGS) {
  const opt = document.createElement('option');
  opt.value = t.value;
  opt.textContent = t.label;
  testerSel.append(opt);
}
testerSel.value = app.diag.tester;
testerSel.addEventListener('change', () => app.diag.setTester(testerSel.value));

$('btnMisfire').addEventListener('click', () => {
  const note = prompt('誤発動の状況を書けます（省略可）。例: テレビの効果音で発動した / 杖の音で発動した', '');
  if (note === null) return;
  const marked = app.diag.markLastCastAsMisfire(note);
  if (!marked) alert('印を付ける発動がまだありません。');
});

$('btnResetCounts').addEventListener('click', () => {
  if (confirm('試験の回数をすべて0に戻します。色設定は消えません。よろしいですか？')) app.diag.resetCounts();
});

const candSpellSel = $('candSpell');
for (const spell of SPELLS) {
  const opt = document.createElement('option');
  opt.value = spell.id;
  opt.textContent = spell.spelling;
  candSpellSel.append(opt);
}

$('btnAddCand').addEventListener('click', () => {
  const text = $('candText').value;
  try {
    app.diag.addCandidate(candSpellSel.value, text);
    $('candText').value = '';
  } catch (err) {
    alert(err.message);
  }
});

$('btnCopyReport').addEventListener('click', async () => {
  const report = app.diag.exportReport(app.snapshotForReport());
  $('colorIO').value = report;
  try {
    await navigator.clipboard.writeText(report);
    alert('試験記録をクリップボードにコピーしました（色設定の欄にも表示しています）。');
  } catch (_) {
    alert('コピーできなかったため、色設定の欄に表示しました。手で選択してコピーしてください。');
  }
});

$('btnClearLog').addEventListener('click', () => app.diag.clearLog());

const COUNT_ROWS = [
  ['utterances', '受け付けた発話'],
  ['matched', '呪文と一致'],
  ['applied', '演出まで実行'],
  ['noTarget', '対象なし'],
  ['atCap', '上限'],
  ['noMatch', '不一致'],
  ['ambiguous', '曖昧で失敗'],
  ['misfire', '誤発動（保護者の印）'],
];

function paintCounts() {
  const tags = TESTER_TAGS.filter((t) => t.value !== 'unset' || app.diag.counts.unset.utterances > 0);
  const head = `<thead><tr><th>項目</th>${tags.map((t) => `<th>${t.label.replace('（わざと違う言葉）', '')}</th>`).join('')}</tr></thead>`;
  const body = COUNT_ROWS
    .map(([key, label]) => `<tr><td>${label}</td>${tags.map((t) => `<td>${app.diag.counts[t.value][key]}</td>`).join('')}</tr>`)
    .join('');
  $('counts').innerHTML = `${head}<tbody>${body}</tbody>`;
}

function paintSpeechStats() {
  const s = app.speech.stats;
  const labels = {
    sessions: '認識の開始回数',
    results: '結果の通知回数',
    finals: '確定した結果',
    restarts: '自動の再開試行',
    restartFailures: '再開の失敗',
    rapidEnds: 'すぐ終了した回数',
    noSpeech: '無音エラー',
    aborted: '中断',
    networkErrors: '通信エラー',
    permissionErrors: '権限エラー',
    otherErrors: 'その他のエラー',
    duplicatesIgnored: '重複を無視',
    suppressedResults: '抑制中に無視',
  };
  const rows = Object.entries(labels)
    .map(([k, label]) => `<tr><td>${label}</td><td>${s[k]}</td></tr>`)
    .join('');
  $('speechStats').innerHTML = `<tbody>${rows}</tbody>`;
}

function paintFps() {
  const f = app.fps;
  const el = $('fpsLine');
  if (app.scene.renderError) { el.textContent='3D未起動：描画速度は測定できません'; return; }
  if (f.samples < 2) {
    el.textContent = '測定中…';
    return;
  }
  const min = `最低 ${f.min} fps`;
  if (f.suggestLowPower) {
    el.innerHTML = `いま <strong>${f.current} fps</strong>（${min}）。<strong>24fps を下回る状態が続いています。「軽量描画にする」を試してください。</strong>`;
  } else {
    el.innerHTML = `いま <strong>${f.current} fps</strong>（${min}）。自動では切り替えません。発熱やカクつきが気になるときは「軽量描画にする」を入れてください。`;
  }
}

function paintCandidates() {
  const box = $('candList');
  const entries = Object.entries(app.diag.extraCandidates);
  if (entries.length === 0) {
    box.innerHTML = '<span class="note">追加された候補はまだありません。</span>';
    return;
  }
  box.innerHTML = '';
  for (const [spellId, list] of entries) {
    for (const text of list) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${spellId}: ${text}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '削除';
      del.addEventListener('click', () => app.diag.removeCandidate(spellId, text));
      chip.append(del);
      box.append(chip);
    }
  }
}

function paintLog() {
  const el = $('log');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.textContent = app.diag.entries
    .slice(-120)
    .map((e) => {
      const time = new Date(e.at).toLocaleTimeString('ja-JP', { hour12: false });
      const rest = Object.entries(e)
        .filter(([k]) => k !== 'at' && k !== 'type')
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : String(v)}`)
        .join(' ');
      return `${time} [${e.type}] ${rest}`;
    })
    .join('\n');
  if (atBottom) el.scrollTop = el.scrollHeight;
}

let diagPaintQueued = false;
app.diag.onChange(() => {
  if (diagPaintQueued) return;
  diagPaintQueued = true;
  requestAnimationFrame(() => {
    diagPaintQueued = false;
    paintCounts();
    paintSpeechStats();
    paintCandidates();
    paintLog();
  });
});
paintCounts();
paintSpeechStats();
paintCandidates();
paintLog();
setInterval(() => { paintSpeechStats(); paintFps(); }, 2000);
paintFps();

// ---------------------------------------------------------------- 既知の制約

$('limitations').innerHTML = `
  <h3>この試作で確かめたいこと（実機でしか決まらない）</h3>
  <ul>
    <li><strong>常時待ち受け</strong>：iOS Safari で認識が1発話ごとに終了するか、自動の再開が許可されるか。診断の「自動の再開試行／再開の失敗」で測れます。</li>
    <li><strong>誤変換</strong>：架空の単語が一般語になる度合い。認識言語を en-US と ja-JP で比べてください。</li>
    <li><strong>テレビの回り込み</strong>：HDMI接続でスピーカーから出た効果音が誤発動を招くか。起きたら「直前の発動は誤発動だった」を押してください。</li>
    <li><strong>説明書の色と実物のLEDが一致するか</strong>：杖を光らせてテレビと見比べ、ずれていたら色を調整し、合っていたら「実物の杖で確認した色」にチェックを入れてください。</li>
    <li><strong>玩具の杖の音</strong>：杖の効果音で誤発動するか。同じ手順で記録できます。</li>
    <li><strong>発熱と負荷</strong>：長時間でコマ落ちや発熱が出たら「軽量描画」を試してください。</li>
  </ul>
  <h3>この試作で保証していないこと</h3>
  <ul>
    <li>発音の<strong>採点</strong>はしていません。やっているのは認識テキストの許可リスト照合です。一致を「発音が正確」とは扱いません。</li>
    <li>ブラウザの音声認識は端末・ブラウザ・サービス依存です。<strong>無料・連続動作・オフライン・高精度のいずれも保証しません。</strong>認識はブラウザの機能が外部で処理する場合があります（このアプリは録音を保存・送信しません）。</li>
    <li>初期色は<strong>購入品の説明書に記載された色</strong>です（2026年10月18日に反映）。ただし説明書にあるのは色の名前なので、
      「黄色」をどの黄色にするかという具体的な値は開発側の解釈です。<strong>実物のLEDを見比べての確認はまだです。</strong></li>
    <li>テレビと杖の<strong>発光色の完全な一致は保証しません</strong>。表示機器と明るさで見え方が変わります。</li>
    <li>色設定はこのブラウザの保存領域にあります。<strong>データ消去・端末やブラウザの変更では自動移行しません。</strong>「色設定を書き出す／読み込む」で移してください。</li>
  </ul>
  <h3>遊びの初期案（要件書7章の未指定部分）</h3>
  <ul>
    <li>増える上限：たからもの ${CAPS.treasures}個 / ヘビ ${CAPS.snakes}匹 / ナメクジ ${CAPS.slugs}匹。壊せる岩は ${INITIAL_ROCK_COUNT}個。</li>
    <li>人に作用する8呪文の対象は、大広間に立つ<strong>デスイーターの仮面と黒いローブの敵</strong>です（子ども自身が杖を振る側なので、画面の中に分身を置いていません）。</li>
    <li>Everte Statum で小さないたみができ、Episkey の対象になります（表現は控えめ）。</li>
    <li>くすぐり・鈍足は有限時間で元に戻り、初期化でも解除されます。</li>
    <li>全14呪文が音声・手動ともに最初から有効です。</li>
  </ul>`;

// ---------------------------------------------------------------- 起動時のひとこと

app.diag.log({
  type: 'app_started',
  hasApi: app.support.hasApi,
  apiName: app.support.apiName,
  secure: String(app.support.isSecureContext),
  ua: app.support.userAgent,
});

// Camera is started only by an explicit parent action. Never automatically request permission.
const triggerMode = $('triggerMode'); triggerMode.value=app.settings.triggerMode;
triggerMode.addEventListener('change',()=>app.updateSettings({triggerMode:triggerMode.value}));
app.gesture.preview=$('cameraView');
async function startCamera() {
  app.audio.unlock();
  // Explicit camera ON selects the mode that actually uses it.
  if (app.settings.triggerMode !== 'gesture') { app.updateSettings({triggerMode:'gesture'}); triggerMode.value='gesture'; }
  await app.gesture.start($('cameraFacing').value);
  paintDevices();
}
$('cameraStart').addEventListener('click',startCamera);
$('cameraStop').addEventListener('click',()=>{app.cancelCast();app.gesture.stop();});
$('cameraPreview').addEventListener('change',()=>{$('cameraView').hidden=!$('cameraPreview').checked;});
$('gestureRegion').addEventListener('change',()=>{
  const region=$('gestureRegion').value;
  app.gesture.roi=region==='left'?{x:.05,y:.05,w:.45,h:.8}:region==='right'?{x:.5,y:.05,w:.45,h:.8}:{x:.15,y:.08,w:.7,h:.75};
  app.gesture.gate.reset();
});
$('gestureTravel').addEventListener('input',()=>{app.gesture.gate.travel=Number($('gestureTravel').value);$('gestureTravelOut').textContent=`${Math.round(app.gesture.gate.travel*100)}%（小さいほど敏感）`;});
$('originX').value=app.settings.originX||0;app.scene.setOrigin(Number($('originX').value));
$('originX').addEventListener('input',()=>{const originX=Number($('originX').value);app.scene.setOrigin(originX);app.updateSettings({originX});});
app.onStatus(status=>{if(status.cameraMessage)$('cameraStatus').textContent=status.cameraMessage;});
let tourTimer=null, tourIndex=0;
for(const spell of SPELLS){const o=document.createElement('option');o.value=spell.id;o.textContent=spell.spelling;$('previewSpell').append(o);}
function stopTour(){clearTimeout(tourTimer);tourTimer=null;}
function playPreview(){app.audio.unlock();app.previewSpell($('previewSpell').value);setPanel(false);$('previewStatus').textContent=$('previewSpell').selectedOptions[0].textContent;}
$('previewPlay').addEventListener('click',()=>{stopTour();playPreview();});
$('previewAll').addEventListener('click',()=>{stopTour();tourIndex=0; const next=()=>{
  if(tourIndex>=SPELLS.length){app.endPreview();$('previewStatus').textContent='14呪文の確認が終了しました';return;}
  $('previewSpell').value=SPELLS[tourIndex++].id;playPreview();tourTimer=setTimeout(next,7000);
};next();});
$('previewEnd').addEventListener('click',()=>{stopTour();app.endPreview();$('previewStatus').textContent='通常の世界に戻りました';});
// Other parent actions leave the isolated preview and cancel its scheduled tour.
for(const id of ['stageReset','btnResetWorld','btnStart','btnStop','castBtn','micToggle'])$(id).addEventListener('click',()=>{stopTour();if(app.previewSavedWorld)app.endPreview();},true);
window.addEventListener('pagehide',()=>{stopTour();app.stopListening('pagehide');app.gesture.stop();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopTour();app.stopListening('hidden');app.gesture.stop();}});

const easyList=document.getElementById('easyWords');
for(const spell of SPELLS){const row=document.createElement('li');row.textContent=`${spell.spelling}：${EASY_ALIASES[spell.id]}`;easyList.append(row);}
