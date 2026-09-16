#!/usr/bin/env node
// runDynamicLiquidityTargetAnalysis.js
// Usage: node scripts/runDynamicLiquidityTargetAnalysis.js <dir-with-csvs> [cutoffISODate]
//
// Esdras (2026-09-16): "on teste autre chose pour augmenter nos trades
// gagnants?" - tests the ICT "draw on liquidity" DYNAMIC target idea
// (src/backtest/dynamicLiquidityTarget.js) against the CURRENT production
// US100 config (H4_EMA200, fvg-edge stop, structure+session(8h-12h)+sweep
// filters ON, multi-touch ON, fixed rrMultiple=5 - see src/config.js).
//
// Same entries/stops as production; ONLY the target changes: instead of a
// fixed 1:5, the target is the nearest still-unswept opposite-side swing
// point (resting liquidity), clamped to [1.5, 6]x the stop distance,
// falling back to the current fixed 1:5 when no such level exists. Compared
// on TRAIN (pre-cutoff) then confirmed on TEST (post-cutoff) - same
// discipline as runExtendedTargetAnalysis.js, whose fixed-RR sweep
// (1:3..1:7) this is meant to be compared against.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { runBacktestDynamicTarget } from '../src/backtest/dynamicLiquidityTarget.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { withNet, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

// Copied verbatim from CONFIG.fvg.perSymbol.US100 (src/config.js) - the
// LIVE production config for this symbol, minus the fixed rrMultiple which
// the dynamic variant replaces.
const US100_CONFIG = {
  variant: 'H4_EMA200',
  stopMode: 'fvg-edge',
  structureEnabled: true,
  sessionEnabled: true,
  sessionWindow: { startHour: 8, endHour: 12 },
  liquiditySweepEnabled: true,
};
const PRODUCTION_RR = 5;

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }

function buildEngine(candles) {
  const checkFilters = buildMultiTouchFilterPredicate(candles, 'US100', US100_CONFIG);
  return new MultiTouchFvgEngine({ symbol: 'US100', checkFilters });
}

function runFixed(candles, spread) {
  const engine = buildEngine(candles);
  const trades = runBacktest({ candles, symbol: 'US100', fvgEngine: engine, stopMode: US100_CONFIG.stopMode, rrMultiple: PRODUCTION_RR });
  return withNet(trades, spread);
}

function runDynamic(candles, spread) {
  const engine = buildEngine(candles);
  const trades = runBacktestDynamicTarget({ candles, symbol: 'US100', fvgEngine: engine, stopMode: US100_CONFIG.stopMode });
  return withNet(trades, spread);
}

function report(label, result) {
  const s = result.summaryNet;
  console.log(`  ${label} : n=${s.totalSignals} (${s.wins}W/${s.losses}L/${s.timeouts}TO) WR=${fmtPct(s.winRate)} R_moy=${fmtNum(s.avgR)} R_total=${fmtNum(s.finalEquityR)} PF=${fmtNum(s.profitFactor)} DDmax=${fmtNum(s.maxDrawdownR)}R`);
  return s;
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runDynamicLiquidityTargetAnalysis.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const { candles } = loadCandlesFromCsv(path.join(dir, 'US100.csv'));
  const trainCandles = candles.filter((c) => c.time < cutoffMs);
  const testCandles = candles.filter((c) => c.time >= cutoffMs);
  const spread = DEFAULT_SPREADS.US100 ?? 0;

  console.log(`\n=== US100 : cible fixe 1:${PRODUCTION_RR} (production) vs cible dynamique (liquidité, clamp [1.5,6]) ===\n`);
  console.log(`Train (< ${cutoffArg}) : ${trainCandles.length} bougies, Test (>= ${cutoffArg}) : ${testCandles.length} bougies\n`);

  console.log('TRAIN :');
  const fixedTrain = report('Fixe 1:5    ', runFixed(trainCandles, spread));
  const dynTrainResult = runDynamic(trainCandles, spread);
  const dynTrain = report('Dynamique   ', dynTrainResult);

  console.log('\nTEST :');
  const fixedTest = report('Fixe 1:5    ', runFixed(testCandles, spread));
  const dynTestResult = runDynamic(testCandles, spread);
  const dynTest = report('Dynamique   ', dynTestResult);

  // Detail on the dynamic variant: how often a real liquidity level was
  // used vs. falling back to the fixed 1:3 default, and the distribution
  // of the clamped RR actually used per trade.
  function liquidityDetail(label, result) {
    const withLiq = result.trades.filter((t) => t.usedLiquidity);
    const fallback = result.trades.filter((t) => !t.usedLiquidity);
    const avgRRUsed = result.trades.length > 0 ? result.trades.reduce((s, t) => s + t.rrMultipleUsed, 0) / result.trades.length : null;
    console.log(`  ${label} : liquidité trouvée ${withLiq.length}/${result.trades.length} (${fmtPct(result.trades.length > 0 ? withLiq.length / result.trades.length : null)}), repli 1:3 par défaut ${fallback.length}, RR moyen utilisé ${fmtNum(avgRRUsed)}`);
  }
  console.log('\nDétail cible dynamique :');
  liquidityDetail('Train', dynTrainResult);
  liquidityDetail('Test ', dynTestResult);

  console.log('\n=== Verdict ===');
  const trainImprovement = dynTrain.avgR - fixedTrain.avgR;
  const testImprovement = dynTest.avgR - fixedTest.avgR;
  console.log(`Train : ${trainImprovement >= 0 ? '+' : ''}${trainImprovement.toFixed(3)}R d'espérance vs fixe (${fmtNum(fixedTrain.avgR)} -> ${fmtNum(dynTrain.avgR)})`);
  console.log(`Test  : ${testImprovement >= 0 ? '+' : ''}${testImprovement.toFixed(3)}R d'espérance vs fixe (${fmtNum(fixedTest.avgR)} -> ${fmtNum(dynTest.avgR)})`);
  if (fixedTrain.totalSignals < MIN_SIGNALS_FOR_RANKING || fixedTest.totalSignals < MIN_SIGNALS_FOR_RANKING) {
    console.log('⚠️  Échantillon faible sur au moins une fenêtre - à interpréter avec prudence.');
  }
}

main();
