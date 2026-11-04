// 型の推定と小窓の表示内容のテスト。実行: node --test Engine/test/infer.test.js
const test = require('node:test');
const assert = require('node:assert');
const {Battle} = require('../src/battle.js');
const {buildView} = require('../src/pip.js');
const team6 = require('../../Data/party.json').members;

const T = text => ({kind: 'telop', text});
const start = (mine, opp) => new Battle({party: team6, opponentTeam: [opp]}).feedAll([
  T(`ゆけっ! ${mine}!`), T(`相手トレーナーは ${opp}を 繰り出した!`),
]);

test('何も分かっていないときは、シングルでよくある型を想定する', () => {
  const v = buildView(start('イダイトウ', 'ガブリアス'));
  assert.strictEqual(v.title, 'イダイトウ ⇄ ガブリアス');
  assert.strictEqual(v.candidates[0], 'ようきAS・タスキ');
  assert.strictEqual(v.known.item.sure, false);
  assert.strictEqual(v.speed.who, 'me', 'スカーフのイダイトウが先手');
  assert.strictEqual(v.mine.length, 4);
  assert.ok(v.theirs.length >= 2);
  assert.match(v.note, /タスキ/);
});

test('相手に先手を取られたら、こだわりスカーフの型が最有力になる', () => {
  const b = start('イダイトウ', 'ガブリアス').feedAll([
    T('相手の ガブリアスの じしん!'),
    {kind: 'hp', side: 'me', name: 'イダイトウ', cur: 70, max: 197},
    T('イダイトウの ウェーブタックル!'),
    {kind: 'hp', side: 'opp', name: 'ガブリアス', percent: 25},
  ]);
  const v = buildView(b);
  assert.strictEqual(v.candidates[0], 'ようきAS・スカーフ');
  assert.strictEqual(v.speed.who, 'opp');
  assert.ok(v.theirs[0].used && v.theirs[0].move === 'じしん', '使われた技が先頭に✓付きで出る');
});

test('判明した特性・持ち物は「確定」として出る', () => {
  const b = start('カバルドン', 'ガブリアス').feedAll([
    {kind: 'banner', side: 'opp', text: 'ガブリアスの さめはだ'},
    T('相手の ガブリアスは オボンのみで 体力を 回復した!'),
  ]);
  const v = buildView(b);
  assert.deepStrictEqual(v.known.ability, {value: 'さめはだ', sure: true});
  assert.deepStrictEqual(v.known.item, {value: 'オボンのみ(なくなった)', sure: true});
  assert.strictEqual(v.candidates[0], 'ようきH・オボンのみ', '持ち物が合う型が上に来る');
});

test('削れ方が少なすぎるときは、耐久に振った型が上に来る(ボーマンダ19%の実例)', () => {
  const b = new Battle({party: team6, opponentTeam: ['ボーマンダ']}).feedAll([
    T('ゆけっ! イダイトウ!'), T('相手トレーナーは ボーマンダを 繰り出した!'),
    T('相手の ボーマンダに とがった岩が 食いこんだ!'),
    {kind: 'hp', side: 'opp', name: 'ボーマンダ', percent: 54},
    {kind: 'banner', side: 'opp', text: 'ボーマンダの いかく'},
    T('イダイトウの 攻撃が 下がった!'),
    T('イダイトウの ウェーブタックル!'),
    {kind: 'hp', side: 'opp', name: 'ボーマンダ', percent: 35},
  ]);
  const v = buildView(b);
  assert.match(v.candidates[0], /HB/, `最有力: ${v.candidates[0]}`);
  assert.strictEqual(v.oppHpPercent, 35);
});

test('型データがないポケモンでも、汎用の型で計算できる', () => {
  const v = buildView(start('ルカリオ', 'ニンフィア'));
  assert.ok(v.candidates.length >= 1);
  assert.ok(v.mine.length >= 3);
});
