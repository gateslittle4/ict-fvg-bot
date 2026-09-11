#!/usr/bin/env node
// runAsianRangeBreakoutStrategyAnalysis.js
// Usage: node scripts/runAsianRangeBreakoutStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Asian Range Breakout" — a SECOND new ICT concept this session,
// deliberately a BREAKOUT/continuation mechanism (not a reversal like Judas
// Swing): the ICT Asian killzone (20:00-00:00 NY time, never used elsewhere
// in this project) forms a range; the first candle to CLOSE beyond that
// range during the Asian-close-to-London-killzone window (00:00-05:00 NY)
// triggers a trade in the breakout direction. Distinct from the
// already-rejected ORB (which uses the NY cash-equity open 09:30-10:00 and
// forces a same-day close) and from Judas Swing (PDH/PDL sweep+reclaim
// reversal during 02:00-05:00 NY). See src/backtest/asianRangeBreakout.js
// for the full method writeup: M15 bars, stop = opposite side of the Asian
// range (classic ORB stop convention, reused not reinvented), fixed 1:3
// R:R, same 480 M15-candle timeout used for FVG/OTE/Judas Swing.
//
// Tested on all 5 available instruments. Screened on TRAIN (2019-2023),
// verified on TEST (2024-2025), same verdict rule as everywhere else
// (including the "not enough trades" guard). All parameters above were
// fixed BEFORE running this script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runAsianRangeBreakoutBacktest } from '../src/backtest/asianRangeBreakout.js';

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
    console.error('Usage: node scripts/runAsianRangeBreakoutStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #8 : Asian Range Breakout');
  md.push('');
  md.push(
    "⚠ Deuxième nouveau concept ICT de cette session, cette fois un mécanisme de CASSURE/continuation (pas une " +
      "reversal comme le Judas Swing) : la killzone asiatique ICT (20h-00h heure de New York, jamais utilisée " +
      "ailleurs dans ce projet) forme un range ; la première bougie qui CLÔTURE au-delà de ce range pendant la " +
      "fenêtre 00h-05h (de la clôture asiatique à la fin de la killzone Londres) déclenche un trade dans le sens " +
      "de la cassure. Différent de l'ORB déjà rejeté (qui utilise l'ouverture actions NY 09h30-10h00 et force une " +
      "clôture le jour même) et du Judas Swing (sweep+reclaim du PDH/PDL, 02h-05h). Bougies M15. Stop = côté " +
      "opposé du range asiatique (même convention que l'ORB : \"le range définit son propre risque\"). Cible fixe " +
      "1:3, timeout 480 bougies M15 (mêmes conventions que FVG/OTE/Judas Swing). Testé sur les 5 instruments " +
      "disponibles. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout " +
      "ailleurs (y compris le garde-fou \"pas assez de trades\")."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = m15.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = m15.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runAsianRangeBreakoutBacktest(trainCandles);
    const testTrades = runAsianRangeBreakoutBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'asian-range-breakout-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
