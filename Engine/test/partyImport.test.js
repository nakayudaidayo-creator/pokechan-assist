// パーティ画面のスクショ取り込みのテスト。
// 文字の位置は、もらったチーム6のスクショ(能力・ステータス)で実際に文字が出ていた場所を、画面に対する割合で書いたもの。
// 実行: node --test Engine/test/partyImport.test.js
const test = require('node:test');
const assert = require('node:assert');
const {importParty} = require('../src/partyImport.js');
const team6 = require('../../Data/party.json').members;

const O = (text, x, y, w = 0.06, h = 0.03) => ({text, x, y, w, h});
// 6匹の枠のずれ:横に 0.341、縦に 0.202(左上 → 右上 → 左中 …の順)
const at = i => ({dx: (i % 2) * 0.341, dy: Math.floor(i / 2) * 0.202});

function abilityScreen(members) {
  const obs = [O('チーム6', 0.37, 0.08), O('能力', 0.41, 0.19), O('ステータス', 0.55, 0.19)];
  members.forEach((m, i) => {
    const {dx, dy} = at(i);
    obs.push(O(m.species, 0.205 + dx, 0.252 + dy, 0.07, 0.033));
    obs.push(O(m.gender === 'female' ? '♀' : '♂', 0.305 + dx, 0.255 + dy, 0.012));
    obs.push(O(m.ability, 0.21 + dx, 0.302 + dy, 0.07));
    obs.push(O(m.item, 0.21 + dx, 0.346 + dy, 0.08));
    m.moves.forEach((mv, j) => obs.push(O(mv, 0.383 + dx, 0.261 + dy + j * 0.042, 0.07)));
    obs.push(O(String(i + 1), 0.46 + dx, 0.36 + dy, 0.02, 0.05));
  });
  return obs;
}

function statusScreen(members) {
  const obs = [O('チーム6', 0.37, 0.08), O('能力', 0.41, 0.19), O('ステータス', 0.55, 0.19)];
  members.forEach((m, i) => {
    const {dx, dy} = at(i);
    obs.push(O(m.species, 0.205 + dx, 0.252 + dy, 0.07, 0.033));
    const left = [['HP', 'hp'], ['こうげき', 'atk'], ['ぼうぎょ', 'def']];
    const right = [['とくこう', 'spa'], ['とくぼう', 'spd'], ['すばやさ', 'spe']];
    left.forEach(([l, k], j) => {
      const y = 0.302 + dy + j * 0.042;
      obs.push(O(l, 0.209 + dx, y, 0.04), O(String(m.stats[k]), 0.264 + dx, y, 0.02), O(String(m.sp[k] || 0), 0.307 + dx, y, 0.015));
    });
    right.forEach(([l, k], j) => {
      const y = 0.302 + dy + j * 0.042;
      obs.push(O(l, 0.358 + dx, y, 0.04), O(String(m.stats[k]), 0.42 + dx, y, 0.02), O(String(m.sp[k] || 0), 0.457 + dx, y, 0.015));
    });
  });
  return obs;
}

test('チーム6の2枚から、6匹の技・特性・持ち物・SP・性格を取り込む', () => {
  const {members, warnings} = importParty([statusScreen(team6), abilityScreen(team6)]);
  assert.deepStrictEqual(warnings, []);
  assert.strictEqual(members.length, 6);
  members.forEach((m, i) => {
    const t = team6[i];
    assert.strictEqual(m.species, t.species);
    assert.strictEqual(m.ability, t.ability, t.species);
    assert.strictEqual(m.item, t.item, t.species);
    assert.deepStrictEqual(m.moves, t.moves, t.species);
    assert.strictEqual(m.nature, t.nature, `${t.species}の性格`);
    for (const k of Object.keys(t.sp)) assert.strictEqual(m.sp[k], t.sp[k], `${t.species} ${k}`);
    assert.strictEqual(m.gender, t.gender);
  });
});

test('文字認識の1文字違いや、ラベルと数字がつながって読まれても取り込める', () => {
  const ab = abilityScreen(team6).map(o => (o.text === 'ステルスロック' ? Object.assign({}, o, {text: 'ステルスロツク'}) : o));
  const st = statusScreen(team6).map(o => o);
  // カバルドンのHPを「HP 215」とひとかたまりで読んだ場合
  const i = st.findIndex(o => o.text === 'HP');
  st[i] = Object.assign({}, st[i], {text: 'HP 215', w: 0.08});
  st.splice(i + 1, 1);
  const {members} = importParty([ab, st]);
  assert.deepStrictEqual(members[0].moves, team6[0].moves);
  assert.strictEqual(members[0].sp.hp, 32);
  assert.strictEqual(members[0].nature, 'わんぱく');
});

test('片方の画面しかないときは、分かる分だけ取り込んで知らせる', () => {
  const {members, warnings} = importParty([abilityScreen(team6)]);
  assert.strictEqual(members.length, 6);
  assert.deepStrictEqual(members[1].moves, team6[1].moves);
  assert.ok(warnings.some(w => /ステータス/.test(w)));
});
