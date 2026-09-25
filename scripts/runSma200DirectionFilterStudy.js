#!/usr/bin/env node
// runSma200DirectionFilterStudy.js - test pré-enregistré dans data/backtest-input/preregistration-sma200-direction-filter-2026-09-25.md.
// Usage : node --max-old-space-size=6144 scripts/runSma200DirectionFilterStudy.js   -> data/backtest-input/sma200-direction-filter-study.md
import fs from 'node:fs';
import { OFF, loadM1 } from './lib/m1Data.js';
import { dailyBars } from './lib/meanReversion.js';

const Y = (y) => Date.UTC(y, 0, 1);
const DAY = 86400000;
const trades = fs.readdirSync('data/live-replay').filter((f) => /^(hist|broker)-\d{4}-\d{4}\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades);
// moyenne 200 jours connue à chaque instant : bougies journalières 17:00 -> 17:00 temps moteur, HistData avant 2023, courtier ensuite
const trend = {};
for (const sym of [...new Set(trades.map((t) => t.symbol))]) {
  const pts = [];
  for (const [src, keep] of [['hist', (u) => u < Y(2023)], ['broker', (u) => u >= Y(2023)]]) {
    const B = dailyBars(loadM1(src, sym));
    let s = 0;
    for (let i = 0; i < B.length; i++) {
      s += B[i].c; if (i >= 200) s -= B[i - 200].c;
      const end = B[i].time + DAY; // fin de la bougie (temps moteur)
      if (i >= 199 && keep(end + OFF)) pts.push({ end, above: B[i].c > s / 200, below: B[i].c < s / 200 });
    }
  }
  trend[sym] = pts.sort((a, b) => a.end - b.end);
}
const lastBefore = (pts, t) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].end <= t) lo = m + 1; else hi = m; } return lo > 0 ? pts[lo - 1] : null; };
const rows = trades.map((t) => {
  const p = lastBefore(trend[t.symbol] || [], t.entryTime);
  const keep = p ? (t.direction === 'bullish' ? p.above : p.below) : true; // sans 200 jours d'historique : pas de filtre
  return { ...t, u: t.entryTime + OFF, keep };
});
const P = [['Entraînement 2011-2022', Y(2010), Y(2023)], ['  2011-2016', Y(2010), Y(2017)], ['  2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];
const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const md = ['# Filtre de sens par la moyenne 200 jours sur le combo — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-sma200-direction-filter-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runSma200DirectionFilterStudy.js`. Trades du combo au rejeu fidèle ; un achat est gardé si la dernière clôture journalière est au-dessus de la moyenne 200 jours, une vente si elle est en dessous.', '',
  '| Période | Combo actuel | Trades gardés | Trades retirés | R/trade gardés | R/trade retirés |', '|---|---|---|---|---|---|'];
const res = {};
for (const [lab, a, b] of P) {
  const l = rows.filter((t) => t.u >= a && t.u < b);
  const all = st(l), k = st(l.filter((t) => t.keep)), x = st(l.filter((t) => !t.keep));
  res[lab.trim()] = { all, k, x };
  md.push(`| ${lab.trim()} | ${sgn(all.s)} R (${all.n}) | ${sgn(k.s)} R (${k.n}, t ${k.t.toFixed(2)}) | ${sgn(x.s)} R (${x.n}) | ${sgn(k.m, 3)} | ${sgn(x.m, 3)} |`);
}
md.push('', '## Trades retirés, par stratégie et par sens (toutes périodes)', '', '| Stratégie | Achats retirés (sous la moyenne) | Ventes retirées (au-dessus) |', '|---|---|---|');
for (const leg of [...new Set(rows.map((t) => `${t.source} ${t.symbol}`))].sort()) {
  const L = rows.filter((t) => `${t.source} ${t.symbol}` === leg && !t.keep);
  const b = st(L.filter((t) => t.direction === 'bullish')), s = st(L.filter((t) => t.direction === 'bearish'));
  md.push(`| ${leg} | ${sgn(b.s)} R (${b.n}) | ${sgn(s.s)} R (${s.n}) |`);
}
const h1 = res['2011-2016'].x.s, h2 = res['2017-2022'].x.s, te = res['Test 2023-2025'].x.s;
const verdict = !(h1 < 0 && h2 < 0) ? `**NON RETENU** (les trades retirés ne sont pas négatifs sur les deux moitiés : 2011-2016 ${sgn(h1)} R, 2017-2022 ${sgn(h2)} R)` : te <= 0 ? '**RETENU** (à confirmer par un rejeu fidèle complet avant toute décision en réel)' : `**NON RETENU** (au test, les trades retirés gagnaient ${sgn(te)} R)`;
md.push('', '## Verdict (critère pré-enregistré)', '', verdict, '', '## Limites', '', '- Filtre appliqué aux trades déjà rejoués : la place libérée sur la paire n\'est pas réutilisée par un autre signal (à vérifier par un rejeu complet si retenu).');
fs.writeFileSync('data/backtest-input/sma200-direction-filter-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
