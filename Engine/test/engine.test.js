// 計算エンジンのテスト。実行: node --test Engine/test
const test = require('node:test');
const assert = require('node:assert');
const e = require('../src/engine.js');
const party = require('../../Data/party.json').members;

const mine = name => {
  const m = party.find(p => p.species === name);
  return {name: m.species, nature: m.nature, sp: m.sp, ability: m.ability, item: m.item, gender: m.gender};
};
const dmg = (attacker, defender, move, extra) => e.damage(Object.assign({attacker, defender, move}, extra));
const mid = r => (r.min + r.max) / 2;

test('実数値:チーム6の36項目がゲームの表示と一致する', () => {
  for (const m of party) {
    const s = e.stats({name: m.species, nature: m.nature, sp: m.sp});
    for (const k of Object.keys(m.stats)) assert.strictEqual(s[k], m.stats[k], `${m.species} ${k}`);
  }
});

test('名前:全角数字や空白のゆれを吸収する', () => {
  const a = dmg(mine('カイリュー'), {name: 'ギャラドス'}, '10まんボルト');
  const b = dmg(mine('カイリュー'), {name: 'ギャラドス'}, '１０まんボルト ');
  assert.strictEqual(a.max, b.max);
  assert.ok(a.max > 0);
});

test('特性:もふもふは接触技を半減する', () => {
  const off = dmg(mine('イダイトウ'), {name: 'ガブリアス', ability: 'さめはだ'}, 'ウェーブタックル');
  const on = dmg(mine('イダイトウ'), {name: 'ガブリアス', ability: 'もふもふ'}, 'ウェーブタックル');
  assert.ok(Math.abs(mid(on) / mid(off) - 0.5) < 0.03, `${mid(on)} / ${mid(off)}`);
});

test('特性:マルチスケイルはHP満タンのときだけ半減する', () => {
  const full = dmg(mine('ミミッキュ'), {name: 'カイリュー', ability: 'マルチスケイル'}, 'じゃれつく');
  const hurt = dmg(mine('ミミッキュ'), {name: 'カイリュー', ability: 'マルチスケイル', hpPercent: 90}, 'じゃれつく');
  assert.ok(Math.abs(mid(full) / mid(hurt) - 0.5) < 0.03);
});

test('特性:いかく(攻撃-1)とやけどで物理技が弱くなる', () => {
  const base = dmg(mine('イダイトウ'), {name: 'ボーマンダ'}, 'ウェーブタックル');
  const minus = dmg(Object.assign(mine('イダイトウ'), {boosts: {こうげき: -1}}), {name: 'ボーマンダ'}, 'ウェーブタックル');
  const burn = dmg(Object.assign(mine('イダイトウ'), {status: 'やけど'}), {name: 'ボーマンダ'}, 'ウェーブタックル');
  assert.ok(Math.abs(mid(minus) / mid(base) - 2 / 3) < 0.03);
  assert.ok(Math.abs(mid(burn) / mid(base) - 0.5) < 0.03);
});

test('特性:フェアリースキンでノーマル技がフェアリーになる', () => {
  const r = dmg({name: 'ニンフィア', ability: 'フェアリースキン', nature: 'ひかえめ', sp: {spa: 32}}, {name: 'カイリュー', ability: 'せいしんりょく'}, 'ハイパーボイス');
  const plain = dmg({name: 'ニンフィア', ability: 'きょうせい', nature: 'ひかえめ', sp: {spa: 32}}, {name: 'カイリュー', ability: 'せいしんりょく'}, 'ハイパーボイス');
  assert.ok(mid(r) / mid(plain) > 2.5, 'フェアリー化+効果抜群で大きく上がる');
});

test('天候:ゆきの間はこおりタイプの防御が1.5倍', () => {
  const clear = dmg(mine('イダイトウ'), {name: 'ユキノオー'}, 'アクアジェット');
  const snow = dmg(mine('イダイトウ'), {name: 'ユキノオー'}, 'アクアジェット', {field: {weather: 'ゆき'}});
  assert.ok(snow.max < clear.max);
  assert.ok(Math.abs(mid(snow) / mid(clear) - 2 / 3) < 0.05);
});

test('天候:すなあらしの間はいわタイプの特防が1.5倍', () => {
  const clear = dmg(mine('ルカリオ'), {name: 'バンギラス'}, 'しんくうは');
  const sand = dmg(mine('ルカリオ'), {name: 'バンギラス'}, 'しんくうは', {field: {weather: 'すなあらし'}});
  assert.ok(Math.abs(mid(sand) / mid(clear) - 2 / 3) < 0.05);
});

test('天候:あめで水技1.5倍、はれで水技半減', () => {
  const base = dmg(mine('イダイトウ'), {name: 'ガブリアス'}, 'ウェーブタックル');
  const rain = dmg(mine('イダイトウ'), {name: 'ガブリアス'}, 'ウェーブタックル', {field: {weather: 'あめ'}});
  const sun = dmg(mine('イダイトウ'), {name: 'ガブリアス'}, 'ウェーブタックル', {field: {weather: 'はれ'}});
  assert.ok(Math.abs(mid(rain) / mid(base) - 1.5) < 0.05);
  assert.ok(Math.abs(mid(sun) / mid(base) - 0.5) < 0.05);
});

test('急所:攻撃側のランク下降を無視する', () => {
  const crit = dmg(Object.assign(mine('イダイトウ'), {boosts: {こうげき: -1}}), {name: 'ガブリアス'}, 'ウェーブタックル', {moveOptions: {isCrit: true}});
  const critNoDrop = dmg(mine('イダイトウ'), {name: 'ガブリアス'}, 'ウェーブタックル', {moveOptions: {isCrit: true}});
  assert.strictEqual(crit.max, critNoDrop.max);
});

test('壁:リフレクターで物理技が軽減される', () => {
  const base = dmg(mine('イダイトウ'), {name: 'ガブリアス'}, 'ウェーブタックル');
  const wall = dmg(mine('イダイトウ'), {name: 'ガブリアス'}, 'ウェーブタックル', {field: {defenderSide: {リフレクター: true}}});
  assert.ok(wall.max < base.max);
});

test('フォルム:ロトムはフォルム指定でタイプが変わる', () => {
  assert.ok(e.formsOf('ロトム').includes('Rotom-Wash'));
  const wash = dmg(mine('カイリュー'), {name: 'ロトム', form: 'Rotom-Wash'}, 'りゅうのはどう');
  const heat = dmg(mine('カイリュー'), {name: 'ロトム', form: 'Rotom-Heat'}, 'りゅうのはどう');
  assert.ok(wash.max > 0 && heat.max > 0);
});

test('実戦の記録:いかくを受けたイダイトウのウェーブタックルでボーマンダが19%減った', () => {
  // スクショ:ボーマンダ 54% → 35%。この時点ではやけど前とみなす
  const atk = Object.assign(mine('イダイトウ'), {boosts: {こうげき: -1}});
  const frail = dmg(atk, {name: 'ボーマンダ', ability: 'いかく'}, 'ウェーブタックル');
  const bulky = dmg(atk, {name: 'ボーマンダ', ability: 'いかく', nature: 'ずぶとい', sp: {hp: 32, def: 32}}, 'ウェーブタックル');
  assert.ok(frail.minPercent > 19, '無振りなら19%より多く削れるはず');
  assert.ok(bulky.minPercent <= 19 && 19 <= bulky.maxPercent + 1, '物理耐久に振ったボーマンダなら19%に収まる');
});

test('技:おはかまいりは味方がひん死になるごとに威力が50ずつ上がる(最大300)', () => {
  const lr = n => dmg(mine('イダイトウ'), {name: 'ギルガルド'}, 'おはかまいり', {moveOptions: {fainted: n}});
  const r0 = lr(0), r1 = lr(1), r2 = lr(2), r5 = lr(5), r9 = lr(9);
  assert.ok(Math.abs(mid(r1) / mid(r0) / 2 - 1) < 0.05, '1体で威力100(2倍)');
  assert.ok(Math.abs(mid(r2) / mid(r0) / 3 - 1) < 0.05, '2体で威力150(3倍)');
  assert.ok(Math.abs(mid(r5) / mid(r0) / 6 - 1) < 0.05, '5体で威力300(6倍)');
  assert.strictEqual(r9.max, r5.max, '300で打ち止め');
});
