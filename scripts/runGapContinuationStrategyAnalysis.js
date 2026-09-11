#!/usr/bin/env node
// runGapContinuationStrategyAnalysis.js
// Usage: node scripts/runGapContinuationStrategyAnalysis.js <dir-with-csvs>
//
// "Gap and Go" — the opposite bet from NWOG/NDOG (which both bet on the gap
// FILLING). See src/backtest/gapContinuation.js for the full method
// writeup: same gap detection/thresholds as the two existing studies, but
// betting WITH the gap direction instead of against it. A real, cited
// concept (general TA / index-futures education, not ICT-specific) never
// tested in this project before, despite the fade direction being tested
// twice already.
//
// Tested at both scales (daily ~1-3h and weekly ~20-100h gaps) on all 6
// instruments. Screened on TRAIN (2019-2023), verified on TEST (2024-2025),
// same verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runGapContinuationBacktest, DAILY_GAP_HOURS, WEEKLY_GAP_HOURS } from '../src/backtest/gapContinuation.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
const SCALES = [['Quotidien (1-3h)', DAILY_GAP_HOURS], ['Hebdomadaire (20-100h)', WEEKLY_GAP_HOURS]];

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
    console.error('Usage: node scripts/runGapContinuationStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire #15 : "Gap and Go" (continuation de gap, opposé de NWOG/NDOG)');
  md.push('');
  md.push(
    "⚠ Idée proposée à la demande explicite d'Esdras (\"tu pourrais pas inventer une stratégie novatrice ?\") " +
      "après une longue série de concepts publiés testés/rejetés. Pas une invention arbitraire : c'est l'exact " +
      "opposé d'un mécanisme DÉJÀ testé dans ce projet (NWOG/NDOG parient sur le COMBLEMENT du gap ; ceci parie " +
      "sur sa CONTINUATION), un vrai concept cité dans la littérature générale de trading d'indices (\"gap and " +
      "go\"), jamais essayé ici malgré le sens inverse déjà testé deux fois. Mêmes seuils de détection de gap " +
      "que NWOG/NDOG (pas re-choisis), entrée une bougie après le gap, stop au-delà de l'extrême de la bougie " +
      "de gap (côté adapté au nouveau sens), cible fixe 1:3, timeout 480 bougies M15. Testé aux deux échelles " +
      "(quotidien et hebdomadaire) sur les 6 instruments. Écran TRAIN (2019-2023) / vérification TEST " +
      "(2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');

  for (const [scaleLabel, gapHours] of SCALES) {
    md.push(`## Échelle : ${scaleLabel}`);
    md.push('');
    md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
    md.push('|---|---|---|---|---|---|---|---|---|---|');

    for (const symbol of SYMBOLS) {
      const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
      const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
      const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

      const trainTrades = runGapContinuationBacktest(trainCandles, gapHours);
      const testTrades = runGapContinuationBacktest(testCandles, gapHours);
      const { net: trainNet } = withCosts(trainTrades, symbol);
      const { net: testNet } = withCosts(testTrades, symbol);
      const ts = summarizeTrades(trainNet);
      const es = summarizeTrades(testNet);
      const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

      md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
      console.error(`[${scaleLabel}/${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
    md.push('');
  }

  const outMd = path.join(dir, 'gap-continuation-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
