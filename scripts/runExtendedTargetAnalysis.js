#!/usr/bin/env node
// runExtendedTargetAnalysis.js
// Usage: node scripts/runExtendedTargetAnalysis.js <dir-with-csvs> [cutoffISODate]
//
// Answers "is there something in trading that lets us aim for 1:4 or 1:5,
// even rarely?" the direct, blunt way first: SAME signals/entries/stops as
// the validated FVG combo (docs/STRATEGY.md) on all three FVG instruments,
// only the TARGET multiple changes (1:3 current vs 1:4 vs 1:5) - no new
// filter, no cherry-picking which trades get the bigger target. This is the
// baseline every "selective extended target" idea has to beat: since the
// FVG's win rate is already known to sit near the 1:3 breakeven threshold
// (~25%, see docs/STRATEGY.md / timeframe-comparison-analysis.md), pushing
// the SAME win-rate distribution out to 1:4 (20% breakeven) or 1:5 (16.7%
// breakeven) either pays off because a meaningful fraction of winners were
// already running well past 3R before the fixed exit cut them off, or it
// doesn't because most winners top out well short of 4R/5R and the drop in
// realized win rate is not compensated.
//
// rrMultiple values (3 reference / 4 / 5 / 6 / 7) fixed BEFORE looking at any
// result - same anti-data-snooping discipline as every other script here.
// Screened on TRAIN (2019-2023), confirmed on TEST (2024-2025).
//
// Extension 2026-09-09: US100/US500 improved monotonically all the way to
// 1:5 (see data/backtest-input/extended-target-analysis.md, prior run).
// 6/7 added to check whether that keeps climbing or gives back ground the
// way XAUUSD already did at 1:5 (peaked at 1:4, per the same file).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };

// Identical to the validated combo (docs/STRATEGY.md) except rrMultiple,
// which each variant below overrides.
const BASE_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true },
};

const RR_VARIANTS = [3, 4, 5, 6, 7];

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < 10 || testN < 10) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function runVariant(candles, symbol, spread, cfg, rrMultiple) {
  const fullCfg = { ...cfg, rrMultiple };
  const { engine } = buildFilteredEngine(candles, symbol, fullCfg);
  const trades = runBacktest({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple });
  return withNet(trades, spread);
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runExtendedTargetAnalysis.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const md = [];
  md.push('# 1:3 fixe vs cible étendue (1:4 / 1:5 / 1:6 / 1:7) — mêmes signaux/entrées/stops, seule la cible change');
  md.push('');
  md.push(
    '⚠ Même config validée par instrument (docs/STRATEGY.md), seul le multiple R:R de la cible change (3 actuel / ' +
      '4 / 5 / 6 / 7, fixés avant tout résultat). Rappel du seuil de rentabilité mécanique avant coûts : 1:3 → 25% ' +
      'de gains nécessaires, 1:4 → 20%, 1:5 → 16.7%, 1:6 → 14.3%, 1:7 → 12.5% - un taux de gain plus bas à cible ' +
      "étendue n'est donc pas en soi un problème, seule l'espérance en R compte. Criblé sur TRAIN, confirmé sur " +
      'TEST (jamais utilisé pour choisir).'
  );
  md.push('');

  for (const [symbol, cfg] of Object.entries(BASE_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    md.push(`## ${symbol} (${cfg.variant}, structure ON, session ${cfg.sessionWindow === SILVER_BULLET_WINDOW ? '10h-11h' : '7h-10h'}, ${cfg.stopMode})`);
    md.push('| Cible | Signaux (train/test) | Win rate net (train/test) | R net moyen (train/test) | Profit factor net (train/test) | Max DD net R (train/test) | Verdict |');
    md.push('|---|---|---|---|---|---|---|');

    for (const rr of RR_VARIANTS) {
      const train = runVariant(trainCandles, symbol, spread, cfg, rr);
      const test = runVariant(testCandles, symbol, spread, cfg, rr);
      const note = train.summaryNet.totalSignals < MIN_SIGNALS_FOR_RANKING || test.summaryNet.totalSignals < MIN_SIGNALS_FOR_RANKING ? ' ⚠️échantillon faible' : '';
      const v = verdict(train.summaryNet.avgR, test.summaryNet.avgR, train.summaryNet.totalSignals, test.summaryNet.totalSignals);
      md.push(
        `| 1:${rr}${note} | ${train.summaryNet.totalSignals}/${test.summaryNet.totalSignals} | ` +
          `${fmtPct(train.summaryNet.winRate)}/${fmtPct(test.summaryNet.winRate)} | ` +
          `${fmtNum(train.summaryNet.avgR)}/${fmtNum(test.summaryNet.avgR)} | ` +
          `${fmtNum(train.summaryNet.profitFactor)}/${fmtNum(test.summaryNet.profitFactor)} | ` +
          `${fmtNum(train.summaryNet.maxDrawdownR)}/${fmtNum(test.summaryNet.maxDrawdownR)} | ${v} |`
      );
      console.error(`[${symbol}] 1:${rr} train n=${train.summaryNet.totalSignals} wr=${fmtPct(train.summaryNet.winRate)} R=${fmtNum(train.summaryNet.avgR)} | test n=${test.summaryNet.totalSignals} wr=${fmtPct(test.summaryNet.winRate)} R=${fmtNum(test.summaryNet.avgR)}`);
    }
    md.push('');
  }

  const outMd = path.join(dir, 'extended-target-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
