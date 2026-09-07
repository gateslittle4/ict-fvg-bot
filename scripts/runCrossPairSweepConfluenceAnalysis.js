#!/usr/bin/env node
// runCrossPairSweepConfluenceAnalysis.js
// Usage: node scripts/runCrossPairSweepConfluenceAnalysis.js <dir-with-csvs>
//
// Tests an idea proposed by the user: instead of requiring a liquidity
// sweep confluence on the SAME instrument as the FVG (what
// liquiditySweepEnabled already does), require the sweep on the OTHER
// member of the US100/US500 pair - "one does the stop hunt at a swing
// high/low, the other falls into an FVG; the one that falls into the FVG
// is the weaker one, that's the one we trade, both moving in the same
// direction." Concretely: for a bullish FVG validation on symbol B, only
// take it if US100's PARTNER (symbol A) had a recent BULLISH liquidity
// sweep event (mirror for bearish) - same underlying idea as the existing
// filter (both indices are highly correlated, so a stop-hunt reversal
// signal on one is plausible confirmation for a retracement entry on the
// other), just cross-instrument instead of same-instrument.
//
// Everything reused AS-IS, decided before running (no new tuning):
//   - The exact same validated per-symbol FVG config (variant/stopMode/
//     structure/session) already in production - see config.js /
//     runFtmo1StepAccountImpact.js.
//   - The exact same swing-pivot lookback (5) and sweep recency window
//     (10 M15 candles, ~2.5h) already used by the existing same-instrument
//     sweep filter (SWEEP_LOOKBACK/SWEEP_WINDOW_CANDLES in gridRunner.js).
// Only the SOURCE of the sweep events changes: own candles vs partner's.
//
// Reports both side by side - existing same-instrument version (baseline,
// already validated) vs this cross-instrument variant - so the comparison
// is direct or apples-to-apples. Screened on TRAIN (2019-2023), verified
// on TEST (2024-2025), same verdict rule as everywhere else.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { withNet, STRUCTURE_LOOKBACK, SWEEP_LOOKBACK, SWEEP_WINDOW_CANDLES, NY_AM_SESSION } from '../src/backtest/gridRunner.js';
import { FvgEngine } from '../src/engines/fvgEngine.js';
import { buildHtfBiasSeries, makeBiasLookup, BiasFilteredFvgEngine, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { buildStructureBiasSeries, makeStructureBiasLookup, StructureFilteredFvgEngine } from '../src/backtest/marketStructure.js';
import { SessionFilteredFvgEngine } from '../src/backtest/nySession.js';
import { buildLiquiditySweepEvents, makeSweepLookup, LiquiditySweepFilteredFvgEngine } from '../src/backtest/liquiditySweep.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const NEUTRAL_BAND_PCT = 0.1; // same constant gridRunner.js uses internally
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const PAIR = ['US100', 'US500'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, spread: DEFAULT_SPREADS.US500 },
};
const SWEEP_WINDOW_MS = SWEEP_WINDOW_CANDLES * 15 * 60 * 1000;

/** Builds the filter stack manually (mirrors buildFilteredEngine) so we can swap/stack the sweep-events source(s) per variant.
 * @param {Array<Array>} sweepSourceCandlesList - one or two candle arrays; a LiquiditySweepFilteredFvgEngine wrapper is
 *   stacked once per entry, so passing both own and partner candles requires BOTH sweeps to match (logical AND). */
function buildEngineWithSweepSource(candles, symbol, cfg, sweepSourceCandlesList) {
  let engine = new FvgEngine({ symbol });

  const [tfKey, emaLabel] = cfg.variant.split('_');
  const tf = { H1: TIMEFRAME_MS.H1, H4: TIMEFRAME_MS.H4 }[tfKey];
  const emaPeriod = Number(emaLabel.replace('EMA', ''));
  const biasSeries = buildHtfBiasSeries(candles, { bucketMs: tf, emaPeriod, neutralBandPct: NEUTRAL_BAND_PCT });
  engine = new BiasFilteredFvgEngine(engine, makeBiasLookup(biasSeries));

  const structureSeries = buildStructureBiasSeries(candles, { lookback: STRUCTURE_LOOKBACK });
  engine = new StructureFilteredFvgEngine(engine, makeStructureBiasLookup(structureSeries));

  engine = new SessionFilteredFvgEngine(engine, SILVER_BULLET_WINDOW);

  for (const sourceCandles of sweepSourceCandlesList) {
    const sweepEvents = buildLiquiditySweepEvents(sourceCandles, { lookback: SWEEP_LOOKBACK });
    const sweepLookup = makeSweepLookup(sweepEvents, { windowMs: SWEEP_WINDOW_MS });
    engine = new LiquiditySweepFilteredFvgEngine(engine, sweepLookup);
  }

  return engine;
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < 10 || testN < 10) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runCrossPairSweepConfluenceAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Confluence de liquidity sweep CROISÉE entre US100/US500 (idée utilisateur) + double confirmation');
  md.push('');
  md.push(
    "⚠ Trois versions comparées pour chaque instrument : (1) le filtre déjà validé, sweep exigé sur le MÊME " +
      "instrument que le FVG ; (2) l'idée testée au tour précédent, sweep exigé sur le PARTENAIRE (US100<->US500) " +
      "à la place ; (3) NOUVEAU - double confirmation, sweep exigé SUR LES DEUX à la fois (ET logique, pas OU) - " +
      "un fait un balayage de stops sur un swing high/low, l'autre AUSSI, et le FVG retrace sur celui qu'on trade. " +
      "Même config FVG déjà validée par instrument, même lookback de swing (5) et même fenêtre de fraîcheur du " +
      "sweep (10 bougies M15, ~2h30) déjà utilisés par le filtre existant - seule la SOURCE (ou les sources) des " +
      "événements de sweep changent. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de " +
      "verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Version | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');

  const candlesBySymbol = {};
  for (const symbol of PAIR) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles;
  }

  for (const symbol of PAIR) {
    const partner = PAIR.find((s) => s !== symbol);
    const cfg = FVG_CONFIG[symbol];
    const candles = candlesBySymbol[symbol];
    const partnerCandles = candlesBySymbol[partner];

    const variants = [
      { key: `même instrument (${symbol}, déjà validé)`, sweepFrom: [candles] },
      { key: `partenaire (${partner}) seul`, sweepFrom: [partnerCandles] },
      { key: `double confirmation (${symbol} ET ${partner})`, sweepFrom: [candles, partnerCandles] },
    ];

    for (const v of variants) {
      const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
      const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
      const sweepTrain = v.sweepFrom.map((src) => src.filter((c) => c.time < TRAIN_CUTOFF));
      const sweepTest = v.sweepFrom.map((src) => src.filter((c) => c.time >= TRAIN_CUTOFF));

      const trainEngine = buildEngineWithSweepSource(trainCandles, symbol, cfg, sweepTrain);
      const trainTrades = runBacktest({ candles: trainCandles, symbol, fvgEngine: trainEngine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
      const testEngine = buildEngineWithSweepSource(testCandles, symbol, cfg, sweepTest);
      const testTrades = runBacktest({ candles: testCandles, symbol, fvgEngine: testEngine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });

      const { summaryNet: ts } = withNet(trainTrades, cfg.spread);
      const { summaryNet: es } = withNet(testTrades, cfg.spread);
      const verd = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

      md.push(`| ${symbol} | ${v.key} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${verd} |`);
      console.error(`[${symbol} / ${v.key}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'cross-pair-sweep-confluence-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
