#!/usr/bin/env node
// runBollingerRsiMeanReversionAnalysis.js
// Usage: node scripts/runBollingerRsiMeanReversionAnalysis.js <dir-with-csvs>
//
// An ORIGINAL construction for this project (not copied from a single named
// system like Turtle/ORB/Connors-RSI/Order Block), but built entirely from
// PUBLISHED, textbook building blocks so it is not fit to this project's
// data - the honest way to try to answer "can you build a strategy with a
// higher win rate": raise win rate by DESIGN (exit at the mean, not a fixed
// 1:3 target; double-confirm the extreme with two independent measures of
// "stretched"), not by peeking at this data and tuning until win rate
// crosses 50%.
//
// Design (decided BEFORE running against this data, every parameter is a
// published default - John Bollinger's own 20-period/2-std-dev default for
// the bands; the same RSI(2) already used in this project for the
// oscillator leg; a round double-digit oversold/overbought threshold, the
// common "Bollinger Band + RSI(2)" retail combo widely written about, not
// invented here):
//   1. Daily bars, per symbol (single-instrument signal, not a pair
//      relationship like Divergence). Bollinger Bands: SMA(20) +/- 2 x
//      rolling std-dev(20) (Bollinger, 1980s standard default).
//   2. RSI(2) (same rolling, non-Wilder computation as elsewhere).
//   3. Long: YESTERDAY's close closed BELOW the lower band AND yesterday's
//      RSI(2) < 10 (double confirmation - price statistically stretched
//      AND the oscillator agrees) -> enter at TODAY's open. Short: mirror,
//      close above the upper band AND RSI(2) > 90.
//   4. NO trend filter (deliberately, unlike the EMA200-filtered RSI(2)
//      strategy already in this project) - this is meant to fire on ANY
//      statistically extreme stretch, trending market or not, and we
//      report honestly whether that hurts it.
//   5. Stop = 2xATR(14) (same convention used everywhere else in this
//      project). Exit target = price reverts back through the MIDDLE band
//      (SMA20) - the classic Bollinger "reversion complete" exit, not a
//      fixed R:R - this is what should mechanically push win rate up
//      relative to the FVG/Divergence 1:3 targets. Timeout 10 trading days
//      (same short mean-reversion cap used for RSI(2) elsewhere).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project - a >50% win rate on
// TRAIN alone would prove nothing; it has to hold on TEST too.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const BB_PERIOD = 20; // Bollinger's own standard default
const BB_STD_MULTIPLE = 2; // Bollinger's own standard default
const RSI_PERIOD = 2;
const RSI_OVERSOLD = 10;
const RSI_OVERBOUGHT = 90;
const ATR_PERIOD = 14;
const STOP_ATR_MULTIPLE = 2;
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

/** Simple (non-Wilder) rolling RSI - same convention as the project's other RSI(2) script. */
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
function runBollingerRsiBacktest(daily) {
  const closes = daily.map((c) => c.close);
  const { mid, upper, lower } = computeBollingerBands(closes, BB_PERIOD, BB_STD_MULTIPLE);
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
      const hitMeanTarget = mid[i] !== null && (bullish ? day.close >= mid[i] : day.close <= mid[i]);
      const timedOut = i - open.entryIndex >= MAX_HOLDING_DAYS;
      if (hitStop || hitMeanTarget || timedOut) {
        const exitPrice = hitStop ? open.stopPrice : day.close; // mean-target/timeout both exit "on the close"
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        const outcome = hitStop ? 'loss' : timedOut && !hitMeanTarget ? 'timeout' : (rMultiple > 0 ? 'win' : 'loss');
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
        if (distance > 0) open = { direction: 'bullish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, distance };
      } else if (stretchedHigh) {
        const entryPrice = day.open;
        const distance = STOP_ATR_MULTIPLE * atr14[y];
        if (distance > 0) open = { direction: 'bearish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, distance };
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
    console.error('Usage: node scripts/runBollingerRsiMeanReversionAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie originale : retour à la moyenne Bandes de Bollinger + RSI(2) (double confirmation)');
  md.push('');
  md.push(
    "⚠ Construction propre à ce projet (pas copiée d'un système publié unique), mais entièrement bâtie à partir de " +
      "briques standards PUBLIÉES pour ne pas être ajustée sur nos données : Bandes de Bollinger (20 jours, 2 écarts-" +
      "types - défaut de Bollinger lui-même) + RSI(2) (même calcul que la stratégie RSI-2 déjà testée), sans filtre " +
      "de tendance (contrairement à la RSI-2 EMA200) - le but est de capter TOUT étirement statistique extrême, en " +
      "tendance ou pas. Entrée = clôture d'HIER hors de la bande (bas ou haut) ET RSI(2) < 10 ou > 90 (double " +
      "confirmation), remplissage à l'ouverture du jour SUIVANT. Stop = 2xATR(14) (même convention que partout " +
      "ailleurs). Cible = retour à la bande MÉDIANE (SMA20) - pas un R:R fixe, contrairement au FVG/Divergence - " +
      "c'est ce qui doit mécaniquement pousser le taux de gain au-dessus de 50%, contre un stop plus large en cas " +
      "d'échec. Timeout 10 jours. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict " +
      "que partout ailleurs - un taux de gain >50% sur TRAIN seul ne prouverait rien, il doit tenir sur TEST aussi."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runBollingerRsiBacktest(trainDaily);
    const testTrades = runBollingerRsiBacktest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'bollinger-rsi-mean-reversion-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
