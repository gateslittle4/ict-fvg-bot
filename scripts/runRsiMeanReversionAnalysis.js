#!/usr/bin/env node
// runRsiMeanReversionAnalysis.js
// Usage: node scripts/runRsiMeanReversionAnalysis.js <dir-with-csvs>
//
// A THIRD non-ICT candidate, designed specifically to have the two
// properties neither Turtle nor ORB combined: a genuine historical edge
// AND a short holding period compatible with strict same-instrument
// netting. Larry Connors' "RSI-2" mean-reversion system (documented in his
// 2004 book "Short Term Trading Strategies That Work", still widely
// referenced) - single-instrument, unlike Divergence (which is a
// relationship BETWEEN two instruments), so it's a genuinely different
// mechanism from everything else in this project:
//   1. Daily bars. Trend filter: only trade WITH the underlying trend -
//      long setups only when yesterday's close > EMA(200), short setups
//      only when yesterday's close < EMA(200) (published convention,
//      EMA reused from htfBias.js rather than tuned here).
//   2. Entry trigger: RSI(2) of daily closes < 5 (deeply oversold) in an
//      uptrend -> buy; RSI(2) > 95 (deeply overbought) in a downtrend ->
//      sell. Both RSI(2) and the EMA(200) check use ONLY data through
//      YESTERDAY's close - entry fills at TODAY's open (next-bar
//      convention, same no-lookahead discipline as every other script in
//      this project).
//   3. Stop = 2xATR(14) from entry (same convention as Turtle) - risk is
//      still capped even though the exit target is a mean-reversion level,
//      not a fixed R:R.
//   4. Exit = first of: stop hit, price closes back through SMA(5) (the
//      classic Connors mean-reversion target - "the bounce is over"), or
//      a 10-trading-day timeout (mean reversion is meant to be FAST; if it
//      hasn't worked in 2 weeks, the setup thesis has failed).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeEMA } from '../src/backtest/htfBias.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const EMA_TREND_PERIOD = 200;
const RSI_PERIOD = 2;
const RSI_OVERSOLD = 5;
const RSI_OVERBOUGHT = 95;
const SMA_EXIT_PERIOD = 5;
const ATR_PERIOD = 14;
const STOP_ATR_MULTIPLE = 2;
const MAX_HOLDING_DAYS = 10; // mean reversion is meant to resolve fast - not a real published Connors rule, added here as a sane safety cap
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500'];

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
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

/** Simple (non-Wilder-smoothed) RSI over a rolling window - standard for the short RSI(2) variant. */
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
function runRsiBacktest(daily) {
  const closes = daily.map((c) => c.close);
  const ema200 = computeEMA(closes, EMA_TREND_PERIOD);
  const rsi2 = computeRsiSeries(closes, RSI_PERIOD);
  const sma5 = computeSma(closes, SMA_EXIT_PERIOD);
  const atr14 = computeAtrSeries(daily, ATR_PERIOD);

  const trades = [];
  let open = null;
  const startIdx = Math.max(EMA_TREND_PERIOD, RSI_PERIOD, SMA_EXIT_PERIOD, ATR_PERIOD) + 1;

  for (let i = startIdx; i < daily.length; i++) {
    const day = daily[i];

    // 1) Resolve an open position using today's range (never the entry day itself).
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const hitMeanTarget = sma5[i] !== null && (bullish ? day.close >= sma5[i] : day.close <= sma5[i]);
      const timedOut = i - open.entryIndex >= MAX_HOLDING_DAYS;
      if (hitStop || hitMeanTarget || timedOut) {
        const exitPrice = hitStop ? open.stopPrice : day.close; // mean-target/timeout both exit "on the close"
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome: rMultiple > 0 ? 'win' : 'loss', rMultiple });
        open = null;
      }
    }

    // 2) Look for a new signal, using YESTERDAY's fully-known values only - fill at TODAY's open.
    if (!open) {
      const y = i - 1; // signal day
      if (ema200[y] === null || rsi2[y] === null || atr14[y] === null) continue;
      const uptrend = closes[y] > ema200[y];
      const downtrend = closes[y] < ema200[y];
      if (uptrend && rsi2[y] < RSI_OVERSOLD) {
        const entryPrice = day.open;
        const distance = STOP_ATR_MULTIPLE * atr14[y];
        if (distance > 0) open = { direction: 'bullish', entryIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, distance };
      } else if (downtrend && rsi2[y] > RSI_OVERBOUGHT) {
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
    console.error('Usage: node scripts/runRsiMeanReversionAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT #3 : retour à la moyenne RSI(2) (Larry Connors)');
  md.push('');
  md.push(
    "⚠ Choisie pour combiner ce que Turtle et ORB avaient chacun manqué : un vrai historique documenté (Connors, " +
      "2004) ET une durée de position courte (max 10 jours, compatible avec le netting - contrairement à Turtle). " +
      "Contrairement à la Divergence, c'est un signal sur UN SEUL instrument (RSI extrême + filtre de tendance " +
      "EMA200), pas une relation entre deux instruments. Bougies journalières. Entrée = RSI(2) < 5 en tendance " +
      "haussière (EMA200) ou RSI(2) > 95 en tendance baissière, remplissage à l'ouverture du jour SUIVANT. Stop = " +
      "2xATR(14). Sortie = clôture qui retraverse la SMA(5) (cible classique de Connors), stop touché, ou 10 jours " +
      "max. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runRsiBacktest(trainDaily);
    const testTrades = runRsiBacktest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'rsi-mean-reversion-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
