#!/usr/bin/env node
// runM1ProtocolBacktest.js
// Usage: node --max-old-space-size=4096 scripts/runM1ProtocolBacktest.js
//
// Applique le protocole PRE-ENREGISTRE `protocol-m1-full-history-validation` (data/research-memory.json) a tout l'historique M1 reel du broker
// (data/real-m1-full/*.csv.gz, issu de data/real-m1-history-v2 : fenetres de 8 jours, sans les trous du v1).
// 1) Combo ACTUEL, fige : mesure sur tout l'historique, par annee, par mois, par paire (aucun reglage, donc pas de decoupage necessaire) ;
//    lu aussi en entrainement (< 2025-01-01) et test (>= 2025-01-01) pour comparaison.
// 2) Hypotheses de modification, 3 au total, COMPTEES : H1 retirer GER40, H2 retirer EURUSD, H3 retirer les deux. Elles viennent d'un premier regard
//    (rapport de 16 mois, invalide mais indicatif) : ce biais est declare. Regle ecrite avant le calcul :
//    - retenue pour lecture du test SEULEMENT si, sur l'entrainement, la paire retiree a un R net total <= 0 (retirer ne fait pas baisser le total) ;
//    - le test est lu UNE fois ; rejet si R/trade du test < celui du combo, OU pire baisse plus grande, OU amelioration de R/trade non retrouvee
//      sur au moins la moitie des tranches annuelles (2023, 2024, 2025, 2026).
//    Meme reussie, une hypothese n'est jamais « adoptee » : au mieux « candidate, a confirmer en demo ».
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { buildTrades, makeSimulator, ftmoAttempts } from './lib/stopFloorCore.js';

const SYMBOLS = ['US100', 'US500', 'GER40', 'XAUUSD', 'EURUSD'];
const CUT = Date.UTC(2025, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - FIXED_EST_TO_UTC_OFFSET_MS;

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); }
  return out;
}
function toM15(m1) {
  const out = []; let cur = null;
  for (const c of m1) {
    const b = Math.floor(c.time / 900000) * 900000;
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; }
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; }
  }
  if (cur) out.push(cur);
  return out;
}
const m1Real = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const startOf = Object.fromEntries(SYMBOLS.map((s) => [s, m1Real[s][0].time + 30 * 86400000])); // 30 jours de chauffe par paire
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Real[s])]));
const m1 = {};
for (const s of SYMBOLS) { const cs = m1Real[s]; m1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
console.error('donnees chargees');

const built = buildTrades(SYMBOLS, (s) => m15[s], () => {});
const mk = (drop) => makeSimulator({ all: built.all.filter((t) => t.time >= startOf[t.symbol] && !drop.includes(t.symbol)), cache: built.cache });
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function resolveM1(t, d) {
  const S = m1[t.symbol]; const stop = t.entry - t.dir * d, tp = t.entry + t.dir * d * t.rr;
  const c0 = built.cache[t.symbol][t.i0]; const start = lower(S.t, S.n, c0.time); const end = Math.min(S.n, lower(S.t, S.n, c0.time + 900000));
  let fill = -1;
  if (Math.abs(t.entry - c0.open) <= 1e-9 * Math.max(1, Math.abs(c0.open))) fill = start < S.n ? start : -1; else for (let i = start; i < end; i++) if (S.l[i] <= t.entry && t.entry <= S.h[i]) { fill = i; break; }
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) { if (t.dir === 1 ? S.l[i] <= stop : S.h[i] >= stop) return { r: -1, exit: S.t[i] }; if (t.dir === 1 ? S.h[i] >= tp : S.l[i] <= tp) return { r: t.rr, exit: S.t[i] }; }
  return { r: (t.dir * (S.c[maxI - 1] - t.entry)) / d, exit: S.t[maxI - 1] };
}
function summarize(list) {
  const s = [...list].sort((a, b) => a.exit - b.exit);
  let bal = 10000, peak = 10000, dd = 0;
  for (const t of s) { bal *= 1 + 0.005 * t.net; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100); }
  const sum = list.reduce((a, t) => a + t.net, 0);
  return { n: list.length, sum, per: list.length ? sum / list.length : 0, win: list.length ? list.filter((t) => t.net > 0).length / list.length * 100 : 0, bal, dd, f: ftmoAttempts(list) };
}
const row = (l, r) => `| ${l} | ${r.n} | ${r.win.toFixed(0)} % | ${fmt(r.sum, 1)} | ${fmt(r.per, 3)} | $${r.bal.toFixed(0)} | ${r.dd.toFixed(0)} % | ${r.f.pass} / ${r.f.fail} |`;
const HEAD = ['| Période | Trades | Gagnants | R net | R / trade | Compte 10 000 $ (0,5 %) | Pire baisse | FTMO 1-Step (réussis / échoués) |', '|---|---|---|---|---|---|---|---|'];
const run = (sim, o = {}) => sim(() => 0, null, { resolver: resolveM1, ...o });

const all = mk([]) (() => 0, null, { resolver: resolveM1 });
const known = { 22: 8.1, 23: 8.1, 0: 3.65, 1: 2.42, 2: 2.22, 3: 2.33, 4: 2.21, 5: 2.30, 6: 0.57, 7: 0.50 }; // GER40, spread moyen observe par heure UTC (bot_spread_samples, 2026-09-20 22:30 -> 09-21 07:30)
const g = all.filter((t) => t.symbol === 'GER40');
const hour = (t) => new Date(t.time + FIXED_EST_TO_UTC_OFFSET_MS).getUTCHours();
const hist = {}; for (const t of g) hist[hour(t)] = (hist[hour(t)] ?? 0) + 1;
console.log('GER40 trades par heure UTC d\'entree:', JSON.stringify(hist));
const inKnown = g.filter((t) => hour(t) in known), elevated = g.filter((t) => (known[hour(t)] ?? 0.5) > 1);
console.log('GER40 total', g.length, '| entrees dans une heure observee', inKnown.length, '| entrees a spread eleve (>1)', elevated.length);
const adj = (t) => t.net - ((known[hour(t)] ?? 0.5) - 0.5) / t.dist;
const r0 = g.reduce((a, t) => a + t.net, 0), r1 = g.reduce((a, t) => a + adj(t), 0);
console.log('GER40 R net: suppose', r0.toFixed(1), '-> avec spread observe par heure', r1.toFixed(1));
const rEl = elevated.reduce((a, t) => a + t.net, 0), rEl1 = elevated.reduce((a, t) => a + adj(t), 0);
console.log('dont trades a spread eleve: R', rEl.toFixed(1), '->', rEl1.toFixed(1), '(', elevated.length, 'trades, cout moyen additionnel', (elevated.reduce((a, t) => a + (t.net - adj(t)), 0) / Math.max(1, elevated.length)).toFixed(3), 'R/trade )');
const others = all.filter((t) => t.symbol !== 'GER40'); console.log('reste du combo R', others.reduce((a, t) => a + t.net, 0).toFixed(1), 'sur', others.length);
