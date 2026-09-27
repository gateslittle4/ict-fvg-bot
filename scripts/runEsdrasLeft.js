#!/usr/bin/env node
// runEsdrasLeft.js - schéma des captures d'Esdras (preregistration-esdras-leftfvg-2026-09-27.md) : LD0, LD3 et chaque confirmation seule.
// Usage : NIGHT_PHASE=<phase> node --max-old-space-size=12000 scripts/runEsdrasLeft.js <US100|US500> <explore|validation|final>
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { signalsLeft, execute } from './lib/esdrasMethod.js';
const SYM = process.argv[2], phase = process.argv[3], P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), opts = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const specs = { LD0: {}, LD3: { a: true, b: true, c: true }, LDa: { a: true }, LDb: { b: true }, LDc: { c: true } };
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
const pick = (l, bl) => l.filter((t) => inBlocks(t.entryTime, bl));
const lines = [`# Schéma des captures (FVG à gauche) : ${SYM} ${phase}`, '', '```'], out = {};
const log = (s) => { console.log(s); lines.push(s); };
for (const [k, o] of Object.entries(specs)) {
  const tr = execute(X, signalsLeft(X, o), opts), c = pick(tr, P.count), s = stats(c), r = c.map((t) => t.r).sort((x, y) => y - x);
  log(`${k}  ${fmt(s)}  sans les 5 meilleurs ${sgn(r.slice(5).reduce((x, y) => x + y, 0), 1)} R`);
  if (P.descriptive) log(`${k} 2025 ${fmt(stats(pick(tr, P.descriptive)))}`);
  if (phase === 'explore' && (k === 'LD0' || k === 'LD3')) { const v = exploreVerdict(c, P.halves); const ok = s.n >= 60 && s.mean > 0 && s.t >= 2.5 && v.halves.every((h) => h.sum > 0); log(`   ${k} : ${ok ? 'RETENUE' : 'REJETÉE'} (moitiés ${v.halves.map((h) => sgn(h.mean, 3)).join(' / ')} R ; seuil t 2,5)`); }
  out[k] = c.map((t) => ({ t: t.entryTime, r: t.r }));
}
lines.push('```');
fs.writeFileSync(`data/backtest-input/esdras-left-${SYM}-${phase}.md`, lines.join('\n') + '\n');
fs.writeFileSync(`data/backtest-input/esdras-left-${SYM}-${phase}.json`, JSON.stringify(out));
