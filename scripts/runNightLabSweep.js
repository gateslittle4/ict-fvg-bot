#!/usr/bin/env node
// runNightLabSweep.js - recherche de nuit, SECOND TOUR (voir preregistration-nuit-2026-09-26.md) : les 22 stratégies du Labo, réglages
// par défaut, sur US100 / US500 / XAUUSD / EURUSD.
//   node --max-old-space-size=12000 scripts/runNightLabSweep.js explore                      -> night-lab-explore.{md,json} + règles figées
//   NIGHT_PHASE=validation node ... scripts/runNightLabSweep.js validation                   -> night-lab-validation.{md,json}
//   NIGHT_PHASE=final node ... scripts/runNightLabSweep.js final                             -> night-lab-final.{md,json}
// Règlement M1 (amendement 3) : chaque trade du moteur rejoué minute par minute (entrée au marché à la première minute de la bougie
// d'entrée, ou limite valable pendant cette bougie si le prix d'entrée n'est pas son ouverture ; stop et objectif du moteur ; sortie
// forcée à la fin de la bougie de sortie du moteur), spread du projet et swap. M15=1 : ancien règlement M15 du moteur, pour mémoire.
import fs from 'node:fs';
import { loadPhase, PHASES, stats, exploreVerdict, sgn, inBlocks, spreadAt, swapCost, makeBars, m15Key, simulate, MIN } from './lib/nightLab.js';
import { LAB_STRATEGIES } from '../src/backtest/labRegistry.js';
import { OFF, lower } from './lib/m1Data.js';

const phase = process.argv[2];
if (!['explore', 'validation', 'final'].includes(phase)) throw new Error('usage : runNightLabSweep.js explore|validation|final');
const SYMS = ['US100', 'US500', 'XAUUSD', 'EURUSD'];
const P = PHASES[phase];
const FROZEN = 'data/backtest-input/night-lab-frozen.json';
const TAG = process.env.M15 ? '-m15' : '';

function netTrades(sym, raw, spreadMult = 1, S = null) {
  if (S && !process.env.M15) return resettle(sym, S, raw, spreadMult);
  const sw = swapCost(sym);
  return raw.filter((t) => t.distance > 0 && Number.isFinite(t.rMultiple)).map((t) => {
    const dir = t.direction === 'bullish' ? 1 : -1;
    const cost = spreadAt(sym, t.entryPrice, spreadMult) / t.distance;
    const swapR = sw(dir, t.entryTime, t.exitTime ?? t.entryTime, t.entryPrice) / t.distance;
    return { entryTime: t.entryTime, exitTime: t.exitTime, r: t.rMultiple - cost + swapR, dir };
  });
}

function resettle(sym, S, raw, spreadMult) {
  const sw = swapCost(sym), out = [];
  for (const t of raw) {
    if (!Number.isFinite(t.entryTime) || !Number.isFinite(t.stopPrice)) continue;
    const dir = t.direction === 'bullish' ? 1 : -1;
    const i = lower(S.t, S.n, t.entryTime); if (i >= S.n) continue;
    const spec = { dir, i, stop: t.stopPrice, target: Number.isFinite(t.targetPrice) ? t.targetPrice : null, exitAt: (t.exitTime ?? t.entryTime) + 15 * MIN, spread: spreadAt(sym, t.entryPrice, spreadMult), swap: sw };
    if (Math.abs(t.entryPrice - S.o[i]) > 1e-9 * Math.max(1, Math.abs(S.o[i]))) Object.assign(spec, { entry: { type: 'limit', price: t.entryPrice }, expiry: t.entryTime + 15 * MIN });
    const r = simulate(S, spec);
    if (!r.missed) out.push({ entryTime: r.entryTime, exitTime: r.exitTime, r: r.r, dir });
  }
  return out;
}

let todo;
if (phase === 'explore') todo = SYMS.flatMap((sym) => Object.keys(LAB_STRATEGIES).map((id) => ({ id, sym })));
else {
  const frozen = JSON.parse(fs.readFileSync(FROZEN, 'utf8')).rules;
  todo = frozen;
  if (phase === 'final') { const v = JSON.parse(fs.readFileSync('data/backtest-input/night-lab-validation.json', 'utf8')).results; todo = frozen.filter((r) => v.find((x) => x.id === r.id && x.sym === r.sym)?.passed); }
}
const res = [];
const t0 = Date.now();
for (const sym of SYMS) {
  const mine = todo.filter((r) => r.sym === sym); if (!mine.length) continue;
  const S = loadPhase(sym, phase);
  const candles = makeBars(S, m15Key).map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
  for (const { id } of mine) {
    let raw;
    try { raw = LAB_STRATEGIES[id].run(candles); } catch (e) { console.log(`${sym} ${id} : erreur ${e.message}`); continue; }
    const all = netTrades(sym, raw, 1, S), counted = all.filter((t) => inBlocks(t.entryTime, P.count));
    const s = stats(counted), halves = P.halves.map(([a, b]) => stats(counted.filter((t) => t.entryTime >= a && t.entryTime < b)));
    const row = { id, label: LAB_STRATEGIES[id].label, sym, n: s.n, mean: s.mean, sum: s.sum, t: s.t, win: s.win, pf: s.pf, maxDD: s.maxDD, h1: halves[0].sum, h2: halves[1].sum };
    if (phase === 'explore') row.retained = exploreVerdict(counted).retained;
    else if (phase === 'validation') row.passed = s.n > 0 && s.mean > 0 && s.t >= 2;
    else {
      row.candidate = s.n > 0 && s.mean > 0;
      const d25 = all.filter((t) => inBlocks(t.entryTime, P.descriptive)); row.y2025 = { n: d25.length, sum: stats(d25).sum };
      const x2 = netTrades(sym, raw, 2, S).filter((t) => inBlocks(t.entryTime, P.count)); row.spread2 = stats(x2);
    }
    const years = {}; for (const t of all) { const y = new Date(t.entryTime + OFF).getUTCFullYear(); years[y] = (years[y] || 0) + t.r; } row.years = years;
    res.push(row);
    console.log(`${sym} ${id} : ${s.n} trades, ${sgn(s.mean, 3)} R, t ${s.t.toFixed(2)} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
const row = (r) => `| ${r.label} | ${r.sym} | ${r.n} | ${Math.round(100 * r.win)} % | ${sgn(r.mean, 3)} | ${sgn(r.sum)} | ${r.t.toFixed(2)} | ${sgn(r.h1)} / ${sgn(r.h2)} | ${r.pf.toFixed(2)} | ${r.maxDD.toFixed(1)} |`;
const head = `| Stratégie | Marché | Trades | Gagnants | R moyen | R total | t | ${phase === 'explore' ? '2011-14 / 2015-18' : phase === 'validation' ? '2019-20 / 2021-22' : '2023-24 / 2026'} | PF | Pire creux R |\n|---|---|---|---|---|---|---|---|---|---|`;
let md;
if (phase === 'explore') {
  const el = res.filter((r) => r.retained).sort((a, b) => b.t - a.t);
  const picked = []; for (const r of el) if (!picked.find((p) => p.id === r.id) && picked.length < 10) picked.push(r);
  if (!TAG) fs.writeFileSync(FROZEN, JSON.stringify({ frozenAt: new Date().toISOString(), note: 'Second tour : stratégies du Labo figées (réglages par défaut) avant toute lecture de 2019 et après.', rules: picked.map((r) => ({ id: r.id, sym: r.sym, label: r.label, explore: { n: r.n, mean: r.mean, t: r.t } })) }, null, 1));
  md = ['# Recherche de nuit — second tour : les 22 stratégies du Labo, exploration 2011-2018', '', `${res.length} variantes (22 stratégies × 4 marchés), réglages par défaut. Retenue = >= 60 trades, R moyen > 0, t >= 2, deux moitiés positives. Figées (au plus 1 marché par stratégie, 10 au plus) : ${picked.length} → \`night-lab-frozen.json\`.`, '',
    '## Figées pour la validation', '', ...(picked.length ? picked.map((r, q) => `${q + 1}. ${r.label} — ${r.sym} : ${r.n} trades, ${sgn(r.mean, 3)} R, t ${r.t.toFixed(2)}`) : ['Aucune.']), '',
    '## Toutes (triées par t)', '', head, ...[...res].sort((a, b) => b.t - a.t).map(row), ''];
} else {
  md = [`# Recherche de nuit — second tour, ${phase === 'validation' ? 'VALIDATION 2019-2022 (lecture unique)' : 'FINAL 2023-2024 + 2026 (lecture unique)'}`, '', `Règles figées : \`night-lab-frozen.json\`. Généré le ${new Date().toISOString().slice(0, 16)} UTC.`, '', head.replace('| Pire creux R |', '| Pire creux R | Verdict |').replace('|---|---|---|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|---|---|---|---|---|'),
    ...res.map((r) => row(r) + ` ${phase === 'validation' ? (r.passed ? '**PASSE**' : 'rejetée') : `${r.candidate ? '**CANDIDAT**' : 'rejetée'} (2025 ${sgn(r.y2025.sum)} R ; spread × 2 : ${sgn(r.spread2.mean, 3)} R, t ${r.spread2.t.toFixed(2)})`} |`), ''];
}
fs.writeFileSync(`data/backtest-input/night-lab-${phase}${TAG}.json`, JSON.stringify({ phase, results: res }, null, 1));
fs.writeFileSync(`data/backtest-input/night-lab-${phase}${TAG}.md`, md.join('\n') + '\n');
console.log(md.slice(0, 20).join('\n'));
