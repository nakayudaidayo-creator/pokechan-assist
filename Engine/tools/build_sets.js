// Smogon のダメージ計算に入っている、ポケモンチャンピオンズ用の型(SETDEX_CHAMPIONS)を
// 日本語名に変換して Engine/data/sets.json に書き出す。
// 使い方: node Engine/tools/build_sets.js <damage-calc>/src/js/data/sets/champions.js
const fs = require('fs');
const path = require('path');
const names = require('../data/names.json');
const engine = require('../src/engine.js');

const src = fs.readFileSync(process.argv[2], 'utf8');
const SETDEX = new Function(src + ';return SETDEX_CHAMPIONS;')();

const inv = obj => Object.fromEntries(Object.entries(obj).map(([ja, en]) => [en, ja]));
const MOVE = inv(names.moves), ITEM = inv(names.items), ABIL = inv(names.abilities), NAT = inv(engine.NATURES);
const SPECIES = {};
for (const [ja, forms] of Object.entries(names.species)) {
  for (const f of forms) { SPECIES[f] = ja; SPECIES[f.split('-')[0]] = SPECIES[f.split('-')[0]] || ja; }
}
// 型の呼び名:「ようきAS・スカーフ」のように、性格・多く振った能力・持ち物で表す
const LETTER = {hp: 'H', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S'};
const SHORT_ITEM = {'こだわりスカーフ': 'スカーフ', 'こだわりハチマキ': 'ハチマキ', 'こだわりメガネ': 'メガネ',
  'きあいのタスキ': 'タスキ', 'とつげきチョッキ': 'チョッキ', 'たべのこし': '残飯', 'いのちのたま': '珠', 'ゴツゴツメット': 'ゴツメ'};
function jaLabel(nature, sp, item) {
  const big = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].filter(k => (sp[k] || 0) >= 20).map(k => LETTER[k]).join('');
  const it = SHORT_ITEM[item] || (/ナイト[XYZ]?$/.test(item || '') ? 'メガ' : item || '持ち物なし');
  return `${nature}${big}・${it}`;
}
const SP = {hp: 'hp', at: 'atk', df: 'def', sa: 'spa', sd: 'spd', sp: 'spe'};

function source(label) {
  if (/^BSS/.test(label)) return 'BSS';
  if (/^OU/.test(label)) return 'OU';
  if (/^VGC/.test(label)) return 'VGC';
  return 'その他';
}
const RANK = {BSS: 0, OU: 1, VGC: 2, 'その他': 3};

const out = {};
let total = 0, missing = new Set();
for (const [form, sets] of Object.entries(SETDEX)) {
  const ja = SPECIES[form];
  if (!ja) { missing.add(form); continue; }
  const list = [];
  for (const [label, s] of Object.entries(sets)) {
    const sp = {};
    for (const [k, v] of Object.entries(s.sps || {})) if (SP[k]) sp[SP[k]] = v;
    const moves = (s.moves || []).map(m => MOVE[m] || m);
    const natureJa = NAT[s.nature] || s.nature, itemJa = ITEM[s.item] || s.item;
    list.push({
      name: jaLabel(natureJa, sp, itemJa),
      label: label.replace(/^(BSS|OU|VGC 2026)\s*(Reg [A-Z-]+\s*)?/, '').trim() || label,
      source: source(label), form,
      nature: natureJa, sp,
      ability: ABIL[s.ability] || s.ability, item: itemJa, moves,
    });
  }
  // シングル向け(BSS)を先に。VGC(ダブル)は最後
  list.sort((a, b) => RANK[a.source] - RANK[b.source]);
  (out[ja] = out[ja] || []).push(...list);
  total += list.length;
}
for (const ja of Object.keys(out)) {
  // 同じ型がフォルム違いで重複して入っているので1つにまとめる(メガシンカ前の形を優先)
  const seen = new Map();
  for (const s of out[ja]) {
    const key = [s.source, s.label, s.item, s.moves.join(',')].join('|');
    const prev = seen.get(key);
    if (!prev || (/-Mega/.test(prev.form) && !/-Mega/.test(s.form))) seen.set(key, s);
  }
  out[ja] = [...seen.values()].sort((a, b) => RANK[a.source] - RANK[b.source]);
}
total = Object.values(out).reduce((n, l) => n + l.length, 0);
fs.writeFileSync(path.join(__dirname, '../data/sets.json'), JSON.stringify(out));
const bss = Object.values(out).filter(l => l.some(s => s.source === 'BSS')).length;
console.log(`ポケモン${Object.keys(out).length}種、型${total}個(シングル用の型があるのは${bss}種)`);
if (missing.size) console.log('名前が対応しない:', [...missing].join(', '));
