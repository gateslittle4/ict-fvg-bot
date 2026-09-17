#!/usr/bin/env node
// runBollingerSqueezeStrategyAnalysis.js
// Usage: node scripts/runBollingerSqueezeStrategyAnalysis.js <dir-with-csvs>
//
// A genuinely new mechanism family for this project (Esdras, 2026-09-17:
// "je veux diversifier" - see HANDOFF.md's RSI(2) Connors extension attempt
// just above, which was the more conservative option and didn't hold).
// Everything tried so far is ICT liquidity (FVG/Judas Swing/NWOG/Breaker
// Block), moving-average trend crossover (DMI/MACD/Turtle - all rejected),
// or RSI mean-reversion (Connors/Bollinger+RSI). This trades a VOLATILITY
// regime change instead: Bollinger Band Squeeze (John Bollinger's original
// observation, standardized as the "TTM Squeeze" by John Carter) - a
// compression (Bollinger Bands inside Keltner Channels) followed by a
// release (bands expand back out), direction from price vs the SMA basis
// at the release bar. Same conventions as every other exploratory script
// here: fixed 1:3 R:R, 480 M15-candle timeout, screened on TRAIN
// (2019-2023), verified on TEST (2024-2025), same verdict rule (including
// the MIN_TRADES_FOR_VERDICT guard added for Weekly Sweep - a mechanical
// "tient" on too few trades is not trustworthy, see the near-zero-train
// false positives just caught in the RSI(2) Connors XAUUSD/GER40 case).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBollingerSqueezeBacktest } from '../src/backtest/bollingerSqueeze.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'GER40'];

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
    console.error('Usage: node scripts/runBollingerSqueezeStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Bollinger Band Squeeze (compression de volatilité + breakout) — un mécanisme vraiment nouveau, jamais tenté ici');
  md.push('');
  md.push(
    "⚠ Choisi explicitement pour diversifier par MÉCANISME, pas seulement par instrument : ni ICT (FVG/Judas Swing/NWOG), " +
      "ni suivi de tendance par croisement (DMI/MACD/Turtle, tous rejetés), ni mean-reversion RSI (Connors/Bollinger+RSI, " +
      "déjà tentés). Concept publié (John Bollinger, popularisé \"TTM Squeeze\" par John Carter) : Bollinger(20,2) " +
      "entièrement contenu dans Keltner(20, EMA, 1.5xATR20) = compression ; le signal se déclenche quand les bandes " +
      "ressortent du canal (relâchement), direction = signe de (clôture - SMA20) à cette bougie. Entrée à l'ouverture " +
      "suivante, stop 1.5xATR(14) (même convention que la Divergence déjà en production), cible fixe 1:3, timeout 480 " +
      "bougies M15 (mêmes conventions que FVG/Judas Swing/NWOG/Weekly Sweep). Écran TRAIN (2019-2023) / vérification " +
      "TEST (2024-2025), même règle de verdict que partout ailleurs, avec le garde-fou \"minimum 10 trades\" (sinon un " +
      "verdict mécanique sur un échantillon trop mince ne veut rien dire — voir le faux positif XAUUSD/GER40 de RSI(2) " +
      "Connors juste avant dans HANDOFF.md)."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) { console.error(`[skip] ${symbol}: ${filePath} not found`); continue; }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runBollingerSqueezeBacktest(trainCandles);
    const testTrades = runBollingerSqueezeBacktest(testCandles);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'bollinger-squeeze-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
