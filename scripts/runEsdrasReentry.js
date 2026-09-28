#!/usr/bin/env node
// runEsdrasReentry.js - réentrées rapides après une perte (preregistration-esdras-reentry-2026-09-27.md).
// Usage : NIGHT_PHASE=<phase> node --max-old-space-size=12000 scripts/runEsdrasReentry.js <US100|US500> <explore|validation|final>
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, signals, execute } from './lib/esdrasMethod.js';
const SYM = process.argv[2], phase = process.argv[3], P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), sig = signals(X, h4Bias(X), m15Bms(X));
const opts = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R`;
const pick = (l, b) => l.filter((t) => inBlocks(t.entryTime, b));
const c1 = execute(X, sig, opts), re = execute(X, sig, { ...opts, reentryMin: 90 });
const out = { counted: pick(re, P.count).map((t) => ({ t: t.entryTime, r: t.r, re: t.step === 're' })), c1: pick(c1, P.count).map((t) => ({ t: t.entryTime, r: t.r })) };
const lines = [`# Réentrées rapides (RE) : ${SYM} ${phase}`, '', '```'];
const log = (s) => { console.log(s); lines.push(s); };
log(`C1 seul        ${fmt(stats(pick(c1, P.count)))}`);
log(`C1 + RE        ${fmt(stats(pick(re, P.count)))}`);
const reOnly = pick(re, P.count).filter((t) => t.step === 're');
log(`réentrées      ${fmt(stats(reOnly))}`);
if (P.descriptive) log(`réentrées 2025 ${fmt(stats(pick(re, P.descriptive).filter((t) => t.step === 're')))}`);
if (phase === 'explore') { const v = exploreVerdict(reOnly, P.halves); log(`moitiés des réentrées : ${v.halves.map((h) => `${h.n} trades ${sgn(h.mean, 3)} R`).join(' | ')}`); log(`VERDICT EXPLORATION : ${v.retained && stats(pick(re, P.count)).mean > stats(pick(c1, P.count)).mean ? 'RETENUE' : 'REJETÉE'}`); }
lines.push('```');
fs.writeFileSync(`data/backtest-input/esdras-reentry-${SYM}-${phase}.md`, lines.join('\n') + '\n');
fs.writeFileSync(`data/backtest-input/esdras-reentry-${SYM}-${phase}.json`, JSON.stringify(out));
