#!/usr/bin/env node
// runEsdrasMethod.js - test de la méthode d'Esdras (data/backtest-input/preregistration-esdras-method-2026-09-27.md).
// Usage : node --max-old-space-size=12000 scripts/runEsdrasMethod.js explore
//         NIGHT_PHASE=validation node ... validation   (lecture unique)
//         NIGHT_PHASE=final node ... final             (lecture unique)
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, signals, execute } from './lib/esdrasMethod.js';

const SYM = 'US100', phase = process.argv[2] || 'explore', P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S);
const bias = h4Bias(X), bms = m15Bms(X);
const opts = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const sigBias = signals(X, bias, bms), sigB0 = signals(X, bias, bms, { useBias: false });
const runs = { C1: execute(X, sigBias, opts), C2: execute(X, sigBias, { ...opts, trail: true }), B0: execute(X, sigB0, opts) };
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
const lines = [`# Méthode d'Esdras : phase ${phase}`, '', `Signaux retenus (sens H4) : ${sigBias.length} ; référence B0 : ${sigB0.length}.`, ''];
const log = (s) => { console.log(s); lines.push(s); };
const blocksList = [['compté', P.count], ...(P.descriptive ? [['2025 (descriptif)', P.descriptive]] : [])];
const verdicts = [];
for (const [label, blocks] of blocksList) {
  const pick = (list) => list.filter((t) => inBlocks(t.entryTime, blocks));
  log(`## ${label}`); log('```');
  for (const [k, list] of Object.entries(runs)) log(`${k}  ${fmt(stats(pick(list)))}`);
  const c1 = pick(runs.C1);
  log(`C1 achats   ${fmt(stats(c1.filter((t) => t.dir > 0)))}`);
  log(`C1 ventes   ${fmt(stats(c1.filter((t) => t.dir < 0)))}`);
  log(`C1 matin    ${fmt(stats(c1.filter((t) => t.win === 0)))}`);
  log(`C1 soir     ${fmt(stats(c1.filter((t) => t.win === 1)))}`);
  log(`C1 1er ordre ${fmt(stats(c1.filter((t) => t.step === 1)))}`);
  log(`C1 2e ordre  ${fmt(stats(c1.filter((t) => t.step === 2)))}`);
  const why = {}; for (const t of c1) why[t.reason] = (why[t.reason] || 0) + 1;
  log(`C1 sorties : ${Object.entries(why).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  log('```');
  if (label !== 'compté') continue;
  const b0 = stats(pick(runs.B0));
  for (const k of ['C1', 'C2']) {
    const list = pick(runs[k]), s = stats(list);
    if (phase === 'explore') {
      const v = exploreVerdict(list, P.halves);
      log(`${k} moitiés : ${v.halves.map((h) => `${h.n} trades ${sgn(h.mean, 3)} R`).join(' | ')}`);
      verdicts.push(`${k} : ${v.retained && s.mean > b0.mean ? 'RETENUE' : 'REJETÉE'} (critères de base : ${v.retained ? 'oui' : 'non'} ; bat B0 : ${s.mean > b0.mean ? 'oui' : 'non'})`);
    } else if (phase === 'validation') verdicts.push(`${k} : ${s.mean > 0 && s.t >= 2 ? 'PASSE' : 'ÉCHOUE'} (R > 0 et t >= 2)`);
    else verdicts.push(`${k} : ${s.mean > 0 ? 'PASSE' : 'ÉCHOUE'} (R > 0)`);
  }
}
log(''); log(`VERDICT ${phase.toUpperCase()}`); for (const v of verdicts) log(`- ${v}`);
fs.writeFileSync(`data/backtest-input/esdras-method-${phase}.md`, lines.join('\n') + '\n');
