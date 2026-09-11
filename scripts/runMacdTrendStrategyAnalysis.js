#!/usr/bin/env node
// runMacdTrendStrategyAnalysis.js
// Usage: node scripts/runMacdTrendStrategyAnalysis.js <dir-with-csvs>
//
// MACD (Moving Average Convergence/Divergence, Gerald Appel) crossover
// trend-following system — a genuinely different mechanism from every other
// strategy already tried in this project, including the already-tested
// ADX/DMI trend system: MACD reads the SPREAD between two EMAs of price
// (trend momentum), ADX/DMI reads which side of directional movement
// currently dominates. Two published, standard mechanisms, not a re-tuning
// of one already rejected. See src/backtest/macdTrend.js for the full
// method writeup: daily bars, Appel's own original 12/26/9 EMA periods
// (never adjusted on this project's data), entry at next-day open on a
// confirmed MACD/signal-line crossover, stop = 2xATR(14) (reused from
// RSI-2/Turtle/RSI-divergence/DMI), exit on the stop OR an opposite
// crossover (stop-and-reverse, same convention as DMI) — deliberately NO
// fixed R:R target and NO holding-period cap, since this is a
// trend-following system by construction (like Turtle/DMI) and either
// would understate exactly the kind of long move it's meant to capture.
//
// Tested on all 5 available instruments in one pass (US100, US500, XAUUSD,
// EURUSD, GBPUSD) — a trend-following signal has no a priori reason to be
// limited to the indices.
//
// KNOWN CAVEAT, decided a priori (the lesson already learned in this
// project from Turtle System 2 and re-flagged for DMI — see HANDOFF.md): if
// this shows a real edge, its holding-period distribution needs checking
// BEFORE ever combining it with the validated FVG+Divergence combo, since a
// long-held position can block the shared netting budget far more than it
// contributes on its own. Out of scope for this standalone signal-quality
// script.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project (including the
// "not enough trades" guard added this session — a verdict on a handful of
// trades means nothing). All parameters above were fixed BEFORE running
// this script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runMacdTrendBacktest } from '../src/backtest/macdTrend.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
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

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
    console.error('Usage: node scripts/runMacdTrendStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT #6 : croisement MACD (Appel)');
  md.push('');
  md.push(
    "⚠ Système de SUIVI DE TENDANCE publié (Appel, années 1970), mécanisme différent du suivi de tendance " +
      "ADX/DMI (Wilder) déjà testé : le MACD lit l'écart entre deux EMA de prix (momentum de la tendance), " +
      "l'ADX/DMI lit quel côté du mouvement directionnel domine actuellement - deux mécanismes publiés distincts, " +
      "pas un re-réglage de celui déjà rejeté. Bougies journalières. Paramètres d'Appel eux-mêmes (EMA 12/26, " +
      "ligne de signal EMA 9) - ceux par défaut sur toute plateforme de graphiques, jamais ajustés sur les " +
      "données de ce projet. Entrée à l'ouverture du jour suivant un croisement MACD/ligne de signal confirmé " +
      "à la clôture, sans filtre de confirmation supplémentaire (pas de gate ADX - le but est de tester le " +
      "mécanisme standard tel que publié, pas un hybride). Stop = 2xATR(14) (même convention que " +
      "RSI-2/Turtle/divergence RSI/DMI). Sortie = stop OU un croisement opposé (retournement direct, même " +
      "convention que DMI). Délibérément AUCUNE cible R:R fixe et AUCUN plafond de durée : système de suivi de " +
      "tendance par construction, comme DMI/Turtle. Testé sur les 5 instruments disponibles d'un coup. Écran " +
      "TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs (y compris " +
      "le garde-fou \"pas assez de trades\" ajouté cette session). ATTENTION : si un edge réel apparaît ici, la " +
      "leçon déjà apprise avec Turtle System 2 / re-flaggée pour DMI (voir HANDOFF.md) s'applique - sa durée de " +
      "détention doit être vérifiée AVANT toute combinaison avec le combo déjà validé. Cette vérification est " +
      "hors du périmètre de ce script, qui teste seulement la qualité du signal seul."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Durée médiane (j, train) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const daily = resampleCandles(m15, DAY_MS);
    const trainDaily = daily.filter((c) => c.time < TRAIN_CUTOFF);
    const testDaily = daily.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runMacdTrendBacktest(trainDaily);
    const testTrades = runMacdTrendBacktest(testDaily);
    const { net: trainNet } = withCosts(trainTrades, symbol);
    const { net: testNet } = withCosts(testTrades, symbol);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);
    const holdingDays = trainNet.map((t) => t.exitIndex - t.entryIndex);
    const medHold = median(holdingDays);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${medHold ?? '—'} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} medHold=${medHold} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'macd-trend-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
