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

// 実機の文字認識は、同じ行の文字を1かたまりにまとめて返すことがある
function merge(obs, sep = ' ') {
  const rows = [];
  for (const o of [...obs].sort((a, b) => a.y - b.y)) {
    const r = rows.find(r => Math.abs(r.y - o.y) < 0.005);
    if (r) r.items.push(o); else rows.push({y: o.y, items: [o]});
  }
  return rows.map(r => {
    const items = r.items.sort((a, b) => a.x - b.x);
    const x = items[0].x, x1 = Math.max(...items.map(o => o.x + o.w));
    return {text: items.map(o => o.text).join(sep), x, y: r.y, w: x1 - x, h: items[0].h};
  });
}

test('行ごとにまとめて読まれても、能力・ステータスの画面を見分けて取り込む(順番も問わない)', () => {
  // ステータス:左右の2匹の行が1かたまり。能力:技2つずつ・特性と持ち物が1かたまり
  const st = merge(statusScreen(team6));
  const ab = abilityScreen(team6).map(o => o);
  const {members, warnings} = importParty([ab, st]);
  assert.deepStrictEqual(warnings, []);
  members.forEach((m, i) => {
    const t = team6[i];
    assert.strictEqual(m.nature, t.nature, `${t.species}の性格`);
    for (const k of Object.keys(t.sp)) assert.strictEqual(m.sp[k], t.sp[k], `${t.species} ${k}`);
    assert.deepStrictEqual(m.moves, t.moves, t.species);
  });
});

test('技や特性が空白なしでつながって読まれても拾う', () => {
  const ab = [];
  const base = abilityScreen(team6);
  // 枠ごとに、技を2つずつ空白なしでつなげる
  for (const o of base) ab.push(o);
  const moves0 = team6[0].moves;
  const idx = moves0.map(mv => ab.findIndex(o => o.text === mv));
  const joined = Object.assign({}, ab[idx[0]], {text: moves0[0] + moves0[1], w: 0.14});
  const joined2 = Object.assign({}, ab[idx[2]], {text: moves0[2] + ' ' + moves0[3], w: 0.14});
  const out = ab.filter((_, i) => !idx.includes(i)).concat([joined, joined2]);
  const abil = out.findIndex(o => o.text === team6[0].ability);
  out[abil] = Object.assign({}, out[abil], {text: team6[0].ability + team6[0].item});
  const {members} = importParty([out, statusScreen(team6)]);
  assert.deepStrictEqual(members[0].moves, moves0);
  assert.strictEqual(members[0].ability, team6[0].ability);
  assert.strictEqual(members[0].item, team6[0].item);
});

test('ラベルの濁点や小さい字を読み違えても実数値を拾う', () => {
  const st = statusScreen(team6).map(o => {
    if (o.text === 'ぼうぎょ') return Object.assign({}, o, {text: 'ほうぎよ'});
    if (o.text === 'すばやさ') return Object.assign({}, o, {text: 'すはやさ'});
    return o;
  });
  const {members, warnings} = importParty([abilityScreen(team6), st]);
  assert.deepStrictEqual(warnings, []);
  assert.strictEqual(members[0].sp.def, 17);
  assert.strictEqual(members[5].nature, team6[5].nature);
});

test('ステータスの画面が読めないときは、読み取った文字を確認画面に出す', () => {
  const junk = [O('チーム6', 0.37, 0.08), O('なにか', 0.3, 0.3)];
  const {warnings} = importParty([abilityScreen(team6), junk]);
  assert.ok(warnings.some(w => /ステータス/.test(w)));
  assert.ok(warnings.some(w => /^読み取った文字\(2枚目\)/.test(w) && /なにか/.test(w)));
});

test('SPの数字だけ読めなかったときは、実数値から計算で補う', () => {
  // カバルドンのHPの行で、SP「32」が読めなかった場合(実機で起きた)
  const st = statusScreen(team6);
  const i = st.findIndex(o => o.text === '32' && o.y < 0.31 && o.x < 0.32);
  st.splice(i, 1);
  const {members, warnings} = importParty([abilityScreen(team6), st]);
  assert.strictEqual(members[0].sp.hp, 32);
  assert.deepStrictEqual(warnings, []);
});

test('実数値を読み違えたときは、読み取りと計算の両方の値を出して知らせる', () => {
  const st = statusScreen(team6).map(o => (o.text === '117' ? Object.assign({}, o, {text: '177'}) : o));
  const {members, warnings} = importParty([abilityScreen(team6), st]);
  assert.strictEqual(members[1].nature, 'ひかえめ');
  assert.ok(warnings.some(w => /ルカリオ:こうげきの実数値が、読み取り177・計算117/.test(w)), warnings.join('\n'));
});

test('濁点・小さい字・ひらがなとカタカナの読み違いや、長い技名の2文字違いも拾う', () => {
  const ab = abilityScreen(team6).map(o => {
    if (o.text === 'かえんほうしゃ') return Object.assign({}, o, {text: 'かえんぼうしや'});
    if (o.text === 'アクアジェット') return Object.assign({}, o, {text: 'アクアシエット'});
    if (o.text === 'ウェーブタックル') return Object.assign({}, o, {text: 'ウエーブタツクル'});
    return o;
  });
  const {members} = importParty([ab, statusScreen(team6)]);
  assert.deepStrictEqual(members[2].moves, team6[2].moves);
  assert.deepStrictEqual(members[5].moves, team6[5].moves);
});

test('技が読めなかったときは、読めなかった文字を確認画面に出す', () => {
  const ab = abilityScreen(team6).map(o => (o.text === 'しんそく' ? Object.assign({}, o, {text: 'ぜんぜんちがう'}) : o));
  const {warnings} = importParty([ab, statusScreen(team6)]);
  assert.ok(warnings.some(w => /カイリュー:技を3つしか読めませんでした\(読めなかった文字:ぜんぜんちがう\)/.test(w)), warnings.join('\n'));
});

test('実数値の最後の数字が欠けて読まれただけなら、知らせない', () => {
  const st = statusScreen(team6).map(o => (o.text === '117' ? Object.assign({}, o, {text: '11'}) : o));
  const {warnings} = importParty([abilityScreen(team6), st]);
  assert.deepStrictEqual(warnings, []);
});
