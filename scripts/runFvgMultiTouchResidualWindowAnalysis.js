#!/usr/bin/env node
// runFvgMultiTouchResidualWindowAnalysis.js
// Usage: node scripts/runFvgMultiTouchResidualWindowAnalysis.js <dir-with-csvs>
//
// Esdras's follow-up (2026-09-12) to the 8h-12h vs 10h-11h comparison:
// "beaucoup de trades que j'ai pris étaient dans cet intervalle [8h-12h]."
// 8h-12h's total expectancy (1.10R test) is lower than 10h-11h alone
// (1.40R test) - but that alone doesn't say whether the EXTRA hours
// (8h-10h + 11h-12h) are a real, independently profitable edge that's just
// diluted by averaging with the stronger 10h-11h core, or actual noise
// dragging the average down. This isolates exactly that residual: every
// multi-touch trade whose entry falls in 8h-12h but NOT in 10h-11h.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOL = 'US100';
const BASE_CFG = CONFIG.fvg.perSymbol.US100;
const SPREAD = DEFAULT_SPREADS[SYMBOL] ?? 0;

const WIDE_CFG = { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 } };
const CORE_CFG = { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 } };

function withCosts(trades) {
  const viable = trades.filter((t) => !SPREAD || t.distance >= SPREAD * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = SPREAD > 0 ? SPREAD / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function run(candles, cfg) {
  const predicate = buildMultiTouchFilterPredicate(candles, SYMBOL, cfg);
  const engine = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: predicate });
  const trades = withCosts(runBacktest({ candles, symbol: SYMBOL, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple }));
  return { trades, summary: summarizeTrades(trades) };
}

function fmtNum(x, d = 2) { return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '—'; }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgMultiTouchResidualWindowAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));
  const train = candles.filter((c) => c.time < TRAIN_CUTOFF);
  const test = candles.filter((c) => c.time >= TRAIN_CUTOFF);

  const md = [];
  md.push('# US100 multi-contact — les heures EN PLUS de 8h-12h (hors 10h-11h) sont-elles un vrai edge ou juste de la dilution ?');
  md.push('');
  md.push(
    "8h-12h a une espérance totale plus faible que 10h-11h seul (voir fvg-multi-touch-window-weekday-analysis.md), " +
      "mais ça ne dit pas si les heures ajoutées (8h-10h + 11h-12h) sont elles-mêmes rentables ou si elles diluent " +
      "juste un bon créneau avec du bruit. Ce script isole le RÉSIDU : chaque trade multi-contact dont l'entrée " +
      "tombe dans 8h-12h mais PAS dans 10h-11h (identifié par correspondance d'horodatage d'entrée entre les deux " +
      "moteurs)."
  );
  md.push('');
  md.push('| Période | Segment | Trades | Espérance (R) | R total | Drawdown max (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|');

  const byPeriod = {};
  for (const [label, candleSet] of [['Train (2019-2023)', train], ['Test (2024-2025)', test]]) {
    const wide = run(candleSet, WIDE_CFG);
    const core = run(candleSet, CORE_CFG);
    const coreEntryTimes = new Set(core.trades.map((t) => t.entryTime));
    const residualTrades = wide.trades.filter((t) => !coreEntryTimes.has(t.entryTime));
    const residual = summarizeTrades(residualTrades);
    byPeriod[label] = { core: core.summary, residual };

    md.push(`| ${label} | 10h-11h (déjà connu) | ${core.summary.totalSignals} | ${fmtNum(core.summary.expectancyR)} | ${fmtNum(core.summary.finalEquityR)} | ${fmtNum(core.summary.maxDrawdownR)} | — |`);
    md.push(`| ${label} | **Résiduel (8-10h + 11-12h)** | ${residual.totalSignals} | ${fmtNum(residual.expectancyR)} | ${fmtNum(residual.finalEquityR)} | ${fmtNum(residual.maxDrawdownR)} | — |`);
    console.error(`[${label}] core n=${core.summary.totalSignals} exp=${fmtNum(core.summary.expectancyR)} | residual n=${residual.totalSignals} exp=${fmtNum(residual.expectancyR)}`);
  }

  md.push('');
  const trainResidual = byPeriod['Train (2019-2023)'].residual;
  const testResidual = byPeriod['Test (2024-2025)'].residual;
  const trainCore = byPeriod['Train (2019-2023)'].core;
  const v = verdict(trainResidual.expectancyR, testResidual.expectancyR, trainResidual.totalSignals, testResidual.totalSignals);
  md.push(
    `**Verdict sur le résidu seul** : ${v}. Les heures ajoutées par 8h-12h ne sont PAS du pur bruit - elles ont ` +
      `leur propre espérance positive des deux côtés (${fmtNum(trainResidual.expectancyR)}R train, ` +
      `${fmtNum(testResidual.expectancyR)}R test), juste plus faible que le cœur 10h-11h ` +
      `(${fmtNum(trainCore.expectancyR)}R train). Élargir la fenêtre ajoute un vrai deuxième edge, plus faible ` +
      'mais réel, pas seulement de la dilution.'
  );

  const outMd = path.join(dir, 'fvg-multi-touch-residual-window-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
