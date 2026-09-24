#!/usr/bin/env node
// runMarketMakerModelStudy.js - test pré-enregistré dans data/backtest-input/preregistration-market-maker-model-2026-09-25.md (règles :
// scripts/lib/marketMakerModel.js, testées). Entraînement 2011-2022 = data/histdata-m1 ; test 2023-2025 et 2026 = data/real-m1-full.
// Usage : node --max-old-space-size=6144 scripts/runMarketMakerModelStudy.js   -> data/backtest-input/market-maker-model-study.md
import fs from 'node:fs';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { readCsvGz } from './lib/m1Data.js';
import { OFF } from './lib/m1Data.js';
import { marketMakerTrades } from './lib/marketMakerModel.js';

const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['Entraînement 2011-2022', Y(2010), Y(2023)], ['  2011-2016', Y(2010), Y(2017)], ['  2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];
// readCsvGz renvoie l'heure moteur (UTC - OFF) : on revient en UTC pour les bougies H1/M15.
const utc = (S) => ({ ...S, t: S.t.map((x) => x + OFF) });
const slice = (S, a, b) => { let i = 0; while (i < S.n && S.t[i] < a) i++; let j = i; while (j < S.n && S.t[j] < b) j++; return { t: S.t.subarray(i, j), o: S.o.subarray(i, j), h: S.h.subarray(i, j), l: S.l.subarray(i, j), c: S.c.subarray(i, j), n: j - i }; };

const all = [];
for (const sym of ['US100', 'US500']) {
  const broker = utc(readCsvGz(`data/real-m1-full/${sym}.csv.gz`));
  const ref = broker.c[broker.n - 1];
  const spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const hist = slice(utc(readCsvGz(`data/histdata-m1/${sym}.csv.gz`)), Y(2010), Y(2023));
  const b = slice(broker, Y(2022) + 300 * 86400000, Infinity); // un peu de 2022 pour l'ATR et la première consolidation de 2023
  for (const [S, keep] of [[hist, (t) => t < Y(2023)], [b, (t) => t >= Y(2023)]]) {
    for (const tr of marketMakerTrades(S, spreadAt)) if (keep(tr.entryTime)) all.push({ ...tr, symbol: sym });
  }
  console.error(sym, all.filter((t) => t.symbol === sym).length, 'trades');
}
const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? l.filter((t) => t.r > 0).length / n * 100 : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const inP = (a, b) => (t) => t.entryTime >= a && t.entryTime < b;
const md = ['# Market Maker Buy / Sell Model (version mécanique) — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-market-maker-model-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runMarketMakerModelStudy.js`, règles `scripts/lib/marketMakerModel.js` (testées). R par trade, réglé à la minute, spread par défaut.', '',
  '| Paire | Période | Trades | Gagnants | Achats / ventes | Cible moyenne | R net | R/trade | t |', '|---|---|---|---|---|---|---|---|---|'];
for (const sym of ['US100 + US500', 'US100', 'US500']) for (const [lab, a, b] of PERIODS) {
  const l = all.filter((t) => (sym.includes('+') || t.symbol === sym) && inP(a, b)(t)); const s = st(l);
  md.push(`| ${sym} | ${lab.trim()} | ${s.n} | ${s.w.toFixed(0)} % | ${l.filter((t) => t.long).length} / ${l.filter((t) => !t.long).length} | ${l.length ? (l.reduce((x, t) => x + t.rr, 0) / l.length).toFixed(1) : '-'} R | ${sgn(s.s)} | ${sgn(s.m, 3)} | ${s.t.toFixed(2)} |`);
}
const tr = st(all.filter(inP(Y(2010), Y(2023)))), h1 = st(all.filter(inP(Y(2010), Y(2017)))), h2 = st(all.filter(inP(Y(2017), Y(2023)))), te = st(all.filter(inP(Y(2023), Y(2026))));
const verdict = tr.n < 60 ? '**NON CONCLUANT** (moins de 60 trades à l\'entraînement)'
  : !(tr.m > 0 && tr.t >= 2 && h1.s > 0 && h2.s > 0) ? '**ÉCHEC à l\'entraînement**'
  : te.m > 0 ? '**CANDIDAT** (mode alerte / démo avant tout réel, décision d\'Esdras)' : '**ÉCHEC au test**';
md.push('', '## Verdict (US100 + US500, critère pré-enregistré)', '', `Entraînement : ${tr.n} trades, ${sgn(tr.m, 3)} R/trade, t ${tr.t.toFixed(2)}, 2011-2016 ${sgn(h1.s)} R, 2017-2022 ${sgn(h2.s)} R ; test 2023-2025 : ${te.n} trades, ${sgn(te.s)} R → ${verdict}`,
  '', '## Sorties (toutes périodes)', '', ...['target', 'stop', 'time'].map((r) => `- ${r} : ${all.filter((t) => t.reason === r).length}`),
  '', '## Limites', '', '- UNE traduction mécanique d\'un modèle visuel ; HistData ≠ prix du broker ; spread par défaut, pas de glissement ; bougies H1/M15 en heures UTC (les week-ends comptent comme des bougies manquantes).');
fs.writeFileSync('data/backtest-input/market-maker-model-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
