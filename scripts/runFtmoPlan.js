#!/usr/bin/env node
// runFtmoPlan.js
// Usage: node --max-old-space-size=4096 scripts/runFtmoPlan.js
//
// Esdras (2026-09-20): "si j'etais sur de prendre le challenge 1 step FTMO, comment augmenter nos chances ? ensuite
// fais ce meme test avec les mecanismes et l'ATR recommande pour les 7 derniers mois pour voir comment la strategie
// aurait performe en 2026".
// Part A - 2010-2025: FTMO 1-Step attempts of the RECOMMENDED portfolio (2 mechanisms dropped, per-mechanism ATR
//          floor) under different risk-per-trade policies, on all years and on 2024-2025 (the years the floors were
//          NOT chosen on).
// Part B - the 7 real months of 2026 (broker candles, shifted to engine time): a fully out-of-sample check of the
//          recommended configuration vs today's (all mechanisms, own stops).
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts, unitOf, RECOMMENDED, DROPPED, DAY } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2024, 0, 1);
const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
const money = (n) => `$${n.toFixed(0)}`;
const md = [];
const day = (t) => new Date(t).toISOString().slice(0, 10);

const recK = (u) => RECOMMENDED[u] ?? 0;
const recSet = new Set(Object.keys(RECOMMENDED));

// ---------------- Part A: history
const hist = buildTrades(SYMBOLS, (s) => loadCandlesFromCsv(path.join('data/backtest-input', `${s}.csv`)).candles, (l) => console.error(l));
const simH = makeSimulator(hist);
const portfolio = simH(recK, recSet);
const test = portfolio.filter((t) => t.time >= CUT);
const policies = [
  ['0,25 % par trade', () => 0.0025],
  ['0,50 % par trade (aujourd\'hui)', () => 0.005],
  ['0,75 % par trade', () => 0.0075],
  ['1,00 % par trade', () => 0.01],
  ['0,50 %, puis 0,25 % dès +6 % (on protège le gain)', (bal) => (bal >= 10600 ? 0.0025 : 0.005)],
  ['0,50 %, puis 0,25 % sous -4 % (on freine après une baisse)', (bal) => (bal <= 9600 ? 0.0025 : 0.005)],
  ['0,75 % sous +5 %, 0,25 % dès +5 %', (bal) => (bal >= 10500 ? 0.0025 : 0.0075)],
];
md.push('# Plan FTMO 1-Step : comment augmenter les chances, et la stratégie recommandée sur les 7 mois de 2026', '');
md.push('## A. Politique de risque (portefeuille recommandé : 13 mécanismes, plancher ATR par mécanisme)', '');
md.push('Chaque « tentative » repart à 10 000 $, objectif +10 %, perte max 10 % (trailing fin de journée, moteur `GuardrailEngine` du projet). Taux = réussies / (réussies + échouées).', '');
md.push('| Politique de risque | 2010-2025 : réussies / échouées (taux) | Jours médians pour réussir | **2024-2025 seul** : réussies / échouées (taux) |', '|---|---|---|---|');
for (const [name, f] of policies) {
  const a = ftmoAttempts(portfolio, f), b = ftmoAttempts(test, f);
  const rate = (x) => (x.pass + x.fail ? (x.pass / (x.pass + x.fail) * 100).toFixed(0) : '—');
  md.push(`| ${name} | ${a.pass} / ${a.fail} (**${rate(a)} %**) | ${a.medDays ? a.medDays.toFixed(0) : '—'} | ${b.pass} / ${b.fail} (${rate(b)} %) |`);
}
const origin = simH(() => 0, null);
{ const a = ftmoAttempts(origin), b = ftmoAttempts(origin.filter((t) => t.time >= CUT)); const rate = (x) => (x.pass / (x.pass + x.fail) * 100).toFixed(0);
  md.push(`| *Pour mémoire : le bot d'aujourd'hui (15 mécanismes, stops d'origine, 0,5 %)* | ${a.pass} / ${a.fail} (${rate(a)} %) | ${a.medDays?.toFixed(0)} | ${b.pass} / ${b.fail} (${rate(b)} %) |`); }
md.push('');

// ---------------- Part B: 2026
const shift = (cs) => cs.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
const loadReal = (s) => {
  const m = new Map();
  for (const dir of ['data/real-data-2026-02-to-09', 'data/real-data-2026-09-17']) { try { for (const c of loadCandlesFromCsv(path.join(dir, `${s}.csv`)).candles) m.set(c.time, c); } catch {} }
  return shift([...m.values()].sort((a, b) => a.time - b.time));
};
const real = buildTrades(SYMBOLS, loadReal, (l) => console.error('[2026]' + l));
const simR = makeSimulator(real);
const cfgs = [
  ['Aujourd\'hui : 15 mécanismes, stops d\'origine', simR(() => 0, null)],
  ['Recommandé : 13 mécanismes, plancher ATR par mécanisme', simR(recK, recSet)],
  ['Recommandé, mais seulement les 6 « GARDER » solides', simR(recK, new Set(['US500 fvg', 'US100 nwog', 'US100 fvg', 'US500 divergence', 'US100 silver', 'GER40 nwog']))],
];
const startReal = Math.min(...SYMBOLS.map((s) => loadReal(s)[0].time));
md.push('## B. Les 7 mois de 2026 (données réelles du broker, jamais utilisées pour choisir la configuration)', '');
md.push(`Période ${day(startReal)} → ${day(Math.max(...cfgs[0][1].map((t) => t.exit)))}. Trades rejugés avec la même règle pour les trois lignes (stop touché dans la bougie d'entrée = perte, spread inclus, filtre « stop ≥ 3× le spread », garde-fous simplifiés). 10 000 $, 0,5 % de risque par trade, sans plafond d'objectif.`, '');
md.push('| Configuration | Trades | Gagnants | R net | Compte final | Plus haut / plus bas | Pire baisse | Défis FTMO 1-Step (réussis / échoués / en cours) |', '|---|---|---|---|---|---|---|---|');
for (const [name, list] of cfgs) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, low = 10000, dd = 0; for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); low = Math.min(low, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const f = ftmoAttempts(list);
  md.push(`| ${name} | ${list.length} | ${(list.filter((t) => t.net > 0).length / list.length * 100).toFixed(0)} % | ${fmt(list.reduce((a, t) => a + t.net, 0))} | **${money(bal)}** (${fmt((bal - 10000) / 100)} %) | ${money(peak)} / ${money(low)} | ${dd.toFixed(0)} % | ${f.pass} / ${f.fail} / ${f.attempts.filter((a) => a.result === 'EN COURS').length} |`);
}
md.push('', '### Cycles FTMO de la configuration recommandée en 2026', '', '| # | Début | Fin | Résultat | Solde fin |', '|---|---|---|---|---|');
ftmoAttempts(cfgs[1][1]).attempts.forEach((a, i) => md.push(`| ${i + 1} | ${day(a.from)} | ${day(a.to)} | ${a.result} | ${money(a.end)} |`));
md.push('', '### Mécanisme par mécanisme en 2026 (R net, configuration recommandée / stop d\'origine)', '', '| Mécanisme | Trades | R net recommandé | R net stop d\'origine |', '|---|---|---|---|');
const units = [...new Set(real.all.map(unitOf))].sort();
for (const u of units) {
  const r = cfgs[1][1].filter((t) => t.unit === u), o = simR(() => 0, new Set([u]));
  const o2 = o.reduce((a, t) => a + t.net, 0);
  md.push(`| ${u}${DROPPED.includes(u) ? ' (retiré)' : ''} | ${r.length || o.length} | ${r.length ? fmt(r.reduce((a, t) => a + t.net, 0)) : '—'} | ${fmt(o2)} |`);
}
md.push('', '## Limites', '', '- 2026 = 7 mois (~ 350 trades) : un échantillon, pas une preuve. Le meilleur test honnête de la configuration recommandée reste un suivi en démo.', '- Entrées issues des modules de backtest ; spread constant ; pas de glissement ni d\'élargissement du spread au rollover ; garde-fous simplifiés.', '- Les cycles FTMO recommencent à 10 000 $ après chaque réussite ou échec ; chaque échec coûterait en vrai le prix d\'une nouvelle inscription.');
const out = path.join('data', 'backtest-input', 'ftmo-plan-2010-2026.md');
fs.writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
console.error(`Wrote ${out}`);
