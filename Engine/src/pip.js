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

/** 相手の1匹について、集まった手がかりから型を推定する */
function analyze(battle, oppMon) {
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
  return {candidates, best, oppPoke};
}

/**
 * 相手側のページの並び:0 = 場の相手、1以降 = 控え。
 * 控えは「出てきたことのある相手(倒れていない)」→「まだ出ていない候補」の順。
 * まだ出ていない候補は選出画面で分かった6匹の残りで、相手の3匹が出そろったら出さない
 */
function pages(battle) {
  const oppSide = battle.sides.opp;
  const active = oppSide.active;
  if (!active) return [];
  const bench = Object.values(oppSide.mons).filter(m => m.species !== active && !m.fainted).map(m => m.species);
  return [active, ...bench, ...unseen(battle)];
}

/** 選出画面で分かった相手の6匹のうち、まだ出てきていない相手(3匹出そろったら空) */
function unseen(battle) {
  const seen = Object.keys(battle.sides.opp.mons);
  if (seen.length >= 3) return [];
  return (battle.opponentTeam || []).filter(n => !seen.includes(n));
}

/** まだ出てきていない相手を、何も分かっていない状態のポケモンとして扱う */
function placeholder(species) {
  return {species, form: undefined, mega: false, hpPercent: 100, boosts: {}, status: undefined,
    ability: undefined, item: undefined, itemRemoved: false, moves: [], movesThisSwitch: [], fainted: false, unseen: true};
}

/** 自分側のページの並び:0 = 場のポケモン、1以降 = 交代先(選出した3匹のうち、倒れていないもの) */
function myPages(battle) {
  const meSide = battle.sides.me;
  const active = meSide.active;
  const pool = battle.mySelection && battle.mySelection.length ? battle.mySelection : battle.party.map(p => p.species);
  const bench = pool.filter(n => n !== active && !(meSide.mons[n] && meSide.mons[n].fainted));
  return active ? [active, ...bench] : [];
}

/** 控えの相手の1行まとめ(小窓の下に常に出す) */
function benchSummary(battle) {
  const oppSide = battle.sides.opp;
  const seen = Object.values(oppSide.mons).filter(m => m.species !== oppSide.active);
  const list = seen.map(m => {
    if (m.fainted) return {species: m.species, fainted: true};
    const {best} = analyze(battle, m);
    return {species: m.species, hpPercent: m.hpPercent, moves: m.moves.slice(0, 2), setName: best.set.name};
  });
  return {list, remaining: unseen(battle)};
}

/**
 * @param {Battle} battle
 * @param {{page?: number}} opts page = 0:場の相手 / 1以降:控え
 * @returns 小窓の表示データ(Swift側でそのまま描く)
 */
function buildView(battle, opts = {}) {
  const meSide = battle.sides.me, oppSide = battle.sides.opp;
  const activeMe = meSide.active && meSide.mons[meSide.active];
  const order = pages(battle);
  if (!activeMe || !order.length) {
    return {title: 'ポケチャン補助', waiting: true, message: activeMe ? '相手のポケモンを読み取り中' : '対戦の開始を待っています'};
  }
  const page = ((opts.page || 0) % order.length + order.length) % order.length;
  const oppMon = oppSide.mons[order[page]] || placeholder(order[page]);
  const isBench = page > 0;

  // 自分側:0 = 場のポケモン、1以降 = 交代先(まだ出ていなければHP満タン・ランク変化なし)
  const myOrder = myPages(battle);
  const myIdx = ((opts.myPage || 0) % myOrder.length + myOrder.length) % myOrder.length;
  const isMyBench = myIdx > 0;
  const meMon = meSide.mons[myOrder[myIdx]] || {species: myOrder[myIdx], hpPercent: 100, boosts: {}, itemRemoved: false};

  const member = battle.myMember(meMon.species) || {species: meMon.species};
  const myPoke = {
    name: member.species, form: meMon.form, nature: member.nature, sp: member.sp,
    ability: member.ability, item: meMon.itemRemoved ? undefined : member.item,
    status: meMon.status, hpPercent: meMon.hpPercent, boosts: isMyBench ? {} : boostsJa(meMon.boosts),
  };

  const {candidates, best, oppPoke} = analyze(battle, oppMon);
  if (isBench) oppPoke.boosts = {}; // 控えはランク変化なし
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
  const bench = benchSummary(battle);
  return {
    title: `${meMon.species}${isMyBench ? '(交代先)' : ''} ⇄ ${oppMon.species}${oppMon.unseen ? '(まだ出ていない)' : isBench ? '(控え)' : ''}`,
    page, pageCount: order.length, myPage: myIdx, myPageCount: myOrder.length,
    pageLabel: [isMyBench ? `交代先 ${myIdx}/${myOrder.length - 1}` : '', isBench ? `相手の控え ${page}/${order.length - 1}` : '']
      .filter(Boolean).join('・') || '対面',
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
    bench: bench.list.filter(b => b.species !== oppMon.species).concat(isBench ? [{species: order[0], active: true, hpPercent: oppSide.mons[order[0]].hpPercent}] : []),
    remaining: bench.remaining,
    note: assumedItem === 'きあいのタスキ' && oppMon.hpPercent === 100 ? 'タスキ:HP満タンからは1発で倒せない' : '',
  };
}

module.exports = {buildView, pages, myPages};
