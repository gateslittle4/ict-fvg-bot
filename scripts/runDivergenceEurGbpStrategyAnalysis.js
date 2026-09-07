#!/usr/bin/env node
// runDivergenceEurGbpStrategyAnalysis.js
// Usage: node scripts/runDivergenceEurGbpStrategyAnalysis.js <dir-with-csvs>
//
// Same exact question, same exact method as runDivergenceStrategyAnalysis.js
// (the already-validated US100/US500 pairs-divergence strategy) — just
// applied to a different pair: EURUSD/GBPUSD. Both quote against USD and
// share a lot of the same dollar-driven macro moves, so the same
// "relative-value catch-up" idea is worth testing here too: when their
// log-ratio strays further from its recent average than usual, buy the
// laggard, betting on catch-up.
//
// EVERY parameter below is copied VERBATIM from the already-validated
// US100/US500 script — same lookback/threshold grid, same stop/target/
// timeout conventions — specifically so this is a fair re-application of
// an already-decided method to a new pair, not a fresh search tuned on
// EURUSD/GBPUSD's own data (which would be data-snooping):
//   1. Resample both symbols to H1.
//   2. Align candles by shared H1 timestamp (inner join).
//   3. r(t) = ln(closeEUR) - ln(closeGBP) - the log-ratio.
//   4. Rolling mean/std of r() over the PRIOR `lookback` candles only ->
//      z(t) = (r(t) - mean) / std.
//   5. Edge-triggered entry: z(t) >= +threshold -> GBPUSD is the laggard ->
//      go long GBPUSD. z(t) <= -threshold -> EURUSD is the laggard -> go
//      long EURUSD. Buys the laggard only, no short leg.
//   6. Entry fills at the NEXT candle's open.
//   7. Stop = 1.5x ATR(14, H1) of the laggard. Target = fixed 1:3 R:R.
//      Timeout after 120 H1 candles (~5 days).
//   8. One position open at a time (standalone edge-quality test).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.
//
// Important caveat, checked before running anything: EURUSD/GBPUSD are
// correlated at ~0.68 on H1 returns (recomputed here) - both against USD,
// but nowhere near as tight as US100/US500's 0.935. A weaker relationship
// means a "divergence" is a less rare/significant event to begin with, so
// this is a genuinely open question, not an assumed replay of the indices
// result.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeCorrelationMatrix } from '../src/backtest/correlation.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const ATR_PERIOD = 14;
const RR_MULTIPLE = 3;
const MAX_HOLDING_CANDLES = 120; // H1 candles (~5 days) - same as US100/US500
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

function alignByTime(candlesA, candlesB) {
  const mapB = new Map(candlesB.map((c) => [c.time, c]));
  const alignedA = [];
  const alignedB = [];
  for (const a of candlesA) {
    const b = mapB.get(a.time);
    if (b) {
      alignedA.push(a);
      alignedB.push(b);
    }
  }
  return { alignedA, alignedB };
}

function computeAtrSeries(candles, period) {
  const atr = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    trs.push(tr);
    if (i >= period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      atr[i] = sum / period;
    }
  }
  return atr;
}

function computeZScoreSeries(logRatio, lookback) {
  const z = new Array(logRatio.length).fill(null);
  for (let i = lookback; i < logRatio.length; i++) {
    let sum = 0;
    for (let j = i - lookback; j < i; j++) sum += logRatio[j];
    const mean = sum / lookback;
    let sqSum = 0;
    for (let j = i - lookback; j < i; j++) sqSum += (logRatio[j] - mean) ** 2;
    const std = Math.sqrt(sqSum / lookback);
    z[i] = std > 0 ? (logRatio[i] - mean) / std : 0;
  }
  return z;
}

function runDivergenceBacktest({ alignedA, alignedB, symbolA, symbolB, lookback, zThreshold }) {
  const n = alignedA.length;
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, lookback);
  const atrA = computeAtrSeries(alignedA, ATR_PERIOD);
  const atrB = computeAtrSeries(alignedB, ATR_PERIOD);

  const trades = [];
  let openTrade = null;
  let wasExtended = false;

  for (let i = 0; i < n; i++) {
    if (openTrade) {
      const candles = openTrade.symbol === symbolA ? alignedA : alignedB;
      const candle = candles[i];
      if (i > openTrade.entryIndex) {
        const hitStop = candle.low <= openTrade.stopPrice;
        const hitTarget = candle.high >= openTrade.targetPrice;
        const timedOut = i - openTrade.entryIndex >= MAX_HOLDING_CANDLES;
        if (hitStop || hitTarget || timedOut) {
          let outcome, exitPrice, rMultiple;
          if (hitStop) {
            outcome = 'loss';
            exitPrice = openTrade.stopPrice;
            rMultiple = -1;
          } else if (hitTarget) {
            outcome = 'win';
            exitPrice = openTrade.targetPrice;
            rMultiple = RR_MULTIPLE;
          } else {
            outcome = 'timeout';
            exitPrice = candle.close;
            rMultiple = (exitPrice - openTrade.entryPrice) / openTrade.distance;
          }
          trades.push({ ...openTrade, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
          openTrade = null;
        }
      }
    }

    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= zThreshold;

    if (!openTrade && extended && !wasExtended && i + 1 < n) {
      const laggardIsB = z[i] >= zThreshold;
      const symbol = laggardIsB ? symbolB : symbolA;
      const laggardCandles = laggardIsB ? alignedB : alignedA;
      const atr = laggardIsB ? atrB[i] : atrA[i];
      if (atr && atr > 0) {
        const entryIndex = i + 1;
        const entryPrice = laggardCandles[entryIndex].open;
        const distance = 1.5 * atr;
        const stopPrice = entryPrice - distance;
        const targetPrice = entryPrice + RR_MULTIPLE * distance;
        openTrade = { symbol, direction: 'bullish', entryIndex, entryTime: laggardCandles[entryIndex].time, entryPrice, stopPrice, targetPrice, distance, zAtEntry: z[i] };
      }
    }
    wasExtended = extended;
  }
  return trades;
}

function withCosts(trades) {
  const viable = trades.filter((t) => {
    const spread = DEFAULT_SPREADS[t.symbol];
    return !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE;
  });
  const net = viable.map((t) => {
    const spread = DEFAULT_SPREADS[t.symbol] ?? 0;
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
    console.error('Usage: node scripts/runDivergenceEurGbpStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const { candles: m15A } = loadCandlesFromCsv(path.join(dir, 'EURUSD.csv'));
  const { candles: m15B } = loadCandlesFromCsv(path.join(dir, 'GBPUSD.csv'));
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);

  const md = [];
  md.push('# Stratégie exploratoire : divergence EURUSD / GBPUSD (achat du "retardataire")');
  md.push('');
  md.push(
    "⚠ Même méthode EXACTE que la stratégie Divergence déjà validée sur US100/US500 (voir " +
      "divergence-strategy-analysis.md) - même grille de lookback/seuil, même stop 1.5xATR(14), même cible 1:3, " +
      "même timeout 120 bougies H1 - appliquée telle quelle à une nouvelle paire, sans aucun paramètre réajusté sur " +
      "les données EURUSD/GBPUSD elles-mêmes (pas de data-snooping). Bougies H1, z-score du log-ratio sur fenêtre " +
      "glissante (jamais la bougie courante), entrée déclenchée au premier franchissement du seuil, achat du " +
      "RETARDATAIRE, remplissage à l'ouverture de la bougie SUIVANTE. Écran TRAIN (2019-2023) / vérification TEST " +
      "(2024-2025)."
  );
  md.push('');

  const corrResult = computeCorrelationMatrix({ EURUSD: h1A, GBPUSD: h1B });
  md.push(
    `Corrélation EURUSD/GBPUSD sur rendements H1 (recalculée ici) : ${fmtNum(corrResult.matrix.EURUSD.GBPUSD, 3)} — ` +
      "nettement plus faible que le 0.935 de US100/US500 : les deux paires partagent le dollar mais pas la même " +
      "paire de base, donc un décrochage est un événement moins rare a priori. Ce test répond directement à la " +
      "question, plutôt que de la supposer."
  );
  md.push('');

  md.push(TABLE_HEADER());
  md.push(TABLE_SEP());

  const LOOKBACKS = [20, 50, 100];
  const THRESHOLDS = [1.5, 2.0, 2.5];

  for (const lookback of LOOKBACKS) {
    for (const zThreshold of THRESHOLDS) {
      const trainA = alignedA.filter((c) => c.time < TRAIN_CUTOFF);
      const trainB = alignedB.filter((c) => c.time < TRAIN_CUTOFF);
      const testA = alignedA.filter((c) => c.time >= TRAIN_CUTOFF);
      const testB = alignedB.filter((c) => c.time >= TRAIN_CUTOFF);

      const trainTrades = runDivergenceBacktest({ alignedA: trainA, alignedB: trainB, symbolA: 'EURUSD', symbolB: 'GBPUSD', lookback, zThreshold });
      const testTrades = runDivergenceBacktest({ alignedA: testA, alignedB: testB, symbolA: 'EURUSD', symbolB: 'GBPUSD', lookback, zThreshold });

      const { net: trainNet } = withCosts(trainTrades);
      const { net: testNet } = withCosts(testTrades);
      const ts = summarizeTrades(trainNet);
      const es = summarizeTrades(testNet);
      const v = verdict(ts.expectancyR, es.expectancyR);
      md.push(
        `| lookback ${lookback}, seuil ${zThreshold} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`
      );
      console.error(`[lookback=${lookback}, z=${zThreshold}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'divergence-eurusd-gbpusd-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

function TABLE_HEADER() {
  return '| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |';
}
function TABLE_SEP() {
  return '|---|---|---|---|---|---|---|---|---|---|';
}

main();
