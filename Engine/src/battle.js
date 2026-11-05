// バトル状態の管理
//
// telop.js が作った出来事を順に受け取り、場・両側のポケモン・ダメージの記録を更新する。
// ダメージ記録はそのまま計算エンジンの入力に変換できる(toCalcInput)。

const telop = require('./telop.js');
const engine = require('./engine.js');
const {moveInfo} = require('./infer.js');

const STAT_JA = {atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ'};

function emptyMon(species) {
  return {
    species, form: undefined, mega: false,
    hpPercent: 100, hpCur: undefined, hpMax: undefined,
    boosts: {atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0},
    status: undefined, ability: undefined, item: undefined, itemRemoved: false,
    moves: [], movesThisSwitch: [], fainted: false,
  };
}

class Battle {
  /**
   * @param {object} opts
   *   party: 自分のパーティ(Data/party.json の members と同じ形)
   *   opponentTeam: 選出画面で判定した相手6匹の名前
   */
  constructor(opts = {}) {
    this.party = opts.party || [];
    this.opponentTeam = opts.opponentTeam || [];
    this.turn = 0;
    this.field = {weather: null, me: {stealthRock: false, spikes: 0}, opp: {stealthRock: false, spikes: 0}};
    this.sides = {me: {active: null, mons: {}, fainted: 0}, opp: {active: null, mons: {}, fainted: 0}};
    this.damageLog = [];
    this.current = null; // 今の行動(技 → ダメージ → 急所/相性の順に組み立てる)
    this.unknown = [];
    this.speedLog = [];   // 同じ優先度の技どうしで、どちらが先に動いたか
    this.pair = [];       // 今のターンに動いた側(先に動いた順)
  }

  // ---- 入力 ------------------------------------------------------------

  /** 画面から読んだ入力を1つ受け取る({kind:'telop', text} など。telop.js 参照) */
  feed(input) {
    for (const ev of telop.parse(input)) this.apply(ev);
    return this;
  }

  feedAll(inputs) {
    for (const i of inputs) this.feed(i);
    return this;
  }

  // ---- 状態の更新 -------------------------------------------------------

  sideOf(species, hint) {
    if (hint) return hint;
    const mine = this.party.some(p => p.species === species);
    const theirs = this.opponentTeam.includes(species);
    if (mine && !theirs) return 'me';
    if (theirs && !mine) return 'opp';
    // 両方にいる場合は場に出ている方
    if (this.sides.opp.active === species) return 'opp';
    return 'me';
  }

  mon(side, species) {
    const s = this.sides[side];
    if (!species) species = s.active;
    if (!species) return null;
    if (!s.mons[species]) {
      const m = emptyMon(species);
      // 自分のポケモンは最大HPが分かっているので、満タンから始める
      const max = side === 'me' ? myMax(this.party, species) : undefined;
      if (max) { m.hpMax = max; m.hpCur = max; }
      s.mons[species] = m;
    }
    return s.mons[species];
  }

  setActive(side, species) {
    const s = this.sides[side];
    if (s.active && s.mons[s.active]) {
      // 交代でランクは元に戻る
      const old = s.mons[s.active];
      for (const k of Object.keys(old.boosts)) old.boosts[k] = 0;
    }
    s.active = species;
    this.mon(side, species).movesThisSwitch = [];
    this.pair = [];
  }

  closeAction() {
    this.current = null;
  }

  apply(ev) {
    switch (ev.type) {
      case 'turn':
        this.turn = ev.turn;
        this.closeAction();
        this.pair = [];
        break;

      case 'switchIn': {
        const side = ev.side || this.sideOf(ev.species);
        this.closeAction();
        // テロップと名前表示の両方から同じ交代が届くことがあるので、すでに場にいれば何もしない
        if (this.sides[side].active !== ev.species) this.setActive(side, ev.species);
        break;
      }
      case 'switchOut':
        this.closeAction();
        break;

      case 'weather':
        this.field.weather = ev.weather;
        break;

      case 'mega': {
        const m = this.mon(ev.side, ev.species);
        m.mega = true;
        const megaForm = engine.formsOf(ev.species).find(f => /-Mega/.test(f));
        if (megaForm) m.form = megaForm;
        break;
      }

      case 'abilityRevealed':
        this.mon(ev.side, ev.species).ability = ev.ability;
        break;

      case 'itemRevealed': {
        const m = this.mon(ev.side, ev.species);
        m.item = ev.item;
        if (ev.removed) { m.itemRemoved = true; }
        break;
      }

      case 'boost': {
        const m = this.mon(ev.side, ev.species);
        if (m && ev.stat in m.boosts) m.boosts[ev.stat] = Math.max(-6, Math.min(6, m.boosts[ev.stat] + ev.stages));
        break;
      }

      case 'status':
        if (ev.species) this.mon(ev.side, ev.species).status = ev.status;
        break;

      case 'move': {
        this.closeAction();
        const attacker = this.mon(ev.side, ev.species);
        if (!attacker.moves.includes(ev.move)) attacker.moves.push(ev.move);
        attacker.movesThisSwitch.push(ev.move);
        this.recordOrder(ev.side, ev.move);
        this.sides[ev.side].active = ev.species;
        const defSide = ev.side === 'me' ? 'opp' : 'me';
        const defender = this.mon(defSide);
        this.current = {
          turn: this.turn,
          attackerSide: ev.side,
          attacker: snapshot(attacker),
          defender: defender ? snapshot(defender) : null,
          move: ev.move,
          weather: this.field.weather,
          crit: false, effectiveness: undefined, missed: false,
          damage: null,
          myFaintedBefore: this.sides.me.fainted,
          oppFaintedBefore: this.sides.opp.fainted,
        };
        break;
      }

      case 'miss':
        if (this.current) this.current.missed = true;
        break;

      case 'crit':
        if (this.current) this.current.crit = true;
        break;

      case 'effectiveness':
        if (this.current) this.current.effectiveness = ev.value;
        break;

      case 'indirect':
        // 技以外のHP変化(反動・やけど・砂・ステルスロック・回復)。
        // 直後のHP表示を技のダメージとして数えないよう印を付ける
        if (ev.status) this.mon(ev.side, ev.species).status = ev.status;
        if (ev.cause === 'stealthRock') this.field[ev.side].stealthRock = true;
        if (this.current && this.current.damage) this.closeAction();
        this.pendingIndirect = {side: ev.side, species: ev.species};
        break;

      case 'hp':
        this.applyHp(ev);
        break;

      case 'faint': {
        const m = this.mon(ev.side, ev.species);
        m.fainted = true; m.hpPercent = 0;
        this.sides[ev.side].fainted += 1;
        break;
      }

      default:
        this.unknown.push(ev);
    }
  }

  /** 両方が同じ優先度の技を出したターンの、動いた順を記録する */
  recordOrder(side, move) {
    const prio = moveInfo(move).priority;
    if (this.pair.length >= 2 || this.pair.some(p => p.side === side)) this.pair = [];
    this.pair.push({side, prio});
    if (this.pair.length === 2 && this.pair[0].prio === this.pair[1].prio) {
      this.speedLog.push({turn: this.turn, first: this.pair[0].side,
        me: this.sides.me.active, opp: this.sides.opp.active});
    }
  }

  applyHp(ev) {
    const side = ev.side || this.sideOf(ev.species);
    const m = this.mon(side, ev.species);
    const before = {percent: m.hpPercent, cur: m.hpCur};

    if (ev.percent !== undefined) {
      if (ev.fromPercent !== undefined) before.percent = ev.fromPercent;
      m.hpPercent = ev.percent;
    }
    if (ev.cur !== undefined) {
      if (ev.fromCur !== undefined) before.cur = ev.fromCur;
      m.hpCur = ev.cur;
      if (ev.max) m.hpMax = ev.max;
      const max = m.hpMax || myMax(this.party, ev.species);
      if (max) { m.hpMax = max; m.hpPercent = Math.round(ev.cur / max * 100); if (before.cur !== undefined) before.percent = Math.round(before.cur / max * 100); }
    }

    // 技以外のダメージ直後のHP表示は記録しない
    if (this.pendingIndirect && this.pendingIndirect.species === ev.species && this.pendingIndirect.side === side) {
      this.pendingIndirect = null;
      return;
    }

    // 今の行動の防御側のHPが減ったら、それを技のダメージとして記録する
    const a = this.current;
    if (a && !a.damage && !a.missed && side !== a.attackerSide) {
      const dropPct = before.percent - m.hpPercent;
      if (dropPct > 0 || (before.cur !== undefined && m.hpCur < before.cur)) {
        if (!a.defender || a.defender.species !== ev.species) a.defender = snapshot(m, before);
        else a.defender.hpPercent = before.percent;
        a.damage = {
          fromPercent: before.percent, toPercent: m.hpPercent,
          fromCur: before.cur, toCur: m.hpCur, max: m.hpMax,
          percent: dropPct,
          hp: before.cur !== undefined && m.hpCur !== undefined ? before.cur - m.hpCur : undefined,
        };
        this.damageLog.push(a);
      }
    }
  }

  // ---- 出力 ------------------------------------------------------------

  /** 自分の場のポケモンのパーティ情報 */
  myMember(species) {
    return this.party.find(p => p.species === species);
  }

  /**
   * ダメージ記録を計算エンジンの入力に変換する。
   * 相手側の分からない部分(SP・性格・特性・持ち物)は defaults で補う。
   */
  toCalcInput(entry, defaults = {}) {
    const side = entry.attackerSide;
    const toPoke = (snap, isMine) => {
      const base = isMine ? this.myMember(snap.species) || {} : {};
      const p = {
        name: snap.species, form: snap.form,
        nature: base.nature, sp: base.sp, ability: snap.ability || base.ability,
        item: snap.itemRemoved ? undefined : (snap.item || base.item),
        status: snap.status, hpPercent: snap.hpPercent,
        boosts: Object.fromEntries(Object.entries(snap.boosts).filter(([k]) => STAT_JA[k]).map(([k, v]) => [STAT_JA[k], v])),
      };
      if (!isMine) Object.assign(p, Object.fromEntries(Object.entries(defaults).filter(([k]) => p[k] === undefined)));
      return p;
    };
    const fainted = side === 'me' ? entry.myFaintedBefore : entry.oppFaintedBefore;
    return {
      attacker: toPoke(entry.attacker, side === 'me'),
      defender: toPoke(entry.defender, side !== 'me'),
      move: entry.move,
      moveOptions: {isCrit: entry.crit, fainted},
      field: {weather: entry.weather || undefined},
    };
  }

  summary() {
    const show = side => {
      const s = this.sides[side];
      const m = s.active && s.mons[s.active];
      if (!m) return null;
      return {species: m.species, form: m.form, hpPercent: m.hpPercent, hpCur: m.hpCur, status: m.status,
        boosts: Object.fromEntries(Object.entries(m.boosts).filter(([, v]) => v !== 0)),
        ability: m.ability, item: m.itemRemoved ? `(${m.item} 消失)` : m.item, moves: m.moves};
    };
    return {turn: this.turn, weather: this.field.weather, me: show('me'), opp: show('opp'),
      myFainted: this.sides.me.fainted, oppFainted: this.sides.opp.fainted, damageRecords: this.damageLog.length};
  }
}

function snapshot(m, before) {
  return {
    species: m.species, form: m.form, mega: m.mega,
    hpPercent: before ? before.percent : m.hpPercent,
    boosts: Object.assign({}, m.boosts), status: m.status,
    ability: m.ability, item: m.item, itemRemoved: m.itemRemoved,
  };
}

function myMax(party, species) {
  const p = party.find(x => x.species === species);
  return p && p.stats ? p.stats.hp : undefined;
}

module.exports = {Battle};
