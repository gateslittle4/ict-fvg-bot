#!/usr/bin/env node
// runLiquiditySweepComparison.js
// Usage: node scripts/runLiquiditySweepComparison.js <dir-with-csvs> [cutoffISODate]
//
// Tests whether adding the ICT "liquidity sweep" confluence filter (see
// src/backtest/liquiditySweep.js) improves the two configs that survived
// out-of-sample validation (EURUSD/GBPUSD dropped from the plan - see
// src/config.js), using each symbol's best-known session window from
// session-window-comparison.md - the "Silver Bullet" 10h-11h NY window beat
// the original 08h-12h reference on TEST for both indices:
//   US100: baseline (no HTF filter), structure ON, session 10h-11h (Silver Bullet), fvg-edge, 1:3
//   US500: H1_EMA200, structure ON, session 10h-11h (Silver Bullet), fvg-edge, 1:3
//
// Same discipline as the other validation scripts: screen on TRAIN, confirm
// only the winner on TEST (never used to decide anything).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runOneConfig, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

const HELD_UP_CONFIG = {
  US100: {
    variant: 'baseline', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true,
    sessionWindow: { startHour: 10, endHour: 11 },
  },
  US500: {
    variant: 'H1_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true,
    sessionWindow: { startHour: 10, endHour: 11 },
  },
};

function fmtPct(x) {
  return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%';
}
function fmtNum(x, d = 2) {
  return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d);
}

function main() {
  const dir = process.argv[2];
  const cutoffArg = process.argv[3] || '2024-01-01T00:00:00Z';
  if (!dir) {
    console.error('Usage: node scripts/runLiquiditySweepComparison.js <dir-with-csvs> [cutoffISODate]');
    process.exit(1);
  }
  const cutoffMs = new Date(cutoffArg).getTime();

  const mdSections = [];
  mdSections.push('# Filtre de confluence "liquidity sweep" (ICT) — ICT FVG (M15)');
  mdSections.push('');
  mdSections.push(
    "⚠ Un signal n'est gardé que si un balayage de liquidité (mèche au-delà d'un pivot swing confirmé, puis clôture qui " +
      "revient de l'autre côté) a eu lieu dans les 10 bougies M15 précédentes, dans le même sens que le FVG. Testé sur " +
      'TRAIN pour chaque config déjà validée hors-échantillon (avec sa meilleure fenêtre NY connue), puis vérifié sur TEST.'
  );
  mdSections.push('');

  for (const [symbol, cfg] of Object.entries(HELD_UP_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    const trainCandles = candles.filter((c) => c.time < cutoffMs);
    const testCandles = candles.filter((c) => c.time >= cutoffMs);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    console.error(`[${symbol}] train=${trainCandles.length} candles, test=${testCandles.length} candles`);

    mdSections.push(`## ${symbol} (${cfg.variant}, structure ${cfg.structureEnabled ? 'ON' : 'off'}, session ${cfg.sessionWindow.startHour}h-${cfg.sessionWindow.endHour}h, ${cfg.stopMode}, 1:${cfg.rrMultiple})`);
    mdSections.push('| | Signaux viables | Win rate net | R net | Profit factor (net) |');
    mdSections.push('|---|---|---|---|---|');

    for (const [label, candlesForRun] of [['TRAIN', trainCandles], ['TEST', testCandles]]) {
      for (const liquiditySweepEnabled of [false, true]) {
        const r = runOneConfig(candlesForRun, symbol, spread, { ...cfg, liquiditySweepEnabled });
        const n = r.summaryNet;
        const note = r.summary.totalSignals < MIN_SIGNALS_FOR_RANKING ? ' (échantillon faible)' : '';
        mdSections.push(
          `| ${label}, liquidity sweep ${liquiditySweepEnabled ? 'ON' : 'off'} | ${n.totalSignals}${note} | ${fmtPct(n.winRate)} | ${fmtNum(n.avgR)} | ${fmtNum(n.profitFactor)} |`
        );
      }
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'liquidity-sweep-comparison.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
