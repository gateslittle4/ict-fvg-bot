#!/usr/bin/env node
// runJudasSwingStrategyAnalysis.js
// Usage: node scripts/runJudasSwingStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Judas Swing" — the requested return to a genuinely ICT concept (the
// same family the project's only fully-validated strategy, FVG, came from),
// but a mechanism never tried before: a sweep of the PREVIOUS DAY's
// high/low, reclaimed same-candle, specifically during the ICT London
// killzone (02:00-05:00 NY time) — distinct from the already-tested Order
// Block, IFVG, Turtle Soup, and from the liquidity-sweep CONFLUENCE FILTER
// already wrapped around the validated FVG (that filter uses a
// symmetric-fractal swing pivot, any time of day; this uses the fixed
// PDH/PDL reference, scoped to one specific killzone). See
// src/backtest/judasSwing.js for the full method writeup: M15 bars, PDH/PDL
// via the same daily resampling used project-wide, same-candle wick+reclaim
// (same convention as liquiditySweep.js), one signal per direction per day,
// entry at next-candle open, stop beyond the sweep's own extreme, fixed 1:3
// R:R and the same 480 M15-candle timeout already used for FVG/OTE.
//
// Tested on all 5 available instruments — an ICT session-timing pattern has
// no a priori reason to be limited to the indices/gold.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same verdict
// rule as everywhere else in this project (including the "not enough
// trades" guard). All parameters above were fixed BEFORE running this
// script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runJudasSwingBacktest } from '../src/backtest/judasSwing.js';

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
    console.error('Usage: node scripts/runJudasSwingStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #7 : Judas Swing (killzone Londres)');
  md.push('');
  md.push(
    "⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet (différent de l'Order Block, l'IFVG, le Turtle " +
      "Soup déjà rejetés, et du FILTRE de confluence liquidity sweep déjà en place sur le FVG validé - celui-ci " +
      "utilise un pivot de swing fractal, à toute heure ; celui-ci utilise le plus-haut/plus-bas de la veille " +
      "(PDH/PDL), limité à UNE fenêtre horaire précise). Bougies M15. PDH/PDL = plus haut/plus bas du jour " +
      "calendaire COMPLET précédent (même agrégation journalière que partout ailleurs dans ce projet). Fenêtre : " +
      "killzone Londres ICT (02h-05h heure de New York, publiée telle quelle, distincte de la Silver Bullet " +
      "10h-11h et de l'overlap Londres-NY 07h-10h déjà utilisées pour le FVG validé). Signal = une bougie DANS " +
      "cette fenêtre dont la mèche dépasse le PDH/PDL puis qui clôture de l'autre côté (même convention de " +
      "\"sweep même bougie\" que liquiditySweep.js), au plus un signal par direction par jour. Entrée à " +
      "l'ouverture de la bougie suivante, stop au-delà de l'extrême du sweep, cible fixe 1:3, timeout 480 " +
      "bougies M15 (mêmes conventions que FVG/OTE, rien de nouveau inventé pour la sortie). Testé sur les 5 " +
      "instruments disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict " +
      "que partout ailleurs (y compris le garde-fou \"pas assez de trades\")."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = m15.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = m15.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runJudasSwingBacktest(trainCandles);
    const testTrades = runJudasSwingBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'judas-swing-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
