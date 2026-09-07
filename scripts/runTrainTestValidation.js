#!/usr/bin/env node
// runTrainTestValidation.js
// Usage: node scripts/runTrainTestValidation.js <dir-with-csvs> [cutoffISODate]
//
// Out-of-sample validation for the ICT FVG backtest. This directly answers
// the warning already printed in backtest-report.md: picking the "best"
// config on the same data it was measured on ("data snooping") inflates
// results — some of what looks good is just noise that happened to work on
// that one sample. Here we:
//   1. Split each symbol's candles chronologically at `cutoff` (default
//      2024-01-01T00:00:00Z) into TRAIN (everything before) and TEST
//      (everything from the cutoff on).
//   2. Run the full 168-config grid on TRAIN ONLY and rank by net expectancy —
//      this simulates "what would I have picked, knowing only the past".
//   3. Re-run the exact same top configs (same stopMode/rrMultiple/HTF
//      variant, same code path) on TEST ONLY, which the grid search never
//      saw, and report train vs. test side by side.
// A config that "survives" is one whose test-period net R is still >= 0 and
// in the same ballpark as train (not just "less negative"). A config whose
// edge disappears or reverses on test is a sign the train result was
// overfitting / noise, not a real edge.
//
// Caveat: HTF EMA bias is recomputed independently on each half (train and
// test each warm up their own EMA from the start of their own window) rather
// than carrying state across the cutoff. This slightly under-informs the
// first few weeks of the test period's bias signal, but avoids leaking any
// train-period information into the test evaluation.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runGrid, runOneConfig, rankKey, MIN_SIGNALS_FOR_RANKING, MIN_DISTANCE_SPREAD_MULTIPLE } from '../src/backtest/gridRunner.js';

const TOP_N = 5; // how many train-period configs per symbol to re-check on test

function fmtPct(x) {
  return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
}
function fmtNum(x, d = 2) {
  return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d);
}
function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function verdict(train, test) {
  if (test.summary.totalSignals < MIN_SIGNALS_FOR_RANKING) return '❓ pas assez de signaux en test';
  const trainR = train.summaryNet.avgR;
  const testR = test.summaryNet.avgR;
  if (testR === null || testR === undefined) return '❓ indéterminé';
  if (testR >= 0 && trainR >= 0 && testR >= trainR * 0.3) return '✅ tient (net positif, proche du train)';
  if (testR >= 0) return '⚠️ positif mais nettement affaibli vs train';
  return '❌ ne tient pas (négatif en test)';
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runTrainTestValidation.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();
  if (Number.isNaN(cutoffMs)) {
    console.error(`Invalid cutoff date: ${cutoffArg}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));
  if (files.length === 0) {
    console.error(`No .csv files found in ${dir}`);
    process.exit(1);
  }

  const mdSections = [];
  mdSections.push('# Validation hors-échantillon (train/test) — ICT FVG (M15)');
  mdSections.push('');
  mdSections.push(
    `⚠ Méthode : chaque instrument est coupé en deux à ${cutoffArg} — TRAIN (avant, utilisé pour choisir les meilleures configs) ` +
      'et TEST (à partir de cette date, jamais vu par la recherche de config). Les 168 configurations (biais HTF x structure ICT ' +
      'x session NY AM x stop x R:R) sont testées sur TRAIN uniquement, classées par R net, puis le Top ' +
      `${TOP_N} est réévalué (même code, mêmes paramètres) sur TEST seul. Coûts de transaction et filtre de viabilité ` +
      `(stop ≥ ${MIN_DISTANCE_SPREAD_MULTIPLE}x le spread) appliqués des deux côtés, comme dans le rapport principal.`
  );
  mdSections.push('');
  mdSections.push(
    "⚠⚠ Le biais EMA H1/H4 et le biais de structure ICT (BOS) sont recalculés indépendamment sur chaque moitié (train et " +
      "test démarrent chacun leur propre warm-up/premiers pivots), pour ne faire fuiter aucune information de la période " +
      "train vers la période test. Verdict : ✅ = l'edge net tient (positif et proche du train), ⚠️ = positif mais " +
      'nettement affaibli, ❌ = négatif en test (le résultat train était probablement du bruit statistique / ' +
      'surapprentissage).'
  );
  mdSections.push('');

  let anyOutput = false;

  for (const file of files) {
    const symbol = path.basename(file, '.csv').toUpperCase();
    const filePath = path.join(dir, file);
    let loaded;
    try {
      loaded = loadCandlesFromCsv(filePath);
    } catch (err) {
      console.error(`[skip] ${file}: ${err.message}`);
      continue;
    }
    const { candles } = loaded;
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);

    if (trainCandles.length < 200 || testCandles.length < 200) {
      console.error(
        `[skip] ${symbol}: train=${trainCandles.length} test=${testCandles.length} candles — too few on one side of the cutoff`
      );
      continue;
    }

    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    console.error(`[${symbol}] train ${fmtDate(trainCandles[0].time)}..${fmtDate(trainCandles.at(-1).time)} (${trainCandles.length} candles), ` +
      `test ${fmtDate(testCandles[0].time)}..${fmtDate(testCandles.at(-1).time)} (${testCandles.length} candles)`);

    const trainResults = runGrid(trainCandles, symbol, spread);
    const topTrain = [...trainResults].sort((a, b) => rankKey(b) - rankKey(a)).slice(0, TOP_N);

    mdSections.push(`## ${symbol}`);
    mdSections.push(
      `TRAIN: ${trainCandles.length} bougies (${fmtDate(trainCandles[0].time)} → ${fmtDate(trainCandles.at(-1).time)}) — ` +
        `TEST: ${testCandles.length} bougies (${fmtDate(testCandles[0].time)} → ${fmtDate(testCandles.at(-1).time)}).`
    );
    mdSections.push('');
    mdSections.push(`### Top ${TOP_N} sur TRAIN, réévalué sur TEST`);
    mdSections.push('| # | Config | Structure | Session | Signaux (train / test) | Win rate net (train / test) | R net (train / test) | Profit factor net (train / test) | Verdict |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|');

    topTrain.forEach((train, i) => {
      const configLabel = `${train.variant} / ${train.stopMode} / 1:${train.rrMultiple}`;
      const test = runOneConfig(testCandles, symbol, spread, {
        variant: train.variant,
        stopMode: train.stopMode,
        rrMultiple: train.rrMultiple,
        structureEnabled: train.structureEnabled,
        sessionEnabled: train.sessionEnabled,
      });
      const v = verdict(train, test);
      mdSections.push(
        `| ${i + 1} | ${configLabel} | ${train.structureEnabled ? 'ON' : 'off'} | ${train.sessionEnabled ? 'ON' : 'off'} | ` +
          `${train.summaryNet.totalSignals} / ${test.summaryNet.totalSignals} | ` +
          `${fmtPct(train.summaryNet.winRate)} / ${fmtPct(test.summaryNet.winRate)} | ` +
          `${fmtNum(train.summaryNet.avgR)} / ${fmtNum(test.summaryNet.avgR)} | ` +
          `${fmtNum(train.summaryNet.profitFactor)} / ${fmtNum(test.summaryNet.profitFactor)} | ${v} |`
      );
    });
    mdSections.push('');
    anyOutput = true;
  }

  if (!anyOutput) {
    console.error('No usable results produced - check the CSV files and cutoff date above.');
    process.exit(1);
  }

  const outMd = path.join(dir, 'train-test-validation.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
