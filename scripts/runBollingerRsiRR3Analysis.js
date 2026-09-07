#!/usr/bin/env node
// runBollingerRsiRR3Analysis.js
// Usage: node scripts/runBollingerRsiRR3Analysis.js <dir-with-csvs>
//
// Variant of the original Bollinger + RSI(2) double-confirmation
// mean-reversion strategy (bollinger-rsi-mean-reversion-analysis.md),
// requested explicitly: keep the SAME 1:3 risk/reward convention used
// everywhere else in this project (FVG, Divergence) instead of exiting at
// the middle band. Everything else is IDENTICAL to the original version -
// same entry (yesterday's close outside a 20-day/2-std Bollinger Band AND
// RSI(2) < 10 / > 90), same stop (2xATR(14)), same 10-day timeout. Only
// the exit target changes: fixed 1:3 R:R instead of "revert to SMA20".
//
// This swaps the previous version's structural trade-off: exiting at a
// fixed 1:3 target instead of the nearer middle-band target should LOWER
// the win rate (price has to travel 3x the stop distance to bank a win
// instead of just reaching the mean) but should also change the
// gain/loss asymmetry - the whole point of testing this variant is to see
// whether the SAME signal becomes a real edge once given the same R:R
// convention that already works for FVG/Divergence, or whether the signal
// itself (not the exit rule) is the problem.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const BB_PERIOD = 20;
const BB_STD_MULTIPLE = 2;
const RSI_PERIOD = 2;
const RSI_OVERSOLD = 10;
const RSI_OVERBOUGHT = 90;
const ATR_PERIOD = 14;
const STOP_ATR_MULTIPLE = 2;
const RR_MULTIPLE = 3; // requested: keep the same 1:3 convention as FVG/Divergence, instead of "exit at SMA20"
const MAX_HOLDING_DAYS = 10;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

function computeBollingerBands(closes, period, stdMultiple) {
  const mid = computeSma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (closes[j] - mid[i]) ** 2;
    const std = Math.sqrt(sqSum / period);
    upper[i] = mid[i] + stdMultiple * std;
    lower[i] = mid[i] - stdMultiple * std;
  }
  return { mid, upper, lower };
}

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

/** Simple (non-Wilder) rolling RSI - same convention as elsewhere in this project. */
function computeRsiSeries(closes, period) {
  const rsi = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gainSum = 0, lossSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gainSum += change; else lossSum += -change;
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) rsi[i] = avgGain === 0 ? 50 : 100;
    else { const rs = avgGain / avgLoss; rsi[i] = 100 - 100 / (1 + rs); }
  }
  return rsi;
}

/** @returns {Array} raw (pre-cost) trades */
function runBollingerRsiRR3Backtest(daily) {
  const closes = daily.map((c) => c.close);
  const { upper, lower } = computeBollingerBands(closes, BB_PERIOD, BB_STD_MULTIPLE);
  const rsi2 = computeRsiSeries(closes, RSI_PERIOD);
  const atr14 = computeAtrSeries(daily, ATR_PERIOD);

  const trades = [];
  let open = null;
  const startIdx = Math.max(BB_PERIOD, RSI_PERIOD, ATR_PERIOD) + 1;

  for (let i = startIdx; i < daily.length; i++) {
    const day = daily[i];

    // 1) Resolve an open position using today's range (never the entry day itself).
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const hitTarget = bullish ? day.high >= open.targetPrice : day.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= MAX_HOLDING_DAYS;
      if (hitStop || hitTarget || timedOut) {
        let exitPrice, outcome;
        if (hitStop) { exitPrice = open.stopPrice; outcome = 'loss'; }
        else if (hitTarget) { exitPrice = open.targetPrice; outcome = 'win'; }
        else { exitPrice = day.close; outcome = 'timeout'; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome, rMultiple });
        open = null;
      }
    }

    // 2) Look for a new signal, using YESTERDAY's fully-known values only - fill at TODAY's open.
    if (!open) {
      const y = i - 1;
      if (lower[y] === null || upper[y] === null || rsi2[y] === null || atr14[y] === null) continue;
      const stretchedLow = closes[y] < lower[y] && rsi2[y] < RSI_OVERSOLD;
      const stretchedHigh = closes[y] > upper[y] && rsi2[y] > RSI_OVERBOUGHT;
      if (stretchedLow) {
        const entryPrice = day.open;
        const distance = STOP_ATR_MULTIPLE * atr14[y];
        if (distance > 0) open = { direction: 'bullish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + RR_MULTIPLE * distance, distance };
      } else if (stretchedHigh) {
        const entryPrice = day.open;
        const distance = STOP_ATR_MULTIPLE * atr14[y];
        if (distance > 0) open = { direction: 'bearish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, targetPrice: entryPrice - RR_MULTIPLE * distance, distance };
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
    console.error('Usage: node scripts/runBollingerRsiRR3Analysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Variante : Bollinger + RSI(2), mais cible fixe 1:3 (au lieu du retour à la moyenne)');
  md.push('');
  md.push(
    "⚠ Même signal EXACT que bollinger-rsi-mean-reversion-analysis.md (clôture d'hier hors bande de Bollinger " +
      "20/2 ET RSI(2) < 10 ou > 90, remplissage à l'ouverture du jour suivant, stop 2xATR(14)) - seule la SORTIE " +
      "change : cible fixe 1:3 (même convention que FVG/Divergence) au lieu du retour à la bande médiane. Le but " +
      "est de savoir si le signal lui-même est le problème, ou seulement le choix de cible de la version précédente. " +
      "Timeout 10 jours. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout " +
      "ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runBollingerRsiRR3Backtest(trainDaily);
    const testTrades = runBollingerRsiRR3Backtest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'bollinger-rsi-rr3-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
