#!/usr/bin/env node
// runOteStrategyAnalysis.js
// Usage: node scripts/runOteStrategyAnalysis.js <dir-with-csvs>
//
// A genuinely new ICT concept for this project: "Optimal Trade Entry" (OTE)
// — one of the most widely published ICT ideas, never tested here before.
// Unlike FVG (a 3-candle gap) or Order Block (the last opposite-colored
// candle before a BOS), OTE trades a Fibonacci retracement (61.8%-79%,
// the standard published range) of the impulse leg that produced a
// confirmed Break of Structure. See src/backtest/oteStrategy.js for the
// full method writeup and the no-lookahead discipline (leg origin = last
// CONFIRMED swing point before the BOS; leg extreme = the running high/low
// seen so far since the BOS, recalculated candle-by-candle, never using
// future candles). Stop = beyond the leg origin, target = fixed 1:3 R:R,
// timeout 480 M15 candles, watch window capped at 50 candles — same
// conventions as FVG/Order Block/Divergence, for direct comparability. One
// pending watch and one open position tracked at a time (standalone
// edge-quality test, same convention as Order Block/Divergence).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project. All parameters above
// were fixed BEFORE running this script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runOteBacktest } from '../src/backtest/oteStrategy.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];

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
function verdict(trainExp, testExp) {
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runOteStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #4 : Optimal Trade Entry (OTE, retracement Fibonacci)');
  md.push('');
  md.push(
    "⚠ Encore un mécanisme de détection COMPLÈTEMENT différent du FVG/Order Block/IFVG - au lieu d'un gap ou " +
      "d'une zone de mitigation, on trade un retracement Fibonacci (61.8%-79%, la fourchette publiée standard, " +
      "jamais ajustée sur nos données) de la jambe d'impulsion qui a produit une cassure de structure (BOS). " +
      "Réutilise la détection de swing existante (marketStructure.js, lookback 5). Origine de la jambe (le point " +
      "0%) = dernier point de swing CONFIRMÉ avant le BOS. Extrémité de la jambe (le point 100%) = plus haut/bas " +
      "ATTEINT JUSQU'ICI depuis le BOS, recalculé bougie par bougie sans jamais regarder en avant (exactement " +
      "comme un trader redessine son Fibonacci tant que la jambe continue de s'étendre avant de retracer). " +
      "Bougies M15, remplissage en limite dès que la mèche touche le bord proche de la zone (61.8%), stop = au-delà " +
      "de l'origine de la jambe, cible 1:3 (même convention que FVG/Order Block/Divergence), fenêtre de guet 50 " +
      "bougies après le BOS, timeout 480 bougies. Un seul guet et une seule position suivis à la fois. Écran TRAIN " +
      "(2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. Testé aussi sur " +
      "XAUUSD (contrairement à Order Block, qui n'avait couvert que US100/US500) puisque les données sont " +
      "disponibles et que rien n'indique a priori que ce mécanisme serait limité aux indices."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runOteBacktest(trainCandles);
    const testTrades = runOteBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'ote-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
