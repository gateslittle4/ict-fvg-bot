#!/usr/bin/env node
// runNightHidden.js - recherche de nuit : LECTURE UNIQUE d'une période cachée pour les règles figées
// (data/backtest-input/night-frozen-rules.json, commité avant). Pré-enregistrement : preregistration-nuit-2026-09-26.md.
//   NIGHT_PHASE=validation node --max-old-space-size=12000 scripts/runNightHidden.js validation  -> night-validation.{md,json}
//   NIGHT_PHASE=final      node --max-old-space-size=12000 scripts/runNightHidden.js final       -> night-final.{md,json}
// Validation 2019-2022 : passe si R moyen > 0 et t >= 2. Final 2023-2024 + 2026 (règles qui ont passé la validation seulement) :
// CANDIDAT si R moyen > 0 ; 2025 et le spread x 2 : descriptifs.
import fs from 'node:fs';
import { loadPhase, PHASES, stats, sgn, inBlocks, spreadAt, swapCost } from './lib/nightLab.js';
import { buildContext } from './lib/fvgContext.js';
import { qualifications, opportunities, ruleTrades } from './lib/eyeRule.js';
import { WINDOWS, paramsFor } from './lib/nightFvgGrid.js';
import { D1_WINDOWS } from './lib/nightQuantGrid.js';
import { dipTrades, cashSessions, gapTrades, weekdayTrades } from './lib/dipRule.js';
import { OFF } from './lib/m1Data.js';

const phase = process.argv[2];
// 'explore' : contrôle de fidélité (les règles figées doivent redonner exactement les chiffres de l'exploration 2011-2018)
if (!['explore', 'validation', 'final'].includes(phase)) throw new Error('usage : runNightHidden.js explore|validation|final');
const P = PHASES[phase];
const frozen = JSON.parse(fs.readFileSync('data/backtest-input/night-frozen-rules.json', 'utf8')).rules;
let rules = frozen;
if (phase === 'final') {
  const val = JSON.parse(fs.readFileSync('data/backtest-input/night-validation.json', 'utf8'));
  rules = frozen.filter((r) => val.results.find((v) => v.id === r.id)?.passed);
}

/** Trades d'une règle figée sur la série chargée (spreadMult 1 = coûts du projet). */
function tradesOf(rule, ctx, spreadMult = 1) {
  const { X } = ctx, sym = rule.sym;
  if (rule.kind === 'fvg') {
    const W = { ...WINDOWS[rule.window], maxPerFvg: rule.reentry ? 2 : 1 };
    const prm = paramsFor(sym, rule.window, rule.filter, rule.mgmt, { spreadMult });
    if (rule.exitMin && prm.exit.type === 'ny') prm.exit = { type: 'ny', min: rule.exitMin };
    if (rule.beAt) prm.beAt = rule.beAt;
    if (rule.reentry) prm.reentry = true;
    if (rule.maxPerDay) prm.maxPerDay = rule.maxPerDay;
    ctx.quals ||= qualifications(X);
    return ruleTrades(X, opportunities(ctx.quals, W), prm);
  }
  const costs = { spreadAt: (p) => spreadAt(sym, p, spreadMult), swap: swapCost(sym) };
  if (rule.kind === 'dip') return dipTrades(X, { ...D1_WINDOWS[rule.window], d: rule.d, rr: rule.rr, dirs: rule.dirsArr, exec: rule.exec, ...costs });
  ctx.sess ||= cashSessions(X.S);
  if (rule.kind === 'gap') return gapTrades(X, ctx.sess, { g: rule.g, exitMin: rule.exitMin, dirs: rule.dirsArr, ...costs });
  if (rule.kind === 'weekday') return weekdayTrades(X, ctx.sess, { dow: rule.dow, dir: rule.dir, ...costs });
  throw new Error(`règle inconnue ${rule.kind}`);
}

const ctxs = {};
const results = [];
for (const rule of rules) {
  if (!ctxs[rule.sym]) { const S = loadPhase(rule.sym, phase); ctxs[rule.sym] = { X: buildContext(S) }; console.log(`${rule.sym} ${phase} : ${S.n} minutes, ${new Date(S.t[0] + OFF).toISOString().slice(0, 10)} -> ${new Date(S.t[S.n - 1] + OFF).toISOString().slice(0, 10)}`); }
  const all = tradesOf(rule, ctxs[rule.sym]);
  const counted = all.filter((t) => inBlocks(t.entryTime, P.count));
  const s = stats(counted), halves = P.halves.map(([a, b]) => stats(counted.filter((t) => t.entryTime >= a && t.entryTime < b)));
  const years = {}; for (const t of all) { const y = new Date(t.entryTime + OFF).getUTCFullYear(); (years[y] ||= []).push(t); }
  const res = { id: rule.id, label: rule.label, sym: rule.sym, n: s.n, mean: s.mean, sum: s.sum, t: s.t, win: s.win, pf: s.pf, maxDD: s.maxDD, halves: halves.map((h) => ({ n: h.n, sum: h.sum, mean: h.mean })), years: Object.fromEntries(Object.entries(years).map(([y, l]) => [y, { n: l.length, sum: stats(l).sum }])) };
  if (phase === 'explore') res.matchesExplore = s.n === rule.explore.n && Math.abs(s.mean - rule.explore.mean) < 1e-9;
  else if (phase === 'validation') res.passed = s.n > 0 && s.mean > 0 && s.t >= 2;
  else {
    res.candidate = s.n > 0 && s.mean > 0;
    const d25 = all.filter((t) => inBlocks(t.entryTime, P.descriptive)); res.y2025 = { n: d25.length, sum: stats(d25).sum, mean: stats(d25).mean };
    const x2 = tradesOf(rule, ctxs[rule.sym], 2).filter((t) => inBlocks(t.entryTime, P.count)); const s2 = stats(x2); res.spread2 = { n: s2.n, mean: s2.mean, sum: s2.sum, t: s2.t };
  }
  results.push(res);
  console.log(`${rule.id} ${rule.label} : ${s.n} trades, ${sgn(s.mean, 3)} R/trade, ${sgn(s.sum)} R, t ${s.t.toFixed(2)} -> ${phase === 'explore' ? (res.matchesExplore ? 'identique à l\'exploration' : 'DIFFÉRENT de l\'exploration') : phase === 'validation' ? (res.passed ? 'PASSE' : 'rejetée') : (res.candidate ? 'CANDIDAT' : 'rejetée')}`);
}
if (phase === 'explore') { if (!results.every((r) => r.matchesExplore)) throw new Error('les règles figées ne redonnent pas l\'exploration'); console.log('contrôle de fidélité OK'); process.exit(0); }
fs.writeFileSync(`data/backtest-input/night-${phase}.json`, JSON.stringify({ phase, generated: new Date().toISOString(), results }, null, 1));
const yl = (r) => Object.entries(r.years).map(([y, v]) => `${y} ${sgn(v.sum, 1)} (${v.n})`).join(' · ');
const md = [`# Recherche de nuit — ${phase === 'validation' ? 'VALIDATION 2019-2022 (lecture unique)' : 'FINAL 2023-2024 + 2026 (lecture unique)'}`, '',
  `Règles figées : \`data/backtest-input/night-frozen-rules.json\` (commitées avant cette lecture). Script : \`scripts/runNightHidden.js ${phase}\`. Généré le ${new Date().toISOString().slice(0, 16)} UTC.`,
  phase === 'validation' ? 'Critère fixé avant : R moyen > 0 et t ≥ 2 → passe au final ; sinon rejetée.' : 'Critère fixé avant : R moyen > 0 sur 2023-2024 + 2026 → CANDIDAT (démo seulement, décision d\'Esdras) ; 2025 et spread × 2 descriptifs.', '',
  `| Règle | Marché | Trades | Gagnants | R moyen | R total | t | ${phase === 'validation' ? '2019-20 / 2021-22' : '2023-24 / 2026'} | PF | Pire creux R | ${phase === 'validation' ? 'Verdict' : '2025 (descr.) | Spread × 2 | Verdict'} |`,
  `|---|---|---|---|---|---|---|---|---|---|${phase === 'validation' ? '---|' : '---|---|---|'}`,
  ...results.map((r) => `| ${r.id} ${r.label} | ${r.sym} | ${r.n} | ${Math.round(100 * r.win)} % | ${sgn(r.mean, 3)} | ${sgn(r.sum)} | ${r.t.toFixed(2)} | ${r.halves.map((h) => sgn(h.sum)).join(' / ')} | ${r.pf.toFixed(2)} | ${r.maxDD.toFixed(1)} | ${phase === 'validation' ? (r.passed ? '**PASSE**' : 'rejetée') : `${sgn(r.y2025.sum)} R (${r.y2025.n}) | ${sgn(r.spread2.mean, 3)} R/trade, t ${r.spread2.t.toFixed(2)} | ${r.candidate ? '**CANDIDAT**' : 'rejetée'}`} |`), '',
  '## Par année', '', ...results.map((r) => `- ${r.id} ${r.label} : ${yl(r)}`), ''];
fs.writeFileSync(`data/backtest-input/night-${phase}.md`, md.join('\n') + '\n');
console.log(md.join('\n'));
