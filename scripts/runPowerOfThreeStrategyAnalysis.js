#!/usr/bin/env node
// runPowerOfThreeStrategyAnalysis.js
// Usage: node scripts/runPowerOfThreeStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Power of Three" / AMD as its full, genuinely 3-session model — see
// src/backtest/powerOfThree.js for the full method writeup: distinct from
// the already-tested Asian Range Fade (which conflates Manipulation and
// Distribution into one continuous window and enters immediately after the
// sweep), this defers entry to a SEPARATE NY AM distribution session
// (08:00-11:00 NY), only after a London-killzone (02:00-05:00 NY)
// manipulation sweep of the Asian accumulation range already fired earlier
// the same day. Stop beyond the sweep's extreme, fixed 1:3 R:R, 480
// M15-candle timeout.
//
// Screened on TRAIN (before 2024-01-01), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPowerOfThreeBacktest } from '../src/backtest/powerOfThree.js';

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
    console.error('Usage: node scripts/runPowerOfThreeStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #15 : Power of Three / AMD (modèle complet à 3 sessions)');
  md.push('');
  md.push(
    "⚠ Distinct de l'Asian Range Fade déjà testé (qui confond Manipulation et Distribution dans une seule fenêtre " +
      "continue et entre immédiatement après le balayage). Ici, la Manipulation (balayage-puis-reclaim de la range " +
      "asiatique pendant le killzone de Londres, 02h-05h NY) doit avoir eu lieu AVANT que la Distribution ne " +
      "commence : l'entrée est différée à la PREMIÈRE bougie du killzone NY AM (08h-11h NY), une session plus tard, " +
      "pas la bougie suivant immédiatement le balayage. Stop au niveau extrême du balayage, cible fixe 1:3, timeout " +
      "480 bougies M15 (mêmes conventions que partout ailleurs). Testé sur les 12 instruments disponibles. Écran " +
      "TRAIN (avant 2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runPowerOfThreeBacktest(trainCandles);
    const testTrades = runPowerOfThreeBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR, 4)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR, 4)}`);
  }

  const outMd = path.join(dir, 'power-of-three-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
