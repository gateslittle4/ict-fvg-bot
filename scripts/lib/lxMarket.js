// lxMarket.js - LX-MKT, préenregistré dans data/backtest-input/preregistration-lx-market-entry-2026-09-30.md : mêmes signaux que
// signalsLX (scripts/lib/esdrasMethod.js), mais l'entrée se fait AU MARCHÉ à l'ouverture qui suit une bougie M15 de rejet du niveau
// d'entrée, au lieu d'un ordre limite. Le règlement (stop d'abord, objectif dès la minute suivante, sortie 17 h NY, spread, swap) est
// celui de runOrder. `shift` (placebo) : la recherche du rejet commence `shift` bougies M15 plus tard, mêmes niveaux.
import { runOrder, MIN_RR, MAX_TRADES_PER_DAY } from './esdrasMethod.js';
import { dayKey, MIN } from './nightLab.js';

/** @returns {Array} trades { entryTime, fill, exitTime, exit, reason, risk, r, dir, tau, day, ... } */
export function executeMarket(X, sigs, { spread = () => 0, swap = () => 0, shift = () => 0 } = {}) {
  const { S, b15 } = X;
  const poseBar = new Map(); b15.forEach((b, k) => poseBar.set(b.i1 + 1, k));
  const trades = [], perDay = new Map();
  let busy = -Infinity;
  for (const s of sigs) {
    if (s.tau < busy) continue;
    const day = dayKey(s.tau);
    if ((perDay.get(day) || 0) >= MAX_TRADES_PER_DAY) continue;
    const jp = poseBar.get(s.i);
    if (jp === undefined) continue;
    const { entry: E, stop } = s.plan[0], buy = s.dir > 0, sp = spread(E);
    busy = s.tau;
    const limit = Math.min(s.expiry, s.exitAt);
    let entered = false;
    for (let k = jp + shift(s) + 1; k < b15.length; k++) {
      const b = b15[k];
      if (S.t[b.i1] + MIN >= limit) { busy = Math.max(busy, limit); break; }
      if (buy ? b.h >= s.target : b.l + sp <= s.target) { busy = Math.max(busy, S.t[b.i1] + MIN); break; } // objectif touché avant l'entrée
      if (buy ? b.c <= stop : b.c + sp >= stop) { busy = Math.max(busy, S.t[b.i1] + MIN); break; } // setup invalidé
      const rejected = buy ? b.l + sp <= E && b.c > E : b.h >= E && b.c < E;
      if (!rejected) continue;
      const i = b.i1 + 1;
      if (i >= S.n || S.t[i] >= limit) break;
      const px = S.o[i] + (buy ? sp : 0);
      if (buy ? px <= stop || px >= s.target : px >= stop || px <= s.target) break;
      if (Math.abs(s.target - px) / Math.abs(px - stop) < MIN_RR) break;
      const r = runOrder(S, { dir: s.dir, i, entry: buy ? Infinity : -Infinity, stop, target: s.target, expiry: s.exitAt, exitAt: s.exitAt, spread: sp, swap });
      if (r.missed) break;
      perDay.set(day, (perDay.get(day) || 0) + 1);
      trades.push({ ...r, dir: s.dir, tau: s.tau, day, target: s.target, f: { ...s.f }, plannedRR: Math.abs(s.target - r.fill) / Math.abs(r.fill - stop) });
      busy = Math.max(busy, r.exitTime);
      entered = true;
      break;
    }
    void entered;
  }
  return trades;
}
