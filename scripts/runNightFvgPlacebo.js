#!/usr/bin/env node
// runNightFvgPlacebo.js - recherche de nuit, EXPLORATION 2011-2018 seulement (descriptif, ne décide rien) : le FVG compte-t-il, ou
// seulement « acheter un petit repli le matin dans la tendance » ? Placebo : chaque opportunité est déplacée de 1 à 6 bougies M15 au
// hasard (même sens, même fenêtre horaire), avec une « zone » fictive à la même distance du prix que la vraie ; même gestion, mêmes
// filtres. 20 tirages. Plus la dérive seule : achat au marché à chaque clôture M15 de la fenêtre, même gestion.
// Usage : node --max-old-space-size=12000 scripts/runNightFvgPlacebo.js  -> data/backtest-input/night-explore-fvg-placebo.md
import fs from 'node:fs';
import { loadPhase, PHASES, spreadAt, swapCost, stats, sgn, inBlocks, nyMin } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { qualifications, opportunities, ruleTrades } from './lib/eyeRule.js';

const CASES = [
  { lab: 'FVG frais (0-4), 3h-11h, limite au bord, stop 1 ATR, 3R, sortie 11h', W: { ageMin: 0, ageMax: 4, fromMin: 180, toMin: 660 }, M: { entry: 'limit', stop: { type: 'atr', k: 1 }, rr: 3, exit: { type: 'ny', min: 660 } } },
  { lab: 'FVG 5-12, 9h30-11h, marché, stop derrière la zone, 3R, sortie 11h', W: { ageMin: 5, ageMax: 12, fromMin: 570, toMin: 660 }, M: { entry: 'market', stop: { type: 'zone' }, rr: 3, exit: { type: 'ny', min: 660 } } },
  { lab: 'FVG 5-12, 3h-11h, marché, stop 1 ATR, 3R, sortie 11h', W: { ageMin: 5, ageMax: 12, fromMin: 180, toMin: 660 }, M: { entry: 'market', stop: { type: 'atr', k: 1 }, rr: 3, exit: { type: 'ny', min: 660 } } },
];
const FILTERS = { aucun: null, 'tendance 20 j': (f) => f.trend20 > 0, '4 h en faveur': (f) => f.r4h > 0, 'achats seulement': (f) => f.long === 1 };
let seed = 20260926; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const md = ['# Recherche de nuit — placebo des règles FVG (exploration 2011-2018, descriptif)', '',
  'Chaque opportunité déplacée de 1 à 6 bougies M15 au hasard (même sens, même fenêtre), zone fictive à la même distance du prix, même gestion et mêmes filtres (20 tirages). « Dérive » = entrée au marché à chaque clôture M15 de la fenêtre dans le sens indiqué, même gestion. Si le placebo fait aussi bien que la vraie règle, le FVG n\'y est pour rien.', ''];
for (const sym of ['US100', 'US500', 'XAUUSD']) {
  const S = loadPhase(sym, 'explore'); const X = buildContext(S); const quals = qualifications(X); const { b15 } = X;
  md.push(`## ${sym}`, '', '| Règle | Filtre | Vraie règle (trades, R moyen, t) | Placebo (moyenne de 20 tirages : R moyen, t) | Part de la vraie règle battue par le placebo |', '|---|---|---|---|---|');
  for (const C of CASES) {
    const opps = opportunities(quals, C.W);
    for (const [fl, ff] of Object.entries(FILTERS)) {
      const P = { ...C.M, filter: ff, spreadAt: (p) => spreadAt(sym, p), swap: swapCost(sym) };
      const real = stats(ruleTrades(X, opps, P).filter((t) => inBlocks(t.entryTime, PHASES.explore.count)));
      const pl = [];
      for (let d = 0; d < 20; d++) {
        const fake = [];
        for (const o of opps) {
          for (let tries = 0; tries < 10; tries++) {
            const sh = (1 + Math.floor(rnd() * 6)) * (rnd() < 0.5 ? -1 : 1), j = o.j + sh;
            if (j < 30 || j >= b15.length - 1) continue;
            const tau = b15[j].t + 15 * 60000, nm = nyMin(tau);
            if (nm < C.W.fromMin || nm >= C.W.toMin || b15[j + 1].t - tau > 5 * 60000) continue;
            const dlt = b15[j].c - b15[o.j].c;
            fake.push({ ...o, j, tau, nm, z: { ...o.z, top: o.z.top + dlt, bot: o.z.bot + dlt }, k: o.k + sh });
            break;
          }
        }
        fake.sort((a, b) => a.tau - b.tau);
        pl.push(stats(ruleTrades(X, fake, P).filter((t) => inBlocks(t.entryTime, PHASES.explore.count))));
      }
      const pm = pl.reduce((s, x) => s + x.mean, 0) / pl.length, pt = pl.reduce((s, x) => s + x.t, 0) / pl.length;
      md.push(`| ${C.lab} | ${fl} | ${real.n}, ${sgn(real.mean, 3)}, t ${real.t.toFixed(2)} | ${sgn(pm, 3)}, t ${pt.toFixed(2)} | ${pl.filter((x) => x.mean >= real.mean).length} / 20 |`);
      console.log(`${sym} | ${C.lab} | ${fl} | vraie ${real.n} ${sgn(real.mean, 3)} t ${real.t.toFixed(2)} | placebo ${sgn(pm, 3)} t ${pt.toFixed(2)} | ${pl.filter((x) => x.mean >= real.mean).length}/20`);
    }
  }
  // dérive seule : chaque clôture M15 3h-11h, achat (et vente) au marché, stop 1 ATR, 3R, sortie 11h, un trade à la fois
  for (const dir of [1, -1]) {
    const all = [];
    for (let j = 30; j < b15.length - 1; j++) { const tau = b15[j].t + 15 * 60000, nm = nyMin(tau); if (nm < 180 || nm >= 660 || b15[j + 1].t - tau > 5 * 60000) continue; all.push({ j, tau, nm, dir, k: j, age: 0, where: 'in', z: { top: b15[j].c, bot: b15[j].c, dir, k: j } }); }
    const d = stats(ruleTrades(X, all, { entry: 'market', stop: { type: 'atr', k: 1 }, rr: 3, exit: { type: 'ny', min: 660 }, spreadAt: (p) => spreadAt(sym, p), swap: swapCost(sym) }).filter((t) => inBlocks(t.entryTime, PHASES.explore.count)));
    md.push(`| Dérive : ${dir > 0 ? 'achat' : 'vente'} au marché à chaque clôture M15 3h-11h, stop 1 ATR, 3R, sortie 11h | — | ${d.n}, ${sgn(d.mean, 3)}, t ${d.t.toFixed(2)} | | |`);
    console.log(`${sym} dérive ${dir > 0 ? 'achat' : 'vente'} ${d.n} ${sgn(d.mean, 3)} t ${d.t.toFixed(2)}`);
  }
  md.push('');
}
fs.writeFileSync('data/backtest-input/night-explore-fvg-placebo.md', md.join('\n') + '\n');
