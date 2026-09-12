#!/usr/bin/env node
// runFvgMultiTouchOtherPairsAnalysis.js
// Usage: node scripts/runFvgMultiTouchOtherPairsAnalysis.js <dir-with-csvs>
//
// Esdras's explicit request (2026-09-12): "que penses-tu de vérifier ce
// même FVG dans les autres paires que tu as accès - EURUSD, GBPUSD, et
// USDJPY aussi." None of these 3 pairs has a validated FVG config in
// production (CONFIG.fvg.perSymbol only has US100/US500/XAUUSD) - GBPUSD
// and EURUSD's FVG mechanism were already tested and REJECTED earlier in
// this project (see config.js's own header comment: "GBPUSD... neither the
// FVG grid nor the Divergence mechanism held up... EURUSD is now traded
// too, but ONLY via Judas Swing - the FVG grid and Divergence mechanism
// never held up on it either, same as GBPUSD").
//
// So there is no pair-specific FVG config to extend here (unlike the
// USDJPY 11-mechanism session, which only extended SYMBOLS on
// ALREADY-VALIDATED per-mechanism configs). To stay honest and avoid
// picking whatever config flatters the result, this reuses the US100
// config VERBATIM (H4_EMA200 bias, structure+sweep enabled, Silver Bullet
// 10h-11h NY session, stopMode fvg-edge, RR=5) unchanged on all 3 pairs -
// the exact recipe just validated with multi-touch, zero new tuning per
// pair. Both single-touch (never tested on these pairs before - so this is
// also a fresh baseline, not just the multi-touch column) and multi-touch
// are reported, train screen (2019-2023, USDJPY only has 2016+ but the
// same cutoff is applied for consistency with every other script in this
// project) / test verification (2024-2025).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { runOneConfig } from '../src/backtest/gridRunner.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY'];
// The exact US100 recipe, verbatim - zero per-pair tuning.
const SHARED_CFG = { ...CONFIG.fvg.perSymbol.US100 };

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function fmtNum(x, d = 2) { return x !== null && x !== undefined && isfinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function isfinite(x) { return Number.isFinite(x); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgMultiTouchOtherPairsAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const md = [];
  md.push('# FVG (config US100 verbatim, contact unique ET multi-contact) sur EURUSD/GBPUSD/USDJPY');
  md.push('');
  md.push(
    "⚠ Ni GBPUSD ni EURUSD n'ont de config FVG validée en production - déjà testés et rejetés plus tôt dans ce " +
      "projet (voir config.js). Donc pas de config \"déjà validée\" à étendre ici comme pour l'extension USDJPY à " +
      "11 mécanismes - la config US100 (H4_EMA200, structure+sweep actifs, fenêtre Silver Bullet 10h-11h NY, stop " +
      "fvg-edge, RR=5) est reprise TELLE QUELLE sur les 3 paires, zéro paramètre ajusté par paire, pour rester " +
      "honnête. Contact unique = jamais testé sur ces paires avant (nouvelle référence, pas juste la colonne " +
      "multi-contact). Écran TRAIN (2019-2023) / vérification TEST (2024-2025)."
  );
  md.push('');
  md.push('| Paire | Mécanisme | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const spread = DEFAULT_SPREADS[symbol];
    if (spread === undefined) console.error(`⚠ ${symbol}: pas de spread dans DEFAULT_SPREADS - coûts non appliqués`);

    // Single-touch baseline (never tested before on this pair)
    const baseTrain = runOneConfig(trainCandles, symbol, spread ?? 0, SHARED_CFG).summaryNet;
    const baseTest = runOneConfig(testCandles, symbol, spread ?? 0, SHARED_CFG).summaryNet;
    const baseV = verdict(baseTrain.expectancyR, baseTest.expectancyR, baseTrain.totalSignals, baseTest.totalSignals);
    md.push(`| ${symbol} | contact unique | ${baseTrain.totalSignals} | ${fmtNum(baseTrain.expectancyR)} | ${baseTest.totalSignals} | ${fmtNum(baseTest.expectancyR)} | ${baseV} |`);
    console.error(`[${symbol}] unique train n=${baseTrain.totalSignals} exp=${fmtNum(baseTrain.expectancyR)} | test n=${baseTest.totalSignals} exp=${fmtNum(baseTest.expectancyR)}`);

    // Multi-touch
    const predTrain = buildMultiTouchFilterPredicate(trainCandles, symbol, SHARED_CFG);
    const predTest = buildMultiTouchFilterPredicate(testCandles, symbol, SHARED_CFG);
    const engTrain = new MultiTouchFvgEngine({ symbol, checkFilters: predTrain });
    const engTest = new MultiTouchFvgEngine({ symbol, checkFilters: predTest });
    const mtTrain = summarizeTrades(withCosts(runBacktest({ candles: trainCandles, symbol, fvgEngine: engTrain, stopMode: SHARED_CFG.stopMode, rrMultiple: SHARED_CFG.rrMultiple }), symbol));
    const mtTest = summarizeTrades(withCosts(runBacktest({ candles: testCandles, symbol, fvgEngine: engTest, stopMode: SHARED_CFG.stopMode, rrMultiple: SHARED_CFG.rrMultiple }), symbol));
    const mtV = verdict(mtTrain.expectancyR, mtTest.expectancyR, mtTrain.totalSignals, mtTest.totalSignals);
    md.push(`| ${symbol} | **multi-contact** | ${mtTrain.totalSignals} | ${fmtNum(mtTrain.expectancyR)} | ${mtTest.totalSignals} | ${fmtNum(mtTest.expectancyR)} | ${mtV} |`);
    console.error(`[${symbol}] multi train n=${mtTrain.totalSignals} exp=${fmtNum(mtTrain.expectancyR)} | test n=${mtTest.totalSignals} exp=${fmtNum(mtTest.expectancyR)}`);
  }

  const outMd = path.join(dir, 'fvg-multi-touch-other-pairs-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
