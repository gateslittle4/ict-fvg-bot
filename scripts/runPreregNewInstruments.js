#!/usr/bin/env node
// runPreregNewInstruments.js
// Usage:  node --max-old-space-size=4096 scripts/runPreregNewInstruments.js train
//         node --max-old-space-size=4096 scripts/runPreregNewInstruments.js test     (UNE seule fois, apres avoir commite le resultat de `train`)
// Applique EXACTEMENT `data/backtest-input/preregistration-new-instruments-2026-09-21.md` (clarifications comprises). Ne pas y changer un critere.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const MODE = process.argv[2];
if (!['train', 'test'].includes(MODE)) { console.error('usage: train | test'); process.exit(1); }
const RETAINED_FILE = 'data/backtest-input/prereg-new-instruments-train-retained.json';
if (MODE === 'test' && !fs.existsSync(RETAINED_FILE)) { console.error('lancer `train` et commiter son resultat avant `test`'); process.exit(1); }
const START = 10000, RISK = 0.3;
const CUT = Date.UTC(2025, 0, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const eng = (y, m = 0) => Date.UTC(y, m, 1) - FIXED_EST_TO_UTC_OFFSET_MS;
const fmt = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);
const month = (ms) => new Date(ms + FIXED_EST_TO_UTC_OFFSET_MS).toISOString().slice(0, 7);

function loadGz(file) {
  const lines = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n'); const out = [];
  for (let i = 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 5) continue; out.push({ time: +p[0] - FIXED_EST_TO_UTC_OFFSET_MS, open: +p[1], high: +p[2], low: +p[3], close: +p[4], volume: 0 }); }
  return out;
}
function toM15(m1) {
  const out = []; let cur = null;
  for (const c of m1) { const b = Math.floor(c.time / 900000) * 900000; if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }; } else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; } }
  if (cur) out.push(cur); return out;
}
const NEW = ['XAGUSD', 'US30', 'XTIUSD'], OLD = ['XAUUSD', 'US100', 'US500', 'EURUSD'];
const m15 = {}, M = {};
function ingest(s, file) {
  const cs = loadGz(file);
  m15[s] = toM15(cs);
  M[s] = { t: Float64Array.from(cs, (c) => c.time), h: Float64Array.from(cs, (c) => c.high), l: Float64Array.from(cs, (c) => c.low), c: Float64Array.from(cs, (c) => c.close), n: cs.length };
  console.error('charge', s, cs.length, 'bougies M1', new Date().toISOString().slice(11, 19));
}
for (const s of OLD) ingest(s, `data/real-m1-full/${s}.csv.gz`);
for (const s of NEW) ingest(s, `data/real-m1-new-full/${s}.csv.gz`);
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const med = Object.fromEntries(Object.keys(m15).map((s) => [s, median(m15[s].map((c) => c.close))]));
// prereg: spread = 2 x sibling's default spread, relative to price (absolute value fixed from median prices)
const SPREAD = { XAGUSD: 2 * 0.30 * med.XAGUSD / med.XAUUSD, US30: 2 * 0.6 * med.US30 / med.US100, XTIUSD: 2 * 0.25 * med.XTIUSD / med.US500 };
const spreadsFor = (mult = 1) => ({ ...DEFAULT_SPREADS, XAGUSD: SPREAD.XAGUSD * mult, US30: SPREAD.US30 * mult, XTIUSD: SPREAD.XTIUSD * mult });
console.error('spreads (2x frere, valeur absolue):', JSON.stringify(SPREAD), 'prix medians:', JSON.stringify(Object.fromEntries(Object.entries(med).map(([k, v]) => [k, +v.toFixed(2)]))));

const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function settleM1(tr) {
  const S = M[tr.symbol]; const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 480 * 15);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i] };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i] };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1] };
}
const grossR = (t, exit) => (t.direction === 'bullish' ? exit - t.entryPrice : t.entryPrice - exit) / t.distance;

// canonical trade list of the REAL engine for a given (symbols, mechanism configs), M1-exact settled
function canonical({ symbols, fvgConfig = {}, nwogConfig = null, weeklySweepConfig = null, divergenceConfig = null, judasSwingConfig = null, breakerBlockConfig = null, silverBulletConfig = null, cbdrConfig = null, spreads }) {
  const g0 = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  g0.setBalance(START, Math.min(...symbols.map((s) => m15[s][0].time)));
  const engine = new LiveStrategyEngine({ symbols, fvgConfig, divergenceConfig, nwogConfig, judasSwingConfig, weeklySweepConfig, breakerBlockConfig, silverBulletConfig, cbdrConfig, guardrail: g0, riskPctPerTrade: RISK, spreads });
  const pending = new Map(), out = [];
  engine.warmUp(Object.fromEntries(symbols.map((s) => [s, m15[s]])), { completeDivergencePair: true, onEvent: (sig, candle) => {
    if (sig.type === 'validated' && !sig.blockedReason) { pending.set(sig.symbol, { symbol: sig.symbol, source: sig.source, direction: sig.direction, entryPrice: sig.entryPrice, stopPrice: sig.stopPrice, targetPrice: sig.targetPrice, distance: sig.distance, entryTime: candle.time }); return; }
    if (sig.type !== 'closed') return;
    const o = pending.get(sig.symbol); pending.delete(sig.symbol); if (!o) return;
    const st = settleM1(o); if (!st) return;
    out.push({ ...o, exitTime: st.exitTime, gross: grossR(o, st.exitPrice) });
  } });
  return out.sort((a, b) => a.entryTime - b.entryTime);
}
// real guardrail replay; cost = spread/distance at multiplier `mult` of the (2x sibling) spread; window filter applied to entries
function replay(list, spreads, mult, from, to) {
  const g = new GuardrailEngine({ ...CONFIG.guardrails }); g.setBalance(START, list.length ? list[0].entryTime : 0);
  let bal = START; const taken = [];
  for (const t of list) {
    if (!g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
    const s = spreads[t.symbol] ?? 0; const cost = s > 0 ? (s * mult) / t.distance : 0; const r = t.gross - cost;
    const pnl = bal * (RISK / 100) * r; bal += pnl; g.recordTrade({ pnl, time: t.exitTime, balanceAfter: bal, symbol: t.symbol });
    if (t.entryTime >= from && t.entryTime < to) taken.push({ ...t, r });
  }
  return taken;
}
const sum = (l) => l.reduce((a, t) => a + t.r, 0);
const per = (l) => (l.length ? sum(l) / l.length : 0);

// ---- the 11 pre-registered hypotheses
const fvgSib = { XAGUSD: 'XAUUSD', US30: 'US100', XTIUSD: 'US500' };
const HYP = [];
for (const s of NEW) HYP.push({ id: `H-fvg-${s}`, label: `FVG ${s} (config ${fvgSib[s]})`, symbols: [s], make: () => ({ fvgConfig: { [s]: CONFIG.fvg.perSymbol[fvgSib[s]] } }) });
for (const s of NEW) HYP.push({ id: `H-weekly-${s}`, label: `Weekly Sweep ${s}`, symbols: [s], make: () => ({ weeklySweepConfig: { symbols: [s], rrMultiple: 5, maxHoldingM15Candles: 480 } }) });
for (const s of NEW) HYP.push({ id: `H-nwog-${s}`, label: `NWOG ${s}${s === 'US30' ? ' (achat seul, config US100)' : ' (bidirectionnel, config GER40)'}`, symbols: [s], make: () => ({ nwogConfig: { symbols: [s], rrMultiple: 5, maxHoldingM15Candles: 480, longOnlySymbols: s === 'US30' ? ['US30'] : [] } }) });
HYP.push({ id: 'H-div-XAUUSD-XAGUSD', label: 'Divergence XAUUSD/XAGUSD', symbols: ['XAUUSD', 'XAGUSD'], make: () => ({ divergenceConfig: { ...CONFIG.divergence, pair: ['XAUUSD', 'XAGUSD'] } }) });
HYP.push({ id: 'H-div-US100-US30', label: 'Divergence US100/US30', symbols: ['US100', 'US30'], make: () => ({ divergenceConfig: { ...CONFIG.divergence, pair: ['US100', 'US30'] } }) });

const sp2 = spreadsFor(1); // SPREAD already holds the registered 2x-sibling value: mult 1 = the DECISION cost
const trainStart = (h) => Math.max(...h.symbols.map((s) => m15[s][0].time));
function evaluate(h) {
  const list = canonical({ symbols: h.symbols, ...h.make(), spreads: sp2 });
  const own = list; // trades of both legs for divergence, single symbol otherwise
  return { h, list: own };
}

const md = [`# Pré-enregistrement « nouveaux instruments » — ${MODE === 'train' ? 'ENTRAÎNEMENT (avant 2025-01-01)' : 'TEST (2025-01-01 → fin), lecture unique des hypothèses retenues'}`, '', 'Règles : `data/backtest-input/preregistration-new-instruments-2026-09-21.md` (clarifications comprises). Vrai moteur, M1 exact, garde-fous réels rejoués (0,3 %), spread = 2 × le frère (décision). ' + `Spreads absolus : ${Object.entries(SPREAD).map(([k, v]) => `${k} ${v.toPrecision(3)}`).join(', ')}.`, ''];

if (MODE === 'train') {
  const rows = [], retained = [];
  md.push('| Hypothèse | Trades | R net / trade | R net total | 1re moitié | 2e moitié | Verdict |', '|---|---|---|---|---|---|---|');
  for (const h of HYP) {
    const { list } = evaluate(h);
    const from = trainStart(h) + 30 * 86400000; // 30 jours de chauffe
    const taken = replay(list, sp2, 1, from, CUT);
    const mid = (from + CUT) / 2;
    const a = taken.filter((t) => t.entryTime < mid), b = taken.filter((t) => t.entryTime >= mid);
    const ok = taken.length >= 60 && per(taken) >= 0.10 && sum(a) > 0 && sum(b) > 0;
    md.push(`| ${h.label} | ${taken.length} | ${fmt(per(taken), 3)} | ${fmt(sum(taken), 1)} | ${fmt(sum(a), 1)} (${a.length}) | ${fmt(sum(b), 1)} (${b.length}) | ${ok ? '**RETENUE** (test à lire)' : 'rejetée'} |`);
    if (ok) retained.push(h.id);
    console.error(h.id, taken.length, fmt(per(taken), 3), ok ? 'RETENUE' : 'rejetee');
  }
  md.push('', `Retenues pour la lecture du test : ${retained.length ? retained.join(', ') : 'aucune'}.`, '', 'Règle appliquée : ≥ 60 trades, R net par trade ≥ +0,10 à 2 × le spread du frère, et R net positif sur les DEUX moitiés de l\'entraînement (repli prévu quand il y a moins de 3 années civiles complètes). Aucune hypothèse rejetée ici n\'a vu son test.');
  fs.writeFileSync(RETAINED_FILE, JSON.stringify({ decidedAt: new Date().toISOString(), retained }, null, 2));
  fs.writeFileSync('data/backtest-input/prereg-new-instruments-train.md', md.join('\n'));
  console.log(md.join('\n'));
} else {
  const { retained } = JSON.parse(fs.readFileSync(RETAINED_FILE, 'utf8'));
  // monthly R of the current combo (production, 4 pairs) for the correlation criterion
  const comboSyms = ['US500', 'US100', 'XAUUSD', 'EURUSD'];
  const combo = canonical({ symbols: comboSyms, fvgConfig: CONFIG.fvg.perSymbol, divergenceConfig: CONFIG.divergence, nwogConfig: CONFIG.nwog, judasSwingConfig: CONFIG.judasSwing, weeklySweepConfig: CONFIG.weeklySweep, silverBulletConfig: CONFIG.silverBullet, cbdrConfig: CONFIG.cbdr, spreads: DEFAULT_SPREADS });
  const comboTaken = replay(combo, DEFAULT_SPREADS, 1, CUT, Infinity);
  const monthly = (l) => { const m = new Map(); for (const t of l) m.set(month(t.entryTime), (m.get(month(t.entryTime)) ?? 0) + t.r); return m; };
  const corr = (A, B) => { const ks = [...new Set([...A.keys(), ...B.keys()])].sort(); const x = ks.map((k) => A.get(k) ?? 0), y = ks.map((k) => B.get(k) ?? 0); const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : 0; };
  const cm = monthly(comboTaken);
  md.push('| Hypothèse | Trades | R net / trade (2 ×) | R net total | Corrélation mensuelle avec le combo | Verdict |', '|---|---|---|---|---|---|');
  for (const id of retained) {
    const h = HYP.find((x) => x.id === id); const { list } = evaluate(h);
    const taken = replay(list, sp2, 1, CUT, Infinity);
    const c = corr(monthly(taken), cm);
    const pass = taken.length >= 30 && per(taken) >= 0.10 && sum(taken) > 0 && c < 0.3;
    const modest = pass && (per(taken) < 0.15 || taken.length < 40);
    md.push(`| ${h.label} | ${taken.length} | ${fmt(per(taken), 3)} | ${fmt(sum(taken), 1)} | ${c.toFixed(2)} | ${pass ? (modest ? 'réussie mais MODESTE : non concluante (règle 4)' : '**RÉUSSIE : candidate (mode alerte)**') : 'ÉCHEC'} |`);
    if (id.endsWith('XTIUSD')) { const t10 = replay(list, sp2, 10, CUT, Infinity); md.push(`| ↳ sensibilité XTIUSD, spread ×10 (sans effet sur la décision) | ${t10.length} | ${fmt(per(t10), 3)} | ${fmt(sum(t10), 1)} | — | — |`); }
  }
  if (retained.length === 0) md.push('| (aucune hypothèse retenue à l\'entraînement : rien à lire) | | | | | |');
  md.push('', 'Test lu UNE fois. Aucune adoption directe : une candidate est suivie en mode alerte jusqu\'à 100 signaux hors échantillon à ≥ +0,1 R/trade.');
  fs.writeFileSync('data/backtest-input/prereg-new-instruments-test.md', md.join('\n'));
  console.log(md.join('\n'));
}
