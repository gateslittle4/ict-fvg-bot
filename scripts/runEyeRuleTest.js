#!/usr/bin/env node
// runEyeRuleTest.js - test de la règle tirée de l'œil d'Esdras (data/backtest-input/preregistration-eye-rule-2026-09-27.md).
// FVG M15 US100 haussier, vierge (bougie avant A et bougie D hors de la zone), C et D fermées entre 7 h et 11 h NY, zone >= 0,25 ATR H1 ;
// limite au haut de la zone, stop sous la mèche de A, 3R, annulé si objectif avant / à 11 h NY, sortie 11 h NY.
// Usage : node --max-old-space-size=12000 scripts/runEyeRuleTest.js explore
//         NIGHT_PHASE=validation node ... validation   (lecture unique)
//         NIGHT_PHASE=final node ... final             (lecture unique)
import fs from 'node:fs';
import { PHASES, inBlocks, loadPhase, spreadAt, swapCost, simulate, nyMin, dayKey, MIN, stats, exploreVerdict, sgn } from './lib/nightLab.js';
import { buildContext, atrH1At } from './lib/fvgContext.js';
import { nextNyTime } from './lib/eyeRule.js';
import { eng } from './lib/m1Data.js';

const SYM = 'US100', FROM = 420, TO = 660, EXIT = 660;
const phase = process.argv[2] || 'explore';
const P = PHASES[phase];
const S = loadPhase(SYM, phase), X = buildContext(S), { b15 } = X;
const touches = (b, z) => b.h >= z.bot && b.l <= z.top;
const inWin = (m) => m >= FROM && m < TO;

/** Tous les FVG du sens `dir` dont D reste hors de la zone, avec leurs attributs (vierge, taille en ATR H1) et le trade simulé. */
function candidates(dir, blocks) {
  const out = [];
  for (const z of X.fvg[0]) {
    if (z.dir !== dir) continue;
    const k = z.k, j = k + 1; if (k < 3 || j >= b15.length - 1) continue;
    const D = b15[j], tau = D.t + 15 * MIN;
    if (!inBlocks(tau, blocks)) continue;
    if (!inWin(nyMin(b15[k].t + 15 * MIN)) || !inWin(nyMin(tau))) continue;
    if (touches(D, z)) continue;
    if (b15[j + 1].t - tau > 5 * MIN) continue;
    const i = b15[j].i1 + 1, atr = atrH1At(X, i); if (!atr) continue;
    const L = dir > 0 ? z.top : z.bot, A = b15[k - 2], stop = dir > 0 ? A.l : A.h, exitAt = nextNyTime(tau, EXIT);
    const target = L + dir * 3 * Math.abs(L - stop);
    const t = simulate(S, { dir, i, entry: { type: 'limit', price: L }, expiry: exitAt, stop, rr: 3, target, cancelIfTarget: true, exitAt, spread: spreadAt(SYM, L), swap: swapCost(SYM) });
    out.push({ tau, day: dayKey(tau), clean: !touches(b15[k - 3], z), size: (z.top - z.bot) / atr, t });
  }
  return out;
}
const filled = (list) => list.filter((c) => !c.t.missed).map((c) => ({ ...c.t, day: c.day }));
const firstOfDay = (list) => { const seen = new Set(); return list.filter((c) => (seen.has(c.day) ? false : (seen.add(c.day), true))); };
const rule = (list, minSize) => list.filter((c) => c.clean && c.size >= minSize);
const fmt = (s) => `${String(s.n).padStart(4)} trades  R moyen ${sgn(s.mean, 3)}  t ${s.t.toFixed(2)}  gagnants ${(100 * s.win).toFixed(0)} %  total ${sgn(s.sum, 1)} R`;

const lines = [`# Règle de l'œil : phase ${phase} (${new Date().toISOString().slice(0, 10)})`, ''];
const log = (s) => { console.log(s); lines.push(s); };
const blocksList = [['compté', P.count], ...(P.descriptive ? [['2025 (descriptif)', P.descriptive]] : [])];
let verdict = '';
for (const [label, blocks] of blocksList) {
  const buys = candidates(1, blocks), sells = candidates(-1, blocks);
  const main = filled(rule(buys, 0.25)), ref = filled(buys);
  log(`## ${label}`);
  log('```');
  log(`RÈGLE (achat, vierge, >= 0,25 ATR)  ${fmt(stats(main))}`);
  log(`référence (achat, sans filtres)     ${fmt(stats(ref))}`);
  log(`variante >= 0,10 ATR                ${fmt(stats(filled(rule(buys, 0.10))))}`);
  log(`variante 1er FVG qualifié du jour   ${fmt(stats(filled(firstOfDay(rule(buys, 0.25)))))}`);
  log(`vierge seul (sans taille)           ${fmt(stats(filled(buys.filter((c) => c.clean))))}`);
  log(`taille seule (non vierge inclus)    ${fmt(stats(filled(buys.filter((c) => c.size >= 0.25))))}`);
  log(`miroir vente (règle)                ${fmt(stats(filled(rule(sells, 0.25))))}`);
  log(`miroir vente (référence)            ${fmt(stats(filled(sells)))}`);
  log('```');
  if (label !== 'compté') continue;
  const s = stats(main), r = stats(ref);
  if (phase === 'explore') {
    const v = exploreVerdict(main, P.halves);
    log(`moitiés : ${v.halves.map((h) => `${h.n} trades ${sgn(h.mean, 3)} R (total ${sgn(h.sum, 1)})`).join(' | ')}`);
    const pass = v.retained && s.mean > r.mean;
    verdict = `VERDICT EXPLORATION : ${pass ? 'RETENUE' : 'REJETÉE'} (>= 60 trades, R > 0, t >= 2, deux moitiés > 0 : ${v.retained ? 'oui' : 'non'} ; bat la référence : ${s.mean > r.mean ? 'oui' : 'non'})`;
  } else if (phase === 'validation') verdict = `VERDICT VALIDATION : ${s.mean > 0 && s.t >= 2 ? 'PASSE' : 'ÉCHOUE'} (R > 0 et t >= 2)`;
  else verdict = `VERDICT FINAL : ${s.mean > 0 ? 'PASSE' : 'ÉCHOUE'} (R > 0 sur 2023-2024 + 2026)`;
}
log(''); log(verdict);
fs.writeFileSync(`data/backtest-input/eye-rule-${phase}.md`, lines.join('\n') + '\n');
