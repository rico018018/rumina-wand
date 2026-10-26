/**
 * 14呪文の定義。
 *
 * 【重要な前提】
 * - defaultColor は「購入品の説明書に記載されている色」です（2026年10月18日に利用者から提供）。
 *   説明書の記載順と、この SPELLS 配列の順番は一致しています。
 *   ただし説明書に書かれているのは色の名前であり、hex 値は開発側の解釈です。
 *   「黄色」をどの黄色にするかまでは説明書に書かれていないため、
 *   テレビと実物の杖を見比べて保護者が微調整できる前提のままです。
 * - 「説明書の色」と「実物のLEDを目で確認した色」は別物として扱います。
 *   実物確認済みの印は、保護者が明示的に入れたときだけ付きます（colors.js）。
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
    defaultColor: '#FFD426',
    defaultColorName: '黄色',
    colorSource: 'manual',
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
    effectSummary: '敵が力を失って倒れる',
    defaultColor: '#FF2E63',
    defaultColorName: '赤ピンク',
    colorSource: 'manual',
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
    defaultColor: '#2563EB',
    defaultColorName: '青',
    colorSource: 'manual',
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
    effectSummary: '自分の目前に大きな青い透明の盾が現れる',
    defaultColor: '#00B4D8',
    defaultColorName: '濃い水色',
    colorSource: 'manual',
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
    effectSummary: '倒れた敵が目を覚まして立ち上がる',
    defaultColor: '#FF5A1F',
    defaultColorName: '赤オレンジ',
    colorSource: 'manual',
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
    effectSummary: 'てきのいたみが元に戻る。表現は控えめ',
    defaultColor: '#FFB877',
    defaultColorName: '薄いオレンジ',
    colorSource: 'manual',
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
    effectSummary: '敵が持つ杖が手から飛び、床に残る',
    defaultColor: '#FF6FB5',
    defaultColorName: 'ピンク',
    colorSource: 'manual',
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
    effectSummary: 'てきががたがた震えて笑う',
    defaultColor: '#C2E0FF',
    defaultColorName: '白ブルー',
    colorSource: 'manual',
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
    defaultColor: '#DCC8FF',
    defaultColorName: '白紫',
    colorSource: 'manual',
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
    effectSummary: 'てきのかめんの したから小さなナメクジが落ちる。桶に落ちる軽いコミカルな演出',
    defaultColor: '#2ECC71',
    defaultColorName: '緑',
    colorSource: 'manual',
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
    effectSummary: '見回りをするてきの歩きを遅くする',
    defaultColor: '#9BE8F7',
    defaultColorName: '淡い水色',
    colorSource: 'manual',
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
    defaultColor: '#B388FF',
    defaultColorName: '薄い紫',
    colorSource: 'manual',
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
    defaultColor: '#FF5A1F',
    defaultColorName: '赤オレンジ',
    colorSource: 'manual',
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
    effectSummary: 'てきを後ろへ飛ばす。安全な柔らかい着地点を描く',
    defaultColor: '#FFD426',
    defaultColorName: '黄色',
    colorSource: 'manual',
    candidates: {
      en: ['everte statum', 'everte stattum', 'evertay statum', 'everte statun', 'everte status', 'eh ver tay stah tum'],
      ja: ['エヴァーテイスタータム', 'エバーテイスタータム', 'エヴェルテスタートゥム', 'エバーテスタータム'],
    },
  },
];

export const SPELL_BY_ID = new Map(SPELLS.map((s) => [s.id, s]));

/**
 * 色見本パレット（保護者向けのプリセット）。自由な色選択も別に用意する。
 * 説明書に出てくる色名を優先して並べてあるので、説明書を見ながら選べる。
 */
export const COLOR_SWATCHES = [
  { name: '黄色', hex: '#FFD426' },
  { name: '赤オレンジ', hex: '#FF5A1F' },
  { name: '薄いオレンジ', hex: '#FFB877' },
  { name: '赤ピンク', hex: '#FF2E63' },
  { name: 'ピンク', hex: '#FF6FB5' },
  { name: '緑', hex: '#2ECC71' },
  { name: '濃い水色', hex: '#00B4D8' },
  { name: '淡い水色', hex: '#9BE8F7' },
  { name: '青', hex: '#2563EB' },
  { name: '白ブルー', hex: '#C2E0FF' },
  { name: '薄い紫', hex: '#B388FF' },
  { name: '白紫', hex: '#DCC8FF' },
  { name: '赤', hex: '#FF3B30' },
  { name: '白', hex: '#FFFFFF' },
];

export function isPhase1(spellId) {
  return PHASE1_SPELL_IDS.includes(spellId);
}
