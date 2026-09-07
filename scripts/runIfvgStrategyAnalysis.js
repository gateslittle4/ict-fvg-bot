#!/usr/bin/env node
// runIfvgStrategyAnalysis.js
// Usage: node scripts/runIfvgStrategyAnalysis.js <dir-with-csvs>
//
// Inverse Fair Value Gap (IFVG) - the same 3-candle FVG zone detection as
// the project's core FvgEngine, but a DIFFERENT trigger: instead of
// trading in the zone's own direction the first time price touches it
// (the normal FVG entry), IFVG waits for the zone to be fully INVALIDATED
// - a candle CLOSING all the way through the far edge, not just dipping
// in - and then trades the CONTINUATION in the opposite direction (a
// broken support zone becomes resistance, and vice versa).
//
// Chosen specifically because it's structurally complementary rather than
// redundant with the existing FVG trades: on any given zone, EITHER it
// validates in its own direction (a normal FVG trade) OR it gets fully
// invalidated (an IFVG trade) - the two conditions are mutually exclusive
// on the same zone, so this isn't re-trading the same moments already
// captured elsewhere.
//
// Method (no-lookahead, one pending zone-watch / one open position at a
// time, same convention as the Order Block script):
//   1. Detect zones exactly like FvgEngine (3-candle gap, [c1,c2,c3]).
//   2. Watch each active zone (up to IFVG_MAX_AGE_CANDLES old) for a
//      candle whose CLOSE breaks all the way through the FAR edge (below
//      the bottom for a bullish zone, above the top for a bearish zone) -
//      this is what actually differs from the base FvgEngine's "first
//      touch" trigger.
//   3. On inversion, enter in the OPPOSITE direction at the NEXT candle's
//      open. Stop = the zone's NEAR edge relative to the new direction
//      (i.e., the zone's far-from-price edge before inversion - the level
//      that would undo the inversion thesis if reclaimed). Target = fixed
//      1:3 R:R, same convention as FVG/Divergence. Timeout 480 M15
//      candles, same as FVG.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const IFVG_MAX_AGE_CANDLES = 50; // matches FvgEngine's own default maxAgeCandles
const RR_MULTIPLE = 3;
const MAX_HOLDING_CANDLES = 480; // matches FVG's own M15 timeout
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500'];

/** @returns {Array<{direction, top, bottom, formedIndex}>} every 3-candle FVG zone, in chronological order */
function detectFvgZones(candles) {
  const zones = [];
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];
    if (c1.high < c3.low) zones.push({ direction: 'bullish', top: c3.low, bottom: c1.high, formedIndex: i });
    else if (c1.low > c3.high) zones.push({ direction: 'bearish', top: c1.low, bottom: c3.high, formedIndex: i });
  }
  return zones;
}

/** @returns {Array} raw (pre-cost) trades */
function runIfvgBacktest(candles) {
  const allZones = detectFvgZones(candles);
  const zonesByFormedIndex = new Map();
  for (const z of allZones) {
    if (!zonesByFormedIndex.has(z.formedIndex)) zonesByFormedIndex.set(z.formedIndex, []);
    zonesByFormedIndex.get(z.formedIndex).push(z);
  }

  const trades = [];
  let open = null;
  let activeZones = []; // zones formed but not yet inverted/expired/superseded by a trade

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
        activeZones = []; // one trade at a time - drop stale watches once we were in a position
      }
    }

    // 2) Age out expired zones, then check remaining ones for a full-close inversion (only if flat).
    activeZones = activeZones.filter((z) => i - z.formedIndex < IFVG_MAX_AGE_CANDLES);
    if (!open) {
      for (const z of activeZones) {
        if (i <= z.formedIndex) continue;
        const invertedToBearish = z.direction === 'bullish' && candle.close < z.bottom;
        const invertedToBearishSide = invertedToBearish; // naming clarity
        const invertedToBullish = z.direction === 'bearish' && candle.close > z.top;
        if ((invertedToBearishSide || invertedToBullish) && i + 1 < candles.length) {
          const newDirection = invertedToBearishSide ? 'bearish' : 'bullish';
          const entryIndex = i + 1; // fill at NEXT candle's open - no same-candle lookahead
          const entryPrice = candles[entryIndex].open;
          const stopPrice = invertedToBearishSide ? z.top : z.bottom; // the zone's far edge, which would undo the inversion if reclaimed
          const distance = Math.abs(stopPrice - entryPrice);
          if (distance > 0) {
            const targetPrice = newDirection === 'bullish' ? entryPrice + RR_MULTIPLE * distance : entryPrice - RR_MULTIPLE * distance;
            open = { direction: newDirection, entryIndex, entryTime: candles[entryIndex].time, entryPrice, stopPrice, targetPrice, distance, sourceZoneDirection: z.direction };
            activeZones = [];
            break;
          }
        }
      }
    }

    // 3) Register any zone that just formed on this candle (c3 = this candle).
    const justFormed = zonesByFormedIndex.get(i);
    if (justFormed && !open) activeZones.push(...justFormed);
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
    console.error('Usage: node scripts/runIfvgStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #3 : FVG inversé (IFVG)');
  md.push('');
  md.push(
    "⚠ Mêmes zones à 3 bougies que le FvgEngine du projet, mais déclencheur différent : au lieu de trader la zone " +
      "dans SON sens dès le premier contact (le FVG normal), on attend une clôture qui traverse complètement le " +
      "bord opposé (invalidation complète, pas juste un contact) puis on trade la CONTINUATION dans l'autre sens - " +
      "une zone de support cassée devient résistance, et vice-versa. Complémentaire par construction : sur une " +
      "même zone, soit elle valide (trade FVG normal), soit elle s'invalide (trade IFVG) - jamais les deux. " +
      "Remplissage à l'ouverture de la bougie SUIVANTE, stop = bord opposé de la zone, cible 1:3, timeout 480 " +
      "bougies M15 (mêmes conventions que le FVG). Un seul guet et une seule position à la fois. Écran TRAIN " +
      "(2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runIfvgBacktest(trainCandles);
    const testTrades = runIfvgBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'ifvg-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
