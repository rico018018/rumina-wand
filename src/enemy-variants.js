/** Visual presets only; every opponent uses the same non-attacking spell target. */
export const ENEMY_VARIANTS = Object.freeze([
  {id:'silver',name:'銀の仮面',description:'彫金の銀面と、幾重にも重なる黒いローブ。',width:1, jaw:.22, nose:1, eyes:1, hood:1, shoulder:1, hem:1, folds:13, metal:0xb9b8b1, roughness:.66, cloth:0x202322, mantle:false},
  {id:'veil',name:'細身の仮面',description:'細長い銀面、深いフード、縦に流れる細いひだ。',width:.87, jaw:.36, nose:1.16, eyes:.88, hood:1.17, shoulder:.93, hem:.91, folds:17, metal:0xc1c6c6, roughness:.57, cloth:0x191e22, mantle:false},
  {id:'warden',name:'重厚な仮面',description:'幅広い鉄銀の面と、厚く重なる肩のケープ。',width:1.12, jaw:.12, nose:.86, eyes:.83, hood:.96, shoulder:1.12, hem:1.1, folds:10, metal:0x858e91, roughness:.78, cloth:0x242626, mantle:true},
  {id:'relic',name:'古びた仮面',description:'くすんだ銀面、摩耗した布、長く垂れた肩布。',width:.97, jaw:.29, nose:1.05, eyes:.94, hood:1.08, shoulder:1.02, hem:1.06, folds:15, metal:0xa99d85, roughness:.86, cloth:0x292720, mantle:true},
].map(Object.freeze));
export function enemyVariant(id) { return ENEMY_VARIANTS.find(v=>v.id===id)||ENEMY_VARIANTS[0]; }
