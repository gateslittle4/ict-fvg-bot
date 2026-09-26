#!/usr/bin/env node
// runEsdrasPullbackStudy.js - test pré-enregistré dans data/backtest-input/preregistration-esdras-pullback-2026-09-26.md (repli dans la
// tendance le matin, règle tirée des trades réels d'Esdras). Règle : scripts/lib/pullbackRule.js (testée).
// Usage : node --max-old-space-size=6144 scripts/runEsdrasPullbackStudy.js   -> data/backtest-input/esdras-pullback-study.md
import fs from 'node:fs';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { OFF, eng, loadM1, refPrice } from './lib/m1Data.js';
import { pullbackTrades } from './lib/pullbackRule.js';

const P = [
  ['Entraînement 2011-2022', eng(2011), eng(2023)], ['  dont 2011-2016', eng(2011), eng(2017)], ['  dont 2017-2022', eng(2017), eng(2023)],
  ['Test 2023-2024', eng(2023), eng(2025)], ['2025 (année de l\'idée, descriptif)', eng(2025), eng(2026)], ['2026 (→ 21/09, descriptif)', eng(2026), eng(2027)],
];
const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? l.filter((t) => t.r > 0).length / n : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const md = ['# Repli dans la tendance le matin (règle tirée des trades d\'Esdras) — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-esdras-pullback-2026-09-26.md` (commité avant ce calcul). Script : `scripts/runEsdrasPullbackStudy.js`, règle `scripts/lib/pullbackRule.js`. R net du spread, rapporté à 1 ATR horaire.', ''];
const res = {};
for (const sym of ['US100', 'US500']) {
  const all = [];
  for (const [src, keep] of [['hist', (t) => t < eng(2023)], ['broker', (t) => t >= eng(2023)]]) {
    const S = loadM1(src, sym);
    const spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * (p / refPrice(sym));
    all.push(...pullbackTrades(S, spreadAt).filter((t) => keep(t.entryTime)));
    console.log(`${sym} ${src} : ${all.length} trades cumulés`);
  }
  md.push(`## ${sym}${sym === 'US100' ? ' (principale)' : ' (contrôle, descriptif)'}`, '', '| Période | Trades | Gagnants | R moyen | R total | t | Sorties objectif / stop / temps |', '|---|---|---|---|---|---|---|');
  for (const [lab, a, b] of P) {
    const l = all.filter((t) => t.entryTime >= a && t.entryTime < b), s = st(l);
    const why = (k) => l.filter((t) => t.reason === k).length;
    res[`${sym}-${lab.trim()}`] = s;
    md.push(`| ${lab} | ${s.n} | ${Math.round(100 * s.w)} % | ${sgn(s.m, 3)} | ${sgn(s.s)} | ${s.t.toFixed(2)} | ${why('target')} / ${why('stop')} / ${why('time')} |`);
  }
  md.push('');
  const byYear = {}; for (const t of all) { const y = new Date(t.entryTime + OFF).getUTCFullYear(); (byYear[y] = byYear[y] || []).push(t); }
  md.push(`Par année (${sym}) : ${Object.entries(byYear).map(([y, l]) => `${y} ${sgn(st(l).s, 0)}`).join(' · ')}`, '');
}
const tr = res['US100-Entraînement 2011-2022'], h1 = res['US100-dont 2011-2016'], h2 = res['US100-dont 2017-2022'], te = res['US100-Test 2023-2024'];
let verdict;
if (tr.n < 60) verdict = `**NON CONCLUANT** (${tr.n} trades à l'entraînement)`;
else if (!(tr.m > 0 && tr.t >= 2.6 && h1.s > 0 && h2.s > 0)) verdict = `**ÉCHEC à l'entraînement** (R moyen ${sgn(tr.m, 3)}, t ${tr.t.toFixed(2)}, 2011-2016 ${sgn(h1.s)} R, 2017-2022 ${sgn(h2.s)} R)`;
else verdict = te.m > 0 ? `**CANDIDAT** (test 2023-2024 : ${sgn(te.m, 3)} R/trade, ${te.n} trades) — démo seulement avant tout réel, décision d'Esdras` : `**ÉCHEC au test** (test 2023-2024 : ${sgn(te.m, 3)} R/trade)`;
md.push('## Verdict (critère pré-enregistré, US100)', '', verdict, '');
fs.writeFileSync('data/backtest-input/esdras-pullback-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
