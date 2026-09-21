#!/usr/bin/env node
// runFinalBacktestReport.js
// Usage: node --max-old-space-size=4096 scripts/runFinalBacktestReport.js
//
// Esdras (2026-09-21): "un seul rapport final, combo INCHANGÉ, entraînement / test". Combo actuel (8 mécanismes, stops d'origine,
// garde-fous réels approximés : 3 trades/jour, 1 position par paire, pause 30 min après perte, arrêt du jour à -4R, stop >= 3x spread).
//  A) 2010-2025 M15, deux bornes (règle d'égalité stop/objectif) : "prudent" = stop d'abord, "optimiste" = objectif d'abord ;
//     entraînement <= 2023, test 2024-2025, et année par année ;
//  B) 7 mois réels réglés à la minute (M1 exact) : le chiffre de référence.
// Aucun paramètre n'est choisi sur le test : le combo n'est pas modifié.
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2024, 0, 1);
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const md = ['# Backtest final du combo actuel (inchangé) — entraînement / test', ''];

function summarize(list) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, dd = 0;
  for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const sum = list.reduce((a, t) => a + t.net, 0);
  return { n: list.length, sum, per: list.length ? sum / list.length : 0, win: list.length ? list.filter((t) => t.net > 0).length / list.length * 100 : 0, bal, dd, f: ftmoAttempts(list) };
}
const row = (label, r) => `| ${label} | ${r.n} | ${r.win.toFixed(0)} % | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | $${r.bal.toFixed(0)} | ${r.dd.toFixed(0)} % | ${r.f.pass} / ${r.f.fail} |`;
const HEAD = ['| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];

// ---- A) 2010-2025 M15, deux bornes
const hist = buildTrades(SYMBOLS, (s) => loadCandlesFromCsv(path.join('data/backtest-input', `${s}.csv`)).candles, () => {});
const simH = makeSimulator(hist);
function optimistic(t, d) { // objectif d'abord si les deux sont touchés dans la même bougie
  const cs = hist.cache[t.symbol]; const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  for (let i = t.i0; i < cs.length && i - t.i0 < 480; i++) {
    const c = cs[i];
    if (t.dir === 1 ? c.high >= tp : c.low <= tp) return { r: t.rr, exit: c.time };
    if (t.dir === 1 ? c.low <= stop : c.high >= stop) return { r: -1, exit: c.time };
  }
  const c = cs[Math.min(cs.length - 1, t.i0 + 479)];
  return { r: (t.dir * (c.close - t.entry)) / d, exit: c.time };
}
const years = []; for (let y = 2010; y <= 2025; y++) years.push(y);
for (const [name, opts, note] of [['prudent (stop d\'abord)', {}, 'Borne basse : en cas de doute, le stop gagne.'], ['optimiste (objectif d\'abord)', { resolver: optimistic }, 'Borne haute : en cas de doute, l\'objectif gagne.']]) {
  md.push(`## A. 2010-2025 en M15 — borne ${name}`, '', note, '', ...HEAD);
  md.push(row('Entraînement 2010-2023', summarize(simH(() => 0, null, { ...opts, toTime: CUT }))));
  md.push(row('**Test 2024-2025**', summarize(simH(() => 0, null, { ...opts, fromTime: CUT }))));
  md.push(row('Tout 2010-2025', summarize(simH(() => 0, null, opts))));
  md.push('', '| Année | Trades | R net | R / trade |', '|---|---|---|---|');
  let pos = 0;
  for (const y of years) { const r = summarize(simH(() => 0, null, { ...opts, fromTime: Date.UTC(y, 0, 1), toTime: Date.UTC(y + 1, 0, 1) })); if (r.sum > 0) pos++; md.push(`| ${y} | ${r.n} | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} |`); }
  md.push('', `Années positives : ${pos} sur ${years.length}.`, '');
}

// ---- B) 7 mois réels, M1 exact
const shift = (cs) => cs.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
const merge15 = (s) => { const m = new Map(); for (const dir of ['data/real-data-2026-09-20', 'data/real-data-2026-02-to-09', 'data/real-data-2026-09-17']) { try { for (const c of loadCandlesFromCsv(path.join(dir, `${s}.csv`)).candles) m.set(c.time, c); } catch {} } return shift([...m.values()].sort((a, b) => a.time - b.time)); };
const real = buildTrades(SYMBOLS, merge15, () => {});
const simR = makeSimulator(real);
const m1 = {};
for (const s of SYMBOLS) { const cs = shift(loadCandlesFromCsv(path.join('data/real-m1', `${s}.csv`)).candles); m1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
const from = Math.max(...SYMBOLS.map((s) => m1[s].t[0])) + 86400000;
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function resolveM1(t, d) {
  const S = m1[t.symbol]; const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  const c0 = real.cache[t.symbol][t.i0]; const start = lower(S.t, S.n, c0.time); const end = Math.min(S.n, lower(S.t, S.n, c0.time + 900000));
  let fill = -1;
  if (Math.abs(t.entry - c0.open) <= 1e-9 * Math.max(1, Math.abs(c0.open))) fill = start < S.n ? start : -1; else for (let i = start; i < end; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) { fill = i; break; }
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) { if (t.dir === 1 ? S.l[i] <= stop : S.h[i] >= stop) return { r: -1, exit: S.t[i] }; if (t.dir === 1 ? S.h[i] >= tp : S.l[i] <= tp) return { r: t.rr, exit: S.t[i] }; }
  return { r: (t.dir * (S.c[maxI - 1] - t.entry)) / d, exit: S.t[maxI - 1] };
}
md.push('## B. 7 mois réels (2026), règlement à la minute (M1 exact) — chiffre de référence', '', ...HEAD);
const listR = simR(() => 0, null, { fromTime: from, resolver: resolveM1 });
md.push(row('Tout (≈ jan→sept 2026)', summarize(listR)));
const mid = Math.floor((from + Math.max(...listR.map((t) => t.exit))) / 2);
md.push(row('1re moitié', summarize(listR.filter((t) => t.time < mid))));
md.push(row('2e moitié', summarize(listR.filter((t) => t.time >= mid))));
md.push('', '## Limites', '',
  '- Combo inchangé : rien n\'est choisi sur le test, donc pas de sur-ajustement ; mais 2010-2025 avait déjà servi à bâtir le combo, le vrai hors échantillon est la démo à venir.',
  '- M15 : deux bornes, le vrai résultat est entre les deux ; le M1 exact des 7 mois est le seul chiffre sans ce biais.',
  '- Non modélisés : commissions, swap, glissement, spread élargi autour de 17 h NY. Garde-fous approximés (voir le script).',
  '- Les tentatives FTMO sont peu nombreuses sur 7 mois : à lire comme un ordre de grandeur, pas comme une probabilité.');
fs.writeFileSync('data/backtest-input/final-backtest-combo.md', md.join('\n'));
console.log(md.join('\n'));
