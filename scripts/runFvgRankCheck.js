#!/usr/bin/env node
// runFvgRankCheck.js - descriptif, exploration 2011-2018 seulement : « je prenais le premier ou le deuxième FVG ». Règle d'Esdras v3
// (C forme le FVG, D reste dehors, limite au bord, stop sous la mèche de A, 3R, annulé si objectif avant ou en fin de séance). Rang du
// FVG valide dans sa séance (matin 3 h-11 h NY, soir 18 h-23 h NY), tous sens confondus et dans le même sens. Un FVG compte dans le rang
// qu'il soit rempli ou non (c'est ce qu'on voit sur le graphique).
import { loadPhase, spreadAt, swapCost, simulate, nyMin, dayKey, stats, sgn, MIN } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { nextNyTime } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';
const session = (m) => (m >= 180 && m < 660 ? 'matin' : m >= 1080 && m < 1380 ? 'soir' : null);
for (const sym of ['US100', 'US500']) {
  const S = loadPhase(sym, 'explore'), X = buildContext(S), b15 = X.b15;
  const count = new Map(), rows = [];
  for (const z of X.fvg[0]) {
    const k = z.k, j = k + 1; if (j >= b15.length - 1 || k < 3) continue;
    const D = b15[j], tau = D.t + 15 * MIN; if (tau < eng(2011)) continue;
    const fm = nyMin(b15[k].t + 15 * MIN), ses = session(fm); if (!ses) continue;
    if (z.dir > 0 ? D.l <= z.top : D.h >= z.bot) continue;
    const key = `${dayKey(tau)}:${ses}`, c = count.get(key) || { all: 0, 1: 0, [-1]: 0 };
    c.all++; c[z.dir]++; count.set(key, c);
    const i = b15[j].i1 + 1; if (i >= S.n || S.t[i] - tau > 5 * MIN) continue;
    const L = z.dir > 0 ? z.top : z.bot, A = b15[k - 2], stop = z.dir > 0 ? A.l : A.h, risk = Math.abs(L - stop); if (!(risk > 0)) continue;
    const exitAt = ses === 'soir' ? nextNyTime(tau, 180) : nextNyTime(tau, 960);
    const r = simulate(S, { dir: z.dir, i, entry: { type: 'limit', price: L }, expiry: exitAt, stop, rr: 3, target: L + z.dir * 3 * risk, cancelIfTarget: true, exitAt, spread: spreadAt(sym, L), swap: swapCost(sym) });
    if (r.missed) continue;
    rows.push({ ...r, ses, rankAll: c.all, rankDir: c[z.dir] });
  }
  const lab = (n) => (n >= 4 ? '4e et +' : `${n}${n === 1 ? 'er' : 'e'}`);
  console.log(`--- ${sym} (2011-2018, 3R, stop sous la mèche de A)`);
  for (const ses of ['matin', 'soir']) for (const [kind, key] of [['rang dans la séance', 'rankAll'], ['rang dans le même sens', 'rankDir']]) {
    const g = {}; for (const t of rows.filter((x) => x.ses === ses)) (g[lab(Math.min(4, t[key]))] ||= []).push(t);
    console.log(`  ${ses}, ${kind} : ` + Object.entries(g).sort().map(([l, a]) => { const s = stats(a); return `${l} ${sgn(s.mean, 3)} R (${s.n}, t ${s.t.toFixed(1)})`; }).join(' | '));
  }
}
