// nyOpenSweepFvg.js - règles de data/backtest-input/preregistration-ny-open-sweep-fvg-2026-09-24.md (fonctions pures, testées dans
// test/nyOpenSweepFvg.test.js) : sweep de la nuit + déplacement à 9:30 + FVG, LIMIT au bord du FVG, cible liquidité ≥ 2R.
import { nyOffsetMs } from '../../src/backtest/intradayMomentum.js';

const MIN = 60000, DAY = 86400000;

/** Regroupe une série M1 ({t,o,h,l,c,n}, ms UTC, bid) par jour de New York : Map dayNum -> { m: minutes locales, t, o, h, l, c }. */
export function groupNyDays(S) {
  const days = new Map();
  for (let i = 0; i < S.n; i++) {
    const utc = S.t[i];
    const local = utc + nyOffsetMs(utc);
    const dayNum = Math.floor(local / DAY);
    const m = Math.floor((local - dayNum * DAY) / MIN);
    let d = days.get(dayNum);
    if (!d) { d = { dayNum, m: [], t: [], o: [], h: [], l: [], c: [] }; days.set(dayNum, d); }
    d.m.push(m); d.t.push(utc); d.o.push(S.o[i]); d.h.push(S.h[i]); d.l.push(S.l[i]); d.c.push(S.c[i]);
  }
  return days;
}

/** Plus haut / plus bas (et minute du plus bas / plus haut) des barres d'un jour dont la minute locale est dans [from, to). */
export function range(d, from, to) {
  let hi = -Infinity, lo = Infinity, hiM = null, loM = null, open = null, close = null, n = 0;
  if (!d) return null;
  for (let j = 0; j < d.m.length; j++) {
    const m = d.m[j];
    if (m < from || m >= to) continue;
    if (open === null) open = d.o[j];
    close = d.c[j]; n++;
    if (d.h[j] > hi) { hi = d.h[j]; hiM = m; }
    if (d.l[j] < lo) { lo = d.l[j]; loM = m; }
  }
  return n ? { hi, lo, hiM, loM, open, close, n } : null;
}

const H = (h, m = 0) => h * 60 + m;

/**
 * Le trade du jour `d` (null si aucun). `prev` = jour de New York précédent (Asie 20:00-23:59 et séance NY de la veille).
 * `spreadAt(prix)` = spread au niveau de prix.
 */
export function sweepFvgTrade(d, prev, spreadAt, { minRR = 2, minStopSpreads = 3, needSweep = true, needFloor = true, needBos = true } = {}) {
  const london = range(d, H(2), H(5)), pre = range(d, H(5), H(9, 30));
  const A = range(d, H(9, 15), H(9, 30)), B = range(d, H(9, 30), H(9, 45)), C = range(d, H(9, 45), H(10));
  if (!london || !pre || !A || !B || !C) return null;
  const asia = range(prev, H(20), H(24)), prevNy = range(prev, H(9, 30), H(16));
  let setup = null;
  // achat : plus bas de pré-ouverture sous Londres, fait avant 8:00, clôture de 9:30 au-dessus du plus haut de pré-ouverture, FVG haussier
  // variantes de l'amendement : chaque condition de contexte peut être désactivée (needSweep / needFloor / needBos)
  const bull = A.hi < C.lo, bear = A.lo > C.hi;
  if (bull && (!needSweep || pre.lo < london.lo) && (!needFloor || pre.loM < H(8)) && (!needBos || B.close > pre.hi)) {
    const levels = [asia?.hi, london.hi, prevNy?.hi].filter((x) => Number.isFinite(x));
    setup = { long: true, entry: C.lo, stop: B.lo, levels };
  } else if (bear && (!needSweep || pre.hi > london.hi) && (!needFloor || pre.hiM < H(8)) && (!needBos || B.close < pre.lo)) {
    const levels = [asia?.lo, london.lo, prevNy?.lo].filter((x) => Number.isFinite(x));
    setup = { long: false, entry: C.hi, stop: B.hi, levels };
  }
  if (!setup) return null;
  const { long, entry, stop } = setup;
  const R = long ? entry - stop : stop - entry;
  const s = spreadAt(entry);
  if (!(R > 0) || R < minStopSpreads * s) return null;
  const candidates = setup.levels.filter((x) => (long ? x - entry : entry - x) >= minRR * R);
  if (!candidates.length) return null;
  const target = long ? Math.min(...candidates) : Math.max(...candidates);
  // LIMIT actif 10:00-11:59 ; achat rempli quand l'ask touche (bid <= entrée - spread), vente quand le bid touche l'entrée
  let fill = -1;
  for (let j = 0; j < d.m.length; j++) {
    if (d.m[j] < H(10)) continue;
    if (d.m[j] >= H(12)) break;
    if (long ? d.l[j] <= entry - s : d.h[j] >= entry) { fill = j; break; }
  }
  if (fill < 0) return { ...setup, target, R, filled: false };
  // gestion minute par minute jusqu'à 15:59 (stop d'abord dans une même minute) ; achat sort au bid, vente à l'ask
  let exit = null, exitTime = null, reason = 'close', last = fill;
  for (let j = fill; j < d.m.length && d.m[j] < H(16); j++) {
    last = j;
    if (long ? d.l[j] <= stop : d.h[j] + s >= stop) {
      // une minute qui s'ouvre déjà au-delà du stop (trou) sort à son ouverture, sinon au stop
      exit = long ? (j > fill && d.o[j] < stop ? d.o[j] : stop) : (j > fill && d.o[j] + s > stop ? d.o[j] + s : stop);
      exitTime = d.t[j]; reason = 'stop'; break;
    }
    if (j > fill && (long ? d.h[j] >= target : d.l[j] + s <= target)) { exit = target; exitTime = d.t[j]; reason = 'target'; break; }
  }
  if (exit === null) { exit = long ? d.c[last] : d.c[last] + s; exitTime = d.t[last]; }
  const pnl = long ? exit - entry : entry - exit;
  return { ...setup, target, R, filled: true, entryTime: d.t[fill], exitTime, exit, reason, r: pnl / R, rr: Math.abs(target - entry) / R };
}
