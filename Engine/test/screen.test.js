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

test('相手と自分の名前・HPを読み、HPは2回続けて同じときだけ渡す', () => {
  const r = new ScreenReader();
  const f1 = r.read([...ui, ...boxes('リザードン', 100, 'スターミー', '137/137')]);
  assert.deepStrictEqual(f1.inputs.map(i => i.kind), ['switch', 'switch']);
  assert.deepStrictEqual(f1.inputs[0], {kind: 'switch', side: 'opp', name: 'リザードン'});
  const f2 = r.read([...ui, ...boxes('リザードン', 100, 'スターミー', '137/137')]);
  assert.deepStrictEqual(f2.inputs, [
    {kind: 'hp', side: 'opp', name: 'リザードン', percent: 100},
    {kind: 'hp', side: 'me', name: 'スターミー', cur: 137, max: 137},
  ]);
  const f3 = r.read([...ui, ...boxes('リザードン', 100, 'スターミー', '137/137')]);
  assert.strictEqual(f3.inputs.length, 0, '変わらなければ何も渡さない');
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
  const f = r.read([...ui, O('ガブリアヌ', 0.834, 0.053)]);
  assert.deepStrictEqual(f.inputs[0], {kind: 'switch', side: 'opp', name: 'ガブリアス'});
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
