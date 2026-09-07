#!/usr/bin/env node
// runOrderBlockStrategyAnalysis.js
// Usage: node scripts/runOrderBlockStrategyAnalysis.js <dir-with-csvs>
//
// A different ICT concept than FVG (still ICT, unlike Turtle/ORB/RSI-2 -
// tested anyway since it's a genuinely different SIGNAL MECHANISM, which
// is what actually drives extra trade frequency, not "ICT vs not"): the
// Order Block. Where FVG looks for a 3-candle imprint (a gap left behind
// by displacement), an Order Block is the LAST opposite-colored candle
// right before a structural break (BOS) - the idea being that's the last
// footprint of the losing side before institutional order flow reversed
// the market, and price often returns to "mitigate" (fill orders in) that
// zone before continuing.
//
// Method (reuses this project's existing swing-detection code from
// marketStructure.js, same no-lookahead discipline - a swing pivot is only
// usable `lookback` candles after it forms):
//   1. Detect BOS events: every time price closes above the most recently
//      CONFIRMED swing high (bullish BOS) or below the most recently
//      confirmed swing low (bearish BOS) - edge-triggered (fresh cross
//      only), so repeated continuation breaks all count, not just trend
//      reversals.
//   2. For each BOS, scan BACKWARD (up to `OB_SEARCH_LOOKBACK` candles) for
//      the most recent opposite-colored candle (bearish body before a
//      bullish BOS, bullish body before a bearish BOS) - that candle's
//      full high/low range is the Order Block zone.
//   3. Watch for price to retrace back INTO that zone within
//      `OB_MAX_AGE_CANDLES` candles after the BOS (same "watching" window
//      length as FVG's own maxAgeCandles=50, for a fair comparison) - the
//      FIRST candle whose low pierces the zone top (bullish case) fills at
//      min(candle.open, zoneHigh) (limit-order-into-zone convention).
//   4. Stop = the OPPOSITE edge of the zone (a touch through the whole
//      block invalidates the idea, same principle as FVG's own zone-edge
//      stop). Target = fixed 1:3 R:R, same convention as FVG/Divergence.
//      Timeout after 480 M15 candles, same as FVG.
//   5. Only ONE pending watch and ONE open position tracked at a time (a
//      standalone edge-quality test, same convention as the Divergence
//      script) - if already watching or in a trade, a fresh BOS is
//      ignored until the current one resolves.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { detectSwingPoints } from '../src/backtest/marketStructure.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const SWING_LOOKBACK = 5; // matches the project's existing structure-filter default
const OB_SEARCH_LOOKBACK = 20; // how far back to search for the opposite-colored OB candle
const OB_MAX_AGE_CANDLES = 50; // matches FVG's own maxAgeCandles convention
const RR_MULTIPLE = 3;
const MAX_HOLDING_CANDLES = 480; // matches FVG's own M15 timeout
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500'];

/** @returns {Array<{index:number, direction:'bullish'|'bearish'}>} every fresh BOS crossing, in chronological order */
function detectBosEvents(candles) {
  const swingPoints = detectSwingPoints(candles, SWING_LOOKBACK);
  const byConfirmedIndex = new Map();
  for (const p of swingPoints) {
    if (!byConfirmedIndex.has(p.confirmedIndex)) byConfirmedIndex.set(p.confirmedIndex, []);
    byConfirmedIndex.get(p.confirmedIndex).push(p);
  }

  const events = [];
  let lastConfirmedHigh = null;
  let lastConfirmedLow = null;
  let prevClose = null;

  for (let i = 0; i < candles.length; i++) {
    const newlyConfirmed = byConfirmedIndex.get(i);
    if (newlyConfirmed) {
      for (const p of newlyConfirmed) {
        if (p.type === 'high') lastConfirmedHigh = p.price;
        else lastConfirmedLow = p.price;
      }
    }
    const close = candles[i].close;
    if (prevClose !== null) {
      if (lastConfirmedHigh !== null && close > lastConfirmedHigh && prevClose <= lastConfirmedHigh) {
        events.push({ index: i, direction: 'bullish' });
      } else if (lastConfirmedLow !== null && close < lastConfirmedLow && prevClose >= lastConfirmedLow) {
        events.push({ index: i, direction: 'bearish' });
      }
    }
    prevClose = close;
  }
  return events;
}

/** Scans backward from a BOS index for the last opposite-colored candle - the Order Block. */
function findOrderBlock(candles, bosIndex, direction) {
  const wantBearishCandle = direction === 'bullish'; // bullish BOS -> look for the last DOWN candle
  const earliest = Math.max(0, bosIndex - OB_SEARCH_LOOKBACK);
  for (let j = bosIndex - 1; j >= earliest; j--) {
    const c = candles[j];
    const isBearish = c.close < c.open;
    const isBullish = c.close > c.open;
    if (wantBearishCandle && isBearish) return { low: c.low, high: c.high };
    if (!wantBearishCandle && isBullish) return { low: c.low, high: c.high };
  }
  return null;
}

/** @returns {Array} raw (pre-cost) trades */
function runOrderBlockBacktest(candles) {
  const bosEvents = detectBosEvents(candles);
  const bosByIndex = new Map(bosEvents.map((e) => [e.index, e]));

  const trades = [];
  let open = null;
  let watch = null; // { direction, zoneLow, zoneHigh, expireIndex }

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // 1) Resolve an open position.
    if (open && i > open.entryIndex) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= MAX_HOLDING_CANDLES;
      if (hitStop || hitTarget || timedOut) {
        let exitPrice, outcome;
        if (hitStop) { exitPrice = open.stopPrice; outcome = 'loss'; }
        else if (hitTarget) { exitPrice = open.targetPrice; outcome = 'win'; }
        else { exitPrice = candle.close; outcome = null; }
        const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
        const rMultiple = signedMove / open.distance;
        trades.push({ ...open, exitIndex: i, exitTime: candle.time, exitPrice, outcome: outcome ?? (rMultiple > 0 ? 'win' : 'loss'), rMultiple });
        open = null;
      }
    }

    // 2) If watching a zone (and not already in a trade), check for a retracement touch or expiry.
    if (!open && watch) {
      if (i > watch.expireIndex) {
        watch = null;
      } else if (i > watch.bosIndex) {
        const bullish = watch.direction === 'bullish';
        const touched = bullish ? candle.low <= watch.zoneHigh : candle.high >= watch.zoneLow;
        if (touched) {
          const entryPrice = bullish ? Math.min(candle.open, watch.zoneHigh) : Math.max(candle.open, watch.zoneLow);
          const stopPrice = bullish ? watch.zoneLow : watch.zoneHigh;
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance > 0) {
            const targetPrice = bullish ? entryPrice + RR_MULTIPLE * distance : entryPrice - RR_MULTIPLE * distance;
            open = { direction: watch.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance };
          }
          watch = null;
        }
      }
    }

    // 3) If flat (no trade, no pending watch), check for a fresh BOS -> arm a new watch.
    if (!open && !watch) {
      const bos = bosByIndex.get(i);
      if (bos) {
        const zone = findOrderBlock(candles, i, bos.direction);
        if (zone) {
          watch = { direction: bos.direction, zoneLow: zone.low, zoneHigh: zone.high, bosIndex: i, expireIndex: i + OB_MAX_AGE_CANDLES };
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
    console.error('Usage: node scripts/runOrderBlockStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #2 : Order Block (mitigation avant continuation)');
  md.push('');
  md.push(
    "⚠ Toujours ICT (contrairement à Turtle/ORB/RSI-2), mais un mécanisme de détection COMPLÈTEMENT différent du " +
      "FVG - zone = la dernière bougie de couleur opposée avant une cassure de structure (BOS), pas un gap à 3 " +
      "bougies. Réutilise la détection de swing existante (marketStructure.js, lookback 5). Bougies M15, remplissage " +
      "en limite dans la zone, stop = bord opposé de la zone, cible 1:3 (même convention que FVG/Divergence), " +
      "fenêtre de guet 50 bougies après le BOS (comme maxAgeCandles du FVG), timeout 480 bougies. Un seul guet et " +
      "une seule position suivis à la fois. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle " +
      "de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runOrderBlockBacktest(trainCandles);
    const testTrades = runOrderBlockBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'order-block-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
