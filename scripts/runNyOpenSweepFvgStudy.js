#!/usr/bin/env node
// runNyOpenSweepFvgStudy.js - test pré-enregistré dans data/backtest-input/preregistration-ny-open-sweep-fvg-2026-09-24.md (règles :
// scripts/lib/nyOpenSweepFvg.js). Entraînement 2010-2022 = data/histdata-m1 ; test 2023-2025 et 2026 = data/real-m1-full.
// Usage : node --max-old-space-size=6144 scripts/runNyOpenSweepFvgStudy.js   -> data/backtest-input/ny-open-sweep-fvg-study.md
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { groupNyDays, sweepFvgTrade } from './lib/nyOpenSweepFvg.js';

const Y = (y) => Date.UTC(y, 0, 1);
const PERIODS = [['Entraînement 2010-2022', Y(2010), Y(2023)], ['  2010-2016', Y(2010), Y(2017)], ['  2017-2022', Y(2017), Y(2023)], ['Test 2023-2025', Y(2023), Y(2026)], ['2026 (→ 21/09)', Y(2026), Y(2027)]];

function readGz(file) {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString('latin1');
  let n = 0; for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) n++;
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  let k = 0, pos = txt.indexOf('\n') + 1;
  while (pos > 0 && pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(','); pos = end + 1;
    if (p.length >= 5) { t[k] = +p[0]; o[k] = +p[1]; h[k] = +p[2]; l[k] = +p[3]; c[k] = +p[4]; k++; }
  }
  return { t: t.subarray(0, k), o: o.subarray(0, k), h: h.subarray(0, k), l: l.subarray(0, k), c: c.subarray(0, k), n: k };
}

function tradesFor(sym) {
  const broker = readGz(`data/real-m1-full/${sym}.csv.gz`);
  const ref = broker.c[broker.n - 1];
  const spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const out = [], counts = { days: 0, setups: 0, filled: 0 };
  for (const [src, S, keep] of [['hist', readGz(`data/histdata-m1/${sym}.csv.gz`), (t) => t < Y(2023)], ['broker', broker, (t) => t >= Y(2023)]]) {
    const days = groupNyDays(S);
    const keys = [...days.keys()].sort((a, b) => a - b);
    for (let i = 1; i < keys.length; i++) {
      const d = days.get(keys[i]);
      if (!keep(d.t[0])) continue;
      counts.days++;
      const prev = keys[i] - keys[i - 1] <= 4 ? days.get(keys[i - 1]) : null; // veille = jour précédent (week-end compris)
      const tr = sweepFvgTrade(d, prev, spreadAt);
      if (!tr) continue;
      counts.setups++;
      if (!tr.filled) continue;
      counts.filled++;
      out.push({ ...tr, symbol: sym, src });
    }
  }
  return { trades: out, counts };
}

const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? l.filter((t) => t.r > 0).length / n * 100 : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const inP = (a, b) => (t) => t.entryTime >= a && t.entryTime < b;

const res = {};
for (const sym of ['US100', 'US500']) { res[sym] = tradesFor(sym); console.error(sym, JSON.stringify(res[sym].counts)); }
const md = ['# Sweep de la nuit + déplacement à 9:30 + FVG — résultat du pré-enregistrement', '',
  'Règles : `data/backtest-input/preregistration-ny-open-sweep-fvg-2026-09-24.md` (commité avant ce calcul). Script : `scripts/runNyOpenSweepFvgStudy.js`, règles `scripts/lib/nyOpenSweepFvg.js` (testées). R par trade, réglé à la minute, spread par défaut.', '',
  ...['US100', 'US500'].map((s) => `- ${s} : ${res[s].counts.days} jours, ${res[s].counts.setups} configurations, ${res[s].counts.filled} ordres remplis`), '',
  '| Paire | Période | Trades | Gagnants | Achats / ventes | Cible moyenne | R net | R/trade | t |', '|---|---|---|---|---|---|---|---|---|'];
for (const sym of ['US100', 'US500']) for (const [lab, a, b] of PERIODS) {
  const l = res[sym].trades.filter(inP(a, b)); const s = st(l);
  md.push(`| ${sym}${sym === 'US100' ? ' (principale)' : ' (contrôle)'} | ${lab.trim()} | ${s.n} | ${s.w.toFixed(0)} % | ${l.filter((t) => t.long).length} / ${l.filter((t) => !t.long).length} | ${l.length ? (l.reduce((a, t) => a + t.rr, 0) / l.length).toFixed(1) : '-'} R | ${sgn(s.s)} | ${sgn(s.m, 3)} | ${s.t.toFixed(2)} |`);
}
const L = res.US100.trades;
const tr = st(L.filter(inP(Y(2010), Y(2023)))), h1 = st(L.filter(inP(Y(2010), Y(2017)))), h2 = st(L.filter(inP(Y(2017), Y(2023)))), te = st(L.filter(inP(Y(2023), Y(2026))));
const verdict = tr.n < 60 ? '**NON CONCLUANT** (moins de 60 trades à l\'entraînement)'
  : !(tr.m > 0 && tr.t >= 2 && h1.s > 0 && h2.s > 0) ? '**ÉCHEC à l\'entraînement**'
  : te.n >= 30 && te.m > 0 ? '**CANDIDATE** (démo/alerte avant tout réel)' : '**ÉCHEC au test**';
md.push('', '## Verdict (US100, critère pré-enregistré)', '', `Entraînement : ${tr.n} trades, ${sgn(tr.m, 3)} R/trade, t ${tr.t.toFixed(2)}, 2010-2016 ${sgn(h1.s)} R, 2017-2022 ${sgn(h2.s)} R ; test : ${te.n} trades, ${sgn(te.s)} R → ${verdict}`,
  '', '## Sorties (US100, toutes périodes)', '', ...['target', 'stop', 'close'].map((r) => `- ${r} : ${L.filter((t) => t.reason === r).length}`),
  '', '## Limites', '', '- Idée née d\'une seule journée (24/09, hors données) ; HistData ≠ prix du broker ; spread par défaut, pas de glissement.');
fs.writeFileSync('data/backtest-input/ny-open-sweep-fvg-study.md', md.join('\n') + '\n');
console.log(md.join('\n'));
