// テロップ解析とバトル状態のテスト。もらったスクショの対戦の流れを書き起こしたもの。
// 実行: node --test Engine/test/battle.test.js
const test = require('node:test');
const assert = require('node:assert');
const {Battle} = require('../src/battle.js');
const engine = require('../src/engine.js');
const team6 = require('../../Data/party.json').members;

const T = text => ({kind: 'telop', text});
const L = text => ({kind: 'log', text});

// スクショ(ルカリオ・バンギラス等のチーム)の自分側。必要な分だけ
const otherTeam = [
  {species: 'バンギラス', stats: {hp: 207}},
  {species: 'ルカリオ'}, {species: 'ロトム'}, {species: 'スターミー'}, {species: 'アーマーガア'}, {species: 'ゴリランダー'},
];

test('対戦A:すなおこし → マフォクシーのマジカルシャインがバンギラスに抜群', () => {
  const b = new Battle({party: otherTeam, opponentTeam: ['マフォクシー', 'アシレーヌ']});
  b.feedAll([
    T('ゆけっ! バンギラス!'),
    T('相手トレーナーは マフォクシーを 繰り出した!'),
    {kind: 'banner', side: 'me', text: 'バンギラスの すなおこし'},
    T('砂あらしが 吹き始めた!'),
    T('相手の マフォクシーの マジカルシャイン!'),
    {kind: 'hp', side: 'me', name: 'バンギラス', cur: 123, max: 207},
    T('効果は バツグンだ!'),
  ]);
  assert.strictEqual(b.field.weather, 'すなあらし');
  assert.strictEqual(b.damageLog.length, 1);
  const d = b.damageLog[0];
  assert.strictEqual(d.attackerSide, 'opp');
  assert.strictEqual(d.move, 'マジカルシャイン');
  assert.strictEqual(d.effectiveness, 'super');
  assert.strictEqual(d.damage.hp, 84);
  assert.strictEqual(d.defender.ability, 'すなおこし');
});

test('対戦B(ログ):メガシンカしたバンギラスのはたきおとすでアシレーヌ35%、砂と回復は数えない', () => {
  const b = new Battle({party: otherTeam, opponentTeam: ['マフォクシー', 'アシレーヌ']});
  b.feedAll([
    T('ゆけっ! バンギラス!'),
    T('砂あらしが 吹き始めた!'),
    L('ターン 2'),
    L('ヒモは マフォクシーを 引っこめた!'),
    L('ヒモは アシレーヌを 繰り出した!'),
    L('バンギラスの バンギラスナイトと バンビーの ゼンブイリングが 反応した!'),
    L('メガシンカ バンギラスは メガバンギラスに メガシンカした!'),
    L('技 バンギラスの はたきおとす!'),
    L('HP減少 アシレーヌ HP 100% → 65%'),
    L('砂あらしが 相手の アシレーヌを 襲う!'),
    L('HP減少 アシレーヌ HP 65% → 59%'),
    L('バンギラスの 体力が 回復した!'),
    L('HP回復 バンギラス HP 135 → 147'),
    L('相手の アシレーヌの 体力が 回復した!'),
    L('HP回復 アシレーヌ HP 59% → 65%'),
  ]);
  assert.strictEqual(b.turn, 2);
  assert.strictEqual(b.damageLog.length, 1, '砂と回復はダメージ記録に入らない');
  const d = b.damageLog[0];
  assert.strictEqual(d.move, 'はたきおとす');
  assert.strictEqual(d.attacker.form, 'Tyranitar-Mega');
  assert.strictEqual(d.damage.percent, 35);
  assert.strictEqual(b.sides.opp.mons['アシレーヌ'].hpPercent, 65);
  assert.strictEqual(b.sides.me.mons['バンギラス'].hpCur, 147);
});

test('対戦C:いかくとステルスロックの後、イダイトウのウェーブタックルでボーマンダ19%', () => {
  const b = new Battle({party: team6, opponentTeam: ['ボーマンダ']});
  b.feedAll([
    T('ゆけっ! イダイトウ!'),
    T('相手トレーナーは ボーマンダを 繰り出した!'),
    T('相手の ボーマンダに とがった岩が 食いこんだ!'),
    {kind: 'hp', side: 'opp', name: 'ボーマンダ', percent: 54},
    {kind: 'banner', side: 'opp', text: 'ボーマンダの いかく'},
    T('イダイトウの 攻撃が 下がった!'),
    T('イダイトウの ウェーブタックル!'),
    {kind: 'hp', side: 'opp', name: 'ボーマンダ', percent: 35},
    T('イダイトウは 反動による ダメージを 受けた!'),
    {kind: 'hp', side: 'me', name: 'イダイトウ', cur: 37, max: 197},
    T('イダイトウは やけどの ダメージを 受けた!'),
    {kind: 'hp', side: 'me', name: 'イダイトウ', cur: 25, max: 197},
  ]);
  assert.strictEqual(b.damageLog.length, 1, 'ステルスロック・反動・やけどは技のダメージに数えない');
  const d = b.damageLog[0];
  assert.strictEqual(d.attacker.boosts.atk, -1);
  assert.strictEqual(d.attacker.status, undefined, '攻撃の時点ではまだやけどしていない');
  assert.strictEqual(d.defender.ability, 'いかく');
  assert.strictEqual(d.damage.fromPercent, 54);
  assert.strictEqual(d.damage.percent, 19);
  assert.strictEqual(b.sides.me.mons['イダイトウ'].status, 'やけど');
  assert.ok(b.field.opp.stealthRock);

  // 計算エンジンにそのまま渡せる
  const frail = engine.damage(b.toCalcInput(d));
  const bulky = engine.damage(b.toCalcInput(d, {nature: 'ずぶとい', sp: {hp: 32, def: 32}}));
  assert.ok(frail.minPercent > 19);
  assert.ok(bulky.minPercent <= 19 && 19 <= bulky.maxPercent + 1);
});

test('おはかまいり:倒れた味方の数がダメージ記録に残り、計算に使われる', () => {
  const b = new Battle({party: team6, opponentTeam: ['ギルガルド']});
  b.feedAll([
    T('ゆけっ! カバルドン!'),
    T('カバルドンは 倒れた!'),
    T('ゆけっ! イダイトウ!'),
    T('相手トレーナーは ギルガルドを 繰り出した!'),
    T('イダイトウの おはかまいり!'),
    {kind: 'hp', side: 'opp', name: 'ギルガルド', percent: 0},
  ]);
  const d = b.damageLog[0];
  assert.strictEqual(d.myFaintedBefore, 1);
  const input = b.toCalcInput(d);
  assert.strictEqual(input.moveOptions.fainted, 1);
  const r = engine.damage(input);
  assert.ok(r.minPercent > 100, 'ひん死1体で威力100になり、無振りギルガルドは確定1発');
});

test('技名に「の」が入っても読める', () => {
  const b = new Battle({party: team6, opponentTeam: ['ガブリアス']});
  b.feedAll([T('ゆけっ! カイリュー!'), T('カイリューの りゅうのはどう!')]);
  assert.strictEqual(b.current.move, 'りゅうのはどう');
  assert.deepStrictEqual(b.sides.me.mons['カイリュー'].moves, ['りゅうのはどう']);
});

test('急所:「急所に 当たった!」(ふりがなが混ざっても)を直前の攻撃に記録する', () => {
  const b = new Battle({party: team6, opponentTeam: ['アーマーガア']});
  b.feedAll([
    T('ゆけっ! カバルドン!'),
    T('相手トレーナーは アーマーガアを 繰り出した!'),
    T('相手の アーマーガアの ブレイブバード!'),
    {kind: 'hp', side: 'me', name: 'カバルドン', cur: 118, max: 215},
    T('きゅうしょ あ 急所に 当たった!'),
  ]);
  assert.strictEqual(b.damageLog.length, 1);
  assert.strictEqual(b.damageLog[0].crit, true);
  assert.strictEqual(b.damageLog[0].damage.hp, 97);
  assert.strictEqual(b.toCalcInput(b.damageLog[0]).moveOptions.isCrit, true);
});
