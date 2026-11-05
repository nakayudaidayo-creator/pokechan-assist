// パーティ画面のスクショ(「能力」と「ステータス」の2枚)から、6匹の内容を取り込む
//
// iPhone 側は画像を文字認識して、文字と位置をそのまま渡す。ここで6匹の枠に分け、
// 名前・特性・持ち物・技(能力の画面)と、実数値・SP(ステータスの画面)を読み取る。
// 性格は画面に文字で出ないので、実数値とSPから計算で割り出す。

const engine = require('./engine.js');
const NAMES = require('../data/names.json');

const norm = s => String(s || '').normalize('NFKC').replace(/[\s　]+/g, '');
const KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const LABELS = [['HP', 'hp'], ['こうげき', 'atk'], ['ぼうぎょ', 'def'], ['とくこう', 'spa'], ['とくぼう', 'spd'], ['すばやさ', 'spe']];

// 6匹の並び:2列×3段。画面に対する割合(ゲームの画面が変わったらここを直す)
const GRID = {x0: 0.15, x1: 0.85, y0: 0.22, y1: 0.86, cols: 2, rows: 3};

function cardIndex(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if (cx < GRID.x0 || cx > GRID.x1 || cy < GRID.y0 || cy > GRID.y1) return -1;
  const col = Math.min(GRID.cols - 1, Math.floor((cx - GRID.x0) / ((GRID.x1 - GRID.x0) / GRID.cols)));
  const row = Math.min(GRID.rows - 1, Math.floor((cy - GRID.y0) / ((GRID.y1 - GRID.y0) / GRID.rows)));
  return row * GRID.cols + col;
}

function splitCards(obs) {
  const cards = Array.from({length: GRID.cols * GRID.rows}, () => []);
  for (const o of obs) {
    const i = cardIndex(o);
    if (i >= 0) cards[i].push(o);
  }
  return cards;
}

/** 辞書の中で一致するもの(1文字違いまで許す)を探す */
function lookup(text, dict) {
  const t = norm(text).replace(/[♂♀]/g, '');
  if (!t) return null;
  if (dict[t] !== undefined) return t;
  if (t.length < 3) return null;
  let best = null;
  for (const k of Object.keys(dict)) {
    if (Math.abs(k.length - t.length) > 1) continue;
    if (distance(k, t) <= 1 && (!best || k.length > best.length)) best = k;
  }
  return best;
}

function distance(a, b) {
  const d = Array.from({length: a.length + 1}, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function gender(card) {
  const all = card.map(o => o.text).join('');
  if (/♀/.test(all)) return 'female';
  if (/♂/.test(all)) return 'male';
  return undefined;
}

const DICTS = [['species', NAMES.species], ['move', NAMES.moves], ['ability', NAMES.abilities], ['item', NAMES.items]];

/** 文字が、ポケモン名・技・特性・持ち物のどれかを判定する(完全一致を優先し、なければ1文字違いまで) */
function classify(text) {
  const t = norm(text).replace(/[♂♀]/g, '');
  for (const [kind, dict] of DICTS) if (dict[t] !== undefined) return {kind, value: t};
  for (const [kind, dict] of DICTS) {
    const v = lookup(t, dict);
    if (v) return {kind, value: v};
  }
  return null;
}

/** 完全一致だけで判定する(つながった文字を区切るときに使う) */
function exact(t) {
  for (const [kind, dict] of DICTS) if (dict[t] !== undefined) return {kind, value: t};
  return null;
}

/**
 * 1かたまりの文字から、名前・技・特性・持ち物を取り出す。
 * 「じしん ステルスロック」のように2つ以上がつながって読まれた場合も、空白や辞書で区切って拾う
 */
function extract(text) {
  const whole = classify(text);
  if (whole) return [whole];
  const out = [];
  const tokens = String(text || '').normalize('NFKC').split(/[\s　/／・,、]+/).filter(Boolean);
  for (const tok of tokens) {
    const c = tokens.length > 1 ? classify(tok) : null;
    if (c) { out.push(c); continue; }
    // 空白なしでつながっている場合:左から一番長く一致するものを順に取る
    const t = norm(tok).replace(/[♂♀]/g, '');
    let i = 0;
    while (i < t.length) {
      let hit = null;
      for (let j = t.length; j >= i + 2; j--) {
        hit = exact(t.slice(i, j));
        if (hit) { i = j; break; }
      }
      if (hit) out.push(hit); else i++;
    }
  }
  return out;
}

/** 「能力」の画面の1枠:名前・特性・持ち物・技 */
function readAbilityCard(card) {
  const sorted = [...card].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  let species = null, ability = null, item = null;
  const moves = [];
  for (const o of sorted) {
    for (const c of extract(o.text)) {
      if (c.kind === 'species' && !species) species = c.value;
      else if (c.kind === 'move' && moves.length < 4 && !moves.includes(c.value)) moves.push(c.value);
      else if (c.kind === 'ability' && !ability) ability = c.value;
      else if (c.kind === 'item' && !item) item = c.value;
    }
  }
  return {species, ability, item, moves, gender: gender(card)};
}

// ステータスのラベル。濁点・小さい字の読み違いに強くするため、比べるときは単純な形にする
const simple = s => s.normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC')
  .replace(/[ぁぃぅぇぉっゃゅょゎ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 1));
const SIMPLE_LABELS = LABELS.map(([l, k]) => [simple(l), k]);

function labelKey(raw) {
  const t = raw.replace(/\s/g, '');
  if (/^HP$/i.test(t)) return 'hp';
  const s = simple(t);
  const hit = SIMPLE_LABELS.find(([l]) => l === s);
  if (hit) return hit[1];
  // 1文字違い。候補が1つに決まるときだけ
  const near = SIMPLE_LABELS.filter(([l]) => Math.abs(l.length - s.length) <= 1 && distance(l, s) <= 1);
  return near.length === 1 ? near[0][1] : null;
}

/** 画面全体を行ごとにつなげ、1文字ずつの位置を持った文字列にする */
function rowsWithPositions(obs) {
  const rows = [];
  for (const o of [...obs].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2))) {
    const cy = o.y + o.h / 2;
    const row = rows.find(r => Math.abs(r.cy - cy) < Math.max(0.012, o.h * 0.5));
    if (row) row.items.push(o); else rows.push({cy, items: [o]});
  }
  return rows.map(r => {
    const chars = [];
    for (const o of r.items.sort((a, b) => a.x - b.x)) {
      const t = String(o.text || '').normalize('NFKC');
      [...t].forEach((c, k, all) => chars.push({c, x: o.x + o.w * (k + 0.5) / all.length}));
      chars.push({c: ' ', x: o.x + o.w});
    }
    return {cy: r.cy, chars};
  });
}

// 「ラベル 実数値 SP」の並び。ラベルの後ろの記号や、グラフを読み違えた文字は少しだけ読み飛ばす
const STAT_RE = /(H\s?P|[ぁ-ゖ]{3,5})[^0-9ぁ-ゖ]{0,4}?(\d{1,3})(?:[^0-9ぁ-ゖ]{1,4}?(\d{1,2})(?!\d))?/g;

/** 「ステータス」の画面:6匹分の実数値とSP */
function readStatusCards(obs, cards) {
  const result = cards.map(card => {
    let species = null;
    for (const o of [...card].sort((a, b) => a.y - b.y)) {
      const c = extract(o.text).find(x => x.kind === 'species');
      if (c) { species = c.value; break; }
    }
    return {species, stats: {}, sp: {}, gender: gender(card)};
  });
  let found = 0;
  for (const row of rowsWithPositions(obs)) {
    const str = row.chars.map(c => c.c).join('');
    for (const m of str.matchAll(STAT_RE)) {
      const key = labelKey(m[1]);
      if (!key) continue;
      const pos = row.chars[m.index];
      const i = cardIndex({x: pos.x, y: row.cy, w: 0, h: 0});
      if (i < 0 || result[i].stats[key] !== undefined) continue;
      result[i].stats[key] = Number(m[2]);
      if (m[3] !== undefined) result[i].sp[key] = Number(m[3]);
      found++;
    }
  }
  return {cards: result, found};
}

/** 読み取った文字の先頭の方(うまくいかないときに、確認の画面に出して原因を調べるため) */
function sample(obs, n) {
  const texts = [...obs].sort((a, b) => (a.y - b.y) || (a.x - b.x)).map(o => String(o.text)).filter(Boolean);
  const s = texts.slice(0, 24).join(' / ');
  return `読み取った文字(${n}枚目):` + (s.length > 260 ? s.slice(0, 260) + '…' : s || '(なし)');
}

/** 実数値とSPに合う性格を探す。合うものがなければ、一番近いもの */
function findNature(species, sp, stats) {
  let best = null;
  for (const nature of Object.keys(engine.NATURES)) {
    let s;
    try { s = engine.stats({name: species, nature, sp}); } catch (e) { return {nature: null, mismatch: KEYS}; }
    const mismatch = KEYS.filter(k => stats[k] !== undefined && s[k] !== stats[k]);
    if (!best || mismatch.length < best.mismatch.length) best = {nature, mismatch};
    if (!mismatch.length) break;
  }
  return best;
}

/**
 * @param {Array<Array>} images 画像ごとの文字認識結果(2枚、順番は問わない)
 * @returns {{members: Array, warnings: string[]}}
 */
function importParty(images) {
  const warnings = [];
  // 2枚のどちらが「能力」でどちらが「ステータス」かは、中身で決める
  const scanned = images.map((obs, n) => {
    obs = obs || [];
    const cards = splitCards(obs);
    const ability = cards.map(readAbilityCard);
    const status = readStatusCards(obs, cards);
    const abilityScore = ability.reduce((x, c) => x + c.moves.length + (c.ability ? 1 : 0) + (c.item ? 1 : 0), 0);
    return {obs, n: n + 1, ability, status: status.cards, abilityScore, statusScore: status.found};
  });
  const pick = (list, score) => list.reduce((b, s) => (!b || score(s) > score(b) ? s : b), null);
  let stShot = pick(scanned.filter(s => s.statusScore >= 3), s => s.statusScore - s.abilityScore);
  if (stShot && stShot.abilityScore > stShot.statusScore && scanned.length > 1) stShot = null;
  let abShot = pick(scanned.filter(s => s !== stShot && s.abilityScore >= 1), s => s.abilityScore - s.statusScore);
  const abilityCards = abShot ? abShot.ability : null;
  const statusCards = stShot ? stShot.status : null;
  if (!abilityCards) warnings.push('「能力」の画面が見つかりません。技・特性・持ち物は手で入力してください');
  if (!statusCards) warnings.push('「ステータス」の画面が見つかりません。SPと性格は手で入力してください');
  // 読み取れなかったときは、原因を調べるために読み取った文字も出す
  for (const s of scanned) {
    if (s === abShot || s === stShot) continue;
    if (!abilityCards || !statusCards) warnings.push(sample(s.obs, s.n));
  }
  if (stShot && statusCards.some(c => c.species && Object.keys(c.stats).length < 6)) warnings.push(sample(stShot.obs.filter(o => /\d/.test(o.text)), stShot.n));

  const members = [];
  for (let i = 0; i < GRID.cols * GRID.rows; i++) {
    const a = abilityCards ? abilityCards[i] : null;
    // ステータスの画面は、同じ位置の枠を使う(名前が読めていれば名前でも照合)
    let st = statusCards ? statusCards[i] : null;
    if (a && a.species && statusCards) st = statusCards.find(c => c.species === a.species) || st;
    const species = (a && a.species) || (st && st.species);
    if (!species) { warnings.push(`${i + 1}番目のポケモンの名前を読めませんでした`); continue; }

    const sp = Object.fromEntries(KEYS.map(k => [k, (st && st.sp[k]) || 0]));
    const stats = st ? st.stats : {};
    let nature = 'まじめ';
    if (st && Object.keys(stats).length) {
      const n = findNature(species, sp, stats);
      if (n && n.nature) nature = n.nature;
      if (n && n.mismatch.length) warnings.push(`${species}:実数値が計算と合わない能力があります(${n.mismatch.join('・')})。SPを確認してください`);
    }
    const total = Object.values(sp).reduce((x, y) => x + y, 0);
    if (total > 66) warnings.push(`${species}:SPの合計が${total}で、66を超えています`);
    if (a && a.moves.length < 4) warnings.push(`${species}:技を${a.moves.length}つしか読めませんでした`);

    members.push({
      species,
      gender: (a && a.gender) || (st && st.gender),
      nature,
      ability: (a && a.ability) || '',
      item: (a && a.item) || '',
      moves: a ? a.moves : [],
      sp,
      stats: Object.keys(stats).length ? stats : undefined,
    });
  }
  return {members, warnings};
}

module.exports = {importParty, findNature, GRID};
