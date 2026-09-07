#!/usr/bin/env node
// runFullSessionGridSearch.js
// Usage: node scripts/runFullSessionGridSearch.js <dir-with-csvs> [cutoffISODate]
//
// The most exhaustive search run so far. Every earlier step fixed one
// dimension before searching the others:
//   - session-window-comparison.md picked the best window with structure ON,
//     no HTF bias, no sweep.
//   - silver-bullet-grid-search.md then fixed the window at 10h-11h and
//     searched variant/structure/stop/R:R/sweep.
// This instead crosses BOTH at once: every candidate session window x every
// HTF variant x structure on/off x stop mode x R:R x liquidity sweep
// on/off, in one combined search (6 windows x 168 = 1008 configs per
// symbol). If 10h-11h + H4/EMA200 (US100) or H1/EMA50 (US500) really is the
// best combination, it should still win here - if not, this is how we'd
// find out. Screens on TRAIN, verifies the top 5 on TEST (never used to
// pick anything) - same discipline as every other validation script here.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import {
  runOneConfig, MIN_SIGNALS_FOR_RANKING,
  HTF_TIMEFRAMES, EMA_PERIODS, STOP_MODES, RR_MULTIPLES,
} from '../src/backtest/gridRunner.js';

const TOP_N = 5;
const SYMBOLS = ['US100', 'US500'];

const CANDIDATE_WINDOWS = [
  { label: '08h-12h', startHour: 8, endHour: 12 },
  { label: '08h-09h30', startHour: 8, endHour: 9.5 },
  { label: '09h30-11h', startHour: 9.5, endHour: 11 },
  { label: '09h-10h30', startHour: 9, endHour: 10.5 },
  { label: '10h-11h (Silver Bullet)', startHour: 10, endHour: 11 },
  { label: '07h-10h (overlap Londres-NY)', startHour: 7, endHour: 10 },
];

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }

function rankKeyFull(r) {
  if (r.summary.totalSignals < MIN_SIGNALS_FOR_RANKING) return -Infinity;
  return r.summaryNet.avgR ?? -Infinity;
}

function runFullGrid(candles, symbol, spread) {
  const results = [];
  const variants = ['baseline', ...HTF_TIMEFRAMES.flatMap((tf) => EMA_PERIODS.map((p) => `${tf.key}_EMA${p}`))];
  for (const window of CANDIDATE_WINDOWS) {
    for (const variant of variants) {
      for (const structureEnabled of [false, true]) {
        for (const stopMode of STOP_MODES) {
          for (const rrMultiple of RR_MULTIPLES) {
            for (const liquiditySweepEnabled of [false, true]) {
              const r = runOneConfig(candles, symbol, spread, {
                variant, stopMode, rrMultiple, structureEnabled,
                sessionEnabled: true, sessionWindow: window, liquiditySweepEnabled,
              });
              r.sessionWindowLabel = window.label;
              r.sessionWindow = window;
              results.push(r);
            }
          }
        }
      }
    }
  }
  return results;
}

function verdict(train, test) {
  if (test.summary.totalSignals < MIN_SIGNALS_FOR_RANKING) return '❓ pas assez de signaux en test';
  const trainR = train.summaryNet.avgR;
  const testR = test.summaryNet.avgR;
  if (testR === null || testR === undefined) return '❓ indéterminé';
  if (testR >= 0 && trainR >= 0 && testR >= trainR * 0.3) return '✅ tient';
  if (testR >= 0) return '⚠️ affaibli vs train';
  return '❌ ne tient pas';
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runFullSessionGridSearch.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const mdSections = [];
  mdSections.push('# Recherche exhaustive : fenêtre horaire x tout le reste — US100 / US500');
  mdSections.push('');
  mdSections.push(
    '⚠ Recherche la plus complète à ce jour : 6 fenêtres horaires candidates x 168 configs (variante HTF x structure x ' +
      'stop x R:R x liquidity sweep) = 1008 configs par symbole, criblées ensemble sur TRAIN, Top 5 réévalué sur TEST. ' +
      "Contrairement à silver-bullet-grid-search.md qui fixait déjà 10h-11h, ici la fenêtre elle-même fait partie de ce " +
      "qu'on cherche."
  );
  mdSections.push('');

  for (const symbol of SYMBOLS) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    console.error(`[${symbol}] running full 1008-config search over train=${trainCandles.length} / test=${testCandles.length} candles...`);
    const trainResults = runFullGrid(trainCandles, symbol, spread);
    const topTrain = [...trainResults].sort((a, b) => rankKeyFull(b) - rankKeyFull(a)).slice(0, TOP_N);

    mdSections.push(`## ${symbol}`);
    mdSections.push('| # | Fenêtre NY | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|---|---|');

    topTrain.forEach((train, i) => {
      const test = runOneConfig(testCandles, symbol, spread, {
        variant: train.variant, stopMode: train.stopMode, rrMultiple: train.rrMultiple,
        structureEnabled: train.structureEnabled, sessionEnabled: true, sessionWindow: train.sessionWindow,
        liquiditySweepEnabled: train.liquiditySweepEnabled,
      });
      mdSections.push(
        `| ${i + 1} | ${train.sessionWindowLabel} | ${train.variant} | ${train.structureEnabled ? 'ON' : 'off'} | ${train.stopMode} | 1:${train.rrMultiple} | ` +
          `${train.liquiditySweepEnabled ? 'ON' : 'off'} | ${train.summaryNet.totalSignals}/${test.summaryNet.totalSignals} | ` +
          `${fmtPct(train.summaryNet.winRate)}/${fmtPct(test.summaryNet.winRate)} | ${fmtNum(train.summaryNet.avgR)}/${fmtNum(test.summaryNet.avgR)} | ` +
          `${fmtNum(train.summaryNet.profitFactor)}/${fmtNum(test.summaryNet.profitFactor)} | ${verdict(train, test)} |`
      );
    });
    mdSections.push('');
  }

  const outMd = path.join(dir, 'full-session-grid-search.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
