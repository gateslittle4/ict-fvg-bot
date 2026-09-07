#!/usr/bin/env node
// checkVolatilityRegimeImpactFullCombo.js
// Usage: node scripts/checkVolatilityRegimeImpactFullCombo.js <dir-with-csvs>
//
// Before building an ATR-based (volatility) position-sizing scheme, check
// the premise it would depend on: does this combo's expectancy/win-rate
// actually differ by how volatile the INSTRUMENT currently is, relative to
// its own recent normal? If not, scaling risk by volatility would just add
// variance to a signal that doesn't care about the current vol regime -
// same "check the premise before building on it" discipline already used
// for the streak-based risk ladder (checkOutcomeSerialCorrelation*.js) and
// for the bull/bear/range regime split (runMarketRegimeAnalysis.js).
//
// Volatility regime classification (daily bars, a-priori STANDARD
// convention, NOT tuned on this project's data - same discipline as every
// other threshold in this project):
//   - Daily ATR(14) (simple average - same convention as computeAtrSeries
//     used everywhere else in this project, not Wilder-smoothed).
//   - Reference = SMA(100) of that same daily ATR series - reusing the
//     SAME lookback (100) already used elsewhere in this project (the
//     bull/bear/range SMA regime filter, and Divergence's z-score
//     lookback) rather than inventing a new number.
//   - volRatio = ATR14[today] / SMA100(ATR14)[today].
//   - volRatio < 0.8 -> 'low' (unusually quiet), 0.8-1.5 -> 'normal',
//     > 1.5 -> 'high' (unusually volatile) - round multiples decided
//     before looking at any result, same spirit as the ADX=25 textbook
//     threshold already used in this project.
//
// No-lookahead tagging: every trade in the REAL combo (FVG US100+US500+
// XAUUSD + Divergence US100/US500, exact netting as production) is tagged
// with ITS OWN INSTRUMENT's volatility regime as of the last FULLY-CLOSED
// daily bar strictly before its entry time - never the still-forming day.
//
// Descriptive, not a fresh parameter search: run on the full 2019-2025
// sample per (symbol, regime) bucket, with a train/test split shown too for
// robustness - same reporting shape as runMarketRegimeAnalysis.js.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { computeZScoreSeries, alignByTime } from '../src/backtest/correlation.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

const ATR_PERIOD = 14;
const ATR_REF_SMA_PERIOD = 100; // same lookback already used for the SMA regime filter / Divergence z-score
const VOL_LOW_THRESHOLD = 0.8;
const VOL_HIGH_THRESHOLD = 1.5;

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_M15_CANDLES = 480;

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

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

/** @returns {Array<'low'|'normal'|'high'|null>} volatility regime per daily bar */
function classifyVolatilitySeries(daily) {
  const atr = computeAtrSeries(daily, ATR_PERIOD);
  const atrValues = atr.map((v) => v ?? 0);
  const atrSma = computeSma(atrValues, ATR_REF_SMA_PERIOD);
  const regime = new Array(daily.length).fill(null);
  for (let i = 0; i < daily.length; i++) {
    if (atr[i] === null || atrSma[i] === null || atrSma[i] === 0) continue;
    const ratio = atr[i] / atrSma[i];
    regime[i] = ratio < VOL_LOW_THRESHOLD ? 'low' : ratio > VOL_HIGH_THRESHOLD ? 'high' : 'normal';
  }
  return regime;
}

/** Same no-lookahead binary-search lookup pattern as runMarketRegimeAnalysis.js's makeRegimeLookup. */
function makeRegimeLookup(daily, regime) {
  return (entryTime) => {
    let lo = 0, hi = daily.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (daily[mid].time + DAY_MS <= entryTime) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? regime[ans] : null;
  };
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
      if (atr && atr > 0) candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: 1.5 * atr });
    }
    wasExtended = extended;
  }
  return candidates;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/checkVolatilityRegimeImpactFullCombo.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15BySymbol = {};
  const dailyBySymbol = {};
  const volRegimeLookupBySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15BySymbol[symbol] = candles;
    const daily = resampleCandles(candles, DAY_MS);
    dailyBySymbol[symbol] = daily;
    const regime = classifyVolatilitySeries(daily);
    volRegimeLookupBySymbol[symbol] = makeRegimeLookup(daily, regime);
  }

  const divergenceCandidatesFull = computeDivergenceCandidates(m15BySymbol.US100, m15BySymbol.US500);
  const divCandidatesByTime = new Map();
  for (const symbol of ['US100', 'US500']) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  const timeline = [];
  for (const symbol of FVG_SYMBOLS) {
    for (const candle of m15BySymbol[symbol]) timeline.push({ symbol, candle });
  }
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));
  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  let balance = STARTING_BALANCE;
  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  const closedTrades = []; // { symbol, entryTime, exitTime, outcome, rMultiple }

  const resolveClose = (symbol, netR, entryTime, exitTime, riskAmount, outcome) => {
    balance += riskAmount * netR;
    guardrail.recordTrade({ pnl: riskAmount * netR, time: exitTime, balanceAfter: balance });
    closedTrades.push({ symbol, entryTime, exitTime, outcome, rMultiple: netR });
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = FVG_CONFIG[symbol].spread ?? 0;

    const openF = openFvg[symbol];
    if (openF && candle.time > openF.entryTime) {
      const bullish = openF.direction === 'bullish';
      const hitStop = bullish ? candle.low <= openF.stopPrice : candle.high >= openF.stopPrice;
      const hitTarget = bullish ? candle.high >= openF.targetPrice : candle.low <= openF.targetPrice;
      const timedOut = i - openF.entryIndex >= 480;
      if (hitStop || hitTarget || timedOut) {
        let legR, outcome;
        if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = openF.rrMultiple; outcome = 'win'; }
        else {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - openF.entryPrice : openF.entryPrice - exitPrice;
          legR = signedMove / openF.distance;
          outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / openF.distance : 0;
        resolveClose(symbol, legR - costR, openF.entryTime, candle.time, STARTING_BALANCE * (RISK_PCT / 100), outcome);
        openFvg[symbol] = null;
      }
    }

    if (openDivergence && openDivergence.symbol === symbol && candle.time > openDivergence.entryTime) {
      const hitStop = candle.low <= openDivergence.stopPrice;
      const hitTarget = candle.high >= openDivergence.targetPrice;
      const timedOut = i - openDivergence.entryIndex >= DIV_MAX_HOLDING_M15_CANDLES;
      if (hitStop || hitTarget || timedOut) {
        let legR, outcome;
        if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = DIV_RR_MULTIPLE; outcome = 'win'; }
        else { legR = (candle.close - openDivergence.entryPrice) / openDivergence.distance; outcome = 'timeout'; }
        const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
        const costR = divSpread > 0 ? divSpread / openDivergence.distance : 0;
        resolveClose(symbol, legR - costR, openDivergence.entryTime, candle.time, STARTING_BALANCE * (RISK_PCT / 100), outcome);
        openDivergence = null;
      }
    }

    const events = engines[symbol].processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexBySymbol[symbol].set(e.id, i);
      } else if (e.type === 'validated' && !openFvg[symbol] && !(openDivergence && openDivergence.symbol === symbol)) {
        const c3Index = formationIndexBySymbol[symbol].get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: m15BySymbol[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
        if (!guardrail.canTakeNewTrade(candle.time)) continue;
        const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
        openFvg[symbol] = { direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple };
      }
    }

    const divMap = divCandidatesByTime.get(symbol);
    const cand = divMap ? divMap.get(candle.time) : undefined;
    if (cand && !openDivergence && !openFvg[symbol]) {
      const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
      const distance = cand.stopDistance;
      if ((!divSpread || distance >= divSpread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
        const entryPrice = candle.open;
        openDivergence = { symbol, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance };
      }
    }
  }

  // Tag every trade with its own instrument's vol regime as of entry.
  const tagged = closedTrades.map((t) => ({ ...t, regime: volRegimeLookupBySymbol[t.symbol](t.entryTime) }));

  function summarize(trades) {
    const resolved = trades.filter((t) => t.outcome !== 'timeout');
    const n = resolved.length;
    if (n === 0) return { n: 0, wr: null, avgR: null };
    const wins = resolved.filter((t) => t.rMultiple > 0).length;
    const avgR = resolved.reduce((s, t) => s + t.rMultiple, 0) / n;
    return { n, wr: wins / n, avgR };
  }

  console.log(`Trades combo complet: ${tagged.length} (${tagged.filter((t) => t.regime === null).length} sans régime assigné - warmup)`);
  console.log('\n=== Répartition par régime de volatilité (ATR14/SMA100(ATR14), échantillon complet 2019-2025) ===');
  for (const regime of ['low', 'normal', 'high']) {
    const subset = tagged.filter((t) => t.regime === regime);
    const s = summarize(subset);
    console.log(`${regime.padEnd(6)}: n=${s.n}, WR=${s.wr !== null ? (s.wr * 100).toFixed(1) + '%' : '—'}, espérance=${s.avgR !== null ? s.avgR.toFixed(2) + 'R' : '—'}`);
  }

  console.log('\n=== TRAIN (2019-2023) vs TEST (2024-2025), par régime ===');
  for (const regime of ['low', 'normal', 'high']) {
    const trainSubset = tagged.filter((t) => t.regime === regime && t.entryTime < TRAIN_CUTOFF);
    const testSubset = tagged.filter((t) => t.regime === regime && t.entryTime >= TRAIN_CUTOFF);
    const ts = summarize(trainSubset);
    const es = summarize(testSubset);
    console.log(`${regime.padEnd(6)}: TRAIN n=${ts.n} WR=${ts.wr !== null ? (ts.wr * 100).toFixed(1) + '%' : '—'} exp=${ts.avgR !== null ? ts.avgR.toFixed(2) + 'R' : '—'}  |  TEST n=${es.n} WR=${es.wr !== null ? (es.wr * 100).toFixed(1) + '%' : '—'} exp=${es.avgR !== null ? es.avgR.toFixed(2) + 'R' : '—'}`);
  }

  console.log('\n=== Par instrument (échantillon complet) ===');
  for (const symbol of FVG_SYMBOLS.concat(['US100-div', 'US500-div'])) {
    // symbol tag on Divergence trades is just US100/US500 too - split by outcome source not tracked here, so report combined per raw symbol below instead.
  }
  for (const symbol of [...new Set(tagged.map((t) => t.symbol))]) {
    console.log(`-- ${symbol} --`);
    for (const regime of ['low', 'normal', 'high']) {
      const subset = tagged.filter((t) => t.symbol === symbol && t.regime === regime);
      const s = summarize(subset);
      console.log(`  ${regime.padEnd(6)}: n=${s.n}, WR=${s.wr !== null ? (s.wr * 100).toFixed(1) + '%' : '—'}, espérance=${s.avgR !== null ? s.avgR.toFixed(2) + 'R' : '—'}`);
    }
  }
}

main();
