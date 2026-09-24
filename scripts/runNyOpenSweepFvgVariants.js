#!/usr/bin/env node
// runNyOpenSweepFvgVariants.js - amendement de preregistration-ny-open-sweep-fvg-2026-09-24.md : variantes V1-V5 (conditions 1-3 retirées),
// critère t >= 2,6 à l'entraînement. -> data/backtest-input/ny-open-sweep-fvg-variants.md
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { groupNyDays, sweepFvgTrade } from './lib/nyOpenSweepFvg.js';

const Y = (y) => Date.UTC(y, 0, 1);
const VARIANTS = [
  ['Complète (référence)', {}],
  ['V1 sans sweep', { needSweep: false }],
  ['V2 sans plancher', { needFloor: false }],
  ['V3 sans cassure pré-ouverture', { needBos: false }],
  ['V4 sans sweep ni plancher', { needSweep: false, needFloor: false }],
  ['V5 FVG de 9:30 seul', { needSweep: false, needFloor: false, needBos: false }],
];
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
const st = (l) => { const n = l.length, s = l.reduce((a, t) => a + t.r, 0), m = n ? s / n : 0; const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)) : 0; return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, w: n ? l.filter((t) => t.r > 0).length / n * 100 : 0 }; };
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const P = { train: [Y(2010), Y(2023)], h1: [Y(2010), Y(2017)], h2: [Y(2017), Y(2023)], test: [Y(2023), Y(2026)], y2025: [Y(2025), Y(2026)], fwd: [Y(2026), Y(2027)] };
const inP = ([a, b]) => (t) => t.entryTime >= a && t.entryTime < b;

const md = ['# Sweep + 9:30 + FVG — variantes simplifiées (amendement pré-enregistré)', '', 'Règles : amendement de `preregistration-ny-open-sweep-fvg-2026-09-24.md` (commité avant ce calcul, `9f5690d`). Critère : entraînement ≥ 60 trades, t ≥ 2,6, deux moitiés positives, puis test ≥ 30 trades et > 0. 2025 descriptif.', ''];
for (const sym of ['US100', 'US500']) {
  const broker = readGz(`data/real-m1-full/${sym}.csv.gz`); const ref = broker.c[broker.n - 1];
  const spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * p / ref;
  const sources = [[groupNyDays(readGz(`data/histdata-m1/${sym}.csv.gz`)), (t) => t < Y(2023)], [groupNyDays(broker), (t) => t >= Y(2023)]];
  md.push(`## ${sym}${sym === 'US100' ? ' (principale)' : ' (contrôle)'}`, '', '| Variante | Entraînement 2010-2022 | 2010-2016 | 2017-2022 | Test 2023-2025 | **2025 seul** | 2026 | Verdict |', '|---|---|---|---|---|---|---|---|');
  for (const [name, opts] of VARIANTS) {
    const trades = [];
    for (const [days, keep] of sources) {
      const keys = [...days.keys()].sort((a, b) => a - b);
      for (let i = 1; i < keys.length; i++) {
        const d = days.get(keys[i]); if (!keep(d.t[0])) continue;
        const tr = sweepFvgTrade(d, keys[i] - keys[i - 1] <= 4 ? days.get(keys[i - 1]) : null, spreadAt, opts);
        if (tr && tr.filled) trades.push(tr);
      }
    }
    const s = Object.fromEntries(Object.entries(P).map(([k, r]) => [k, st(trades.filter(inP(r)))]));
    const cell = (x) => `${x.n} tr., ${x.w.toFixed(0)} %, ${sgn(x.s)} R (t ${x.t.toFixed(2)})`;
    const trainOk = s.train.n >= 60 && s.train.m > 0 && s.train.t >= 2.6 && s.h1.s > 0 && s.h2.s > 0;
    const verdict = name.startsWith('Complète') ? 'référence (échec, t < 2)' : !trainOk ? (s.train.n < 60 ? 'non concluant' : 'échec entraînement') : s.test.n >= 30 && s.test.m > 0 ? '**CANDIDATE**' : 'échec au test';
    md.push(`| ${name} | ${cell(s.train)} | ${sgn(s.h1.s)} R | ${sgn(s.h2.s)} R | ${cell(s.test)} | ${cell(s.y2025)} | ${cell(s.fwd)} | ${verdict} |`);
  }
  md.push('');
}
fs.writeFileSync('data/backtest-input/ny-open-sweep-fvg-variants.md', md.join('\n') + '\n');
console.log(md.join('\n'));
