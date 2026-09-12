#!/usr/bin/env node
// runFvgFirstCandleAnalysis.js
// Usage: node scripts/runFvgFirstCandleAnalysis.js <dir-with-csvs>
//
// Esdras's specific claim (2026-09-12): a retest that happens on the VERY
// FIRST candle after an FVG forms (< 15 min later) should not count as a
// real "left and came back" - it's the same continuation move wicking back,
// not a genuine retest. Checked first how much this actually affects the
// PRODUCTION single-touch engine before building anything new: 44-53% of
// every currently-validated trade (train) comes from exactly this first
// candle - close to half the bot's entire volume. Too large a share to
// guess about - split the ALREADY-VALIDATED production trades into the two
// cohorts (first-candle vs later) and compare their expectancy directly,
// same production config, zero parameters retuned, train screen / test
// verification like everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

// Runs the EXACT production engine, but tags each trade with whether its
// entry candle was the very first one after formation (c3Index+1) or later
// - same netting/entry/stop/target logic as backtestEngine.js's own
// runBacktest(), just split by cohort afterward instead of pooled.
function runTagged(candles, symbol, cfg) {
  const { engine } = buildFilteredEngine(candles, symbol, cfg);
  const formationIndexById = new Map();
  const trades = [];
  let openTrade = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    if (openTrade && i > openTrade.entryIndex) {
      const hitStop = openTrade.direction === 'bullish' ? candle.low <= openTrade.stopPrice : candle.high >= openTrade.stopPrice;
      const hitTarget = openTrade.direction === 'bullish' ? candle.high >= openTrade.targetPrice : candle.low <= openTrade.targetPrice;
      const timedOut = i - openTrade.entryIndex >= 480;
      if (hitStop || hitTarget || timedOut) {
        let outcome, exitPrice, rMultiple;
        if (hitStop) { outcome = 'loss'; exitPrice = openTrade.stopPrice; rMultiple = -1; }
        else if (hitTarget) { outcome = 'win'; exitPrice = openTrade.targetPrice; rMultiple = cfg.rrMultiple; }
        else {
          outcome = 'timeout'; exitPrice = candle.close;
          const signedMove = openTrade.direction === 'bullish' ? exitPrice - openTrade.entryPrice : openTrade.entryPrice - exitPrice;
          rMultiple = signedMove / openTrade.distance;
        }
        trades.push({ ...openTrade, exitIndex: i, exitTime: candle.time, exitPrice, outcome, rMultiple });
        openTrade = null;
      }
    }

    const events = engine.processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') formationIndexById.set(e.id, i);
      if (e.type === 'validated' && !openTrade) {
        const c3Index = formationIndexById.get(e.id);
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles, c1Index: c3Index !== undefined ? c3Index - 2 : -1, stopMode: cfg.stopMode, swingLookback: 10 });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        const targetPrice = e.direction === 'bullish' ? entryPrice + cfg.rrMultiple * distance : entryPrice - cfg.rrMultiple * distance;
        openTrade = {
          symbol, direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance,
          isFirstCandle: c3Index !== undefined && i === c3Index + 1,
        };
      }
    }
  }
  return trades;
}

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
  if (!dir) { console.error('Usage: node scripts/runFvgFirstCandleAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const md = [];
  md.push('# FVG : la bougie immédiate (< 15 min après formation) compte-t-elle vraiment comme un retest ?');
  md.push('');
  md.push(
    "⚠ Claim directe d'Esdras : un retest sur la TOUTE PREMIÈRE bougie après formation (< 15 min) ne devrait pas " +
      "compter comme un vrai retour - c'est le même mouvement de continuation qui mèche en arrière, pas un vrai " +
      "\"parti puis revenu\". Vérifié avant de coder quoi que ce soit : 44-53% de TOUS les trades validés " +
      "actuellement (production, train) viennent exactement de cette première bougie - près de la moitié du " +
      "volume du bot. Les deux cohortes (bougie immédiate vs plus tard) sont ici séparées et comparées " +
      "directement, même moteur/config de production, zéro paramètre retouché."
  );
  md.push('');
  md.push('| Symbole | Cohorte | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const cfg = CONFIG.fvg.perSymbol[symbol];

    const trainTrades = withCosts(runTagged(trainCandles, symbol, cfg), symbol);
    const testTrades = withCosts(runTagged(testCandles, symbol, cfg), symbol);

    for (const [label, pred] of [['bougie immédiate (<15min)', (t) => t.isFirstCandle], ['bougie(s) suivante(s)', (t) => !t.isFirstCandle]]) {
      const ts = summarizeTrades(trainTrades.filter(pred));
      const es = summarizeTrades(testTrades.filter(pred));
      const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);
      md.push(`| ${symbol} | ${label} | ${ts.totalSignals} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtNum(es.expectancyR)} | ${v} |`);
      console.error(`[${symbol}] ${label}: train n=${ts.totalSignals} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'fvg-first-candle-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
