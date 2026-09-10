#!/usr/bin/env node
// runWeeklyLiquiditySweepStrategyAnalysis.js
// Usage: node scripts/runWeeklyLiquiditySweepStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Previous Week High/Low" (PWH/PWL) liquidity sweep — see
// src/backtest/weeklyLiquiditySweep.js for the full method writeup: week
// boundaries detected directly from the data's own timestamps (same
// technique as nwog.js), PWH/PWL = the prior week's own high/low, signal =
// first candle in a week whose wick pierces PWH/PWL but whose close
// reclaims back inside it (same mechanic as Judas Swing, scaled up from
// daily to weekly reference levels, no time-of-day restriction), entry one
// candle after the reclaim, stop beyond the sweep's own extreme, fixed 1:3
// R:R, 480 M15-candle timeout.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runWeeklySweepBacktest } from '../src/backtest/weeklyLiquiditySweep.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GBPUSD'];

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  const net = viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
  return { net, droppedAsNonViable: trades.length - viable.length };
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runWeeklyLiquiditySweepStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #13 : Weekly Liquidity Sweep (PWH/PWL, sweep + reclaim)');
  md.push('');
  md.push(
    "⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Même mécanique que Judas Swing " +
      "(sweep de liquidité + clôture de retour à l'intérieur), mais appliquée au plus haut/bas de la " +
      "SEMAINE précédente plutôt qu'au plus haut/bas de la veille, et SANS restriction horaire (aucune " +
      "killzone ICT canonique spécifique aux liquidités hebdomadaires trouvée en recherche — plutôt que " +
      "d'en inventer une non testée, le signal est cherché sur toute la semaine). Limites de semaine " +
      "détectées directement depuis les horodatages réels des données (même technique que nwog.js). " +
      "Entrée une bougie après la bougie de sweep+reclaim, stop au-delà de l'extrême du sweep, cible fixe " +
      "1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 5 instruments " +
      "disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que " +
      "partout ailleurs (y compris le garde-fou \"pas assez de trades\")."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runWeeklySweepBacktest(trainCandles);
    const testTrades = runWeeklySweepBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'weekly-liquidity-sweep-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
