# ダメージ計算エンジン

日本語の名前で受け取り、ダメージ・割合・確定数を返す計算エンジンです。

- 計算の中身は [Smogon のダメージ計算](https://github.com/smogon/damage-calc)(MIT ライセンス)の**ポケモンチャンピオンズ用ルール**をそのまま使っています(`vendor/smogon-calc.js`、元のコミットは `vendor/smogon-calc.VERSION`)
- 特性・持ち物・天候・フィールド・壁・急所・ランク・状態異常・メガシンカ・タイプ変化の補正は、すべて元の計算に含まれています
- iPhone では JavaScriptCore で、Windows では Node.js でそのまま動きます

## 使い方

```js
const engine = require('./src/engine.js');
const r = engine.damage({
  attacker: {name: 'イダイトウ', nature: 'ようき', sp: {hp: 2, atk: 32, spe: 32},
             ability: 'てきおうりょく', item: 'こだわりスカーフ', boosts: {こうげき: -1}},
  defender: {name: 'ボーマンダ', ability: 'いかく'},
  move: 'ウェーブタックル',
  field: {weather: 'あめ', defenderSide: {リフレクター: true}},
});
// r.minPercent, r.maxPercent, r.ko(例:「乱数2発(43.0%)」), r.rolls(16通りの乱数)
```

おはかまいりは `moveOptions: {fainted: 2}`(味方のひん死の数)、ふんどのこぶしは `moveOptions: {timesHit: 3}`(攻撃を受けた回数)で威力が変わります。

フォルム違いは `form` で指定します(例:`{name: 'ロトム', form: 'Rotom-Wash'}`)。候補は `engine.formsOf('ロトム')` で出せます。

## 日本語名の対応表

`data/names.json` は PokeAPI の名前データと計算データから `tools/build_names.js` で作っています。

- 本作で追加されたメガストーン(カイリュナイトなど)は公式の日本語名データがないため、「ポケモン名+ナイト」で仮の名前を付けています(`generated` に一覧)
- 新しい特性 3 つ(Aura Guard、Eelevate、Fire Mane)は日本語名が未登録です。ゲームで名前を確認したら追加します

## テスト

```
node --test Engine/test/engine.test.js
```

チーム6の実数値36項目、おはかまいりの威力変化、はたきおとすの1.5倍、もふもふ・マルチスケイル・いかく・やけど・フェアリースキン・ゆき・すなあらし・あめ・はれ・急所・リフレクター・フォルム違い、実戦のダメージ記録を確認しています。
