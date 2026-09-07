#!/usr/bin/env node
// runTurtleSoupStrategyAnalysis.js
// Usage: node scripts/runTurtleSoupStrategyAnalysis.js <dir-with-csvs>
//
// "Turtle Soup" (Linda Raschke, adopted into ICT vocabulary as a form of
// liquidity sweep / stop hunt) - a false-breakout fade of the classic
// 20-day Donchian channel (the same channel Turtle System 1 trades
// breakouts OF - hence the ironic name: fading the very traders who bought
// the breakout). Tested standalone specifically because it's conceptually
// close to this project's existing `liquiditySweepEnabled` FVG filter, so
// the expected marginal value is genuinely uncertain - this could turn out
// to mostly re-detect the same moments rather than add new ones.
//
// Method (no-lookahead, same discipline as everywhere else):
//   1. Daily bars. Entry channel = high/low of the PRIOR 20 days (classic
//      Raschke/Turtle System 1 length, not tuned on our data).
//   2. Signal: today's LOW breaks below the 20-day low but today's CLOSE
//      recovers back above it (a failed breakdown) -> bullish reversal.
//      Mirror: today's HIGH breaks above the 20-day high but today's
//      CLOSE falls back below it -> bearish reversal.
//   3. Entry at TOMORROW's open (next-bar convention, no lookahead). Stop
//      = today's own low (long) / high (short) - the point of maximum
//      adverse excursion during the failed breakout, the classic Turtle
//      Soup stop placement. Target = fixed 1:3 R:R, same convention as
//      elsewhere. Timeout 10 days (this is meant to resolve fast - a
//      trapped-traders squeeze, not a multi-week trend).
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
const CHANNEL_DAYS = 20; // classic Raschke/Turtle System 1 length
const RR_MULTIPLE = 3;
const MAX_HOLDING_DAYS = 10;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500'];

function computeDonchianSeries(daily, n) {
  const highs = new Array(daily.length).fill(null);
  const lows = new Array(daily.length).fill(null);
  for (let i = n; i < daily.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - n; j < i; j++) { hi = Math.max(hi, daily[j].high); lo = Math.min(lo, daily[j].low); }
    highs[i] = hi; lows[i] = lo;
  }
  return { highs, lows };
}

/** @returns {Array} raw (pre-cost) trades */
function runTurtleSoupBacktest(daily) {
  const ch = computeDonchianSeries(daily, CHANNEL_DAYS);
  const trades = [];
  let open = null;
  const startIdx = CHANNEL_DAYS + 1;

  for (let i = startIdx; i < daily.length; i++) {
    const day = daily[i];

    // 1) Resolve an open position.
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? day.low <= open.stopPrice : day.high >= open.stopPrice;
      const hitTarget = bullish ? day.high >= open.targetPrice : day.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= MAX_HOLDING_DAYS;
      if (hitStop || hitTarget || timedOut) {
        let exitPrice, outcome;
        if (hitStop) { exitPrice = open.stopPrice; outcome = 'loss'; }
        else if (hitTarget) { exitPrice = open.targetPrice; outcome = 'win'; }
        else { exitPrice = day.close; outcome = null; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: day.time, exitPrice, outcome: outcome ?? (rMultiple > 0 ? 'win' : 'loss'), rMultiple });
        open = null;
      }
    }

    // 2) Look for a fresh false-breakout signal (only if flat) - entry at TOMORROW's open.
    if (!open && i + 1 < daily.length) {
      const chLow = ch.lows[i];
      const chHigh = ch.highs[i];
      if (chLow !== null && day.low < chLow && day.close > chLow) {
        const entryIndex = i + 1;
        const entryPrice = daily[entryIndex].open;
        const distance = entryPrice - day.low;
        if (distance > 0) {
          open = { direction: 'bullish', entryIndex, entryTime: daily[entryIndex].time, entryPrice, stopPrice: day.low, targetPrice: entryPrice + RR_MULTIPLE * distance, distance };
        }
      } else if (chHigh !== null && day.high > chHigh && day.close < chHigh) {
        const entryIndex = i + 1;
        const entryPrice = daily[entryIndex].open;
        const distance = day.high - entryPrice;
        if (distance > 0) {
          open = { direction: 'bearish', entryIndex, entryTime: daily[entryIndex].time, entryPrice, stopPrice: day.high, targetPrice: entryPrice - RR_MULTIPLE * distance, distance };
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
    console.error('Usage: node scripts/runTurtleSoupStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT/Raschke : Turtle Soup (fausse cassure du canal 20 jours)');
  md.push('');
  md.push(
    "⚠ Proche conceptuellement du filtre `liquiditySweepEnabled` déjà utilisé comme CONFLUENCE pour le FVG - " +
      "testée seule ici pour voir si elle ajoute une vraie valeur indépendante ou si elle re-détecte juste les " +
      "mêmes moments. Bougies journalières. Signal = plus bas (ou plus haut) sur 20 jours cassé puis clôture qui " +
      "revient à l'intérieur du canal (fausse cassure). Entrée à l'ouverture du jour SUIVANT, stop = extrême du " +
      "jour de la fausse cassure, cible 1:3, 10 jours max. Paramètres ORIGINAUX (Raschke/Turtle, canal 20 jours), " +
      "pas ajustés sur nos données. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de " +
      "verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runTurtleSoupBacktest(trainDaily);
    const testTrades = runTurtleSoupBacktest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'turtle-soup-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
