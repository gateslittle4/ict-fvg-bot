#!/usr/bin/env node
// runRRMultipleSweep.js
// Usage: node scripts/runRRMultipleSweep.js <dir-with-csvs>
//
// Tests "reduce the R:R to raise the win rate" directly: same entries, same
// stops (same signals, same filters - US100 H4/EMA200, US500 H1/EMA50,
// structure ON, session 10h-11h, sweep ON) - only the TARGET distance
// changes (rrMultiple), which mechanically moves the win rate since a closer
// target is easier to reach before the stop is hit. Screened on TRAIN
// (2019-2023), verified on TEST (2024-2025), same verdict rule used
// everywhere else in this project (holds up = test expectancy still
// positive and >= 30% of train expectancy).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runOneConfig } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const RR_VALUES = [3, 2.5, 2, 1.5, 1];
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };

const SYMBOL_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
};

function splitCandles(candles) {
  return {
    train: candles.filter((c) => c.time < TRAIN_CUTOFF),
    test: candles.filter((c) => c.time >= TRAIN_CUTOFF),
  };
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined ? x.toFixed(d) : '—'; }

function verdict(trainExpectancy, testExpectancy) {
  if (testExpectancy === null || testExpectancy === undefined) return '❓ pas assez de trades test';
  if (testExpectancy <= 0) return '❌ ne tient pas';
  if (trainExpectancy > 0 && testExpectancy >= 0.3 * trainExpectancy) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runRRMultipleSweep.js <dir-with-csvs>');
    process.exit(1);
  }

  const mdSections = [];
  mdSections.push('# Baisser le R:R pour augmenter le win rate — même setup, cible plus proche');
  mdSections.push('');
  mdSections.push(
    '⚠ Mêmes entrées, mêmes stops (mêmes signaux, mêmes filtres : structure ON, session 10h-11h, sweep ON) - ' +
      'seule la distance de la cible change avec rrMultiple. Écran sur TRAIN (2019-2023), vérification sur TEST ' +
      '(2024-2025), même règle de verdict que partout ailleurs dans ce projet (tient = espérance test positive ET ' +
      '>= 30% de l\'espérance train).'
  );
  mdSections.push('');

  for (const [symbol, baseCfg] of Object.entries(SYMBOL_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) continue;
    const { candles } = loadCandlesFromCsv(filePath);
    const { train, test } = splitCandles(candles);
    const spread = DEFAULT_SPREADS[symbol];

    mdSections.push(`## ${symbol}`);
    mdSections.push('| R:R | Trades train | Win rate train | PF train | Espérance train (R) | Trades test | Win rate test | PF test | Espérance test (R) | Verdict |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|');

    for (const rrMultiple of RR_VALUES) {
      const cfg = { ...baseCfg, rrMultiple };
      const trainResult = runOneConfig(train, symbol, spread, cfg);
      const testResult = runOneConfig(test, symbol, spread, cfg);
      const trainS = trainResult.summaryNet;
      const testS = testResult.summaryNet;
      const v = verdict(trainS.expectancyR, testS.expectancyR);
      mdSections.push(
        `| 1:${rrMultiple} | ${trainS.totalSignals} | ${fmtPct(trainS.winRate)} | ${fmtNum(trainS.profitFactor)} | ${fmtNum(trainS.expectancyR)} | ${testS.totalSignals} | ${fmtPct(testS.winRate)} | ${fmtNum(testS.profitFactor)} | ${fmtNum(testS.expectancyR)} | ${v} |`
      );
      console.error(`[${symbol} @ 1:${rrMultiple}] train n=${trainS.totalSignals} wr=${fmtPct(trainS.winRate)} | test n=${testS.totalSignals} wr=${fmtPct(testS.winRate)}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'rr-multiple-sweep.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
