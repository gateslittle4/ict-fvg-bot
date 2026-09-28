#!/usr/bin/env node
// runEsdrasSweep.js - règle SW (preregistration-esdras-sweep-us500-2026-09-27.md) : C1 seulement quand le sens H4 vient d'une prise de
// liquidité. Usage : NIGHT_PHASE=<phase> node --max-old-space-size=12000 scripts/runEsdrasSweep.js <US500|US100> <explore|validation|final>
// Écrit les trades (R, heure d'entrée) dans data/backtest-input/esdras-sweep-<SYM>-<phase>.json pour l'addition des périodes.
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, signals, execute } from './lib/esdrasMethod.js';

const SYM = process.argv[2], phase = process.argv[3], P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), bias = h4Bias(X), bms = m15Bms(X);
const opts = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const out = {};
for (const [k, so] of [['C1', {}], ['SW', { why: 'sweep' }]]) {
  const tr = execute(X, signals(X, bias, bms, so), opts);
  out[k] = { counted: tr.filter((t) => inBlocks(t.entryTime, P.count)).map((t) => ({ t: t.entryTime, r: t.r })), descriptive: P.descriptive ? tr.filter((t) => inBlocks(t.entryTime, P.descriptive)).map((t) => ({ t: t.entryTime, r: t.r })) : [] };
  const s = stats(out[k].counted); console.log(`${SYM} ${phase} ${k} : ${s.n} trades, ${sgn(s.mean, 3)} R, t ${s.t.toFixed(2)}`);
}
fs.writeFileSync(`data/backtest-input/esdras-sweep-${SYM}-${phase}.json`, JSON.stringify(out));
