#!/usr/bin/env node
// exportMlSignals.js - étape 1 du filtre ML (pré-enregistrement preregistration-ml-signal-filter-2026-10-15.md).
// Signaux non bloqués du vrai moteur sur data/real-m1-full, réglés en M1 exact, + variables calculées avec les bougies
// M15 closes AVANT la bougie d'entrée. Écrit data/ml-signal-filter/signals.csv. Usage : node --max-old-space-size=4096 scripts/exportMlSignals.js
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS as OFF } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const SYMBOLS = CONFIG.symbols;
const loadGz = (sym) => zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('utf8').split('\n').slice(1).map((l) => l.split(',')).filter((p) => p.length >= 5).map((p) => ({ time: +p[0] - OFF, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }));
function toM15(m1) { const out = []; let cur = null; for (const c of m1) { const b = Math.floor(c.time / 900000) * 900000; if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; } } if (cur) out.push(cur); return out; }
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
const netR = (dir, entry, d, exit, sym) => { const g = (dir === 'bullish' ? exit - entry : entry - exit) / d; const s = DEFAULT_SPREADS[sym] ?? 0; return g - (s > 0 ? s / d : 0); };

const m1Bars = Object.fromEntries(SYMBOLS.map((s) => [s, loadGz(s)]));
const m15 = Object.fromEntries(SYMBOLS.map((s) => [s, toM15(m1Bars[s])]));
const M1 = {};
for (const s of SYMBOLS) { const cs = m1Bars[s]; M1[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
function settleM1(tr) {
  const S = M1[tr.symbol]; const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice };
  }
  return { exitPrice: S.c[maxI - 1] };
}
// indicateurs précalculés par symbole, valeurs « à la clôture de la bougie i »
const IND = {};
for (const s of SYMBOLS) {
  const c = m15[s]; const n = c.length; const tr = new Float64Array(n); const atr14 = new Float64Array(n); const atr100 = new Float64Array(n); const ema = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0 ? c[i].high - c[i].low : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    let s14 = 0, s100 = 0; for (let k = Math.max(0, i - 13); k <= i; k++) s14 += tr[k]; for (let k = Math.max(0, i - 99); k <= i; k++) s100 += tr[k];
    atr14[i] = s14 / Math.min(14, i + 1); atr100[i] = s100 / Math.min(100, i + 1);
    ema[i] = i === 0 ? c[i].close : ema[i - 1] + (2 / 801) * (c[i].close - ema[i - 1]);
  }
  IND[s] = { tr, atr14, atr100, ema };
}
const orderedSymbols = ['US500', 'US100', ...SYMBOLS.filter((s) => s !== 'US500' && s !== 'US100')];
const ordered = Object.fromEntries(orderedSymbols.map((s) => [s, m15[s]]));
const g0 = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
g0.setBalance(10000, ordered[orderedSymbols[0]][0].time);
const engine = new LiveStrategyEngine({ symbols: orderedSymbols, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, breakerBlockConfig: CONFIG.breakerBlock, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: g0, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
const pending = new Map(); const rows = [];
engine.warmUp(ordered, { onEvent: (sig, candle) => {
  if (sig.type === 'validated' && !sig.blockedReason) { pending.set(sig.symbol, { symbol: sig.symbol, source: sig.source, direction: sig.direction, entryPrice: sig.entryPrice, stopPrice: sig.stopPrice, targetPrice: sig.targetPrice, distance: sig.distance, rr: sig.rrMultiple ?? Math.abs(sig.targetPrice - sig.entryPrice) / sig.distance, entryTime: candle.time }); return; }
  if (sig.type !== 'closed') return;
  const o = pending.get(sig.symbol); pending.delete(sig.symbol); if (!o) return;
  const m1 = settleM1(o); if (!m1) return;
  rows.push({ o, exitPrice: m1.exitPrice });
} });
// variables : bougies d'indice < idx(entrée)
const out = ['time,symbol,source,dir,hour,dow,stop_pct,stop_atr,vol_ratio,ema_dev,ret5d,last_range,rr,net_r'];
for (const { o, exitPrice } of rows) {
  const bars = m15[o.symbol]; const ind = IND[o.symbol];
  let lo = 0, hi = bars.length; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].time >= o.entryTime) hi = m; else lo = m + 1; }
  const idx = lo; if (idx < 500 || bars[idx]?.time !== o.entryTime) continue;
  const p = idx - 1; const dir = o.direction === 'bullish' ? 1 : -1; const a14 = ind.atr14[p]; if (!(a14 > 0)) continue;
  const d = new Date(o.entryTime);
  const f = [o.entryTime, o.symbol, o.source, dir, d.getUTCHours() + d.getUTCMinutes() / 60, d.getUTCDay(), (o.distance / o.entryPrice) * 100, o.distance / a14, a14 / ind.atr100[p], (bars[p].close - ind.ema[p]) / a14 * dir, ((bars[p].close - bars[p - 480].close) / a14) * dir, ind.tr[p] / a14, o.rr, netR(o.direction, o.entryPrice, o.distance, exitPrice, o.symbol)];
  out.push(f.join(','));
}
fs.mkdirSync('data/ml-signal-filter', { recursive: true });
fs.writeFileSync('data/ml-signal-filter/signals.csv', out.join('\n') + '\n');
console.log('signaux exportés :', out.length - 1);
