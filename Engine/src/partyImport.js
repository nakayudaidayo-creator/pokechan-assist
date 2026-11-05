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

/** 文字が、ポケモン名・技・特性・持ち物のどれかを判定する(完全一致を優先し、なければ1文字違いまで) */
function classify(text) {
  const t = norm(text).replace(/[♂♀]/g, '');
  const dicts = [['species', NAMES.species], ['move', NAMES.moves], ['ability', NAMES.abilities], ['item', NAMES.items]];
  for (const [kind, dict] of dicts) if (dict[t] !== undefined) return {kind, value: t};
  for (const [kind, dict] of dicts) {
    const v = lookup(t, dict);
    if (v) return {kind, value: v};
  }
  return null;
}

/** 「能力」の画面の1枠:名前・特性・持ち物・技 */
function readAbilityCard(card) {
  const sorted = [...card].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  let species = null, ability = null, item = null;
  const moves = [];
  for (const o of sorted) {
    const c = classify(o.text);
    if (!c) continue;
    if (c.kind === 'species' && !species) species = c.value;
    else if (c.kind === 'move' && moves.length < 4 && !moves.includes(c.value)) moves.push(c.value);
    else if (c.kind === 'ability' && !ability) ability = c.value;
    else if (c.kind === 'item' && !item) item = c.value;
  }
  return {species, ability, item, moves, gender: gender(card)};
}

/** 「ステータス」の画面の1枠:名前と、能力ごとの実数値・SP */
function readStatusCard(card) {
  let species = null;
  for (const o of [...card].sort((a, b) => a.y - b.y)) {
    const s = lookup(o.text, NAMES.species);
    if (s) { species = s; break; }
  }
  const stats = {}, sp = {};
  for (const [label, key] of LABELS) {
    const lab = card.find(o => norm(o.text).startsWith(label));
    if (!lab) continue;
    const cy = lab.y + lab.h / 2;
    // 同じ行で、ラベルより右にある数字を左から順に
    const nums = [];
    const row = card.filter(o => o !== lab && Math.abs(o.y + o.h / 2 - cy) < Math.max(0.02, lab.h * 0.8) && o.x > lab.x)
      .sort((a, b) => a.x - b.x);
    // ラベルと数字が1つにつながって読まれた場合も拾う
    const own = norm(lab.text).slice(label.length).match(/\d+/g) || [];
    nums.push(...own.map(Number));
    for (const o of row) {
      const found = norm(o.text).match(/\d+/g) || [];
      nums.push(...found.map(Number));
    }
    // 右の列(とくこう等)のラベルを越えないよう、最初の2つまで
    if (nums.length >= 1) stats[key] = nums[0];
    if (nums.length >= 2) sp[key] = nums[1];
  }
  return {species, stats, sp, gender: gender(card)};
}

function isStatusScreen(obs) {
  const texts = obs.map(o => norm(o.text));
  return texts.filter(t => /^すばやさ/.test(t)).length >= 3 || texts.filter(t => /^とくぼう/.test(t)).length >= 3;
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
  let abilityCards = null, statusCards = null;
  for (const obs of images) {
    const cards = splitCards(obs || []);
    if (isStatusScreen(obs || [])) statusCards = cards.map(readStatusCard);
    else abilityCards = cards.map(readAbilityCard);
  }
  if (!abilityCards) warnings.push('「能力」の画面が見つかりません。技・特性・持ち物は手で入力してください');
  if (!statusCards) warnings.push('「ステータス」の画面が見つかりません。SPと性格は手で入力してください');

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
