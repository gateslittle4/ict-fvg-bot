#!/usr/bin/env node
// runGeminiFvgStudy.js - test pré-enregistré dans data/backtest-input/preregistration-gemini-fvg-2026-09-30.md (commité avant ce
// calcul) : « cahier des charges 100 % FVG » de Gemini. Signaux : scripts/lib/geminiFvg.js (testé). Règlement : manage() de
// scripts/lib/stopOrderEntry.js (bid/ask, stop d'abord, trou à travers le stop à l'ouverture, 480 bougies M15 max).
// Entraînement 2010-2022 sur M15 HistData (règlement à la bougie M15) ; test 2023-2025 et forward 2026 sur M1 du broker.
// Usage : node --max-old-space-size=6144 scripts/runGeminiFvgStudy.js [--dry] -> data/backtest-input/gemini-fvg-study.md
import fs from 'node:fs';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { eng, readCsvGz, toM15, refPrice, swapPerUnit } from './lib/m1Data.js';
import { manage } from './lib/stopOrderEntry.js';
import { geminiSignals } from './lib/geminiFvg.js';

const DRY = process.argv.includes('--dry');
const SYMS = ['US100', 'US500'];
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: eng(2010), to: eng(2023) },
  { id: 'h1', label: '  dont 2010-2016', from: eng(2010), to: eng(2017) },
  { id: 'h2', label: '  dont 2017-2022', from: eng(2017), to: eng(2023) },
  { id: 'test', label: 'Test 2023-2025', from: eng(2023), to: eng(2026) },
  { id: 'fwd', label: 'Forward 2026', from: eng(2026), to: eng(2027) },
];

/** Série { t,o,h,l,c,n } à partir de bougies (une ligne par bougie). */
const toSeries = (candles) => ({
  t: Float64Array.from(candles, (x) => x.time), o: Float64Array.from(candles, (x) => x.open), h: Float64Array.from(candles, (x) => x.high),
  l: Float64Array.from(candles, (x) => x.low), c: Float64Array.from(candles, (x) => x.close), n: candles.length,
});

/** Signaux + règlement séquentiel (une position par symbole). `S` = série de règlement ; `rowOf(entryIndex)` = sa ligne d'entrée. */
function run(sym, m15, S, rowOf, keep) {
  const spreadAt = (price) => (DEFAULT_SPREADS[sym] ?? 0) * (price / refPrice(sym));
  const swap = (dir, from, to, fill) => swapPerUnit(sym, dir, from, to) * (fill / refPrice(sym));
  let busyUntil = -Infinity;
  const trades = [];
  geminiSignals(m15, {
    spreadAt,
    canTrade: (i) => m15[i].time >= busyUntil,
    onSignal: (sig) => {
      const buy = sig.dir === 'bullish';
      const i = rowOf(sig.entryIndex);
      const spread = spreadAt(sig.entryPrice);
      const fill = buy ? S.o[i] + spread : S.o[i];
      if (buy ? fill <= sig.stopPrice : fill >= sig.stopPrice) return; // entrée déjà au-delà du stop : pas de trade
      const res = manage(S, { buy, i, fill, stop: sig.stopPrice, target: sig.targetPrice, spread, swap });
      busyUntil = res.exitTime;
      if (keep(m15[sig.entryIndex].time)) trades.push({ symbol: sym, dir: sig.dir, time: m15[sig.entryIndex].time, r: res.r, reason: res.reason, rr: Math.abs(sig.targetPrice - fill) / Math.abs(fill - sig.stopPrice) });
    },
  });
  return trades;
}

const rows = [];
for (const sym of SYMS) {
  // Entraînement : M15 HistData, règlement à la bougie M15.
  const hist = loadCandlesFromCsv(`data/backtest-input/${sym}.csv`).candles.filter((x) => x.time < eng(2023));
  const trTrades = run(sym, hist, toSeries(hist), (k) => k, (t) => t >= eng(2010));
  // Test + forward : M1 du broker, détection sur M15 reconstruit, règlement à la minute.
  const S = readCsvGz(`data/real-m1-full/${sym}.csv.gz`);
  const m15 = toM15(S);
  const teTrades = run(sym, m15, S, (k) => m15[k].i0, (t) => t >= eng(2023));
  console.log(`${sym} : entraînement ${trTrades.length} trades, 2023+ ${teTrades.length} trades`);
  rows.push(...trTrades, ...teTrades);
}
if (DRY) process.exit(0);

const st = (l) => {
  const n = l.length, s = l.reduce((a, x) => a + x.r, 0), m = n ? s / n : 0;
  const sd = n > 1 ? Math.sqrt(l.reduce((a, x) => a + (x.r - m) ** 2, 0) / (n - 1)) : 0;
  return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? l.filter((x) => x.r > 0).length / n : 0, rr: n ? l.reduce((a, x) => a + x.rr, 0) / n : 0 };
};
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const md = ['# « Cahier des charges 100 % FVG » de Gemini — résultat du pré-enregistrement', '',
  `Règles : \`data/backtest-input/preregistration-gemini-fvg-2026-09-30.md\` (commit \`af34ee6\`, avant ce calcul). Script : \`scripts/runGeminiFvgStudy.js\`, signaux \`scripts/lib/geminiFvg.js\` (testés). R net de spread et de swap, rapporté au risque réel |exécution − stop|. Entraînement réglé à la bougie M15 (stop d'abord), test et forward à la minute. Généré le ${new Date().toISOString().slice(0, 16)} UTC.`, ''];
const res = {};
for (const [label, syms] of [['US100 + US500', SYMS], ['US100', ['US100']], ['US500', ['US500']]]) {
  md.push(`## ${label}`, '', '| Période | Trades | Gagnants | Cible moyenne (R) | R moyen | R total | t |', '|---|---|---|---|---|---|---|');
  for (const p of PERIODS) {
    const s = st(rows.filter((r) => syms.includes(r.symbol) && r.time >= p.from && r.time < p.to));
    if (label === 'US100 + US500') res[p.id] = s;
    md.push(`| ${p.label} | ${s.n} | ${Math.round(100 * s.win)} % | ${s.rr.toFixed(2)} | ${sgn(s.m, 3)} | ${sgn(s.s)} | ${s.t.toFixed(2)} |`);
  }
  md.push('');
}
const byDir = (d, p) => st(rows.filter((r) => r.dir === d && r.time >= p.from && r.time < p.to));
md.push('## Par sens (US100 + US500)', '', '| Période | Achats : trades / R total / t | Ventes : trades / R total / t |', '|---|---|---|');
for (const p of [PERIODS[0], PERIODS[3], PERIODS[4]]) {
  const a = byDir('bullish', p), v = byDir('bearish', p);
  md.push(`| ${p.label} | ${a.n} / ${sgn(a.s)} / ${a.t.toFixed(2)} | ${v.n} / ${sgn(v.s)} / ${v.t.toFixed(2)} |`);
}
md.push('');
// Verdict pré-enregistré.
const tr = res.train, te = res.test, h1 = res.h1, h2 = res.h2;
let verdict;
if (tr.n < 60) verdict = `**NON CONCLUANT** (${tr.n} trades à l'entraînement, il en faut 60)`;
else if (!(tr.m > 0 && tr.t >= 2.6 && h1.s > 0 && h2.s > 0)) verdict = `**ÉCHEC à l'entraînement** (R moyen ${sgn(tr.m, 3)}, t ${tr.t.toFixed(2)} pour 2,6 exigé ; 2010-2016 ${sgn(h1.s)} R, 2017-2022 ${sgn(h2.s)} R)`;
else if (te.m > 0) verdict = `**CANDIDAT** (entraînement t ${tr.t.toFixed(2)}, deux moitiés positives ; test ${sgn(te.m, 3)} R/trade sur ${te.n} trades) — démo seulement`;
else verdict = `**ÉCHEC au test** (entraînement validé, t ${tr.t.toFixed(2)} ; test ${sgn(te.m, 3)} R/trade sur ${te.n} trades)`;
md.push('## Verdict (fixé à l\'avance)', '', verdict, '', `Forward 2026 (n'entre pas dans le verdict) : ${res.fwd.n} trades, ${sgn(res.fwd.s)} R, t ${res.fwd.t.toFixed(2)}.`, '');
fs.writeFileSync('data/backtest-input/gemini-fvg-study.md', md.join('\n'));
console.log(verdict);
console.log('-> data/backtest-input/gemini-fvg-study.md');
