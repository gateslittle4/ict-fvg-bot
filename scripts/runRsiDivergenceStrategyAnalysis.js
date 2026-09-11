#!/usr/bin/env node
// runRsiDivergenceStrategyAnalysis.js
// Usage: node scripts/runRsiDivergenceStrategyAnalysis.js <dir-with-csvs>
//
// Classic technical-analysis "RSI divergence" (Wilder/Welles-style),
// genuinely different from BOTH already-tested divergence-adjacent
// strategies in this project:
//   - NOT the already-validated "Divergence" (a PAIR trade, US100 vs
//     US500 log-ratio z-score — buy the laggard).
//   - NOT the already-validated RSI(2) Connors mean-reversion (an extreme
//     RSI(2) READING + EMA200 filter — no comparison to indicator
//     history, no divergence involved).
// This one is a SINGLE-instrument momentum-divergence reversal: price
// makes a new swing extreme that RSI(14) — the standard Wilder-smoothed
// period, distinct from Connors' short RSI(2) — does NOT confirm. See
// src/backtest/rsiDivergence.js for the full method writeup: swing pivots
// reuse this project's existing detectSwingPoints (no-lookahead, same
// discipline everywhere), entry at next-day open once both pivots are
// confirmed, stop = 2xATR(14) (reused exactly from RSI-2/Turtle), target =
// fixed 1:3 R:R (reused from FVG/Order Block/OTE/Divergence), 10-trading-
// day timeout (reused from RSI-2/Bollinger/Turtle Soup). One open position
// at a time, same standalone edge-quality convention as every other
// exploratory script here.
//
// Daily bars (resampleCandles, same DAY_MS convention as RSI-2/Bollinger).
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project. All parameters above
// were fixed BEFORE running this script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runRsiDivergenceBacktest } from '../src/backtest/rsiDivergence.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
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
function verdict(trainExp, testExp) {
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runRsiDivergenceStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT #4 : divergence RSI(14) classique (Wilder)');
  md.push('');
  md.push(
    "⚠ Mécanisme SINGLE-instrument, à ne pas confondre avec la Divergence déjà validée (paire US100/US500, " +
      "log-ratio) ni avec la RSI(2) Connors déjà validée (lecture extrême + filtre EMA200, sans comparaison à " +
      "l'historique de l'indicateur). Ici : divergence classique entre le PRIX et le RSI(14) Wilder (lissage " +
      "standard, différent du RSI(2) à moyenne simple de Connors) sur deux points de swing consécutifs CONFIRMÉS " +
      "(détection réutilisée de marketStructure.js, même discipline no-lookahead). Divergence haussière = prix fait " +
      "un plus bas plus bas alors que le RSI fait un plus bas plus haut ; divergence baissière = symétrique sur les " +
      "plus hauts. Bougies journalières. Entrée à l'ouverture du jour SUIVANT la confirmation. Stop = 2xATR(14) " +
      "(même convention que RSI-2/Turtle). Cible = 1:3 fixe (même convention que FVG/Order Block/OTE/Divergence). " +
      "Timeout 10 jours (même convention que RSI-2/Bollinger/Turtle Soup). Un seul guet et une seule position " +
      "suivis à la fois. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout " +
      "ailleurs. Testé sur les 5 instruments disponibles (US100, US500, XAUUSD, EURUSD, GBPUSD) — EURUSD/GBPUSD " +
      "avaient été retirés du plan pour le FVG (aucune config FVG testée n'y montrait d'edge), mais rien n'indique " +
      "a priori qu'un mécanisme complètement différent comme celui-ci serait limité aux mêmes instruments."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runRsiDivergenceBacktest(trainDaily);
    const testTrades = runRsiDivergenceBacktest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'rsi-divergence-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
