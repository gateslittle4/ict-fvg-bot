#!/usr/bin/env node
// runMitigationBlockStrategyAnalysis.js
// Usage: node scripts/runMitigationBlockStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Mitigation Block" — see src/backtest/mitigationBlock.js for the full
// method writeup: distinct from both the already-tested Order Block (needs
// a successful BOS, trades continuation) and the already-validated Breaker
// Block (needs a successful BOS THEN a break-through, trades reversal from
// the other side) — this one needs NEITHER: it's anchored to a FAILURE to
// break structure (a lower high / higher low), and trades the reversal the
// failure itself implies, with the block being the last opposite-colored
// candle before the failed push (reusing breakerBlock.js's findOrderBlock
// unchanged). Entry on a retest of the block, stop beyond its far edge,
// fixed 1:3 R:R, 480 M15-candle timeout.
//
// Screened on TRAIN (before 2024-01-01), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runMitigationBlockBacktest } from '../src/backtest/mitigationBlock.js';

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
    console.error('Usage: node scripts/runMitigationBlockStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #14 : Mitigation Block (échec de structure, pas un BOS)');
  md.push('');
  md.push(
    "⚠ Distinct de l'Order Block et du Breaker Block déjà testés (les deux exigent un BOS réussi) : ici le signal " +
      "vient d'un ÉCHEC à casser la structure (un plus haut plus bas que le précédent, ou un plus bas plus haut que " +
      "le précédent - une 'failure swing'), sans BOS préalable ni cassure ultérieure. Le bloc = la dernière bougie " +
      "de couleur opposée avant le mouvement échoué (réutilise breakerBlock.js/findOrderBlock tel quel), le trade " +
      "pris = le sens INVERSE du mouvement échoué. Entrée au retest du bloc, une bougie après confirmation, stop " +
      "au-delà du bord du bloc, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs). " +
      "Testé sur les 12 instruments disponibles. Écran TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), " +
      "même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runMitigationBlockBacktest(trainCandles);
    const testTrades = runMitigationBlockBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR, 4)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR, 4)}`);
  }

  const outMd = path.join(dir, 'mitigation-block-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
