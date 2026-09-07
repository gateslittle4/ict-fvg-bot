#!/usr/bin/env node
// runBreakoutStrategyAnalysis.js
// Usage: node scripts/runBreakoutStrategyAnalysis.js <dir-with-csvs>
//
// Honest test of a NON-ICT edge with a real track record: classic Donchian
// channel breakout / trend-following, the "Turtle Trading" system
// (Richard Dennis, 1980s - one of the most publicly documented systematic
// strategies in retail trading history). Chosen specifically because it's
// a genuinely different mechanism from everything else in this project
// (FVG, divergence): no fixed 1:3 target, no session filter, no HTF bias -
// it just rides a trend until the trend itself reverses.
//
// To avoid repeating the "Friday exclusion" data-snooping mistake, the two
// parameter sets tested here (20/10 and 55/20 day channels, 2xATR stop) are
// the ORIGINAL published Turtle System 1 and System 2 settings - not tuned
// on our own data. If either "tient" on TEST, that's a real external edge,
// not something curve-fit to this specific history.
//
// Method (no-lookahead discipline, same as everywhere else in this project):
//   1. Resample M15 -> Daily (UTC day buckets) - classic trend-following
//      timeframe, letting winners run over many days/weeks.
//   2. Entry channel = highest high / lowest low of the PRIOR N days
//      (never including today). Breakout = today's high/low pierces it ->
//      filled at max(today's open, channel level) for longs (or the mirror
//      for shorts) - a resting stop-order fill, not a lookahead peek.
//   3. Initial stop = entry -/+ 2x ATR(20), where the ATR value used is
//      YESTERDAY's (computed through the prior day's close only) - the
//      stop distance is knowable at the moment the breakout order would
//      trigger, using no same-day information.
//   4. Exit = whichever comes first: the initial money-management stop, OR
//      an opposite M-day Donchian breakout (the classic "N-day exit",
//      M<N) - both computed the same no-lookahead way as the entry
//      channel. No fixed R:R target - this is the whole point of a
//      trend-following system (let winners run, cut losers fast).
//   5. One position at a time per symbol. R-multiple = realized move /
//      INITIAL stop distance (same convention as the rest of the project),
//      so it's directly comparable to FVG/divergence's R-multiples even
//      though the mechanism producing them is completely different.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same verdict
// rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const ATR_PERIOD = 20;
const STOP_ATR_MULTIPLE = 2;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MAX_HOLDING_DAYS = 250; // generous safety cap (~1 trading year) - not a real exit mechanic, just guards against a pathological infinite hold

// The two ORIGINAL published Turtle systems - picked before looking at our data, not tuned on it.
const SYSTEMS = [
  { name: 'Turtle System 1 (20j entrée / 10j sortie)', entryDays: 20, exitDays: 10 },
  { name: 'Turtle System 2 (55j entrée / 20j sortie)', entryDays: 55, exitDays: 20 },
];

const SYMBOLS = ['US100', 'US500', 'XAUUSD'];

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

/** Rolling max(high)/min(low) over the PRIOR `n` days only (excludes day i itself). */
function computeDonchianSeries(daily, n) {
  const highs = new Array(daily.length).fill(null);
  const lows = new Array(daily.length).fill(null);
  for (let i = n; i < daily.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n; j < i; j++) {
      hi = Math.max(hi, daily[j].high);
      lo = Math.min(lo, daily[j].low);
    }
    highs[i] = hi;
    lows[i] = lo;
  }
  return { highs, lows };
}

/** @returns {Array} raw (pre-cost) trades: {symbol, direction, entryIndex, entryTime, entryPrice, stopPrice, distance, exitIndex, exitTime, exitPrice, outcome, rMultiple} */
function runBreakoutBacktest(daily, { entryDays, exitDays }) {
  const atr = computeAtrSeries(daily, ATR_PERIOD);
  const entryCh = computeDonchianSeries(daily, entryDays);
  const exitCh = computeDonchianSeries(daily, exitDays);

  const trades = [];
  let open = null; // { direction, entryIndex, entryTime, entryPrice, stopPrice, distance }
  const startIdx = Math.max(entryDays, exitDays, ATR_PERIOD) + 1;

  for (let i = startIdx; i < daily.length; i++) {
    const day = daily[i];

    // 1) Resolve an open position using today's range (never the entry day itself).
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const exitLevel = bullish ? exitCh.lows[i] : exitCh.highs[i];
      const hitChannelExit = exitLevel !== null && (bullish ? day.low <= exitLevel : day.high >= exitLevel);
      const timedOut = i - open.entryIndex >= MAX_HOLDING_DAYS;
      if (hitStop || hitChannelExit || timedOut) {
        let exitPrice;
        if (hitStop) {
          exitPrice = open.stopPrice; // money-management stop checked first (matches the rest of the project's convention)
        } else if (hitChannelExit) {
          exitPrice = bullish ? Math.min(day.open, exitLevel) : Math.max(day.open, exitLevel);
        } else {
          exitPrice = day.close;
        }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        const outcome = rMultiple > 0 ? 'win' : 'loss';
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    // 2) Look for a new breakout entry (only if flat) - long checked first, matching the rest of the project's if/else-if convention.
    if (!open) {
      const entryHigh = entryCh.highs[i];
      const entryLow = entryCh.lows[i];
      const atrYesterday = atr[i - 1]; // yesterday's ATR only - no same-day information in the stop sizing
      if (entryHigh !== null && day.high >= entryHigh && atrYesterday > 0) {
        const entryPrice = Math.max(day.open, entryHigh);
        const distance = STOP_ATR_MULTIPLE * atrYesterday;
        open = { direction: 'bullish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, distance };
      } else if (entryLow !== null && day.low <= entryLow && atrYesterday > 0) {
        const entryPrice = Math.min(day.open, entryLow);
        const distance = STOP_ATR_MULTIPLE * atrYesterday;
        open = { direction: 'bearish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, distance };
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
    console.error('Usage: node scripts/runBreakoutStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT : breakout Donchian / suivi de tendance ("Turtle Trading")');
  md.push('');
  md.push(
    "⚠ Edge complètement différent, mécanique différente (pas de cible 1:3 fixe - sortie sur retournement de " +
      "canal ou stop initial 2xATR(20), ce qui vient en premier). Bougies journalières (regroupement UTC). Les " +
      "deux jeux de paramètres testés (20/10 et 55/20 jours) sont les réglages ORIGINAUX publiés du système Turtle " +
      "des années 1980 - pas ajustés sur nos propres données, pour éviter le piège du data-snooping déjà rencontré " +
      "dans ce projet (voir l'exclusion du vendredi, rejetée pour la même raison). Écran TRAIN (2019-2023) / " +
      "vérification TEST (2024-2025), même règle de verdict que partout ailleurs. XAUUSD n'a pas de données pour " +
      "2022 (zip source jamais fourni)."
  );
  md.push('');
  md.push(TABLE_HEADER());
  md.push(TABLE_SEP());

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);

    for (const system of SYSTEMS) {
      const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
      const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

      const trainTrades = runBreakoutBacktest(trainDaily, system);
      const testTrades = runBreakoutBacktest(testDaily, system);
      const { net: trainNet } = withCosts(trainTrades, symbol);
      const { net: testNet } = withCosts(testTrades, symbol);
      const ts = summarizeTrades(trainNet);
      const es = summarizeTrades(testNet);
      const v = verdict(ts.expectancyR, es.expectancyR);

      md.push(
        `| ${symbol} | ${system.name} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`
      );
      console.error(`[${symbol} / ${system.name}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'breakout-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

function TABLE_HEADER() {
  return '| Symbole | Système | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |';
}
function TABLE_SEP() {
  return '|---|---|---|---|---|---|---|---|---|---|---|';
}

main();
