#!/usr/bin/env node
// runOrbStrategyAnalysis.js
// Usage: node scripts/runOrbStrategyAnalysis.js <dir-with-csvs>
//
// A THIRD genuinely different, non-ICT, well-documented edge, chosen this
// time specifically to be COMPATIBLE with strict same-instrument netting -
// unlike Turtle (median hold 21-25 days, which crowded out Divergence
// under the one-position-per-instrument rule, see
// three-strategy-two-pairs-account-impact.md), this one is a same-day
// intraday breakout, closed out before the NY cash session ends:
//
// Opening Range Breakout (ORB) - one of the oldest documented systematic
// day-trading patterns (Toby Crabel's work in the early 1990s; still
// widely used today). Mechanism:
//   1. The "opening range" = the high/low of the first 30 minutes after
//      the NY cash equities open (09:30-10:00 NY time) - a DIFFERENT
//      time-of-day window than FVG's Silver Bullet (10:00-11:00), so the
//      two rarely compete for the exact same minutes.
//   2. Watch for a breakout of that range any time from 10:00 to 15:45 NY
//      time (last chance before the 16:00 close) - first candle whose
//      high/low pierces the range triggers ONE trade for the day (long
//      checked first if both sides would trigger the same candle, a rare
//      gap case).
//   3. Entry fill = max(candle.open, rangeHigh) for a long breakout (or
//      the mirror for a short) - resting stop-order convention, same as
//      the Turtle/FVG code elsewhere in this project.
//   4. Stop = the OPPOSITE side of the opening range itself (the classic
//      ORB stop placement - no ATR needed, the range defines its own
//      risk). Target = fixed 1:3 R:R, same convention as FVG/Divergence,
//      for a fair expectancy comparison.
//   5. Forced close at the NY 16:00 cash close if neither stop nor target
//      has been hit - genuinely a DAY trade, holding period measured in
//      hours, not weeks (this is the deliberate fix for the crowding
//      problem Turtle caused).
//
// No-lookahead: the range is fully formed (09:30-10:00) before any
// breakout candle (>=10:00) is evaluated against it - never uses same-bar
// or future information.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { toRealNyHourMinute } from '../src/backtest/nySession.js';
import { computeEMA } from '../src/backtest/htfBias.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const RANGE_START_HOUR = 9.5; // 09:30 NY
const RANGE_END_HOUR = 10.0; // 10:00 NY - range = candles in [09:30, 10:00)
const BREAKOUT_CUTOFF_HOUR = 15.75; // 15:45 NY - last candle allowed to trigger a NEW entry
const FORCE_CLOSE_HOUR = 16.0; // 16:00 NY cash close - force-exit whatever is still open
const RR_MULTIPLE = 3;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500'];

const nyDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const FIXED_EST_TO_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
function nyDateKey(histDataTimeMs) {
  return nyDateFormatter.format(new Date(histDataTimeMs + FIXED_EST_TO_UTC_OFFSET_MS)); // 'YYYY-MM-DD' in real NY calendar day
}
function decimalNyHour(histDataTimeMs) {
  const { hour, minute } = toRealNyHourMinute(histDataTimeMs);
  return hour + minute / 60;
}

/**
 * Builds one row per NY calendar day (dateKey, close = last candle's close that day) and a
 * trend-bias map keyed by dateKey: 'up'/'down' based on the PRIOR day's close vs the PRIOR day's
 * EMA(50) of daily closes - deliberately using yesterday's fully-formed values only, so today's
 * bias is knowable before today's own candles exist (no lookahead). A standard, textbook ORB
 * refinement (trade only with the daily trend) - decided up front, not tuned by peeking at test
 * results, to avoid the same data-snooping trap as the rejected Friday-exclusion finding.
 */
function computeDailyTrendBias(candles) {
  const dayCloses = []; // in chronological order
  const dayKeys = [];
  let lastKey = null;
  for (const c of candles) {
    const key = nyDateKey(c.time);
    if (key !== lastKey) {
      dayKeys.push(key);
      dayCloses.push(c.close);
      lastKey = key;
    } else {
      dayCloses[dayCloses.length - 1] = c.close;
    }
  }
  const ema50 = computeEMA(dayCloses, 50);
  const biasByDay = new Map();
  for (let i = 1; i < dayKeys.length; i++) {
    if (ema50[i - 1] === null) continue;
    biasByDay.set(dayKeys[i], dayCloses[i - 1] > ema50[i - 1] ? 'up' : dayCloses[i - 1] < ema50[i - 1] ? 'down' : null);
  }
  return biasByDay;
}

/**
 * @param {Map<string,string>|null} trendBiasByDay - optional dateKey -> 'up'/'down' filter; when
 *   provided, longs only fire on 'up' days and shorts only on 'down' days (no trade on a day with
 *   no bias yet, e.g. the first ~50 days of history).
 * @returns {Array} raw (pre-cost) trades: {symbol, direction, entryTime, entryPrice, stopPrice, distance, exitTime, exitPrice, outcome, rMultiple}
 */
function runOrbBacktest(candles, trendBiasByDay = null) {
  const trades = [];
  let currentDay = null; // nyDateKey of the day currently being tracked
  let rangeHigh = null;
  let rangeLow = null;
  let rangeReady = false; // true once the 09:30-10:00 window has fully passed for currentDay
  let dayTradeTaken = false; // one ORB trade max per day
  let open = null; // {direction, entryTime, entryPrice, stopPrice, targetPrice, distance}

  for (const candle of candles) {
    const dayKey = nyDateKey(candle.time);
    const nyHour = decimalNyHour(candle.time);

    if (dayKey !== currentDay) {
      // New NY calendar day. The normal path force-closes any open position when its own day's
      // candle crosses FORCE_CLOSE_HOUR (below) - this only fires here as a rare-gap safety net,
      // if the data happened to skip straight over 16:00 NY without a candle to trigger that check.
      if (open) {
        const bullish = open.direction === 'bullish';
        const signedMove = bullish ? candle.open - open.entryPrice : open.entryPrice - candle.open;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitTime: candle.time, exitPrice: candle.open, outcome: rMultiple > 0 ? 'win' : 'loss', rMultiple });
        open = null;
      }
      currentDay = dayKey;
      rangeHigh = null;
      rangeLow = null;
      rangeReady = false;
      dayTradeTaken = false;
    }

    // 1) Resolve an open position using this candle (never the entry candle itself).
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const forceClose = nyHour >= FORCE_CLOSE_HOUR;
      if (hitStop || hitTarget || forceClose) {
        let exitPrice, outcome;
        if (hitStop) { exitPrice = open.stopPrice; outcome = 'loss'; }
        else if (hitTarget) { exitPrice = open.targetPrice; outcome = 'win'; }
        else { exitPrice = candle.close; outcome = null; } // classified below by realized R sign
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        if (outcome === null) outcome = rMultiple > 0 ? 'win' : 'loss';
        trades.push({ ...open, exitTime: candle.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    // 2) Build the opening range from candles inside [09:30, 10:00) NY.
    if (nyHour >= RANGE_START_HOUR && nyHour < RANGE_END_HOUR) {
      rangeHigh = rangeHigh === null ? candle.high : Math.max(rangeHigh, candle.high);
      rangeLow = rangeLow === null ? candle.low : Math.min(rangeLow, candle.low);
    } else if (nyHour >= RANGE_END_HOUR) {
      rangeReady = rangeHigh !== null && rangeLow !== null;
    }

    // 3) Look for a breakout entry (range ready, within the watch window, no position/trade yet today).
    const bias = trendBiasByDay ? trendBiasByDay.get(dayKey) : undefined; // undefined = no filter applied
    if (rangeReady && !open && !dayTradeTaken && nyHour >= RANGE_END_HOUR && nyHour < BREAKOUT_CUTOFF_HOUR) {
      if (candle.high >= rangeHigh && (trendBiasByDay ? bias === 'up' : true)) {
        const entryPrice = Math.max(candle.open, rangeHigh);
        const distance = entryPrice - rangeLow;
        if (distance > 0) {
          open = { symbol: undefined, direction: 'bullish', entryTime: candle.time, entryPrice, stopPrice: rangeLow, targetPrice: entryPrice + RR_MULTIPLE * distance, distance };
          dayTradeTaken = true;
        }
      } else if (candle.low <= rangeLow && (trendBiasByDay ? bias === 'down' : true)) {
        const entryPrice = Math.min(candle.open, rangeLow);
        const distance = rangeHigh - entryPrice;
        if (distance > 0) {
          open = { symbol: undefined, direction: 'bearish', entryTime: candle.time, entryPrice, stopPrice: rangeHigh, targetPrice: entryPrice - RR_MULTIPLE * distance, distance };
          dayTradeTaken = true;
        }
      }
    }
  }
  return trades;
}

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  const net = viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
  return { net, droppedAsNonViable: trades.length - viable.length };
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp) {
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runOrbStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT #2 : Opening Range Breakout (ORB), intraday');
  md.push('');
  md.push(
    "⚠ Choisie spécifiquement pour être COMPATIBLE avec le netting strict (contrairement à Turtle, qui bloquait " +
      "Divergence ~46% du temps à cause de positions tenues des semaines - voir three-strategy-two-pairs-account-" +
      "impact.md). Range = haut/bas des 30 premières minutes après l'ouverture NY (09h30-10h00, différent du " +
      "Silver Bullet 10h-11h du FVG). Cassure surveillée de 10h00 à 15h45, stop = côté opposé du range, cible " +
      "1:3, clôture forcée à 16h00 (heure NY) si ni stop ni cible atteints - une vraie position intraday, quelques " +
      "heures maximum. Un seul trade par jour par instrument. Écran TRAIN (2019-2023) / vérification TEST " +
      "(2024-2025), même règle de verdict que partout ailleurs. Deux variantes testées : brute, et avec un filtre " +
      "de tendance standard (achat seulement si la clôture de la veille est au-dessus de l'EMA50 quotidienne, " +
      "vente seulement si en-dessous) - un raffinement classique de manuel, décidé AVANT de regarder les résultats " +
      "test, pas ajusté après coup comme l'exclusion du vendredi rejetée plus tôt dans ce projet."
  );
  md.push('');
  md.push('| Symbole | Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const trendBiasByDay = computeDailyTrendBias(candles); // one bias map over the FULL history - each day only ever looks at its own past, so no train/test leakage

    for (const [label, biasArg] of [['brut (sans filtre)', null], ['+ filtre tendance (EMA50 quotidien)', trendBiasByDay]]) {
      const trainTrades = runOrbBacktest(trainCandles, biasArg);
      const testTrades = runOrbBacktest(testCandles, biasArg);
      const { net: trainNet } = withCosts(trainTrades, symbol);
      const { net: testNet } = withCosts(testTrades, symbol);
      const ts = summarizeTrades(trainNet);
      const es = summarizeTrades(testNet);
      const v = verdict(ts.expectancyR, es.expectancyR);

      md.push(`| ${symbol} | ${label} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
      console.error(`[${symbol} / ${label}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'orb-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
