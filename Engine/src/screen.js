// 画面の文字認識の結果から、バトル状態への入力を作る
//
// iPhone 側(Swift)は画面全体を文字認識して、文字とその位置をそのまま渡すだけ。
// どの位置の文字が「相手の名前」「HP」「テロップ」なのかは、ここで判断する。
// こうしておくと、ゲームの画面が少し変わっても GitHub の更新だけで直せる。
//
// 入力:observations = [{text, x, y, w, h, conf}]  座標は画面(横向き)の左上を0、右下を1とした割合

const NAMES = require('../data/names.json');
const telop = require('./telop.js');

const norm = s => String(s || '').normalize('NFKC').replace(/[\s　]+/g, '');
const SPECIES = Object.keys(NAMES.species);

// 画面のどこに何が出るか(横向き画面に対する割合)。ゲームの画面が変わったらここを直す
const LAYOUT = {
  oppBox: {x0: 0.62, x1: 1.0, y0: 0.0, y1: 0.24},      // 右上:相手の名前・HP%
  myBox: {x0: 0.0, x1: 0.40, y0: 0.76, y1: 1.0},        // 左下:自分の名前・HP
  telop: {x0: 0.08, x1: 0.70, y0: 0.62, y1: 0.87},      // 下:テロップ(自分の名前欄の上まで)
  bannerMe: {x0: 0.0, x1: 0.40, y0: 0.30, y1: 0.52},    // 左:自分の特性・持ち物の帯
  bannerOpp: {x0: 0.60, x1: 1.0, y0: 0.30, y1: 0.52},   // 右:相手の特性・持ち物の帯
};

// 画面に常に出ていて、テロップや帯と間違えやすい文字
const UI_WORDS = /^(ログを見る|様子を見る|COMMAND|たたかう|ポケモン|戻る|\d+|[+XYABLR]|\d{1,2}:\d{2})$/;

function inBox(o, b) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  return cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
}

/** 上から順に並べて1つの文にする。ふりがな(小さい文字)は捨てる */
function joinLines(obs) {
  if (!obs.length) return '';
  const maxH = Math.max(...obs.map(o => o.h));
  // ふりがな(小さい文字)、画面の決まった文字、名前欄のポケモン名だけの文字は捨てる
  const big = obs.filter(o => o.h >= maxH * 0.6 && !UI_WORDS.test(norm(o.text)) && !NAMES.species[norm(o.text).replace(/[♂♀]/g, '')]);
  big.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return big.map(o => o.text).join(' ').trim();
}

/** 文字認識のゆれを許して、ポケモン名を探す */
function findSpecies(texts) {
  for (const t of texts) {
    const n = norm(t).replace(/[♂♀]/g, '');
    if (NAMES.species[n]) return n;
  }
  for (const t of texts) {
    const n = norm(t).replace(/[♂♀]/g, '');
    if (n.length < 2) continue;
    // 1文字違いまでを同じとみなす(長い名前から)
    let best = null;
    for (const s of SPECIES) {
      if (Math.abs(s.length - n.length) > 1) continue;
      if (editDistance(s, n) <= 1 && (!best || s.length > best.length)) best = s;
    }
    if (best) return best;
  }
  return null;
}

function editDistance(a, b) {
  const d = Array.from({length: a.length + 1}, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/**
 * 選出画面の左側から、自分が選んだポケモンを選んだ順に読む。
 * 選んだポケモンの欄の左に、大きな数字(1・2・3)が出る
 */
function readSelection(obs) {
  const names = [];
  for (const o of obs) {
    if (o.x > 0.33) continue;
    const n = findSpecies([o.text]);
    if (n) names.push({name: n, cy: o.y + o.h / 2});
  }
  const picks = [];
  for (const o of obs) {
    const t = norm(o.text);
    if (o.x > 0.08 || !/^[123]$/.test(t)) continue;
    const cy = o.y + o.h / 2;
    let best = null;
    for (const n of names) {
      const dy = Math.abs(n.cy - cy);
      if (dy < 0.06 && (!best || dy < best.dy)) best = {name: n.name, dy};
    }
    if (best) picks.push({order: +t, name: best.name});
  }
  picks.sort((a, b) => a.order - b.order);
  return [...new Set(picks.map(p => p.name))];
}

class ScreenReader {
  constructor() {
    this.reset();
  }

  reset() {
    this.lastTelop = null;     // 最後に渡したテロップ
    this.lastBanner = {me: null, opp: null};
    this.hp = {me: {shown: null, seen: null, count: 0}, opp: {shown: null, seen: null, count: 0}};
    this.active = {me: null, opp: null};
    this.mode = 'unknown';
  }

  /**
   * @param {Array} observations 文字認識の結果
   * @returns {{mode: string, inputs: Array, newBattle: boolean, debug: object}}
   */
  read(observations) {
    const obs = (observations || []).filter(o => o && o.text && norm(o.text));
    const texts = obs.map(o => norm(o.text));
    const all = texts.join('');
    const inputs = [];
    let newBattle = false;

    // 選出画面:新しい対戦の始まり
    if (/選出してください/.test(all) || (/戦うポケモン/.test(all) && /選出/.test(all))) {
      if (this.mode !== 'select') newBattle = true;
      this.mode = 'select';
      this.reset();
      this.mode = 'select';
      const selection = readSelection(obs);
      return {mode: 'select', inputs, newBattle, selection, debug: {selection}};
    }

    // ログ画面:「ターン N」が見出しにある
    const turnObs = obs.find(o => /^ターン\d+$/.test(norm(o.text)) && o.y < 0.15);
    if (turnObs) {
      this.mode = 'log';
      return {mode: 'log', inputs, newBattle, debug: {turn: norm(turnObs.text)}};
    }

    this.mode = 'battle';
    const pick = box => obs.filter(o => inBox(o, box));

    // 相手:名前とHP%
    const oppObs = pick(LAYOUT.oppBox);
    const oppName = findSpecies(oppObs.map(o => o.text));
    if (oppName && oppName !== this.active.opp) {
      this.active.opp = oppName;
      this.hp.opp = {shown: null, seen: null, count: 0};
      inputs.push({kind: 'switch', side: 'opp', name: oppName});
    }
    const pct = oppObs.map(o => norm(o.text).match(/^(\d{1,3})%$/)).find(Boolean);
    if (pct && this.active.opp) {
      const v = Math.min(100, +pct[1]);
      if (this.stable('opp', v)) inputs.push({kind: 'hp', side: 'opp', name: this.active.opp, percent: v});
    }

    // 自分:名前とHP(残り/最大)
    const myObs = pick(LAYOUT.myBox);
    const myName = findSpecies(myObs.map(o => o.text));
    if (myName && myName !== this.active.me) {
      this.active.me = myName;
      this.hp.me = {shown: null, seen: null, count: 0};
      inputs.push({kind: 'switch', side: 'me', name: myName});
    }
    const hpText = myObs.map(o => norm(o.text)).join('');
    const hp = hpText.match(/(\d{1,3})\/(\d{2,3})/);
    if (hp && this.active.me) {
      const cur = +hp[1], max = +hp[2];
      if (cur <= max && this.stable('me', cur)) inputs.push({kind: 'hp', side: 'me', name: this.active.me, cur, max});
    }

    // 特性・持ち物の帯
    for (const side of ['me', 'opp']) {
      const text = joinLines(pick(side === 'me' ? LAYOUT.bannerMe : LAYOUT.bannerOpp));
      if (text && text !== this.lastBanner[side] && /の/.test(text)) {
        const ev = telop.parseBanner(side, text)[0];
        if (ev && ev.type !== 'unknown') {
          this.lastBanner[side] = text;
          inputs.push({kind: 'banner', side, text});
        }
      } else if (!text) {
        this.lastBanner[side] = null;
      }
    }

    // テロップ:読める文になってから1回だけ渡す(途中まで表示された文は待つ)
    const tText = joinLines(pick(LAYOUT.telop));
    if (!tText) {
      this.lastTelop = null;
    } else if (norm(tText) !== this.lastTelop) {
      const ev = telop.parseTelop(tText)[0];
      if (ev && ev.type !== 'unknown') {
        this.lastTelop = norm(tText);
        inputs.push({kind: 'telop', text: tText});
      }
    }

    return {mode: 'battle', inputs, newBattle, debug: {oppName, myName, telop: tText}};
  }

  /** HPの数字が2回続けて同じになったら確定(減っていく途中は読まない) */
  stable(side, v) {
    const h = this.hp[side];
    if (h.seen === v) h.count += 1; else { h.seen = v; h.count = 1; }
    if (h.count >= 2 && h.shown !== v) {
      h.shown = v;
      return true;
    }
    return false;
  }
}

module.exports = {ScreenReader, LAYOUT, findSpecies, joinLines, readSelection};
