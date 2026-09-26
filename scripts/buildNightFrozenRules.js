#!/usr/bin/env node
// buildNightFrozenRules.js - fige les règles sélectionnées par l'exploration de nuit (night-select-fvg.json, night-explore-manage.json,
// night-explore-quant.json) dans data/backtest-input/night-frozen-rules.json, à commiter AVANT toute lecture cachée.
import fs from 'node:fs';
import { D1_DIRS } from './lib/nightQuantGrid.js';
const rd = (f) => JSON.parse(fs.readFileSync(`data/backtest-input/${f}`, 'utf8'));
const fvg = rd('night-select-fvg.json').selected, man = rd('night-explore-manage.json').selected, q = rd('night-explore-quant.json').selected;
const rules = [];
const ex = (r) => ({ n: r.n, mean: r.mean, t: r.t });
fvg.A.forEach((r, k) => rules.push({ id: `A${k + 1}`, kind: 'fvg', label: `FVG M15 ${r.window}, ${r.filter}, ${r.mgmt}`, sym: r.sym, window: r.window, filter: r.filter, mgmt: r.mgmt, explore: ex(r) }));
fvg.B.forEach((r, k) => rules.push({ id: `B${k + 1}`, kind: 'fvg', label: `FVG M15 ${r.window}, ${r.filter}, ${r.mgmt}`, sym: r.sym, window: r.window, filter: r.filter, mgmt: r.mgmt, explore: ex(r) }));
man.forEach((r, k) => { const base = rules.find((x) => x.id === r.base); rules.push({ ...base, id: `C${k + 1}`, label: `${base.label} + ${r.variant}`, reentry: r.variant.startsWith('réentrée') || undefined, beAt: r.variant.startsWith('seuil') ? 1 : undefined, exitMin: r.variant === 'sortie à 12h' ? 720 : r.variant === 'sortie à 16h' ? 960 : undefined, maxPerDay: r.variant === 'un seul trade par jour' ? 1 : undefined, explore: ex(r) }); });
q.D1.forEach((r, k) => rules.push({ id: `D1${'ab'[k]}`, kind: 'dip', label: `Limite au creux ${r.window}, ${r.d} ATR, ${r.rr}R, ${r.dirs}, ${r.exec === 'limit' ? 'rempli au niveau' : 'au marché après le toucher'}`, sym: r.sym, window: r.window, d: r.d, rr: r.rr, dirsArr: D1_DIRS[r.dirs], exec: r.exec, explore: ex(r) }));
q.D2.forEach((r, k) => rules.push({ id: `D2${'ab'[k]}`, kind: 'gap', label: `Écart d'ouverture 9h30 ${r.window}, ${r.dirs}`, sym: r.sym, g: r.g, exitMin: r.exitMin, dirsArr: r.dirs === 'les deux' ? [1, -1] : [1], explore: ex(r) }));
q.D3.forEach((r, k) => rules.push({ id: `D3${'ab'[k]}`, kind: 'weekday', label: `${['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'][r.dow]} : ${r.dirs} 9h31 -> 16h, stop 1 ATR`, sym: r.sym, dow: r.dow, dir: r.dir, explore: ex(r) }));
fs.writeFileSync('data/backtest-input/night-frozen-rules.json', JSON.stringify({ frozenAt: new Date().toISOString(), note: 'Règles figées avant toute lecture de 2019 et après (preregistration-nuit-2026-09-26.md). Ne pas modifier.', rules }, null, 1));
for (const r of rules) console.log(`${r.id.padEnd(4)} ${r.sym.padEnd(6)} ${r.label} | exploration ${r.explore.n} trades, ${r.explore.mean >= 0 ? '+' : ''}${r.explore.mean.toFixed(3)} R, t ${r.explore.t.toFixed(2)}`);
