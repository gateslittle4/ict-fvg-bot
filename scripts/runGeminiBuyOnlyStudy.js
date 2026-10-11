#!/usr/bin/env node
// runGeminiBuyOnlyStudy.js - test pré-enregistré dans data/backtest-input/preregistration-gemini-buyonly-2026-09-30.md (commité avant
// ce calcul) : règle de Gemini (scripts/lib/geminiFvg.js), ACHATS SEULEMENT, comparée à un placebo (achat à une bougie au hasard de la
// même année, mêmes fractions de stop et de cible). Mêmes données et règlement que scripts/runGeminiFvgStudy.js.
// Usage : node --max-old-space-size=6144 scripts/runGeminiBuyOnlyStudy.js [--dry] -> data/backtest-input/gemini-buyonly-study.md
import fs from 'node:fs';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { eng, readCsvGz, toM15, refPrice, swapPerUnit } from './lib/m1Data.js';
import { manage } from './lib/stopOrderEntry.js';
import { geminiSignals } from './lib/geminiFvg.js';

const DRY = process.argv.includes('--dry');
const SYMS = ['US100', 'US500'];
const DRAWS = 100;
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: eng(2010), to: eng(2023) },
  { id: 'h1', label: '  dont 2010-2016', from: eng(2010), to: eng(2017) },
  { id: 'h2', label: '  dont 2017-2022', from: eng(2017), to: eng(2023) },
  { id: 'test', label: 'Test 2023-2025', from: eng(2023), to: eng(2026) },
  { id: 'fwd', label: 'Forward 2026', from: eng(2026), to: eng(2027) },
];
const YEAR_OF = (t) => new Date(t + 5 * 3600000).getUTCFullYear();

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const toSeries = (candles) => ({
  t: Float64Array.from(candles, (x) => x.time), o: Float64Array.from(candles, (x) => x.open), h: Float64Array.from(candles, (x) => x.high),
  l: Float64Array.from(candles, (x) => x.low), c: Float64Array.from(candles, (x) => x.close), n: candles.length,
});

/** Trades réels (achats seulement) + les fractions nécessaires au placebo. `rowOf(k)` : ligne de règlement de la bougie M15 k. */
function realTrades(sym, m15, S, rowOf, keep, ctx) {
  let busyUntil = -Infinity;
  const trades = [];
  geminiSignals(m15, {
    spreadAt: ctx.spreadAt,
    canTrade: (i) => m15[i].time >= busyUntil,
    onSignal: (sig) => {
      if (sig.dir !== 'bullish') return;
      const i = rowOf(sig.entryIndex);
      const fill = S.o[i] + ctx.spreadAt(sig.entryPrice);
      if (fill <= sig.stopPrice) return;
      const res = manage(S, { buy: true, i, fill, stop: sig.stopPrice, target: sig.targetPrice, spread: ctx.spreadAt(sig.entryPrice), swap: ctx.swap });
      busyUntil = res.exitTime;
      if (keep(m15[sig.entryIndex].time)) trades.push({ symbol: sym, time: m15[sig.entryIndex].time, r: res.r, sd: (fill - sig.stopPrice) / fill, td: (sig.targetPrice - fill) / fill });
    },
  });
  return trades;
}

/** Un tirage placebo : pour chaque trade réel, achat à une bougie M15 au hasard de la même année, mêmes fractions de stop et de cible. */
function placeboDraw(real, m15, S, rowOf, ctx, rand, byYear) {
  const out = [];
  for (const tr of real) {
    const pool = byYear.get(YEAR_OF(tr.time));
    const k = pool[Math.floor(rand() * pool.length)];
    const i = rowOf(k);
    const spread = ctx.spreadAt(S.o[i]);
    const fill = S.o[i] + spread;
    const res = manage(S, { buy: true, i, fill, stop: fill * (1 - tr.sd), target: fill * (1 + tr.td), spread, swap: ctx.swap });
    out.push({ symbol: tr.symbol, time: tr.time, r: res.r });
  }
  return out;
}

const real = []; const placebo = Array.from({ length: DRAWS }, () => []);
for (const sym of SYMS) {
  const ctx = {
    spreadAt: (price) => (DEFAULT_SPREADS[sym] ?? 0) * (price / refPrice(sym)),
    swap: (dir, from, to, fill) => swapPerUnit(sym, dir, from, to) * (fill / refPrice(sym)),
  };
  const legs = [];
  const hist = loadCandlesFromCsv(`data/backtest-input/${sym}.csv`).candles.filter((x) => x.time < eng(2023));
  legs.push({ m15: hist, S: toSeries(hist), rowOf: (k) => k, keep: (t) => t >= eng(2010) });
  const M = readCsvGz(`data/real-m1-full/${sym}.csv.gz`); const m15b = toM15(M);
  legs.push({ m15: m15b, S: M, rowOf: (k) => m15b[k].i0, keep: (t) => t >= eng(2023) });
  for (const [li, leg] of legs.entries()) {
    const tr = realTrades(sym, leg.m15, leg.S, leg.rowOf, leg.keep, ctx);
    real.push(...tr);
    console.log(`${sym} ${li ? 'test+forward' : 'entraînement'} : ${tr.length} achats réels`);
    if (DRY) continue;
    const byYear = new Map();
    leg.m15.forEach((c, k) => { if (!leg.keep(c.time) || k + 1 >= leg.m15.length) return; const y = YEAR_OF(c.time); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(k); });
    const rand = mulberry32(20260930 + (li ? 1 : 0) + (sym === 'US500' ? 2 : 0));
    for (let d = 0; d < DRAWS; d++) placebo[d].push(...placeboDraw(tr, leg.m15, leg.S, leg.rowOf, ctx, rand, byYear));
  }
}
if (DRY) process.exit(0);

const st = (l) => {
  const n = l.length, s = l.reduce((a, x) => a + x.r, 0), m = n ? s / n : 0;
  const sd = n > 1 ? Math.sqrt(l.reduce((a, x) => a + (x.r - m) ** 2, 0) / (n - 1)) : 0;
  return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? l.filter((x) => x.r > 0).length / n : 0 };
};
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const inP = (p) => (r) => r.time >= p.from && r.time < p.to;
/** Placebo sur (symboles, période) : moyenne des moyennes et écart-type entre tirages. */
const plc = (syms, p) => {
  const means = placebo.map((d) => st(d.filter((r) => syms.includes(r.symbol) && inP(p)(r))).m);
  const P = means.reduce((a, x) => a + x, 0) / means.length;
  const sP = Math.sqrt(means.reduce((a, x) => a + (x - P) ** 2, 0) / (means.length - 1));
  return { P, sP };
};
const md = ['# Règle de Gemini, achats seulement, contre placebo — résultat du pré-enregistrement', '',
  `Règles : \`data/backtest-input/preregistration-gemini-buyonly-2026-09-30.md\` (commit \`561d856\`, avant ce calcul). Script : \`scripts/runGeminiBuyOnlyStudy.js\`. Placebo : ${DRAWS} tirages, un achat à une bougie au hasard de la même année par trade réel, mêmes fractions de stop et de cible. R net de spread et de swap. Généré le ${new Date().toISOString().slice(0, 16)} UTC.`, ''];
const res = {};
for (const [label, syms] of [['US100 + US500', SYMS], ['US100', ['US100']], ['US500', ['US500']]]) {
  md.push(`## ${label}`, '', '| Période | Achats réels | Gagnants | R moyen réel | t | R total | Placebo R moyen (σ) | Écart D | D / σ |', '|---|---|---|---|---|---|---|---|---|');
  for (const p of PERIODS) {
    const s = st(real.filter((r) => syms.includes(r.symbol) && inP(p)(r)));
    const { P, sP } = plc(syms, p);
    if (label === 'US100 + US500') res[p.id] = { s, P, sP, D: s.m - P };
    md.push(`| ${p.label} | ${s.n} | ${Math.round(100 * s.win)} % | ${sgn(s.m, 3)} | ${s.t.toFixed(2)} | ${sgn(s.s)} | ${sgn(P, 3)} (${sP.toFixed(3)}) | ${sgn(s.m - P, 3)} | ${sP ? ((s.m - P) / sP).toFixed(1) : '—'} |`);
  }
  md.push('');
}
const tr = res.train, te = res.test, h1 = res.h1, h2 = res.h2;
let verdict;
if (tr.s.n < 60) verdict = `**NON CONCLUANT** (${tr.s.n} achats à l'entraînement)`;
else if (!(tr.s.m > 0 && tr.s.t >= 2.6 && h1.s.s > 0 && h2.s.s > 0)) verdict = `**ÉCHEC à l'entraînement** (R moyen ${sgn(tr.s.m, 3)}, t ${tr.s.t.toFixed(2)} pour 2,6 ; 2010-2016 ${sgn(h1.s.s)} R, 2017-2022 ${sgn(h2.s.s)} R)`;
else if (!(tr.D >= 2 * tr.sP)) verdict = `**ÉCHEC : la règle n'ajoute rien à un achat quelconque** (entraînement : réel ${sgn(tr.s.m, 3)} R, placebo ${sgn(tr.P, 3)} R, écart ${sgn(tr.D, 3)} R = ${(tr.D / tr.sP).toFixed(1)} σ, il en faut 2)`;
else if (!(te.s.m > 0 && te.D > 0)) verdict = `**ÉCHEC au test** (réel ${sgn(te.s.m, 3)} R, placebo ${sgn(te.P, 3)} R, écart ${sgn(te.D, 3)} R)`;
else verdict = `**CANDIDAT EXPLORATOIRE** (entraînement t ${tr.s.t.toFixed(2)}, ${(tr.D / tr.sP).toFixed(1)} σ au-dessus du placebo ; test ${sgn(te.s.m, 3)} R, écart ${sgn(te.D, 3)} R) — démo seulement, jamais de réel sur ce seul rejeu`;
md.push('## Verdict (fixé à l\'avance)', '', verdict, '',
  `Forward 2026 (ne décide rien) : ${res.fwd.s.n} achats, ${sgn(res.fwd.s.m, 3)} R/trade, placebo ${sgn(res.fwd.P, 3)} R, écart ${sgn(res.fwd.D, 3)} R (${(res.fwd.D / res.fwd.sP).toFixed(1)} σ).`, '');
fs.writeFileSync('data/backtest-input/gemini-buyonly-study.md', md.join('\n'));
console.log(verdict);
