// ポケチャン補助 ダメージ計算エンジン
//
// 計算の中身は Smogon のダメージ計算(@smogon/calc、MITライセンス)の
// ポケモンチャンピオンズ用ルール(gen 0)をそのまま使う。
// このファイルは「日本語の名前・用語で受け取り、日本語で結果を返す」ための窓口。
//
// Windows では Node.js で、iPhone では JavaScriptCore でそのまま動く。

const calc = require('../vendor/smogon-calc.js');
const NAMES = require('../data/names.json');

const GEN = calc.Generations.get(0);

// ---- 名前の変換 -----------------------------------------------------------

/** 文字認識や手入力のゆれを吸収する(全角英数→半角、空白除去) */
function normalize(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/g, '');
}

const NATURES = {
  'さみしがり': 'Lonely', 'いじっぱり': 'Adamant', 'やんちゃ': 'Naughty', 'ゆうかん': 'Brave',
  'ずぶとい': 'Bold', 'わんぱく': 'Impish', 'のうてんき': 'Lax', 'のんき': 'Relaxed',
  'ひかえめ': 'Modest', 'おっとり': 'Mild', 'うっかりや': 'Rash', 'れいせい': 'Quiet',
  'おだやか': 'Calm', 'おとなしい': 'Gentle', 'しんちょう': 'Careful', 'なまいき': 'Sassy',
  'おくびょう': 'Timid', 'せっかち': 'Hasty', 'ようき': 'Jolly', 'むじゃき': 'Naive',
  'てれや': 'Bashful', 'がんばりや': 'Hardy', 'すなお': 'Docile', 'きまぐれ': 'Quirky', 'まじめ': 'Serious',
};

const WEATHERS = {
  'はれ': 'Sun', 'ひざしがつよい': 'Sun', 'あめ': 'Rain', 'すなあらし': 'Sand', 'ゆき': 'Snow',
  'おおひでり': 'Harsh Sunshine', 'おおあめ': 'Heavy Rain', 'らんきりゅう': 'Strong Winds',
};

const TERRAINS = {
  'エレキフィールド': 'Electric', 'グラスフィールド': 'Grassy',
  'サイコフィールド': 'Psychic', 'ミストフィールド': 'Misty',
};

const STATUSES = {
  'やけど': 'brn', 'どく': 'psn', 'もうどく': 'tox', 'まひ': 'par', 'ねむり': 'slp', 'こおり': 'frz',
};

const STAT_KEYS = {
  'HP': 'hp', 'こうげき': 'atk', 'ぼうぎょ': 'def', 'とくこう': 'spa', 'とくぼう': 'spd', 'すばやさ': 'spe',
  hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe',
};

function lookup(table, kind, name) {
  if (name === undefined || name === null || name === '') return undefined;
  const key = normalize(name);
  if (table[key] !== undefined) return table[key];
  // 英語名がそのまま渡された場合はそのまま使う
  return String(name);
}

/** 日本語のポケモン名と(必要なら)フォルム名から、計算用の名前を決める */
function speciesName(name, form) {
  if (form) return form; // 'Rotom-Wash' や 'Lucario-Mega-Z' のように直接指定
  const forms = NAMES.species[normalize(name)];
  if (!forms) return String(name);
  // 基本の形を優先(フォルム違いは form で指定する)
  const base = forms.find(f => !f.includes('-')) || forms.find(f => /-Shield$/.test(f));
  return base || forms[0];
}

/** ポケモン名に対応するフォルムの一覧(例:ロトム → 6種) */
function formsOf(name) {
  return NAMES.species[normalize(name)] || [];
}

function convertTable(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = STAT_KEYS[k];
    if (key) out[key] = v;
  }
  return out;
}

// ---- ポケモン・技・場の組み立て ---------------------------------------

/**
 * @param {object} p
 *   name: 'ガブリアス'      form: 'Garchomp-Mega'(任意)
 *   nature: 'ようき'        sp: {hp:0, atk:32, ...}(日本語キーも可)
 *   ability: 'さめはだ'      item: 'こだわりハチマキ'
 *   boosts: {こうげき: -1}  status: 'やけど'
 *   hpPercent: 100(現在HPの割合。マルチスケイル等の判定に使う)
 *   gender: 'male' | 'female'
 */
function makePokemon(p) {
  const opts = {
    nature: lookup(NATURES, 'nature', p.nature) || 'Hardy',
    evs: convertTable(p.sp),
    boosts: convertTable(p.boosts),
  };
  if (p.ability) opts.ability = lookup(NAMES.abilities, 'ability', p.ability);
  if (p.item) opts.item = lookup(NAMES.items, 'item', p.item);
  if (p.status) opts.status = STATUSES[normalize(p.status)] || p.status;
  if (p.gender) opts.gender = p.gender === 'female' || p.gender === '♀' ? 'F' : p.gender === 'male' || p.gender === '♂' ? 'M' : 'N';
  if (p.abilityOn !== undefined) opts.abilityOn = p.abilityOn;

  const mon = new calc.Pokemon(GEN, speciesName(p.name, p.form), opts);
  if (p.hpPercent !== undefined) {
    mon.originalCurHP = Math.max(1, Math.round(mon.maxHP() * p.hpPercent / 100));
  }
  return mon;
}

function makeSide(s) {
  s = s || {};
  return {
    isSR: !!s.ステルスロック || !!s.stealthRock,
    spikes: s.まきびし || s.spikes || 0,
    isReflect: !!s.リフレクター || !!s.reflect,
    isLightScreen: !!s.ひかりのかべ || !!s.lightScreen,
    isAuroraVeil: !!s.オーロラベール || !!s.auroraVeil,
    isTailwind: !!s.おいかぜ || !!s.tailwind,
  };
}

/**
 * @param {object} f
 *   weather: 'すなあらし'  terrain: 'エレキフィールド'
 *   attackerSide / defenderSide: {リフレクター: true, ステルスロック: true, ...}
 */
function makeField(f) {
  f = f || {};
  return new calc.Field({
    gameType: 'Singles',
    weather: lookup(WEATHERS, 'weather', f.weather),
    terrain: lookup(TERRAINS, 'terrain', f.terrain),
    attackerSide: makeSide(f.attackerSide),
    defenderSide: makeSide(f.defenderSide),
  });
}

function makeMove(name, opts) {
  opts = opts || {};
  const m = {};
  if (opts.isCrit) m.isCrit = true;
  if (opts.hits) m.hits = opts.hits;
  if (opts.timesUsed) m.timesUsed = opts.timesUsed; // おはかまいりの倒れた数などは別指定
  return new calc.Move(GEN, lookup(NAMES.moves, 'move', name), m);
}

// ---- 計算 -------------------------------------------------------------

function koText(ko) {
  if (!ko || !ko.n) return '確定数なし';
  if (ko.chance === undefined || ko.chance >= 1) return `確定${ko.n}発`;
  return `乱数${ko.n}発(${(ko.chance * 100).toFixed(1)}%)`;
}

/**
 * ダメージを計算する。
 * @returns {{min:number, max:number, minPercent:number, maxPercent:number,
 *            rolls:number[], defenderHP:number, ko:string, koChance:number|undefined, koHits:number|undefined,
 *            description:string}}
 */
function damage(input) {
  const attacker = makePokemon(input.attacker);
  const defender = makePokemon(input.defender);
  const move = makeMove(input.move, input.moveOptions);
  const field = makeField(input.field);
  const result = calc.calculate(GEN, attacker, defender, move, field);

  const raw = result.damage;
  const rolls = Array.isArray(raw)
    ? (Array.isArray(raw[0]) ? raw[0].map((_, i) => raw.reduce((s, r) => s + r[i], 0)) : raw)
    : [raw];
  const hp = defender.maxHP();
  const [min, max] = result.range();
  let ko;
  try { ko = result.kochance(); } catch (e) { ko = undefined; }
  return {
    min, max,
    minPercent: Math.floor(min / hp * 1000) / 10,
    maxPercent: Math.floor(max / hp * 1000) / 10,
    rolls,
    defenderHP: hp,
    ko: koText(ko),
    koChance: ko ? ko.chance : undefined,
    koHits: ko ? ko.n : undefined,
    description: safeDesc(result),
  };
}

function safeDesc(result) {
  try { return result.desc(); } catch (e) { return ''; }
}

/** 実数値を出す(パーティ登録の検証や、相手の推定に使う) */
function stats(p) {
  const mon = makePokemon(p);
  return Object.assign({}, mon.stats, {hp: mon.maxHP()});
}

const engine = {damage, stats, formsOf, normalize, names: NAMES, NATURES, WEATHERS, TERRAINS, STATUSES};

if (typeof module !== 'undefined' && module.exports) module.exports = engine;
if (typeof globalThis !== 'undefined') globalThis.PokeChanEngine = engine;
