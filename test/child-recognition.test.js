import test from 'node:test';
import assert from 'node:assert/strict';
import {matchSpell as rawMatch,matchRecognition as rawRecognition,CHILD_ALIASES} from '../src/matcher.js';
import {SPELLS} from '../src/spells.js';

test('all 14 spells and all child aliases are uniquely recognized',()=>{
 assert.equal(Object.keys(CHILD_ALIASES).length,14);
 for(const spell of SPELLS)for(const s of [spell.katakana,spell.spelling,...CHILD_ALIASES[spell.id]])assert.equal(matchSpell(s).spellId,spell.id,s);
});
test('synthetic pronunciation omissions and substitutions work; not an accuracy measurement',()=>{
 for(const [s,id] of Object.entries({'ぷよてご':'protego','えぴちき':'episkey','しゅちゅぴはい':'stupefy','いんぺりめんた':'impedimenta','えくちゅぺりあむちゅ':'expelliarmus','さぺんそちあ':'serpensortia'}))assert.equal(matchSpell(s).spellId,id,s);
});
test('common household words and very short fragments do not activate spells',()=>{
 for(const s of ['こんにちは','パパ','ママ','もういっかい','おしまい','テレビ','ごはん','すごい','できた','ありがとう','おやすみ','魔法','エピ','あ','赤','きいろ','青','ピンク','開けて','いちご','おかあさん','stop','hello','banana'])assert.equal(matchSpell(s).matched,false,s);
});
test('conflicting parent aliases remain ambiguous',()=>{
 const r=matchSpell('ぷよてご',{extraCandidates:{accio:['ぷよてご'],protego:['ぷよてご']}});assert.equal(r.reason,'ambiguous');
});
test('recognition prefers exact alternatives, but refuses contradictory spell alternatives',()=>{
 assert.equal(matchRecognition('雑音',[{transcript:'ぷよてご'}]).result.spellId,'protego');
 assert.equal(matchRecognition('えぴちき',[{transcript:'プロテゴ'}]).result.spellId,'protego');
 assert.equal(matchRecognition('Accio',[{transcript:'Protego'}]).result.reason,'ambiguous');
 assert.equal(matchRecognition('雑音',[{transcript:'ぷよてご'},{transcript:'えぴちき'}]).result.reason,'ambiguous');
});

function matchSpell(s,o={}){return rawMatch(s,{strictness:'child',...o});}
function matchRecognition(s,a,o={}){return rawRecognition(s,a,{strictness:'child',...o});}
