#!/usr/bin/env node
// runEngineM1Backtest.js
// Usage: node --max-old-space-size=4096 scripts/runEngineM1Backtest.js
//
// Esdras (2026-09-21): "fais tout ce qu'il y a a faire pour que tout soit correct". Reconciliation moteur / simulateur : les backtests de la session
// (scripts/lib/stopFloorCore.js) utilisent une reimplementation des mecanismes qui ne produit pas les memes trades que le VRAI moteur
// (LiveStrategyEngine, celui de la production) ni les memes niveaux que la page « performance » du site (moteur au M15, « stop d'abord »).
// Ici : les trades du VRAI moteur (un warmUp() sur tout l'historique M1 reel sans trous, reconstruit en M15, garde-fous permissifs pour la liste
// canonique), REGLES a la minute (M1 exact) ou comme le moteur (M15), puis rejeu dans le vrai GuardrailEngine (3 trades/jour, pause 30 min, arret du jour).
// 5 paires (GER40 inclus pour mesurer sa contribution : le moteur en production ne le traite plus). Couts : spreads par defaut du moteur.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = ['US500', 'US100', 'XAUUSD', 'EURUSD', 'GER40'];
const START = 10000;
const CUT = Date.UTC(2025, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const eng = (y) => Date.UTC(y, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const pct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const fmt = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

function loadGz(sym) {
  const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); }
  return out;
}
function toM15(m1) {
  const out = []; let cur = null;
  for (const c of m1) { const b = Math.floor(c.time / 900000) * 900000; if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; } }
  if (cur) out.push(cur); return out;
}
const m1Bars = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Bars[s])]));
const M1 = {};
for (const s of SYMBOLS) { const cs = m1Bars[s]; M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
const netR = (dir, entry, d, exit, sym) => { const g = (dir === 'bullish' ? exit - entry : entry - exit) / d; const s = DEFAULT_SPREADS[sym] ?? 0; return g - (s > 0 ? s / d : 0); };

// M1-exact settlement of an engine trade: entry candle judged, fill at the entry price inside the entry M15 bar, walk minute by minute
function settleM1(tr) {
  const S = M1[tr.symbol]; const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1; // engine validated it: keep it (fill assumed at the level, no data to say otherwise)
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i], outcome: 'loss' };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i], outcome: 'win' };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], outcome: 'timeout' };
}

// ---- phase 1: canonical trade list from the REAL engine
const orderedSymbols = SYMBOLS;
const ordered = Object.fromEntries(orderedSymbols.map((s) => [s, m15[s]]));
const guard0 = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
guard0.setBalance(START, Math.min(...orderedSymbols.map((s) => ordered[s][0].time)));
const engine = new LiveStrategyEngine({ symbols: orderedSymbols, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: guard0, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
const pending = new Map(); const trades = [];
engine.warmUp(ordered, { onEvent: (sig, candle) => {
  if (sig.type === 'validated' && !sig.blockedReason) { pending.set(sig.symbol, { symbol: sig.symbol, source: sig.source, direction: sig.direction, entryPrice: sig.entryPrice, stopPrice: sig.stopPrice, targetPrice: sig.targetPrice, distance: sig.distance, entryTime: candle.time }); return; }
  if (sig.type !== 'closed') return;
  const o = pending.get(sig.symbol); pending.delete(sig.symbol); if (!o) return;
  const exit15 = sig.outcome === 'win' ? o.targetPrice : sig.outcome === 'loss' ? o.stopPrice : candle.close;
  const m1 = settleM1(o);
  if (!m1) return;
  trades.push({ ...o, m15: { netR: netR(o.direction, o.entryPrice, o.distance, exit15, o.symbol), exitTime: sig.exitTime, outcome: sig.outcome }, m1: { netR: netR(o.direction, o.entryPrice, o.distance, m1.exitPrice, o.symbol), exitTime: m1.exitTime, outcome: m1.outcome } });
} });
trades.sort((a, b) => a.entryTime - b.entryTime);
console.error('trades canoniques du vrai moteur:', trades.length);

// ---- phase 2: real GuardrailEngine replay
function account(list, mode, risk) {
  const g = new GuardrailEngine({ ...CONFIG.guardrails }); g.setBalance(START, list.length ? list[0].entryTime : 0);
  let bal = START, peak = START, dd = 0, vetoed = 0; const taken = [];
  for (const t of list) {
    if (!g.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
    const r = t[mode].netR; const pnl = bal * (risk / 100) * r; bal += pnl; peak = Math.max(peak, bal); dd = Math.max(dd, (peak - bal) / peak * 100);
    g.recordTrade({ pnl, time: t[mode].exitTime, balanceAfter: bal, symbol: t.symbol }); taken.push({ ...t, r, pnl });
  }
  return { bal, ret: (bal - START) / START * 100, dd, vetoed, taken };
}
const sumR = (l) => l.reduce((a, t) => a + t.r, 0);
const md = ['# Le VRAI moteur (LiveStrategyEngine) sur tout l\'historique M1 réel : règlement M15 (comme la page du site) contre M1 exact', '',
  'Un `warmUp()` du vrai moteur sur EURUSD/XAUUSD (dès 2022-05) et US100/US500/GER40 (dès 2023-01), M15 reconstruits du M1 réel sans trous ; liste canonique de trades (garde-fous permissifs), réglée soit comme le moteur (M15, « stop d\'abord ») soit à la minute (M1 exact), puis rejeu dans le vrai `GuardrailEngine` (3 trades/jour, pause 30 min, arrêt du jour). Coûts : spreads par défaut du moteur, sans commission/swap/glissement, sans le correctif de géométrie d\'ordre. **GER40 est inclus ici pour mesurer sa contribution ; le bot ne le traite plus.** Objectif : réconcilier le simulateur des backtests précédents avec le vrai moteur.', ''];
const variants = [['5 paires (GER40 inclus)', (t) => true], ['Production (sans GER40)', (t) => t.symbol !== 'GER40']];
for (const risk of [0.3, 0.5]) {
  md.push(`## Risque ${risk} % par trade`, '', '| Variante | Règlement | Trades | Vétos | R net (tous trades pris) | Compte 10 000 $ | Pire baisse |', '|---|---|---|---|---|---|---|');
  for (const [vn, f] of variants) for (const mode of ['m15', 'm1']) { const a = account(trades.filter(f), mode, risk); md.push(`| ${vn} | ${mode === 'm1' ? 'M1 exact' : 'M15 (moteur)'} | ${a.taken.length} | ${a.vetoed} | ${fmt(sumR(a.taken))} R | ${pct(a.ret)} | ${a.dd.toFixed(1)} % |`); }
  md.push('');
}
const prod = trades.filter((t) => t.symbol !== 'GER40');
for (const mode of ['m1', 'm15']) {
  const a = account(trades, mode, 0.5);
  md.push(`## Détail (5 paires, ${mode === 'm1' ? 'M1 exact' : 'M15 du moteur'}, 0,5 %)`, '', '### Par paire', '', '| Paire | Trades | R net | R / trade |', '|---|---|---|---|');
  for (const s of SYMBOLS) { const l = a.taken.filter((t) => t.symbol === s); md.push(`| ${s} | ${l.length} | ${fmt(sumR(l))} | ${fmt(sumR(l) / Math.max(1, l.length), 3)} |`); }
  md.push('', '### Par mécanisme', '', '| Mécanisme | Trades | R net | R / trade |', '|---|---|---|---|');
  for (const src of [...new Set(a.taken.map((t) => t.source))].sort()) { const l = a.taken.filter((t) => t.source === src); md.push(`| ${src} | ${l.length} | ${fmt(sumR(l))} | ${fmt(sumR(l) / Math.max(1, l.length), 3)} |`); }
  md.push('', '### Par année', '', '| Année | Trades | R net | R / trade |', '|---|---|---|---|');
  for (const y of [2022, 2023, 2024, 2025, 2026]) { const l = a.taken.filter((t) => t.entryTime >= eng(y) && t.entryTime < eng(y + 1)); if (l.length) md.push(`| ${y} | ${l.length} | ${fmt(sumR(l))} | ${fmt(sumR(l) / l.length, 3)} |`); }
  md.push('');
}
// mécanisme x paire (0,5 %, garde-fous réels rejoués), M1 exact et M15 côte à côte
for (const mode of ['m1', 'm15']) {
  const a = account(trades, mode, 0.5);
  md.push(`## Mécanisme × paire (${mode === 'm1' ? 'M1 exact' : 'M15 du moteur'}, 0,5 %) : trades / R net / R par trade`, '', `| Mécanisme | ${SYMBOLS.join(' | ')} |`, `|---|${SYMBOLS.map(() => '---|').join('')}`);
  for (const src of [...new Set(a.taken.map((t) => t.source))].sort()) md.push(`| ${src} | ${SYMBOLS.map((sy) => { const l = a.taken.filter((t) => t.source === src && t.symbol === sy); return l.length ? `${l.length} / ${fmt(sumR(l))} / ${fmt(sumR(l) / l.length, 2)}` : '—'; }).join(' | ')} |`);
  md.push('');
}
{
  const a = account(trades, 'm1', 0.5);
  md.push('## Breaker Block et CBDR par année (M1 exact, 0,5 %, R net / trades)', '', '| Mécanisme + paire | 2022 | 2023 | 2024 | 2025 | 2026 |', '|---|---|---|---|---|---|');
  for (const [src, sy] of [['breakerblock', 'US100'], ['breakerblock', 'US500'], ['breakerblock', 'GER40'], ['cbdr', 'US100']]) md.push(`| ${src} ${sy} | ${[2022, 2023, 2024, 2025, 2026].map((y) => { const l = a.taken.filter((t) => t.source === src && t.symbol === sy && t.entryTime >= eng(y) && t.entryTime < eng(y + 1)); return l.length ? `${fmt(sumR(l))} / ${l.length}` : '—'; }).join(' | ')} |`);
  md.push('');
}
md.push('## Limites', '', '- Rejeu de garde-fous sur des trades pris comme des signaux indépendants : le moteur ne « voit » pas les vétos (netting et blocages internes reposent sur ses propres clôtures M15).', '- Même remarque sur le niveau absolu : coûts partiels (pas de commission, swap, glissement réel ; géométrie d\'ordre au marché non corrigée dans ce calcul).', '- Le règlement M1 remplit l\'entrée au niveau du signal dans sa bougie M15 (le moteur l\'a validée) ; aucune donnée ne dit si l\'ordre réel serait passé.');
fs.writeFileSync('data/backtest-input/engine-m1-vs-m15-reconciliation.md', md.join('\n'));
console.log(md.join('\n'));
