#!/usr/bin/env node
// runNightManageExplore.js - recherche de nuit, famille C (gestion), EXPLORATION 2011-2018 seulement : sur les règles FVG sélectionnées
// (night-select-fvg.json), réentrée sur le même FVG après un stop (ses réentrées gagnaient), seuil de rentabilité à +1R, sortie à 12 h
// ou 16 h au lieu de 11 h, un seul trade par jour. Sélection comme les autres familles (t >= 2, deux moitiés positives, 2 places).
// Usage : node --max-old-space-size=12000 scripts/runNightManageExplore.js  -> data/backtest-input/night-explore-manage.{md,json}
import fs from 'node:fs';
import { loadPhase, PHASES, exploreVerdict, sgn, inBlocks } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { qualifications, opportunities, ruleTrades } from './lib/eyeRule.js';
import { WINDOWS, paramsFor } from './lib/nightFvgGrid.js';

const sel = JSON.parse(fs.readFileSync('data/backtest-input/night-select-fvg.json', 'utf8')).selected;
const bases = [...sel.A.map((r, q) => ({ ...r, id: `A${q + 1}` })), ...sel.B.map((r, q) => ({ ...r, id: `B${q + 1}` }))];
export const C_VARIANTS = {
  'base (sans changement)': {},
  'réentrée sur le même FVG après un stop': { reentry: true, maxPerFvg: 2 },
  'seuil de rentabilité à +1R': { beAt: 1 },
  'sortie à 12h': { exitMin: 720 },
  'sortie à 16h': { exitMin: 960 },
  'un seul trade par jour': { maxPerDay: 1 },
};
const res = [];
const cache = {};
for (const b of bases) {
  if (!cache[b.sym]) { const X = buildContext(loadPhase(b.sym, 'explore')); cache[b.sym] = { X, quals: qualifications(X) }; }
  const { X, quals } = cache[b.sym];
  for (const [cl, C] of Object.entries(C_VARIANTS)) {
    const W = { ...WINDOWS[b.window], maxPerFvg: C.maxPerFvg || 1 };
    const P = paramsFor(b.sym, b.window, b.filter, b.mgmt);
    if (C.exitMin && P.exit.type === 'ny') P.exit = { type: 'ny', min: C.exitMin };
    if (C.beAt) P.beAt = C.beAt;
    if (C.reentry) P.reentry = true;
    if (C.maxPerDay) P.maxPerDay = C.maxPerDay;
    const tr = ruleTrades(X, opportunities(quals, W), P).filter((t) => inBlocks(t.entryTime, PHASES.explore.count));
    const v = exploreVerdict(tr);
    res.push({ base: b.id, sym: b.sym, rule: `${b.window} — ${b.filter} — ${b.mgmt}`, variant: cl, n: v.all.n, mean: v.all.mean, sum: v.all.sum, t: v.all.t, h1: v.halves[0].sum, h2: v.halves[1].sum, pf: v.all.pf, maxDD: v.all.maxDD, retained: v.retained && cl !== 'base (sans changement)', reentries: tr.filter((t) => t.repeat).length });
  }
}
const el = res.filter((r) => r.retained).sort((a, b) => b.t - a.t);
const first = el[0], second = first && el.find((r) => r.base !== first.base || r.sym !== first.sym);
const selected = [first, second].filter(Boolean);
fs.writeFileSync('data/backtest-input/night-explore-manage.json', JSON.stringify({ res, selected }, null, 1));
const md = ['# Recherche de nuit — exploration 2011-2018, famille C (gestion des règles FVG sélectionnées)', '',
  'Script `scripts/runNightManageExplore.js`. Chaque variante change UNE chose à la règle de base. Retenue = t ≥ 2, deux moitiés positives, ≥ 60 trades (la base elle-même ne compte pas comme variante C).', '',
  '| Base | Marché | Variante | Trades | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux | Réentrées |', '|---|---|---|---|---|---|---|---|---|---|---|',
  ...res.map((r) => `| ${r.base} | ${r.sym} | ${r.variant} | ${r.n} | ${sgn(r.mean, 3)} | ${sgn(r.sum)} | ${r.t.toFixed(2)} | ${sgn(r.h1)} / ${sgn(r.h2)} | ${r.pf.toFixed(2)} | ${r.maxDD.toFixed(1)} | ${r.reentries} |`), '',
  '## Sélection C (figée pour la validation)', '', ...(selected.length ? selected.map((r, q) => `${q + 1}. ${r.base} (${r.sym}, ${r.rule}) + ${r.variant} : ${r.n} trades, ${sgn(r.mean, 3)} R/trade, t ${r.t.toFixed(2)}`) : ['Aucune variante retenue.']), ''];
fs.writeFileSync('data/backtest-input/night-explore-manage.md', md.join('\n') + '\n');
console.log(md.join('\n'));
