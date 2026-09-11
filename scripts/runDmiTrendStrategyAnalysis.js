#!/usr/bin/env node
// runDmiTrendStrategyAnalysis.js
// Usage: node scripts/runDmiTrendStrategyAnalysis.js <dir-with-csvs>
//
// Wilder's Directional Movement System (ADX/+DI/-DI) — a published
// TREND-FOLLOWING system, genuinely different from every mean-reversion/
// gap/zone-retracement mechanism already tested in this project. Closer in
// spirit to Turtle (ride a trend, don't target a fixed R:R) but the entry
// trigger is a +DI/-DI crossover confirmed by ADX, not a price-channel
// breakout. See src/backtest/dmiTrend.js for the full method writeup:
// daily bars, ADX(14)/threshold 25 reused VERBATIM from this project's own
// market-regime-analysis.md (not a new tuned parameter), entry at next-day
// open, stop = 2xATR(14) (reused from RSI-2/Turtle/RSI-divergence), exit
// on the stop OR an opposite DI crossover (Wilder's own published rule,
// which naturally produces a stop-and-reverse when that opposite crossover
// is itself ADX-confirmed) — deliberately NO fixed R:R target and NO
// holding-period cap, since this is a trend-following system by
// construction (like Turtle) and either would understate exactly the kind
// of long move it's meant to capture.
//
// Tested on all 5 available instruments in one pass (US100, US500, XAUUSD,
// EURUSD, GBPUSD) — a trend-following signal has no a priori reason to be
// limited to the indices, unlike the pairs-divergence mechanism.
//
// KNOWN CAVEAT, decided a priori (this is the honest lesson already
// learned in this project from Turtle System 2 — see HANDOFF.md): if this
// shows a real edge, its holding-period distribution needs checking BEFORE
// ever combining it with the validated FVG+Divergence combo, since a
// long-held position can block the shared netting budget far more than it
// contributes on its own. That check is out of scope for this
// standalone signal-quality script.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project. All parameters above
// were fixed BEFORE running this script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles } from '../src/backtest/htfBias.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runDmiTrendBacktest } from '../src/backtest/dmiTrend.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
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
const MIN_TRADES_FOR_VERDICT = 10;
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
    console.error('Usage: node scripts/runDmiTrendStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire non-ICT #5 : suivi de tendance ADX/DMI (Wilder)');
  md.push('');
  md.push(
    "⚠ Système de SUIVI DE TENDANCE publié (Wilder, 1978), plus proche de Turtle dans l'esprit (on laisse courir " +
      "la tendance, pas de cible R:R fixe) que de tout ce qui a été testé jusqu'ici - mais le déclencheur est un " +
      "croisement +DI/-DI confirmé par l'ADX, pas une cassure de canal de prix. Bougies journalières. Seuil ADX=25 " +
      "réutilisé TEL QUEL de l'analyse de régime déjà faite dans ce projet (market-regime-analysis.md), pas un " +
      "nouveau paramètre ajusté ici. Entrée à l'ouverture du jour suivant un croisement confirmé par l'ADX>25. " +
      "Stop = 2xATR(14) (même convention que RSI-2/Turtle/divergence RSI). Sortie = stop OU un croisement opposé " +
      "(règle publiée de Wilder - produit naturellement un retournement direct quand ce croisement opposé est " +
      "lui-même confirmé par l'ADX). Délibérément AUCUNE cible R:R fixe et AUCUN plafond de durée : c'est un " +
      "système de suivi de tendance par construction (comme Turtle), les deux affaibliraient artificiellement le " +
      "type de mouvement qu'il est censé capturer. Testé sur les 5 instruments disponibles d'un coup. Écran TRAIN " +
      "(2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. ATTENTION : si un " +
      "edge réel apparaît ici, la leçon déjà apprise avec Turtle System 2 (voir HANDOFF.md) s'applique - sa durée " +
      "de détention doit être vérifiée AVANT toute combinaison avec le combo déjà validé (une position tenue " +
      "longtemps peut bloquer le netting partagé bien plus qu'elle n'apporte elle-même). Cette vérification est " +
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

    const trainTrades = runDmiTrendBacktest(trainDaily);
    const testTrades = runDmiTrendBacktest(testDaily);
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

  const outMd = path.join(dir, 'dmi-trend-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
