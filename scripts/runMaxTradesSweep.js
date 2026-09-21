#!/usr/bin/env node
// runMaxTradesSweep.js
// Usage: node --max-old-space-size=4096 scripts/runMaxTradesSweep.js
//
// Esdras (2026-09-21): une autre session a soupçonné que « 3 trades max par jour » détruit la combo. Cette étude mesure ce que
// coûte (ou protège) le plafond, sur les MÊMES trades des 8 mécanismes (stops d'origine, spread inclus) :
//  A) 2010-2025 en M15 (règlement borné par les deux règles d'égalité stop/objectif), séparation entraînement <= 2023 / test 2024+ ;
//  B) les 8 derniers mois réels réglés MINUTE PAR MINUTE (bougies M1 du broker).
// Variantes du plafond : 1, 2, 3 (aujourd'hui), 4, 5, 6, 8, illimité ; autres garde-fous inchangés (1 position par paire,
// pause 30 min après une perte, arrêt du jour à -4R). Mesures : trades, R net total, R par trade, compte 10 000 $ à 0,5 %,
// pire baisse, et le R moyen des trades que le plafond refuse (ceux qui auraient été pris avec un plafond illimité).
import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CAPS = [1, 2, 3, 4, 5, 6, 8, Infinity];
const CUT = Date.UTC(2024, 0, 1);
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const md = ['# Le plafond « 3 trades par jour » : que coûte-t-il ?', ''];

function summarize(list) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, dd = 0;
  for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const sum = list.reduce((a, t) => a + t.net, 0);
  const f = ftmoAttempts(list);
  return { n: list.length, sum, per: list.length ? sum / list.length : 0, bal, dd, f };
}
const key = (t) => `${t.symbol}|${t.id}|${t.time}`;
function table(title, sim, opts, notes) {
  md.push(`## ${title}`, '', notes, '', '| Plafond / jour | Trades | R net | R par trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) | R moyen des trades refusés par ce plafond (vs illimité) |', '|---|---|---|---|---|---|---|---|');
  const base = sim(() => 0, null, { ...opts, maxPerDay: Infinity });
  for (const cap of CAPS) {
    const list = sim(() => 0, null, { ...opts, maxPerDay: cap });
    const r = summarize(list);
    const taken = new Set(list.map(key));
    const refused = base.filter((t) => !taken.has(key(t)));
    const refR = refused.length ? refused.reduce((a, t) => a + t.net, 0) / refused.length : null;
    md.push(`| ${cap === 3 ? '**3 (aujourd\'hui)**' : cap === Infinity ? 'illimité' : cap} | ${r.n} | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | $${r.bal.toFixed(0)} | ${r.dd.toFixed(0)} % | ${r.f.pass} / ${r.f.fail} | ${refR === null ? '—' : `${fmt(refR, 3)} (${refused.length} trades)`} |`);
  }
  md.push('');
}

// ---- A) 2010-2025, M15
const hist = buildTrades(SYMBOLS, (s) => loadCandlesFromCsv(path.join('data/backtest-input', `${s}.csv`)).candles, () => {});
const simH = makeSimulator(hist);
table('A. 2010-2025 (bougies M15, règle « stop d\'abord »)', simH, {}, 'Toute la période. NB : la règle M15 sous-estime les stops serrés (voir la mémoire de recherche), les niveaux sont indicatifs, la COMPARAISON entre plafonds l\'est moins.');
table('A1. Entraînement 2010-2023', simH, { toTime: CUT }, '');
table('A2. Test 2024-2025', simH, { fromTime: CUT }, '');

// ---- B) 8 derniers mois réels, M1 exact
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
table('B. Les 8 derniers mois réels (2026), règlement à la minute (M1 exact)', simR, { fromTime: from, resolver: resolveM1 }, 'Bougies d\'une minute du broker : seul test hors échantillon, environ 350 trades.');
md.push('## Limites', '', '- Garde-fous des simulations approximés (1 position par paire, pause de 30 min après une perte, arrêt du jour à -4R) ; le plafond est la seule variable qui change.', '- Le jour est le jour calendaire du moteur (UTC-5 fixe) ; le vrai garde-fou compte les trades CLÔTURÉS du jour en UTC (`dayBoundaryHourUTC: 0`), voir `project_guardrail_semantics`.', '- Un plafond protège aussi le compte contre les séries de pertes le même jour : lire la colonne pire baisse et FTMO, pas seulement le R total.');
fs.writeFileSync('data/backtest-input/max-trades-per-day-sweep.md', md.join('\n'));
console.log(md.join('\n'));
