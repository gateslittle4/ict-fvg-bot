#!/usr/bin/env node
// runExploratoryAnalysis.js
// Usage: node scripts/runExploratoryAnalysis.js <dir-with-csvs>
//
// Broader exploratory pass looking for a genuinely BETTER setup/edge than
// the current pick (US100 H4/EMA200, US500 H1/EMA50, structure ON, session
// 10h-11h, sweep ON, fvg-edge, 1:3) - beyond what the exhaustive
// variant x structure x stop x R:R x sweep x session-window grid already
// covered (full-session-grid-search.md: 1008 configs/symbol, already the
// most complete search done so far). Three NEW dimensions, none tried yet:
//
//   A) Day-of-week exclusion - runDayOfWeekAnalysis.js found US500 Mondays
//      consistently bad in BOTH train (-0.68R, n=8) and test (-0.45R, n=6).
//      Small samples, but the direction held out of sample - worth an
//      actual exclusion-filter test, not just eyeballing the split.
//   B) Structure (BOS) swing-pivot lookback and liquidity-sweep
//      lookback/window - both currently fixed constants (5, 5, 10 candles),
//      never grid-searched themselves.
//   C) Multi-timeframe EMA alignment - requiring BOTH an H1 AND an H4 EMA
//      bias to agree (never tried; the existing grid only ever applies ONE
//      HTF variant at a time).
//
// Same discipline as everywhere else: screen on TRAIN (2019-2023), verify
// on TEST (2024-2025), same verdict rule (test expectancy positive AND
// >= 30% of train expectancy = "tient").

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runOneConfig, withNet, MIN_DISTANCE_SPREAD_MULTIPLE } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS, filterViableTrades, applyTransactionCosts } from '../src/backtest/transactionCosts.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { buildHtfBiasSeries, makeBiasLookup, BiasFilteredFvgEngine, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { buildStructureBiasSeries, makeStructureBiasLookup, StructureFilteredFvgEngine } from '../src/backtest/marketStructure.js';
import { SessionFilteredFvgEngine } from '../src/backtest/nySession.js';
import { buildLiquiditySweepEvents, makeSweepLookup, LiquiditySweepFilteredFvgEngine } from '../src/backtest/liquiditySweep.js';
import { FvgEngine } from '../src/engines/fvgEngine.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };

const BASE_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
};

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp) {
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function splitCandles(candles) {
  return { train: candles.filter((c) => c.time < TRAIN_CUTOFF), test: candles.filter((c) => c.time >= TRAIN_CUTOFF) };
}

function rowFor(label, train, test, spread, cfg) {
  const trainR = runOneConfig(train, cfg.symbol, spread, cfg);
  const testR = runOneConfig(test, cfg.symbol, spread, cfg);
  const ts = trainR.summaryNet, es = testR.summaryNet;
  const v = verdict(ts.expectancyR, es.expectancyR);
  return `| ${label} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`;
}

const TABLE_HEADER = '| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |';
const TABLE_SEP = '|---|---|---|---|---|---|---|---|---|---|';

// ---- C) Manual multi-timeframe EMA alignment (both H1 and H4 must agree) ----
function buildMtfEngine(candles, symbol, { h1Period, h4Period, structureEnabled, sessionWindow, liquiditySweepEnabled }) {
  let engine = new FvgEngine({ symbol });

  const h1Series = buildHtfBiasSeries(candles, { bucketMs: TIMEFRAME_MS.H1, emaPeriod: h1Period, neutralBandPct: 0.1 });
  engine = new BiasFilteredFvgEngine(engine, makeBiasLookup(h1Series));
  const h4Series = buildHtfBiasSeries(candles, { bucketMs: TIMEFRAME_MS.H4, emaPeriod: h4Period, neutralBandPct: 0.1 });
  engine = new BiasFilteredFvgEngine(engine, makeBiasLookup(h4Series));

  if (structureEnabled) {
    const structSeries = buildStructureBiasSeries(candles, { lookback: 5 });
    engine = new StructureFilteredFvgEngine(engine, makeStructureBiasLookup(structSeries));
  }
  engine = new SessionFilteredFvgEngine(engine, sessionWindow);
  if (liquiditySweepEnabled) {
    const sweepEvents = buildLiquiditySweepEvents(candles, { lookback: 5 });
    engine = new LiquiditySweepFilteredFvgEngine(engine, makeSweepLookup(sweepEvents, { windowMs: 10 * 15 * 60 * 1000 }));
  }
  return engine;
}

function runMtfConfig(candles, symbol, spread, opts) {
  const engine = buildMtfEngine(candles, symbol, opts);
  const trades = runBacktest({ candles, symbol, fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3 });
  const viable = filterViableTrades(trades, spread, MIN_DISTANCE_SPREAD_MULTIPLE);
  const net = applyTransactionCosts(viable, spread);
  return summarizeTrades(net);
}

function mtfRow(label, train, test, spread, symbol, opts) {
  const ts = runMtfConfig(train, symbol, spread, opts);
  const es = runMtfConfig(test, symbol, spread, opts);
  const v = verdict(ts.expectancyR, es.expectancyR);
  return `| ${label} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runExploratoryAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Analyse exploratoire — nouvelles pistes au-delà de la recherche exhaustive déjà faite');
  md.push('');
  md.push(
    '⚠ Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs. ' +
      'Base de comparaison = le setup déjà validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, ' +
      'sweep ON, fvg-edge, 1:3).'
  );
  md.push('');

  const candlesBySymbol = {};
  for (const symbol of ['US100', 'US500']) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles;
  }

  // ---- A) Day-of-week exclusion ----
  md.push('## A) Exclure le lundi (piste trouvée dans day-of-week-analysis.md)');
  md.push('');
  for (const symbol of ['US100', 'US500']) {
    const { train, test } = splitCandles(candlesBySymbol[symbol]);
    const spread = DEFAULT_SPREADS[symbol];
    const baseCfg = { ...BASE_CONFIG[symbol], symbol };
    md.push(`### ${symbol}`);
    md.push(TABLE_HEADER);
    md.push(TABLE_SEP);
    md.push(rowFor('Actuel (tous les jours)', train, test, spread, baseCfg));
    md.push(rowFor('Sans lundi', train, test, spread, { ...baseCfg, excludedWeekdays: [1] }));
    md.push(rowFor('Sans lundi ni vendredi', train, test, spread, { ...baseCfg, excludedWeekdays: [1, 5] }));
    md.push('');
    console.error(`[A - ${symbol}] done`);
  }

  // ---- B) Structure / sweep lookback grid ----
  md.push('## B) Grille des paramètres de lookback (structure BOS et liquidity sweep)');
  md.push('');
  for (const symbol of ['US100', 'US500']) {
    const { train, test } = splitCandles(candlesBySymbol[symbol]);
    const spread = DEFAULT_SPREADS[symbol];
    const baseCfg = { ...BASE_CONFIG[symbol], symbol };
    md.push(`### ${symbol}`);
    md.push('| Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
    md.push(TABLE_SEP);
    md.push(rowFor('Actuel (structure lookback 5, sweep lookback 5, fenêtre 10 bougies)', train, test, spread, baseCfg));
    for (const structureLookback of [3, 7, 10]) {
      md.push(rowFor(`Structure lookback ${structureLookback}`, train, test, spread, { ...baseCfg, structureLookback }));
    }
    for (const sweepLookback of [3, 7, 10]) {
      md.push(rowFor(`Sweep lookback ${sweepLookback}`, train, test, spread, { ...baseCfg, sweepLookback }));
    }
    for (const sweepWindowCandles of [5, 20, 40]) {
      md.push(rowFor(`Fenêtre sweep ${sweepWindowCandles} bougies M15`, train, test, spread, { ...baseCfg, sweepWindowCandles }));
    }
    md.push('');
    console.error(`[B - ${symbol}] done`);
  }

  // ---- C) Multi-timeframe EMA alignment ----
  md.push('## C) Alignement multi-timeframe (H1 ET H4 doivent être d\'accord, jamais testé avant)');
  md.push('');
  const mtfCombos = [
    { label: 'H1 EMA50 + H4 EMA200 (combine les 2 meilleurs picks actuels)', h1Period: 50, h4Period: 200 },
    { label: 'H1 EMA20 + H4 EMA50', h1Period: 20, h4Period: 50 },
    { label: 'H1 EMA50 + H4 EMA50', h1Period: 50, h4Period: 50 },
    { label: 'H1 EMA200 + H4 EMA200', h1Period: 200, h4Period: 200 },
  ];
  for (const symbol of ['US100', 'US500']) {
    const { train, test } = splitCandles(candlesBySymbol[symbol]);
    const spread = DEFAULT_SPREADS[symbol];
    md.push(`### ${symbol}`);
    md.push(TABLE_HEADER);
    md.push(TABLE_SEP);
    for (const combo of mtfCombos) {
      md.push(
        mtfRow(combo.label, train, test, spread, symbol, {
          h1Period: combo.h1Period,
          h4Period: combo.h4Period,
          structureEnabled: true,
          sessionWindow: SILVER_BULLET_WINDOW,
          liquiditySweepEnabled: true,
        })
      );
    }
    md.push('');
    console.error(`[C - ${symbol}] done`);
  }

  const outMd = path.join(dir, 'exploratory-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
