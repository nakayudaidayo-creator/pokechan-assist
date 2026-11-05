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

test('控え:交代した相手は小窓の下にまとめて出し、ページを切り替えると詳しく見られる', () => {
  const b = start('イダイトウ', 'ガブリアス').feedAll([
    T('相手の ガブリアスの じしん!'),
    {kind: 'hp', side: 'me', name: 'イダイトウ', cur: 70, max: 197},
    T('相手トレーナーは ボーマンダを 繰り出した!'),
  ]);
  const front = buildView(b, {page: 0});
  assert.strictEqual(front.title, 'イダイトウ ⇄ ボーマンダ');
  assert.strictEqual(front.pageCount, 2);
  assert.strictEqual(front.bench.length, 1);
  assert.strictEqual(front.bench[0].species, 'ガブリアス');
  assert.deepStrictEqual(front.bench[0].moves, ['じしん']);
  assert.ok(front.bench[0].setName, '控えの相手にも型の候補が出る');

  const benchPage = buildView(b, {page: 1});
  assert.strictEqual(benchPage.title, 'イダイトウ ⇄ ガブリアス(控え)');
  assert.strictEqual(benchPage.pageLabel, '相手の控え 1/1');
  assert.ok(benchPage.theirs[0].used && benchPage.theirs[0].move === 'じしん');
  assert.strictEqual(benchPage.bench[0].species, 'ボーマンダ', '控えのページでは場の相手が下に出る');
  assert.strictEqual(buildView(b, {page: 2}).title, front.title, '最後のページの次は対面に戻る');
});

test('自分の交代先:選出した3匹のうち場にいないポケモンで、今の相手との対面を出す', () => {
  const b = start('イダイトウ', 'ガブリアス');
  b.mySelection = ['カバルドン', 'イダイトウ', 'ミミッキュ'];
  const v = buildView(b, {myPage: 1});
  assert.strictEqual(v.title, 'カバルドン(交代先) ⇄ ガブリアス');
  assert.strictEqual(v.pageLabel, '交代先 1/2');
  assert.strictEqual(v.myPageCount, 3);
  assert.ok(v.theirs.length >= 2, '相手の技で交代先がどれだけ受けるかが出る');
  assert.strictEqual(buildView(b, {myPage: 2}).title, 'ミミッキュ(交代先) ⇄ ガブリアス');
  assert.strictEqual(buildView(b, {myPage: 3}).title, 'イダイトウ ⇄ ガブリアス', '最後の次は場の対面に戻る');
});

test('相手の控えが分からない間は、選出画面の6匹のうちまだ出ていない全員を順番に見られる', () => {
  const b = new Battle({party: team6, opponentTeam: ['バンギラス', 'ロトム', 'サーフゴー', 'ミミッキュ', 'エースバーン', 'ガブリアス']})
    .feedAll([T('ゆけっ! イダイトウ!'), T('相手トレーナーは ガブリアスを 繰り出した!')]);
  const front = buildView(b, {page: 0});
  assert.strictEqual(front.pageCount, 6, '場の1匹 + まだ出ていない5匹');
  assert.deepStrictEqual(front.remaining, ['バンギラス', 'ロトム', 'サーフゴー', 'ミミッキュ', 'エースバーン']);
  const p1 = buildView(b, {page: 1});
  assert.strictEqual(p1.title, 'イダイトウ ⇄ バンギラス(まだ出ていない)');
  assert.ok(p1.mine.length >= 3 && p1.theirs.length >= 2, 'よくある型で計算できる');

  // 3匹出そろったら、残りの候補は出さない
  b.feedAll([T('相手トレーナーは サーフゴーを 繰り出した!'), T('相手トレーナーは ミミッキュを 繰り出した!')]);
  const after = buildView(b, {page: 0});
  assert.strictEqual(after.pageCount, 3);
  assert.deepStrictEqual(after.remaining, []);
});
