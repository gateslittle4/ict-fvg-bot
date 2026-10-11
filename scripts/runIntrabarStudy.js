#!/usr/bin/env node
// runIntrabarStudy.js - pré-enregistré dans data/backtest-input/preregistration-intrabar-rejection-2026-09-30.md : la règle de Gemini
// (achats seulement) avec le rejet évalué sur M15 (témoin), M5 ou M1. M1 du broker 2023 -> 2026-09. Règlement à la minute (manage).
// Usage : node --max-old-space-size=8192 scripts/runIntrabarStudy.js -> data/backtest-input/intrabar-rejection-study.md
import fs from 'node:fs';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { eng, readCsvGz, toM15, refPrice, swapPerUnit } from './lib/m1Data.js';
import { manage } from './lib/stopOrderEntry.js';
import { geminiBuysOnFine } from './lib/geminiIntrabar.js';

const SYMS = ['US100', 'US500'];
const HALF = eng(2025);
/** Bougies de `ms` millisecondes depuis le M1 (row = première minute). */
function toBars(S, ms) {
  const out = []; let cur = null;
  for (let i = 0; i < S.n; i++) {
    const b = Math.floor(S.t[i] / ms) * ms;
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i], row: i }; }
    else { if (S.h[i] > cur.high) cur.high = S.h[i]; if (S.l[i] < cur.low) cur.low = S.l[i]; cur.close = S.c[i]; }
  }
  if (cur) out.push(cur);
  return out;
}
const rows = { M15: [], M5: [], M1: [] };
for (const sym of SYMS) {
  const S = readCsvGz(`data/real-m1-full/${sym}.csv.gz`);
  const m15 = toM15(S);
  const spreadAt = (p) => (DEFAULT_SPREADS[sym] ?? 0) * (p / refPrice(sym));
  const swap = (dir, from, to, fill) => swapPerUnit(sym, dir, from, to) * (fill / refPrice(sym));
  for (const [name, fine] of [['M15', m15.map((c) => ({ ...c, row: c.i0 }))], ['M5', toBars(S, 300000)], ['M1', toBars(S, 60000)]]) {
    let busyUntil = -Infinity;
    geminiBuysOnFine(m15, fine, {
      spreadAt, canTrade: (t) => t >= busyUntil,
      onSignal: (sig) => {
        const sp = spreadAt(sig.entryPrice), fill = S.o[sig.row] + sp;
        if (fill <= sig.stopPrice) return;
        const res = manage(S, { buy: true, i: sig.row, fill, stop: sig.stopPrice, target: sig.targetPrice, spread: sp, swap });
        busyUntil = res.exitTime;
        rows[name].push({ symbol: sym, key: `${sym}|${sig.formedTime}`, time: sig.entryTime, r: res.r, fill, risk: res.risk });
      },
    });
    console.log(`${sym} ${name} : ${rows[name].filter((x) => x.symbol === sym).length} achats`);
  }
}
const st = (l, k = 'r') => {
  const n = l.length, s = l.reduce((a, x) => a + x[k], 0), m = n ? s / n : 0;
  const sd = n > 1 ? Math.sqrt(l.reduce((a, x) => a + (x[k] - m) ** 2, 0) / (n - 1)) : 0;
  return { n, s, m, t: sd ? m / (sd / Math.sqrt(n)) : 0, win: n ? l.filter((x) => x.r > 0).length / n : 0 };
};
const sgn = (x, d = 1) => (x >= 0 ? '+' : '') + x.toFixed(d);
const md = ['# Réagir dans la bougie (M5 / M1) plutôt qu\'à la clôture M15 — règle de Gemini, achats seulement', '',
  'Règles : `preregistration-intrabar-rejection-2026-09-30.md` (commit `d04588a`). M1 du broker 2023-01 → 2026-09, US100 + US500, règlement à la minute, spread et swap réels. Témoin M15 = reproduit `geminiSignals` (test dans `test/geminiIntrabar.test.js`).', '',
  '| Version | Achats | Gagnants | R moyen | R total | t |', '|---|---|---|---|---|---|'];
for (const d of ['M15', 'M5', 'M1']) { const s = st(rows[d]); md.push(`| ${d} | ${s.n} | ${Math.round(100 * s.win)} % | ${sgn(s.m, 3)} | ${sgn(s.s)} | ${s.t.toFixed(2)} |`); }
md.push('');
const ctrl = new Map(rows.M15.map((x) => [x.key, x]));
const verdicts = [];
for (const d of ['M5', 'M1']) {
  const pairs = rows[d].filter((x) => ctrl.has(x.key)).map((x) => { const c = ctrl.get(x.key); return { time: x.time, d: x.r - c.r, gain: (c.fill - x.fill) / c.risk }; });
  const all = st(pairs, 'd'), h1 = st(pairs.filter((p) => p.time < HALF), 'd'), h2 = st(pairs.filter((p) => p.time >= HALF), 'd');
  const onlyFine = rows[d].filter((x) => !ctrl.has(x.key)).length, onlyCtrl = rows.M15.filter((x) => !new Set(rows[d].map((y) => y.key)).has(x.key)).length;
  const gain = pairs.reduce((a, p) => a + p.gain, 0) / (pairs.length || 1);
  md.push(`## ${d} contre M15 (appariés par FVG)`, '',
    `- FVG tradés dans les deux versions : **${all.n}** ; écart moyen d = R(${d}) − R(M15) : **${sgn(all.m, 3)} R** (t ${all.t.toFixed(2)}).`,
    `- 2023-01→2024-12 : ${h1.n} FVG, d ${sgn(h1.m, 3)} R (t ${h1.t.toFixed(2)}) ; 2025-01→2026-09 : ${h2.n} FVG, d ${sgn(h2.m, 3)} R (t ${h2.t.toFixed(2)}).`,
    `- FVG tradés seulement en ${d} : ${onlyFine} ; seulement en M15 : ${onlyCtrl}.`,
    `- Prix d'entrée : ${d} entre en moyenne ${sgn(100 * gain, 1)} % du risque du témoin ${gain >= 0 ? 'plus bas (meilleur)' : 'plus haut (moins bon)'}.`, '');
  const helps = all.m > 0 && all.t >= 2 && st(rows[d]).m > st(rows.M15).m && h1.m > 0 && h2.m > 0;
  const hurts = all.m < 0 && all.t <= -2;
  verdicts.push(`${d} : ${helps ? '**RÉAGIR PLUS VITE AIDE**' : hurts ? '**AGGRAVE**' : '**NE PROUVE RIEN**'}`);
}
md.push('## Verdict (fixé à l\'avance)', '', ...verdicts.map((v) => `- ${v}`), '');
fs.writeFileSync('data/backtest-input/intrabar-rejection-study.md', md.join('\n'));
console.log(verdicts.join('\n'));
