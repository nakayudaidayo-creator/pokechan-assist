// iPhone(JavaScriptCore)向けの入口。
// Swift からは pokechanCall('関数名', 'JSON文字列') だけを呼び、結果も JSON 文字列で受け取る。

import engine from './engine.js';
import battleModule from './battle.js';
import calc from '../vendor/smogon-calc.js';
import pip from './pip.js';

const {Battle} = battleModule;
const MOVE_DATA = calc.Generations.get(0).moves;

/** 技の分類(物理・特殊・変化) */
function category(moveJa) {
  const en = engine.names.moves[engine.normalize(moveJa)] || moveJa;
  const m = MOVE_DATA.get(String(en).toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (!m) return undefined;
  return m.category || (m.basePower ? undefined : 'Status'); // 'Physical' | 'Special' | 'Status'
}

// 相手の調整がわからないときに比べる2つの型
function presets(cat) {
  const bulkyDef = cat === 'Special' ? {nature: 'おだやか', sp: {hp: 32, spd: 32}} : {nature: 'わんぱく', sp: {hp: 32, def: 32}};
  return {frail: {nature: 'まじめ', sp: {}}, bulky: bulkyDef};
}

function short(r) {
  return {minPercent: r.minPercent, maxPercent: r.maxPercent, ko: r.ko};
}

const api = {
  /** 自分のポケモンの技4つで、相手(無振り/耐久全振り)をどれだけ削れるか */
  matchup(input) {
    const me = input.me;
    const opp = Object.assign({}, input.opp);
    const field = {weather: input.weather || undefined};
    return (me.moves || []).filter(Boolean).map(move => {
      const cat = category(move);
      if (cat === 'Status') return {move, category: cat};
      const p = presets(cat);
      try {
        const frail = engine.damage({attacker: me, defender: Object.assign({}, opp, p.frail), move, field, moveOptions: input.moveOptions});
        const bulky = engine.damage({attacker: me, defender: Object.assign({}, opp, p.bulky), move, field, moveOptions: input.moveOptions});
        return {move, category: cat, frail: short(frail), bulky: short(bulky)};
      } catch (e) {
        return {move, category: cat, error: String(e && e.message || e)};
      }
    });
  },
  damage: input => engine.damage(input),
  stats: input => engine.stats(input),
  formsOf: input => engine.formsOf(input.name),
  speciesList: () => Object.keys(engine.names.species),
  moveList: () => Object.keys(engine.names.moves),
  itemList: () => Object.keys(engine.names.items),
  abilityList: () => Object.keys(engine.names.abilities),
  natureList: () => Object.keys(engine.NATURES),
};

// 対戦中の状態は1つだけ持つ
let battle = null;
api.battleStart = input => { battle = new Battle(input); return battle.summary(); };
api.battleFeed = input => {
  if (!battle) battle = new Battle({});
  for (const i of (Array.isArray(input) ? input : [input])) battle.feed(i);
  return battle.summary();
};
/** 小窓(案A)に出す内容 */
api.pipView = () => (battle ? pip.buildView(battle) : {title: 'ポケチャン補助', waiting: true, message: '対戦の開始を待っています'});

globalThis.pokechanCall = function (name, json) {
  try {
    const fn = api[name];
    if (!fn) return JSON.stringify({error: `unknown function ${name}`});
    return JSON.stringify({ok: fn(json ? JSON.parse(json) : {})});
  } catch (e) {
    return JSON.stringify({error: String(e && e.message || e)});
  }
};
globalThis.PokeChanEngine = engine;
