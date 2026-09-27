#!/usr/bin/env node
// runEsdrasTight.js - stop serré (T0) et stop serré + réentrée immédiate (T1) (preregistration-esdras-tight-2026-09-27.md).
// Usage : NIGHT_PHASE=<phase> node --max-old-space-size=12000 scripts/runEsdrasTight.js <US100|US500> <explore|validation|final>
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, signals, execute } from './lib/esdrasMethod.js';
const SYM = process.argv[2], phase = process.argv[3], P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), sig = signals(X, h4Bias(X), m15Bms(X));
const base = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const runs = { C1: execute(X, sig, base), T0: execute(X, sig, { ...base, tightAtr: 0.25 }), T1: execute(X, sig, { ...base, tightAtr: 0.25, retries: 2 }) };
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
const pick = (l, b) => l.filter((t) => inBlocks(t.entryTime, b));
const lines = [`# Stop serré et réentrée immédiate : ${SYM} ${phase}`, '', '```'];
const log = (s) => { console.log(s); lines.push(s); };
const out = {};
for (const [k, l] of Object.entries(runs)) {
  const c = pick(l, P.count), s = stats(c), r = c.map((t) => t.r).sort((a, b) => b - a), no5 = r.slice(5).reduce((a, x) => a + x, 0);
  log(`${k}  ${fmt(s)}  sans les 5 meilleurs ${sgn(no5, 1)} R`);
  if (k === 'T1') log(`T1 réentrées seules ${fmt(stats(c.filter((t) => t.step === 're')))}`);
  if (P.descriptive) log(`${k} 2025 ${fmt(stats(pick(l, P.descriptive)))}`);
  out[k] = c.map((t) => ({ t: t.entryTime, r: t.r, re: t.step === 're' }));
}
if (phase === 'explore') {
  const c1 = stats(pick(runs.C1, P.count)).mean;
  for (const k of ['T0', 'T1']) { const l = pick(runs[k], P.count), s = stats(l), v = exploreVerdict(l, P.halves); const ok = s.n >= 60 && s.mean > 0 && s.t >= 2.5 && v.halves.every((h) => h.sum > 0) && s.mean > c1; log(`${k} : ${ok ? 'RETENUE' : 'REJETÉE'} (moitiés ${v.halves.map((h) => sgn(h.mean, 3)).join(' / ')} R ; t ${s.t.toFixed(2)} ; seuil 2,5)`); }
}
lines.push('```');
fs.writeFileSync(`data/backtest-input/esdras-tight-${SYM}-${phase}.md`, lines.join('\n') + '\n');
fs.writeFileSync(`data/backtest-input/esdras-tight-${SYM}-${phase}.json`, JSON.stringify(out));
