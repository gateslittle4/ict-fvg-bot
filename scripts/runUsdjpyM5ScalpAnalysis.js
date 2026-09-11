#!/usr/bin/env node
// runUsdjpyM5ScalpAnalysis.js
// Usage: node scripts/runUsdjpyM5ScalpAnalysis.js <dir-with-csvs>
//
// Realistic (retail-scale) alternative to true HFT, at Esdras's explicit
// request after discussing scalping feasibility (see HANDOFF.md's "Scalping
// (M1/M5)" section): test the Judas Swing mechanic (sweep + reclaim of the
// previous day's high/low, London killzone) at M5 granularity instead of
// M15, on USDJPY specifically - the only instrument in this project with
// real M1 source data (HistData), and one with no validated production
// strategy of its own, so there's no netting conflict to reason about.
//
// Deliberately reuses runJudasSwingBacktest() UNCHANGED (src/backtest/
// judasSwing.js) rather than a new module - its detection logic is already
// timeframe-agnostic (session window uses wall-clock time, PDH/PDL comes
// from resampling to daily regardless of the input bar size), so the ONLY
// things that change here are the input candles (M5, not M15) and two
// parameters DECIDED FROM RESEARCH BEFORE SEEING ANY RESULT:
//   - rrMultiple = 2 (not this project's usual 1:3+) - ICT scalping sources
//     converge on more modest ~1:2 targets (30-50 pips), distinctly lower
//     than the swing-trade R:R used everywhere else here.
//   - maxHoldingCandles = 480 - the SAME literal constant already used
//     project-wide (FVG/Judas Swing/NWOG/Breaker Block/...), just applied
//     to M5 bars this time (480 x 5min = 40h, shorter than the M15
//     equivalent's 5 days - consistent with a scalp meant to resolve
//     faster, without inventing a new number to fit that intuition).
//
// USDJPY_M5.csv built via scripts/convertHistData.js's new optional
// bucketMinutes argument (5), same HistData source/timestamp convention as
// USDJPY.csv (M15) - see HANDOFF.md.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runJudasSwingBacktest } from '../src/backtest/judasSwing.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOL = 'USDJPY';
const RR_MULTIPLE = 2;
const MAX_HOLDING_CANDLES = 480;

function withCosts(trades) {
  const spread = DEFAULT_SPREADS[SYMBOL] ?? 0;
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
    console.error('Usage: node scripts/runUsdjpyM5ScalpAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const { candles } = loadCandlesFromCsv(path.join(dir, 'USDJPY_M5.csv'));
  const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
  const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

  const trainRaw = runJudasSwingBacktest(trainCandles, { rrMultiple: RR_MULTIPLE, maxHoldingCandles: MAX_HOLDING_CANDLES });
  const testRaw = runJudasSwingBacktest(testCandles, { rrMultiple: RR_MULTIPLE, maxHoldingCandles: MAX_HOLDING_CANDLES });
  const { net: trainNet, droppedAsNonViable: trainDropped } = withCosts(trainRaw);
  const { net: testNet, droppedAsNonViable: testDropped } = withCosts(testRaw);
  const ts = summarizeTrades(trainNet);
  const es = summarizeTrades(testNet);
  const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

  const md = [];
  md.push('# USDJPY M5 scalp (Judas Swing @ M5, 1:2, timeout 480 bougies M5) — recherche "version réaliste du HFT"');
  md.push('');
  md.push(
    "⚠ Pas un nouveau mécanisme - réutilise runJudasSwingBacktest() (src/backtest/judasSwing.js) TEL QUEL, " +
      "sur des bougies M5 au lieu de M15, sur USDJPY (seul instrument avec des données M1 sources réelles dans " +
      "ce projet, et sans stratégie déjà validée dessus). Deux paramètres décidés depuis la recherche AVANT de " +
      "voir un résultat : RR 1:2 (au lieu de 1:3+ ailleurs — les sources ICT scalping convergent sur des cibles " +
      "plus modestes, ~30-50 pips) et timeout 480 bougies (même constante que partout ailleurs dans ce projet, " +
      "juste appliquée à des bougies M5 cette fois — 40h au lieu de 5 jours en M15)."
  );
  md.push('');
  md.push(`Trades bruts avant filtre de viabilité (distance du stop < 3× spread) : train ${trainRaw.length} (${trainDropped} rejetés), test ${testRaw.length} (${testDropped} rejetés).`);
  md.push('');
  md.push('| Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  md.push(`| ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);

  console.error(`USDJPY M5 scalp: train n=${ts.totalSignals} (${trainDropped} rejetés non-viables) wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} (${testDropped} rejetés) wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);

  const outMd = path.join(dir, 'usdjpy-m5-scalp-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
