#!/usr/bin/env node
// runEsdrasM1Risk.js - M1 (méthode d'Esdras, objectif fixe 3R) : effet du risque par trade sur le compte (descriptif, périodes déjà lues).
// Usage : NIGHT_PHASE=<phase> node --max-old-space-size=12000 scripts/runEsdrasM1Risk.js <explore|validation|final>
//   -> data/backtest-input/esdras-m1-trades-<phase>.json (heure d'entrée, heure de sortie, R)
import fs from 'node:fs';
import { loadPhase, spreadAt, swapCost } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, signals, execute } from './lib/esdrasMethod.js';
const phase = process.argv[2], S = loadPhase('US100', phase), X = buildContext(S);
const tr = execute(X, signals(X, h4Bias(X), m15Bms(X)), { spread: (p) => spreadAt('US100', p), swap: swapCost('US100'), fixedRR: 3 });
fs.writeFileSync(`data/backtest-input/esdras-m1-trades-${phase}.json`, JSON.stringify(tr.map((t) => ({ t: t.entryTime, x: t.exitTime, r: +t.r.toFixed(4) }))));
console.log(phase, tr.length, 'trades');
