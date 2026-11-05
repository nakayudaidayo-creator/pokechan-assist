// 画面の読み取りのテスト。
// 文字の位置は、もらったスクショ(横向き)で実際に文字が出ていた場所を、画面に対する割合で書いたもの。
// 実行: node --test Engine/test/screen.test.js
const test = require('node:test');
const assert = require('node:assert');
const {ScreenReader} = require('../src/screen.js');
const {Battle} = require('../src/battle.js');
const team6 = require('../../Data/party.json').members;

const O = (text, x, y, w = 0.08, h = 0.035) => ({text, x, y, w, h, conf: 0.9});

// 対戦画面に常に出ているもの
const ui = [
  O('ログを見る', 0.056, 0.37, 0.07), O('様子を見る', 0.88, 0.36, 0.07),
  O('たたかう', 0.90, 0.72), O('ポケモン', 0.85, 0.93), O('07:00', 0.79, 0.165, 0.05),
];
const boxes = (opp, pct, me, hp) => [
  O(opp, 0.834, 0.053), O('♂', 0.96, 0.055, 0.015), O(`${pct}%`, 0.90, 0.12, 0.055, 0.04),
  O(me, 0.08, 0.88), O(hp, 0.13, 0.945, 0.075, 0.045),
];

test('相手と自分の名前・HPを読む。交代もHPも2回続けて同じときだけ渡す', () => {
  const r = new ScreenReader();
  const frame = () => {
    const res = r.read([...ui, ...boxes('リザードン', 100, 'スターミー', '137/137')]);
    res.inputs = res.inputs.filter(i => i.kind !== 'note');  // 動作確認用のメモは除く
    return res;
  };
  assert.deepStrictEqual(frame().inputs, [], '1回目は待つ');
  const f2 = frame();
  assert.deepStrictEqual(f2.inputs.map(i => [i.kind, i.side, i.name]), [['switch', 'opp', 'リザードン'], ['switch', 'me', 'スターミー']]);
  const f3 = frame();
  assert.deepStrictEqual(f3.inputs, [
    {kind: 'hp', side: 'opp', name: 'リザードン', percent: 100},
    {kind: 'hp', side: 'me', name: 'スターミー', cur: 137, max: 137},
  ]);
  assert.strictEqual(frame().inputs.length, 0, '変わらなければ何も渡さない');
});

test('テロップは文が読めるようになってから1回だけ渡す。ふりがなと画面の決まった文字は捨てる', () => {
  const r = new ScreenReader();
  r.read([...ui, ...boxes('ゲッコウガ', 87, 'バンギラス', '149/207')]);
  const partial = r.read([...ui, ...boxes('ゲッコウガ', 87, 'バンギラス', '149/207'),
    O('あいて', 0.165, 0.735, 0.03, 0.012), O('相手の マフォクシーの', 0.152, 0.75, 0.22, 0.035)]);
  assert.ok(!partial.inputs.some(i => i.kind === 'telop'), '途中までの文は渡さない');
  const full = r.read([...ui, ...boxes('ゲッコウガ', 87, 'バンギラス', '149/207'),
    O('あいて', 0.165, 0.735, 0.03, 0.012), O('相手の マフォクシーの', 0.152, 0.75, 0.22, 0.035),
    O('マジカルシャイン!', 0.152, 0.815, 0.17, 0.035)]);
  const t = full.inputs.filter(i => i.kind === 'telop');
  assert.strictEqual(t.length, 1);
  assert.strictEqual(t[0].text, '相手の マフォクシーの マジカルシャイン!');
  const again = r.read([...ui, ...boxes('ゲッコウガ', 87, 'バンギラス', '149/207'),
    O('相手の マフォクシーの', 0.152, 0.75, 0.22, 0.035), O('マジカルシャイン!', 0.152, 0.815, 0.17, 0.035)]);
  assert.ok(!again.inputs.some(i => i.kind === 'telop'), '同じテロップが出ている間は繰り返さない');
});

test('特性・持ち物の帯を、左は自分・右は相手として読む', () => {
  const r = new ScreenReader();
  const f = r.read([...ui,
    O('カバルドンの', 0.08, 0.38, 0.1), O('ゴツゴツメット', 0.08, 0.42, 0.11),
    O('ボーマンダの', 0.82, 0.385, 0.09), O('いかく', 0.88, 0.425, 0.05)]);
  const banners = f.inputs.filter(i => i.kind === 'banner');
  assert.deepStrictEqual(banners, [
    {kind: 'banner', side: 'me', text: 'カバルドンの ゴツゴツメット'},
    {kind: 'banner', side: 'opp', text: 'ボーマンダの いかく'},
  ]);
});

test('文字認識の1文字違いは、ポケモン名に直す', () => {
  const r = new ScreenReader();
  const frame = () => r.read([...ui, O('ガブリアヌ', 0.834, 0.053), O('100%', 0.90, 0.12, 0.055, 0.04)]);
  frame();
  const f = frame();
  assert.deepStrictEqual([f.inputs[0].side, f.inputs[0].name], ['opp', 'ガブリアス']);
});

test('選出画面とログ画面を見分ける', () => {
  const r = new ScreenReader();
  assert.strictEqual(r.read([O('戦うポケモンを', 0.36, 0.22, 0.12), O('3匹 選出してください', 0.36, 0.26, 0.18)]).newBattle, true);
  assert.strictEqual(r.read([O('戦うポケモンを', 0.36, 0.22, 0.12), O('3匹 選出してください', 0.36, 0.26, 0.18)]).newBattle, false, '同じ選出画面が続いても1回だけ');
  assert.strictEqual(r.read([O('ターン 2', 0.48, 0.05, 0.08)]).mode, 'log');
});

test('読み取りからバトル状態まで:技のダメージが記録される', () => {
  const r = new ScreenReader();
  const b = new Battle({party: team6, opponentTeam: []});
  const feed = obs => r.read(obs).inputs.forEach(i => b.feed(i));
  const base = (pct, hp) => [...ui, ...boxes('ガブリアス', pct, 'イダイトウ', hp)];
  feed(base(100, '197/197'));
  feed(base(100, '197/197'));
  feed([...base(100, '197/197'), O('イダイトウの', 0.152, 0.75, 0.12), O('ウェーブタックル!', 0.152, 0.815, 0.16)]);
  feed(base(62, '197/197'));            // HPバーが減っている途中
  feed(base(30, '197/197'));
  feed(base(30, '197/197'));            // 2回続いたので確定
  assert.strictEqual(b.damageLog.length, 1);
  assert.strictEqual(b.damageLog[0].move, 'ウェーブタックル');
  assert.strictEqual(b.damageLog[0].damage.percent, 70);
  assert.strictEqual(b.sides.opp.active, 'ガブリアス');
});

test('選出画面で、選んだ3匹を選んだ順に読む', () => {
  const r = new ScreenReader();
  // 2枚目のスクショ:ルカリオに2、アーマーガアに1(まだ2匹だけ選んだ状態)
  const res = r.read([
    O('戦うポケモンを', 0.36, 0.22, 0.12), O('3匹 選出してください', 0.36, 0.26, 0.18),
    O('2', 0.04, 0.185, 0.02, 0.05), O('ルカリオ', 0.07, 0.17), O('ルカリオナイトZ', 0.09, 0.21, 0.1),
    O('ロトム', 0.07, 0.29), O('スターミー', 0.07, 0.41),
    O('1', 0.045, 0.655, 0.02, 0.05), O('アーマーガア', 0.07, 0.645), O('ゴツゴツメット', 0.09, 0.69, 0.1),
  ]);
  assert.deepStrictEqual(res.selection, ['アーマーガア', 'ルカリオ']);
});

// ---- 実機(2026-11-05)で起きたこと ----------------------------------------
// 小窓が画面収録に映り込み、小窓の中の名前や控えの行を読んでいた。
// また、演出で名前欄の左右が入れ替わって見える瞬間に、自分と相手を取り違えた。

// 左上の小窓(案A)に出る文字
const pipObs = (title) => [
  O(title, 0.09, 0.05, 0.12, 0.025), O('相手HP 100%', 0.25, 0.055, 0.04, 0.015),
  O('特性 マルチスケイル? 持ち物 カイリュナイト?', 0.09, 0.085, 0.12, 0.013),
  O('型の候補:ひかえめCS・メガ → ようきAS・ラムのみ', 0.09, 0.105, 0.17, 0.013),
  O('すばやさ:相手が先手 (87 / 相手132)', 0.09, 0.125, 0.1, 0.013),
  O('こちらの攻撃', 0.09, 0.16, 0.04, 0.014), O('相手のよく使う技', 0.09, 0.19, 0.05, 0.014),
  O('10まんボルト', 0.09, 0.21, 0.04, 0.015), O('62-73%', 0.22, 0.21, 0.025, 0.014), O('確2', 0.28, 0.21, 0.012, 0.014),
  O('控え カバルドン HP100% / わんぱくHB・オボンのみ?', 0.09, 0.31, 0.15, 0.013),
  O('控え アーマーガア HP100% / わんぱくHB・残飯?', 0.09, 0.335, 0.15, 0.013),
];

test('小窓に映った文字は読まない', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  const frame = () => r.read([...ui, ...pipObs('アーマーガア ⇄ カイリュー'), ...boxes('アーマーガア', 100, 'カイリュー', '168/168')]);
  frame();
  const f = frame();
  assert.strictEqual(f.debug.pip, true);
  assert.deepStrictEqual(f.inputs.filter(i => i.kind === 'switch').map(i => [i.side, i.name]), [['opp', 'アーマーガア'], ['me', 'カイリュー']]);
  assert.ok(!f.inputs.some(i => i.kind === 'banner' || i.kind === 'telop'), '小窓の行を帯やテロップとして読まない');
});

test('名前欄が入れ替わって見えても、自分と相手を取り違えない', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  const normal = () => r.read([...ui, ...boxes('アシレーヌ', 100, 'カイリュー', '168/168')]);
  normal(); normal();
  assert.deepStrictEqual(r.active, {me: 'カイリュー', opp: 'アシレーヌ'});
  // 右上に自分のカイリュー(残り/最大のHP)、左下に相手のアシレーヌ(%)が出た瞬間
  const swapped = () => r.read([...ui, O('カイリュー', 0.834, 0.053), O('168/168', 0.90, 0.12, 0.06, 0.04),
    O('アシレーヌ', 0.08, 0.88), O('100%', 0.13, 0.945, 0.05, 0.045)]);
  for (let k = 0; k < 3; k++) assert.deepStrictEqual(swapped().inputs.filter(i => i.kind === 'switch'), []);
  assert.deepStrictEqual(r.active, {me: 'カイリュー', opp: 'アシレーヌ'});
});

test('1回だけ別の名前が読めても交代にしない', () => {
  const r = new ScreenReader();
  const f = name => r.read([...ui, ...boxes(name, 100, 'カイリュー', '168/168')]);
  f('アシレーヌ'); f('アシレーヌ');
  f('サーフゴー');
  f('アシレーヌ');
  assert.strictEqual(r.active.opp, 'アシレーヌ');
});

test('選出画面で名前が小窓に隠れていても、番号の位置とパーティの並びで選んだ3匹が分かる', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  const obs = [O('戦うポケモンを', 0.39, 0.18, 0.12), O('3匹 選出してください', 0.39, 0.22, 0.14),
    ...pipObs('ポケチャン補助').slice(0, 1),
    // 番号は左端。カイリュー(3番目の欄)→ カバルドン(1番目)→ イダイトウ(6番目)の順に選んだ
    O('1', 0.03, 0.40 - 0.025, 0.02, 0.05), O('2', 0.03, 0.17 - 0.025, 0.02, 0.05), O('3', 0.03, 0.75 - 0.025, 0.02, 0.05),
    O('ギルガルド', 0.15, 0.61, 0.08)];
  const res = r.read(obs);
  assert.strictEqual(res.mode, 'select');
  assert.deepStrictEqual(res.selection, ['カイリュー', 'カバルドン', 'イダイトウ']);
});

test('名前欄に読めた文字を、動作確認用のメモとして変わったときだけ出す', () => {
  const r = new ScreenReader();
  const notes = () => r.read([...ui, ...boxes('ドラパルト', 100, 'カイリュー', '168/168')]).inputs.filter(i => i.kind === 'note');
  assert.deepStrictEqual(notes().map(i => i.text), ['右上「ドラパルト♂100%」 左下「カイリュー168/168」']);
  assert.deepStrictEqual(notes(), [], '同じなら出さない');
});

test('HPの数字が読めなくても、名前だけで交代は分かる', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  const f = () => r.read([...ui, O('ドラパルト', 0.834, 0.053), O('カイリュー', 0.08, 0.88)]);
  f(); f();
  assert.deepStrictEqual(r.active, {me: 'カイリュー', opp: 'ドラパルト'});
});

test('実機:自分カバルドン・相手ミミッキュ(どちらも自分のパーティにいる)で、「相手の」を読み落としても逆にならない', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  const b = new Battle({party: team6});
  const frame = extra => { for (const i of r.read([...ui, ...boxes('ミミッキュ', 100, 'カバルドン', '215/215'), ...(extra || [])]).inputs) b.feed(i); };
  frame(); frame();
  assert.deepStrictEqual([b.sides.me.active, b.sides.opp.active], ['カバルドン', 'ミミッキュ']);
  // 「相手の」が読めず「ミミッキュの じゃれつく!」になった
  frame([O('ミミッキュの', 0.152, 0.75, 0.22, 0.035), O('じゃれつく!', 0.152, 0.815, 0.17, 0.035)]);
  assert.deepStrictEqual([b.sides.me.active, b.sides.opp.active], ['カバルドン', 'ミミッキュ']);
  assert.ok(b.sides.opp.mons['ミミッキュ'].moves.includes('じゃれつく'), '相手の技として記録');
});

test('縦向きの画面(このアプリの画面など)は読まない', () => {
  const r = new ScreenReader();
  const res = r.read([O('ミミッキュ', 0.9, 0.08, 0.02, 0.3), O('カバルドン', 0.1, 0.08, 0.02, 0.4), O('相手の欄', 0.5, 0.08, 0.02, 0.5)]);
  assert.strictEqual(res.mode, 'other');
  assert.deepStrictEqual(res.inputs, []);
});

test('実機:小窓の何行かが1つにまとまり、少し読み違えられても小窓として読まない。選出した3匹以外は自分の欄にしない', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  // 選出:ギルガルド・カイリュー・ミミッキュ
  r.read([O('戦うポケモンを', 0.39, 0.18, 0.12), O('3匹 選出してください', 0.39, 0.22, 0.14),
    O('1', 0.03, 0.635 - 0.025, 0.02, 0.05), O('2', 0.03, 0.40 - 0.025, 0.02, 0.05), O('3', 0.03, 0.52 - 0.025, 0.02, 0.05)]);
  assert.deepStrictEqual(r.selection, ['ギルガルド', 'カイリュー', 'ミミッキュ']);
  // 実機で左下に読めた、小窓の文字のかたまり(「型の候補」「こちらの攻撃」が読み違えられている)
  const pipBlob = O('イダイトウマミミッキュ特任はけのかわ?持ち初いのちのたま?どの候相:しつぽりAS・珠ついしっぱりHA、ホつょつと9はPと温日分か先手(214スカーブ込み/個于148)Lちらの攻撃ウェーブタックルおはかまいり112-96-1', 0.09, 0.80, 0.25, 0.1);
  const f = () => r.read([...ui, O('ミミッキュ', 0.834, 0.053), O('61%', 0.90, 0.12, 0.055, 0.04), pipBlob]);
  f(); f();
  assert.deepStrictEqual(r.active, {me: null, opp: 'ミミッキュ'});
  // 選出していないイダイトウは、左下にちゃんと読めても自分の場にしない
  const g = () => r.read([...ui, O('ミミッキュ', 0.834, 0.053), O('61%', 0.90, 0.12, 0.055, 0.04), O('イダイトウ', 0.08, 0.88), O('120/171', 0.13, 0.945, 0.075, 0.045)]);
  g(); g();
  assert.strictEqual(r.active.me, null);
});

test('実機:自分のポケモンの欄が右上に出ても(残り/最大のHP)、自分のポケモンとして読む', () => {
  const r = new ScreenReader();
  r.party = team6.map(m => m.species);
  const normal = () => r.read([...ui, ...boxes('マスカーニャ', 100, 'ギルガルド', '140/140')]);
  normal(); normal();
  // 右上に「ミミッキュ 62/145」(自分のミミッキュ)
  const f = () => r.read([...ui, O('ミミッキュ', 0.834, 0.053), O('62/145', 0.90, 0.12, 0.06, 0.04)]);
  f(); f();
  assert.deepStrictEqual(r.active, {me: 'ミミッキュ', opp: 'マスカーニャ'});
});
