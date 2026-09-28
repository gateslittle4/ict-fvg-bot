#!/usr/bin/env node
// runEsdrasMods.js - mes modifications de la méthode d'Esdras (data/backtest-input/preregistration-esdras-method-mods-2026-09-27.md).
// Usage : node --max-old-space-size=12000 scripts/runEsdrasMods.js explore [M1,M2,...]
//         NIGHT_PHASE=validation node ... validation M1,...   (candidates retenues seulement, lecture unique)
//         NIGHT_PHASE=final node ... final M1,...             (lecture unique)
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { h4Bias, m15Bms, bmsOf, signals, execute } from './lib/esdrasMethod.js';

const SYM = 'US100', phase = process.argv[2] || 'explore', P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S);
const bias = h4Bias(X), bms = m15Bms(X), daily = bmsOf(S, X.bD);
const base = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const SPECS = {
  C1: [{}, {}],
  M1: [{}, { fixedRR: 3 }],
  M2: [{ discount: true }, {}],
  M3: [{ daily }, {}],
  M4: [{}, { beAt: 2 }],
  M5: [{ discount: true, daily }, { fixedRR: 3, beAt: 2 }],
};
const wanted = process.argv[3] ? ['C1', ...process.argv[3].split(',')] : Object.keys(SPECS);
const C1_EXPLORE = 0.004; // C1 en exploration (preregistration-esdras-method-2026-09-27.md)
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
const lines = [`# Modifications de la méthode d'Esdras : phase ${phase}`, ''];
const log = (s) => { console.log(s); lines.push(s); };
const runs = {};
for (const k of wanted) { const [so, eo] = SPECS[k]; runs[k] = execute(X, signals(X, bias, bms, so), { ...base, ...eo }); }
const verdicts = [];
for (const [label, blocks] of [['compté', P.count], ...(P.descriptive ? [['2025 (descriptif)', P.descriptive]] : [])]) {
  log(`## ${label}`); log('```');
  for (const [k, list] of Object.entries(runs)) {
    const l = list.filter((t) => inBlocks(t.entryTime, blocks)), s = stats(l);
    const r = l.map((t) => t.r).sort((a, b) => b - a), top5 = r.slice(5).reduce((a, x) => a + x, 0);
    log(`${k}  ${fmt(s)}  sans les 5 meilleurs ${sgn(top5, 1)} R`);
    if (label !== 'compté' || k === 'C1') continue;
    if (phase === 'explore') {
      const v = exploreVerdict(l, P.halves), ok = v.all.n >= 60 && s.mean > 0 && s.t >= 2.5 && v.halves.every((h) => h.sum > 0) && s.mean > C1_EXPLORE;
      verdicts.push(`${k} : ${ok ? 'RETENUE' : 'REJETÉE'} (moitiés ${v.halves.map((h) => sgn(h.mean, 3)).join(' / ')} R ; t ${s.t.toFixed(2)} ; seuil 2,5)`);
    } else if (phase === 'validation') verdicts.push(`${k} : ${s.mean > 0 && s.t >= 2 ? 'PASSE' : 'ÉCHOUE'} (R > 0 et t >= 2)`);
    else verdicts.push(`${k} : ${s.mean > 0 && s.t >= 2 ? 'PASSE' : 'ÉCHOUE'} (amendement du 27/09 : R > 0 ET t >= 2 ; R > 0 seul : ${s.mean > 0 ? 'oui' : 'non'})`);
  }
  log('```');
}
log(''); log(`VERDICT ${phase.toUpperCase()}`); for (const v of verdicts) log(`- ${v}`);
fs.writeFileSync(`data/backtest-input/esdras-mods-${phase}.md`, lines.join('\n') + '\n');
