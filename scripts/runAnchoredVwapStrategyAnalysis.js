#!/usr/bin/env node
// runAnchoredVwapStrategyAnalysis.js
// Usage: node scripts/runAnchoredVwapStrategyAnalysis.js <dir-with-csvs>
//
// Session-anchored VWAP mean-reversion — fade a confirmed close beyond the
// ±2 standard-deviation band around a range-weighted running average
// anchored at the start of each NY calendar day. See
// src/backtest/anchoredVwap.js for the full method writeup and an
// up-front data-limitation notice: this project's CSVs carry no volume
// column, so candle range (high-low) substitutes for volume as the
// weighting proxy — read results with that substitution in mind.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runAnchoredVwapBacktest } from '../src/backtest/anchoredVwap.js';

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
    console.error('Usage: node scripts/runAnchoredVwapStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire quantitative : VWAP ancré (mean-reversion, bandes 2σ)');
  md.push('');
  md.push(
    "⚠ Concept quantitatif publié, jamais testé jusqu'ici dans ce projet. **Limite de données à noter** : les " +
      "CSV de ce projet n'ont AUCUNE colonne de volume — l'amplitude (high-low) de chaque bougie sert de substitut " +
      "de pondération (proxy d'activité), donc ceci calcule une moyenne pondérée par l'amplitude, appelée \"VWAP\" " +
      "seulement parce que c'est le nom publié du mécanisme testé. Ancrage réinitialisé à chaque nouveau jour " +
      "calendaire NY. Signal = première clôture confirmée au-delà de la bande ±2σ, fade vers la moyenne courante " +
      "(cible = le niveau de VWAP au moment du signal, pas un multiple R:R synthétique — même convention que le " +
      "Midnight Open). Entrée une bougie après le signal, stop au-delà de l'extrême de cette bougie, minimum 4 " +
      "bougies dans la journée avant qu'un signal soit valide. Écran TRAIN (2019-2023) / vérification TEST " +
      "(2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runAnchoredVwapBacktest(trainCandles);
    const testTrades = runAnchoredVwapBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'anchored-vwap-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
