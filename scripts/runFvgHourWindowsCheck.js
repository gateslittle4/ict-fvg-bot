// Descriptif, exploration 2011-2018 : sa règle (C forme le FVG, D reste hors de la zone, limite au bord, stop sous la mèche de A,
// 3R, annulé si objectif avant ou à 16 h NY) selon l'heure de formation du FVG : dans les 2 h après une ouverture ou pas.
import { loadPhase, spreadAt, swapCost, simulate, nyMin, stats, sgn, MIN } from './lib/nightLab.js';
import { eng } from './lib/m1Data.js';
import { buildContext } from './lib/fvgContext.js';
import { nextNyTime } from './lib/eyeRule.js';
const W = {
  'FVG formés 4h-6h (ceux que tu laisses)': [240, 360], 'Matin sans 4h-6h (3h-4h + 6h-11h)': [180, 240], 'Matin 6h-11h': [360, 660],
  'Soir 19h-23h': [1140, 1380], 'Tout le matin 3h-11h': [180, 660],
};
for (const sym of ['US100', 'US500']) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S), b15 = X.b15, res = {};
  for (const z of X.fvg[0]) {
    const k = z.k, j = k + 1; if (j >= b15.length - 1 || k < 3) continue;
    const D = b15[j], tau = D.t + 15 * MIN; if (tau < eng(2011)) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue;
    const fm = nyMin(b15[k].t + 15 * MIN);
    const lab = Object.entries(W).filter(([l, [a, b]]) => (fm >= a && fm < b) || (l.startsWith('Matin sans') && fm >= 360 && fm < 660)).map(([l]) => l); if (!lab.length) continue;
    const i = b15[j].i1 + 1; if (i >= S.n || S.t[i] - tau > 5 * MIN) continue;
    const L = z.dir > 0 ? z.top : z.bot, A = b15[k - 2], stop = z.dir > 0 ? A.l : A.h;
    const target = L + z.dir * 3 * Math.abs(L - stop), exitAt = fm >= 1080 ? nextNyTime(tau, 180) : nextNyTime(tau, 960);
    const r = simulate(S, { dir: z.dir, i, entry: { type: 'limit', price: L }, expiry: exitAt, stop, rr: 3, target, cancelIfTarget: true, exitAt, spread: spreadAt(sym, L), swap: swapCost(sym) });
    if (r.missed) continue;
    for (const l of lab) (res[l] ||= []).push(r);
  }
  console.log(`--- ${sym} (2011-2018, sa règle, stop sous la mèche de A, 3R)`);
  for (const l of Object.keys(W)) { const a = res[l] || [], s = stats(a), h1 = stats(a.filter((t) => t.entryTime < eng(2015))), h2 = stats(a.filter((t) => t.entryTime >= eng(2015))); console.log(`  ${l.padEnd(34)} ${String(s.n).padStart(5)} trades | ${sgn(s.mean, 3)} R/trade | t ${s.t.toFixed(2).padStart(5)} | 2011-14 ${sgn(h1.mean, 3)} / 2015-18 ${sgn(h2.mean, 3)}`); }
}
