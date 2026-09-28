#!/usr/bin/env node
// runMeanReversionStudy.js - test pré-enregistré dans data/backtest-input/preregistration-mean-reversion-ibs-3down-2026-09-25.md (règles :
// scripts/lib/meanReversion.js, testées). Entraînement 2011-2022 = HistData ; test 2023-2025 et 2026 = M1 du courtier (préchauffé sur 2022).
// Usage : node --max-old-space-size=6144 scripts/runMeanReversionStudy.js   -> data/backtest-input/mean-reversion-ibs-3down-study.md
import fs from 'node:fs';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { OFF, loadM1, refPrice, swapPerUnit } from './lib/m1Data.js';
import { meanReversionTrades } from './lib/meanReversion.js';

const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['Entraînement 2011-2022', Y(2010), Y(2023)], ['  2011-2016', Y(2010), Y(2017)], ['  2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];
const RULE_NAMES = { ibs: 'IBS < 0,2 (sortie IBS > 0,8)', down3: '3 baisses de suite (sortie 1re hausse)' };
const res = { ibs: [], down3: [] };
for (const sym of ['US100', 'US500']) {
  const ref = refPrice(sym);
  const opts = { spreadAt: (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref, swapAt: (a, b, fill) => swapPerUnit(sym, 'bullish', a, b) * (fill / ref) };
  for (const [src, keep] of [['hist', (u) => u < Y(2023)], ['broker', (u) => u >= Y(2023)]]) {
    const S = loadM1(src, sym);
    for (const rule of Object.keys(res)) for (const t of meanReversionTrades(S, rule, opts)) { const u = t.entryTime + OFF; if (keep(u)) res[rule].push({ ...t, u, symbol: sym }); }
  }
  console.error(sym, 'ok');
}
const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; const w = l.filter((t) => t.r > 0); return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? w.length / n * 100 : 0, g: w.length ? w.reduce((a, t) => a + t.r, 0) / w.length : 0, p: n - w.length ? l.filter((t) => t.r <= 0).reduce((a, t) => a + t.r, 0) / (n - w.length) : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const inP = (a, b) => (t) => t.u >= a && t.u < b;
const md = ['# Retour à la moyenne journalier (IBS, 3 baisses de suite) — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-mean-reversion-ibs-3down-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runMeanReversionStudy.js`, règles `scripts/lib/meanReversion.js` (testées). Achat à l\'ask à l\'ouverture, sorties au bid, stop 3 ATR vérifié à la minute, swap du courtier. R = distance au stop.', ''];
const verdicts = [];
for (const rule of Object.keys(res)) {
  const all = res[rule];
  md.push(`## ${RULE_NAMES[rule]}`, '', '| Paire | Période | Trades | Gagnants | Gain moyen | Perte moyenne | R net | R/trade | t |', '|---|---|---|---|---|---|---|---|---|');
  for (const sym of ['US100 + US500', 'US100', 'US500']) for (const [lab, a, b] of PERIODS) {
    const s = st(all.filter((t) => (sym.includes('+') || t.symbol === sym) && inP(a, b)(t)));
    md.push(`| ${sym} | ${lab.trim()} | ${s.n} | ${s.w.toFixed(0)} % | ${sgn(s.g, 2)} | ${sgn(s.p, 2)} | ${sgn(s.s)} | ${sgn(s.m, 3)} | ${s.t.toFixed(2)} |`);
  }
  const tr = st(all.filter(inP(Y(2010), Y(2023)))), h1 = st(all.filter(inP(Y(2010), Y(2017)))), h2 = st(all.filter(inP(Y(2017), Y(2023)))), te = st(all.filter(inP(Y(2023), Y(2026))));
  const v = tr.n < 60 ? '**NON CONCLUANT** (moins de 60 trades)' : !(tr.m > 0 && tr.t >= 2.2 && h1.s > 0 && h2.s > 0) ? '**ÉCHEC à l\'entraînement**' : te.m > 0 ? '**CANDIDATE** (mode alerte avant tout réel, décision d\'Esdras)' : '**ÉCHEC au test**';
  verdicts.push(`- ${RULE_NAMES[rule]} : entraînement ${tr.n} trades, ${sgn(tr.m, 3)} R/trade, t ${tr.t.toFixed(2)}, 2011-2016 ${sgn(h1.s)} R, 2017-2022 ${sgn(h2.s)} R ; test ${te.n} trades ${sgn(te.s)} R → ${v}`);
  md.push('', `Sorties : ${['signal', 'time', 'stop'].map((r) => `${r} ${all.filter((t) => t.reason === r).length}`).join(', ')}`, '');
}
md.push('## Verdict (US100 + US500 réunis, critère pré-enregistré, t ≥ 2,2)', '', ...verdicts, '', '## Limites', '', '- HistData ≠ prix du broker ; spread par défaut, pas de glissement ; achats seulement ; même famille que RSI(2) déjà en live (chevauchement possible sur US500).');
fs.writeFileSync('data/backtest-input/mean-reversion-ibs-3down-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
