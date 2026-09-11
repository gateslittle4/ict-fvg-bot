#!/usr/bin/env node
// runUnicornModelStrategyAnalysis.js
// Usage: node scripts/runUnicornModelStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Unicorn Model" — see src/backtest/unicornModel.js for the full
// method writeup: a Breaker Block (failed Order Block, reusing
// breakerBlock.js's exact BOS/OB/break-through mechanic) whose zone
// OVERLAPS a same-direction Fair Value Gap that forms within a bounded
// window afterward. Entry on a retest of the overlap zone, stop beyond the
// breaker's far edge, fixed 1:3 R:R, 480 M15-candle timeout.
//
// Priority per Esdras's explicit "focus on US100/US500" (the only two
// instruments with a genuinely validated edge in this project so far) -
// listed first - but all 6 instruments run for the usual full comparison.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runUnicornModelBacktest } from '../src/backtest/unicornModel.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];

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
    console.error('Usage: node scripts/runUnicornModelStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #14 : Unicorn Model (Breaker Block + FVG en superposition)');
  md.push('');
  md.push(
    "⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. Combine deux PD arrays déjà détectés " +
      "séparément (Breaker Block déjà testé/rejeté, FVG brut) mais jamais requis de coïncider : un Order " +
      "Block cassé (même mécanique que breakerBlock.js — BOS, recherche de l'OB, cassure complète) devient " +
      "un breaker, et l'entrée n'est prise que si un FVG de même sens se forme et CHEVAUCHE la zone du " +
      "breaker dans une fenêtre bornée après la cassure. Entrée sur retest de la zone de chevauchement, " +
      "stop au-delà de l'extrême du breaker, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions " +
      "que partout ailleurs). Priorité donnée à US100/US500 (seuls instruments avec un edge déjà validé " +
      "dans ce projet), mais testé sur les 6 instruments disponibles pour la comparaison habituelle. " +
      "Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runUnicornModelBacktest(trainCandles);
    const testTrades = runUnicornModelBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'unicorn-model-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
