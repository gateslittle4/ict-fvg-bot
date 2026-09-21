#!/usr/bin/env node
// runPreregBatch3.js
// Usage:  node --max-old-space-size=4096 scripts/runPreregBatch3.js train
//         node --max-old-space-size=4096 scripts/runPreregBatch3.js test     (UNE seule fois, apres avoir commite le resultat de `train`)
// Applique EXACTEMENT `data/backtest-input/preregistration-batch3-2026-09-21.md`. Ne pas y changer un critere.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const MODE = process.argv[2];
if (!['train', 'test'].includes(MODE)) { console.error('usage: train | test'); process.exit(1); }
const RETAINED_FILE = 'data/backtest-input/prereg-batch3-train-retained.json';
if (MODE === 'test' && !fs.existsSync(RETAINED_FILE)) { console.error('lancer `train` et commiter son resultat avant `test`'); process.exit(1); }
const SYMS = ['US100', 'US500', 'XAUUSD', 'EURUSD'];
const DAY = 86400000, H17 = 17 * 3600000;
const T_TRAIN0 = Date.UTC(2011, 0, 1), T_TRAIN1 = Date.UTC(2020, 0, 1), T_MID = Date.UTC(2016, 0, 1), T_TEST1 = Date.UTC(2026, 0, 1);
const SWAP = 0.0001; // 0,01 % du notionnel par jour (decision)
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const month = (ms) => new Date(ms).toISOString().slice(0, 7);

// ---- daily bars (17:00-17:00 engine time) from M15
function daily(m15) {
  const bars = []; let cur = null;
  for (let i = 0; i < m15.length; i++) {
    const c = m15[i]; const key = Math.floor((c.time - H17) / DAY);
    if (!cur || cur.key !== key) { if (cur) bars.push(cur); cur = { key, time: key * DAY + H17, open: c.open, high: c.high, low: c.low, close: c.close, i0: i, i1: i }; }
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; cur.i1 = i; }
  }
  if (cur) bars.push(cur); return bars;
}
function atrSeries(bars, n) { const a = new Array(bars.length).fill(null); const tr = []; for (let i = 0; i < bars.length; i++) { const p = i > 0 ? bars[i - 1].close : bars[i].close; tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - p), Math.abs(bars[i].low - p))); if (i >= n) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += tr[j]; a[i] = s / n; } } return a; }
function smaSeries(bars, n) { const a = new Array(bars.length).fill(null); let s = 0; for (let i = 0; i < bars.length; i++) { s += bars[i].close; if (i >= n) s -= bars[i - n].close; if (i >= n - 1) a[i] = s / n; } return a; }
function rsi2Series(bars) { const r = new Array(bars.length).fill(null); let ag = 0, al = 0; for (let i = 1; i < bars.length; i++) { const d = bars[i].close - bars[i - 1].close; const g = Math.max(d, 0), l = Math.max(-d, 0); if (i === 1) { ag = g; al = l; } else if (i === 2) { ag = (ag + g) / 2; al = (al + l) / 2; } else { ag = (ag + g) / 2; al = (al + l) / 2; } if (i >= 2) r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } return r; }

// intraday stop check over M15 bars of one daily bar; returns {price,time} or null
function stopHit(m15, from, to, bull, stop) {
  for (let k = from; k <= to; k++) { const c = m15[k]; if (bull ? c.open <= stop : c.open >= stop) return { price: c.open, time: c.time }; if (bull ? c.low <= stop : c.high >= stop) return { price: stop, time: c.time }; }
  return null;
}
// generic daily backtest of one hypothesis on one instrument
function run(sym, m15, bars, kind) {
  const atr20 = atrSeries(bars, 20), atr14 = atrSeries(bars, 14), sma200 = smaSeries(bars, 200), sma5 = smaSeries(bars, 5), rsi = rsi2Series(bars);
  const trades = []; let pos = null;
  const spread2 = 2 * (DEFAULT_SPREADS[sym] ?? 0);
  const close = (exitPrice, exitTime, p) => { const dist = p.dist; const gross = p.dir * (exitPrice - p.entry) / dist; const days = (exitTime - p.entryTime) / DAY; const cost = spread2 / dist; const swap = SWAP * days * p.entry / dist; const swap2 = 2 * SWAP * days * p.entry / dist; trades.push({ sym, kind, dir: p.dir, entryTime: p.entryTime, exitTime, r: gross - cost - swap, r2: gross - cost - swap2, days }); };
  for (let i = 250; i < bars.length - 1; i++) {
    const b = bars[i], nxt = bars[i + 1];
    // intraday stop on bar i (for a position opened at an earlier open) is handled when we process bar i as the "next" bar below
    if (pos) {
      // evaluate stop over bar i's M15 bars (position was opened at bar i's open or earlier)
      const from = pos.entered === i ? bars[i].i0 : bars[i].i0;
      const hit = stopHit(m15, from, bars[i].i1, pos.dir === 1, pos.stop);
      if (hit) { close(hit.price, hit.time, pos); pos = null; }
    }
    let exitNext = false;
    if (pos) {
      if (kind === 'T') {
        let lo20 = Infinity, hi20 = -Infinity; for (let j = i - 19; j <= i; j++) { lo20 = Math.min(lo20, bars[j].close); hi20 = Math.max(hi20, bars[j].close); }
        exitNext = pos.dir === 1 ? b.close <= lo20 : b.close >= hi20;
      } else { exitNext = b.close > sma5[i] || i - pos.entered >= 10; }
      if (exitNext) { close(nxt.open, nxt.time, pos); pos = null; }
    }
    if (!pos) {
      let dir = 0, dist = 0;
      if (kind === 'T') {
        let hi55 = -Infinity, lo55 = Infinity; for (let j = i - 55; j <= i - 1; j++) { hi55 = Math.max(hi55, bars[j].close); lo55 = Math.min(lo55, bars[j].close); }
        if (b.close > hi55) dir = 1; else if (b.close < lo55) dir = -1; dist = 2 * atr20[i];
      } else { if (rsi[i] !== null && rsi[i] < 10 && sma200[i] !== null && b.close > sma200[i]) dir = 1; dist = 3 * atr14[i]; }
      if (dir !== 0 && dist > 0) pos = { dir, entry: nxt.open, entryTime: nxt.time, entered: i + 1, dist, stop: nxt.open - dir * dist };
    }
  }
  return trades;
}
const stats = (l, key = 'r') => { const n = l.length, sum = l.reduce((a, t) => a + t[key], 0), mean = n ? sum / n : 0; const w = l.filter((t) => t[key] > 0).reduce((a, t) => a + t[key], 0), lo = -l.filter((t) => t[key] < 0).reduce((a, t) => a + t[key], 0); const sd = n > 1 ? Math.sqrt(l.reduce((a, t) => a + (t[key] - mean) ** 2, 0) / (n - 1)) : 0; return { n, sum, mean, pf: lo > 0 ? w / lo : (w > 0 ? Infinity : 0), t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0 }; };
const maxDD = (l, risk = 0.003) => { let b = 1, pk = 1, dd = 0; for (const t of [...l].sort((a, c) => a.exitTime - c.exitTime)) { b *= 1 + risk * t.r; pk = Math.max(pk, b); dd = Math.max(dd, (pk - b) / pk); } return dd * 100; };

const HYP = []; for (const s of SYMS) HYP.push({ id: `T-${s}`, kind: 'T', sym: s, label: `Tendance Donchian 55/20 ${s}`, minTrain: 30, minTest: 25 });
for (const s of SYMS) HYP.push({ id: `M-${s}`, kind: 'M', sym: s, label: `RSI(2) retour à la moyenne ${s}`, minTrain: 60, minTest: 40 });
const hist = {}; for (const s of SYMS) { const c = loadCandlesFromCsv(`data/backtest-input/${s}.csv`).candles; hist[s] = { m15: c, bars: daily(c) }; }
console.error('donnees:', SYMS.map((s) => `${s} ${hist[s].bars.length} jours`).join(', '));
const all = {}; for (const h of HYP) all[h.id] = run(h.sym, hist[h.sym].m15, hist[h.sym].bars, h.kind);
const inWin = (l, a, b) => l.filter((t) => t.entryTime >= a && t.entryTime < b);

const md = [`# Pré-enregistrement lot 3 — ${MODE === 'train' ? 'ENTRAÎNEMENT (2011-2019)' : 'TEST (2020-2025), lecture unique des hypothèses retenues'}`, '', 'Règles : `data/backtest-input/preregistration-batch3-2026-09-21.md`. Bougies journalières 17:00-17:00 (temps moteur) reconstruites des M15, spread = 2 × le défaut, swap 0,01 %/jour du notionnel, R net.', ''];
if (MODE === 'train') {
  const retained = [];
  md.push('| Hypothèse | Trades | R net/trade | Facteur de profit | 2011-2015 | 2016-2019 | Verdict |', '|---|---|---|---|---|---|---|');
  for (const h of HYP) {
    const tr = inWin(all[h.id], T_TRAIN0, T_TRAIN1), s = stats(tr), a = inWin(tr, T_TRAIN0, T_MID), b = inWin(tr, T_MID, T_TRAIN1);
    const ok = s.n >= h.minTrain && s.mean >= 0.10 && s.pf >= 1.15 && stats(a).sum > 0 && stats(b).sum > 0;
    md.push(`| ${h.label} | ${s.n} | ${fmt(s.mean, 3)} | ${s.pf.toFixed(2)} | ${fmt(stats(a).sum, 1)} (${a.length}) | ${fmt(stats(b).sum, 1)} (${b.length}) | ${ok ? '**RETENUE** (test à lire)' : 'rejetée'} |`);
    if (ok) retained.push(h.id); console.error(h.id, s.n, fmt(s.mean, 3), 'PF', s.pf.toFixed(2), ok ? 'RETENUE' : 'rejetee');
  }
  md.push('', `Retenues pour la lecture du test : ${retained.length ? retained.join(', ') : 'aucune'}.`, '', 'Règle : T ≥ 30 trades, M ≥ 60 trades ; R net/trade ≥ +0,10 ; facteur de profit ≥ 1,15 ; R net positif sur les DEUX moitiés. Aucune rejetée n\'a vu son test.');
  fs.writeFileSync(RETAINED_FILE, JSON.stringify({ decidedAt: new Date().toISOString(), retained }, null, 2));
  fs.writeFileSync('data/backtest-input/prereg-batch3-train.md', md.join('\n'));
  console.log(md.join('\n'));
} else {
  const { retained } = JSON.parse(fs.readFileSync(RETAINED_FILE, 'utf8'));
  // combo monthly R (2023-2025) for the correlation criterion: real engine, M1 exact, 4 production pairs
  const M = {}, m15r = {};
  function ingest(s) { const lines = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${s}.csv.gz`)).toString('utf8').split('\n'); const cs = []; for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; cs.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); } const out = []; let cur = null; for (const c of cs) { const bb = Math.floor(c.time / 900000) * 900000; if (!cur || cur.time !== bb) { if (cur) out.push(cur); cur = { time: bb, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; } } if (cur) out.push(cur); m15r[s] = out; M[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length }; }
  for (const s of ['US500', 'US100', 'XAUUSD', 'EURUSD']) ingest(s);
  const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
  const settle = (tr) => { const S = M[tr.symbol]; const bull = tr.direction === 'bullish'; const st = lower(S.t, S.n, tr.entryTime), en = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000)); let fill = -1; for (let i = st; i < en; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; } if (fill < 0) fill = st < S.n ? st : -1; if (fill < 0) return null; const mx = Math.min(S.n, fill + 480 * 15); for (let i = fill; i < mx; i++) { if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { p: tr.stopPrice, t: S.t[i] }; if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { p: tr.targetPrice, t: S.t[i] }; } return { p: S.c[mx - 1], t: S.t[mx - 1] }; };
  const g0 = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 }); g0.setBalance(10000, m15r.US500[0].time);
  const eng = new LiveStrategyEngine({ symbols: ['US500', 'US100', 'XAUUSD', 'EURUSD'], fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, guardrail: g0, riskPctPerTrade: 0.3, spreads: DEFAULT_SPREADS });
  const pend = new Map(), ctr = [];
  eng.warmUp(Object.fromEntries(Object.keys(m15r).map((s) => [s, m15r[s]])), { completeDivergencePair: true, onEvent: (sig, candle) => { if (sig.type === 'validated' && !sig.blockedReason) { pend.set(sig.symbol, { symbol: sig.symbol, direction: sig.direction, entryPrice: sig.entryPrice, stopPrice: sig.stopPrice, targetPrice: sig.targetPrice, distance: sig.distance, entryTime: candle.time }); return; } if (sig.type !== 'closed') return; const o = pend.get(sig.symbol); pend.delete(sig.symbol); if (!o) return; const st = settle(o); if (!st) return; const s = DEFAULT_SPREADS[o.symbol] ?? 0; ctr.push({ ...o, exitTime: st.t, r: ((o.direction === 'bullish' ? st.p - o.entryPrice : o.entryPrice - st.p) / o.distance) - (s > 0 ? s / o.distance : 0) }); } });
  const gg = new GuardrailEngine({ ...CONFIG.guardrails }); gg.setBalance(10000, ctr[0].entryTime); let bal = 10000; const comboM = new Map();
  for (const t of ctr.sort((a, b) => a.entryTime - b.entryTime)) { if (!gg.canTakeNewTrade(t.entryTime, t.symbol)) continue; const pnl = bal * 0.003 * t.r; bal += pnl; gg.recordTrade({ pnl, time: t.exitTime, balanceAfter: bal, symbol: t.symbol }); const k = month(t.entryTime); comboM.set(k, (comboM.get(k) ?? 0) + t.r); }
  const corr = (A, B, from, to) => { const ks = [...new Set([...A.keys(), ...B.keys()])].filter((k) => k >= from && k <= to).sort(); const x = ks.map((k) => A.get(k) ?? 0), y = ks.map((k) => B.get(k) ?? 0); const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : 0; };
  // forward 2026 complement (informational): same rules on the real-M1-derived M15 series
  md.push('| Hypothèse | Trades | R net/trade | R total | t | Corrélation mensuelle (2023-2025) | Pire baisse à 0,3 % | Verdict |', '|---|---|---|---|---|---|---|---|');
  for (const id of retained) {
    const h = HYP.find((x) => x.id === id); const te = inWin(all[id], T_TRAIN1, T_TEST1), s = stats(te);
    const cm = new Map(); for (const t of te) { const k = month(t.entryTime); cm.set(k, (cm.get(k) ?? 0) + t.r); }
    const c = corr(cm, comboM, '2023-01', '2025-12'), dd = maxDD(te);
    const pass = s.n >= h.minTest && s.mean >= 0.10 && s.sum > 0 && s.t >= 2.0 && c < 0.3 && dd < 6;
    const s2 = stats(te, 'r2');
    md.push(`| ${h.label} | ${s.n} | ${fmt(s.mean, 3)} | ${fmt(s.sum, 1)} | ${s.t.toFixed(2)} | ${c.toFixed(2)} | ${dd.toFixed(1)} % | ${pass ? '**RÉUSSIE : candidate (mode alerte)**' : (s.mean >= 0.10 && s.t < 2 ? 'non concluante (t < 2)' : 'ÉCHEC')} |`, `| ↳ sensibilité swap 0,02 %/jour (sans effet sur la décision) | ${s2.n} | ${fmt(s2.mean, 3)} | ${fmt(s2.sum, 1)} | ${s2.t.toFixed(2)} | — | — | — |`);
  }
  if (retained.length === 0) md.push('| (aucune retenue à l\'entraînement : rien à lire) | | | | | | | |');
  md.push('', 'Test lu UNE fois. Aucune adoption directe. Le complément forward 2026 (données M1 réelles) n\'a pas été calculé ici : à faire séparément pour toute candidate.');
  fs.writeFileSync('data/backtest-input/prereg-batch3-test.md', md.join('\n'));
  console.log(md.join('\n'));
}
