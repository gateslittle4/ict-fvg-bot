#!/usr/bin/env node
// runDynamicLiquidityTargetAnalysis.js
// Usage: node scripts/runDynamicLiquidityTargetAnalysis.js <dir-with-csvs> [cutoffISODate]
//
// Esdras (2026-09-16): "on teste autre chose pour augmenter nos trades
// gagnants?" -> "Teste aussi sur US500/XAUUSD". Tests the ICT "draw on
// liquidity" DYNAMIC target idea (src/backtest/dynamicLiquidityTarget.js)
// against the CURRENT production config of ALL THREE FVG instruments
// (US100/US500/XAUUSD - see src/config.js's fvg.perSymbol).
//
// Same entries/stops as production per symbol; ONLY the target changes:
// instead of each symbol's own fixed rrMultiple, the target is the nearest
// still-unswept opposite-side swing point (resting liquidity), clamped to
// [1.5, 6]x the stop distance, falling back to the fixed 1:3 default when no
// such level exists. Compared on TRAIN (pre-cutoff) then confirmed on TEST
// (post-cutoff) - same discipline as runExtendedTargetAnalysis.js.
//
// US100 uses MultiTouchFvgEngine (cfg.multiTouch:true in production);
// US500/XAUUSD use the plain buildFilteredEngine() path - exactly mirroring
// _buildFvgEngine()'s own branch in liveStrategyEngine.js, so this never
// silently tests a different engine than what's actually live.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { runBacktestDynamicTarget } from '../src/backtest/dynamicLiquidityTarget.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { withNet, buildFilteredEngine, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

// Copied verbatim from CONFIG.fvg.perSymbol (src/config.js) - the LIVE
// production config for each symbol, minus the fixed rrMultiple which the
// dynamic variant replaces (kept alongside as `productionRR` for the
// baseline comparison).
const SYMBOL_CONFIGS = {
  US100: {
    cfg: { variant: 'H4_EMA200', stopMode: 'fvg-edge', structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 }, liquiditySweepEnabled: true, multiTouch: true },
    productionRR: 5,
  },
  US500: {
    cfg: { variant: 'H1_EMA50', stopMode: 'fvg-edge', structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 }, liquiditySweepEnabled: true },
    productionRR: 5,
  },
  XAUUSD: {
    cfg: { variant: 'H4_EMA20', stopMode: 'swing', structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 }, liquiditySweepEnabled: true },
    productionRR: 4,
  },
};

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }

function buildEngine(candles, symbol, cfg) {
  if (cfg.multiTouch) {
    const checkFilters = buildMultiTouchFilterPredicate(candles, symbol, cfg);
    return new MultiTouchFvgEngine({ symbol, checkFilters });
  }
  return buildFilteredEngine(candles, symbol, cfg).engine;
}

function runFixed(candles, symbol, cfg, rrMultiple, spread) {
  const engine = buildEngine(candles, symbol, cfg);
  const trades = runBacktest({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple });
  return withNet(trades, spread);
}

function runDynamic(candles, symbol, cfg, spread) {
  const engine = buildEngine(candles, symbol, cfg);
  const trades = runBacktestDynamicTarget({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode });
  return withNet(trades, spread);
}

function report(label, result) {
  const s = result.summaryNet;
  console.log(`  ${label} : n=${s.totalSignals} (${s.wins}W/${s.losses}L/${s.timeouts}TO) WR=${fmtPct(s.winRate)} R_moy=${fmtNum(s.avgR)} R_total=${fmtNum(s.finalEquityR)} PF=${fmtNum(s.profitFactor)} DDmax=${fmtNum(s.maxDrawdownR)}R`);
  return s;
}

function liquidityDetail(label, result) {
  const withLiq = result.trades.filter((t) => t.usedLiquidity);
  const fallback = result.trades.filter((t) => !t.usedLiquidity);
  const avgRRUsed = result.trades.length > 0 ? result.trades.reduce((s, t) => s + t.rrMultipleUsed, 0) / result.trades.length : null;
  console.log(`  ${label} : liquidité trouvée ${withLiq.length}/${result.trades.length} (${fmtPct(result.trades.length > 0 ? withLiq.length / result.trades.length : null)}), repli 1:3 par défaut ${fallback.length}, RR moyen utilisé ${fmtNum(avgRRUsed)}`);
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runDynamicLiquidityTargetAnalysis.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  for (const [symbol, { cfg, productionRR }] of Object.entries(SYMBOL_CONFIGS)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    console.log(`\n=== ${symbol} : cible fixe 1:${productionRR} (production) vs cible dynamique (liquidité, clamp [1.5,6]) ===`);
    console.log(`Train (< ${cutoffArg}) : ${trainCandles.length} bougies, Test (>= ${cutoffArg}) : ${testCandles.length} bougies\n`);

    console.log('TRAIN :');
    const fixedTrain = report('Fixe        ', runFixed(trainCandles, symbol, cfg, productionRR, spread));
    const dynTrainResult = runDynamic(trainCandles, symbol, cfg, spread);
    const dynTrain = report('Dynamique   ', dynTrainResult);

    console.log('\nTEST :');
    const fixedTest = report('Fixe        ', runFixed(testCandles, symbol, cfg, productionRR, spread));
    const dynTestResult = runDynamic(testCandles, symbol, cfg, spread);
    const dynTest = report('Dynamique   ', dynTestResult);

    console.log('\nDétail cible dynamique :');
    liquidityDetail('Train', dynTrainResult);
    liquidityDetail('Test ', dynTestResult);

    const trainImprovement = dynTrain.avgR - fixedTrain.avgR;
    const testImprovement = dynTest.avgR - fixedTest.avgR;
    console.log(`\nVerdict ${symbol} :`);
    console.log(`  Train : ${trainImprovement >= 0 ? '+' : ''}${trainImprovement.toFixed(3)}R d'espérance vs fixe (${fmtNum(fixedTrain.avgR)} -> ${fmtNum(dynTrain.avgR)})`);
    console.log(`  Test  : ${testImprovement >= 0 ? '+' : ''}${testImprovement.toFixed(3)}R d'espérance vs fixe (${fmtNum(fixedTest.avgR)} -> ${fmtNum(dynTest.avgR)})`);
    if (fixedTrain.totalSignals < MIN_SIGNALS_FOR_RANKING || fixedTest.totalSignals < MIN_SIGNALS_FOR_RANKING) {
      console.log('  ⚠️  Échantillon faible sur au moins une fenêtre - à interpréter avec prudence.');
    }
  }
}

main();
