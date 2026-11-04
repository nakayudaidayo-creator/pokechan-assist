// 相手の型の推定
//
// よくある型(sets.json)と、汎用の型(無振り・耐久全振りなど)を候補にし、
// 対戦中に分かったこと(特性・持ち物・使った技・削れ方・先手後手)と合うかで点数を付けて並べる。

const engine = require('./engine.js');
const SETS = require('../data/sets.json');
const calc = require('../vendor/smogon-calc.js');

const GEN = calc.Generations.get(0);
const toID = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** 技の分類と優先度 */
function moveInfo(moveJa) {
  const en = engine.names.moves[engine.normalize(moveJa)];
  const m = en && GEN.moves.get(toID(en));
  if (!m) return {category: undefined, priority: 0};
  // 計算データでは変化技に分類が入っていないことがあるので、威力0は変化技とみなす
  const category = m.category || (m.basePower ? undefined : 'Status');
  return {category, priority: m.priority || 0};
}

// 型データがないポケモンや、どの型とも合わないときに使う汎用の型
const GENERIC = [
  {name: '無振り', nature: 'まじめ', sp: {}},
  {name: '物理アタッカー(いじっぱりAS)', nature: 'いじっぱり', sp: {atk: 32, spe: 32, hp: 2}},
  {name: '物理アタッカー(ようきAS)', nature: 'ようき', sp: {atk: 32, spe: 32, hp: 2}},
  {name: '特殊アタッカー(ひかえめCS)', nature: 'ひかえめ', sp: {spa: 32, spe: 32, hp: 2}},
  {name: '特殊アタッカー(おくびょうCS)', nature: 'おくびょう', sp: {spa: 32, spe: 32, hp: 2}},
  {name: '物理耐久(わんぱくHB)', nature: 'わんぱく', sp: {hp: 32, def: 32, spd: 2}},
  {name: '特殊耐久(おだやかHD)', nature: 'おだやか', sp: {hp: 32, spd: 32, def: 2}},
].map(s => Object.assign({source: '汎用', moves: [], ability: undefined, item: undefined}, s));

/** 選べる形の中から、計算に使うフォルムを決める */
function pickForm(species, setForm, isMega) {
  const forms = engine.formsOf(species);
  if (isMega) return forms.find(f => /-Mega/.test(f) && (!setForm || f === setForm || /-Mega/.test(setForm))) || forms.find(f => /-Mega/.test(f));
  if (setForm && forms.includes(setForm) && !/-Mega/.test(setForm)) return setForm;
  return undefined; // 基本の形
}

/** 候補の型から、計算エンジンに渡すポケモンを作る */
function toPokemon(species, set, opp) {
  return {
    name: species,
    form: opp.form || pickForm(species, set.form, opp.mega),
    nature: set.nature, sp: set.sp,
    ability: opp.ability || set.ability,
    item: opp.itemRemoved ? undefined : (opp.item || set.item),
    hpPercent: opp.hpPercent,
    status: opp.status,
  };
}

function inRange(observed, r, slack) {
  return observed >= r.minPercent - slack && observed <= r.maxPercent + slack;
}

/**
 * @param {object} opp 相手について分かっていること
 *   species, form, mega, ability, item, itemRemoved, usedMoves[], hpPercent, status
 * @param {object} evidence
 *   hitsTaken: [{attacker, move, percent, crit, field}]   自分の攻撃で相手が削れた割合
 *   hitsDealt: [{defender, move, hp, percent, crit, field}] 相手の攻撃で自分が受けたダメージ
 *   speed: [{oppFirst: bool, mySpeed: number}]             同じ優先度の技どうしで、どちらが先に動いたか
 * @returns {{species, candidates: Array<{set, score, notes: string[]}>}}
 */
function inferSets(opp, evidence = {}) {
  const species = opp.species;
  const known = (SETS[species] || []).filter(s => s.source !== 'VGC');
  const pool = [...known, ...GENERIC.map(g => Object.assign({}, g))];

  const scored = pool.map((set, i) => {
    let score = set.source === 'BSS' ? 3 - i * 0.2 : set.source === 'OU' ? 1 - i * 0.05 : 0;
    const notes = [];
    if (set.source === '汎用') score = -1;

    // 特性・持ち物
    if (opp.ability && set.ability && set.ability !== opp.ability) { score -= 4; notes.push('特性が違う'); }
    if (opp.item && set.item && set.item !== opp.item) { score -= 4; notes.push('持ち物が違う'); }

    // 使った技
    for (const m of opp.usedMoves || []) {
      if (set.moves.length && !set.moves.includes(m)) { score -= 1.5; notes.push(`${m}がない`); }
      else if (set.moves.includes(m)) score += 0.5;
    }
    // こだわり系なのに違う技を出した
    if (/^こだわり/.test(opp.item || set.item || '') && new Set(opp.usedMovesThisSwitch || []).size > 1) {
      score -= 4; notes.push('こだわりなのに技を変えた');
    }

    const mon = toPokemon(species, set, opp);

    // 自分の攻撃での削れ方(耐久の手がかり)
    for (const h of evidence.hitsTaken || []) {
      try {
        const r = engine.damage({attacker: h.attacker, defender: Object.assign({}, mon, {hpPercent: h.fromPercent}), move: h.move, field: h.field, moveOptions: {isCrit: h.crit, fainted: h.fainted}});
        if (inRange(h.percent, r, 1.5)) score += 2;
        else { score -= 3; notes.push(`${h.move}の削れ方が合わない`); }
      } catch (e) { /* 計算できない技は無視 */ }
    }

    // 相手の攻撃で受けたダメージ(火力の手がかり)
    for (const h of evidence.hitsDealt || []) {
      try {
        const r = engine.damage({attacker: mon, defender: h.defender, move: h.move, field: h.field, moveOptions: {isCrit: h.crit}});
        const ok = h.hp !== undefined ? (h.hp >= r.min - 1 && h.hp <= r.max + 1) : inRange(h.percent, r, 1.5);
        if (ok) score += 2;
        else { score -= 3; notes.push(`${h.move}のダメージが合わない`); }
      } catch (e) { /* 無視 */ }
    }

    // 先手・後手(すばやさの手がかり)
    const spe = effectiveSpeed(mon);
    for (const s of evidence.speed || []) {
      if (s.oppFirst && spe < s.mySpeed) { score -= 3; notes.push('先手を取られたのに遅い'); }
      if (!s.oppFirst && spe > s.mySpeed) { score -= 3; notes.push('後手だったのに速い'); }
    }

    return {set, score, notes, speed: spe};
  });

  scored.sort((a, b) => b.score - a.score);
  return {species, candidates: scored};
}

/** すばやさの実数値(こだわりスカーフ込み) */
function effectiveSpeed(p) {
  try {
    const s = engine.stats(p).spe;
    return /こだわりスカーフ/.test(p.item || '') ? Math.floor(s * 1.5) : s;
  } catch (e) {
    return 0;
  }
}

module.exports = {inferSets, toPokemon, effectiveSpeed, moveInfo, GENERIC};
