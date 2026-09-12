#!/usr/bin/env node
// runFvgMultiTouchAnalysis.js
// Usage: node scripts/runFvgMultiTouchAnalysis.js <dir-with-csvs>
//
// Tests Esdras's explicit proposal (2026-09-12), after finding a real US100
// zone whose only touch missed the 10h-11h NY window by 90 minutes despite
// being nowhere near its own 50-candle staleness limit: "c'est comme ça que
// je tradais" - keep watching a still-fresh zone and take it on a LATER
// touch, instead of the production rule (fvgEngine.js + every
// *FilteredFvgEngine in gridRunner.js), which gives a zone exactly ONE
// lifetime touch, accepted or rejected, full stop.
//
// MultiTouchFvgEngine (src/backtest/fvgMultiTouch.js) implements exactly
// that alternative - same 3-candle detection, same maxAgeCandles cutoff,
// same filter CRITERIA (bias/structure/session/sweep, via the identical
// lookup builders production uses), the ONLY change is that a touch which
// fails the filters no longer consumes the zone.
//
// Compared against the ALREADY-VALIDATED single-touch baseline (the exact
// production config, via buildFilteredEngine/runOneConfig - not a fresh
// grid search, zero parameters retuned here) on the 3 instruments FVG
// actually trades live: US100, US500, XAUUSD. Screened on TRAIN
// (2019-2023), verified on TEST (2024-2025), same verdict rule as
// everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from './../src/backtest/backtestEngine.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, runOneConfig } from '../src/backtest/gridRunner.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
// The 3 instruments FVG actually auto-executes on in production
// (CONFIG.fvg.perSymbol) - XAUUSD/US500 configs included as-is, not
// retuned for this experiment.
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];

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
    console.error('Usage: node scripts/runFvgMultiTouchAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# FVG "multi-contact" vs contact unique (production) — proposition d\'Esdras');
  md.push('');
  md.push(
    "⚠ Test direct d'une proposition explicite (2026-09-12), après qu'un vrai contact US100 ait raté la fenêtre " +
      "10h-11h NY de 90 minutes alors que la zone était loin d'être périmée (23 bougies sur 50 autorisées) : " +
      "\"c'est comme ça que je tradais\" - garder une zone encore fraîche active et la prendre au PROCHAIN retour " +
      "dans la bonne heure, au lieu du contact unique de la production actuelle (fvgEngine.js : un contact rejeté " +
      "supprime la zone, peu importe son âge). `MultiTouchFvgEngine` (src/backtest/fvgMultiTouch.js) implémente " +
      "exactement cette alternative - mêmes 3 bougies de détection, même limite de 50 bougies, mêmes critères de " +
      "filtre (biais/structure/session/sweep, mêmes fonctions que la production), seul le fait qu'un contact raté " +
      "ne supprime plus la zone change. Comparé à la référence DÉJÀ VALIDÉE (contact unique, config production " +
      "exacte, zéro paramètre retouché) sur les 3 instruments réellement tradés (US100, US500, XAUUSD). Écran " +
      "TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs dans ce projet."
  );
  md.push('');
  md.push('| Symbole | Mécanisme | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const cfg = CONFIG.fvg.perSymbol[symbol];

    // --- Baseline: the exact production single-touch engine ---
    const baselineTrain = runOneConfig(trainCandles, symbol, DEFAULT_SPREADS[symbol] ?? 0, { ...cfg, rrMultiple: cfg.rrMultiple });
    const baselineTest = runOneConfig(testCandles, symbol, DEFAULT_SPREADS[symbol] ?? 0, { ...cfg, rrMultiple: cfg.rrMultiple });
    const bTs = baselineTrain.summaryNet;
    const bEs = baselineTest.summaryNet;
    const bV = verdict(bTs.expectancyR, bEs.expectancyR, bTs.totalSignals, bEs.totalSignals);
    md.push(`| ${symbol} | contact unique (production) | ${bTs.totalSignals} | ${fmtNum(bTs.expectancyR)} | ${bEs.totalSignals} | ${fmtNum(bEs.expectancyR)} | ${bV} |`);
    console.error(`[${symbol}] baseline train n=${bTs.totalSignals} exp=${fmtNum(bTs.expectancyR)} | test n=${bEs.totalSignals} exp=${fmtNum(bEs.expectancyR)}`);

    // --- Experiment: multi-touch ---
    const predicateTrain = buildMultiTouchFilterPredicate(trainCandles, symbol, cfg);
    const predicateTest = buildMultiTouchFilterPredicate(testCandles, symbol, cfg);
    const mtEngineTrain = new MultiTouchFvgEngine({ symbol, checkFilters: predicateTrain });
    const mtEngineTest = new MultiTouchFvgEngine({ symbol, checkFilters: predicateTest });
    const mtTradesTrain = runBacktest({ candles: trainCandles, symbol, fvgEngine: mtEngineTrain, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
    const mtTradesTest = runBacktest({ candles: testCandles, symbol, fvgEngine: mtEngineTest, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
    const { net: mtNetTrain } = withCosts(mtTradesTrain, symbol);
    const { net: mtNetTest } = withCosts(mtTradesTest, symbol);
    const mTs = summarizeTrades(mtNetTrain);
    const mEs = summarizeTrades(mtNetTest);
    const mV = verdict(mTs.expectancyR, mEs.expectancyR, mTs.totalSignals, mEs.totalSignals);
    md.push(`| ${symbol} | **multi-contact (proposition)** | ${mTs.totalSignals} | ${fmtNum(mTs.expectancyR)} | ${mEs.totalSignals} | ${fmtNum(mEs.expectancyR)} | ${mV} |`);
    console.error(`[${symbol}] multi-touch train n=${mTs.totalSignals} exp=${fmtNum(mTs.expectancyR)} | test n=${mEs.totalSignals} exp=${fmtNum(mEs.expectancyR)}`);
  }

  const outMd = path.join(dir, 'fvg-multi-touch-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
