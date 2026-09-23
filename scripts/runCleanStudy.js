#!/usr/bin/env node
// runCleanStudy.js - étude propre entraînement / test / forward (Esdras, 2026-09-23)
//
// Protocole imposé par Esdras pour toute analyse : ENTRAÎNEMENT 2010-2022, TEST 2023-2025, FORWARD 2026.
// Tous les choix (quelles jambes stratégie x paire, quel RRR, quel % de risque) se font sur l'entraînement SEUL ;
// le test et le forward sont lus une fois, sans rien choisir dessus. Remplace les analyses « candidates » et « 3e jambe ».
//
// Données : entraînement = HistData M1 (data/histdata-m1, voir buildHistdataM1.js) ; test et forward = M1 du broker
// (data/real-m1-full). Chaque source est rejouée à part par le vrai LiveStrategyEngine (bougies M15 reconstruites depuis
// le M1) et chaque trade est réglé à la minute. Préchauffage du broker : HistData 2022 collé avant le premier M1 broker
// (les trades d'avant 2023 sont jetés).
//
// Usage :
//   node --max-old-space-size=6144 scripts/runCleanStudy.js legs <id,id,...|all>  -> trades de chaque jambe x RRR, en cache
//   node --max-old-space-size=6144 scripts/runCleanStudy.js report                -> sélection sur l'entraînement + rapport
import fs from 'node:fs';
import zlib from 'node:zlib';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { buildEffectiveConfig } from '../src/accountRegistry.js';
import { DailyAlertEngine } from '../src/dailyAlertEngine.js';
import { CONFIG } from '../src/config.js';

const OFF = FIXED_EST_TO_UTC_OFFSET_MS;
const DAY = 86400000;
const START = 10000;
const eng = (y, m = 0, d = 1) => Date.UTC(y, m, d) - OFF;
const PERIODS = [
  { id: 'train', label: 'Entraînement 2010-2022', from: eng(2010), to: eng(2023), src: 'hist' },
  { id: 'test', label: 'Test 2023-2025', from: eng(2023), to: eng(2026), src: 'broker' },
  { id: 'fwd', label: 'Forward 2026 (→ 18 sept.)', from: eng(2026), to: eng(2027), src: 'broker' },
];
const TRAIN_HALVES = [[eng(2010), eng(2017)], [eng(2017), eng(2023)]];
const RRS = [2, 3, 4, 5, 6, 7];
const RISKS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
const CACHE = 'data/clean-study-cache';
// Règle de sélection, fixée AVANT de lire le test : RRR = meilleur R net d'entraînement ; jambe gardée si, à ce RRR,
// t >= 2 sur l'entraînement, R net positif dans chaque moitié (2010-2016 et 2017-2022) et au moins 30 trades.
const MIN_T = 2;
const MIN_TRADES = 30;

const SWAP = {
  US100: { long: -43.7, short: 18.4, pip: 0.1, triple: 5 },
  US500: { long: -11, short: 4.4, pip: 0.1, triple: 5 },
  XAUUSD: { long: -63.88, short: 39.45, pip: 0.01, triple: 3 },
  EURUSD: { long: -0.65, short: 0.28, pip: 0.0001, triple: 3 },
};
const ROLLOVER_ENGINE_MS = (21 - OFF / 3600000) * 3600000;
function swapR(symbol, direction, distance, fillTime, exitTime) {
  const sw = SWAP[symbol];
  if (!sw || !(distance > 0)) return 0;
  const perDay = (direction === 'bullish' ? sw.long : sw.short) * sw.pip;
  let nights = 0;
  let tau = Math.floor(fillTime / DAY) * DAY + ROLLOVER_ENGINE_MS;
  if (tau <= fillTime) tau += DAY;
  for (; tau <= exitTime; tau += DAY) {
    const dow = new Date(tau + OFF).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    nights += dow === sw.triple ? 3 : 1;
  }
  return (nights * perDay) / distance;
}

// --- Jambes : chaque stratégie du bot sur chaque paire où elle peut tourner (config de production, seul le RRR varie).
const SYMS = ['US100', 'US500', 'XAUUSD', 'EURUSD'];
const LEGS = {};
for (const s of ['US100', 'US500', 'XAUUSD']) {
  LEGS[`fvg-${s}`] = { label: `FVG ${s}`, syms: [s], prodRR: CONFIG.fvg.perSymbol[s].rrMultiple, cfg: (rr) => ({ fvgConfig: { [s]: { ...CONFIG.fvg.perSymbol[s], rrMultiple: rr } } }) };
}
LEGS.divergence = { label: 'Divergence US100/US500', syms: ['US500', 'US100'], prodRR: CONFIG.divergence.rrMultiple, cfg: (rr) => ({ divergenceConfig: { ...CONFIG.divergence, rrMultiple: rr } }) };
const PER_SYMBOL = [
  ['nwog', 'nwogConfig', 'NWOG'], ['judasSwing', 'judasSwingConfig', 'Judas Swing'], ['weeklySweep', 'weeklySweepConfig', 'Weekly Sweep'],
  ['breakerBlock', 'breakerBlockConfig', 'Breaker Block'], ['silverBullet', 'silverBulletConfig', 'Silver Bullet'], ['cbdr', 'cbdrConfig', 'CBDR'],
];
for (const [key, cfgKey, name] of PER_SYMBOL) {
  for (const s of SYMS) {
    LEGS[`${key}-${s}`] = { label: `${name} ${s}`, syms: [s], prodRR: CONFIG[key].rrMultiple, inProd: CONFIG[key].symbols.includes(s), cfg: (rr) => ({ [cfgKey]: { ...CONFIG[key], symbols: [s], rrMultiple: rr } }) };
  }
}
for (const k of ['fvg-US100', 'fvg-US500', 'fvg-XAUUSD', 'divergence']) LEGS[k].inProd = true;
LEGS['rsi2-US500'] = { label: 'RSI(2) US500 (journalier)', syms: ['US500'], rsi2: true, inProd: false };

// --- Données
function readCsvGz(path) {
  const txt = zlib.gunzipSync(fs.readFileSync(path)).toString('latin1');
  let n = 0; for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) n++;
  const t = new Float64Array(n), o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n);
  let k = 0; let pos = txt.indexOf('\n') + 1;
  while (pos > 0 && pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const p = txt.slice(pos, end).split(',');
    if (p.length >= 5) { t[k] = +p[0] - OFF; o[k] = +p[1]; h[k] = +p[2]; l[k] = +p[3]; c[k] = +p[4]; k++; }
    pos = end + 1;
  }
  return { t: t.subarray(0, k), o: o.subarray(0, k), h: h.subarray(0, k), l: l.subarray(0, k), c: c.subarray(0, k), n: k };
}
function concat(a, b) {
  const f = (x, y) => { const r = new Float64Array(x.length + y.length); r.set(x); r.set(y, x.length); return r; };
  return { t: f(a.t, b.t), o: f(a.o, b.o), h: f(a.h, b.h), l: f(a.l, b.l), c: f(a.c, b.c), n: a.n + b.n };
}
function slice(a, i, j) { return { t: a.t.subarray(i, j), o: a.o.subarray(i, j), h: a.h.subarray(i, j), l: a.l.subarray(i, j), c: a.c.subarray(i, j), n: j - i }; }
const lower = (a, n, x) => { let lo = 0, hi = n; while (hi > lo) { const m = (lo + hi) >> 1; if (a[m] >= x) hi = m; else lo = m + 1; } return lo; };
function loadM1(src, sym) {
  const hist = readCsvGz(`data/histdata-m1/${sym}.csv.gz`);
  if (src === 'hist') return slice(hist, 0, lower(hist.t, hist.n, eng(2023)));
  const broker = readCsvGz(`data/real-m1-full/${sym}.csv.gz`);
  const i0 = lower(hist.t, hist.n, eng(2022)); const i1 = lower(hist.t, hist.n, broker.t[0]);
  return concat(slice(hist, i0, i1), broker); // préchauffage HistData 2022, puis broker
}
function toM15(S) {
  const out = []; let cur = null;
  for (let i = 0; i < S.n; i++) {
    const b = Math.floor(S.t[i] / 900000) * 900000;
    if (!cur || cur.time !== b) { if (cur) out.push(cur); cur = { time: b, open: S.o[i], high: S.h[i], low: S.l[i], close: S.c[i], volume: 0 }; }
    else { if (S.h[i] > cur.high) cur.high = S.h[i]; if (S.l[i] < cur.low) cur.low = S.l[i]; cur.close = S.c[i]; }
  }
  if (cur) out.push(cur);
  return out;
}

function settleM1(S, tr) {
  const bull = tr.direction === 'bullish';
  const start = lower(S.t, S.n, tr.entryTime); const end = Math.min(S.n, lower(S.t, S.n, tr.entryTime + 900000));
  let fill = -1;
  for (let i = start; i < end; i++) if (S.l[i] <= tr.entryPrice && tr.entryPrice <= S.h[i]) { fill = i; break; }
  if (fill < 0) fill = start < S.n ? start : -1;
  if (fill < 0) return null;
  const maxI = Math.min(S.n, fill + 5 * 1440);
  for (let i = fill; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i], fillTime: S.t[fill] };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i], fillTime: S.t[fill] };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], fillTime: S.t[fill] };
}

const NONE = { fvgConfig: {}, divergenceConfig: null, nwogConfig: null, judasSwingConfig: null, weeklySweepConfig: null, breakerBlockConfig: null, silverBulletConfig: null, cbdrConfig: null };
function engineTrades(data, syms, configs) {
  const ordered = {};
  for (const s of syms) ordered[s] = data[s].m15;
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(START, ordered[syms[0]][0].time);
  const engine = new LiveStrategyEngine({ symbols: syms, ...NONE, ...configs, guardrail, riskPctPerTrade: 0.5, spreads: DEFAULT_SPREADS });
  const pending = new Map(); const trades = [];
  engine.warmUp(ordered, {
    completeDivergencePair: true,
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pending.set(signal.symbol, { symbol: signal.symbol, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time });
        return;
      }
      if (signal.type !== 'closed') return;
      const o = pending.get(signal.symbol); pending.delete(signal.symbol);
      if (!o) return;
      const x = settleM1(data[o.symbol].m1, o);
      if (!x) return;
      const gross = (o.direction === 'bullish' ? x.exitPrice - o.entryPrice : o.entryPrice - x.exitPrice) / o.distance;
      // Coûts en R calculés au rapport (costR) : on garde le brut, la distance, le prix et le sens.
      trades.push({ symbol: o.symbol, entryTime: o.entryTime, exitTime: x.exitTime, fillTime: x.fillTime, direction: o.direction, price: o.entryPrice, distance: o.distance, gross: Math.round(gross * 1e4) / 1e4 });
    },
  });
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}
// RSI(2) journalier US500 : la vraie classe du bot, spread 2x le défaut (règles pré-enregistrées).
function rsi2Trades(data) {
  const e2 = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  const S = data.US500.m1;
  const trades = []; let open = null;
  for (const c of data.US500.m15) {
    for (const e of e2.ingest(c)) {
      if (e.event === 'entry') { open = e; continue; }
      if (e.event !== 'exit' || !open) continue;
      let exitTime = e.barTime;
      if (e.detail === 'stop') {
        const a = lower(S.t, S.n, e.barTime), b = Math.min(S.n, lower(S.t, S.n, e.barTime + DAY));
        for (let i = a; i < b; i++) if (S.l[i] <= open.stopPrice) { exitTime = S.t[i]; break; }
      }
      const distance = open.price - open.stopPrice;
      trades.push({ symbol: 'US500', entryTime: open.barTime, exitTime, fillTime: open.barTime, direction: 'bullish', price: open.price, distance, gross: Math.round(e.rMultiple * 1e4) / 1e4, spreadMult: 2 });
      open = null;
    }
  }
  return trades;
}

function runLegs(ids) {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const src of ['hist', 'broker']) {
    const need = [...new Set(ids.flatMap((id) => LEGS[id].syms))];
    const data = {};
    for (const s of need) { const m1 = loadM1(src, s); data[s] = { m1, m15: toM15(m1) }; }
    for (const id of ids) {
      const leg = LEGS[id];
      for (const rr of leg.rsi2 ? [0] : RRS) {
        const f = `${CACHE}/${id}-rr${rr}-${src}.json`;
        if (fs.existsSync(f)) continue;
        const t0 = Date.now();
        let tr = leg.rsi2 ? rsi2Trades(data) : engineTrades(data, leg.syms, leg.cfg(rr));
        tr = src === 'hist' ? tr.filter((t) => t.entryTime < eng(2023)) : tr.filter((t) => t.entryTime >= eng(2023));
        fs.writeFileSync(f, JSON.stringify(tr));
        console.log(`${id} 1:${rr} ${src} : ${tr.length} trades (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      }
    }
  }
}

// --- Compte : entrée à son heure (garde-fou du bot : 3 trades/jour, pause 30 min ; une seule position par paire,
// comme le netting du bot), P&L à la sortie. FTMO 1-Step réel ; les cycles s'enchaînent dans la période.
function simulate(trades, risk, { ftmo }) {
  const evs = [];
  trades.forEach((t, i) => { evs.push({ time: t.entryTime, kind: 1, i }); evs.push({ time: Math.max(t.exitTime, t.entryTime), kind: t.exitTime <= t.entryTime ? 2 : 0, i }); });
  evs.sort((a, b) => a.time - b.time || a.kind - b.kind);
  const guard = ftmo ? buildEffectiveConfig({ id: 'clean-study', propFirmProgramId: 'ftmo-1step', phaseIndex: 0, guardrails: CONFIG.guardrails, riskPctPerTrade: risk }).guardrails : CONFIG.guardrails;
  const cycles = []; let c = null;
  const startCycle = (t) => { const g = new GuardrailEngine({ ...guard }); g.setBalance(START, t); c = { start: t, end: null, outcome: null, bal: START, peak: START, dd: 0, g, open: new Map(), taken: [] }; };
  startCycle(evs.length ? evs[0].time : 0);
  const openSym = new Map();
  for (const ev of evs) {
    const t = trades[ev.i];
    if (ev.kind === 1) {
      if (t.entryTime < c.start || openSym.get(t.symbol)) continue;
      if (!c.g.canTakeNewTrade(t.entryTime, t.symbol)) continue;
      c.open.set(ev.i, c.bal * (risk / 100)); openSym.set(t.symbol, true);
      continue;
    }
    if (!c.open.has(ev.i)) continue;
    const pnl = c.open.get(ev.i) * t.r; c.open.delete(ev.i); openSym.set(t.symbol, false);
    c.bal += pnl; c.peak = Math.max(c.peak, c.bal); c.dd = Math.max(c.dd, (c.peak - c.bal) / c.peak * 100);
    c.g.recordTrade({ pnl, time: t.exitTime, balanceAfter: c.bal, symbol: t.symbol });
    c.taken.push(t);
    if (!ftmo) continue;
    const st = c.g.getStatus(t.exitTime, t.symbol);
    if (st.targetReached || st.overallDrawdownBreached) {
      c.end = t.exitTime; c.outcome = st.targetReached ? 'pass' : 'fail'; cycles.push(c);
      for (const k of c.open.keys()) openSym.set(trades[k].symbol, false); // positions fermées à la fin du cycle
      startCycle(t.exitTime);
    }
  }
  if (c.taken.length > 0 || cycles.length === 0) { c.end = c.taken.length ? c.taken[c.taken.length - 1].exitTime : c.start; c.outcome = 'open'; cycles.push(c); }
  const taken = cycles.flatMap((x) => x.taken);
  const n = taken.length; const sum = taken.reduce((a, t) => a + t.r, 0); const mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(taken.reduce((a, t) => a + (t.r - mean) ** 2, 0) / (n - 1)) : 0;
  const passDays = cycles.filter((x) => x.outcome === 'pass').map((x) => (x.end - x.start) / DAY).sort((a, b) => a - b);
  return {
    cycles, n, sum, mean, t: sd > 0 ? mean / (sd / Math.sqrt(n)) : 0,
    winRate: n ? taken.filter((x) => x.r > 0).length / n * 100 : 0,
    ret: (cycles[0].bal - START) / START * 100, dd: Math.max(...cycles.map((x) => x.dd)),
    pass: cycles.filter((x) => x.outcome === 'pass').length, fail: cycles.filter((x) => x.outcome === 'fail').length,
    medPassDays: passDays.length ? Math.round(passDays[passDays.length >> 1]) : null,
  };
}

const sgn = (n, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);
// Coûts : spread par défaut et swap du broker sont des montants en points relevés au prix d'aujourd'hui (sept. 2026).
// Mode « prix » (retenu) : on les applique en % du prix, donc mis à l'échelle du prix d'entrée (prix / dernier prix
// du broker) - sinon le swap d'un Nasdaq à 20 000 appliqué à un Nasdaq à 2 300 (2011) coûte ~8x trop par nuit.
// Mode « points » : montants fixes en points (contrôle pessimiste pour les vieilles années).
let COST_MODE = 'price';
const REF = {};
function refPrice(sym) {
  if (REF[sym]) return REF[sym];
  const txt = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${sym}.csv.gz`)).toString('latin1').trimEnd();
  return (REF[sym] = +txt.slice(txt.lastIndexOf('\n') + 1).split(',')[4]);
}
function costR(t) {
  const k = COST_MODE === 'price' ? t.price / refPrice(t.symbol) : 1;
  const spread = (DEFAULT_SPREADS[t.symbol] ?? 0) * (t.spreadMult ?? 1) * k;
  return -spread / t.distance + swapR(t.symbol, t.direction, t.distance / k, t.fillTime, t.exitTime);
}
const RAW = new Map(); const LOADED = new Map();
const load = (id, rr, src) => {
  const key = `${id}-rr${rr}-${src}`;
  if (!RAW.has(key)) RAW.set(key, JSON.parse(fs.readFileSync(`${CACHE}/${key}.json`, 'utf8')));
  const lk = `${key}-${COST_MODE}`;
  if (!LOADED.has(lk)) LOADED.set(lk, RAW.get(key).map((t) => ({ ...t, r: Math.round((t.gross + costR(t)) * 1e4) / 1e4 })));
  return LOADED.get(lk);
};
const inP = (p) => (t) => t.entryTime >= p.from && t.entryTime < p.to;
const tStat = (l) => { const n = l.length; if (n < 2) return 0; const m = l.reduce((a, t) => a + t.r, 0) / n; const sd = Math.sqrt(l.reduce((a, t) => a + (t.r - m) ** 2, 0) / (n - 1)); return sd > 0 ? m / (sd / Math.sqrt(n)) : 0; };
const sumR = (l) => l.reduce((a, t) => a + t.r, 0);
const merge = (parts) => parts.flat().sort((a, b) => a.entryTime - b.entryTime);
const legTrades = (id, rr, p) => load(id, rr, p.src).filter(inP(p));

function report() {
  const [TR, TE, FW] = PERIODS;
  const ids = Object.keys(LEGS);
  const md = ['# Étude propre : entraînement 2010-2022, test 2023-2025, forward 2026', ''];
  md.push('Protocole d\'Esdras (2026-09-23), pour toute analyse : **tous les choix se font sur l\'entraînement 2010-2022**, puis le test 2023-2025 et le forward 2026 sont lus une seule fois, sans rien choisir dessus. Remplace les analyses « candidates » et « 3e jambe » (effacées).', '');
  md.push('**Données.** Entraînement : HistData.com M1 (US100 = NSXUSD, US500 = SPXUSD, XAUUSD, EURUSD ; US100/US500 commencent le 2010-11-14). Test et forward : M1 du broker. Vrai `LiveStrategyEngine` (M15 reconstruites depuis le M1), chaque trade réglé à la minute, spread par défaut + swap réel du broker, relevés aujourd\'hui en points et appliqués **en % du prix** (mis à l\'échelle du prix d\'entrée : sinon le swap d\'un Nasdaq à 20 000 appliqué au Nasdaq de 2011 à 2 300 coûterait ~8x trop par nuit ; colonne de contrôle « coûts fixes en points » au tableau 1). Compte : garde-fou du bot (3 trades/jour, pause 30 min), une seule position par paire, FTMO 1-Step réel (+10 %, perte max 10 %, perte quotidienne), cycles enchaînés dans chaque période.', '');
  md.push(`**Règles de sélection, fixées avant de lire le test.** (1) Chaque jambe = une stratégie du bot sur une paire, config de production ; RRR testé de 1:2 à 1:7, on garde celui au meilleur R net d'entraînement. (2) La jambe entre dans le portefeuille si, à ce RRR : t ≥ ${MIN_T} sur l'entraînement, R net positif dans chaque moitié (2010-2016 et 2017-2022), au moins ${MIN_TRADES} trades. (3) Le % de risque est celui qui donne, sur l'entraînement, le plus de challenges réussis moins ratés (à égalité : le moins de ratés).`, '');
  md.push('**Limites.** Les filtres des stratégies ont été conçus à l\'origine sur 2019-2025 : l\'entraînement en contient une partie (normal) mais le **test 2023-2025 a déjà été vu pendant la conception** ; le forward 2026 est la période la plus propre. Prix HistData ≠ flux du broker. Swap d\'aujourd\'hui appliqué au passé. Perte quotidienne FTMO sur le P&L clôturé.', '');

  // 1. Entraînement : chaque jambe
  const legRes = [];
  for (const id of ids) {
    const leg = LEGS[id];
    let best = null;
    for (const rr of leg.rsi2 ? [0] : RRS) {
      const l = legTrades(id, rr, TR);
      if (!best || sumR(l) > best.r) best = { rr, r: sumR(l), l };
    }
    const halves = TRAIN_HALVES.map(([a, b]) => sumR(best.l.filter((t) => t.entryTime >= a && t.entryTime < b)));
    const t = tStat(best.l);
    const kept = t >= MIN_T && halves.every((h) => h > 0) && best.l.length >= MIN_TRADES;
    COST_MODE = 'points'; const rPts = sumR(legTrades(id, best.rr, TR)); COST_MODE = 'price';
    const rGross = best.l.reduce((a, x) => a + x.gross, 0);
    legRes.push({ id, leg, rr: best.rr, l: best.l, r: best.r, t, halves, kept, rPts, rGross });
  }
  legRes.sort((a, b) => b.t - a.t);
  md.push('## 1. Entraînement : chaque jambe seule, à son meilleur RRR', '', '| Jambe | En prod. | RRR retenu | Trades | Win rate | R brut (sans coûts) | R net | R net, coûts fixes en points | R/trade | t | 2010-2016 | 2017-2022 | Gardée |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of legRes) md.push(`| ${x.leg.label} | ${x.leg.inProd ? 'oui' : ''} | ${x.leg.rsi2 ? '—' : `1:${x.rr}`} | ${x.l.length} | ${x.l.length ? (x.l.filter((t) => t.r > 0).length / x.l.length * 100).toFixed(0) : 0} % | ${sgn(x.rGross)} | ${sgn(x.r)} | ${sgn(x.rPts)} | ${x.l.length ? sgn(x.r / x.l.length, 3) : '—'} | ${x.t.toFixed(2)} | ${sgn(x.halves[0])} | ${sgn(x.halves[1])} | ${x.kept ? '**OUI**' : 'non'} |`);
  const kept = legRes.filter((x) => x.kept);

  // Portefeuilles
  const PORT = { label: `P. Portefeuille choisi sur l'entraînement (${kept.map((x) => `${x.leg.label}${x.leg.rsi2 ? '' : ` 1:${x.rr}`}`).join(' + ') || 'aucune jambe'})`, parts: kept.map((x) => [x.id, x.rr]) };
  const prodIds = ids.filter((id) => LEGS[id].inProd);
  const A = { label: 'A. Combo actuel (jambes de production, RRR de production ; GER40 retiré)', parts: prodIds.map((id) => [id, LEGS[id].prodRR]) };
  const C = { label: 'C. FVG US100 1:5 + XAUUSD 1:7 (idée précédente, pour comparaison seulement)', parts: [['fvg-US100', 5], ['fvg-XAUUSD', 7]] };
  const ports = [PORT, A, C].filter((p) => p.parts.length);
  const tradesOf = (p, per) => merge(p.parts.map(([id, rr]) => legTrades(id, rr, per)));

  // 2. Risque choisi sur l'entraînement
  md.push('', '## 2. Entraînement : % de risque par trade (FTMO 1-Step enchaîné sur 2010-2022)', '', '| Portefeuille | Risque | Réussis | Ratés | Réussis − ratés | Durée médiane d\'un réussi (jours) | Pire baisse du compte continu |', '|---|---|---|---|---|---|---|');
  const chosenRisk = {};
  for (const p of ports) {
    const tr = tradesOf(p, TR); let best = null;
    for (const k of RISKS) {
      const s = simulate(tr, k, { ftmo: true }); const cont = simulate(tr, k, { ftmo: false });
      if (!best || s.pass - s.fail > best.d || (s.pass - s.fail === best.d && s.fail < best.f)) best = { k, d: s.pass - s.fail, f: s.fail };
      md.push(`| ${p.label.split(' (')[0]} | ${k} % | ${s.pass} | ${s.fail} | ${s.pass - s.fail} | ${s.medPassDays ?? '—'} | ${cont.dd.toFixed(1)} % |`);
    }
    chosenRisk[p.label] = best.k;
  }
  md.push('', ports.map((p) => `**${p.label.split(' (')[0]} : risque retenu ${chosenRisk[p.label]} %**`).join(' ; ') + '.', '');

  // 3. Train / test / forward
  md.push('## 3. Résultats : entraînement, test, forward (même risque partout : celui choisi sur l\'entraînement)', '');
  for (const p of ports) {
    const k = chosenRisk[p.label];
    md.push(`### ${p.label}`, '', `Risque ${k} % par trade.`, '', '| Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d\'un réussi (jours) | Pire baisse | Compte continu |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const per of PERIODS) {
      const tr = tradesOf(p, per); const s = simulate(tr, k, { ftmo: true }); const cont = simulate(tr, k, { ftmo: false });
      md.push(`| ${per.label} | ${cont.n} | ${cont.winRate.toFixed(0)} % | ${sgn(cont.sum)} | ${sgn(cont.mean, 3)} | ${cont.t.toFixed(2)} | ${s.pass} / ${s.fail} | ${s.medPassDays ?? '—'} | ${cont.dd.toFixed(1)} % | ${sgn(cont.ret)} % |`);
    }
    md.push('');
  }
  md.push('### FTMO réussis / ratés à d\'autres risques (pour voir la sensibilité)', '', `| Portefeuille | Risque | ${PERIODS.map((x) => x.label).join(' | ')} |`, `|---|---|${PERIODS.map(() => '---|').join('')}`);
  for (const p of ports) for (const k of [0.5, 0.75, 1.0]) md.push(`| ${p.label.split(' (')[0]} | ${k} % | ${PERIODS.map((per) => { const s = simulate(tradesOf(p, per), k, { ftmo: true }); const d = simulate(tradesOf(p, per), k, { ftmo: false }).dd; return `${s.pass} / ${s.fail} (baisse ${d.toFixed(0)} %)`; }).join(' | ')} |`);

  // 4. R net par année
  md.push('', '## 4. R net par année (compte continu, garde-fou du bot)', '', `| Année | ${ports.map((p) => p.label.split('.')[0]).join(' | ')} |`, `|---|${ports.map(() => '---|').join('')}`);
  for (let y = 2010; y <= 2026; y++) {
    const per = PERIODS.find((x) => eng(y) >= x.from && eng(y) < x.to);
    const yy = { ...per, from: eng(y), to: eng(y + 1) };
    md.push(`| ${y}${y >= 2026 ? ' (forward)' : y >= 2023 ? ' (test)' : ''} | ${ports.map((p) => sgn(simulate(tradesOf(p, yy), 0.5, { ftmo: false }).sum)).join(' | ')} |`);
  }

  // 5. Les jambes gardées tiennent-elles ?
  md.push('', '## 5. Les jambes gardées, une par une (trades isolés, R net)', '', `| Jambe | ${PERIODS.map((x) => x.label).join(' | ')} |`, `|---|${PERIODS.map(() => '---|').join('')}`);
  for (const x of kept) md.push(`| ${x.leg.label}${x.leg.rsi2 ? '' : ` 1:${x.rr}`} | ${PERIODS.map((per) => { const l = legTrades(x.id, x.rr, per); return `${sgn(sumR(l))} (${l.length} tr., t ${tStat(l).toFixed(2)})`; }).join(' | ')} |`);

  // Annexe : toutes les jambes (ne sert à AUCUN choix)
  md.push('', '## Annexe : toutes les jambes au RRR d\'entraînement sur le test et le forward (informatif, ne sert à aucun choix)', '', '| Jambe | RRR | Entraînement | Test 2023-2025 | Forward 2026 |', '|---|---|---|---|---|');
  for (const x of legRes) md.push(`| ${x.leg.label} | ${x.leg.rsi2 ? '—' : `1:${x.rr}`} | ${sgn(x.r)} | ${sgn(sumR(legTrades(x.id, x.rr, TE)))} | ${sgn(sumR(legTrades(x.id, x.rr, FW)))} |`);
  md.push('');

  const out = 'data/backtest-input/clean-study-analysis.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'legs') runLegs(arg === 'all' || !arg ? Object.keys(LEGS) : arg.split(','));
else if (mode === 'report') report();
else if (mode === 'list') console.log(Object.keys(LEGS).join('\n'));
else { console.error('Usage: runCleanStudy.js legs <id,...|all> | report | list'); process.exit(1); }
