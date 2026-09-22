#!/usr/bin/env node
// runEngineM1Backtest.js
// Usage: node --max-old-space-size=4096 scripts/runEngineM1Backtest.js
//
// Esdras (2026-09-21): « comment mon combo performerait en 2026, par cycle de 10 % avec la date d'atteinte, et la performance de chaque stratégie ».
// Combo EN PRODUCTION (US100, US500, XAUUSD, EURUSD ; GER40 retiré), vrai moteur (warmUp complet avec les deux jambes de Divergence) sur tout
// l'historique M1 réel sans trous (contexte de chauffe), trades de 2026 réglés à la minute (M1 exact) et, à titre prudent, comme le moteur (M15).
// Cycles FTMO 1-Step : +10 %, perte quotidienne 3 %, perte max 10 % trailing (GuardrailEngine réel, garde-fous du combo).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = ['US500', 'US100', 'XAUUSD', 'EURUSD'];
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
engine.warmUp(ordered, { completeDivergencePair: true, onEvent: (sig, candle) => {
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

// ---- 2026 analysis
const CUT26 = Date.UTC(2026, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const t26 = trades.filter((t) => t.entryTime >= CUT26);
const fmtDate = (ms) => new Date(ms + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 10);
const sumR2 = (l) => l.reduce((a, t) => a + t.r, 0);
function cycles(list, mode, risk) {
  const effective = buildEffectiveConfig({ id: 'ftmo-2026', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk });
  const out = []; let cyc = null, vetoed = 0, all = [];
  const start = (t) => { const g = new GuardrailEngine({ ...effective.guardrails }); g.setBalance(START, t); cyc = { start: t, bal: START, peak: START, low: START, trades: 0, g, end: null, result: 'en cours' }; };
  start(list.length ? list[0].entryTime : CUT26);
  for (const t of list) {
    if (!cyc.g.canTakeNewTrade(t.entryTime, t.symbol)) { vetoed++; continue; }
    const r = t[mode].netR; const pnl = cyc.bal * (risk / 100) * r; cyc.bal += pnl; cyc.trades++; cyc.peak = Math.max(cyc.peak, cyc.bal); cyc.low = Math.min(cyc.low, cyc.bal);
    cyc.g.recordTrade({ pnl, time: t[mode].exitTime, balanceAfter: cyc.bal, symbol: t.symbol }); all.push({ ...t, r, pnl });
    const st = cyc.g.getStatus(t[mode].exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) { cyc.end = t[mode].exitTime; cyc.result = st.targetReached ? 'RÉUSSI (+10 %)' : 'RATÉ (perte max 10 %)'; out.push(cyc); start(t[mode].exitTime); }
  }
  if (cyc.trades > 0 || out.length === 0) { cyc.end = list.length ? list[list.length - 1][mode].exitTime : CUT26; cyc.result = `en cours (${((cyc.bal - START) / START * 100).toFixed(2)} %)`; out.push(cyc); }
  return { out, vetoed, taken: all };
}
const md = ['# Le combo en production en 2026 : cycles de +10 % et performance de chaque stratégie', '',
  `Combo : US100, US500, XAUUSD, EURUSD (GER40 retiré). Vrai moteur (\`LiveStrategyEngine\`, mécanismes réels, deux jambes de Divergence), chauffé sur tout l'historique M1 réel sans trous, trades du **1er janvier 2026 au ${fmtDate(Math.max(...t26.map((t) => t.entryTime)))}** (${t26.length} signaux avant garde-fous), réglés à la minute (M1 exact) puis, à titre prudent, comme le moteur (M15, « stop d'abord »). Garde-fous réels rejoués (3 trades/jour, pause 30 min après perte, arrêt du jour). Cycles FTMO 1-Step : un cycle finit à +10 % (réussi) ou à -10 % trailing (raté), le suivant repart à 10 000 $.`, '',
  '**Limites :** coûts partiels (spread par défaut du moteur, sans commission, swap, glissement réel), niveau probablement surestimé ; le règlement M1 suppose l\'ordre rempli au niveau du signal ; les cycles sont un rejeu sur une seule suite de trades, pas une probabilité. Le vrai suivi démo : 2 trades réels seulement depuis le 21 septembre.', ''];
for (const risk of [0.3, 0.5]) for (const mode of ['m1', 'm15']) {
  const c = cycles(t26, mode, risk);
  const passes = c.out.filter((x) => x.result.startsWith('RÉUSSI')).length, busts = c.out.filter((x) => x.result.startsWith('RATÉ')).length;
  md.push(`## Cycles FTMO 1-Step — risque ${risk} %/trade, règlement ${mode === 'm1' ? 'M1 exact' : 'M15 (moteur)'} : ${passes} réussi(s), ${busts} raté(s)`, '', '| Cycle | Début | Fin (date d\'atteinte) | Jours | Trades | Résultat | Solde final | Plus haut / plus bas |', '|---|---|---|---|---|---|---|---|');
  c.out.forEach((x, i) => md.push(`| ${i + 1} | ${fmtDate(x.start)} | ${fmtDate(x.end)} | ${Math.round((x.end - x.start) / 86400000)} | ${x.trades} | ${x.result} | $${x.bal.toFixed(0)} | $${x.peak.toFixed(0)} / $${x.low.toFixed(0)} |`));
  md.push('', `Vétos des garde-fous : ${c.vetoed}.`, '');
}
// per mechanism (account replay at 0.3 %, continuous), both settlements
for (const mode of ['m1', 'm15']) {
  const a = account(t26, mode, 0.3);
  md.push(`## Performance de chaque stratégie en 2026 — règlement ${mode === 'm1' ? 'M1 exact' : 'M15 (moteur)'} (garde-fous réels, 0,3 %) — compte continu ${((a.bal - START) / START * 100).toFixed(1)} %, pire baisse ${a.dd.toFixed(1)} %`, '', '| Stratégie | Trades | Gagnants | Taux | R net | R / trade | Part du R total |', '|---|---|---|---|---|---|---|');
  const tot = sumR2(a.taken);
  for (const src of [...new Set(a.taken.map((t) => t.source))].sort((x, y) => sumR2(a.taken.filter((t) => t.source === y)) - sumR2(a.taken.filter((t) => t.source === x)))) {
    const l = a.taken.filter((t) => t.source === src); const w = l.filter((t) => t.r > 0).length;
    md.push(`| ${src} | ${l.length} | ${w} | ${(w / l.length * 100).toFixed(0)} % | ${fmt(sumR2(l))} | ${fmt(sumR2(l) / l.length, 3)} | ${(sumR2(l) / tot * 100).toFixed(0)} % |`);
  }
  md.push(`| **Total** | ${a.taken.length} | ${a.taken.filter((t) => t.r > 0).length} | ${(a.taken.filter((t) => t.r > 0).length / a.taken.length * 100).toFixed(0)} % | ${fmt(tot)} | ${fmt(tot / a.taken.length, 3)} | 100 % |`, '');
  md.push('### Mécanisme × paire (trades / R net)', '', `| Stratégie | ${SYMBOLS.join(' | ')} |`, `|---|${SYMBOLS.map(() => '---|').join('')}`);
  for (const src of [...new Set(a.taken.map((t) => t.source))].sort()) md.push(`| ${src} | ${SYMBOLS.map((sy) => { const l = a.taken.filter((t) => t.source === src && t.symbol === sy); return l.length ? `${l.length} / ${fmt(sumR2(l))}` : '—'; }).join(' | ')} |`);
  md.push('', '### Mois par mois (R net / trades)', '', '| Mois | Trades | R net |', '|---|---|---|');
  const mo = new Map(); for (const t of a.taken) { const k = fmtDate(t.entryTime).slice(0, 7); (mo.get(k) ?? mo.set(k, []).get(k)).push(t); }
  for (const [k, l] of [...mo.entries()].sort()) md.push(`| ${k} | ${l.length} | ${fmt(sumR2(l))} |`);
  md.push('');
}
fs.writeFileSync('data/backtest-input/combo-2026-cycles-and-mechanisms.md', md.join('\n'));
console.log(md.join('\n'));
