#!/usr/bin/env node
// runSessionWindowComparison.js
// Usage: node scripts/runSessionWindowComparison.js <dir-with-csvs> [cutoffISODate]
//
// Tests whether a narrower/different New York session window than the
// 8h-12h originally requested does better, for the two configs that
// survived out-of-sample validation on the indices (see
// train-test-validation.md — EURUSD/GBPUSD dropped from the plan, "le setup
// ne marche pas pour eux"):
//   US100: baseline (no HTF filter), structure ON, fvg-edge, 1:3
//   US500: H1_EMA200, structure ON, fvg-edge, 1:3
// (both only ever tested so far with the NY AM 08:00-12:00 window).
//
// Candidate windows include the US cash-equity open (09:30 NY) specifically
// because US100/US500 are index CFDs that track underlying equity indices —
// unlike EURUSD/GBPUSD, the 09:30 NYSE/Nasdaq open is a structurally
// meaningful liquidity event for these two instruments, not just an
// arbitrary sub-window of the AM session.
//
// Method (to keep the same discipline as train-test-validation.md): for
// each symbol, screen every candidate window on TRAIN data (pre-cutoff),
// then re-check only the best-on-train window on TEST data (post-cutoff,
// never used to pick anything) to see if it actually holds up, or if a
// narrower window just curve-fit to the training years.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runOneConfig, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

const CANDIDATE_WINDOWS = [
  { label: '08h-12h (référence, celle validée jusqu\'ici)', startHour: 8, endHour: 12 },
  { label: '08h-09h30 (pré-ouverture NY)', startHour: 8, endHour: 9.5 },
  { label: '09h30-11h (ouverture Wall Street + 1h30)', startHour: 9.5, endHour: 11 },
  { label: '09h-10h30 (autour de l\'ouverture)', startHour: 9, endHour: 10.5 },
  { label: '10h-11h («Silver Bullet» ICT)', startHour: 10, endHour: 11 },
  { label: '07h-10h (overlap Londres-NY)', startHour: 7, endHour: 10 },
];

const HELD_UP_CONFIG = {
  US100: { variant: 'baseline', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true },
  US500: { variant: 'H1_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true },
};

function fmtPct(x) {
  return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
}
function fmtNum(x, d = 2) {
  return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d);
}

function rankByNetR(rows) {
  return [...rows].sort((a, b) => {
    const bScore = b.summary.totalSignals >= MIN_SIGNALS_FOR_RANKING ? b.summaryNet.avgR : -Infinity;
    const aScore = a.summary.totalSignals >= MIN_SIGNALS_FOR_RANKING ? a.summaryNet.avgR : -Infinity;
    return bScore - aScore;
  });
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runSessionWindowComparison.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const mdSections = [];
  mdSections.push('# Comparaison de fenêtres de session NY — ICT FVG (M15)');
  mdSections.push('');
  mdSections.push(
    "⚠ Méthode : chaque fenêtre candidate est testée sur TRAIN (avant " +
      `${cutoffArg}) pour les deux configs déjà validées hors-échantillon (biais HTF + structure ICT selon le cas, ` +
      'swing, 1:3). La meilleure fenêtre par R net sur TRAIN est ensuite réévaluée sur TEST (après cette date, jamais ' +
      'utilisé pour choisir) — même logique que train-test-validation.md, pour ne pas se faire piéger par une fenêtre ' +
      'qui coller juste par hasard aux années de train.'
  );
  mdSections.push('');

  for (const [symbol, cfg] of Object.entries(HELD_UP_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    console.error(`[${symbol}] train=${trainCandles.length} candles, test=${testCandles.length} candles`);

    mdSections.push(`## ${symbol} (${cfg.variant}, structure ${cfg.structureEnabled ? 'ON' : 'off'}, ${cfg.stopMode}, 1:${cfg.rrMultiple})`);
    mdSections.push('### Sur TRAIN, chaque fenêtre candidate');
    mdSections.push('| Fenêtre NY | Signaux viables | Win rate net | R net | Profit factor (net) |');
    mdSections.push('|---|---|---|---|---|');

    const trainRows = CANDIDATE_WINDOWS.map((w) => {
      const r = runOneConfig(trainCandles, symbol, spread, { ...cfg, sessionWindow: w });
      return { window: w, result: r };
    });
    for (const { window, result } of trainRows) {
      const n = result.summaryNet;
      const note = result.summary.totalSignals < MIN_SIGNALS_FOR_RANKING ? ' (échantillon faible)' : '';
      mdSections.push(`| ${window.label} | ${n.totalSignals}${note} | ${fmtPct(n.winRate)} | ${fmtNum(n.avgR)} | ${fmtNum(n.profitFactor)} |`);
    }
    mdSections.push('');

    const ranked = rankByNetR(trainRows.map((r) => r.result));
    const bestIdx = trainRows.findIndex((r) => r.result === ranked[0]);
    const best = trainRows[bestIdx];

    mdSections.push(`### Meilleure fenêtre sur TRAIN (${best.window.label}), réévaluée sur TEST`);
    const testResult = runOneConfig(testCandles, symbol, spread, { ...cfg, sessionWindow: best.window });
    const referenceResult = runOneConfig(testCandles, symbol, spread, { ...cfg, sessionWindow: CANDIDATE_WINDOWS[0] });
    mdSections.push('| | Signaux viables | Win rate net | R net | Profit factor (net) |');
    mdSections.push('|---|---|---|---|---|');
    mdSections.push(
      `| ${best.window.label} (TRAIN) | ${best.result.summaryNet.totalSignals} | ${fmtPct(best.result.summaryNet.winRate)} | ${fmtNum(best.result.summaryNet.avgR)} | ${fmtNum(best.result.summaryNet.profitFactor)} |`
    );
    mdSections.push(
      `| ${best.window.label} (TEST) | ${testResult.summaryNet.totalSignals} | ${fmtPct(testResult.summaryNet.winRate)} | ${fmtNum(testResult.summaryNet.avgR)} | ${fmtNum(testResult.summaryNet.profitFactor)} |`
    );
    mdSections.push(
      `| Référence 08h-12h (TEST) | ${referenceResult.summaryNet.totalSignals} | ${fmtPct(referenceResult.summaryNet.winRate)} | ${fmtNum(referenceResult.summaryNet.avgR)} | ${fmtNum(referenceResult.summaryNet.profitFactor)} |`
    );
    mdSections.push('');
  }

  const outMd = path.join(dir, 'session-window-comparison.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
