#!/usr/bin/env node
// runStarPatternsStrategyAnalysis.js
// Usage: node scripts/runStarPatternsStrategyAnalysis.js <dir-with-csvs>
//
// Classic (non-ICT) candlestick reversal patterns - Morning Star/Evening
// Star, plus the stricter "Doji Star" variant. Esdras, explicit request:
// "pour lor, pourquoi pas des patterns connus? Comme diament, etoile etc?"
// Diamond top/bottom deliberately not tested (too many subjective peak/
// trough-detection parameters - see src/backtest/starPatterns.js header).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same verdict
// rule as everywhere else in this project. Tested on all 6 available
// instruments (not just gold) - same discipline as every other concept
// here: parameters fixed before seeing any result, checked broadly rather
// than only on the instrument that prompted the question.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runStarPatternsBacktest } from '../src/backtest/starPatterns.js';

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

function runVariant(md, title, description, requireDoji, candlesBySymbol) {
  md.push(`## ${title}`);
  md.push('');
  md.push(description);
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const candles = candlesBySymbol[symbol];
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runStarPatternsBacktest(trainCandles, { requireDoji });
    const testTrades = runStarPatternsBacktest(testCandles, { requireDoji });
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${title}/${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }
  md.push('');
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runStarPatternsStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const candlesBySymbol = {};
  for (const symbol of SYMBOLS) {
    candlesBySymbol[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
  }

  const md = [];
  md.push('# Patterns de bougies classiques (non-ICT) : Morning/Evening Star et Doji Star');
  md.push('');
  md.push(
    "⚠ Demande explicite d'Esdras (\"pour l'or, pourquoi pas des patterns connus? Comme diamant, étoile etc?\") - " +
      "concepts d'analyse technique classique, pas ICT. Définitions textbook (Bulkowski, Investopedia) : Morning " +
      "Star = bougie 1 baissière, bougie 2 petit corps (\"étoile\"), bougie 3 haussière qui referme au-delà du " +
      "milieu du corps de la bougie 1 ; Evening Star = miroir exact. Une adaptation documentée pour des données " +
      "M15 intrajournalières : l'exigence classique d'un vrai \"gap\" (rare en intrabougie sur forex/CFD M15) est " +
      "assouplie en \"le corps de la bougie 2 reste majoritairement hors du corps de la bougie 1\". Entrée à " +
      "l'ouverture de la bougie APRÈS la bougie de confirmation, stop au-delà de l'extrême du pattern (3 bougies), " +
      "cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que partout ailleurs dans ce projet). Le pattern " +
      "\"diamant\" (sommet/creux) n'a délibérément PAS été testé ici - il demande plusieurs paramètres subjectifs " +
      "de détection de pics/creux à choisir avant de voir un résultat, contrairement au pattern étoile qui est une " +
      "simple relation OHLC sur 3 bougies. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de " +
      "verdict que partout ailleurs (y compris le garde-fou \"pas assez de trades\"). Testé sur les 6 instruments " +
      "disponibles, pas seulement l'or - même discipline que partout ailleurs dans ce projet."
  );
  md.push('');

  runVariant(
    md,
    'Variante 1 : Star (corps de la bougie 2 ≤ 30% du corps de la bougie 1)',
    "Version la plus large - n'importe quel petit corps compte comme \"étoile\".",
    false,
    candlesBySymbol
  );
  runVariant(
    md,
    'Variante 2 : Doji Star (bougie 2 doit AUSSI être un vrai doji - corps ≤ 10% de sa propre amplitude)',
    'Version plus stricte - filtre la variante 1 pour ne garder que les vrais doji comme bougie centrale.',
    true,
    candlesBySymbol
  );

  const outMd = path.join(dir, 'star-patterns-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
