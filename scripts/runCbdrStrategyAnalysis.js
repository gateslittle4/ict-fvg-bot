#!/usr/bin/env node
// runCbdrStrategyAnalysis.js
// Usage: node scripts/runCbdrStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Central Bank Dealer Range" (CBDR) standard-deviation projections —
// fade the market when it reaches the 2x-standard-deviation projection of
// the 14:00-20:00 NY range. See src/backtest/cbdr.js for the full method
// writeup: range height treated as 1 standard deviation, entry one candle
// after the touch, stop beyond the touch candle's own extreme, fixed 1:3
// R:R, 480 M15-candle timeout.
//
// Screened on TRAIN (everything before 2024-01-01), verified on TEST
// (2024-2025), same verdict rule as everywhere else in this project.
//
// 2026-09-18 fix (Esdras: "Ce n'est pas la méthode. On étudie d'abord les
// données passées, donc tu fais le test sur les 15 ans."): the TRAIN filter
// below (`c.time < TRAIN_CUTOFF`) has NO lower bound - it already included
// EVERY candle each symbol's CSV actually has before 2024, regardless of
// how far back that goes. This script's own header used to say "TRAIN
// (2019-2023)" as a blanket label, copied from the project's usual
// 7-year-CSV convention - but data/backtest-input/US100.csv and GER40.csv
// actually start 2010-11-14/15 (XAUUSD 2009-03-15, USDCAD 2010-01-03), so
// TRAIN for those four symbols was ALREADY ~13-15 years deep, silently, the
// whole time - the label just undersold it. EURUSD/GBPUSD/UKX/AUX genuinely
// do start 2018-2019, so "2019-2023" was accurate for THOSE. Not a
// calculation bug (the 2024-01-01 cut is unchanged, still correct) - the
// table below now reports each symbol's REAL train-window start date
// (read straight off its own CSV) instead of a single blanket label, so
// this is never ambiguous again.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runCbdrBacktest } from '../src/backtest/cbdr.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'GER40', 'UKX', 'AUX'];

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
    console.error('Usage: node scripts/runCbdrStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT : CBDR (Central Bank Dealer Range, fade à la projection 2x)');
  md.push('');
  md.push(
    "⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet. CBDR = range 14:00-20:00 NY, sa hauteur est " +
      "traitée comme 1 écart-type. Fade déclenché quand un prix ultérieur atteint la projection 2x (haut du range " +
      "+ 2×hauteur, ou bas du range − 2×hauteur) — niveau que la littérature ICT cite comme la zone naturelle de " +
      "premier retournement. Entrée une bougie après le toucher, stop au-delà de l'extrême de cette bougie, cible " +
      "fixe 1:3, timeout 480 bougies M15. Filtre \"hauteur idéale 20-40 pips\" de la littérature ICT " +
      "délibérément PAS appliqué (concept forex, ne se traduit pas proprement sur les indices). Écran TRAIN " +
      "(tout l'historique disponible avant le 2024-01-01 — voir la colonne \"Début train\" ci-dessous, jusqu'à " +
      "~15 ans selon le symbole, pas juste 2019) / vérification TEST (2024-2025), même règle de verdict que " +
      "partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Début train | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const trainStart = trainCandles.length > 0 ? new Date(trainCandles[0].time).toISOString().slice(0, 10) : '—';

    const trainTrades = runCbdrBacktest(trainCandles);
    const testTrades = runCbdrBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${trainStart} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train ${trainStart}->2023-12-31 n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'cbdr-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
