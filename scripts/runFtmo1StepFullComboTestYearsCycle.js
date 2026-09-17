#!/usr/bin/env node
// runFtmo1StepFullComboTestYearsCycle.js
// Usage: node scripts/runFtmo1StepFullComboTestYearsCycle.js
//
// Esdras (2026-09-17), suite directe de runFtmo1StepFullComboReal7MonthsCycle.js
// (voir sa doc et HANDOFF.md "Combien de fois +10% en 7 mois réels") : "Tu
// fais la même chose pour les deux années de test?" - "les deux années de
// test" = le split train(2019-2023)/test(2024-2025) déjà utilisé PARTOUT
// dans ce projet pour valider chaque mécanisme (voir HANDOFF.md, chaque
// section de validation). Même simulation cycle "reset à +10%/-10%", mêmes
// 7 mécanismes RÉELLEMENT en production (FVG, Divergence, NWOG, Judas
// Swing, Weekly Sweep, Breaker Block, Silver Bullet), mêmes garde-fous
// réels, MÊME risque par trade (0.5%, mode "challenge" - voir la note dans
// le script frère) - mais sur l'historique CSV 2019-2025
// (data/backtest-input/) filtré à la fenêtre TEST SEULE (2024-01-01 ->
// 2026-01-01), pas sur les 7 mois réels de 2026.
//
// Différence assumée avec un warm-up "continu" : comme les autres scripts
// de ce projet qui simulent par année (runFtmoAllLiveStrategiesAccountImpact.js,
// simulateYear()), les candidats (FVG, structure ICT, biais H4, NWOG, Judas
// Swing, Weekly Sweep, Breaker Block, Silver Bullet, z-score Divergence)
// sont calculés SEULEMENT sur les bougies de la fenêtre test elle-même, pas
// réchauffés sur 2019-2023 puis coupés à 2024 - même simplification déjà
// acceptée ailleurs dans ce projet pour ce type de test, signalée
// honnêtement dans les mises en garde ci-dessous (les tout premiers
// signaux de janvier 2024 sont un peu moins fiables que ceux de fin 2025).

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

const DATA_DIR = path.join(process.cwd(), 'data/backtest-input');
const OUT_DIR = path.join(process.cwd(), 'data/backtest-input');
const TEST_START = new Date('2024-01-01T00:00:00Z').getTime();
const TEST_END = new Date('2026-01-01T00:00:00Z').getTime();
const STARTING_BALANCE = 10000;
// Same reasoning as runFtmo1StepFullComboReal7MonthsCycle.js: 0.5% is the
// "challenge"-mode value (ACCOUNT_MODE, src/config.js), validated for an
// actual FTMO challenge attempt - not today's live-mode 0.3%.
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
  const unfinishedCycle = cycleTrades > 0 || balance !== STARTING_BALANCE
    ? { n: cycleNumber, startTime: cycleStartTime, endTime: lastCandleTime, days: daysBetween(cycleStartTime, lastCandleTime), trades: cycleTrades, winRate: cycleResolved > 0 ? cycleWins / cycleResolved : null, balance, progressPct: ((balance - STARTING_BALANCE) / STARTING_BALANCE) * 100 }
    : null;

  return { cycles, tradeLog, lastCandleTime, unfinishedCycle };
}

function sourceLabel(s) {
  return { fvg: 'FVG', divergence: 'Divergence', nwog: 'NWOG', judas: 'Judas Swing', weeklysweep: 'Weekly Sweep', breakerblock: 'Breaker Block', silverbullet: 'Silver Bullet' }[s] || s;
}

function loadTestYearsCandles(symbol) {
  const file = path.join(DATA_DIR, `${symbol}.csv`);
  if (!fs.existsSync(file)) { console.error(`Missing ${file}`); process.exit(1); }
  const { candles } = loadCandlesFromCsv(file);
  return candles.filter((c) => c.time >= TEST_START && c.time < TEST_END);
}

function main() {
  const historyBySymbol = {};
  for (const symbol of ALL_SYMBOLS) historyBySymbol[symbol] = loadTestYearsCandles(symbol);

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

  const outPath = path.join(OUT_DIR, 'ftmo-1step-full-combo-test-years-cycle.md');
  const lines = [];
  lines.push('# FTMO 1-Step - combo complet (7 mécanismes) sur les 2 années de test (2024-2025) - historique broker 2019-2025');
  lines.push('');
  lines.push('"Les deux années de test" = le split train(2019-2023)/test(2024-2025) déjà utilisé pour valider chaque mécanisme de ce projet (voir HANDOFF.md) - donc des données JAMAIS vues pendant le réglage de FVG/Divergence/NWOG/Judas Swing/Weekly Sweep/Breaker Block/Silver Bullet. Suite directe de la même question posée sur les 7 mois réels de 2026 (`ftmo-1step-full-combo-7months-cycle.md`), ici sur 2 ans complets d\'historique broker au lieu de 7 mois.');
  lines.push('');
  lines.push(`Config exacte de production au 2026-09-17 (src/config.js) : FVG (${FVG_SYMBOLS.join('/')}, RR ${CONFIG.fvg.perSymbol.US100.rrMultiple}), Divergence (${DIV_PAIR.join('/')}, RR ${DIV_RR_MULTIPLE}), NWOG (${NWOG_SYMBOLS.join('/')}, achat-seul sur ${[...NWOG_LONG_ONLY].join('/')}, RR ${NWOG_RR}), Judas Swing (${JUDAS_SYMBOLS.join('/')}, RR ${JUDAS_RR}), Weekly Sweep (${WEEKLYSWEEP_SYMBOLS.join('/')}, RR ${WEEKLYSWEEP_RR}), Breaker Block (${BREAKERBLOCK_SYMBOLS.join('/')}, RR ${BREAKERBLOCK_RR}), Silver Bullet (${SILVERBULLET_SYMBOLS.join('/')}, RR ${SILVERBULLET_RR}).`);
  lines.push('');
  lines.push(`Risque par trade : ${RISK_PCT}% (mode "challenge", src/config.js/ACCOUNT_MODE - voir la note du script frère sur les 7 mois pour pourquoi ce n'est pas le 0.3% actuellement visible sur /api/status). Garde-fous réels : ${CONFIG.guardrails.maxTradesPerDay} trades/jour max, cooldown ${CONFIG.guardrails.cooldownMinutesAfterLoss}min après une perte, perte quotidienne max ${CONFIG.guardrails.dailyLossLimitPct}%. FTMO 1-Step : compte $${STARTING_BALANCE.toLocaleString('fr-FR')}, cible unique +10%, perte max TRAILING -10% sur le plus haut solde jamais atteint DANS le cycle.`);
  lines.push('');
  lines.push('**Règle de cycle** : dès que le solde touche +10% (challenge réussi) ou -10% trailing (challenge raté), on considère que le compte est remplacé par un tout nouveau compte à $10 000 - AUCUNE position ouverte n\'est reportée d\'un cycle à l\'autre.');
  lines.push('');

  lines.push('## Résumé');
  lines.push('');
  const passes = result.cycles.filter((c) => c.outcome === 'pass');
  const busts = result.cycles.filter((c) => c.outcome === 'bust');
  lines.push(`- **${passes.length} challenge(s) réussi(s) (+10% atteint)** sur les 2 années de test.`);
  lines.push(`- **${busts.length} challenge(s) raté(s) (-10% touché)**.`);
  lines.push(`- ${result.tradeLog.length} trades au total sur toute la fenêtre.`);
  if (passes.length) {
    const avgDays = Math.round(passes.reduce((s, c) => s + c.days, 0) / passes.length);
    lines.push(`- Temps moyen pour réussir un challenge : ${avgDays} jours.`);
  }
  if (result.unfinishedCycle) {
    const u = result.unfinishedCycle;
    lines.push(`- Cycle #${u.n} encore EN COURS à la fin de la fenêtre (${fmtDate(u.startTime)} -> ${fmtDate(u.endTime)}, ${u.days}j, ${u.trades} trades) : progression ${u.progressPct >= 0 ? '+' : ''}${u.progressPct.toFixed(2)}% (ni +10% ni -10% touché avant fin 2025).`);
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
  lines.push('- **Warm-up limité au strict début de fenêtre** : comme `runFtmoAllLiveStrategiesAccountImpact.js` (simulation par année), les candidats de chaque mécanisme sont calculés SEULEMENT sur les bougies 2024-2025 elles-mêmes, pas réchauffés sur 2019-2023 puis coupés - les tout premiers signaux de janvier 2024 sont donc un peu moins fiables que ceux de fin 2025 (biais H4 EMA200, structure ICT ont besoin de temps pour se stabiliser).');
  lines.push('- Échantillon de 2 ans, pas plus : donne une meilleure idée que les 7 mois réels de 2026 (voir le rapport frère), mais reste plus court que le backtest complet 2019-2025 utilisé pour la décision de production (`ftmo-1step-us100-only-8to12-account-impact.md` etc., 7 ans).');
  lines.push('- Simplification assumée (même que runFtmoAllLiveStrategiesCycleAccountImpact.js) : au moment où un cycle se termine (+10% ou -10%), toute position encore ouverte sur un AUTRE symbole est abandonnée, pas reportée sur le nouveau compte.');
  lines.push('- Ces 2 années sont bien "test" au sens strict (jamais utilisées pour choisir un seul paramètre de FVG/Divergence/NWOG/Judas Swing/Weekly Sweep/Breaker Block/Silver Bullet), mais Weekly Sweep/Breaker Block/Silver Bullet ont été ajoutés au combo APRÈS avoir été validés séparément sur ce même découpage train/test - ce test-ci les combine tous ensemble pour la première fois avec du netting/garde-fous PARTAGÉS, ce qui est un test différent (l\'objectif de ce rapport) de leur validation individuelle d\'origine.');
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
