#!/usr/bin/env node
// runHtfSupportReversalStrategyAnalysis.js
// Usage: node scripts/runHtfSupportReversalStrategyAnalysis.js <dir-with-csvs>
//
// Support/résistance multi-timeframe (jour/semaine/mois) + confirmation par
// pattern de renversement (doji, engulfing) - see src/backtest/htfSupportReversal.js
// for the full method writeup. A level only counts if at least 2 of the 3
// timeframes agree within 0.1% of each other (confluence), and only fires
// when a doji or engulfing pattern confirms on the touch candle itself.
// Entry one candle after confirmation, stop beyond the setup's own extreme,
// fixed 1:3 R:R, 480 M15-candle timeout.
//
// Screened on TRAIN (before 2024-01-01), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runHtfSupportReversalBacktest } from '../src/backtest/htfSupportReversal.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'GER40', 'UKX', 'AUX', 'NZDJPY', 'AUDUSD'];

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
    console.error('Usage: node scripts/runHtfSupportReversalStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire : Support HTF (jour/semaine/mois) + confirmation par pattern de renversement');
  md.push('');
  md.push(
    "Idée testée (Esdras, 2026-09-19) : un niveau support/résistance est-il plus fiable quand le jour, la semaine ET " +
      "le mois s'accordent dessus (à 0.1% près), confirmé par un doji ou un engulfing sur la bougie qui teste le " +
      "niveau ? Délibérément PAS la théorie \"3 touches = niveau plus fort\" (non retenue - chaque touche consomme " +
      "de la liquidité resting, donc plus de tests plausiblement AFFAIBLIT un niveau plutôt que de le renforcer) : " +
      "ici c'est la confluence entre timeframes INDÉPENDANTS qui est testée, pas le nombre de touches sur un seul. " +
      "Entrée une bougie après confirmation, stop au-delà de l'extrême de la bougie (et de la précédente pour un " +
      "engulfing), cible fixe 1:3, timeout 480 bougies M15. Testé sur les 12 instruments disponibles. Écran TRAIN " +
      "(avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runHtfSupportReversalBacktest(trainCandles);
    const testTrades = runHtfSupportReversalBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR, 4)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR, 4)}`);
  }

  const outMd = path.join(dir, 'htf-support-reversal-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
