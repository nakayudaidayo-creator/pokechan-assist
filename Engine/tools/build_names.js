// PokeAPIの名前表とダメ計(Champions)のデータから、日本語名→英語名の対応表を作る
const fs = require('fs');
const path = require('path');
const [, , csvDir, bundlePath, outPath] = process.argv;
const c = require(path.resolve(bundlePath));
const g = c.Generations.get(0);
const toID = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function readCsv(file) {
  const lines = fs.readFileSync(path.join(csvDir, file), 'utf8').split('\n').slice(1);
  return lines.filter(Boolean).map(l => {
    const out = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out;
  });
}
function table(file) {
  const en = {}, ja = {};
  for (const [id, lang, name] of readCsv(file)) {
    if (lang === '9') en[id] = name;
    if (lang === '1') ja[id] = name.normalize('NFKC').replace(/\s+/g, '');
  }
  const m = {};
  for (const id of Object.keys(en)) if (ja[id]) m[toID(en[id])] = ja[id];
  return m;
}

const sp = table('pokemon_species_names.csv');
const mv = table('move_names.csv');
const ab = table('ability_names.csv');
const it = table('item_names.csv');

const out = {species: {}, moves: {}, abilities: {}, items: {}, missing: {species: [], moves: [], abilities: [], items: []}};

for (const s of g.species) {
  const base = s.baseSpecies || s.name.split('-')[0];
  const ja = sp[toID(base)] || sp[toID(s.name)] || sp[toID(s.name.split('-')[0])];
  if (!ja) { out.missing.species.push(s.name); continue; }
  (out.species[ja] = out.species[ja] || []).push(s.name);
}
for (const [kind, src, tbl] of [['moves', g.moves, mv], ['abilities', g.abilities, ab], ['items', g.items, it]]) {
  for (const x of src) {
    if (!x.name || x.name === '(No Move)') continue;
    const ja = tbl[toID(x.name)];
    if (ja) { out[kind][ja] = x.name; continue; }
    // 新しいメガストーン:「ポケモン名(末尾の長音を除く)+ナイト(+X/Y/Z)」で仮の日本語名を作る
    const ms = kind === 'items' && x.megaStone && Object.keys(x.megaStone)[0];
    if (ms) {
      const base = sp[toID(ms.split('-')[0])];
      if (base) {
        const suffix = (x.name.match(/ ([XYZ])$/) || [, ''])[1];
        const jaName = base.replace(/ー$/, '') + 'ナイト' + suffix;
        out[kind][jaName] = x.name; out.generated = out.generated || []; out.generated.push(jaName + '=' + x.name); continue;
      }
    }
    out.missing[kind].push(x.name);
  }
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
for (const k of ['species', 'moves', 'abilities', 'items']) {
  console.log(k, '対応', Object.keys(out[k]).length, '未対応', out.missing[k].length, out.missing[k].slice(0, 40).join(', '));
}
