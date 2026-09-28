// orbHold.js - variante de A de data/backtest-input/preregistration-orb-hold-next-day-2026-09-25.md (testée dans test/orbHold.test.js) :
// même entrée / stop / objectif que orbTrade, mais la position encore ouverte à 15:59 est gardée la nuit et fermée à 15:59 le lendemain.
import { orbTrade } from './intradayMomentum.js';

const MIN = 60000;
const firstAfter = (t, x) => { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] > x) hi = m; else lo = m + 1; } return lo; };

/**
 * @param d séance du jour (buildSessions), dNext séance suivante (ou null), S série M1 brute toutes heures ({t,o,h,l,c,n}, ms UTC, bid)
 * @param swapAt(fromUtc, toUtc, fill, long) swap par unité (négatif = coût)
 * @returns {{ base, hold } | null} base = A actuelle, hold = variante
 */
export function orbHoldNextDay(d, dNext, S, spreadAt, swapAt = () => 0) {
  const base = orbTrade(d, spreadAt);
  if (!base) return null;
  if (base.reason !== 'close' || !dNext) return { base, hold: base };
  const long = base.dir === 'buy';
  const { fill, stop, target, R } = base;
  const s = spreadAt(fill);
  const end = dNext.closeTime - MIN; // barre de 15:59 du lendemain
  let exit = null, exitTime = null, reason = 'close2', last = -1;
  for (let j = firstAfter(S.t, base.exitTime); j < S.n && S.t[j] <= end; j++) {
    const gapOpen = last < 0 || S.t[j] - S.t[last] > MIN; // première minute après une interruption (nuit, week-end)
    last = j;
    if (long ? S.l[j] <= stop : S.h[j] + s >= stop) {
      exit = long ? (gapOpen ? Math.min(S.o[j], stop) : stop) : (gapOpen ? Math.max(S.o[j] + s, stop) : stop);
      exitTime = S.t[j]; reason = 'stop'; break;
    }
    if (long ? S.h[j] >= target : S.l[j] + s <= target) { exit = target; exitTime = S.t[j]; reason = 'target'; break; }
  }
  if (exit === null) {
    if (last < 0) return { base, hold: base };
    exit = long ? S.c[last] : S.c[last] + s; exitTime = S.t[last];
  }
  const pnl = (long ? exit - fill : fill - exit) + swapAt(base.entryTime, exitTime, fill, long);
  return { base, hold: { ...base, exit, exitTime, reason, r: pnl / R } };
}
