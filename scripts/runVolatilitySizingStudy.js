#!/usr/bin/env node
// runVolatilitySizingStudy.js - test pré-enregistré dans data/backtest-input/preregistration-volatility-sizing-2026-09-25.md.
// Usage : node --max-old-space-size=6144 scripts/runVolatilitySizingStudy.js   -> data/backtest-input/volatility-sizing-study.md
import fs from 'node:fs';
import { OFF, loadM1 } from './lib/m1Data.js';
import { dailyBars } from './lib/meanReversion.js';

const Y = (y) => Date.UTC(y, 0, 1);
const DAY = 86400000, ATR_N = 14, REF_N = 100, HIGH = 1.5;
const trades = fs.readdirSync('data/live-replay').filter((f) => /^(hist|broker)-\d{4}-\d{4}\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(`data/live-replay/${f}`, 'utf8')).trades);
// ratio de volatilité connu à chaque instant : ATR(14) journalier / moyenne des 100 derniers ATR, bougies 17:00 -> 17:00 temps moteur
const vol = {};
for (const sym of [...new Set(trades.map((t) => t.symbol))]) {
  const pts = [];
  for (const [src, keep] of [['hist', (u) => u < Y(2023)], ['broker', (u) => u >= Y(2023)]]) {
    const B = dailyBars(loadM1(src, sym));
    const tr = B.map((b, i) => Math.max(b.h - b.l, i ? Math.abs(b.h - B[i - 1].c) : 0, i ? Math.abs(b.l - B[i - 1].c) : 0));
    const atr = [];
    for (let i = 0; i < B.length; i++) {
      if (i >= ATR_N) { let s = 0; for (let k = i - ATR_N + 1; k <= i; k++) s += tr[k]; atr[i] = s / ATR_N; }
      if (i < ATR_N + REF_N - 1) continue;
      let s = 0; for (let k = i - REF_N + 1; k <= i; k++) s += atr[k];
      const end = B[i].time + DAY; // fin de la bougie (temps moteur)
      if (keep(end + OFF)) pts.push({ end, ratio: atr[i] / (s / REF_N) });
    }
  }
  vol[sym] = pts.sort((a, b) => a.end - b.end);
}
const lastBefore = (pts, t) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].end <= t) lo = m + 1; else hi = m; } return lo > 0 ? pts[lo - 1] : null; };
const rows = trades.map((t) => {
  const p = lastBefore(vol[t.symbol] || [], t.entryTime);
  const agite = !!p && p.ratio > HIGH;
  return { ...t, u: t.entryTime + OFF, x: t.exitTime + OFF, agite, rs: agite ? t.r / 2 : t.r };
}).sort((a, b) => a.x - b.x);

const curve = (l, k) => { let eq = 0, peak = 0, dd = 0; for (const t of l) { eq += t[k]; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); } return { s: eq, dd, q: dd ? eq / dd : Infinity }; };
const mean = (l) => (l.length ? l.reduce((a, t) => a + t.r, 0) / l.length : 0);
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const P = [['Entraînement 2011-2022', Y(2010), Y(2023)], ['2011-2016', Y(2010), Y(2017)], ['2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];
const md = ['# Taille réduite de moitié en marché agité — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-volatility-sizing-2026-09-25.md` (commité avant ce calcul). Script : `scripts/runVolatilitySizingStudy.js`. Trades du combo au rejeu fidèle ; marché agité = ATR(14) journalier / moyenne 100 de cet ATR > 1,5 (dernière bougie journalière terminée avant l\'entrée) → le trade compte pour R / 2.', '',
  '| Période | Trades (dont agités) | Sans règle : R total / pire baisse / ratio | Avec règle : R total / pire baisse / ratio | R/trade agités | R/trade autres |', '|---|---|---|---|---|---|'];
const res = {};
for (const [lab, a, b] of P) {
  const l = rows.filter((t) => t.u >= a && t.u < b);
  const f = curve(l, 'r'), v = curve(l, 'rs'), ag = l.filter((t) => t.agite);
  res[lab] = { f, v };
  md.push(`| ${lab} | ${l.length} (${ag.length}) | ${sgn(f.s)} R / ${f.dd.toFixed(1)} R / ${f.q.toFixed(2)} | ${sgn(v.s)} R / ${v.dd.toFixed(1)} R / ${v.q.toFixed(2)} | ${sgn(mean(ag), 3)} | ${sgn(mean(l.filter((t) => !t.agite)), 3)} |`);
}
md.push('', '## Trades en marché agité, par stratégie (toutes périodes)', '', '| Stratégie | Trades agités | R total agités | R/trade agités | R/trade autres |', '|---|---|---|---|---|');
for (const leg of [...new Set(rows.map((t) => `${t.source} ${t.symbol}`))].sort()) {
  const L = rows.filter((t) => `${t.source} ${t.symbol}` === leg), ag = L.filter((t) => t.agite);
  md.push(`| ${leg} | ${ag.length} | ${sgn(ag.reduce((a, t) => a + t.r, 0))} R | ${sgn(mean(ag), 3)} | ${sgn(mean(L.filter((t) => !t.agite)), 3)} |`);
}
const better = (k) => res[k].v.q > res[k].f.q;
const verdict = !(better('2011-2016') && better('2017-2022'))
  ? `**NON RETENU** (le ratio ne s'améliore pas sur les deux moitiés de l'entraînement : 2011-2016 ${res['2011-2016'].f.q.toFixed(2)} → ${res['2011-2016'].v.q.toFixed(2)}, 2017-2022 ${res['2017-2022'].f.q.toFixed(2)} → ${res['2017-2022'].v.q.toFixed(2)})`
  : better('Test 2023-2025') ? '**RETENU** (à confirmer par une simulation de compte FTMO avant toute décision en réel)'
    : `**NON RETENU** (au test, le ratio baisse : ${res['Test 2023-2025'].f.q.toFixed(2)} → ${res['Test 2023-2025'].v.q.toFixed(2)})`;
md.push('', '## Verdict (critère pré-enregistré)', '', verdict, '', '## Limites', '', '- A et B (ORB, Noise) ne sont pas dans les tranches du rejeu avant 2023 : non évaluées.', '- Les règles FTMO (perte journalière) ne sont pas simulées ici.');
fs.writeFileSync('data/backtest-input/volatility-sizing-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
