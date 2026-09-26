#!/usr/bin/env node
// runNightFvgExplore.js - recherche de nuit (data/backtest-input/preregistration-nuit-2026-09-26.md), familles A et B : règles FVG M15
// sur l'EXPLORATION 2011-2018 seulement (loadPhase coupe les données au 1er janvier 2019 avant tout calcul).
// A = filtres tirés du profil de ses choix en 2025 (tendance 20 jours, 4 h en faveur, prise du plus bas/haut de la veille, âge 5-12,
//     modèle de ses choix data/backtest-input/night-eye-model.json) ; B = variantes mécaniques sans ce profil.
// Usage : node --max-old-space-size=12000 scripts/runNightFvgExplore.js [SYM ...]  -> data/backtest-input/night-explore-fvg.{md,json}
import fs from 'node:fs';
import { loadPhase, PHASES, exploreVerdict, sgn, inBlocks } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { qualifications, opportunities, ruleTrades } from './lib/eyeRule.js';
import { WINDOWS, FILTERS, MGMT, paramsFor } from './lib/nightFvgGrid.js';
import { OFF } from './lib/m1Data.js';

const SYMS = process.argv.slice(2).length ? process.argv.slice(2) : ['US100', 'US500', 'XAUUSD'];

const P = PHASES.explore;
const results = [];
const t0 = Date.now();
for (const sym of SYMS) {
  const S = loadPhase(sym, 'explore');
  const X = buildContext(S);
  const quals = qualifications(X);
  console.log(`${sym} : ${S.n} minutes jusqu'au ${new Date(S.t[S.n - 1] + OFF).toISOString().slice(0, 10)}, ${quals.length} qualifications (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const [wLab, W] of Object.entries(WINDOWS)) {
    const opps = opportunities(quals, W);
    for (const [fLab, F] of Object.entries(FILTERS)) {
      for (const mLab of Object.keys(MGMT)) {
        const params = paramsFor(sym, wLab, fLab, mLab);
        const tr = ruleTrades(X, opps, params).filter((t) => inBlocks(t.entryTime, P.count));
        const v = exploreVerdict(tr);
        const years = {}; for (const t of tr) { const y = new Date(t.entryTime + OFF).getUTCFullYear(); years[y] = (years[y] || 0) + t.r; }
        results.push({ sym, fam: F.fam, window: wLab, filter: fLab, mgmt: mLab, n: v.all.n, mean: v.all.mean, sum: v.all.sum, t: v.all.t, win: v.all.win, pf: v.all.pf, maxDD: v.all.maxDD, h1: v.halves[0].sum, h2: v.halves[1].sum, retained: v.retained, years });
      }
    }
  }
  console.log(`${sym} : ${results.filter((r) => r.sym === sym).length} variantes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
fs.writeFileSync('data/backtest-input/night-explore-fvg.json', JSON.stringify(results));
const row = (r) => `| ${r.sym} | ${r.fam} | ${r.window} | ${r.filter} | ${r.mgmt} | ${r.n} | ${Math.round(100 * r.win)} % | ${sgn(r.mean, 3)} | ${sgn(r.sum)} | ${r.t.toFixed(2)} | ${sgn(r.h1)} / ${sgn(r.h2)} | ${r.pf.toFixed(2)} | ${r.maxDD.toFixed(1)} | ${r.retained ? '**oui**' : ''} |`;
const head = '| Marché | Fam. | Fenêtre | Filtre | Gestion | Trades | Gagnants | R moyen | R total | t | 2011-14 / 2015-18 | PF | Pire creux R | Retenue |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const md = ['# Recherche de nuit — exploration 2011-2018, familles A et B (FVG M15)', '',
  `Pré-enregistrement : \`data/backtest-input/preregistration-nuit-2026-09-26.md\` (\`2708c32\`). Script : \`scripts/runNightFvgExplore.js\`. Données coupées au 31/12/2018 avant tout calcul. ${results.length} variantes (${SYMS.join(', ')}). R net du spread du projet et du swap. Retenue = au moins 60 trades, R moyen > 0, t ≥ 2, deux moitiés positives.`, '',
  `## Retenues (${results.filter((r) => r.retained).length})`, '', head, ...results.filter((r) => r.retained).sort((a, b) => b.t - a.t).map(row), '',
  '## Les 40 meilleures par t (toutes)', '', head, ...[...results].sort((a, b) => b.t - a.t).slice(0, 40).map(row), '',
  '## Répartition des t (toutes les variantes)', '',
  ...SYMS.map((s) => { const a = results.filter((r) => r.sym === s); return `- ${s} : ${a.length} variantes, t ≥ 2 : ${a.filter((r) => r.t >= 2).length}, t ≤ −2 : ${a.filter((r) => r.t <= -2).length}, R moyen > 0 : ${a.filter((r) => r.mean > 0).length}, médiane des t ${[...a].sort((x, y) => x.t - y.t)[a.length >> 1].t.toFixed(2)}`; }), ''];
fs.writeFileSync('data/backtest-input/night-explore-fvg.md', md.join('\n') + '\n');
console.log(md.slice(0, 12 + results.filter((r) => r.retained).length).join('\n'));
console.log(md.slice(-5).join('\n'));
