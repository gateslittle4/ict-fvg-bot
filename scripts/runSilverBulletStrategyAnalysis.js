#!/usr/bin/env node
// runSilverBulletStrategyAnalysis.js
// Usage: node scripts/runSilverBulletStrategyAnalysis.js <dir-with-csvs>
//
// ICT "Silver Bullet" as its OWN standalone mechanism — see
// src/backtest/silverBullet.js for the full method writeup: distinct from
// the SILVER_BULLET_WINDOW session filter already used in production
// (which only filters WHEN an already-existing FVG gets validated), this
// requires the FVG to actually FORM inside the 10:00-11:00 NY killzone AND
// to agree with the structure bias (a real break of structure) active at
// that moment — ICT's own published recipe, not just a time-of-day filter.
// Entry one candle after mitigation, stop beyond the gap edge (10% buffer,
// same convention as the main FVG grid's 'fvg-edge' stop mode), fixed 1:3
// R:R, 480 M15-candle timeout.
//
// Screened on TRAIN (before 2024-01-01), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runSilverBulletBacktest } from '../src/backtest/silverBullet.js';

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
    console.error('Usage: node scripts/runSilverBulletStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #13 : Silver Bullet (mécanisme autonome, pas un filtre de session)');
  md.push('');
  md.push(
    "⚠ Distinct du filtre de session SILVER_BULLET_WINDOW déjà en production (celui-ci ne fait que filtrer QUAND un " +
      "FVG déjà existant est validé, sans exiger qu'il se soit FORMÉ pendant la fenêtre). Ici, le FVG doit se FORMER " +
      "à l'intérieur du créneau 10h00-11h00 NY ET être dans le sens du biais de structure actif à ce moment (un vrai " +
      "break of structure), reprenant marketStructure.js/buildStructureBiasSeries tel quel — la recette ICT publiée, " +
      "pas juste un filtre horaire. Entrée une bougie après mitigation, stop au-delà du bord du gap (buffer 10%, " +
      "même convention que le stop 'fvg-edge' de la grille FVG principale), cible fixe 1:3, timeout 480 bougies M15 " +
      "(mêmes conventions que partout ailleurs). Testé sur les 12 instruments disponibles. Écran TRAIN (avant " +
      "2024-01-01) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runSilverBulletBacktest(trainCandles);
    const testTrades = runSilverBulletBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR, 4)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR, 4)}`);
  }

  const outMd = path.join(dir, 'silver-bullet-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
