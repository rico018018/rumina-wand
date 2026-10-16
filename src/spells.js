/**
 * 14呪文の定義。
 *
 * 【重要な前提】
 * - defaultColor は「仮の初期色」です。実物の玩具の杖のLED色は未確認のため、
 *   映画やゲームの色を実物の確定色として登録していません。見分けやすさだけを基準に
 *   開発者が暫定で割り振った値です。保護者が後から実物に合わせて変更します。
 * - candidates は「この文字列が返ってきたら確実にこの呪文だ」と言える認識表記の許可リストです。
 *   実機の音声認識が実際に何を返すかは未検証なので、開発者の推測で種を入れてあります。
 *   実機ログ（診断画面）を見て保護者が候補を追加して育てる設計です。
 *   「一番近い呪文へ自動で割り当てる」処理は matcher.js で明示的に禁止しています。
 */

/** 第1段階（実機試作）で音声・演出を有効にする呪文 */
export const PHASE1_SPELL_IDS = ['accio', 'protego', 'serpensortia'];

export const SPELLS = [
  {
    id: 'accio',
    spelling: 'Accio',
    guide: 'AH-key-oh',
    katakana: 'アー・キー・オー',
    effectSummary: '宝物が奥から手前の宝物置き場へ飛んでくる',
    defaultColor: '#FFC83D',
    defaultColorName: '金',
    candidates: {
      en: ['accio', 'acio', 'ackio', 'achio', 'ahkio', 'ah key oh', 'aki oh', 'akkio', 'arkio'],
      ja: ['アキオ', 'アーキーオー', 'アーキオ', 'アッキオ', 'アキオー', 'アーキーオ', 'アシオ'],
    },
  },
  {
    id: 'stupefy',
    spelling: 'Stupefy',
    guide: 'STOO-puh-fy',
    katakana: 'ストゥー・プ・ファイ',
    effectSummary: '別の魔法使いが気絶し、柔らかい場所に横たわる',
    defaultColor: '#FF3B30',
    defaultColorName: '赤',
    candidates: {
      en: ['stupefy', 'stupify', 'stoopify', 'stupefi', 'stu puh fy', 'stoo puh fy', 'stupefied'],
      ja: ['ストゥープファイ', 'ストゥープファイ', 'ステューピファイ', 'ストゥピファイ', 'スチューピファイ'],
    },
  },
  {
    id: 'reducto',
    spelling: 'Reducto',
    guide: 'reh-DUCK-toe',
    katakana: 'レ・ダック・トー',
    effectSummary: '壊せる岩を破片へ変える。破片が残る',
    defaultColor: '#FF7A1A',
    defaultColorName: 'オレンジ',
    candidates: {
      en: ['reducto', 'reductor', 'reducktoe', 'reh duck toe', 'redukto', 'reducto!', 'reduct'],
      ja: ['レダクトー', 'レダクト', 'リダクトー', 'レダックトー', 'レダクトウ'],
    },
  },
  {
    id: 'protego',
    spelling: 'Protego',
    guide: 'pro-TAY-goh',
    katakana: 'プロ・テイ・ゴー',
    effectSummary: '青い盾が現れる。外からの魔法の光を防ぐ演出',
    defaultColor: '#3B82F6',
    defaultColorName: '青',
    candidates: {
      en: ['protego', 'protago', 'pro tego', 'pro tay go', 'protaygo', 'portego', 'protegro', 'prothego'],
      ja: ['プロテイゴー', 'プロテゴ', 'プロテーゴ', 'プロテイゴ', 'プロテゴー', 'プロテイガ'],
    },
  },
  {
    id: 'rennervate',
    spelling: 'Rennervate',
    guide: 'REH-ner-vate',
    katakana: 'レ・ナー・ヴェイト',
    effectSummary: '気絶した魔法使いが目を開けて起きる',
    defaultColor: '#FFFFFF',
    defaultColorName: '白',
    candidates: {
      en: ['rennervate', 'renervate', 'rennerveight', 'reh ner vate', 'rennervait', 'renovate'],
      ja: ['レナーヴェイト', 'レナーベイト', 'レネルヴェイト', 'レナベイト', 'レナーヴェート'],
    },
  },
  {
    id: 'episkey',
    spelling: 'Episkey',
    guide: 'eh-PIS-key',
    katakana: 'エ・ピス・キー',
    effectSummary: '魔法使いの小さなけがを治す。傷の表現は控えめ',
    defaultColor: '#FF8FC8',
    defaultColorName: 'ピンク',
    candidates: {
      en: ['episkey', 'episkee', 'epis key', 'eh pis key', 'episky', 'epistky', 'apiskey'],
      ja: ['エピスキー', 'エピスキ', 'エピースキー', 'エピスキィ'],
    },
  },
  {
    id: 'expelliarmus',
    spelling: 'Expelliarmus',
    guide: 'eck-SPELL-ee-AR-muss',
    katakana: 'エク・スペル・イー・アー・マス',
    effectSummary: '魔法使いが持つ杖が手から飛び、床に残る',
    defaultColor: '#C026D3',
    defaultColorName: '赤紫',
    candidates: {
      en: ['expelliarmus', 'expeliarmus', 'expelliarmous', 'ex pelli armus', 'expelliamus', 'expelearmus', 'expelliarmus!'],
      ja: ['エクスペリアームス', 'エクスペリアルムス', 'エクスペリアーマス', 'エクスペリアムス', 'エクスペルイアーマス'],
    },
  },
  {
    id: 'rictusempra',
    spelling: 'Rictusempra',
    guide: 'rik-tuh-SEM-pra',
    katakana: 'リク・タ・セム・プラ',
    effectSummary: '魔法使いがくすぐったくなり笑う',
    defaultColor: '#FDE047',
    defaultColorName: '黄',
    candidates: {
      en: ['rictusempra', 'rictu sempra', 'rictusenpra', 'ricta sempra', 'rictusempre', 'rictosempra'],
      ja: ['リクタセンプラ', 'リクトゥセンプラ', 'リクタセムプラ', 'リクツセンプラ'],
    },
  },
  {
    id: 'serpensortia',
    spelling: 'Serpensortia',
    guide: 'ser-pen-SOR-tee-ah',
    katakana: 'サー・ペン・ソー・ティー・アー',
    effectSummary: '小さなヘビを1匹追加。繰り返すと増える',
    defaultColor: '#2ECC71',
    defaultColorName: '緑',
    candidates: {
      en: ['serpensortia', 'serpen sortia', 'serpensortea', 'serpent sortia', 'serpensorsia', 'serpensortiya', 'serpentortia'],
      ja: ['サーペンソーティア', 'サーペンソルティア', 'セルペンソルティア', 'サーペンソーティアー', 'サーペンソーシア'],
    },
  },
  {
    id: 'slugulas_eructo',
    spelling: 'Slugulas Eructo',
    guide: 'slug-you-lus eh-RUCK-toe',
    katakana: 'スラグ・ユ・ラス エ・ラック・トー',
    effectSummary: '魔法使いが口から小さなナメクジを出す。桶に落ちる軽いコミカルな演出',
    defaultColor: '#9ACD32',
    defaultColorName: '黄緑',
    candidates: {
      en: ['slugulas eructo', 'slugulus eructo', 'slug you lus eh ruck toe', 'slugulas eruct', 'slugulos eructo', 'slugulas aructo'],
      ja: ['スラグユラスエラックトー', 'スラグラスエラクト', 'スラギュラスエラックトー', 'スラグユラスエラクト'],
    },
  },
  {
    id: 'impedimenta',
    spelling: 'Impedimenta',
    guide: 'im-ped-ih-MEN-tah',
    katakana: 'イム・ペド・イ・メン・タ',
    effectSummary: '歩く魔法使いの動きを遅くする',
    defaultColor: '#8B5CF6',
    defaultColorName: '紫',
    candidates: {
      en: ['impedimenta', 'impedimento', 'impedi menta', 'impedimenter', 'inpedimenta', 'impedimentah'],
      ja: ['インペディメンタ', 'イムペディメンタ', 'インペリメンタ', 'インペディメンター'],
    },
  },
  {
    id: 'vipera_evanesca',
    spelling: 'Vipera Evanesca',
    guide: 'vee-PER-ah eh-vuh-NES-kuh',
    katakana: 'ヴィー・パー・アー エ・ヴァ・ネス・カ',
    effectSummary: '画面にいるヘビを消す',
    defaultColor: '#22D3EE',
    defaultColorName: '水色',
    candidates: {
      en: ['vipera evanesca', 'vipera evanesca!', 'viper evanesca', 'vipera evaneska', 'vipera avanesca', 'vee per ah eh vuh nes kuh'],
      ja: ['ヴィーパーアーエヴァネスカ', 'ビーパーエバネスカ', 'ヴィペラエヴァネスカ', 'ビペラエバネスカ'],
    },
  },
  {
    id: 'finite_incantatem',
    spelling: 'Finite Incantatem',
    guide: 'fih-NEE-tay in-can-TAH-tem',
    katakana: 'フィ・ニー・テイ イン・カン・ター・テム',
    effectSummary: '世界全体を初期状態に戻す（今回の遊び専用の拡張ルール）',
    defaultColor: '#BFE3FF',
    defaultColorName: '淡い青白',
    candidates: {
      en: ['finite incantatem', 'finite incantartem', 'finite incantate', 'finitay incantatem', 'finite in cantatem', 'finite incantatum'],
      ja: ['フィニーテイインカンターテム', 'フィニーテインカンタテム', 'フィニテインカンターテム', 'フィニーテイインカンタテム'],
    },
  },
  {
    id: 'everte_statum',
    spelling: 'Everte Statum',
    guide: 'eh-VER-tay STAH-tum',
    katakana: 'エ・ヴァー・テイ スター・タム',
    effectSummary: '魔法使いを後ろへ飛ばす。安全な柔らかい着地点を描く',
    defaultColor: '#FF4D6D',
    defaultColorName: '赤ピンク',
    candidates: {
      en: ['everte statum', 'everte stattum', 'evertay statum', 'everte statun', 'everte status', 'eh ver tay stah tum'],
      ja: ['エヴァーテイスタータム', 'エバーテイスタータム', 'エヴェルテスタートゥム', 'エバーテスタータム'],
    },
  },
];

export const SPELL_BY_ID = new Map(SPELLS.map((s) => [s.id, s]));

/** 色見本パレット（保護者向けのプリセット）。自由な色選択も別に用意する。 */
export const COLOR_SWATCHES = [
  { name: '赤', hex: '#FF3B30' },
  { name: 'オレンジ', hex: '#FF7A1A' },
  { name: '黄', hex: '#FDE047' },
  { name: '金', hex: '#FFC83D' },
  { name: '黄緑', hex: '#9ACD32' },
  { name: '緑', hex: '#2ECC71' },
  { name: '水色', hex: '#22D3EE' },
  { name: '青', hex: '#3B82F6' },
  { name: '紫', hex: '#8B5CF6' },
  { name: '赤紫', hex: '#C026D3' },
  { name: 'ピンク', hex: '#FF8FC8' },
  { name: '白', hex: '#FFFFFF' },
];

export function isPhase1(spellId) {
  return PHASE1_SPELL_IDS.includes(spellId);
}
