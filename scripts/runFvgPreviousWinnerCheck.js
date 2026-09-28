#!/usr/bin/env node
// runFvgPreviousWinnerCheck.js - descriptif, exploration 2011-2018 seulement : « si le FVG d'avant (même sens, 3-4 h avant) a marché, le
// suivant marche aussi ». Règle d'Esdras v3 (C forme le FVG, D reste dehors, limite au bord, stop sous la mèche de A, 3R, annulé si
// objectif avant ou à 16 h / 3 h NY), toutes heures sauf 11 h-18 h. Pour chaque cas, le dernier trade du MÊME SENS décidé dans les 5 h
// d'avant et DÉJÀ TERMINÉ au moment de décider (aucun regard vers le futur) : gagnant, perdant, ou aucun.
import { loadPhase, spreadAt, swapCost, simulate, nyMin, stats, sgn, MIN, HOUR } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { nextNyTime } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';
for (const sym of ['US100', 'US500']) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S), b15 = X.b15, done = [];
  for (const z of X.fvg[0]) {
    const k = z.k, j = k + 1; if (j >= b15.length - 1 || k < 3) continue;
    const D = b15[j], tau = D.t + 15 * MIN; if (tau < eng(2011)) continue;
    const fm = nyMin(b15[k].t + 15 * MIN); if (fm >= 660 && fm < 1080) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue;
    const i = b15[j].i1 + 1; if (i >= S.n || S.t[i] - tau > 5 * MIN) continue;
    const L = z.dir > 0 ? z.top : z.bot, A = b15[k - 2], stop = z.dir > 0 ? A.l : A.h, risk = Math.abs(L - stop); if (!(risk > 0)) continue;
    const exitAt = fm >= 1080 || fm < 180 ? nextNyTime(tau, 180) : nextNyTime(tau, 960);
    const r = simulate(S, { dir: z.dir, i, entry: { type: 'limit', price: L }, expiry: exitAt, stop, rr: 3, target: L + z.dir * 3 * risk, cancelIfTarget: true, exitAt, spread: spreadAt(sym, L), swap: swapCost(sym) });
    if (r.missed) continue;
    done.push({ ...r, dir: z.dir, tau });
  }
  const g = { 'Le précédent a GAGNÉ': [], 'Le précédent a PERDU': [], 'Aucun précédent terminé dans les 5 h': [] };
  for (const c of done) {
    let prev = null;
    for (const p of done) { if (p.tau >= c.tau) break; if (p.dir === c.dir && p.tau >= c.tau - 5 * HOUR && p.exitTime < c.tau && (!prev || p.tau > prev.tau)) prev = p; }
    g[!prev ? 'Aucun précédent terminé dans les 5 h' : prev.r > 0 ? 'Le précédent a GAGNÉ' : 'Le précédent a PERDU'].push(c);
  }
  console.log(`--- ${sym} (2011-2018, hors 11 h-18 h, 3R)`);
  for (const [l, a] of Object.entries(g)) { const s = stats(a), h1 = stats(a.filter((t) => t.entryTime < eng(2015))), h2 = stats(a.filter((t) => t.entryTime >= eng(2015))); console.log(`  ${l.padEnd(38)} ${String(s.n).padStart(5)} trades | gagnants ${Math.round(100 * s.win)} % | ${sgn(s.mean, 3)} R/trade | t ${s.t.toFixed(2)} | 2011-14 ${sgn(h1.mean, 3)} / 2015-18 ${sgn(h2.mean, 3)}`); }
}
