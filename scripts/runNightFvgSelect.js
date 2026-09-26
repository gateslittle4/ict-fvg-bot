#!/usr/bin/env node
// runNightFvgSelect.js - recherche de nuit, sélection des familles A et B selon l'AMENDEMENT 1 du pré-enregistrement : parmi les variantes
// retenues à l'exploration (night-explore-fvg.json), celles qui battent leur placebo (au plus 2 tirages sur 20 aussi bons), puis 2 places
// par famille (2e place : autre fenêtre ou autre marché). EXPLORATION 2011-2018 seulement.
// Usage : node --max-old-space-size=12000 scripts/runNightFvgSelect.js  -> data/backtest-input/night-select-fvg.{md,json}
import fs from 'node:fs';
import { loadPhase, PHASES, stats, sgn, inBlocks } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { qualifications, opportunities, ruleTrades, placeboOpps } from './lib/eyeRule.js';
import { WINDOWS, paramsFor } from './lib/nightFvgGrid.js';

const all = JSON.parse(fs.readFileSync('data/backtest-input/night-explore-fvg.json', 'utf8'));
const kept = all.filter((r) => r.retained);
let seed = 424242; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const bySym = {};
for (const r of kept) (bySym[r.sym] = bySym[r.sym] || []).push(r);
for (const [sym, list] of Object.entries(bySym)) {
  const X = buildContext(loadPhase(sym, 'explore')); const quals = qualifications(X);
  for (const r of list) {
    const W = WINDOWS[r.window], P = paramsFor(sym, r.window, r.filter, r.mgmt), opps = opportunities(quals, W);
    const real = stats(ruleTrades(X, opps, P).filter((t) => inBlocks(t.entryTime, PHASES.explore.count)));
    let beat = 0, sum = 0;
    for (let d = 0; d < 20; d++) { const s = stats(ruleTrades(X, placeboOpps(X, opps, W, rnd), P).filter((t) => inBlocks(t.entryTime, PHASES.explore.count))); if (s.mean >= real.mean) beat++; sum += s.mean; }
    Object.assign(r, { placeboBeat: beat, placeboMean: sum / 20, eligible: beat <= 2, check: Math.abs(real.sum - r.sum) < 1e-6 });
    console.log(`${sym} | ${r.fam} | ${r.window} | ${r.filter} | ${r.mgmt} | t ${r.t.toFixed(2)} | placebo ${sgn(r.placeboMean, 3)} vs ${sgn(r.mean, 3)} : ${beat}/20 ${r.eligible ? 'ÉLIGIBLE' : ''}`);
  }
}
const pick = (fam) => {
  const el = kept.filter((r) => r.fam === fam && r.eligible).sort((a, b) => b.t - a.t);
  if (!el.length) return [];
  const first = el[0], second = el.find((r) => r.window !== first.window || r.sym !== first.sym);
  return second ? [first, second] : [first];
};
const sel = { A: pick('A'), B: pick('B') };
fs.writeFileSync('data/backtest-input/night-select-fvg.json', JSON.stringify({ kept, selected: sel }, null, 1));
const row = (r) => `| ${r.sym} | ${r.fam} | ${r.window} | ${r.filter} | ${r.mgmt} | ${r.n} | ${sgn(r.mean, 3)} | ${r.t.toFixed(2)} | ${sgn(r.placeboMean, 3)} | ${r.placeboBeat}/20 | ${r.eligible ? 'oui' : 'non'} |`;
const md = ['# Recherche de nuit — sélection des familles A et B (amendement 1 : placebo obligatoire)', '',
  'Exploration 2011-2018 seulement. Placebo : opportunités déplacées de 1 à 6 bougies M15 au hasard, zone fictive à la même distance du prix, même gestion, 20 tirages ; éligible si le placebo fait aussi bien au plus 2 fois sur 20.', '',
  '| Marché | Fam. | Fenêtre | Filtre | Gestion | Trades | R moyen | t | Placebo R moyen | Placebo ≥ vraie | Éligible |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...[...kept].sort((a, b) => b.t - a.t).map(row), '',
  '## Sélection (figée pour la validation)', '',
  ...['A', 'B'].flatMap((f) => [`**Famille ${f}** : ${sel[f].length ? '' : 'aucune variante éligible.'}`, ...sel[f].map((r, q) => `${q + 1}. ${r.sym} — ${r.window} — ${r.filter} — ${r.mgmt} (exploration : ${r.n} trades, ${sgn(r.mean, 3)} R/trade, t ${r.t.toFixed(2)} ; placebo ${sgn(r.placeboMean, 3)})`), '']),
];
fs.writeFileSync('data/backtest-input/night-select-fvg.md', md.join('\n') + '\n');
console.log(md.slice(-8).join('\n'));
