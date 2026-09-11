#!/usr/bin/env node
// runRsiMomentumStrategyAnalysis.js
// Usage: node scripts/runRsiMomentumStrategyAnalysis.js <dir-with-csvs>
//
// The opposite bet from RSI(2) Connors mean-reversion (already VALIDATED
// in this project on US100/US500 - the one non-ICT mechanism that holds).
// See src/backtest/rsiMomentum.js for the full method writeup: same trend
// filter/RSI(2)/ATR stop as Connors, but buys OVERBOUGHT in an uptrend
// (momentum) instead of OVERSOLD (mean reversion), with a fixed 1:3 R:R
// exit instead of Connors' SMA(5) mean-reversion target (which wouldn't
// make sense for a momentum bet).
//
// Priority: US100/US500 (where the mean-reversion version is validated).
// GBPUSD/USDJPY included too, mirroring the mean-reversion script's own
// instrument set.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runRsiMomentumBacktest } from '../src/backtest/rsiMomentum.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'GBPUSD', 'USDJPY'];

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
    console.error('Usage: node scripts/runRsiMomentumStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT #4 : RSI(2) Momentum (opposé de Connors, déjà validé)');
  md.push('');
  md.push(
    "⚠ Idée proposée à la demande explicite d'Esdras (\"on continue à chercher d'autres idées comme ça\"). " +
      "RSI(2) Connors (déjà validé sur US100/US500) achète le SURVENDU en tendance haussière, pariant sur un " +
      "rebond vers la moyenne. Ceci achète le SURACHETÉ en tendance haussière à la place, pariant sur la " +
      "continuation de la force plutôt que son retour à la moyenne (et le miroir en tendance baissière : vend " +
      "le SURVENDU au lieu du SURACHETÉ). Même filtre de tendance (EMA200), même RSI(2), même stop 2xATR(14), " +
      "même plafond de détention (10 jours, repris de Connors) — seule la cible change : 1:3 fixe (convention " +
      "déjà utilisée par les stratégies momentum/cassure de ce projet — ORB, Asian Range Breakout) au lieu de " +
      "la cible de retour à la SMA(5) de Connors, qui n'aurait aucun sens pour un pari de continuation. Écran " +
      "TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runRsiMomentumBacktest(trainDaily);
    const testTrades = runRsiMomentumBacktest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'rsi-momentum-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
