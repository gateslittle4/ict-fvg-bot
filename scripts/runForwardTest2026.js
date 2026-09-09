#!/usr/bin/env node
// runForwardTest2026.js
// Usage: node scripts/runForwardTest2026.js
//
// Genuine forward-test (2026-09, at the user's explicit request: "peux-tu
// tester mon bot sur les 8 derniers mois qui viennent de passer"), on data
// exported LIVE from the real cTrader account (see server.js's
// /api/admin/export-candles, added this session) covering ~7 months
// (2026-02-05 to 2026-09-09) - none of which existed when the FVG combo's
// config was chosen against the 2019-2025 CSVs.
//
// Deliberately uses CONFIG.fvg.perSymbol AS-IS - the EXACT config already
// running live in production (rrMultiple 5/5/4, variants/stops/sessions
// unchanged) - not a fresh grid-search. This is a validation run, not a
// search: if it were re-tuned against this new window, that would just be
// fitting the config to itself, defeating the point of a forward-test.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet } from '../src/backtest/gridRunner.js';
import { CONFIG } from '../src/config.js';

function fmtPct(x) { return x === null || x === undefined ? '—' : (x * 100).toFixed(1) + '%'; }
function fmtNum(x, d = 2) { return x === null || x === undefined ? '—' : x === Infinity ? '∞' : Number(x).toFixed(d); }
function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }

function main() {
  const dir = path.join('data', 'forward-test-2026');

  console.log('# Forward-test 2026 (données réelles cTrader, ~7 mois, config de production INCHANGÉE)\n');

  for (const symbol of CONFIG.symbols) {
    const cfg = CONFIG.fvg.perSymbol[symbol];
    if (!cfg) continue;
    const filePath = path.join(dir, `${symbol}.csv`);
    const { candles } = loadCandlesFromCsv(filePath);
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    const { engine } = buildFilteredEngine(candles, symbol, cfg);
    const rawTrades = runBacktest({ candles, symbol, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
    const { trades, summaryNet, droppedAsNonViable } = withNet(rawTrades, spread);

    console.log(`## ${symbol} (${cfg.variant}, ${cfg.stopMode}, 1:${cfg.rrMultiple}, session ${JSON.stringify(cfg.sessionWindow)})`);
    console.log(`Période réelle couverte : ${iso(candles[0].time)} -> ${iso(candles[candles.length - 1].time)} (${candles.length} candles M15)`);
    console.log(`Signaux bruts : ${rawTrades.length}${droppedAsNonViable > 0 ? ` (dont ${droppedAsNonViable} écarté(s) - stop trop proche du spread, non tradable net)` : ''}`);
    console.log(`Signaux net : ${summaryNet.totalSignals}`);
    console.log(`Win rate net : ${fmtPct(summaryNet.winRate)}`);
    console.log(`R net moyen : ${fmtNum(summaryNet.avgR)}`);
    console.log(`Profit factor net : ${fmtNum(summaryNet.profitFactor)}`);
    console.log(`Max drawdown net (R) : ${fmtNum(summaryNet.maxDrawdownR)}`);
    console.log(`Total R net : ${fmtNum(summaryNet.totalSignals * (summaryNet.avgR ?? 0))}`);
    console.log('');

    if (trades.length > 0) {
      console.log('Détail des trades (NET, après filtrage viabilité + coûts) :');
      for (const t of trades) {
        console.log(`  ${iso(t.entryTime)} ${t.direction.padEnd(8)} entry=${t.entryPrice.toFixed(2)} outcome=${t.outcome.padEnd(8)} R=${t.rMultiple !== null ? t.rMultiple.toFixed(2) : '—'}`);
      }
      console.log('');
    }
  }
}

main();
