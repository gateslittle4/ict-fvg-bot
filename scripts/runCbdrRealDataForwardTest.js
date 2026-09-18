#!/usr/bin/env node
// runCbdrRealDataForwardTest.js
// Usage: node scripts/runCbdrRealDataForwardTest.js <real-data-dir>
//
// Forward-test of CBDR on REAL cTrader-exported candles
// (data/real-data-2026-02-to-09/, 2026-02-10 -> 2026-09-16, US100/US500/
// GER40/EURUSD/XAUUSD), never used to choose any parameter of cbdr.js — a
// genuine out-of-sample check on top of the 2019-2025 historical CSVs'
// train/test split already done in cbdr-strategy-analysis.md. Same next
// step Esdras took for Silver Bullet (runSilverBulletForwardTestAnalysis.js)
// once it looked promising on historical data alone.
//
// ⚠ Same time-zone conversion that script's own header documents: the
// exported candles are genuine UTC, converted here to "engine time" (fixed
// UTC-5) before any session-window math, exactly as the live bot's own
// _toEngineCandle() does — cbdr.js's CBDR_WINDOW/touch-window logic assumes
// that convention (via nySession.js's toRealNyHourMinute()), same as every
// other session-window mechanism in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { runCbdrBacktest } from '../src/backtest/cbdr.js';

const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const SYMBOLS = ['US100', 'US500', 'GER40', 'EURUSD', 'XAUUSD'];

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
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
    console.error('Usage: node scripts/runCbdrRealDataForwardTest.js <real-data-dir>');
    process.exit(1);
  }

  const md = [];
  md.push('# Forward-test CBDR — vraies données cTrader (2026-02-10 → 2026-09-16)');
  md.push('');
  md.push(
    '⚠ ~7 mois de vraies bougies, pas 7 ans — même mise en garde que tous les forward-tests précédents de ce ' +
      "projet : à lire comme \"ce qui se serait réellement passé\", pas comme une preuve statistique. Ces données " +
      "n'ont JAMAIS servi à choisir un paramètre de cbdr.js (fenêtre 14h-20h, projection 2x, etc.) — écrites et " +
      "validées avant que ce forward-test ne soit lancé. Conversion fuseau horaire appliquée (voir en-tête du " +
      "script) : les bougies exportées sont en UTC réel, converties en \"heure moteur\" (UTC-5 fixe) avant tout " +
      "calcul de fenêtre de session, exactement comme le fait le bot live lui-même."
  );
  md.push('');
  md.push('| Symbole | Trades | Gagnants | Perdants | Timeout | Win rate | R total | PF | Espérance (R) |');
  md.push('|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: rawCandles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const candles = toEngineTime(rawCandles);
    const trades = withCosts(runCbdrBacktest(candles), symbol);
    const s = summarizeTrades(trades);
    const totalR = trades.reduce((sum, t) => sum + t.rMultiple, 0);

    md.push(`| ${symbol} | ${s.totalSignals} | ${s.wins} | ${s.losses} | ${s.timeouts} | ${fmtPct(s.winRate)} | ${fmtNum(totalR)} | ${fmtNum(s.profitFactor)} | ${fmtNum(s.expectancyR)} |`);
    console.error(`[${symbol}] n=${s.totalSignals} wr=${fmtPct(s.winRate)} totalR=${fmtNum(totalR)} exp=${fmtNum(s.expectancyR)}`);
  }

  const outMd = path.join(dir, 'cbdr-forward-test.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
