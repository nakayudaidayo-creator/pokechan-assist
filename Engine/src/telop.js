// テロップ解析
//
// 画面から読み取った文字列を「出来事(イベント)」に変換する。
// 入力の種類:
//   {kind: 'telop', text}              画面下のテロップ(1行または2行をつなげたもの)
//   {kind: 'banner', side, text}       特性・持ち物の発動の帯(side: 'me' 左 / 'opp' 右)
//   {kind: 'hp', side, name, percent}  相手のHP表示
//   {kind: 'hp', side, name, cur, max} 自分のHP表示
//   {kind: 'log', text}                ログ画面の1項目(「アシレーヌ HP 100% → 65%」など)
//
// 文字認識のゆれ(全角・空白・ふりがなの混入)は呼び出し側で概ね除いてある前提だが、
// 空白と全角/半角はここでも吸収する。

const NAMES = require('../data/names.json');

const norm = s => String(s || '').normalize('NFKC').replace(/[\s　]+/g, '').replace(/[!！]/g, '!');

const SPECIES = new Set(Object.keys(NAMES.species));
const MOVES = new Set(Object.keys(NAMES.moves));
const ABILITIES = new Set(Object.keys(NAMES.abilities));
const ITEMS = new Set(Object.keys(NAMES.items));

// 能力変化の段階
const STAT_WORDS = {
  'こうげき': 'atk', '攻撃': 'atk', 'ぼうぎょ': 'def', '防御': 'def',
  'とくこう': 'spa', '特攻': 'spa', 'とくぼう': 'spd', '特防': 'spd',
  'すばやさ': 'spe', '素早さ': 'spe', 'めいちゅうりつ': 'acc', '命中率': 'acc', 'かいひりつ': 'eva', '回避率': 'eva',
};
const STAGE_WORDS = [
  [/ぐぐーんと上がった|ぐぐっと上がった|ぐぐーんと あがった/, +3],
  [/ぐーんと上がった|ぐーんと あがった/, +2],
  [/上がった|あがった/, +1],
  [/がくーんと下がった/, -3],
  [/がくっと下がった/, -2],
  [/下がった|さがった/, -1],
];

const WEATHER_START = [
  [/砂あらしが吹き始めた/, 'すなあらし'], [/雨が降り始めた/, 'あめ'],
  [/日差しが強くなった/, 'はれ'], [/雪が降り始めた/, 'ゆき'],
];
const WEATHER_END = /(砂あらしが|雨が|日差しが元に|雪が)(おさまった|やんだ|戻った|止んだ)/;

const STATUS_WORDS = [
  [/やけどを負った/, 'やけど'], [/まひして/, 'まひ'], [/もうどくを(あびた|浴びた)/, 'もうどく'],
  [/どくを(あびた|浴びた)/, 'どく'], [/眠ってしまった|ねむってしまった/, 'ねむり'], [/凍りついた|こおりついた/, 'こおり'],
];

/** 「相手の」を外して、どちらの側かを返す */
function splitSide(text) {
  if (text.startsWith('相手の')) return {side: 'opp', rest: text.slice(3)};
  return {side: 'me', rest: text};
}

/** 「XのY」を、Yが set に含まれる区切り位置で分ける(技名・持ち物名に「の」が入る場合に対応) */
function splitNo(text, set) {
  const t = text.replace(/!+$/, '');
  for (let i = t.indexOf('の'); i > 0; i = t.indexOf('の', i + 1)) {
    const right = t.slice(i + 1);
    if (set.has(right)) return [t.slice(0, i), right];
  }
  return null;
}

/** 先頭がポケモン名で始まるかを、長い名前から順に試す */
const SPECIES_BY_LENGTH = [...SPECIES].sort((a, b) => b.length - a.length);
function leadingSpecies(text) {
  // 「メガバンギラス」のようなメガ表記も受け付ける
  const t = text.startsWith('メガ') && !SPECIES.has(text.split('の')[0]) ? text.slice(2) : text;
  for (const s of SPECIES_BY_LENGTH) if (t.startsWith(s)) return {species: s, rest: t.slice(s.length)};
  return null;
}

function parseTelop(raw) {
  const text = norm(raw);
  if (!text) return [];
  let m;

  // 天候
  for (const [re, weather] of WEATHER_START) if (re.test(text)) return [{type: 'weather', weather}];
  if (WEATHER_END.test(text)) return [{type: 'weather', weather: null}];

  // 相性・急所・外れ
  if (/効果はバツグンだ/.test(text)) return [{type: 'effectiveness', value: 'super'}];
  if (/効果はいまひとつ/.test(text)) return [{type: 'effectiveness', value: 'resisted'}];
  if (/効果がないようだ/.test(text)) return [{type: 'effectiveness', value: 'immune'}];
  if (/急所に当たった/.test(text)) return [{type: 'crit'}];

  // 交代(トレーナー名は何でもよいので、末尾のポケモン名で判断する)
  // 自分の繰り出しは「ゆけっ!」なので、「(トレーナー)は Xを 繰り出した!」は相手側
  if ((m = text.match(/^(.+?)は(.+)を繰り出した!?$/))) return [{type: 'switchIn', side: 'opp', trainer: m[1], species: m[2]}];
  if ((m = text.match(/^ゆけっ!?(.+?)!?$/))) return [{type: 'switchIn', side: 'me', species: m[1]}];
  if ((m = text.match(/^(.+?)は(.+)を引っこめた!?$/))) return [{type: 'switchOut', trainer: m[1], species: m[2]}];
  if ((m = text.match(/^(.+?)!?戻れ!?$/))) return [{type: 'switchOut', side: 'me', species: m[1]}];

  // メガシンカの前ぶれ:「Xの Yナイトと (トレーナー)の ゼンブイリングが 反応した!」
  if ((m = text.match(/^(相手の)?(.+?)の(.+?)と.+が反応した/))) {
    // 反応した = このあとメガシンカする。メガシンカのテロップを読み落としても姿を変えられるよう、ここでも出す
    const side = m[1] ? 'opp' : 'me';
    return [{type: 'itemRevealed', side, species: m[2], item: m[3]}, {type: 'mega', side, species: m[2], megaName: m[3]}];
  }

  // メガシンカ
  if ((m = text.match(/^(.+?)は(メガ.+?)にメガシンカした/))) {
    const {side, rest} = splitSide(m[1]);
    return [{type: 'mega', side, species: rest, megaName: m[2]}];
  }

  const {side, rest} = splitSide(text);

  // 倒れた
  if ((m = rest.match(/^(.+?)は倒れた/))) return [{type: 'faint', side, species: m[1]}];

  // 外れ・効果なし(誰に)
  if ((m = rest.match(/^(.+?)には当たらなかった/))) return [{type: 'miss', side, species: m[1]}];
  if ((m = rest.match(/^(.+?)には効果がないようだ/))) return [{type: 'effectiveness', value: 'immune', side, species: m[1]}];

  // 技以外のダメージ・回復
  if ((m = rest.match(/^(.+?)は反動による?ダメージを受けた/))) return [{type: 'indirect', side, species: m[1], cause: 'recoil'}];
  if ((m = rest.match(/^(.+?)は(やけど|どく)のダメージを受けた/))) return [{type: 'indirect', side, species: m[1], cause: m[2] === 'やけど' ? 'burn' : 'poison', status: m[2]}];
  if ((m = rest.match(/^(.+?)の体力が(少し)?回復した/))) return [{type: 'indirect', side, species: m[1], cause: 'heal'}];
  if ((m = text.match(/^砂あらしが(相手の)?(.+?)を(襲う|おそう)/))) return [{type: 'indirect', side: m[1] ? 'opp' : 'me', species: m[2], cause: 'sand'}];
  if ((m = rest.match(/^(.+?)にとがった岩が食いこんだ/))) return [{type: 'indirect', side, species: m[1], cause: 'stealthRock'}];

  // 状態異常
  for (const [re, status] of STATUS_WORDS) {
    if (re.test(rest)) {
      const who = rest.match(/^(.+?)は/);
      return [{type: 'status', side, species: who ? who[1] : undefined, status}];
    }
  }

  // 持ち物を使った:「相手の ガブリアスは オボンのみで 体力を 回復した!」「Xは きあいのタスキで もちこたえた!」
  if ((m = rest.match(/^(.+?)は(.+?)で(体力を回復した|もちこたえた|持ちこたえた)/))) {
    return [{type: 'itemRevealed', side, species: m[1], item: m[2], removed: true}];
  }

  // はたきおとす:「XはYの〇〇をはたきおとした!」「相手のXの〇〇を はたきおとした!」
  if ((m = text.match(/(相手の)?([^の]+)の(.+?)をはたきおとした/))) {
    return [{type: 'itemRevealed', side: m[1] ? 'opp' : 'me', species: m[2], item: m[3], removed: true}];
  }

  // 能力変化:「Xの こうげきが 下がった!」
  if ((m = rest.match(/^(.+?)の(こうげき|攻撃|ぼうぎょ|防御|とくこう|特攻|とくぼう|特防|すばやさ|素早さ|めいちゅうりつ|命中率|かいひりつ|回避率)が(.+)$/))) {
    for (const [re, stages] of STAGE_WORDS) {
      if (re.test(m[3])) return [{type: 'boost', side, species: m[1], stat: STAT_WORDS[m[2]], stages}];
    }
  }

  // 技:「Xの Y!」(Yが技名のときだけ)
  const mv = splitNo(rest, MOVES);
  if (mv) return [{type: 'move', side, species: mv[0], move: mv[1]}];

  return [{type: 'unknown', text}];
}

/** 特性・持ち物の帯:「ボーマンダの いかく」 */
function parseBanner(side, raw) {
  const text = norm(raw);
  const ab = splitNo(text, ABILITIES);
  if (ab) return [{type: 'abilityRevealed', side, species: ab[0], ability: ab[1]}];
  const it = splitNo(text, ITEMS);
  if (it) return [{type: 'itemRevealed', side, species: it[0], item: it[1]}];
  return [{type: 'unknown', text}];
}

/** ログ画面の1項目 */
function parseLog(raw) {
  const text = norm(raw);
  let m;
  if ((m = text.match(/^(HP減少|HP回復)?(.+?)HP(\d+)%→(\d+)%$/))) {
    return [{type: 'hp', species: m[2], fromPercent: +m[3], percent: +m[4], source: 'log'}];
  }
  if ((m = text.match(/^(HP減少|HP回復)?(.+?)HP(\d+)→(\d+)$/))) {
    return [{type: 'hp', species: m[2], fromCur: +m[3], cur: +m[4], source: 'log'}];
  }
  if ((m = text.match(/^ターン(\d+)$/))) return [{type: 'turn', turn: +m[1]}];
  // ラベル(「技」「メガシンカ」)付きの項目や普通の文はテロップと同じ扱い
  return parseTelop(text.replace(/^(技|メガシンカ|HP減少|HP回復)/, ''));
}

function parse(input) {
  switch (input.kind) {
    case 'telop': return parseTelop(input.text);
    case 'banner': return parseBanner(input.side, input.text);
    case 'log': return parseLog(input.text);
    case 'switch': return [{type: 'switchIn', side: input.side, species: norm(input.name)}];
    case 'hp': {
      const e = {type: 'hp', side: input.side, species: norm(input.name), source: 'bar'};
      if (input.percent !== undefined) e.percent = input.percent;
      if (input.cur !== undefined) { e.cur = input.cur; e.max = input.max; }
      return [e];
    }
    default: return [{type: 'unknown', text: String(input.text || '')}];
  }
}

module.exports = {parse, parseTelop, parseBanner, parseLog, normalize: norm, leadingSpecies};
