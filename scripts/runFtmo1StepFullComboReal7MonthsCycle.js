#!/usr/bin/env node
// runFtmo1StepFullComboReal7MonthsCycle.js
// Usage: node scripts/runFtmo1StepFullComboReal7MonthsCycle.js
//
// Esdras (2026-09-17): "Tu as des données de 7 mois en live. Dis moi combien
// de fois j'aurais atteint 10% avec beaucoup de detail ... Fais comme si on
// passait le challenge ftmo 1 step."
//
// Direct extension of runFtmoAllLiveStrategiesCycleAccountImpact.js (même
// logique de cycle "reset à +10%/-10%"), avec 2 changements :
//
//   1. DONNÉES : les VRAIES bougies M15 exportées du broker en production
//      (data/real-data-2026-02-to-09/, 2026-02-10 -> 2026-09-16, ~7 mois),
//      PAS le CSV historique 2019-2025. Une seule fenêtre continue, pas un
//      test par année.
//   2. SCOPE : les 7 mécanismes RÉELLEMENT en production aujourd'hui (voir
//      src/config.js) - FVG (US100/US500/XAUUSD), Divergence (US100/US500),
//      NWOG (US100 achat-seul + GER40 bidirectionnel), Judas Swing
//      (EURUSD), Weekly Sweep (GER40+US500), Breaker Block (GER40), Silver
//      Bullet (US100/US500/GER40) - au lieu des 4 plus anciens seulement.
//      Priorité entre sources sur un même symbole = EXACTEMENT l'ordre de
//      ingestCandle() dans liveStrategyEngine.js : FVG, Divergence, NWOG,
//      Judas Swing, Weekly Sweep, Breaker Block, Silver Bullet.
//
// UN SEUL scénario testé ici : la config de risque RÉELLE actuellement en
// prod (CONFIG.risk.riskPctPerTrade, vérifié via /api/status == 0.3%) et le
// VRAI GuardrailEngine(CONFIG.guardrails) (maxTradesPerDay 3, cooldown
// 30min après une perte, perte quotidienne max 2%) - pas de scénarios
// alternatifs, l'objectif ici est "que ferait la config d'AUJOURD'HUI sur
// ces 7 mois", pas une recherche de paramètres.
//
// Mise en garde honnête (voir aussi data/real-data-2026-02-to-09/README.md
// et HANDOFF.md "Forward-test Silver Bullet") : les filtres qui ont besoin
// d'un long historique pour se stabiliser (biais HTF EMA200 H4, structure
// ICT) n'ont qu'un warm-up de quelques semaines ici, contre plusieurs
// années dans le backtest 2019-2025 habituel - les tout premiers signaux
// de la fenêtre (février-mars 2026) sont donc un peu moins fiables que ceux
// de la fin. Et 7 mois reste une fenêtre courte pour un système qui prend
// quelques trades par semaine - le nombre de cycles ci-dessous est un
// ÉCHANTILLON, pas une garantie statistique.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { computeZScoreSeries, alignByTime } from '../src/backtest/correlation.js';
import { detectNwogEvents } from '../src/backtest/nwog.js';
import { detectJudasSwingEvents } from '../src/backtest/judasSwing.js';
import { detectWeeklySweepEvents } from '../src/backtest/weeklyLiquiditySweep.js';
import { computeBreakerBlockCandidates } from '../src/backtest/breakerBlock.js';
import { computeSilverBulletCandidates } from '../src/backtest/silverBullet.js';
import { CONFIG } from '../src/config.js';

const DATA_DIR = path.join(process.cwd(), 'data/real-data-2026-02-to-09');
const STARTING_BALANCE = 10000;
// CONFIG.risk.riskPctPerTrade resolves per ACCOUNT_MODE (src/config.js) -
// 'challenge' (no env var set, the default) -> 0.5%/trade, the value that
// file documents as validated FOR AN ACTUAL FTMO CHALLENGE ATTEMPT (target-
// focused, a bust just costs a re-purchase fee). The 0.3%/trade currently
// visible on the live /api/status is the DIFFERENT 'live'/funded-account
// mode - lower risk, no target to rush - which is what's actually running
// today because the demo account is forward-testing, not attempting a real
// challenge. Esdras explicitly asked "fais comme si on passait le challenge
// ftmo 1 step", so 0.5% (challenge mode) is the correct number here, not
// today's live-mode 0.3%.
const RISK_PCT = CONFIG.risk.riskPctPerTrade;
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FVG_SYMBOLS = Object.keys(CONFIG.fvg.perSymbol).filter((s) => s !== 'BTCUSD');
const DIV_PAIR = CONFIG.divergence.pair;
const NWOG_SYMBOLS = CONFIG.nwog.symbols;
const NWOG_LONG_ONLY = new Set(CONFIG.nwog.longOnlySymbols || []);
const JUDAS_SYMBOLS = CONFIG.judasSwing.symbols;
const WEEKLYSWEEP_SYMBOLS = CONFIG.weeklySweep.symbols;
const BREAKERBLOCK_SYMBOLS = CONFIG.breakerBlock.symbols;
const SILVERBULLET_SYMBOLS = CONFIG.silverBullet.symbols;
const ALL_SYMBOLS = [...new Set([
  ...FVG_SYMBOLS, ...DIV_PAIR, ...NWOG_SYMBOLS, ...JUDAS_SYMBOLS,
  ...WEEKLYSWEEP_SYMBOLS, ...BREAKERBLOCK_SYMBOLS, ...SILVERBULLET_SYMBOLS,
])];

const FVG_CONFIG = {};
for (const symbol of FVG_SYMBOLS) {
  FVG_CONFIG[symbol] = { ...CONFIG.fvg.perSymbol[symbol], spread: DEFAULT_SPREADS[symbol] };
}

const DIV_LOOKBACK = CONFIG.divergence.lookback;
const DIV_Z_THRESHOLD = CONFIG.divergence.zThreshold;
const DIV_ATR_PERIOD = CONFIG.divergence.atrPeriod;
const DIV_STOP_ATR_MULTIPLE = CONFIG.divergence.stopAtrMultiple;
const DIV_RR_MULTIPLE = CONFIG.divergence.rrMultiple;
const DIV_MAX_HOLDING_CANDLES = CONFIG.divergence.maxHoldingM15Candles;

const NWOG_RR = CONFIG.nwog.rrMultiple;
const NWOG_MAX_HOLDING = CONFIG.nwog.maxHoldingM15Candles;
const JUDAS_RR = CONFIG.judasSwing.rrMultiple;
const JUDAS_MAX_HOLDING = CONFIG.judasSwing.maxHoldingM15Candles;
const WEEKLYSWEEP_RR = CONFIG.weeklySweep.rrMultiple;
const WEEKLYSWEEP_MAX_HOLDING = CONFIG.weeklySweep.maxHoldingM15Candles;
const BREAKERBLOCK_RR = CONFIG.breakerBlock.rrMultiple;
const BREAKERBLOCK_MAX_HOLDING = CONFIG.breakerBlock.maxHoldingM15Candles;
const SILVERBULLET_RR = CONFIG.silverBullet.rrMultiple;
const SILVERBULLET_MAX_HOLDING = CONFIG.silverBullet.maxHoldingM15Candles;

function computeAtrSeries(candles, period) {
  const atr = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    if (i >= period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      atr[i] = sum / period;
    }
  }
  return atr;
}

function computeDivergenceCandidates(m15A, m15B) {
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const n = alignedA.length;
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, DIV_LOOKBACK);
  const atrA = computeAtrSeries(alignedA, DIV_ATR_PERIOD);
  const atrB = computeAtrSeries(alignedB, DIV_ATR_PERIOD);
  const candidates = [];
  let wasExtended = false;
  for (let i = 0; i < n; i++) {
    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= DIV_Z_THRESHOLD;
    if (extended && !wasExtended && i + 1 < n) {
      const laggardIsB = z[i] >= DIV_Z_THRESHOLD;
      const symbol = laggardIsB ? 'US500' : 'US100';
      const atr = laggardIsB ? atrB[i] : atrA[i];
      const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
      if (atr && atr > 0) candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: DIV_STOP_ATR_MULTIPLE * atr });
    }
    wasExtended = extended;
  }
  return candidates;
}

function eventsToMap(events, candles) {
  const map = new Map();
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    map.set(candles[entryIndex].time, { direction: e.direction, stopReference: e.stopReference ?? e.sweepExtreme });
  }
  return map;
}

function candidatesToMap(candidates) {
  const map = new Map();
  for (const c of candidates) map.set(c.entryTime, c);
  return map;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function fmtDateTime(ms) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function buildFvgEngines(candlesBySymbolFull) {
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    const candles = candlesBySymbolFull[symbol];
    if (!candles || candles.length === 0) continue;
    if (FVG_CONFIG[symbol].multiTouch) {
      const predicate = buildMultiTouchFilterPredicate(candles, symbol, FVG_CONFIG[symbol]);
      engines[symbol] = new MultiTouchFvgEngine({ symbol, checkFilters: predicate });
    } else {
      const { engine } = buildFilteredEngine(candles, symbol, FVG_CONFIG[symbol]);
      engines[symbol] = engine;
    }
  }
  return engines;
}

function simulateContinuous({ candlesBySymbolFull, divergenceCandidatesFull, nwogMapBySymbol, judasMapBySymbol, weeklySweepMapBySymbol, breakerBlockMapBySymbol, silverBulletMapBySymbol }) {
  const engines = buildFvgEngines(candlesBySymbolFull);

  const timeline = [];
  for (const symbol of ALL_SYMBOLS) for (const candle of candlesBySymbolFull[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  const openPositions = {}; for (const s of ALL_SYMBOLS) openPositions[s] = null;
  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let balance = STARTING_BALANCE;
  let cycleStartTime = timeline[0].candle.time;
  let cyclePeak = STARTING_BALANCE;
  let cycleTrades = 0, cycleWins = 0, cycleResolved = 0;

  const cycles = [];
  const tradeLog = [];
  let cycleNumber = 1;

  const resetCycle = (endTime, outcome, ddPct) => {
    cycles.push({
      n: cycleNumber, startTime: cycleStartTime, endTime, outcome,
      days: daysBetween(cycleStartTime, endTime), trades: cycleTrades,
      winRate: cycleResolved > 0 ? cycleWins / cycleResolved : null, maxDrawdownPct: ddPct,
    });
    cycleNumber++;
    balance = STARTING_BALANCE;
    cyclePeak = STARTING_BALANCE;
    cycleStartTime = endTime;
    cycleTrades = 0; cycleWins = 0; cycleResolved = 0;
    for (const s of ALL_SYMBOLS) openPositions[s] = null;
  };

  const resolveClose = (symbol, source, direction, netR, exitTime, entryTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    const balanceBefore = balance;
    balance += pnl;
    cyclePeak = Math.max(cyclePeak, balance);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    cycleTrades++;
    if (outcome !== 'timeout') { cycleResolved++; if (outcome === 'win') cycleWins++; }

    tradeLog.push({
      cycle: cycleNumber, symbol, source, direction, outcome, entryTime, exitTime,
      r: netR, pnl, balanceBefore, balanceAfter: balance,
      progressPct: ((balance - STARTING_BALANCE) / STARTING_BALANCE) * 100,
    });

    const ddPct = cyclePeak > 0 ? ((cyclePeak - balance) / cyclePeak) * 100 : 0;
    const passed = balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE;
    const busted = ddPct >= TRAILING_MAX_LOSS_PCT;
    if (passed || busted) resetCycle(exitTime, passed ? 'pass' : 'bust', ddPct);
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    // 1) Resolve any open position on this symbol.
    const open = openPositions[symbol];
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= open.maxHoldingCandles;
      if (hitStop || hitTarget || timedOut) {
        let legR, outcome;
        if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = open.rrMultiple; outcome = 'win'; }
        else {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
          legR = signedMove / open.distance; outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / open.distance : 0;
        openPositions[symbol] = null;
        resolveClose(symbol, open.source, open.direction, legR - costR, candle.time, open.entryTime, open.riskAmount, outcome);
      }
    }

    // 2) FVG - always sees every candle (matches production); only the
    // actual open is gated by netting/guardrail.
    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') {
          formationIndexBySymbol[symbol].set(e.id, i);
        } else if (e.type === 'validated' && !openPositions[symbol]) {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: candlesBySymbolFull[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          if (!guardrail.canTakeNewTrade(candle.time)) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          openPositions[symbol] = {
            source: 'fvg', direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: 480,
          };
        }
      }
    }

    // 3) Divergence.
    if (DIV_PAIR.includes(symbol) && !openPositions[symbol]) {
      const cand = divergenceCandidatesFull.get(symbol)?.get(candle.time);
      if (cand) {
        const distance = cand.stopDistance;
        if ((!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const entryPrice = candle.open;
          openPositions[symbol] = {
            source: 'divergence', direction: 'bullish', entryIndex: i, entryTime: candle.time, entryPrice,
            stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance,
            rrMultiple: DIV_RR_MULTIPLE, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: DIV_MAX_HOLDING_CANDLES,
          };
        }
      }
    }

    // 4) NWOG.
    if (NWOG_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = nwogMapBySymbol.get(symbol)?.get(candle.time);
      if (cand && !(NWOG_LONG_ONLY.has(symbol) && cand.direction !== 'bullish')) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + NWOG_RR * distance : entryPrice - NWOG_RR * distance;
          openPositions[symbol] = {
            source: 'nwog', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: NWOG_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: NWOG_MAX_HOLDING,
          };
        }
      }
    }

    // 5) Judas Swing.
    if (JUDAS_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = judasMapBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + JUDAS_RR * distance : entryPrice - JUDAS_RR * distance;
          openPositions[symbol] = {
            source: 'judas', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: JUDAS_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: JUDAS_MAX_HOLDING,
          };
        }
      }
    }

    // 6) Weekly Sweep.
    if (WEEKLYSWEEP_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = weeklySweepMapBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + WEEKLYSWEEP_RR * distance : entryPrice - WEEKLYSWEEP_RR * distance;
          openPositions[symbol] = {
            source: 'weeklysweep', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: WEEKLYSWEEP_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: WEEKLYSWEEP_MAX_HOLDING,
          };
        }
      }
    }

    // 7) Breaker Block.
    if (BREAKERBLOCK_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = breakerBlockMapBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + BREAKERBLOCK_RR * distance : entryPrice - BREAKERBLOCK_RR * distance;
          openPositions[symbol] = {
            source: 'breakerblock', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: BREAKERBLOCK_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: BREAKERBLOCK_MAX_HOLDING,
          };
        }
      }
    }

    // 8) Silver Bullet.
    if (SILVERBULLET_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = silverBulletMapBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + SILVERBULLET_RR * distance : entryPrice - SILVERBULLET_RR * distance;
          openPositions[symbol] = {
            source: 'silverbullet', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: SILVERBULLET_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: SILVERBULLET_MAX_HOLDING,
          };
        }
      }
    }
  }

  const lastCandleTime = timeline[timeline.length - 1].candle.time;
  // Unfinished cycle at the end of the window - report it as "in progress",
  // not silently dropped.
  const unfinishedCycle = cycleTrades > 0 || balance !== STARTING_BALANCE
    ? { n: cycleNumber, startTime: cycleStartTime, endTime: lastCandleTime, days: daysBetween(cycleStartTime, lastCandleTime), trades: cycleTrades, winRate: cycleResolved > 0 ? cycleWins / cycleResolved : null, balance, progressPct: ((balance - STARTING_BALANCE) / STARTING_BALANCE) * 100 }
    : null;

  return { cycles, tradeLog, lastCandleTime, unfinishedCycle };
}

function sourceLabel(s) {
  return { fvg: 'FVG', divergence: 'Divergence', nwog: 'NWOG', judas: 'Judas Swing', weeklysweep: 'Weekly Sweep', breakerblock: 'Breaker Block', silverbullet: 'Silver Bullet' }[s] || s;
}

function main() {
  const historyBySymbol = {};
  for (const symbol of ALL_SYMBOLS) {
    const file = path.join(DATA_DIR, `${symbol}.csv`);
    if (!fs.existsSync(file)) { console.error(`Missing ${file}`); process.exit(1); }
    historyBySymbol[symbol] = loadCandlesFromCsv(file).candles;
  }

  const divergenceCandidatesFull = new Map();
  for (const symbol of DIV_PAIR) divergenceCandidatesFull.set(symbol, new Map());
  const [symA, symB] = DIV_PAIR;
  for (const cand of computeDivergenceCandidates(historyBySymbol[symA], historyBySymbol[symB])) {
    divergenceCandidatesFull.get(cand.symbol).set(cand.entryTime, cand);
  }

  const nwogMapBySymbol = new Map();
  for (const symbol of NWOG_SYMBOLS) nwogMapBySymbol.set(symbol, eventsToMap(detectNwogEvents(historyBySymbol[symbol]), historyBySymbol[symbol]));

  const judasMapBySymbol = new Map();
  for (const symbol of JUDAS_SYMBOLS) judasMapBySymbol.set(symbol, eventsToMap(detectJudasSwingEvents(historyBySymbol[symbol]), historyBySymbol[symbol]));

  const weeklySweepMapBySymbol = new Map();
  for (const symbol of WEEKLYSWEEP_SYMBOLS) weeklySweepMapBySymbol.set(symbol, eventsToMap(detectWeeklySweepEvents(historyBySymbol[symbol]), historyBySymbol[symbol]));

  const breakerBlockMapBySymbol = new Map();
  for (const symbol of BREAKERBLOCK_SYMBOLS) breakerBlockMapBySymbol.set(symbol, candidatesToMap(computeBreakerBlockCandidates(historyBySymbol[symbol])));

  const silverBulletMapBySymbol = new Map();
  for (const symbol of SILVERBULLET_SYMBOLS) silverBulletMapBySymbol.set(symbol, candidatesToMap(computeSilverBulletCandidates(historyBySymbol[symbol])));

  const result = simulateContinuous({
    candlesBySymbolFull: historyBySymbol, divergenceCandidatesFull, nwogMapBySymbol, judasMapBySymbol,
    weeklySweepMapBySymbol, breakerBlockMapBySymbol, silverBulletMapBySymbol,
  });

  const outPath = path.join(DATA_DIR, 'ftmo-1step-full-combo-7months-cycle.md');
  const lines = [];
  lines.push('# FTMO 1-Step - combo complet (7 mécanismes) sur les 7 vrais mois live - 2026-02-10 -> 2026-09-16');
  lines.push('');
  lines.push(`Config exacte de production au 2026-09-17 (src/config.js) : FVG (${FVG_SYMBOLS.join('/')}, RR ${CONFIG.fvg.perSymbol.US100.rrMultiple}), Divergence (${DIV_PAIR.join('/')}, RR ${DIV_RR_MULTIPLE}), NWOG (${NWOG_SYMBOLS.join('/')}, achat-seul sur ${[...NWOG_LONG_ONLY].join('/')}, RR ${NWOG_RR}), Judas Swing (${JUDAS_SYMBOLS.join('/')}, RR ${JUDAS_RR}), Weekly Sweep (${WEEKLYSWEEP_SYMBOLS.join('/')}, RR ${WEEKLYSWEEP_RR}), Breaker Block (${BREAKERBLOCK_SYMBOLS.join('/')}, RR ${BREAKERBLOCK_RR}), Silver Bullet (${SILVERBULLET_SYMBOLS.join('/')}, RR ${SILVERBULLET_RR}).`);
  lines.push('');
  lines.push(`Risque par trade : ${RISK_PCT}% - c'est la valeur "mode challenge" documentée dans src/config.js (ACCOUNT_MODE), validée pour une VRAIE tentative de challenge FTMO (cible à atteindre vite, un bust ne coûte qu'un rachat). Le compte démo réellement en ligne aujourd'hui tourne en mode "live"/financé (0.3%/trade, visible sur /api/status) car il fait du forward-test, pas une vraie tentative de challenge - ce n'est PAS le nombre à utiliser ici, vu la question posée. Garde-fous réels : ${CONFIG.guardrails.maxTradesPerDay} trades/jour max, cooldown ${CONFIG.guardrails.cooldownMinutesAfterLoss}min après une perte, perte quotidienne max ${CONFIG.guardrails.dailyLossLimitPct}%. FTMO 1-Step : compte $${STARTING_BALANCE.toLocaleString('fr-FR')}, cible unique +10%, perte max TRAILING -10% sur le plus haut solde jamais atteint DANS le cycle.`);
  lines.push('');
  lines.push('**Règle de cycle** : dès que le solde touche +10% (challenge réussi) ou -10% trailing (challenge raté), on considère que le compte est remplacé par un tout nouveau compte à $10 000 (financé, ou un nouveau challenge racheté) - AUCUNE position ouverte n\'est reportée d\'un cycle à l\'autre.');
  lines.push('');

  lines.push('## Résumé');
  lines.push('');
  const passes = result.cycles.filter((c) => c.outcome === 'pass');
  const busts = result.cycles.filter((c) => c.outcome === 'bust');
  lines.push(`- **${passes.length} challenge(s) réussi(s) (+10% atteint)** sur les 7 mois.`);
  lines.push(`- **${busts.length} challenge(s) raté(s) (-10% touché)**.`);
  lines.push(`- ${result.tradeLog.length} trades au total sur toute la fenêtre.`);
  if (passes.length) {
    const avgDays = Math.round(passes.reduce((s, c) => s + c.days, 0) / passes.length);
    lines.push(`- Temps moyen pour réussir un challenge : ${avgDays} jours.`);
  }
  if (result.unfinishedCycle) {
    const u = result.unfinishedCycle;
    lines.push(`- Cycle #${u.n} encore EN COURS à la fin de la fenêtre (${fmtDate(u.startTime)} -> ${fmtDate(u.endTime)}, ${u.days}j, ${u.trades} trades) : progression ${u.progressPct >= 0 ? '+' : ''}${u.progressPct.toFixed(2)}% (ni +10% ni -10% touché avant la fin des données disponibles).`);
  }
  lines.push('');

  lines.push('## Cycles, un par un');
  lines.push('');
  lines.push('| # | Période | Durée | Trades | Win rate | Drawdown max | Résultat |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const c of result.cycles) {
    const wr = c.winRate !== null ? (c.winRate * 100).toFixed(1) + '%' : '—';
    const outcomeCell = c.outcome === 'pass' ? '✅ **réussi**' : '❌ raté';
    lines.push(`| ${c.n} | ${fmtDate(c.startTime)} -> ${fmtDate(c.endTime)} | ${c.days}j | ${c.trades} | ${wr} | ${c.maxDrawdownPct.toFixed(1)}% | ${outcomeCell} |`);
  }
  if (result.unfinishedCycle) {
    const u = result.unfinishedCycle;
    const wr = u.winRate !== null ? (u.winRate * 100).toFixed(1) + '%' : '—';
    lines.push(`| ${u.n} | ${fmtDate(u.startTime)} -> ${fmtDate(u.endTime)} (fin des données) | ${u.days}j | ${u.trades} | ${wr} | — | ⏳ en cours (${u.progressPct >= 0 ? '+' : ''}${u.progressPct.toFixed(2)}%) |`);
  }
  lines.push('');

  lines.push('## Détail trade par trade');
  lines.push('');
  lines.push('Trié par date de CLÔTURE (ordre réel des mises à jour du solde) - la date d\'entrée peut donc, pour un trade tenu plus longtemps, apparaître après celle du trade suivant qui s\'est résolu plus vite.');
  lines.push('');
  lines.push('| Cycle | Entrée | Clôture | Symbole | Mécanisme | Sens | Résultat | R net | P&L | Solde après | Progression vers +10% |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const t of result.tradeLog) {
    const dirFr = t.direction === 'bullish' ? 'achat' : 'vente';
    const outcomeFr = t.outcome === 'win' ? '✅ gain' : t.outcome === 'loss' ? '❌ perte' : '⏱️ timeout';
    lines.push(`| ${t.cycle} | ${fmtDateTime(t.entryTime)} | ${fmtDateTime(t.exitTime)} | ${t.symbol} | ${sourceLabel(t.source)} | ${dirFr} | ${outcomeFr} | ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R | ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)} | $${t.balanceAfter.toFixed(2)} | ${t.progressPct >= 0 ? '+' : ''}${t.progressPct.toFixed(2)}% |`);
  }
  lines.push('');

  lines.push('## Mises en garde');
  lines.push('');
  lines.push('- Fenêtre courte (7 mois, pas 7 ans) : les filtres qui ont besoin de beaucoup d\'historique pour se stabiliser (biais H4 EMA200, structure ICT) n\'ont eu que quelques semaines de warm-up en février-mars 2026 - les tout premiers signaux de la fenêtre sont donc un peu moins fiables que ceux de la fin.');
  lines.push('- Échantillon : à ce rythme de trading (quelques trades/semaine), le nombre de cycles observés ici reste petit - ce résultat montre "ce que la config actuelle AURAIT fait sur ces 7 mois précis", pas une garantie statistique pour l\'avenir. Voir le backtest 2019-2025 (`ftmo-1step-us100-only-8to12-account-impact.md` etc.) pour une base plus large.');
  lines.push('- Simplification assumée (même que runFtmoAllLiveStrategiesCycleAccountImpact.js) : au moment où un cycle se termine (+10% ou -10%), toute position encore ouverte sur un AUTRE symbole est abandonnée, pas reportée sur le nouveau compte - c\'est ce qui se passerait réellement (un nouveau compte ne peut pas hériter d\'une position de l\'ancien).');
  lines.push('');

  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`Rapport écrit : ${outPath}`);
  console.log('');
  console.log(`Réussi : ${passes.length} | Raté : ${busts.length} | Trades total : ${result.tradeLog.length}`);
  for (const c of result.cycles) console.log(`  Cycle ${c.n}: ${fmtDate(c.startTime)} -> ${fmtDate(c.endTime)} (${c.days}j, ${c.trades} trades) -> ${c.outcome}`);
  if (result.unfinishedCycle) {
    const u = result.unfinishedCycle;
    console.log(`  Cycle ${u.n} (en cours): ${fmtDate(u.startTime)} -> ${fmtDate(u.endTime)} (${u.days}j, ${u.trades} trades) -> ${u.progressPct.toFixed(2)}%`);
  }
}

main();
