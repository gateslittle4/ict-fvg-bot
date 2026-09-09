#!/usr/bin/env node
// runMultiPositionAnalysis.js
// Usage: node scripts/runMultiPositionAnalysis.js
//
// "Et si on retire le netting, et on accepte 2 positions à la fois?" (user
// question, 2026-09, prompted by the forward-test's low trade count). Same
// signals/entries/stops as the validated production config
// (CONFIG.fvg.perSymbol, rrMultiple 5/5/4 - already in production, not a new
// search) - only the netting cap changes: 1 (current, baseline) vs 2
// concurrent positions per symbol. Screened on TRAIN (2019-2023), confirmed
// on TEST (2024-2025), then also checked against the 2026 forward-test data
// (data/forward-test-2026/) since that's what prompted the question.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBacktestMultiPosition } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet } from '../src/backtest/gridRunner.js';
import { CONFIG } from '../src/config.js';

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }

function runOne(candles, symbol, cfg, spread, maxConcurrentPositions) {
  const { engine } = buildFilteredEngine(candles, symbol, cfg);
  const raw = runBacktestMultiPosition({
    candles,
    symbol,
    fvgEngine: engine,
    stopMode: cfg.stopMode,
    rrMultiple: cfg.rrMultiple,
    maxConcurrentPositions,
  });
  return withNet(raw, spread);
}

function main() {
  const histDir = process.argv[2] || 'data/backtest-input';
  const cutoffMs = new Date('2024-01-01T00:00:00Z').getTime();

  console.log('# Netting (1 position) vs 2 positions simultanées — config de production inchangée\n');

  for (const symbol of CONFIG.symbols) {
    const cfg = CONFIG.fvg.perSymbol[symbol];
    if (!cfg) continue;
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    console.log(`## ${symbol} (${cfg.variant}, ${cfg.stopMode}, 1:${cfg.rrMultiple})\n`);

    // --- Historical train/test (2019-2025) ---
    const histPath = path.join(histDir, `${symbol}.csv`);
    if (fs.existsSync(histPath)) {
      const { candles } = loadCandlesFromCsv(histPath);
      const trainCandles = candles.filter((c) => c.time < cutoffMs);
      const testCandles = candles.filter((c) => c.time >= cutoffMs);

      console.log('### Historique 2019-2025 (train/test)');
      console.log('| Positions max | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test)* |');
      console.log('|---|---|---|---|---|---|');
      for (const maxPos of [1, 2]) {
        const train = runOne(trainCandles, symbol, cfg, spread, maxPos);
        const test = runOne(testCandles, symbol, cfg, spread, maxPos);
        console.log(
          `| ${maxPos} | ${train.summaryNet.totalSignals}/${test.summaryNet.totalSignals} | ` +
            `${fmtPct(train.summaryNet.winRate)}/${fmtPct(test.summaryNet.winRate)} | ` +
            `${fmtNum(train.summaryNet.avgR)}/${fmtNum(test.summaryNet.avgR)} | ` +
            `${fmtNum(train.summaryNet.profitFactor)}/${fmtNum(test.summaryNet.profitFactor)} | ` +
            `${fmtNum(train.summaryNet.maxDrawdownR)}/${fmtNum(test.summaryNet.maxDrawdownR)} |`
        );
      }
      console.log('*avec 2 positions, ce chiffre est une BORNE BASSE - voir la mise en garde dans backtestEngine.js (deux trades exposent jusqu\'à 2R de risque simultané, non capturé par ce calcul).\n');
    }

    // --- 2026 forward-test data ---
    const fwdPath = path.join('data', 'forward-test-2026', `${symbol}.csv`);
    if (fs.existsSync(fwdPath)) {
      const { candles } = loadCandlesFromCsv(fwdPath);
      console.log('### Forward-test 2026 (~7 mois réels)');
      console.log('| Positions max | Signaux net | Win rate net | Total R net |');
      console.log('|---|---|---|---|');
      for (const maxPos of [1, 2]) {
        const { summaryNet } = runOne(candles, symbol, cfg, spread, maxPos);
        const totalR = (summaryNet.avgR ?? 0) * summaryNet.totalSignals;
        console.log(`| ${maxPos} | ${summaryNet.totalSignals} | ${fmtPct(summaryNet.winRate)} | ${fmtNum(totalR)} |`);
      }
      console.log('');
    }
  }
}

main();
