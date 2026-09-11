#!/usr/bin/env node
// runNdogStrategyAnalysis.js
// Usage: node scripts/runNdogStrategyAnalysis.js <dir-with-csvs>
//
// ICT "NDOG" (New Day Opening Gap) — the daily sibling of NWOG, fading the
// broker's daily rollover pause instead of the weekend one. See
// src/backtest/ndog.js for the full method writeup, including the raw
// gap-histogram check (done BEFORE any trade outcome was looked at) that
// set the 1-3h threshold. Same conventions as NWOG otherwise: direction
// bets on the fill, entry one candle after the gap candle, stop beyond the
// gap candle's own extreme, fixed 1:3 R:R, 480 M15-candle timeout.
//
// At Esdras's explicit request (GBPUSD search, after 9 different ICT
// concepts already rejected there via the standard 5-instrument protocol -
// see HANDOFF.md) for a genuinely NEW concept, not a re-test of something
// already tried. NDOG had never been implemented at all in this project
// (only its weekly sibling NWOG existed) - listed as an untested candidate
// in HANDOFF.md before this session.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runNdogBacktest } from '../src/backtest/ndog.js';

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
    console.error('Usage: node scripts/runNdogStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT : NDOG (New Day Opening Gap, pari sur le comblement)');
  md.push('');
  md.push(
    "⚠ Concept ICT publié (sibling quotidien du NWOG déjà en production sur US100), jamais testé jusqu'ici dans ce " +
      "projet - recherché à la demande explicite d'Esdras après que 9 concepts différents aient déjà été rejetés " +
      "sur GBPUSD (Judas Swing, Asian Range Breakout, Asian Range Fade, Power of Three, Divergence EUR/GBP, MACD, " +
      "Weekly Liquidity Sweep, NWOG-bruit, Breaker Block). Seuil de détection (1h-3h) fixé depuis l'histogramme réel " +
      "des écarts de temps entre bougies de ce projet (586 écarts de 75min, 98 de 135min sur GBPUSD - une vraie " +
      "pause quotidienne récurrente, pas inventée), AVANT d'avoir regardé un seul résultat de trade - voir " +
      "src/backtest/ndog.js. Direction = pari sur le comblement, entrée une bougie après la bougie de gap, stop " +
      "au-delà de l'extrême de cette même bougie, cible fixe 1:3, timeout 480 bougies M15 (mêmes conventions que " +
      "partout ailleurs, rien inventé pour la sortie). Testé sur les 5 instruments disponibles. Écran TRAIN " +
      "(2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runNdogBacktest(trainCandles);
    const testTrades = runNdogBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'ndog-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
