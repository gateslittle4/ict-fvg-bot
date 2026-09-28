// Descriptif, exploration 2011-2018 : « un FVG M15 non comblé devant le prix sert de cible ». Sa règle (C forme le FVG, D reste dehors,
// limite au bord, stop sous la mèche de A), heures 6 h-11 h et 19 h-23 h NY. On cherche au moment de décider le FVG M15 non comblé le
// plus proche dans le sens du trade (au-dessus pour un achat). (1) avec cible vs sans cible, à 3R ; (2) objectif = ce FVG, comparé au même
// objectif en R sur les cas SANS FVG cible (placebo) : le prix atteint-il plus souvent un vrai FVG qu'un niveau quelconque ?
import { loadPhase, spreadAt, swapCost, simulate, nyMin, stats, sgn, MIN } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { nextNyTime } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';
const inHours = (m) => (m >= 360 && m < 660) || (m >= 1140 && m < 1380);
let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (const sym of ['US100', 'US500']) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S), b15 = X.b15, F = X.fvg[0];
  const withT = [], without = [], magnetR = [], magnetMult = [];
  const cases = [];
  for (let q = 0; q < F.length; q++) {
    const z = F[q], k = z.k, j = k + 1; if (j >= b15.length - 1 || k < 3) continue;
    const D = b15[j], tau = D.t + 15 * MIN; if (tau < eng(2011)) continue;
    const fm = nyMin(b15[k].t + 15 * MIN); if (!inHours(fm) || !inHours(nyMin(tau))) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue;
    const i = b15[j].i1 + 1; if (i >= S.n || S.t[i] - tau > 5 * MIN) continue;
    const L = z.dir > 0 ? z.top : z.bot, A = b15[k - 2], stop = z.dir > 0 ? A.l : A.h, risk = Math.abs(L - stop); if (!(risk > 0)) continue;
    // FVG M15 non comblés (formés dans les 200 bougies avant, jamais retouchés à j) dans le sens du trade, au-delà du prix
    let best = null;
    for (let p = q - 1; p >= 0 && F[p].k > k - 200; p--) {
      const y = F[p]; if (y.touch <= j || y.dead <= j) continue;
      const edge = z.dir > 0 ? y.bot : y.top; // bord le plus proche vu d'en dessous (achat) / d'au-dessus (vente)
      if (z.dir > 0 ? edge <= D.c : edge >= D.c) continue;
      const dist = Math.abs(edge - L); if (!best || dist < best.dist) best = { edge, dist };
    }
    const exitAt = fm >= 1140 ? nextNyTime(tau, 180) : nextNyTime(tau, 960);
    cases.push({ z, i, L, stop, risk, best, exitAt });
  }
  const run = (c, rr) => simulate(S, { dir: c.z.dir, i: c.i, entry: { type: 'limit', price: c.L }, expiry: c.exitAt, stop: c.stop, rr, target: c.L + c.z.dir * rr * c.risk, cancelIfTarget: true, exitAt: c.exitAt, spread: spreadAt(sym, c.L), swap: swapCost(sym) });
  for (const c of cases) { const r = run(c, 3); if (!r.missed) (c.best ? withT : without).push(r); }
  // objectif = le FVG cible (au moins 1R), et placebo : même multiple de R sur un cas sans cible tiré au hasard
  const noT = cases.filter((c) => !c.best);
  const hitReal = [], hitFake = [], rReal = [], rFake = [];
  for (const c of cases.filter((c) => c.best)) {
    const m = c.best.dist / c.risk; if (m < 1 || m > 8) continue;
    const r = run(c, m); if (!r.missed) { rReal.push(r); hitReal.push(r.reason === 'target' ? 1 : 0); }
    const f = noT[Math.floor(rnd() * noT.length)], r2 = run(f, m); if (!r2.missed) { rFake.push(r2); hitFake.push(r2.reason === 'target' ? 1 : 0); }
  }
  const pc = (a) => Math.round(100 * a.reduce((s, x) => s + x, 0) / a.length);
  const a = stats(withT), b = stats(without), c1 = stats(rReal), c2 = stats(rFake);
  console.log(`--- ${sym} (2011-2018)\n  3R, AVEC un FVG M15 non comblé devant : ${a.n} trades ${sgn(a.mean, 3)} R (t ${a.t.toFixed(2)}) | SANS : ${b.n} trades ${sgn(b.mean, 3)} R (t ${b.t.toFixed(2)})`);
  console.log(`  Objectif = le FVG cible (1 à 8R) : atteint ${pc(hitReal)} % des fois, ${sgn(c1.mean, 3)} R/trade (${c1.n}) | même objectif en R sans FVG (hasard) : atteint ${pc(hitFake)} %, ${sgn(c2.mean, 3)} R/trade (${c2.n})`);
}
