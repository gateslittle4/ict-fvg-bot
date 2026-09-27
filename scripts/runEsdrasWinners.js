#!/usr/bin/env node
// runEsdrasWinners.js - ce que les trades gagnants de la méthode d'Esdras (C1) ont en commun, en exploration seulement (US100 2011-2018).
// Descriptif : chaque caractéristique est connue au moment du signal ; pour chaque tranche, R moyen et écart au reste (t de Welch).
// Avec une vingtaine de comparaisons, un t de 2 arrive souvent par hasard : une piste doit ensuite être testée ailleurs (US500).
// Usage : node --max-old-space-size=12000 scripts/runEsdrasWinners.js [US100|US500] [explore]
import fs from 'node:fs';
import { loadPhase, spreadAt, swapCost, nyMin, dayKey, dayOfWeek, lastDoneBar, inBlocks, PHASES, MIN } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, bmsOf, signals, execute } from './lib/esdrasMethod.js';

const SYM = process.argv[2] || 'US100', phase = process.argv[3] || 'explore', P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S);
const bias = h4Bias(X), bms = m15Bms(X), daily = bmsOf(S, X.bD);
const trades = execute(X, signals(X, bias, bms), { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) }).filter((t) => inBlocks(t.entryTime, P.count));
const lower = (t) => { let lo = 0, hi = S.n; while (lo < hi) { const m = (lo + hi) >> 1; if (S.t[m] < t) lo = m + 1; else hi = m; } return lo; };
const dStart = new Map(); for (let d = 0; d < X.bD.length; d++) dStart.set(dayKey(X.bD[d].t), d);
let dq = 0;
for (const t of trades) {
  const i = lower(t.tau), dIdx = dStart.get(dayKey(t.tau)), day = X.bD[dIdx], prev = X.bD[dIdx - 1];
  let hi = -Infinity, lo = Infinity; for (let x = day.i0; x < i; x++) { hi = Math.max(hi, S.h[x]); lo = Math.min(lo, S.l[x]); }
  const E = t.fill, pos = hi > lo ? (t.dir > 0 ? (E - lo) / (hi - lo) : (hi - E) / (hi - lo)) : 0.5;
  while (dq < daily.length && daily[dq].t <= t.tau) dq++;
  const dDir = dq ? daily[dq - 1].dir : 0;
  const jd = lastDoneBar(X.bD, i), atrD = X.atrD[jd];
  let m60 = 0, c = 0; for (let k = Math.max(15, jd - 59); k <= jd; k++) if (X.atrD[k]) { m60 += X.atrD[k]; c++; }
  Object.assign(t.f, {
    fenêtre: t.win === 0 ? 'matin' : 'soir', sens: t.dir > 0 ? 'achat' : 'vente', jour: ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dayOfWeek(t.tau)],
    heure: `${String(Math.floor(nyMin(t.tau) / 60)).padStart(2, '0')} h`, ordre: t.step === 1 ? '1er' : '2e',
    posJour: pos, liquiditéVeille: prev ? ((t.dir > 0 ? lo < prev.l : hi > prev.h) ? 'prise' : 'intacte') : null,
    daily: dDir === t.dir ? 'avec' : dDir === -t.dir ? 'contre' : null, volatilité: c && atrD ? atrD / (m60 / c) : null, rrPrévu: t.plannedRR,
  });
}
const cuts = {
  biasAgeH: [8, 24, 72], bmsAgeMin: [30, 120, 480], zoneAtr: [0.1, 0.25, 0.5], targetAtr: [1, 2, 4], posJour: [0.25, 0.5, 0.75], volatilité: [0.8, 1.2], rrPrévu: [4, 6, 10],
};
const bucket = (k, v) => { if (v == null || Number.isNaN(v)) return null; const c = cuts[k]; if (!c) return String(v); let b = 0; while (b < c.length && v >= c[b]) b++; return b === 0 ? `< ${c[0]}` : b === c.length ? `≥ ${c[c.length - 1]}` : `${c[b - 1]}–${c[b]}`; };
const ms = (v) => { const n = v.length, m = v.reduce((a, x) => a + x, 0) / n; const s2 = n > 1 ? v.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1) : 0; return { n, m, s2 }; };
const rows = [];
for (const k of Object.keys(trades[0].f)) {
  const groups = new Map(); for (const t of trades) { const b = bucket(k, t.f[k]); if (b === null) continue; (groups.get(b) || groups.set(b, []).get(b)).push(t); }
  for (const [b, list] of groups) {
    if (list.length < 30) continue;
    const inR = ms(list.map((t) => t.r)), out = ms(trades.filter((t) => !list.includes(t)).map((t) => t.r));
    const tw = (inR.m - out.m) / Math.sqrt(inR.s2 / inR.n + out.s2 / out.n);
    rows.push({ k, b, n: inR.n, win: list.filter((t) => t.r > 0).length / list.length, m: inR.m, sum: inR.m * inR.n, tw });
  }
}
rows.sort((a, c) => Math.abs(c.tw) - Math.abs(a.tw));
const all = ms(trades.map((t) => t.r)), lines = [`# Ce que les gagnants de la méthode d'Esdras ont en commun : ${SYM} ${phase}`, '', `${trades.length} trades C1, R moyen ${all.m.toFixed(3)}, ${(100 * trades.filter((t) => t.r > 0).length / trades.length).toFixed(0)} % de gagnants. Tranches d'au moins 30 trades, triées par écart au reste (t de Welch).`, '', '| Caractéristique | Tranche | Trades | Gagnants | R moyen | Total R | t (écart au reste) |', '|---|---|---|---|---|---|---|'];
for (const r of rows) lines.push(`| ${r.k} | ${r.b} | ${r.n} | ${(100 * r.win).toFixed(0)} % | ${r.m >= 0 ? '+' : ''}${r.m.toFixed(3)} | ${r.sum >= 0 ? '+' : ''}${r.sum.toFixed(1)} | ${r.tw.toFixed(2)} |`);
console.log(lines.slice(0, 30).join('\n'));
fs.writeFileSync(`data/backtest-input/esdras-winners-${SYM}-${phase}.md`, lines.join('\n') + '\n');
