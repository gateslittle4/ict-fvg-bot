#!/usr/bin/env node
// runFtmo25kFirstPayoutFullComboAnalysis.js
// Usage: node scripts/runFtmo25kFirstPayoutFullComboAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-16): "Mon objectif now est de faire un retrait de 500$,
// donne moi un plan detaille... et mes chances de le faire." The last time
// this exact pipeline (buy FTMO 1-Step $25k -> pass, rebuying immediately
// on any bust -> go live -> accumulate profit -> first $500 payout) was
// simulated was 2026-09-12 (runFtmo25kFirstPayoutByDateAnalysis.js), using
// only 4 of the now-6 live mechanisms (FVG/Divergence/NWOG-US100-only/
// Judas) and shorter CSV history. Since then: Weekly Sweep (GER40+US500)
// and Breaker Block (GER40) went live, NWOG gained GER40 (bidirectional),
// every RR target got extended 1:3->1:4/1:5, and US100/US500's FVG both got
// multiTouch. This script re-runs the SAME empirical method (many
// historical start points, full pipeline, real prop-firm rules) against
// TODAY's actual production combo (read straight from CONFIG, nothing
// re-tuned here) and the now-17-year-extended CSV history.
//
// WHY FTMO AND NOT FUNDINGPIPS (despite FundingPips 1-Step Flex reaching
// 95.05% pass rate in today's earlier research, see HANDOFF.md "Test FTMO
// sur les 7 derniers mois réels"): that number is a pure backtest finding.
// FundingPips' own platform is MT5 (confirmed by Esdras directly, "c'est
// mt5") - ZERO code in this bot talks to MT5. FTMO runs on cTrader, already
// wired, already live and confirmed trading (see HANDOFF.md "Câblage live
// vérifié"). A theoretically-better firm the bot cannot actually connect to
// is not a real option for "how do I get $500 out" - only what's
// deployable today.
//
// TWO COMBOS compared, both against FTMO 1-Step's real rules:
//   1. "Combo actuel" - every mechanism exactly as live in CONFIG today.
//   2. "Combo prudent" - same, minus Weekly Sweep/US500 and Breaker
//      Block/GER40 (the two flagged today as the biggest contributors to
//      NEW daily-loss-limit failures once trade frequency rose - see
//      HANDOFF.md). Tests whether that same prudent prune helps on FTMO's
//      OWN rules, not just FundingPips'.
//
// Same architecture/assumptions as the 2026-09-12 script (see its header
// for the full list) - restated briefly: challenge risk 0.5%/live risk
// 0.3% (config.js defaults), FTMO's funded-account drawdown assumed
// identical to challenge (not separately documented), a challenge bust
// immediately rebuys (no time limit per FTMO), a LIVE bust starts a fresh
// challenge without resetting the elapsed-day clock, payout eligible at
// >=$500 net (90% split) AND >=14 calendar days since first live trade
// (FTMO's own sourced rule) + 4 days processing padding.
//
// NEW this run: maxTradesPerDay forced to 3 (not CONFIG.guardrails'
// CURRENT value of 20 - that 20 is an explicit TEMPORARY debug loosening,
// see config.js's own comment "REVERT to 3... once tonight's verification
// is done", not the intended steady-state value a real challenge should run
// under). Everything else (RR, sessions, which sources are live, longOnly
// splits) read verbatim from CONFIG.

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
import { detectBosEvents, findOrderBlock, OB_SEARCH_LOOKBACK, BREAKER_MAX_AGE_CANDLES } from '../src/backtest/breakerBlock.js';
import { CONFIG } from '../src/config.js';
import { getPropFirmProgram } from '../src/propFirms/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_ACCOUNT_SIZE = 25000;
const CHALLENGE_RISK_PCT = 0.5;
const LIVE_RISK_PCT = 0.3;
const FIRST_PAYOUT_TARGET_USD = 500;
const PAYOUT_MIN_HOLD_DAYS = 14;
const PAYOUT_PROCESSING_DAYS = 4;
const START_POINT_SPACING_DAYS = 21; // denser than the 30-day spacing used 2026-09-12, more start points from the same history
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const CHALLENGE_FEE_USD = 230; // mid-point of FTMO's own published $25k range (~$199-265, see HANDOFF.md)

const FTMO_1STEP = getPropFirmProgram('ftmo-1step');
const CHALLENGE_PHASE = FTMO_1STEP.phases[0];
const PROFIT_SPLIT = FTMO_1STEP.profitSplit;

const FVG_SYMBOLS = Object.keys(CONFIG.fvg.perSymbol).filter((s) => s !== 'BTCUSD'); // BTCUSD is a temporary connectivity smoke-test, not part of the real combo
const DIV_PAIR = CONFIG.divergence.pair;
const NWOG_SYMBOLS = CONFIG.nwog.symbols;
const NWOG_LONG_ONLY = new Set(CONFIG.nwog.longOnlySymbols || []);
const JUDAS_SYMBOLS = CONFIG.judasSwing.symbols;
const WEEKLY_SWEEP_SYMBOLS = CONFIG.weeklySweep.symbols;
const BREAKER_BLOCK_SYMBOLS = CONFIG.breakerBlock.symbols;

function allSymbolsFor(weeklySweepSymbols, breakerBlockSymbols) {
  return [...new Set([...FVG_SYMBOLS, ...DIV_PAIR, ...NWOG_SYMBOLS, ...JUDAS_SYMBOLS, ...weeklySweepSymbols, ...breakerBlockSymbols])];
}

const FVG_CONFIG = {};
for (const symbol of FVG_SYMBOLS) FVG_CONFIG[symbol] = { ...CONFIG.fvg.perSymbol[symbol], spread: DEFAULT_SPREADS[symbol] };

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
const WEEKLY_SWEEP_RR = CONFIG.weeklySweep.rrMultiple;
const WEEKLY_SWEEP_MAX_HOLDING = CONFIG.weeklySweep.maxHoldingM15Candles;
const BREAKER_BLOCK_RR = CONFIG.breakerBlock.rrMultiple;
const BREAKER_BLOCK_MAX_HOLDING = CONFIG.breakerBlock.maxHoldingM15Candles;

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

function computeNwogCandidatesMap(candles) {
  const events = detectNwogEvents(candles);
  const map = new Map();
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    map.set(candles[entryIndex].time, { direction: e.direction, stopReference: e.stopReference });
  }
  return map;
}

function computeJudasCandidatesMap(candles) {
  const events = detectJudasSwingEvents(candles);
  const map = new Map();
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    map.set(candles[entryIndex].time, { direction: e.direction, stopReference: e.sweepExtreme });
  }
  return map;
}

function computeWeeklySweepCandidatesMap(candles) {
  const events = detectWeeklySweepEvents(candles);
  const map = new Map();
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    map.set(candles[entryIndex].time, { direction: e.direction, stopReference: e.sweepExtreme });
  }
  return map;
}

// Exact copy of LiveStrategyEngine._computeBreakerBlockCandidates - see
// src/liveStrategyEngine.js for the authoritative version and its own
// comments (watchBreak -> watchRetest -> pendingEntry state machine).
function computeBreakerBlockCandidatesMap(candles) {
  const bosEvents = detectBosEvents(candles);
  const bosByIndex = new Map(bosEvents.map((e) => [e.index, e]));
  const map = new Map();

  let watchBreak = null;
  let watchRetest = null;
  let pendingEntry = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (pendingEntry && pendingEntry.readyAtIndex === i) {
      map.set(candle.time, { direction: pendingEntry.direction, stopReference: pendingEntry.stopPrice });
      pendingEntry = null;
    }

    if (!pendingEntry && watchRetest) {
      if (i > watchRetest.expireIndex) {
        watchRetest = null;
      } else {
        const bullish = watchRetest.breakerDirection === 'bullish';
        const touched = bullish ? candle.low <= watchRetest.mid : candle.high >= watchRetest.mid;
        if (touched) {
          const stopPrice = bullish ? watchRetest.zoneLow : watchRetest.zoneHigh;
          pendingEntry = { direction: watchRetest.breakerDirection, stopPrice, readyAtIndex: i + 1 };
          watchRetest = null;
        }
      }
    }

    if (!pendingEntry && !watchRetest && watchBreak) {
      if (i > watchBreak.expireIndex) {
        watchBreak = null;
      } else if (i > watchBreak.bosIndex) {
        const obBullish = watchBreak.obDirection === 'bullish';
        const brokenThrough = obBullish ? candle.low < watchBreak.zoneLow : candle.high > watchBreak.zoneHigh;
        if (brokenThrough) {
          watchRetest = {
            breakerDirection: obBullish ? 'bearish' : 'bullish',
            zoneLow: watchBreak.zoneLow,
            zoneHigh: watchBreak.zoneHigh,
            mid: watchBreak.mid,
            expireIndex: i + BREAKER_MAX_AGE_CANDLES,
          };
          watchBreak = null;
        }
      }
    }

    if (!pendingEntry && !watchRetest && !watchBreak) {
      const bos = bosByIndex.get(i);
      if (bos) {
        const zone = findOrderBlock(candles, i, bos.direction, OB_SEARCH_LOOKBACK);
        if (zone) {
          watchBreak = { obDirection: bos.direction, zoneLow: zone.low, zoneHigh: zone.high, mid: zone.mid, bosIndex: i, expireIndex: i + BREAKER_MAX_AGE_CANDLES };
        }
      }
    }
  }
  return map;
}

function makeDivIndex(divergenceCandidatesFull) {
  const bySymbol = new Map();
  for (const symbol of DIV_PAIR) bySymbol.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) bySymbol.get(cand.symbol).set(cand.entryTime, cand);
  return bySymbol;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

function newGuardrail(phase, startTime, balance) {
  const g = new GuardrailEngine({
    maxTradesPerDay: 3, // steady-state intended value, NOT the temporary debug=20 currently in CONFIG.guardrails - see header
    cooldownMinutesAfterLoss: CONFIG.guardrails.cooldownMinutesAfterLoss,
    dayBoundaryHourUTC: CONFIG.guardrails.dayBoundaryHourUTC,
    dailyLossLimitPct: CHALLENGE_PHASE.dailyLossLimitPct,
    targetPct: phase === 'challenge' ? CHALLENGE_PHASE.targetPct : null,
    maxDrawdownPct: CHALLENGE_PHASE.maxDrawdownPct,
    maxDrawdownType: CHALLENGE_PHASE.maxDrawdownType,
  });
  g.setBalance(balance, startTime);
  return g;
}

class Attempt {
  constructor(startTime, allSymbols) {
    this.originalStartTime = startTime;
    this.allSymbols = allSymbols;
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    this.openPositions = {}; for (const s of allSymbols) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', startTime, this.balance);
    this.liveStartTime = null;
    this.reAttempts = 1;
    this.liveBustCount = 0;
    this.doneTime = null;
    this.totalDays = null;
  }
  riskPct() { return this.phase === 'challenge' ? CHALLENGE_RISK_PCT : LIVE_RISK_PCT; }
  resetToFreshChallenge(now) {
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    for (const s of this.allSymbols) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', now, this.balance);
    this.reAttempts++;
  }
  transitionToLive(now) {
    this.phase = 'live';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    for (const s of this.allSymbols) this.openPositions[s] = null;
    this.liveStartTime = now;
    this.guardrail = newGuardrail('live', now, this.balance);
  }
}

function runPipeline({ comboLabel, weeklySweepSymbols, breakerBlockSymbols, dir }) {
  const ALL_SYMBOLS = allSymbolsFor(weeklySweepSymbols, breakerBlockSymbols);

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) candlesBySymbolFull[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;

  const divergenceCandidatesFull = makeDivIndex(computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500));
  // NWOG spans 2 symbols (US100, GER40) with independent week-boundary detection per symbol's own candles.
  const nwogCandidatesBySymbol = new Map();
  for (const symbol of NWOG_SYMBOLS) nwogCandidatesBySymbol.set(symbol, computeNwogCandidatesMap(candlesBySymbolFull[symbol]));

  const judasCandidatesFull = JUDAS_SYMBOLS.length ? computeJudasCandidatesMap(candlesBySymbolFull[JUDAS_SYMBOLS[0]]) : new Map();

  const weeklySweepCandidatesBySymbol = new Map();
  for (const symbol of weeklySweepSymbols) weeklySweepCandidatesBySymbol.set(symbol, computeWeeklySweepCandidatesMap(candlesBySymbolFull[symbol]));

  const breakerBlockCandidatesBySymbol = new Map();
  for (const symbol of breakerBlockSymbols) breakerBlockCandidatesBySymbol.set(symbol, computeBreakerBlockCandidatesMap(candlesBySymbolFull[symbol]));

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

  const timeline = [];
  for (const symbol of ALL_SYMBOLS) for (const candle of candlesBySymbolFull[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));

  const datasetStart = timeline[0].candle.time;
  const datasetEnd = timeline[timeline.length - 1].candle.time;

  const attempts = [];
  for (let t = datasetStart; t < datasetEnd; t += START_POINT_SPACING_DAYS * DAY_MS) attempts.push(new Attempt(t, ALL_SYMBOLS));

  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  const tryOpen = (attempt, symbol, candle, i, source, direction, entryPrice, stopPrice, targetPrice, distance, rrMultiple, maxHoldingCandles) => {
    if (attempt.openPositions[symbol]) return;
    if (!attempt.guardrail.canTakeNewTrade(candle.time)) return;
    attempt.openPositions[symbol] = {
      source, direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple,
      riskAmount: attempt.balance * (attempt.riskPct() / 100), maxHoldingCandles,
    };
  };

  let totalRebuys = 0;

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    for (const attempt of attempts) {
      if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
      const open = attempt.openPositions[symbol];
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
            const signedMove = bullish ? candle.close - open.entryPrice : open.entryPrice - candle.close;
            legR = signedMove / open.distance; outcome = 'timeout';
          }
          const costR = spread > 0 ? spread / open.distance : 0;
          const pnl = open.riskAmount * (legR - costR);
          attempt.balance += pnl;
          attempt.guardrail.recordTrade({ pnl, time: candle.time, balanceAfter: attempt.balance });
          attempt.openPositions[symbol] = null;

          const status = attempt.guardrail.getStatus(candle.time);
          if (attempt.phase === 'challenge') {
            if (status.overallDrawdownBreached) {
              attempt.resetToFreshChallenge(candle.time);
              totalRebuys++;
            } else if (attempt.balance >= CHALLENGE_ACCOUNT_SIZE * (1 + CHALLENGE_PHASE.targetPct / 100)) {
              attempt.transitionToLive(candle.time);
            }
          } else if (attempt.phase === 'live') {
            if (status.overallDrawdownBreached) {
              attempt.liveBustCount++;
              attempt.resetToFreshChallenge(candle.time);
              totalRebuys++;
            } else {
              const grossProfit = attempt.balance - CHALLENGE_ACCOUNT_SIZE;
              const netEligible = grossProfit > 0 ? grossProfit * PROFIT_SPLIT : 0;
              const daysSinceLive = (candle.time - attempt.liveStartTime) / DAY_MS;
              if (netEligible >= FIRST_PAYOUT_TARGET_USD && daysSinceLive >= PAYOUT_MIN_HOLD_DAYS) {
                attempt.phase = 'done';
                attempt.doneTime = candle.time + PAYOUT_PROCESSING_DAYS * DAY_MS;
                attempt.totalDays = (attempt.doneTime - attempt.originalStartTime) / DAY_MS;
              }
            }
          }
        }
      }
    }

    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') {
          formationIndexBySymbol[symbol].set(e.id, i);
        } else if (e.type === 'validated') {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: candlesBySymbolFull[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'fvg', e.direction, entryPrice, stopPrice, targetPrice, distance, FVG_CONFIG[symbol].rrMultiple, 480);
          }
        }
      }
    }

    if (DIV_PAIR.includes(symbol)) {
      const cand = divergenceCandidatesFull.get(symbol)?.get(candle.time);
      if (cand) {
        const distance = cand.stopDistance;
        if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
          const entryPrice = candle.open;
          const stopPrice = entryPrice - distance;
          const targetPrice = entryPrice + DIV_RR_MULTIPLE * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'divergence', 'bullish', entryPrice, stopPrice, targetPrice, distance, DIV_RR_MULTIPLE, DIV_MAX_HOLDING_CANDLES);
          }
        }
      }
    }

    if (NWOG_SYMBOLS.includes(symbol)) {
      const cand = nwogCandidatesBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        if (!bullish && NWOG_LONG_ONLY.has(symbol)) {
          // skip - long-only symbol, sell side excluded (matches CONFIG.nwog.longOnlySymbols)
        } else {
          const entryPrice = candle.open;
          const stopPrice = cand.stopReference;
          const distance = Math.abs(entryPrice - stopPrice);
          const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
          if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE)) {
            const targetPrice = bullish ? entryPrice + NWOG_RR * distance : entryPrice - NWOG_RR * distance;
            for (const attempt of attempts) {
              if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
              tryOpen(attempt, symbol, candle, i, 'nwog', cand.direction, entryPrice, stopPrice, targetPrice, distance, NWOG_RR, NWOG_MAX_HOLDING);
            }
          }
        }
      }
    }

    if (JUDAS_SYMBOLS.includes(symbol)) {
      const cand = judasCandidatesFull.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE)) {
          const targetPrice = bullish ? entryPrice + JUDAS_RR * distance : entryPrice - JUDAS_RR * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'judas', cand.direction, entryPrice, stopPrice, targetPrice, distance, JUDAS_RR, JUDAS_MAX_HOLDING);
          }
        }
      }
    }

    if (weeklySweepSymbols.includes(symbol)) {
      const cand = weeklySweepCandidatesBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE)) {
          const targetPrice = bullish ? entryPrice + WEEKLY_SWEEP_RR * distance : entryPrice - WEEKLY_SWEEP_RR * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'weeklySweep', cand.direction, entryPrice, stopPrice, targetPrice, distance, WEEKLY_SWEEP_RR, WEEKLY_SWEEP_MAX_HOLDING);
          }
        }
      }
    }

    if (breakerBlockSymbols.includes(symbol)) {
      const cand = breakerBlockCandidatesBySymbol.get(symbol)?.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE)) {
          const targetPrice = bullish ? entryPrice + BREAKER_BLOCK_RR * distance : entryPrice - BREAKER_BLOCK_RR * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'breakerBlock', cand.direction, entryPrice, stopPrice, targetPrice, distance, BREAKER_BLOCK_RR, BREAKER_BLOCK_MAX_HOLDING);
          }
        }
      }
    }
  }

  const done = attempts.filter((a) => a.phase === 'done');
  const censored = attempts.filter((a) => a.phase !== 'done');
  const days = done.map((a) => a.totalDays).sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)] : null;
  const mean = days.length ? days.reduce((s, d) => s + d, 0) / days.length : null;
  const avgRebuys = done.length ? done.reduce((s, a) => s + (a.reAttempts - 1), 0) / done.length : null;
  const within = (n) => done.filter((a) => a.totalDays <= n).length;

  return { comboLabel, attempts, done, censored, days, median, mean, avgRebuys, within, totalRebuysAcrossAll: totalRebuys };
}

function fmtResult(r) {
  const lines = [];
  lines.push(`### ${r.comboLabel}`);
  lines.push('');
  lines.push(`- ${r.attempts.length} points de départ testés, ${r.done.length} ont atteint $500 dans les données disponibles (${r.censored.length} censurés - pas assez de données restantes, pas des échecs).`);
  lines.push(`- Médiane : **${r.median !== null ? Math.round(r.median) + ' jours' : '—'}**, moyenne : ${r.mean !== null ? Math.round(r.mean) + ' jours' : '—'}`);
  lines.push(`- Rachats de challenge moyens avant le premier retrait : ${r.avgRebuys !== null ? r.avgRebuys.toFixed(2) : '—'} (coût moyen ≈ $${r.avgRebuys !== null ? Math.round((1 + r.avgRebuys) * CHALLENGE_FEE_USD) : '—'} en frais de challenge cumulés)`);
  lines.push('');
  lines.push('| Seuil | % des points de départ qui y arrivent |');
  lines.push('|---|---|');
  for (const n of [30, 45, 60, 90, 120, 180, 270, 365]) {
    const pct = r.attempts.length ? ((r.within(n) / r.attempts.length) * 100).toFixed(0) : '—';
    lines.push(`| ${n}j | ${pct}% |`);
  }
  return lines.join('\n');
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmo25kFirstPayoutFullComboAnalysis.js <dir-with-csvs>'); process.exit(1); }

  console.error('Running "combo actuel"...');
  const current = runPipeline({ comboLabel: 'Combo actuel (Weekly Sweep GER40+US500, Breaker Block GER40 inclus)', weeklySweepSymbols: WEEKLY_SWEEP_SYMBOLS, breakerBlockSymbols: BREAKER_BLOCK_SYMBOLS, dir });
  console.error(`  -> ${current.done.length}/${current.attempts.length} atteignent $500, médiane ${current.median ? Math.round(current.median) : '—'}j`);

  console.error('Running "combo prudent" (sans Weekly Sweep/US500 ni Breaker Block/GER40)...');
  const prudent = runPipeline({ comboLabel: 'Combo prudent (retire Weekly Sweep/US500 et Breaker Block/GER40)', weeklySweepSymbols: ['GER40'], breakerBlockSymbols: [], dir });
  console.error(`  -> ${prudent.done.length}/${prudent.attempts.length} atteignent $500, médiane ${prudent.median ? Math.round(prudent.median) : '—'}j`);

  const md = [];
  md.push('# FTMO 1-Step $25k -> premier retrait de $500, combo actuel de production (2026-09-16)');
  md.push('');
  md.push(
    "Esdras : \"Mon objectif now est de faire un retrait de 500$, donne moi un plan detaille... et mes chances de le " +
      "faire.\" Même méthode que le script du 12 septembre (voir HANDOFF.md), refaite avec le combo RÉEL " +
      `d'aujourd'hui (6 mécanismes, historique CSV étendu à 15-17 ans) et ${current.attempts.length} points de départ ` +
      `espacés de ${START_POINT_SPACING_DAYS} jours plutôt que 30 (plus dense, plus de résolution statistique).`
  );
  md.push('');
  md.push(fmtResult(current));
  md.push('');
  md.push(fmtResult(prudent));
  md.push('');
  md.push('## Verdict');
  md.push('');
  const betterMedian = (prudent.median ?? Infinity) < (current.median ?? Infinity);
  md.push(
    `Comparaison directe : combo actuel médiane ${current.median ? Math.round(current.median) : '—'}j vs combo prudent ` +
      `${prudent.median ? Math.round(prudent.median) : '—'}j. ${betterMedian
        ? "Le combo prudent est plus rapide EN PLUS d'être plus fiable (moins de busts en cours de route, comme trouvé " +
          "dans la recherche FundingPips de ce matin) - retirer Weekly Sweep/US500 et Breaker Block/GER40 aide sur FTMO aussi, pas seulement sur FundingPips."
        : "Le combo actuel reste plus rapide malgré le risque de bust journalier plus élevé - le volume de trades " +
          "supplémentaire compense en pratique sur les points de départ testés."} ` +
      "Rien codé dans `src/` - recherche/planification seulement."
  );

  const outMd = path.join(dir, 'ftmo-25k-first-payout-full-combo-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
