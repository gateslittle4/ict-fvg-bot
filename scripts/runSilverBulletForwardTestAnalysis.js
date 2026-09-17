#!/usr/bin/env node
// runSilverBulletForwardTestAnalysis.js
// Usage: node scripts/runSilverBulletForwardTestAnalysis.js <real-data-dir>
//
// Forward-test of Silver Bullet standalone on REAL cTrader-exported candles
// (data/real-data-2026-02-to-09/, 2026-02-10 -> 2026-09-16, US100/US500/
// GER40), never used to choose ANY parameter of silverBullet.js — a
// genuine out-of-sample check, distinct from the 2019-2025 historical
// CSVs' train/test split already done in silver-bullet-strategy-analysis.md.
// Same next step Esdras took for every other live-candidate mechanism
// (NWOG, the FVG session-window comparison, the dynamic-target combo) once
// it looked promising on historical data alone.
//
// ⚠ TIME-ZONE FIX, not present in the pre-existing forward-test scripts:
// `getHistoricalCandles()` (src/dataSources/cTraderDataSource.js) exports
// candles in GENUINE UTC (see that file's own comment on `_trendbarToCandle`:
// "Do NOT feed this straight into the strategy engine — see
// _toEngineCandle()"), but every session-window check in this codebase
// (isInNySessionWindow, used directly by Silver Bullet's own killzone/
// distribution windows) assumes the historical CSVs' fixed-EST-as-UTC
// convention (nySession.js's own header: ".time is always exactly 5h
// BEHIND true UTC"). The live bot itself converts real UTC candles via
// `_toEngineCandle()` (candle.time - FIXED_EST_TO_UTC_OFFSET_MS) before
// ever handing them to the strategy engine — this script applies the SAME
// conversion to the exported CSVs before backtesting them, so the session
// windows are evaluated against the correct real NY hour. (The
// pre-existing `runFvgMultiTouchForwardTestWindowAnalysis.js` did NOT apply
// this conversion — its 8h-12h vs 10h-11h comparison on real data may be
// off by several hours; flagged in HANDOFF.md, not silently fixed here.)
//
// Also rebuilds the exact production trade set on this SAME real window
// (same mechanism reconstruction as scripts/runSilverBulletOverlapAnalysis.js)
// to check overlap on real data, not just the historical CSVs.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades, runBacktest } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { runNwogBacktest } from '../src/backtest/nwog.js';
import { runWeeklySweepBacktest } from '../src/backtest/weeklyLiquiditySweep.js';
import { runBreakerBlockBacktest } from '../src/backtest/breakerBlock.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { runSilverBulletBacktest, SILVER_BULLET_WINDOW as PROD_SILVER_BULLET_WINDOW } from '../src/backtest/silverBullet.js';

const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FVG_PROD_CONFIG = {
  US100: {
    variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 5,
    structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 },
    liquiditySweepEnabled: true, multiTouch: true,
  },
  US500: {
    variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 5,
    structureEnabled: true, sessionEnabled: true, sessionWindow: PROD_SILVER_BULLET_WINDOW,
    liquiditySweepEnabled: true, multiTouch: true,
  },
};

function toEngineTime(candles) {
  // Genuine UTC (cTrader export) -> engine time (fixed-EST-as-UTC), the SAME
  // conversion _toEngineCandle() applies live - see this file's own header.
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}

function buildFvgEngine(candles, symbol, cfg) {
  if (cfg.multiTouch) {
    const checkFilters = buildMultiTouchFilterPredicate(candles, symbol, cfg);
    return new MultiTouchFvgEngine({ symbol, checkFilters });
  }
  return buildFilteredEngine(candles, symbol, cfg).engine;
}

function tag(trades, mechanism) { return trades.map((t) => ({ ...t, mechanism })); }

function buildProductionTrades(candles, symbol) {
  const trades = [];
  if (symbol === 'US100') {
    const engine = buildFvgEngine(candles, symbol, FVG_PROD_CONFIG.US100);
    trades.push(...tag(runBacktest({ candles, symbol, fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 5 }), 'FVG'));
    trades.push(...tag(runNwogBacktest(candles, { rrMultiple: 5 }).filter((t) => t.direction === 'bullish'), 'NWOG'));
  } else if (symbol === 'US500') {
    const engine = buildFvgEngine(candles, symbol, FVG_PROD_CONFIG.US500);
    trades.push(...tag(runBacktest({ candles, symbol, fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 5 }), 'FVG'));
    trades.push(...tag(runWeeklySweepBacktest(candles, { rrMultiple: 5 }), 'WeeklySweep'));
  } else if (symbol === 'GER40') {
    trades.push(...tag(runNwogBacktest(candles, { rrMultiple: 5 }), 'NWOG'));
    trades.push(...tag(runWeeklySweepBacktest(candles, { rrMultiple: 5 }), 'WeeklySweep'));
    trades.push(...tag(runBreakerBlockBacktest(candles, { rrMultiple: 5 }), 'BreakerBlock'));
  }
  return trades;
}

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runSilverBulletForwardTestAnalysis.js <real-data-dir>');
    process.exit(1);
  }

  const md = [];
  md.push('# Forward-test Silver Bullet autonome — vraies données cTrader (2026-02-10 → 2026-09-16)');
  md.push('');
  md.push(
    `⚠ ~7 mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce ` +
      `projet : à lire comme "ce qui se serait réellement passé", pas comme une preuve statistique. Ces données ` +
      `n'ont JAMAIS servi à choisir un paramètre de Silver Bullet (fenêtre 10h-11h, tolérance EQH/EQL, etc.) - ` +
      `écrites et validées avant que ce dossier n'existe. Conversion fuseau horaire appliquée (voir en-tête du ` +
      `script) : les bougies exportées sont en UTC réel, converties en "heure moteur" (UTC-5 fixe) avant tout ` +
      `calcul de fenêtre de session, exactement comme le fait le bot live lui-même.`
  );
  md.push('');
  md.push('| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) | Chevauchement production |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of ['US100', 'US500', 'GER40']) {
    const { candles: rawCandles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const candles = toEngineTime(rawCandles);

    const sbTrades = withCosts(runSilverBulletBacktest(candles), symbol);
    const summary = summarizeTrades(sbTrades);

    const prodTrades = buildProductionTrades(candles, symbol);
    const overlapping = sbTrades.filter((sb) => prodTrades.some((p) => sb.entryTime <= p.exitTime && p.entryTime <= sb.exitTime));

    md.push(
      `| ${symbol} | ${summary.totalSignals} | ${summary.wins ?? '—'} | ${summary.losses ?? '—'} | ${summary.timeouts ?? '—'} | ` +
        `${fmtPct(summary.winRate)} | ${fmtNum(summary.finalEquityR)} | ${fmtNum(summary.profitFactor)} | ${fmtNum(summary.expectancyR)} | ` +
        `${overlapping.length}/${sbTrades.length} (${fmtPct(sbTrades.length > 0 ? overlapping.length / sbTrades.length : null)}) |`
    );
    console.error(`[${symbol}] n=${summary.totalSignals} wr=${fmtPct(summary.winRate)} totalR=${fmtNum(summary.finalEquityR)} exp=${fmtNum(summary.expectancyR, 4)} overlap=${overlapping.length}/${sbTrades.length}`);
  }

  const outMd = path.join(dir, 'silver-bullet-forward-test.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
