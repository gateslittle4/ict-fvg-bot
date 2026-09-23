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
//   node --max-old-space-size=6144 scripts/runCleanStudy.js prune                 -> élagage du combo actuel (mêmes règles de protocole)
//   node --max-old-space-size=8000 scripts/runCleanStudy.js macro                 -> régimes de marché par année (descriptif)
//   node scripts/runCleanStudy.js switch                                          -> filtre « jambe active si R > 0 sur L mois »
//   node scripts/runCleanStudy.js byregime                                        -> R/an de chaque jambe par période de marché
//   node scripts/runCleanStudy.js year2026                                        -> 2026 en détail : FVG US100 + Or contre le combo
//   LIVE_FILL=1 node scripts/runCleanStudy.js <legs|prune|port|year2026> ...        -> mêmes analyses avec l exécution réelle du bot (voir LIVE_FILL)
//   node scripts/runCleanStudy.js port fvg-US100:5,fvg-XAUUSD:4                   -> un portefeuille donné, FTMO par période
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
// LIVE_FILL=1 : les trades FVG sont réglés comme le bot réel les exécute (cTraderDataSource._handleAutoExecuteEntry) : l'ordre
// LIMIT à entryPrice n'est posé qu'à la CLÔTURE de la bougie M15 « validated », expire après CONFIG.fvg.maxAgeCandles bougies,
// ne se remplit que si le prix revient sur le niveau (achat : bid <= entrée - spread, c'est-à-dire l'ask touche) et le trade
// est perdu si l'objectif est atteint avant. Cache séparé.
// LIVE_FILL=resting : la solution « comme un humain » - l'ordre LIMIT est posé AVANT le contact, dès que la zone est active et
// que les filtres sont vrais à la dernière clôture connue (cfg.preTouchFilters) ; rempli au premier contact (ask pour un achat).
const LIVE_FILL = process.env.LIVE_FILL === '1' || process.env.LIVE_FILL === 'resting';
const RESTING = process.env.LIVE_FILL === 'resting';
// RR_MODE (avec LIVE_FILL=1) : géométrie exacte des ordres MARKET du bot (adjustMarketProtectionForSpread) - achat à l'ask
// (bid + spread), stop et objectif en distances relatives au prix réel d'exécution, sorties sur le bid (achat) / l'ask (vente),
// taille calculée sur stop + spread. 'strategy' = objectif sur le niveau de la stratégie (ce que fait le bot : un gain vaut
// (RR x d - spread) / (d + spread)) ; 'exact' = objectif éloigné pour qu'un gain vaille exactement RR (le spread payé en plus).
const RR_MODE = process.env.RR_MODE || null;
const CACHE = RR_MODE ? `data/clean-study-cache-rr-${RR_MODE}` : RESTING ? 'data/clean-study-cache-resting' : LIVE_FILL ? 'data/clean-study-cache-livefill' : 'data/clean-study-cache';
const ONLY_RRS = process.env.RRS ? process.env.RRS.split(',').map(Number) : null;
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
  LEGS[`fvg-${s}`] = { label: `FVG ${s}`, syms: [s], prodRR: CONFIG.fvg.perSymbol[s].rrMultiple, cfg: (rr) => ({ fvgConfig: { [s]: { ...CONFIG.fvg.perSymbol[s], rrMultiple: rr, ...(RESTING ? { preTouchFilters: true } : {}) } } }) };
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

function settleLiveLimit(S, tr) {
  const bull = tr.direction === 'bullish'; const spread = DEFAULT_SPREADS[tr.symbol] ?? 0;
  const placed = RESTING ? tr.entryTime : tr.entryTime + 900000; const expiry = tr.entryTime + CONFIG.fvg.maxAgeCandles * 900000;
  const end = lower(S.t, S.n, expiry);
  for (let i = lower(S.t, S.n, placed); i < end; i++) {
    const filled = bull ? S.l[i] <= tr.entryPrice - spread : S.h[i] >= tr.entryPrice;
    if (!filled) { if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return null; continue; }
    const maxI = Math.min(S.n, i + 5 * 1440);
    for (let j = i; j < maxI; j++) {
      if (bull ? S.l[j] <= tr.stopPrice : S.h[j] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[j], fillTime: S.t[i] };
      if (j > i && (bull ? S.h[j] >= tr.targetPrice : S.l[j] <= tr.targetPrice)) return { exitPrice: tr.targetPrice, exitTime: S.t[j], fillTime: S.t[i] };
    }
    return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], fillTime: S.t[i] };
  }
  return null; // jamais revenu sur le niveau avant expiration : pas de trade
}
// Autres stratégies en LIVE_FILL : ordre MARKET envoyé à la clôture de la bougie du signal (le bot ne voit la bougie qu'une
// fois close), stop et objectif aux niveaux absolus du signal ; R rapporté à la distance du signal (la taille de position
// est calculée sur elle). Si le prix a déjà dépassé le stop ou l'objectif à l'envoi, pas de trade.
function settleLiveMarketGeometry(S, tr) {
  const bull = tr.direction === 'bullish'; const d = tr.distance;
  const rr = Math.abs(tr.targetPrice - tr.entryPrice) / d;
  const i0 = lower(S.t, S.n, tr.entryTime + 900000); if (i0 >= S.n) return null;
  const s = (DEFAULT_SPREADS[tr.symbol] ?? 0) * (S.o[i0] / refPrice(tr.symbol)); // spread d'aujourd'hui en % du prix, comme costR
  const F = S.o[i0]; // bid à l'exécution ; un achat paie l'ask F + s, une vente reçoit F
  const risk = d + s; // distance du stop depuis le prix d'exécution (taille calculée dessus)
  // niveaux en bid : achat - stop F - d, objectif F + RR d (stratégie) ou F + s + RR (d + s) (exact) ;
  // vente (sorties à l'ask = bid + s) - stop si bid >= F + d, objectif si bid <= F - RR d (stratégie) ou F - RR (d + s) - s (exact)
  if (RR_MODE === 'absolute') {
    // stop et objectif replacés APRÈS l'exécution sur les niveaux de la stratégie (bid), taille toujours calculée sur d + spread
    if (bull ? F <= tr.stopPrice || F >= tr.targetPrice : F >= tr.stopPrice || F <= tr.targetPrice) return null;
    const pnl = (exitBid) => (bull ? exitBid - (F + s) : F - (exitBid + s));
    const maxJ = Math.min(S.n, i0 + 5 * 1440);
    for (let i = i0; i < maxJ; i++) {
      if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { r: pnl(tr.stopPrice) / risk, exitTime: S.t[i], fillTime: S.t[i0], risk };
      if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { r: pnl(tr.targetPrice) / risk, exitTime: S.t[i], fillTime: S.t[i0], risk };
    }
    return { r: pnl(S.c[maxJ - 1]) / risk, exitTime: S.t[maxJ - 1], fillTime: S.t[i0], risk };
  }
  const stopB = bull ? F - d : F + d;
  const tgtB = RR_MODE === 'exact' ? (bull ? F + s + rr * risk : F - rr * risk - s) : (bull ? F + rr * d : F - rr * d);
  const winR = RR_MODE === 'exact' ? rr : (rr * d - s) / risk;
  const maxI = Math.min(S.n, i0 + 5 * 1440);
  for (let i = i0; i < maxI; i++) {
    if (bull ? S.l[i] <= stopB : S.h[i] >= stopB) return { r: -1, exitTime: S.t[i], fillTime: S.t[i0], risk };
    if (bull ? S.h[i] >= tgtB : S.l[i] <= tgtB) return { r: winR, exitTime: S.t[i], fillTime: S.t[i0], risk };
  }
  const c = S.c[maxI - 1];
  return { r: bull ? (c - (F + s)) / risk : (F - (c + s)) / risk, exitTime: S.t[maxI - 1], fillTime: S.t[i0], risk };
}

function settleLiveMarket(S, tr) {
  const bull = tr.direction === 'bullish';
  const i0 = lower(S.t, S.n, tr.entryTime + 900000); if (i0 >= S.n) return null;
  const fill = S.o[i0];
  if (bull ? fill <= tr.stopPrice || fill >= tr.targetPrice : fill >= tr.stopPrice || fill <= tr.targetPrice) return null;
  const maxI = Math.min(S.n, i0 + 5 * 1440);
  for (let i = i0; i < maxI; i++) {
    if (bull ? S.l[i] <= tr.stopPrice : S.h[i] >= tr.stopPrice) return { exitPrice: tr.stopPrice, exitTime: S.t[i], fillTime: S.t[i0], fillPrice: fill };
    if (bull ? S.h[i] >= tr.targetPrice : S.l[i] <= tr.targetPrice) return { exitPrice: tr.targetPrice, exitTime: S.t[i], fillTime: S.t[i0], fillPrice: fill };
  }
  return { exitPrice: S.c[maxI - 1], exitTime: S.t[maxI - 1], fillTime: S.t[i0], fillPrice: fill };
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
        pending.set(signal.symbol, { symbol: signal.symbol, source: signal.source, direction: signal.direction, entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice, distance: signal.distance, entryTime: candle.time });
        return;
      }
      if (signal.type !== 'closed') return;
      const o = pending.get(signal.symbol); pending.delete(signal.symbol);
      if (!o) return;
      if (RR_MODE && o.source !== 'fvg') {
        const g = settleLiveMarketGeometry(data[o.symbol].m1, o);
        if (!g) return;
        // spread déjà dans le R (spreadIncluded) ; le swap reste ajouté par costR, rapporté à la distance risquée d + spread
        trades.push({ symbol: o.symbol, entryTime: o.entryTime, exitTime: g.exitTime, fillTime: g.fillTime, direction: o.direction, price: o.entryPrice, distance: g.risk, gross: Math.round(g.r * 1e4) / 1e4, spreadIncluded: true });
        return;
      }
      const x = !LIVE_FILL ? settleM1(data[o.symbol].m1, o) : o.source === 'fvg' ? settleLiveLimit(data[o.symbol].m1, o) : settleLiveMarket(data[o.symbol].m1, o);
      if (!x) return;
      const px = x.fillPrice ?? o.entryPrice;
      const gross = (o.direction === 'bullish' ? x.exitPrice - px : px - x.exitPrice) / o.distance;
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
      for (const rr of leg.rsi2 ? [0] : (ONLY_RRS ?? RRS)) {
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
  const spread = t.spreadIncluded ? 0 : (DEFAULT_SPREADS[t.symbol] ?? 0) * (t.spreadMult ?? 1) * k;
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

// --- Élagage du combo actuel (Esdras, 2026-09-23 : « passer un challenge et augmenter la qualité des trades »).
// Même protocole : chaque jambe de production à son RRR de production ; deux règles d'élagage fixées d'avance
// (R1 : retirer les jambes à R net < 0 sur l'entraînement ; R2 : ne garder que celles positives dans CHAQUE moitié) ;
// la version (A, A-R1, A-R2) et le risque sont choisis sur l'entraînement (réussis - ratés FTMO), puis test et forward lus.
function prune() {
  const [TR] = PERIODS;
  const prodIds = Object.keys(LEGS).filter((id) => LEGS[id].inProd);
  const md = ['# Élagage du combo actuel : entraînement 2010-2022, test 2023-2025, forward 2026', ''];
  md.push('Même protocole que `clean-study-analysis.md`. Chaque jambe de production à son RRR de production. Règles fixées d\'avance : **R1** retire les jambes à R net < 0 sur l\'entraînement ; **R2** ne garde que les jambes positives en 2010-2016 ET en 2017-2022. La version et le risque sont choisis sur l\'entraînement (FTMO réussis − ratés, à égalité le moins de ratés).', '');
  md.push('## 1. Jambes de production sur l\'entraînement', '', '| Jambe | RRR | Trades | R net | R/trade | t | 2010-2016 | 2017-2022 | R1 | R2 | Test 2023-2025 (info) | Forward 2026 (info) |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  const legs = prodIds.map((id) => {
    const rr = LEGS[id].prodRR; const l = legTrades(id, rr, TR);
    const halves = TRAIN_HALVES.map(([a, b]) => sumR(l.filter((t) => t.entryTime >= a && t.entryTime < b)));
    return { id, rr, l, r: sumR(l), t: tStat(l), halves, r1: sumR(l) > 0, r2: halves.every((h) => h > 0) };
  }); // ordre canonique des jambes (celui de LEGS, comme le rapport) : il décide quel signal simultané sur une paire est pris
  for (const x of [...legs].sort((a, b) => b.t - a.t)) md.push(`| ${LEGS[x.id].label} | 1:${x.rr} | ${x.l.length} | ${sgn(x.r)} | ${sgn(x.r / x.l.length, 3)} | ${x.t.toFixed(2)} | ${sgn(x.halves[0])} | ${sgn(x.halves[1])} | ${x.r1 ? 'garde' : 'retire'} | ${x.r2 ? 'garde' : 'retire'} | ${sgn(sumR(legTrades(x.id, x.rr, PERIODS[1])))} | ${sgn(sumR(legTrades(x.id, x.rr, PERIODS[2])))} |`);
  const versions = [
    { label: 'A. Combo actuel', legs },
    { label: 'A-R1. Sans les jambes perdantes', legs: legs.filter((x) => x.r1) },
    { label: 'A-R2. Seulement les jambes positives dans chaque moitié', legs: legs.filter((x) => x.r2) },
  ];
  const tradesOf = (v, per) => merge(v.legs.map((x) => legTrades(x.id, x.rr, per)));
  md.push('', '## 2. Choix de la version et du risque sur l\'entraînement', '', '| Version | Jambes | Risque | Réussis | Ratés | Réussis − ratés | Durée médiane d\'un réussi (jours) |', '|---|---|---|---|---|---|---|');
  let best = null;
  for (const v of versions) for (const k of RISKS) {
    const s = simulate(tradesOf(v, TR), k, { ftmo: true });
    md.push(`| ${v.label} | ${v.legs.length} | ${k} % | ${s.pass} | ${s.fail} | ${s.pass - s.fail} | ${s.medPassDays ?? '—'} |`);
    if (!best || s.pass - s.fail > best.d || (s.pass - s.fail === best.d && s.fail < best.f)) best = { v, k, d: s.pass - s.fail, f: s.fail };
  }
  md.push('', `**Retenu sur l'entraînement : ${best.v.label}, risque ${best.k} %** (${best.v.legs.map((x) => `${LEGS[x.id].label} 1:${x.rr}`).join(', ')}).`, '');
  md.push('## 3. Entraînement, test, forward', '', '| Version | Risque | Période | Trades | Win rate | R net | R/trade | t | FTMO réussis / ratés | Durée médiane d\'un réussi (jours) | Pire baisse |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const v of versions) for (const k of [0.25, 0.5, 0.75, 1.0]) for (const per of PERIODS) {
    const tr = tradesOf(v, per); const s = simulate(tr, k, { ftmo: true }); const c = simulate(tr, k, { ftmo: false });
    md.push(`| ${v.label}${v === best.v && k === best.k ? ' **(retenu)**' : ''} | ${k} % | ${per.label} | ${c.n} | ${c.winRate.toFixed(0)} % | ${sgn(c.sum)} | ${sgn(c.mean, 3)} | ${c.t.toFixed(2)} | ${s.pass} / ${s.fail} | ${s.medPassDays ?? '—'} | ${c.dd.toFixed(1)} % |`);
  }
  md.push('', '**Limites.** Celles de `clean-study-analysis.md` ; en plus, les résultats par jambe du test avaient déjà été lus (annexe de l\'étude propre) avant d\'écrire ces deux règles : elles restent des règles d\'entraînement simples, mais ne sont pas « aveugles » au sens strict.', '');
  const out = LIVE_FILL ? 'data/backtest-input/clean-study-prune-livefill-analysis.md' : 'data/backtest-input/clean-study-prune-analysis.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  console.log(`\nRapport écrit : ${out}`);
}

// --- Régimes de marché (Esdras, 2026-09-23 : « y a-t-il un truc macro qui explique quand une stratégie marche ? »).
// Par année : R net des jambes (RRR de production) et du combo, et l'état du marché mesuré sur le M1 (rendement annuel,
// volatilité annualisée des clôtures journalières, efficacité de tendance = |variation nette| / somme des |variations
// journalières|) + taux directeur moyen de la Fed (moyenne annuelle du taux effectif, source publique, arrondie).
// Descriptif : 16 années, donc des corrélations fragiles ; ne sert à aucun choix.
const FED = { 2010: 0.2, 2011: 0.1, 2012: 0.1, 2013: 0.1, 2014: 0.1, 2015: 0.1, 2016: 0.4, 2017: 1.0, 2018: 1.8, 2019: 2.2, 2020: 0.4, 2021: 0.1, 2022: 1.7, 2023: 5.0, 2024: 5.1, 2025: 4.2 };
function macro() {
  const years = []; for (let y = 2011; y <= 2026; y++) years.push(y);
  const perOf = (y) => ({ ...PERIODS.find((p) => eng(y) >= p.from && eng(y) < p.to), from: eng(y), to: eng(y + 1) });
  const mkt = {};
  for (const sym of ['US100', 'XAUUSD']) {
    mkt[sym] = {};
    for (const src of ['hist', 'broker']) {
      const S = loadM1(src, sym); const closes = new Map();
      for (let i = 0; i < S.n; i++) closes.set(Math.floor(S.t[i] / DAY), S.c[i]);
      const days = [...closes.entries()].sort((a, b) => a[0] - b[0]);
      for (const y of years) {
        const p = perOf(y); if (p.src !== src) continue;
        const d = days.filter(([k]) => k * DAY >= p.from && k * DAY < p.to).map(([, c]) => c);
        if (d.length < 50) continue;
        const rets = []; for (let i = 1; i < d.length; i++) rets.push(Math.log(d[i] / d[i - 1]));
        const m = rets.reduce((a, b) => a + b, 0) / rets.length;
        const vol = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1) * 252) * 100;
        const eff = Math.abs(Math.log(d[d.length - 1] / d[0])) / rets.reduce((a, b) => a + Math.abs(b), 0);
        mkt[sym][y] = { ret: (d[d.length - 1] / d[0] - 1) * 100, vol, eff };
      }
    }
  }
  const legR = (id, rr, y) => sumR(legTrades(id, rr, perOf(y)));
  const prodIds = Object.keys(LEGS).filter((id) => LEGS[id].inProd);
  const rows = years.map((y) => ({
    y, fvgUs: legR('fvg-US100', LEGS['fvg-US100'].prodRR, y), fvgXau: legR('fvg-XAUUSD', LEGS['fvg-XAUUSD'].prodRR, y),
    others: prodIds.filter((id) => !id.startsWith('fvg-')).reduce((a, id) => a + legR(id, LEGS[id].prodRR, y), 0),
    us: mkt.US100[y], xau: mkt.XAUUSD[y], fed: FED[y],
  }));
  const md = ['# Régimes de marché : quand chaque stratégie a marché (2011-2026)', '', 'Descriptif, ne sert à aucun choix. R net par année des jambes à leur RRR de production (trades isolés). Marché mesuré sur le M1 (HistData jusqu\'en 2022, broker ensuite). Efficacité de tendance : 1 = l\'année monte ou descend en ligne droite, 0 = aller-retour. Fed : moyenne annuelle du taux effectif (arrondie, 2026 non renseigné).', ''];
  md.push('| Année | FVG US100 1:5 | FVG Or 1:4 | Autres jambes du combo | US100 : rendement | US100 : volatilité | US100 : tendance | Or : rendement | Or : volatilité | Or : tendance | Fed |', '|---|---|---|---|---|---|---|---|---|---|---|');
  const f = (x, d = 0) => (x == null ? '—' : x.toFixed(d));
  for (const r of rows) md.push(`| ${r.y}${r.y >= 2026 ? ' (fwd)' : r.y >= 2023 ? ' (test)' : ''} | ${sgn(r.fvgUs)} | ${sgn(r.fvgXau)} | ${sgn(r.others)} | ${r.us ? sgn(r.us.ret, 0) + ' %' : '—'} | ${f(r.us?.vol)} % | ${f(r.us?.eff, 2)} | ${r.xau ? sgn(r.xau.ret, 0) + ' %' : '—'} | ${f(r.xau?.vol)} % | ${f(r.xau?.eff, 2)} | ${r.fed == null ? '—' : r.fed.toFixed(1) + ' %'} |`);
  // Corrélations de rang (Spearman) sur les années
  const rank = (a) => { const s = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); s.forEach(([, i], k) => { r[i] = k; }); return r; };
  const spearman = (a, b) => { const ok = a.map((v, i) => v != null && b[i] != null); const x = rank(a.filter((_, i) => ok[i])), y = rank(b.filter((_, i) => ok[i])); const n = x.length; const d2 = x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0); return { rho: 1 - 6 * d2 / (n * (n * n - 1)), n }; };
  md.push('', '## Corrélations de rang (Spearman) entre le R de l\'année et l\'état du marché', '', '| Stratégie | Variable | rho | années |', '|---|---|---|---|');
  const vars = [['US100 rendement', (r) => r.us?.ret], ['US100 volatilité', (r) => r.us?.vol], ['US100 tendance', (r) => r.us?.eff], ['Or rendement', (r) => r.xau?.ret], ['Or volatilité', (r) => r.xau?.vol], ['Or tendance', (r) => r.xau?.eff], ['Fed', (r) => r.fed]];
  for (const [lab, get] of [['FVG US100', (r) => r.fvgUs], ['FVG Or', (r) => r.fvgXau], ['Autres jambes', (r) => r.others]]) for (const [vl, gv] of vars) {
    const { rho, n } = spearman(rows.map(get), rows.map(gv)); md.push(`| ${lab} | ${vl} | ${rho.toFixed(2)} | ${n} |`);
  }
  md.push('', 'Avec 15-16 années, |rho| doit dépasser ~0,5 pour être distinguable du hasard (seuil 5 %) ; plusieurs essais augmentent le risque d\'un faux positif.', '');
  const out = 'data/backtest-input/clean-study-regimes-analysis.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'prune') { prune(); process.exit(0); }
if (mode === 'macro') { macro(); process.exit(0); }
// switch : chaque jambe du combo n'est active que si ses propres signaux (tous, pris ou non) ont un R net > 0 sur les
// L derniers mois (L choisi sur l'entraînement parmi 3/6/12/24, avec le risque) - « suivre la stratégie qui marche ».
if (mode === 'switch') {
  const prodIds = Object.keys(LEGS).filter((id) => LEGS[id].inProd);
  const MONTH = 30.44 * DAY;
  const filtered = (per, L) => merge(prodIds.map((id) => {
    const rr = LEGS[id].prodRR; const all = load(id, rr, per.src); // historique complet de la source pour la fenêtre glissante
    const own = all.filter(inP(per));
    return own.filter((t) => { const past = all.filter((x) => x.exitTime <= t.entryTime && x.exitTime > t.entryTime - L * MONTH); return past.length >= 5 && sumR(past) > 0; });
  }));
  const res = [];
  for (const L of [0, 3, 6, 12, 24]) {
    const per = PERIODS[0]; const tr = L ? filtered(per, L) : merge(prodIds.map((id) => legTrades(id, LEGS[id].prodRR, per)));
    for (const k of RISKS) { const s = simulate(tr, k, { ftmo: true }); res.push({ L, k, d: s.pass - s.fail, f: s.fail, s }); }
  }
  const best = res.filter((x) => x.L).sort((a, b) => b.d - a.d || a.f - b.f)[0];
  console.log(`Choisi sur l'entraînement : fenêtre ${best.L} mois, risque ${best.k} % (${best.s.pass}/${best.s.fail})`);
  for (const L of [0, 3, 6, 12, 24]) for (const k of [0.25, 0.5, 0.75]) console.log(`${L ? `filtre ${L} mois` : 'sans filtre'} ${k} % | ` + PERIODS.map((per) => {
    const tr = L ? filtered(per, L) : merge(prodIds.map((id) => legTrades(id, LEGS[id].prodRR, per))); const s = simulate(tr, k, { ftmo: true }); const c = simulate(tr, k, { ftmo: false });
    return `${per.id} ${sgn(c.sum)} R (${c.n} tr.), ${s.pass}/${s.fail}, méd ${s.medPassDays ?? '—'} j, baisse ${c.dd.toFixed(1)} %`;
  }).join(' | '));
  process.exit(0);
}
// byregime : R net par an de chaque jambe (RRR de production) dans chaque période de marché. Périodes tracées APRÈS coup
// sur le tableau des régimes (taux de la Fed + résultats) : descriptif, ne prouve rien sur l'avenir.
if (mode === 'byregime') {
  const REG = [['2011-2015 taux zéro, marché calme', 2011, 2016], ['2016-2021 remontée des taux puis COVID', 2016, 2022], ['2022-2026 inflation, taux élevés', 2022, 2027]];
  const rows = Object.keys(LEGS).map((id) => {
    const rr = LEGS[id].rsi2 ? 0 : LEGS[id].prodRR;
    const v = REG.map(([, a, b]) => { let r = 0, n = 0; for (let y = a; y < b; y++) { const per = { ...PERIODS.find((p) => eng(y) >= p.from && eng(y) < p.to), from: eng(y), to: eng(y + 1) }; const l = legTrades(id, rr, per); r += sumR(l); n += l.length; } return { r: r / (b - a), n }; });
    return { id, rr, v };
  }).sort((a, b) => b.v[2].r - a.v[2].r);
  console.log('| Jambe | RRR | En prod. | ' + REG.map((x) => x[0] + ' (R/an)').join(' | ') + ' |');
  for (const x of rows) console.log(`| ${LEGS[x.id].label} | ${x.rr ? '1:' + x.rr : '—'} | ${LEGS[x.id].inProd ? 'oui' : ''} | ${x.v.map((v) => sgn(v.r)).join(' | ')} |`);
  process.exit(0);
}
// year2026 : FVG US100 + Or contre le combo actuel sur l'année en cours : R par mois, challenges enchaînés (dates) et
// challenge démarré chaque jour de bourse de 2026 (issue et durée ; départs qui se chevauchent, pas indépendants).
if (mode === 'year2026') {
  const FW = PERIODS[2];
  const prodIds = Object.keys(LEGS).filter((id) => LEGS[id].inProd);
  const ports = [['FVG US100 1:5 + Or 1:4', [['fvg-US100', 5], ['fvg-XAUUSD', 4]]], ['Combo actuel', prodIds.map((id) => [id, LEGS[id].prodRR])]];
  const trOf = (parts) => merge(Object.keys(LEGS).flatMap((id) => parts.filter(([p]) => p === id)).map(([id, rr]) => legTrades(id, rr, FW)));
  const day = (t) => new Date(t + OFF).toISOString().slice(0, 10);
  const md = ['# 2026 : FVG US100 + Or contre le combo actuel', '', `Forward 2026, M1 du broker jusqu'au ${day(FW.to > Date.now() ? Math.max(...ports.flatMap(([, p]) => trOf(p).map((t) => t.exitTime))) : FW.to)}. Même moteur, coûts et garde-fous que l'étude propre.`, ''];
  md.push('## R net par mois (compte continu)', '', '| Mois | ' + ports.map(([l]) => l).join(' | ') + ' |', '|---|' + ports.map(() => '---|').join(''));
  for (let m = 0; m < 12; m++) {
    const per = { ...FW, from: eng(2026, m), to: eng(2026, m + 1) };
    const vals = ports.map(([, parts]) => { const tr = merge(Object.keys(LEGS).flatMap((id) => parts.filter(([p]) => p === id)).map(([id, rr]) => legTrades(id, rr, per))); return tr.length ? `${sgn(simulate(tr, 0.5, { ftmo: false }).sum)} (${tr.length} tr.)` : null; });
    if (vals.some(Boolean)) md.push(`| 2026-${String(m + 1).padStart(2, '0')} | ${vals.map((v) => v ?? '—').join(' | ')} |`);
  }
  md.push('', '## Résumé de l\'année', '', '| Portefeuille | Trades | Win rate | R net | R/trade | Pire série de pertes | Pire baisse à 0,5 % |', '|---|---|---|---|---|---|---|');
  for (const [l, parts] of ports) {
    const tr = trOf(parts); const c = simulate(tr, 0.5, { ftmo: false }); const taken = c.cycles.flatMap((x) => x.taken);
    let run = 0, worst = 0; for (const t of taken) { run = t.r < 0 ? run + 1 : 0; worst = Math.max(worst, run); }
    md.push(`| ${l} | ${c.n} | ${c.winRate.toFixed(0)} % | ${sgn(c.sum)} | ${sgn(c.mean, 3)} | ${worst} | ${c.dd.toFixed(1)} % |`);
  }
  md.push('', '## Challenges FTMO 1-Step enchaînés depuis le 1er janvier', '');
  for (const k of [0.5, 0.75, 1.0]) for (const [l, parts] of ports) {
    const s = simulate(trOf(parts), k, { ftmo: true });
    md.push(`- **${l}, ${k} %** : ${s.cycles.map((c) => `${day(c.start)} → ${day(c.end)} ${c.outcome === 'pass' ? '✅ réussi' : c.outcome === 'fail' ? '❌ raté' : '⏳ en cours'} (${sgn((c.bal - START) / START * 100)} %, ${Math.round((c.end - c.start) / DAY)} j)`).join(' ; ')}`);
  }
  md.push('', '## Un challenge démarré chaque jour de bourse de 2026', '', 'Pour chaque jour de départ (lundi-vendredi, 1er janvier → fin des données), un seul challenge simulé jusqu\'à réussite, échec ou fin des données. Les départs proches partagent les mêmes trades : ce n\'est pas un échantillon indépendant.', '', '| Portefeuille | Risque | Départs | Réussis | Ratés | Pas encore fini | Taux de réussite (finis) | Durée médiane d\'un réussi (jours) |', '|---|---|---|---|---|---|---|---|');
  for (const k of [0.25, 0.5, 0.75, 1.0]) for (const [l, parts] of ports) {
    const tr = trOf(parts); const last = Math.max(...tr.map((t) => t.exitTime)); let p = 0, f = 0, o = 0; const d = [];
    for (let t0 = FW.from; t0 < last; t0 += DAY) {
      const dow = new Date(t0 + OFF).getUTCDay(); if (dow === 0 || dow === 6) continue;
      const sub = tr.filter((t) => t.entryTime >= t0); if (!sub.length) continue;
      const c = simulate(sub, k, { ftmo: true }).cycles[0];
      if (c.outcome === 'pass') { p++; d.push((c.end - t0) / DAY); } else if (c.outcome === 'fail') f++; else o++;
    }
    d.sort((a, b) => a - b);
    md.push(`| ${l} | ${k} % | ${p + f + o} | ${p} | ${f} | ${o} | ${p + f ? Math.round(p / (p + f) * 100) : 0} % | ${d.length ? Math.round(d[d.length >> 1]) : '—'} |`);
  }
  md.push('');
  const out = LIVE_FILL ? 'data/backtest-input/clean-study-2026-livefill-analysis.md' : 'data/backtest-input/clean-study-2026-analysis.md';
  fs.writeFileSync(out, md.join('\n'));
  console.log(md.join('\n'));
  process.exit(0);
}
// port <id:rr,...> : un portefeuille donné, FTMO par période et par risque (outil de lecture, ne choisit rien).
if (mode === 'port') {
  const parts = arg.split(',').map((x) => x.split(':')).map(([id, rr]) => [id, +rr]);
  const ordered = Object.keys(LEGS).flatMap((id) => parts.filter(([p]) => p === id));
  for (const k of [0.25, 0.5, 0.75, 1.0]) console.log(`${k} % | ` + PERIODS.map((per) => {
    const tr = merge(ordered.map(([id, rr]) => legTrades(id, rr, per))); const s = simulate(tr, k, { ftmo: true }); const c = simulate(tr, k, { ftmo: false });
    return `${per.id} ${sgn(c.sum)} R, ${s.pass}/${s.fail}, méd ${s.medPassDays ?? '—'} j, baisse ${c.dd.toFixed(1)} %`;
  }).join(' | '));
  process.exit(0);
}
if (mode === 'legs') runLegs(arg === 'all' || !arg ? Object.keys(LEGS) : arg.split(','));
else if (mode === 'report') report();
else if (mode === 'list') console.log(Object.keys(LEGS).join('\n'));
else { console.error('Usage: runCleanStudy.js legs <id,...|all> | report | list'); process.exit(1); }
