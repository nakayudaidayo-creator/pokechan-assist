// 小窓(案A)に出す内容を、バトル状態から作る
//
// 出すもの:両方の名前と相手の残りHP、判明した情報(✓)と想定(?)、型の候補、先手・後手、
// こちらの技 → 相手、相手のよく使う技 → 自分

const engine = require('./engine.js');
const {inferSets, toPokemon, effectiveSpeed, moveInfo} = require('./infer.js');

const STAT_JA = {atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ'};

function boostsJa(b) {
  return Object.fromEntries(Object.entries(b || {}).filter(([k, v]) => STAT_JA[k] && v).map(([k, v]) => [STAT_JA[k], v]));
}

function shortKO(text) {
  const m = String(text || '').match(/^(確定|乱数)(\d+)発/);
  if (!m) return '-';
  return (m[1] === '確定' ? '確' : '乱') + m[2];
}

function row(move, r, extra) {
  return Object.assign({move, min: Math.floor(r.minPercent), max: Math.floor(r.maxPercent), ko: shortKO(r.ko)}, extra || {});
}

/**
 * @param {Battle} battle
 * @returns 小窓の表示データ(Swift側でそのまま描く)
 */
function buildView(battle) {
  const meSide = battle.sides.me, oppSide = battle.sides.opp;
  const meMon = meSide.active && meSide.mons[meSide.active];
  const oppMon = oppSide.active && oppSide.mons[oppSide.active];
  if (!meMon || !oppMon) {
    return {title: 'ポケチャン補助', waiting: true, message: meMon ? '相手のポケモンを読み取り中' : '対戦の開始を待っています'};
  }
  const member = battle.myMember(meMon.species) || {species: meMon.species};
  const myPoke = {
    name: member.species, form: meMon.form, nature: member.nature, sp: member.sp,
    ability: member.ability, item: meMon.itemRemoved ? undefined : member.item,
    status: meMon.status, hpPercent: meMon.hpPercent, boosts: boostsJa(meMon.boosts),
  };

  // この相手について集まった手がかり
  const hitsTaken = [], hitsDealt = [];
  for (const d of battle.damageLog) {
    const input = battle.toCalcInput(d);
    if (d.attackerSide === 'me' && d.defender && d.defender.species === oppMon.species) {
      hitsTaken.push({attacker: input.attacker, move: d.move, percent: d.damage.percent, fromPercent: d.damage.fromPercent, crit: d.crit, field: input.field, fainted: input.moveOptions.fainted});
    }
    if (d.attackerSide === 'opp' && d.attacker.species === oppMon.species) {
      hitsDealt.push({defender: input.defender, move: d.move, hp: d.damage.hp, percent: d.damage.percent, crit: d.crit, field: input.field});
    }
  }
  const speed = [];
  for (const s of battle.speedLog) {
    if (s.opp !== oppMon.species) continue;
    const mine = battle.myMember(s.me);
    if (!mine) continue;
    speed.push({oppFirst: s.first === 'opp', mySpeed: effectiveSpeed({name: mine.species, nature: mine.nature, sp: mine.sp, item: mine.item})});
  }

  const oppKnown = {
    species: oppMon.species, form: oppMon.form, mega: oppMon.mega,
    ability: oppMon.ability, item: oppMon.item, itemRemoved: oppMon.itemRemoved,
    usedMoves: oppMon.moves, usedMovesThisSwitch: oppMon.movesThisSwitch,
    hpPercent: oppMon.hpPercent, status: oppMon.status,
  };
  const {candidates} = inferSets(oppKnown, {hitsTaken, hitsDealt, speed});
  const best = candidates[0];
  const oppPoke = Object.assign(toPokemon(oppMon.species, best.set, oppKnown), {boosts: boostsJa(oppMon.boosts)});
  const field = {weather: battle.field.weather || undefined};

  // こちらの技 → 相手
  const myFainted = meSide.fainted;
  const mine = [];
  for (const mv of member.moves || []) {
    if (moveInfo(mv).category === 'Status') continue;
    try { mine.push(row(mv, engine.damage({attacker: myPoke, defender: oppPoke, move: mv, field, moveOptions: {fainted: myFainted}}))); } catch (e) { /* 無視 */ }
  }

  // 相手の技 → 自分(使われた技を先に、残りは型の技)
  const theirMoves = [...oppMon.moves];
  for (const mv of best.set.moves || []) if (!theirMoves.includes(mv)) theirMoves.push(mv);
  const theirs = [];
  for (const mv of theirMoves) {
    if (moveInfo(mv).category === 'Status') continue;
    try { theirs.push(row(mv, engine.damage({attacker: oppPoke, defender: myPoke, move: mv, field, moveOptions: {fainted: oppSide.fainted}}), {used: oppMon.moves.includes(mv)})); } catch (e) { /* 無視 */ }
    if (theirs.length >= 4) break;
  }

  mine.sort((a, b) => b.max - a.max);
  theirs.sort((a, b) => (b.used - a.used) || (b.max - a.max));

  // 先手・後手
  const mySpe = effectiveSpeed(myPoke), oppSpe = effectiveSpeed(oppPoke);
  const speedText = mySpe > oppSpe ? 'me' : mySpe < oppSpe ? 'opp' : 'tie';

  const assumedItem = oppMon.itemRemoved ? null : (oppMon.item || best.set.item);
  return {
    title: `${meMon.species} ⇄ ${oppMon.species}`,
    oppHpPercent: oppMon.hpPercent,
    known: {
      ability: oppMon.ability ? {value: oppMon.ability, sure: true} : (best.set.ability ? {value: best.set.ability, sure: false} : null),
      item: oppMon.itemRemoved ? {value: `${oppMon.item || '持ち物'}(なくなった)`, sure: true}
        : oppMon.item ? {value: oppMon.item, sure: true} : (assumedItem ? {value: assumedItem, sure: false} : null),
      moves: oppMon.moves,
    },
    candidates: [...new Set(candidates.map(c => c.set.name))].slice(0, 3),
    speed: {who: speedText, me: mySpe, opp: oppSpe, mySpeedNote: /こだわりスカーフ/.test(myPoke.item || '') ? 'スカーフ込み' : ''},
    mine, theirs,
    note: assumedItem === 'きあいのタスキ' && oppMon.hpPercent === 100 ? 'タスキ:HP満タンからは1発で倒せない' : '',
  };
}

module.exports = {buildView};
