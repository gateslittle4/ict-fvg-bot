#!/usr/bin/env node
// runEsdrasBuyOnly.js - achats seulement (preregistration-esdras-buyonly-2026-09-27.md).
// Usage : NIGHT_PHASE=<phase> node --max-old-space-size=12000 scripts/runEsdrasBuyOnly.js <US100|US500> <explore|validation|final>
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, signals, execute } from './lib/esdrasMethod.js';
const SYM = process.argv[2], phase = process.argv[3], P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), bias = h4Bias(X), bms = m15Bms(X);
const buys = (l) => l.filter((s) => s.dir > 0);
const sig = buys(signals(X, bias, bms)), ref = buys(signals(X, bias, bms, { useBias: false }));
const base = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) }, t1 = { ...base, tightAtr: 0.25, retries: 2 };
const runs = { 'C1-A': execute(X, sig, base), 'B0-A': execute(X, ref, base), 'T1-A': execute(X, sig, t1), 'B0-A en T1': execute(X, ref, t1) };
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
const pick = (l, b) => l.filter((t) => inBlocks(t.entryTime, b));
const lines = [`# Achats seulement : ${SYM} ${phase}`, '', '```'];
const log = (s) => { console.log(s); lines.push(s); };
const out = {};
for (const [k, l] of Object.entries(runs)) {
  const c = pick(l, P.count), r = c.map((t) => t.r).sort((a, b) => b - a);
  log(`${k.padEnd(11)} ${fmt(stats(c))}  sans les 5 meilleurs ${sgn(r.slice(5).reduce((a, x) => a + x, 0), 1)} R`);
  if (P.descriptive) log(`${(k + ' 2025').padEnd(11)} ${fmt(stats(pick(l, P.descriptive)))}`);
  out[k] = c.map((t) => ({ t: t.entryTime, r: t.r }));
}
if (phase === 'explore') for (const [k, rk] of [['C1-A', 'B0-A'], ['T1-A', 'B0-A en T1']]) {
  const l = pick(runs[k], P.count), s = stats(l), v = exploreVerdict(l, P.halves), rm = stats(pick(runs[rk], P.count)).mean;
  const ok = s.n >= 60 && s.mean > 0 && s.t >= 2.5 && v.halves.every((h) => h.sum > 0) && s.mean > rm;
  log(`${k} : ${ok ? 'RETENUE' : 'REJETÉE'} (moitiés ${v.halves.map((h) => sgn(h.mean, 3)).join(' / ')} R ; t ${s.t.toFixed(2)} ; référence ${sgn(rm, 3)} R)`);
}
lines.push('```');
fs.writeFileSync(`data/backtest-input/esdras-buyonly-${SYM}-${phase}.md`, lines.join('\n') + '\n');
fs.writeFileSync(`data/backtest-input/esdras-buyonly-${SYM}-${phase}.json`, JSON.stringify(out));
