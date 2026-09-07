#!/usr/bin/env node
// runDivergenceAccountImpact.js
// Usage: node scripts/runDivergenceAccountImpact.js <dir-with-csvs>
//
// divergence-strategy-analysis.md found a small but REAL, out-of-sample-
// consistent edge (every lookback/threshold combo "tient") with FAR more
// trades/year than the FVG setup (100s/year vs 24-40/year). Picked the
// config by TRAIN ranking alone (lookback=100, threshold=2 -> train 0.26R,
// test 0.18R), NOT by eyeballing which looked best on test - avoids the
// exact peeking trap flagged earlier with the Friday-exclusion idea. Now
// checks what that actually means for challenge-passing speed: a $10,000
// account, 0.5%/trade, one year at a time, same Phase1(+8%)/Phase2(+5%)
// framing used everywhere else in this project. NOTE: no shared guardrail
// here yet (this is a standalone edge-quality check, not wired into the
// live bot's account-level trade budget) - a real deployment would need
// that integration afterward.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const LOOKBACK = 100;
const Z_THRESHOLD = 2;
const ATR_PERIOD = 14;
const RR_MULTIPLE = 3;
const MAX_HOLDING_CANDLES = 120;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const STATIC_MAX_DD_PCT = 10;
const PHASE1_TARGET_MULTIPLE = 1.08;
const PHASE2_TARGET_MULTIPLE = 1.05;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);

function alignByTime(candlesA, candlesB) {
  const mapB = new Map(candlesB.map((c) => [c.time, c]));
  const alignedA = [];
  const alignedB = [];
  for (const a of candlesA) {
    const b = mapB.get(a.time);
    if (b) { alignedA.push(a); alignedB.push(b); }
  }
  return { alignedA, alignedB };
}

function computeAtrSeries(candles, period) {
  const atr = new Array(candles.length).fill(null);
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : c.close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
    if (i >= period - 1) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += trs[j];
      atr[i] = sum / period;
    }
  }
  return atr;
}

function computeZScoreSeries(logRatio, lookback) {
  const z = new Array(logRatio.length).fill(null);
  for (let i = lookback; i < logRatio.length; i++) {
    let sum = 0;
    for (let j = i - lookback; j < i; j++) sum += logRatio[j];
    const mean = sum / lookback;
    let sqSum = 0;
    for (let j = i - lookback; j < i; j++) sqSum += (logRatio[j] - mean) ** 2;
    const std = Math.sqrt(sqSum / lookback);
    z[i] = std > 0 ? (logRatio[i] - mean) / std : 0;
  }
  return z;
}

function runDivergenceBacktest({ alignedA, alignedB, symbolA, symbolB }) {
  const n = alignedA.length;
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, LOOKBACK);
  const atrA = computeAtrSeries(alignedA, ATR_PERIOD);
  const atrB = computeAtrSeries(alignedB, ATR_PERIOD);

  const trades = [];
  let openTrade = null;
  let wasExtended = false;

  for (let i = 0; i < n; i++) {
    if (openTrade) {
      const candles = openTrade.symbol === symbolA ? alignedA : alignedB;
      const candle = candles[i];
      if (i > openTrade.entryIndex) {
        const hitStop = candle.low <= openTrade.stopPrice;
        const hitTarget = candle.high >= openTrade.targetPrice;
        const timedOut = i - openTrade.entryIndex >= MAX_HOLDING_CANDLES;
        if (hitStop || hitTarget || timedOut) {
          let outcome, exitPrice, rMultiple;
          if (hitStop) { outcome = 'loss'; exitPrice = openTrade.stopPrice; rMultiple = -1; }
          else if (hitTarget) { outcome = 'win'; exitPrice = openTrade.targetPrice; rMultiple = RR_MULTIPLE; }
          else { outcome = 'timeout'; exitPrice = candle.close; rMultiple = (exitPrice - openTrade.entryPrice) / openTrade.distance; }
          const spread = DEFAULT_SPREADS[openTrade.symbol] ?? 0;
          const costR = spread > 0 ? spread / openTrade.distance : 0;
          trades.push({ ...openTrade, exitIndex: i, exitTime: candle.time, exitPrice, outcome, grossRMultiple: rMultiple, rMultiple: rMultiple - costR });
          openTrade = null;
        }
      }
    }
    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= Z_THRESHOLD;
    if (!openTrade && extended && !wasExtended && i + 1 < n) {
      const laggardIsB = z[i] >= Z_THRESHOLD;
      const symbol = laggardIsB ? symbolB : symbolA;
      const laggardCandles = laggardIsB ? alignedB : alignedA;
      const atr = laggardIsB ? atrB[i] : atrA[i];
      if (atr && atr > 0) {
        const entryIndex = i + 1;
        const entryPrice = laggardCandles[entryIndex].open;
        const distance = 1.5 * atr;
        const spread = DEFAULT_SPREADS[symbol] ?? 0;
        if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
          openTrade = {
            symbol,
            entryIndex,
            entryTime: laggardCandles[entryIndex].time,
            entryPrice,
            stopPrice: entryPrice - distance,
            targetPrice: entryPrice + RR_MULTIPLE * distance,
            distance,
          };
        }
      }
    }
    wasExtended = extended;
  }
  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(allTrades, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
  const trades = allTrades.filter((t) => t.entryTime >= yearStart && t.entryTime < yearEnd);
  if (trades.length === 0) return null;

  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let maxDrawdownPct = 0;
  let staticMin = STARTING_BALANCE;
  const curve = [];
  let busted = false;
  let bustDate = null;
  let phase1Point = null;
  let phase2Point = null;

  for (const t of trades) {
    if (busted) break;
    const riskAmount = balance * (RISK_PCT / 100);
    const pnl = riskAmount * t.rMultiple;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    curve.push({ time: t.exitTime, balance });

    const staticDdPct = ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100;
    if (staticDdPct >= STATIC_MAX_DD_PCT && !busted) {
      busted = true;
      bustDate = fmtDate(t.exitTime);
    }
    if (!phase1Point && balance >= STARTING_BALANCE * PHASE1_TARGET_MULTIPLE) {
      phase1Point = { time: t.exitTime, balance };
    }
    if (phase1Point && !phase2Point && t.exitTime > phase1Point.time && balance >= phase1Point.balance * PHASE2_TARGET_MULTIPLE) {
      phase2Point = { time: t.exitTime };
    }
  }

  const firstTime = trades[0].entryTime;
  const wins = trades.filter((t) => t.outcome === 'win').length;
  const resolved = trades.filter((t) => t.outcome !== 'timeout').length;

  return {
    trades: trades.length,
    winRate: resolved > 0 ? wins / resolved : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted,
    bustDate,
    phase1Label: phase1Point ? `jour ${daysBetween(firstTime, phase1Point.time)}` : 'jamais',
    phase2Label: phase2Point ? `jour ${daysBetween(firstTime, phase2Point.time)}` : 'jamais',
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.phase1Label} | ${r.phase2Label} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runDivergenceAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const { candles: m15A } = loadCandlesFromCsv(path.join(dir, 'US100.csv'));
  const { candles: m15B } = loadCandlesFromCsv(path.join(dir, 'US500.csv'));
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const allTrades = runDivergenceBacktest({ alignedA, alignedB, symbolA: 'US100', symbolB: 'US500' });

  const md = [];
  md.push('# Impact au niveau du COMPTE de la stratégie de divergence US100/US500 (lookback 100, seuil z=2)');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, risque fixe 0.5%/trade, un seul trade ouvert à la fois, PAS de garde-fous ` +
      "partagés ici (test de la qualité de l'edge seul, pas encore intégré au bot). Config choisie par classement " +
      "TRAIN uniquement (0.26R train, 0.18R test) - pas en regardant quelle config a l'air la meilleure sur test."
  );
  md.push('');
  md.push('| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(allTrades, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) : 'skip'}`);
  }

  const outMd = path.join(dir, 'divergence-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
