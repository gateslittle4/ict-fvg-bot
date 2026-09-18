#!/usr/bin/env node
// Compare the existing H1 laggard mean-reversion divergence rules across
// candidate index pairs. Research only: never imported by the live engine.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeCorrelationMatrix } from '../src/backtest/correlation.js';

const TRAIN_CUTOFF = Date.parse('2024-01-01T00:00:00Z');
const PAIRS = [
  ['US100', 'US500'],
  ['US500', 'UKX'],
  ['UKX', 'AUX'],
  ['US100', 'UKX'],
];
const LOOKBACKS = [20, 50, 100];
const THRESHOLDS = [1.5, 2, 2.5];
const ATR_PERIOD = 14;
const RR_MULTIPLE = 3;
const MAX_HOLDING_H1 = 120;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

function alignByTime(a, b) {
  const bByTime = new Map(b.map((candle) => [candle.time, candle]));
  const alignedA = [], alignedB = [];
  for (const candle of a) {
    const match = bByTime.get(candle.time);
    if (match) { alignedA.push(candle); alignedB.push(match); }
  }
  return { alignedA, alignedB };
}

function atrSeries(candles) {
  const result = new Array(candles.length).fill(null);
  const trueRanges = [];
  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const previousClose = i ? candles[i - 1].close : candle.close;
    trueRanges.push(Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)));
    if (i >= ATR_PERIOD - 1) {
      result[i] = trueRanges.slice(i - ATR_PERIOD + 1, i + 1).reduce((sum, value) => sum + value, 0) / ATR_PERIOD;
    }
  }
  return result;
}

function zScores(values, lookback) {
  const result = new Array(values.length).fill(null);
  for (let i = lookback; i < values.length; i++) {
    const window = values.slice(i - lookback, i);
    const mean = window.reduce((sum, value) => sum + value, 0) / lookback;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lookback;
    const standardDeviation = Math.sqrt(variance);
    result[i] = standardDeviation > 0 ? (values[i] - mean) / standardDeviation : 0;
  }
  return result;
}

function runPair({ alignedA, alignedB, symbolA, symbolB, lookback, threshold }) {
  const ratio = alignedA.map((candle, i) => Math.log(candle.close) - Math.log(alignedB[i].close));
  const z = zScores(ratio, lookback);
  const atrA = atrSeries(alignedA), atrB = atrSeries(alignedB);
  const trades = [];
  let openTrade = null;
  let wasExtended = false;

  for (let i = 0; i < alignedA.length; i++) {
    if (openTrade && i > openTrade.entryIndex) {
      const candle = openTrade.symbol === symbolA ? alignedA[i] : alignedB[i];
      const hitStop = candle.low <= openTrade.stopPrice;
      const hitTarget = candle.high >= openTrade.targetPrice;
      const timedOut = i - openTrade.entryIndex >= MAX_HOLDING_H1;
      if (hitStop || hitTarget || timedOut) {
        const exitPrice = hitStop ? openTrade.stopPrice : hitTarget ? openTrade.targetPrice : candle.close;
        const outcome = hitStop ? 'loss' : hitTarget ? 'win' : 'timeout';
        trades.push({ ...openTrade, exitTime: candle.time, outcome, rMultiple: hitStop ? -1 : hitTarget ? RR_MULTIPLE : (exitPrice - openTrade.entryPrice) / openTrade.distance });
        openTrade = null;
      }
    }

    if (z[i] !== null) {
      const extended = Math.abs(z[i]) >= threshold;
      if (!openTrade && extended && !wasExtended && i + 1 < alignedA.length) {
        const laggardIsB = z[i] >= threshold;
        const symbol = laggardIsB ? symbolB : symbolA;
        const candles = laggardIsB ? alignedB : alignedA;
        const atr = laggardIsB ? atrB[i] : atrA[i];
        if (atr > 0) {
          const entryIndex = i + 1;
          const entryPrice = candles[entryIndex].open;
          const distance = 1.5 * atr;
          openTrade = { symbol, entryIndex, entryPrice, distance, stopPrice: entryPrice - distance, targetPrice: entryPrice + RR_MULTIPLE * distance };
        }
      }
      wasExtended = extended;
    }
  }
  return trades;
}

function withCosts(trades) {
  return trades.filter((trade) => {
    const spread = DEFAULT_SPREADS[trade.symbol] || 0;
    return !spread || trade.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE;
  }).map((trade) => {
    const spread = DEFAULT_SPREADS[trade.symbol] || 0;
    return { ...trade, rMultiple: trade.rMultiple - (spread ? spread / trade.distance : 0) };
  });
}

function number(value, digits = 2) { return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits); }
function percent(value) { return value == null ? '—' : `${(value * 100).toFixed(1)}%`; }
function verdict(train, test) {
  if (train.totalSignals < 10 || test.totalSignals < 10) return 'insufficient';
  if (test.expectancyR <= 0) return 'fails';
  return train.expectancyR > 0 && test.expectancyR >= 0.3 * train.expectancyR ? 'holds' : 'weakened';
}

function main() {
  const dir = process.argv[2] || 'data/backtest-input';
  const loaded = new Map();
  for (const symbol of new Set(PAIRS.flat())) {
    const file = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(file)) { console.error(`Missing ${file}`); continue; }
    loaded.set(symbol, resampleCandles(loadCandlesFromCsv(file).candles, TIMEFRAME_MS.H1));
  }
  const report = ['# Exploratory divergence sweep across index pairs', '', 'Existing rules only: H1 log-ratio, prior-window z-score, long the laggard, 1.5 ATR stop, 1:3 target, next-candle entry, spread cost, train/test split.', '', '| Pair | Lookback | Z | Corr. | Train n | Train WR | Train exp. R | Test n | Test WR | Test exp. R | Verdict |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'];

  for (const [symbolA, symbolB] of PAIRS) {
    const a = loaded.get(symbolA), b = loaded.get(symbolB);
    if (!a || !b) continue;
    const { alignedA, alignedB } = alignByTime(a, b);
    const correlation = computeCorrelationMatrix({ [symbolA]: a, [symbolB]: b }).matrix[symbolA][symbolB];
    const trainA = alignedA.filter((candle) => candle.time < TRAIN_CUTOFF), trainB = alignedB.filter((candle) => candle.time < TRAIN_CUTOFF);
    const testA = alignedA.filter((candle) => candle.time >= TRAIN_CUTOFF), testB = alignedB.filter((candle) => candle.time >= TRAIN_CUTOFF);
    for (const lookback of LOOKBACKS) for (const threshold of THRESHOLDS) {
      const train = summarizeTrades(withCosts(runPair({ alignedA: trainA, alignedB: trainB, symbolA, symbolB, lookback, threshold })));
      const test = summarizeTrades(withCosts(runPair({ alignedA: testA, alignedB: testB, symbolA, symbolB, lookback, threshold })));
      report.push(`| ${symbolA}/${symbolB} | ${lookback} | ${threshold} | ${number(correlation, 3)} | ${train.totalSignals} | ${percent(train.winRate)} | ${number(train.expectancyR)} | ${test.totalSignals} | ${percent(test.winRate)} | ${number(test.expectancyR)} | ${verdict(train, test)} |`);
      console.error(`${symbolA}/${symbolB} lb=${lookback} z=${threshold} train=${number(train.expectancyR)} test=${number(test.expectancyR)}`);
    }
  }
  const output = path.join(dir, 'pair-divergence-sweep.md');
  fs.writeFileSync(output, `${report.join('\n')}\n`);
  console.log(`Wrote ${output}`);
}

main();