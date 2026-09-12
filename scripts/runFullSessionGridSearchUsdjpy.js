#!/usr/bin/env node
// runFullSessionGridSearchUsdjpy.js
// Usage: node scripts/runFullSessionGridSearchUsdjpy.js <dir-with-csvs> [cutoffISODate]
//
// Direct follow-up (2026-09-12) to the EURUSD/GBPUSD version, same session:
// Esdras asked "et pour usdjpy?" after seeing that neither EURUSD nor
// GBPUSD hold up even with a full per-pair search. USDJPY's only FVG result
// so far (fvg-multi-touch-other-pairs-analysis.md) copied the US100 recipe
// VERBATIM, same as EURUSD/GBPUSD - it looked like it "held" mechanically
// (test 1.06R) but was found FRAGILE on closer inspection (quarter-by-
// quarter check: ~95% of test profit from 2 of 4 quarters, one quarter
// outright negative). USDJPY's earlier "11 mechanisms" extension
// (2026-09-11/12) copied ALREADY-VALIDATED configs from other instruments
// for 11 OTHER concepts (Judas Swing, NWOG, etc.) - the raw FVG grid search
// itself was never among them. So, same as EURUSD/GBPUSD: this is the
// FIRST real per-pair-optimized FVG search on USDJPY. Adapted directly from
// runFullSessionGridSearch.js (SAME 1008-config search: 6 session windows x
// every HTF variant x structure on/off x stop mode x R:R x liquidity sweep
// on/off). Screens on TRAIN, verifies the top 5 on TEST (never used to pick
// anything) - same discipline as every other validation script here.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import {
  runOneConfig, MIN_SIGNALS_FOR_RANKING,
  HTF_TIMEFRAMES, EMA_PERIODS, STOP_MODES, RR_MULTIPLES,
} from '../src/backtest/gridRunner.js';

const TOP_N = 5;
const SYMBOLS = ['USDJPY'];

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
    console.error('Usage: node scripts/runFullSessionGridSearchUsdjpy.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const mdSections = [];
  mdSections.push('# Recherche exhaustive FVG (contact unique) : fenêtre horaire x tout le reste — USDJPY');
  mdSections.push('');
  mdSections.push(
    "⚠ Suite directe de \"et pour usdjpy ?\" (2026-09-12), après le même test sur EURUSD/GBPUSD. Le seul résultat " +
      "FVG connu sur USDJPY (multi-contact) reprenait la config US100 TELLE QUELLE et s'est révélé fragile à " +
      "l'examen (voir HANDOFF.md). Ceci est la PREMIÈRE vraie recherche de config propre à USDJPY dans ce projet : " +
      "même recherche exhaustive que celle qui a trouvé les configs US100/US500 (full-session-grid-search.md) - " +
      "6 fenêtres horaires candidates x 168 configs (variante HTF x structure x stop x R:R x liquidity sweep) = " +
      "1008 configs, criblées ensemble sur TRAIN, Top 5 réévalué sur TEST."
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

  const outMd = path.join(dir, 'full-session-grid-search-usdjpy.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
