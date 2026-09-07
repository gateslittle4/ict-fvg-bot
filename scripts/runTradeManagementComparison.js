#!/usr/bin/env node
// runTradeManagementComparison.js
// Usage: node scripts/runTradeManagementComparison.js <dir-with-csvs> [cutoffISODate]
//
// Answers "can we squeeze more out of the 44.7%/42.9% winners and lose less
// on the rest, without changing which signals we take?" - tests two active
// trade-management variants against the current best config for each
// symbol (see docs/STRATEGY.md), using the SAME signals/entries/stops, only
// changing what happens to an open trade:
//
//   'breakeven'  - once price reaches +1R in our favor, move the stop to
//                  entry. A later reversal scratches at 0R instead of -1R.
//   'partial'    - close half the position at +1R, move the remaining
//                  half's stop to breakeven, let the rest run to the
//                  original 1:3 target.
//
// Screens all three (baseline, breakeven, partial) on TRAIN, then confirms
// on TEST (never used to pick anything) - same discipline as every other
// validation script here.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBacktest, runBacktestManaged, runBacktestPyramidIndependentStops, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const BEST_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
};

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }

function runVariant(candles, symbol, spread, cfg, mode) {
  const { engine } = buildFilteredEngine(candles, symbol, cfg);
  const trades =
    mode === 'baseline'
      ? runBacktest({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple })
      : mode === 'pyramid-independent'
      ? runBacktestPyramidIndependentStops({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple })
      : runBacktestManaged({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple, mode });
  return withNet(trades, spread);
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runTradeManagementComparison.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const mdSections = [];
  mdSections.push('# Gestion active de trade (breakeven / prise partielle) vs 1:3 fixe — US100 / US500');
  mdSections.push('');
  mdSections.push(
    '⚠ Mêmes signaux/entrées/stops exacts que le setup validé (docs/STRATEGY.md) - seule la GESTION de la position ' +
      'ouverte change. "breakeven" : une fois +1R atteint en notre faveur, le stop remonte à l\'entrée (un renversement ' +
      'devient nul au lieu de -1R). "partiel" : la moitié de la position est prise à +1R, stop du reste à breakeven, le ' +
      'reste vise toujours 1:3. Criblé sur TRAIN, confirmé sur TEST (jamais utilisé pour choisir).'
  );
  mdSections.push('');

  for (const [symbol, cfg] of Object.entries(BEST_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    mdSections.push(`## ${symbol} (${cfg.variant}, structure ON, session 10h-11h, ${cfg.stopMode}, 1:${cfg.rrMultiple}, sweep ON)`);
    mdSections.push('| Gestion | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) |');
    mdSections.push('|---|---|---|---|---|---|');

    for (const [label, mode] of [
      ['1:3 fixe (actuel)', 'baseline'],
      ['Breakeven à +1R', 'breakeven'],
      ['Partiel 50% à +1R + breakeven', 'partial'],
      ['Pyramide : +1 lot à +1R + breakeven (2x risque)', 'pyramid'],
      ['Pyramide (stops indépendants, sans breakeven)', 'pyramid-independent'],
    ]) {
      const train = runVariant(trainCandles, symbol, spread, cfg, mode);
      const test = runVariant(testCandles, symbol, spread, cfg, mode);
      const note = train.summaryNet.totalSignals < MIN_SIGNALS_FOR_RANKING || test.summaryNet.totalSignals < MIN_SIGNALS_FOR_RANKING ? ' ⚠️échantillon faible' : '';
      const isPyramidMode = mode === 'pyramid' || mode === 'pyramid-independent';
      const pyramidedTrain = isPyramidMode ? train.trades.filter((t) => t.unitsDeployed === 2).length : null;
      const pyramidedTest = isPyramidMode ? test.trades.filter((t) => t.unitsDeployed === 2).length : null;
      const pyramidNote = isPyramidMode ? ` (pyramidés : ${pyramidedTrain}/${pyramidedTest})` : '';
      mdSections.push(
        `| ${label}${note}${pyramidNote} | ${train.summaryNet.totalSignals}/${test.summaryNet.totalSignals} | ` +
          `${fmtPct(train.summaryNet.winRate)}/${fmtPct(test.summaryNet.winRate)} | ` +
          `${fmtNum(train.summaryNet.avgR)}/${fmtNum(test.summaryNet.avgR)} | ` +
          `${fmtNum(train.summaryNet.profitFactor)}/${fmtNum(test.summaryNet.profitFactor)} | ` +
          `${fmtNum(train.summaryNet.maxDrawdownR)}/${fmtNum(test.summaryNet.maxDrawdownR)} |`
      );
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'trade-management-comparison.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
