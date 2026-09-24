// intradayMomentumEngine.js - A (cassure de la bougie d'ouverture de 5 min, US100) et B (« noise area », US500) en direct
// (2026-09-24, décision d'Esdras : « mets-le dans le même compte, il faut que tout soit enregistré au même endroit »).
//
// Règles : data/backtest-input/preregistration-intraday-momentum-2026-09-23.md, EXACTEMENT les fonctions de décision de l'étude
// (src/backtest/intradayMomentum.js : orbSetup, noiseCheck, noiseDecision, dailyVol) - ce moteur ne fait que les appeler au bon moment
// sur des barres M1 (bid, ms UTC) reçues une par une :
//   A : quand la barre de 9:34 NY est finie (ou la première barre après) -> 'entry' dans le sens de la bougie 9:30-9:35, stop à son extrême
//       opposé (l'objectif 10R et la taille sont posés à l'exécution, sur le vrai prix d'entrée) ; sortie forcée à la clôture (15:59).
//   B : à chaque contrôle 10:00, 10:30, ..., 15:30 (barre k = 29, 59, ...) -> 'exit' et/ou 'entry' selon noiseDecision ; sortie à 15:59.
// Le moteur tient une position VIRTUELLE par stratégie (comme l'étude) ; l'exécution réelle (cTraderDataSource) peut échouer ou être
// bloquée - une sortie sans position réelle est simplement ignorée par l'appelant.
import { buildSessions, orbSetup, noiseCheck, noiseDecision, dailyVol, nyOffsetMs, NOISE_CHECKS, MIN, DAY, SESSION_MINUTES } from './backtest/intradayMomentum.js';

export const ORB_STRATEGY = 'orb5';
export const NOISE_STRATEGY = 'noise';
const OPEN_MINUTE = 9 * 60 + 30;
// Une décision n'est exécutée que si elle tombe au plus tard STALE_MINUTES après sa minute prévue (A : 9:34 ; B : chaque contrôle).
// Au-delà (bot redémarré en pleine séance, trou de données) elle est seulement appliquée à la position virtuelle, sans événement :
// jamais d'entrée à 11:00 sur la bougie de 9:30, ni sur un contrôle de B vieux d'une heure.
const STALE_MINUTES = 5;

/** Jour de New York (jours depuis l'époque) et minute de séance (0 = 9:30) d'un instant UTC. */
export function nySessionPosition(utc) {
  const local = utc + nyOffsetMs(utc);
  const dayNum = Math.floor(local / DAY);
  return { dayNum, k: Math.floor((local - dayNum * DAY) / MIN) - OPEN_MINUTE };
}

export class IntradayMomentumEngine {
  /**
   * @param {object} [opts]
   * @param {string[]} [opts.orbSymbols=['US100']]
   * @param {string[]} [opts.noiseSymbols=['US500']]
   * @param {number} [opts.lookback=14] - séances de référence de B (et de la volatilité journalière)
   * @param {number} [opts.keepDays=40] - séances gardées en mémoire
   */
  constructor({ orbSymbols = ['US100'], noiseSymbols = ['US500'], lookback = 14, keepDays = 40 } = {}) {
    this.orbSymbols = new Set(orbSymbols);
    this.noiseSymbols = new Set(noiseSymbols);
    this.lookback = lookback;
    this.keepMs = keepDays * 1.5 * DAY;
    this.bars = new Map(); // symbol -> { t, o, h, l, c } (barres de séance seulement, triées)
    this.state = new Map(); // symbol -> { dayNum, orbDecided, orbOpen, noisePos, checksDone:Set }
  }

  get symbols() { return [...new Set([...this.orbSymbols, ...this.noiseSymbols])]; }

  _buf(symbol) {
    if (!this.bars.has(symbol)) this.bars.set(symbol, { t: [], o: [], h: [], l: [], c: [] });
    return this.bars.get(symbol);
  }

  _st(symbol) {
    if (!this.state.has(symbol)) this.state.set(symbol, { dayNum: null, orbDecided: false, orbOpen: null, noisePos: null, checksDone: new Set() });
    return this.state.get(symbol);
  }

  /** Ajoute une barre au tampon (séance 9:30-16:00 seulement ; une barre déjà connue est remplacée). Retourne sa position de séance, ou null. */
  _push(symbol, bar) {
    const pos = nySessionPosition(bar.time);
    if (pos.k < 0 || pos.k >= SESSION_MINUTES) return null;
    const b = this._buf(symbol), n = b.t.length;
    if (n && bar.time <= b.t[n - 1]) {
      const i = b.t.lastIndexOf(bar.time);
      if (i >= 0) { b.o[i] = bar.open; b.h[i] = bar.high; b.l[i] = bar.low; b.c[i] = bar.close; }
      return null; // barre ancienne ou doublon : jamais une nouvelle décision
    }
    b.t.push(bar.time); b.o.push(bar.open); b.h.push(bar.high); b.l.push(bar.low); b.c.push(bar.close);
    const cut = bar.time - this.keepMs;
    let drop = 0; while (drop < b.t.length && b.t[drop] < cut) drop++;
    if (drop) for (const key of ['t', 'o', 'h', 'l', 'c']) b[key].splice(0, drop);
    return pos;
  }

  /** Historique (préchauffage) : barres M1 triées ou non, sans aucune décision. */
  addBars(symbol, bars) {
    for (const bar of [...bars].sort((a, b) => a.time - b.time)) this._push(symbol, bar);
  }

  _sessions(symbol) {
    const b = this._buf(symbol);
    return buildSessions({ ...b, n: b.t.length });
  }

  _newDay(st, dayNum) {
    st.dayNum = dayNum; st.orbDecided = false; st.orbOpen = null; st.noisePos = null; st.checksDone = new Set();
  }

  /** Sorties de fin de séance (positions virtuelles encore ouvertes). */
  _closeAll(symbol, st, time) {
    const out = [];
    if (st.orbOpen) { out.push({ type: 'exit', strategy: ORB_STRATEGY, symbol, side: st.orbOpen.long ? 'buy' : 'sell', reason: 'close', time }); st.orbOpen = null; }
    if (st.noisePos) { out.push({ type: 'exit', strategy: NOISE_STRATEGY, symbol, side: st.noisePos.long ? 'buy' : 'sell', reason: 'close', time }); st.noisePos = null; }
    return out;
  }

  /** Une nouvelle barre M1 FINIE. Retourne les événements { type: 'entry'|'exit', strategy, symbol, side, ... }. */
  ingestBar(symbol, bar) {
    const pos = this._push(symbol, bar);
    if (!pos) return [];
    const st = this._st(symbol);
    const events = [];
    if (st.dayNum !== pos.dayNum) { events.push(...this._closeAll(symbol, st, bar.time)); this._newDay(st, pos.dayNum); }
    let days = null, i = -1;
    const today = () => {
      if (!days) { days = this._sessions(symbol); i = days.length - 1; if (i < 0 || days[i].dayNum !== pos.dayNum) i = -1; }
      return i;
    };
    // A : une seule décision par jour, dès que la bougie de 5 min (barres 9:30-9:34) est complète.
    if (this.orbSymbols.has(symbol) && !st.orbDecided && pos.k >= 4) {
      st.orbDecided = true;
      if (today() >= 0) {
        const setup = orbSetup(days[i]);
        if (setup) {
          // 2026-09-24 fix: a STALE decision (bot restarted mid-session) now also opens the VIRTUAL position, as the header says -
          // before, it was silently dropped, so the 15:59 exit of a real A position held across a restart was never emitted.
          if (pos.k - 4 <= STALE_MINUTES) events.push({ type: 'entry', strategy: ORB_STRATEGY, symbol, side: setup.long ? 'buy' : 'sell', stopPrice: setup.long ? setup.lo : setup.hi, rangeHigh: setup.hi, rangeLow: setup.lo, time: bar.time });
          st.orbOpen = { long: setup.long };
        }
      }
    }
    // B : chaque contrôle atteint (normalement un seul ; plusieurs si des barres manquent), dans l'ordre.
    if (this.noiseSymbols.has(symbol)) {
      for (const k of NOISE_CHECKS) {
        if (k > pos.k || st.checksDone.has(k)) continue;
        st.checksDone.add(k);
        if (today() < 0) continue;
        const check = noiseCheck(days, i, k, { lookback: this.lookback });
        if (!check) continue;
        const dec = noiseDecision(st.noisePos, check);
        const live = pos.k - k <= STALE_MINUTES;
        if (dec.exit) { if (live) events.push({ type: 'exit', strategy: NOISE_STRATEGY, symbol, side: st.noisePos.long ? 'buy' : 'sell', reason: 'noise', check: k, time: bar.time }); st.noisePos = null; }
        if (dec.enter) {
          const long = dec.enter === 'long';
          if (live) events.push({ type: 'entry', strategy: NOISE_STRATEGY, symbol, side: long ? 'buy' : 'sell', vol14: dailyVol(days, i, this.lookback), upper: check.ub, lower: check.lb, twap: check.twap, check: k, time: bar.time });
          st.noisePos = { long };
        }
      }
    }
    // Fin de séance : la barre de 15:59 est finie.
    if (pos.k >= SESSION_MINUTES - 1) events.push(...this._closeAll(symbol, st, bar.time));
    return events;
  }

  /** Horloge (aucune barre reçue) : ferme les positions virtuelles une fois 16:00 NY passé. */
  onClock(nowUtc) {
    const pos = nySessionPosition(nowUtc);
    const events = [];
    for (const [symbol, st] of this.state) {
      if (st.dayNum == null) continue;
      if (pos.dayNum > st.dayNum || (pos.dayNum === st.dayNum && pos.k >= SESSION_MINUTES)) events.push(...this._closeAll(symbol, st, nowUtc));
    }
    return events;
  }

  /** Nombre de séances complètes connues (le moteur B ne décide qu'avec au moins `lookback` séances précédentes). */
  sessionCount(symbol) { return this._sessions(symbol).length; }
}

/** Construit des barres M1 (bid) à partir des ticks : une barre est rendue quand sa minute est finie (tick suivant ou flush). */
export class TickBarBuilder {
  constructor() { this.cur = new Map(); }

  onTick(symbol, time, price) {
    if (!(price > 0)) return [];
    const minute = Math.floor(time / MIN) * MIN;
    const c = this.cur.get(symbol);
    if (c && c.time === minute) { if (price > c.high) c.high = price; if (price < c.low) c.low = price; c.close = price; return []; }
    const done = c && c.time < minute ? [c] : [];
    if (!c || c.time < minute) this.cur.set(symbol, { time: minute, open: price, high: price, low: price, close: price });
    return done.map((b) => ({ symbol, bar: b }));
  }

  /** Rend les barres dont la minute est terminée sans tick depuis. */
  flush(now) {
    const out = [];
    const minute = Math.floor(now / MIN) * MIN;
    for (const [symbol, c] of this.cur) if (c.time < minute) { out.push({ symbol, bar: c }); this.cur.delete(symbol); }
    return out;
  }
}
