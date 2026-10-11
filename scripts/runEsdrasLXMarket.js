#!/usr/bin/env node
// runEsdrasLXMarket.js - LX-MKT (règle LX d'Esdras, entrée au marché après rejet), pré-enregistrée dans
// data/backtest-input/preregistration-lx-market-entry-2026-09-30.md. Exploration US100 2011-2018 seulement (validation et finale : une
// seule lecture, et seulement si l'exploration est retenue - non lancées ici). Compare aussi à l'ordre limite (descriptif).
// Usage : node --max-old-space-size=12000 scripts/runEsdrasLXMarket.js  -> data/backtest-input/esdras-lx-market-US100-explore.md
import fs from 'node:fs';
import { PHASES, inBlocks, spreadAt, swapCost, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { signalsLX, execute } from './lib/esdrasMethod.js';
import { executeMarket } from './lib/lxMarket.js';

const SYM = 'US100', DRAWS = 20;
const opts = { spread: (p) => spreadAt(SYM, p), swap: swapCost(SYM) };
const VARIANTS = { 'LX-A': { stopMode: 'A' }, 'LX-E': { stopMode: 'edge' }, 'LX-M': { stopMode: 'mid' } };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Amendement du pré-enregistrement : bougies M15 (une ligne par bougie, horodatée à sa dernière minute), faute de M1 HistData ici.
const P = PHASES.explore;
const rows = fs.readFileSync(`data/backtest-input/${SYM}.csv`, 'utf8').trim().split('\n').slice(1).map((l) => l.split(',').map(Number)).filter((r) => r[0] >= P.from && r[0] < P.to);
const col = (k) => Float64Array.from(rows, (r) => r[k]);
const S = { t: Float64Array.from(rows, (r) => r[0] + 14 * 60000), o: col(1), h: col(2), l: col(3), c: col(4), n: rows.length };
const X = buildContext(S);
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R  creux max ${s.maxDD.toFixed(1)} R`;
const lines = ['# Règle LX d\'Esdras, entrée au marché après rejet (LX-MKT) : US100 2011-2018', '',
  'Pré-enregistrement : `preregistration-lx-market-entry-2026-09-30.md` (commit `bd29d2a`, amendement `180fb4f` : bougies M15, règlement plus pessimiste que la minute). Placebo : 20 tirages, décalage de 1 à 6 bougies M15 au hasard, graine 20260930.', '', '```'];
const log = (s) => { console.log(s); lines.push(s); };
const cnt = (tr) => tr.filter((t) => inBlocks(t.entryTime, P.count));
for (const [k, o] of Object.entries(VARIANTS)) {
  const sigs = signalsLX(X, o);
  const mk = cnt(executeMarket(X, sigs, opts)), lim = cnt(execute(X, sigs, opts)), s = stats(mk), v = exploreVerdict(mk, P.halves);
  log(`${k}  MARCHÉ ${fmt(s)}`);
  log(`${k}  LIMITE ${fmt(stats(lim))}  (référence, ordre limite au bord)`);
  const inLim = new Map(lim.map((t) => [t.tau, t.r])), both = mk.filter((t) => inLim.has(t.tau));
  log(`   signaux pris par les deux : ${both.length}  R moyen marché ${sgn(stats(both).mean, 3)}  R moyen limite ${sgn(both.reduce((a, t) => a + inLim.get(t.tau), 0) / (both.length || 1), 3)}`);
  const rand = mulberry32(20260930);
  let worse = 0; const pm = [];
  for (let d = 0; d < DRAWS; d++) {
    const m = stats(cnt(executeMarket(X, sigs, { ...opts, shift: () => 1 + Math.floor(rand() * 6) }))).mean; pm.push(m); if (m >= s.mean) worse++;
  }
  log(`   placebo : R moyen ${sgn(pm.reduce((a, x) => a + x, 0) / DRAWS, 3)} (min ${sgn(Math.min(...pm), 3)}, max ${sgn(Math.max(...pm), 3)}) ; le placebo fait au moins aussi bien ${worse} fois sur ${DRAWS}`);
  const ok = s.n >= 60 && s.mean > 0 && s.t >= 2.5 && v.halves.every((h) => h.sum > 0) && worse <= 1;
  log(`   ${k} : ${ok ? 'RETENUE' : 'REJETÉE'} (moitiés ${v.halves.map((h) => sgn(h.mean, 3)).join(' / ')} R ; seuil t 2,5 ; placebo battu ${DRAWS - worse}/${DRAWS}, il en faut 19)`);
}
lines.push('```');
fs.writeFileSync(`data/backtest-input/esdras-lx-market-${SYM}-explore.md`, lines.join('\n') + '\n');
