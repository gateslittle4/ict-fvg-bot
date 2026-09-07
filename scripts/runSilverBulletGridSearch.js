#!/usr/bin/env node
// runSilverBulletGridSearch.js
// Usage: node scripts/runSilverBulletGridSearch.js <dir-with-csvs> [cutoffISODate]
//
// Answers "is there a better setup than what we're currently using?" properly
// instead of assuming. Our current US100/US500 configs were originally
// chosen for the OLD 08h-12h NY session window, then just re-pointed at the
// newly-discovered 10h-11h "Silver Bullet" window (session-window-comparison.md)
// without re-searching the OTHER parameters (HTF bias variant, structure
// on/off, stop mode, R:R, liquidity sweep) specifically FOR that window.
// It's entirely possible some other combination does better once the window
// is fixed at 10h-11h - this runs the full grid (variant x structure x
// stopMode x R:R x liquiditySweep = 168 configs) with sessionWindow FIXED to
// 10h-11h, screens on TRAIN, and verifies the top 5 on TEST (never used to
// pick anything) - same discipline as train-test-validation.md.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import {
  runOneConfig, MIN_SIGNALS_FOR_RANKING, MIN_DISTANCE_SPREAD_MULTIPLE,
  HTF_TIMEFRAMES, EMA_PERIODS, STOP_MODES, RR_MULTIPLES,
} from '../src/backtest/gridRunner.js';

const TOP_N = 5;
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const SYMBOLS = ['US100', 'US500'];

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }
function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

function rankKeySilverBullet(r) {
  if (r.summary.totalSignals < MIN_SIGNALS_FOR_RANKING) return -Infinity;
  return r.summaryNet.avgR ?? -Infinity;
}

function runFixedWindowGrid(candles, symbol, spread) {
  const results = [];
  const variants = ['baseline', ...HTF_TIMEFRAMES.flatMap((tf) => EMA_PERIODS.map((p) => `${tf.key}_EMA${p}`))];
  for (const variant of variants) {
    for (const structureEnabled of [false, true]) {
      for (const stopMode of STOP_MODES) {
        for (const rrMultiple of RR_MULTIPLES) {
          for (const liquiditySweepEnabled of [false, true]) {
            results.push(
              runOneConfig(candles, symbol, spread, {
                variant, stopMode, rrMultiple, structureEnabled,
                sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled,
              })
            );
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
    console.error('Usage: node scripts/runSilverBulletGridSearch.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const mdSections = [];
  mdSections.push('# Recherche du meilleur setup, fenêtre 10h-11h FIXÉE — US100 / US500');
  mdSections.push('');
  mdSections.push(
    '⚠ Contrairement à avant (où on a juste repris la config choisie pour 08h-12h et changé la fenêtre), ceci refait une ' +
      'recherche complète (168 configs : variante HTF x structure x stop x R:R x liquidity sweep) avec la fenêtre 10h-11h ' +
      'FIXÉE dès le départ, pour voir si une autre combinaison ferait mieux une fois cette fenêtre choisie. Criblé sur ' +
      `TRAIN (avant ${cutoffArg}), Top ${TOP_N} réévalué sur TEST (jamais utilisé pour choisir).`
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

    console.error(`[${symbol}] running fixed-window grid over train=${trainCandles.length} / test=${testCandles.length} candles...`);
    const trainResults = runFixedWindowGrid(trainCandles, symbol, spread);
    const topTrain = [...trainResults].sort((a, b) => rankKeySilverBullet(b) - rankKeySilverBullet(a)).slice(0, TOP_N);

    mdSections.push(`## ${symbol}`);
    mdSections.push('| # | Variante HTF | Structure | Stop | R visé | Sweep | Signaux (train/test) | Win rate net (train/test) | R net (train/test) | PF net (train/test) | Verdict |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|---|');

    topTrain.forEach((train, i) => {
      const test = runOneConfig(testCandles, symbol, spread, {
        variant: train.variant, stopMode: train.stopMode, rrMultiple: train.rrMultiple,
        structureEnabled: train.structureEnabled, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW,
        liquiditySweepEnabled: train.liquiditySweepEnabled,
      });
      mdSections.push(
        `| ${i + 1} | ${train.variant} | ${train.structureEnabled ? 'ON' : 'off'} | ${train.stopMode} | 1:${train.rrMultiple} | ` +
          `${train.liquiditySweepEnabled ? 'ON' : 'off'} | ${train.summaryNet.totalSignals}/${test.summaryNet.totalSignals} | ` +
          `${fmtPct(train.summaryNet.winRate)}/${fmtPct(test.summaryNet.winRate)} | ${fmtNum(train.summaryNet.avgR)}/${fmtNum(test.summaryNet.avgR)} | ` +
          `${fmtNum(train.summaryNet.profitFactor)}/${fmtNum(test.summaryNet.profitFactor)} | ${verdict(train, test)} |`
      );
    });
    mdSections.push('');
  }

  const outMd = path.join(dir, 'silver-bullet-grid-search.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
