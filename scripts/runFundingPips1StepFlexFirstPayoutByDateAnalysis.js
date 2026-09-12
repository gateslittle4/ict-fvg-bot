#!/usr/bin/env node
// runFundingPips1StepFlexFirstPayoutByDateAnalysis.js
// Usage: node scripts/runFundingPips1StepFlexFirstPayoutByDateAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12): "pourquoi t'aimes autant le FTMO et non le
// FundingPips ou GoatFundedTrader?" -> "teste FundingPips 1-Step Flex."
// Direct same-methodology counterpart to
// runFtmo25kFirstPayoutByDateAnalysis.js - same pipeline (buy a $25k
// challenge -> pass it, rebuying immediately on any bust -> go live ->
// accumulate real net profit -> first payout eligible -> money in hand),
// same 98 historical starting points, same $500 target - but with
// FundingPips 1-Step Flex's OWN real rules instead of FTMO's, so the two
// reports are directly comparable.
//
// RULES SOURCED 2026-09-12 (see propFirms/fundingPips.js's own comment for
// full citations and the ⚠️ ambiguity flagged there) - direct fetches of
// fundingpips.com/help.fundingpips.com were blocked (429 then 403) both
// times researched this project, so everything below is from search-engine
// snippets of FundingPips' own pages, not a primary render:
//   - Target +12%, daily loss 3%, max drawdown 12% STATIC (never moves,
//     unlike FTMO's trailing-eod - the exact structural difference Esdras
//     asked about: does a floor that never rises actually help here?).
//   - Profit split 85% flat, bi-weekly cycle - first payout needs >= 1% of
//     account size in profit (much lower bar than FTMO's implicit ~2.2% of
//     $25k for a $500 net payout) - modeled here with the SAME >= $500 net
//     + minimum-cycle-length gate as the FTMO script, for a fair
//     apples-to-apples comparison (the 1% floor is never the binding
//     constraint once you're also requiring $500 net).
//   - A "trade idea" floating-loss rule with two DIFFERENT numbers found in
//     different sources (see propFirms/fundingPips.js) - modeled here using
//     the STRICTER reading (3% of a <$50k account, immediate hard breach)
//     as a real bust condition, with the LENIENT reading (1%, 4-strike
//     system) tracked informationally only (see the "strikes" column).
//
// ARCHITECTURE: identical to the FTMO script - one shared pass over the
// full timeline, 98 lightweight parallel account simulators.
//
// MODELING ASSUMPTIONS, stated explicitly (none silently guessed):
//   - Challenge risk 0.5%, live risk 0.3% - same defaults as every other
//     script this session, for comparability with the FTMO result.
//   - FundingPips' own maxDrawdownPct/Type (12%, static) and
//     dailyLossLimitPct (3%) read directly from propFirms/fundingPips.js,
//     used for BOTH the challenge and the live/funded stage - search
//     results describe the 12% static loss as applying "on the funded
//     account" explicitly, so this is a better-supported assumption than
//     the equivalent one in the FTMO script, but still not a primary-page
//     confirmation.
//   - On a challenge bust: immediately buy a new $25k challenge (Flex has
//     no time limit or minimum trading days) and keep going.
//   - On a live bust (either the 12% static floor OR the strict 3%
//     trade-idea rule): modeled as losing the funded account and starting
//     a fresh challenge - the elapsed-day counter is not reset.
//   - Payout eligibility requires BOTH >= $500 NET (85% split) profit AND
//     >= 14 calendar days since the first live trade (matching the
//     bi-weekly cycle) - whichever is later. +3 calendar days for
//     processing ("processed every Tuesday, 1-3 business days").
//   - The 85% split applies to the account's current profit above the
//     funded starting balance at any moment, not per-trade.

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
import { CONFIG } from '../src/config.js';
import { getPropFirmProgram } from '../src/propFirms/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_ACCOUNT_SIZE = 25000;
const CHALLENGE_RISK_PCT = 0.5; // matches config.js's ACCOUNT_MODE='challenge' default
const LIVE_RISK_PCT = 0.3; // matches config.js's ACCOUNT_MODE='live' default
const FIRST_PAYOUT_TARGET_USD = 500;
const START_POINT_SPACING_DAYS = 30;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FLEX = getPropFirmProgram('fundingpips-1step-flex');
const CHALLENGE_PHASE = FLEX.phases[0]; // targetPct=12, dailyLossLimitPct=3, maxDrawdownPct=12, maxDrawdownType='static'
const PROFIT_SPLIT = FLEX.profitSplit; // 0.85
const PAYOUT_MIN_HOLD_DAYS = FLEX.payoutCycleDays; // 14 - bi-weekly, sourced 2026-09-12
const PAYOUT_PROCESSING_DAYS = FLEX.payoutProcessingDays; // 3 - "processed every Tuesday, 1-3 business days"
// The trade-idea floating-loss rule (see propFirms/fundingPips.js's ⚠️
// comment for the full ambiguity) - strict reading used as a real bust
// condition (this account size, $25k, is under the $50k breakpoint), the
// lenient reading tracked informationally only (strikes, not a bust here).
const STRICT_TRADE_IDEA_PCT = FLEX.tradeIdeaFloatingLossRule.strictThresholdPct; // 3
const LENIENT_TRADE_IDEA_PCT = FLEX.tradeIdeaFloatingLossRule.lenientThresholdPct; // 1

const FVG_SYMBOLS = Object.keys(CONFIG.fvg.perSymbol);
const DIV_PAIR = CONFIG.divergence.pair;
const NWOG_SYMBOLS = CONFIG.nwog.symbols;
const JUDAS_SYMBOLS = CONFIG.judasSwing.symbols;
const ALL_SYMBOLS = [...new Set([...FVG_SYMBOLS, ...DIV_PAIR, ...NWOG_SYMBOLS, ...JUDAS_SYMBOLS])];

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

function makeDivIndex(divergenceCandidatesFull) {
  const bySymbol = new Map();
  for (const symbol of DIV_PAIR) bySymbol.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) bySymbol.get(cand.symbol).set(cand.entryTime, cand);
  return bySymbol;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

function newGuardrail(phase, startTime, balance) {
  const g = new GuardrailEngine({
    maxTradesPerDay: CONFIG.guardrails.maxTradesPerDay,
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
  constructor(startTime) {
    this.originalStartTime = startTime;
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    this.openPositions = {}; for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', startTime, this.balance);
    this.liveStartTime = null;
    this.reAttempts = 1; // challenge sub-attempts (initial buy + any rebuys)
    this.liveBustCount = 0;
    this.tradeIdeaBustCount = 0; // strict 3% trade-idea breaches that caused a reset
    this.lenientStrikes = 0; // informational only - lenient 1% reading, never resets, not enforced here
    this.doneTime = null;
    this.totalDays = null;
  }
  riskPct() { return this.phase === 'challenge' ? CHALLENGE_RISK_PCT : LIVE_RISK_PCT; }
  resetToFreshChallenge(now) {
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', now, this.balance);
    this.reAttempts++;
  }
  transitionToLive(now) {
    this.phase = 'live';
    this.balance = CHALLENGE_ACCOUNT_SIZE; // funded account starts fresh, not at the challenge's ending balance
    for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.liveStartTime = now;
    this.guardrail = newGuardrail('live', now, this.balance);
  }
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFundingPips1StepFlexFirstPayoutByDateAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) candlesBySymbolFull[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;

  const divergenceCandidatesFull = makeDivIndex(computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500));
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);

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
  for (let t = datasetStart; t < datasetEnd; t += START_POINT_SPACING_DAYS * DAY_MS) attempts.push(new Attempt(t));
  console.error(`${attempts.length} start points, every ${START_POINT_SPACING_DAYS} days, from ${fmtDate(datasetStart)} to ${fmtDate(datasetEnd)}`);

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

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    // 1) Resolve closes + phase transitions, per active attempt.
    for (const attempt of attempts) {
      if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
      const open = attempt.openPositions[symbol];
      if (open && candle.time > open.entryTime) {
        const bullish = open.direction === 'bullish';
        const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
        const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
        const timedOut = i - open.entryIndex >= open.maxHoldingCandles;

        // "Trade idea" floating-loss check (see propFirms/fundingPips.js) -
        // THIS position's own worst-in-candle excursion, as % of balance
        // (not summed across symbols - each instrument+direction is its
        // own "idea" per the source). Checked even on the candle a stop
        // hits, using the same worst-case-within-the-candle convention
        // used everywhere else, capped at -1R once a stop is confirmed.
        let worstR = bullish ? (candle.low - open.entryPrice) / open.distance : (open.entryPrice - candle.high) / open.distance;
        if (hitStop) worstR = Math.max(worstR, -1);
        const floatingLossPct = worstR < 0 ? -worstR * open.riskAmount / attempt.balance * 100 : 0;
        if (floatingLossPct >= LENIENT_TRADE_IDEA_PCT) attempt.lenientStrikes++;
        const strictTradeIdeaBreach = floatingLossPct >= STRICT_TRADE_IDEA_PCT;

        if (hitStop || hitTarget || timedOut || strictTradeIdeaBreach) {
          let legR, outcome;
          if (strictTradeIdeaBreach && !hitStop) { legR = worstR; outcome = 'trade-idea-breach'; }
          else if (hitStop) { legR = -1; outcome = 'loss'; }
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
            if (strictTradeIdeaBreach) {
              attempt.tradeIdeaBustCount++;
              attempt.resetToFreshChallenge(candle.time);
            } else if (status.overallDrawdownBreached) {
              attempt.resetToFreshChallenge(candle.time);
            } else if (attempt.balance >= CHALLENGE_ACCOUNT_SIZE * (1 + CHALLENGE_PHASE.targetPct / 100)) {
              attempt.transitionToLive(candle.time);
            }
          } else if (attempt.phase === 'live') {
            if (strictTradeIdeaBreach) {
              attempt.tradeIdeaBustCount++;
              attempt.liveBustCount++;
              attempt.resetToFreshChallenge(candle.time);
            } else if (status.overallDrawdownBreached) {
              attempt.liveBustCount++;
              attempt.resetToFreshChallenge(candle.time);
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

    // 2) Shared signal computation (once per candle), then let each eligible attempt decide to open.
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
      const cand = nwogCandidatesFull.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
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
  }

  // Results.
  const done = attempts.filter((a) => a.phase === 'done');
  const censored = attempts.filter((a) => a.phase !== 'done');
  const days = done.map((a) => a.totalDays).sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)] : null;
  const mean = days.length ? days.reduce((s, d) => s + d, 0) / days.length : null;

  const TODAY = Date.parse('2026-09-12T00:00:00Z');
  const DEADLINE_DAYS = Math.round((Date.parse('2026-12-01T00:00:00Z') - TODAY) / DAY_MS);
  const within = (n) => done.filter((a) => a.totalDays <= n).length;
  // Esdras (follow-up): "et si on compte début janvier alors?" - same
  // distribution, compared against a later candidate deadline too.
  const JAN_DEADLINE_DAYS = Math.round((Date.parse('2027-01-05T00:00:00Z') - TODAY) / DAY_MS);

  const totalTradeIdeaBusts = done.concat(censored).reduce((s, a) => s + a.tradeIdeaBustCount, 0);
  const totalLiveBusts = done.concat(censored).reduce((s, a) => s + a.liveBustCount, 0);
  const totalStrikesPeak = Math.max(0, ...attempts.map((a) => a.lenientStrikes));

  const md = [];
  md.push('# FundingPips 1-Step Flex $25k → premier retrait de $500 — comparaison directe avec FTMO');
  md.push('');
  md.push(
    "Esdras : \"pourquoi t'aimes autant le FTMO et non le FundingPips ou GoatFundedTrader?\" -> \"teste FundingPips " +
      "1-Step Flex.\" Exactement la même méthode que `ftmo-25k-first-payout-by-date-analysis.md` (98 points de " +
      "départ historiques, même pipeline challenge->live->retrait, même cible $500), mais avec les vraies règles " +
      "FundingPips Flex au lieu de FTMO : cible +12%, perte quotidienne 3%, perte totale **12% STATIQUE** (le " +
      "plancher ne bouge JAMAIS, contrairement au trailing fin-de-journée de FTMO - la différence structurelle que " +
      "tu m'avais fait remarquer), split 85% (nouvellement confirmé), premier retrait dès 1% de profit + cycle " +
      "bi-hebdomadaire + ~3 jours de traitement.\n\n" +
      "⚠️ **Une règle avec un chiffre AMBIGU, trouvée dans deux sources différentes non réconciliées** (voir " +
      "`src/propFirms/fundingPips.js` pour le détail complet) : une perte flottante sur \"une idée de trade\" " +
      "(un instrument+sens, ou toute ré-entrée dans les 10 minutes après une perte) - une source dit 3%" +
      "(<$50k)/2%(≥$50k) = rupture immédiate, une autre dit 1% = avertissement, 4 avertissements cumulés (jamais " +
      "remis à zéro) = rupture, le 2e avertissement coupe le split en deux. Modélisé ici avec la lecture STRICTE " +
      "(3%, rupture immédiate) comme vraie cause de bust ; la lecture souple (1%) est seulement comptée en info " +
      "(colonne \"avertissements\"), pas appliquée comme bust ici. **Accès direct à fundingpips.com/" +
      "help.fundingpips.com bloqué (429 puis 403) les deux fois où ce projet a essayé** - à reconfirmer avant " +
      "d'engager du capital réel."
  );
  md.push('');
  md.push(`**Résultat : sur ${attempts.length} points de départ testés, ${done.length} ont atteint un premier retrait de $500 dans les données disponibles (${censored.length} n'ont pas eu assez de données restantes pour conclure).**`);
  md.push('');
  md.push(`- Médiane : **${median !== null ? Math.round(median) + ' jours' : '—'}**`);
  md.push(`- Moyenne : ${mean !== null ? Math.round(mean) + ' jours' : '—'}`);
  md.push(`- Plus rapide : ${days.length ? Math.round(days[0]) + ' jours' : '—'}`);
  md.push(`- Plus lent (parmi ceux qui ont fini) : ${days.length ? Math.round(days[days.length - 1]) + ' jours' : '—'}`);
  md.push(`- Busts causés par la règle stricte de perte flottante par "idée de trade" (3%) : **${totalTradeIdeaBusts}** sur l'ensemble des tentatives (challenge + live confondus)`);
  md.push(`- Busts en phase LIVE (compte financé perdu, toutes causes) : ${totalLiveBusts}`);
  md.push(`- Avertissements cumulés (lecture souple 1%) - le plus haut atteint par une seule tentative : ${totalStrikesPeak} (seuil de rupture : 4)`);
  md.push('');
  md.push(`## La question directe : le 1er décembre (${DEADLINE_DAYS}j) vs début janvier (${JAN_DEADLINE_DAYS}j), à partir d'aujourd'hui (12 sept. 2026)`);
  md.push('');
  md.push('| Seuil (jours) | Date approximative | % des points de départ qui y arrivent |');
  md.push('|---|---|---|');
  const namedThresholds = [
    [30, null], [45, null], [60, null], [DEADLINE_DAYS, '1er décembre'], [90, null],
    [JAN_DEADLINE_DAYS, 'début janvier (5 jan.)'], [120, null], [150, null],
  ];
  for (const [n, label] of namedThresholds) {
    const pctWithin = attempts.length ? ((within(n) / attempts.length) * 100).toFixed(0) : '—';
    md.push(`| ${n} | ${label ?? '—'} | ${pctWithin}% |`);
  }
  md.push('');
  const pctDeadline = attempts.length ? ((within(DEADLINE_DAYS) / attempts.length) * 100).toFixed(0) : '0';
  const pctJan = attempts.length ? ((within(JAN_DEADLINE_DAYS) / attempts.length) * 100).toFixed(0) : '0';
  md.push(
    `**1er décembre : ~${pctDeadline}% des points de départ testés y arrivent.** ` +
      `**Début janvier (${JAN_DEADLINE_DAYS} jours au total) : ~${pctJan}%.** ` +
      "Comparer directement avec `ftmo-25k-first-payout-by-date-analysis.md` (41% / 67% pour FTMO sur les mêmes " +
      "seuils, mêmes 98 points de départ, même méthode) - voir le tableau de synthèse ci-dessous pour la lecture " +
      "côte à côte."
  );
  md.push('');
  md.push('## FTMO vs FundingPips Flex, côte à côte (mêmes 98 points de départ, même cible $500)');
  md.push('');
  md.push('| | FTMO 1-Step $25k | FundingPips 1-Step Flex $25k |');
  md.push('|---|---|---|');
  md.push('| Cible challenge | +10% | +12% |');
  md.push('| Perte totale | 10%, trailing fin de journée | 12%, **statique (ne bouge jamais)** |');
  md.push('| Split | 90% | 85% |');
  md.push(`| % qui atteint $500 net d'ici le 1er décembre | 41% | ${pctDeadline}% |`);
  md.push(`| % qui atteint $500 net d'ici début janvier | 67% | ${pctJan}% |`);
  md.push(`| Médiane (jours) | 92 | ${median !== null ? Math.round(median) : '—'} |`);
  md.push('');
  md.push(
    Number(pctDeadline) > 41
      ? "**Sur cette mesure précise, FundingPips Flex fait mieux que FTMO** - la cible plus haute (+12% contre " +
        "+10%) coûte un peu de vitesse en challenge, mais le plancher STATIQUE (qui ne monte jamais avec les " +
        "gains, contrairement au trailing de FTMO) laisse plus de marge une fois en profit, ce qui compense."
      : "**Sur cette mesure précise, FTMO garde l'avantage** - malgré le plancher statique plus indulgent en " +
        "théorie, la cible plus haute (+12% contre +10%) et le split plus faible (85% contre 90%) pèsent plus " +
        "lourd dans le calcul du temps total jusqu'à $500 net en main."
  );
  md.push('');
  md.push('## Ce qui améliore concrètement les chances de tenir la date');
  md.push('');
  md.push(
    "1. **Acheter le challenge AUJOURD'HUI** - chaque jour de retard mange directement dans la marge disponible.\n" +
      "2. **Ne jamais laisser un bust de challenge traîner** - racheter immédiatement (mêmes réglages 0.5%/0.3% " +
      "que pour FTMO).\n" +
      "3. **Demander le premier retrait dès l'éligibilité, même si c'est moins de $500** - le seuil FundingPips " +
      "(1% de profit) est plus bas que celui de FTMO, donc éligible plus tôt en théorie.\n" +
      "4. **Vérifier la vraie règle de perte flottante par idée de trade AVANT d'acheter** - c'est la seule " +
      "inconnue réelle de cette analyse (voir l'avertissement en tête de rapport). Le reste des chiffres est " +
      "cohérent entre plusieurs sources."
  );
  md.push('');
  md.push(
    "**Rien codé dans `src/`** au-delà du profil `FUNDINGPIPS_1STEP_FLEX` déjà mis à jour dans `src/propFirms/` " +
      "(documentaire) - script de recherche/planification seulement."
  );

  const outMd = path.join(dir, 'fundingpips-1step-flex-first-payout-by-date-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`Done: ${done.length}/${attempts.length}, censored: ${censored.length}, median: ${median ? Math.round(median) : '—'}j, within ${DEADLINE_DAYS}j (déc.): ${pctDeadline}%, within ${JAN_DEADLINE_DAYS}j (jan.): ${pctJan}%, tradeIdeaBusts: ${totalTradeIdeaBusts}, liveBusts: ${totalLiveBusts}`);
}

main();
