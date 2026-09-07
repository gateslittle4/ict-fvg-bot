#!/usr/bin/env node
// runFinalCombinedAccountImpact.js
// Usage: node scripts/runFinalCombinedAccountImpact.js <dir-with-csvs>
//
// THE FINAL COMBINATION: every mechanism validated in this project's
// strategy-diversification search, all sharing ONE account/guardrail:
//   - FVG on US100, US500 AND XAUUSD (validated ICT setup per instrument -
//     gold uses its own config, picked in full-session-grid-search-gold.md).
//   - Divergence (US100/US500 pairs mean-reversion, lookback=100, z=2) -
//     inherently scoped to these two instruments only (it IS the
//     relationship between them, not applicable to gold alone).
//   - RSI(2) mean-reversion (Connors, published params) on US100 and
//     US500 only - validated there (rsi-mean-reversion-analysis.md); NOT
//     extended to gold, which was never tested for this mechanism (adding
//     it untested would break this project's validate-before-combine
//     discipline).
//
// FOUR-WAY NETTING on US100/US500 (FVG + Divergence + RSI-2, at most one
// open position per instrument); XAUUSD only ever has FVG on it, so no
// netting conflict is possible there.
//
// FTMO 1-Step rules: single +10% target, bust = TRAILING off the highest
// balance ever reached. Own guardrail daily-loss cap stays at the
// self-imposed 2% (stricter than FTMO's real 3% allowance).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { resampleCandles, TIMEFRAME_MS, computeEMA } from '../src/backtest/htfBias.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const TRAILING_MAX_LOSS_PCT = 10; // FTMO 1-Step: equity can't drop >10% below the highest balance ever reached
const CHALLENGE_TARGET_MULTIPLE = 1.10; // FTMO 1-Step: single +10% target, no Phase 2
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD']; // FVG runs on all three
const RSI_SYMBOLS = ['US100', 'US500']; // Divergence + RSI-2 stay scoped to these two (both validated only here)
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  // XAUUSD: picked by TRAIN ranking in full-session-grid-search-gold.md - different window (London-NY
  // overlap, not Silver Bullet) and swing stop (not fvg-edge), gold's own best combo.
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};

// ---- Divergence candidate-entry precomputation (same logic/params as elsewhere) ----
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_M15_CANDLES = 480;

// ---- RSI(2) mean-reversion (published Connors params, not tuned on our data - see rsi-mean-reversion-analysis.md) ----
const RSI_EMA_TREND_PERIOD = 200;
const RSI_PERIOD = 2;
const RSI_OVERSOLD = 5;
const RSI_OVERBOUGHT = 95;
const RSI_SMA_EXIT_PERIOD = 5;
const RSI_ATR_PERIOD = 14;
const RSI_STOP_ATR_MULTIPLE = 2;
const RSI_MAX_HOLDING_DAYS = 10;

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

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

/** Simple (non-Wilder-smoothed) RSI over a rolling window - standard for the short RSI(2) variant. */
function computeRsiSeries(closes, period) {
  const rsi = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let gainSum = 0, lossSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = closes[j] - closes[j - 1];
      if (change > 0) gainSum += change; else lossSum += -change;
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) rsi[i] = avgGain === 0 ? 50 : 100;
    else { const rs = avgGain / avgLoss; rsi[i] = 100 - 100 / (1 + rs); }
  }
  return rsi;
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

/** @returns {Array<{entryTime:number, symbol:string, stopDistance:number}>} */
function computeDivergenceCandidates(m15A, m15B) {
  const h1A = resampleCandles(m15A, TIMEFRAME_MS.H1);
  const h1B = resampleCandles(m15B, TIMEFRAME_MS.H1);
  const { alignedA, alignedB } = alignByTime(h1A, h1B);
  const n = alignedA.length;
  const logRatio = alignedA.map((a, i) => Math.log(a.close) - Math.log(alignedB[i].close));
  const z = computeZScoreSeries(logRatio, DIV_LOOKBACK);
  const atrA = computeAtrSeries(alignedA, DIV_ATR_PERIOD);
  const atrB = computeAtrSeries(alignedB, DIV_ATR_PERIOD);

  const candidates = [];
  let wasExtended = false;
  for (let i = 0; i < n; i++) {
    if (z[i] === null) continue;
    const extended = Math.abs(z[i]) >= DIV_Z_THRESHOLD;
    if (extended && !wasExtended && i + 1 < n) {
      const laggardIsB = z[i] >= DIV_Z_THRESHOLD;
      const symbol = laggardIsB ? 'US500' : 'US100';
      const atr = laggardIsB ? atrB[i] : atrA[i];
      const entryCandle = laggardIsB ? alignedB[i + 1] : alignedA[i + 1];
      if (atr && atr > 0) {
        candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: 1.5 * atr });
      }
    }
    wasExtended = extended;
  }
  return candidates;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(m15CandlesBySymbolFull, dailyCandlesBySymbolFull, divergenceCandidatesFull, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

  const m15BySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    m15BySymbol[symbol] = (m15CandlesBySymbolFull[symbol] || []).filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  if (FVG_SYMBOLS.every((s) => m15BySymbol[s].length < 50)) return null;

  const dailyBySymbol = {};
  for (const symbol of RSI_SYMBOLS) {
    dailyBySymbol[symbol] = dailyCandlesBySymbolFull[symbol].filter((c) => c.time >= yearStart && c.time < yearEnd);
  }

  const divCandidatesByTime = new Map();
  for (const symbol of RSI_SYMBOLS) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) {
    if (cand.entryTime >= yearStart && cand.entryTime < yearEnd) {
      divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);
    }
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    if (m15BySymbol[symbol].length === 0) continue; // gold's 2022 data gap
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  // Precompute RSI(2) series per symbol, per year (no state carried across year boundaries, same
  // convention as the FVG/Divergence side of this simulation) - RSI_SYMBOLS only (US100/US500).
  const rsiEma200 = {};
  const rsiValues = {};
  const rsiSma5 = {};
  const rsiAtr = {};
  const rsiStartIdx = {};
  for (const symbol of RSI_SYMBOLS) {
    const daily = dailyBySymbol[symbol];
    const closes = daily.map((c) => c.close);
    rsiEma200[symbol] = computeEMA(closes, RSI_EMA_TREND_PERIOD);
    rsiValues[symbol] = computeRsiSeries(closes, RSI_PERIOD);
    rsiSma5[symbol] = computeSma(closes, RSI_SMA_EXIT_PERIOD);
    rsiAtr[symbol] = computeAtrSeries(daily, RSI_ATR_PERIOD);
    rsiStartIdx[symbol] = Math.max(RSI_EMA_TREND_PERIOD, RSI_PERIOD, RSI_SMA_EXIT_PERIOD, RSI_ATR_PERIOD) + 1;
  }

  // Merged, time-sorted event timeline: M15 candles (FVG on all 3 symbols + Divergence on US100/US500)
  // and once-per-day RSI(2) check-ins on US100/US500 (timestamped at day's end so they sort after
  // that day's own M15 events).
  const timeline = [];
  for (const symbol of FVG_SYMBOLS) {
    for (const candle of m15BySymbol[symbol]) timeline.push({ kind: 'm15', symbol, candle, time: candle.time });
  }
  for (const symbol of RSI_SYMBOLS) {
    const daily = dailyBySymbol[symbol];
    for (let i = rsiStartIdx[symbol]; i < daily.length; i++) {
      timeline.push({ kind: 'rsi', symbol, day: daily[i], dayIndex: i, time: daily[i].time + DAY_MS - 1 });
    }
  }
  timeline.sort((a, b) => a.time - b.time || a.symbol.localeCompare(b.symbol));
  if (timeline.length === 0) return null;

  guardrail.setBalance(STARTING_BALANCE, timeline[0].time);

  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let staticMin = STARTING_BALANCE;
  let maxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let challengePoint = null;

  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const openRsi = {}; for (const s of RSI_SYMBOLS) openRsi[s] = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1; // M15 candle index, for FVG/Divergence timeouts
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0;
  let wins = 0;
  let resolvedCount = 0;
  let fvgTrades = 0; // FVG on US100+US500
  let goldTrades = 0; // FVG on XAUUSD specifically
  let divTrades = 0;
  let rsiTrades = 0;

  const anyOpenOnSymbol = (symbol) => !!openFvg[symbol] || (openDivergence && openDivergence.symbol === symbol) || !!openRsi[symbol];

  const resolveClose = (symbol, netR, exitTime, riskAmount, source, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    if (source === 'div') divTrades++;
    else if (source === 'rsi') rsiTrades++;
    else if (symbol === 'XAUUSD') goldTrades++;
    else fvgTrades++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }

    if (ddPct >= TRAILING_MAX_LOSS_PCT && !busted) { busted = true; bustDate = fmtDate(exitTime); }
    if (!challengePoint && balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE) {
      challengePoint = { time: exitTime, balance };
    }
  };

  for (const ev of timeline) {
    if (busted) break;
    const symbol = ev.symbol;

    if (ev.kind === 'm15') {
      const candle = ev.candle;
      symbolIndex[symbol] += 1;
      const i = symbolIndex[symbol];
      const spread = FVG_CONFIG[symbol].spread ?? 0;

      // 1) Resolve FVG open trade for this symbol.
      const openF = openFvg[symbol];
      if (openF && candle.time > openF.entryTime) {
        const bullish = openF.direction === 'bullish';
        const hitStop = bullish ? candle.low <= openF.stopPrice : candle.high >= openF.stopPrice;
        const hitTarget = bullish ? candle.high >= openF.targetPrice : candle.low <= openF.targetPrice;
        const timedOut = i - openF.entryIndex >= 480;
        if (hitStop || hitTarget || timedOut) {
          let legR, outcome;
          if (hitStop) { legR = -1; outcome = 'loss'; }
          else if (hitTarget) { legR = openF.rrMultiple; outcome = 'win'; }
          else {
            const exitPrice = candle.close;
            const signedMove = bullish ? exitPrice - openF.entryPrice : openF.entryPrice - exitPrice;
            legR = signedMove / openF.distance;
            outcome = 'timeout';
          }
          const costR = spread > 0 ? spread / openF.distance : 0;
          resolveClose(symbol, legR - costR, candle.time, openF.riskAmount, 'fvg', outcome);
          openFvg[symbol] = null;
        }
      }

      // 2) Resolve Divergence open trade IF it's on this symbol.
      if (openDivergence && openDivergence.symbol === symbol && candle.time > openDivergence.entryTime) {
        const hitStop = candle.low <= openDivergence.stopPrice;
        const hitTarget = candle.high >= openDivergence.targetPrice;
        const timedOut = i - openDivergence.entryIndex >= DIV_MAX_HOLDING_M15_CANDLES;
        if (hitStop || hitTarget || timedOut) {
          let legR, outcome;
          if (hitStop) { legR = -1; outcome = 'loss'; }
          else if (hitTarget) { legR = DIV_RR_MULTIPLE; outcome = 'win'; }
          else { legR = (candle.close - openDivergence.entryPrice) / openDivergence.distance; outcome = 'timeout'; }
          const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
          const costR = divSpread > 0 ? divSpread / openDivergence.distance : 0;
          resolveClose(symbol, legR - costR, candle.time, openDivergence.riskAmount, 'div', outcome);
          openDivergence = null;
        }
      }

      // 3) Feed candle to the FVG engine -> maybe open a new FVG trade (three-way netting: blocked if
      //    ANY of FVG/Divergence/Turtle is already open on this symbol).
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') {
          formationIndexBySymbol[symbol].set(e.id, i);
        } else if (e.type === 'validated' && !anyOpenOnSymbol(symbol)) {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: m15BySymbol[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          if (!guardrail.canTakeNewTrade(candle.time)) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          openFvg[symbol] = { direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (RISK_PCT / 100) };
        }
      }

      // 4) Check for a Divergence candidate entry trigger on this exact candle/symbol (three-way netting).
      const divMap = divCandidatesByTime.get(symbol);
      const cand = divMap ? divMap.get(candle.time) : undefined;
      if (cand && !anyOpenOnSymbol(symbol)) {
        const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
        const distance = cand.stopDistance;
        if ((!divSpread || distance >= divSpread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const entryPrice = candle.open;
          openDivergence = {
            symbol,
            entryIndex: i,
            entryTime: candle.time,
            entryPrice,
            stopPrice: entryPrice - distance,
            targetPrice: entryPrice + DIV_RR_MULTIPLE * distance,
            distance,
            riskAmount: balance * (RISK_PCT / 100),
          };
        }
      }
    } else {
      // RSI(2) daily check-in: resolve an open RSI position, then look for a new mean-reversion entry.
      const day = ev.day;
      const i = ev.dayIndex;
      const spread = DEFAULT_SPREADS[symbol] ?? 0;

      const openR = openRsi[symbol];
      if (openR && i > openR.entryDayIndex) {
        const bullish = openR.direction === 'bullish';
        const hitStop = bullish ? day.low <= openR.stopPrice : day.high >= openR.stopPrice;
        const sma5 = rsiSma5[symbol][i];
        const hitMeanTarget = sma5 !== null && (bullish ? day.close >= sma5 : day.close <= sma5);
        const timedOut = i - openR.entryDayIndex >= RSI_MAX_HOLDING_DAYS;
        if (hitStop || hitMeanTarget || timedOut) {
          const exitPrice = hitStop ? openR.stopPrice : day.close; // mean-target/timeout both exit "on the close"
          const signedMove = bullish ? exitPrice - openR.entryPrice : openR.entryPrice - exitPrice;
          const grossR = signedMove / openR.distance;
          const costR = spread > 0 ? spread / openR.distance : 0;
          const netR = grossR - costR;
          const outcome = netR > 0 ? 'win' : 'loss';
          resolveClose(symbol, netR, day.time, openR.riskAmount, 'rsi', outcome);
          openRsi[symbol] = null;
        }
      }

      if (!openRsi[symbol] && !anyOpenOnSymbol(symbol)) {
        const y = i - 1; // signal day - yesterday's fully-known values only, filled at TODAY's open
        const ema200Y = rsiEma200[symbol][y];
        const rsiY = rsiValues[symbol][y];
        const atrY = rsiAtr[symbol][y];
        const closeY = dailyBySymbol[symbol][y]?.close;
        if (ema200Y !== null && rsiY !== null && atrY > 0 && closeY !== undefined && guardrail.canTakeNewTrade(day.time)) {
          const uptrend = closeY > ema200Y;
          const downtrend = closeY < ema200Y;
          if (uptrend && rsiY < RSI_OVERSOLD) {
            const entryPrice = day.open;
            const distance = RSI_STOP_ATR_MULTIPLE * atrY;
            if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
              openRsi[symbol] = { direction: 'bullish', entryDayIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, distance, riskAmount: balance * (RISK_PCT / 100) };
            }
          } else if (downtrend && rsiY > RSI_OVERBOUGHT) {
            const entryPrice = day.open;
            const distance = RSI_STOP_ATR_MULTIPLE * atrY;
            if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
              openRsi[symbol] = { direction: 'bearish', entryDayIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, distance, riskAmount: balance * (RISK_PCT / 100) };
            }
          }
        }
      }
    }
  }

  const firstTime = timeline[0].time;
  return {
    trades: totalTrades,
    fvgTrades,
    goldTrades,
    divTrades,
    rsiTrades,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted,
    bustDate,
    challengeLabel: challengePoint ? `jour ${daysBetween(firstTime, challengePoint.time)}` : 'jamais',
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades} FVG-idx + ${r.goldTrades} FVG-or + ${r.divTrades} div. + ${r.rsiTrades} RSI-2) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFinalCombinedAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15CandlesBySymbolFull = {};
  const dailyCandlesBySymbolFull = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
    if (RSI_SYMBOLS.includes(symbol)) dailyCandlesBySymbolFull[symbol] = resampleCandles(candles, DAY_MS);
  }
  console.error(`XAUUSD candles loaded: ${m15CandlesBySymbolFull.XAUUSD.length} (expect a 2022 gap - that year's raw data was never sourced)`);
  const divergenceCandidatesFull = computeDivergenceCandidates(m15CandlesBySymbolFull.US100, m15CandlesBySymbolFull.US500);
  console.error(`Divergence candidates precomputed: ${divergenceCandidatesFull.length}`);

  const md = [];
  md.push('# Impact au niveau du COMPTE — COMBINAISON FINALE : FVG (US100+US500+OR) + Divergence + RSI(2), règles FTMO 1-Step');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, TOUT ce qui a été validé dans ce projet réuni sur un seul compte : FVG sur ` +
      "US100, US500 ET XAUUSD (config propre à chaque instrument), Divergence US100/US500 (lookback 100, seuil " +
      "z=2, scope limité à ces deux instruments par nature), et RSI(2) mean-reversion (Connors, EMA200 + stop " +
      "2xATR(14) + sortie SMA(5)/10 jours) sur US100/US500 uniquement (jamais testé sur l'or, donc pas ajouté là " +
      "pour respecter la discipline de validation avant combinaison). NETTING À QUATRE sur US100/US500 (FVG + " +
      "Divergence + RSI-2, au plus une position par instrument) ; XAUUSD n'a que le FVG dessus, donc aucun conflit " +
      "de netting possible là. Un seul budget de garde-fous PARTAGÉ, garde-fous INCHANGÉS (max 2 trades/jour, " +
      "cooldown 30min après perte, perte quotidienne max 2% - plus strict que le 3% réel de FTMO 1-Step). Donnée " +
      "XAUUSD manque l'année 2022 (zip source jamais fourni). **Cible = +10% une seule fois (FTMO 1-Step). Perte " +
      "totale max = TRAILING sur le plus haut solde jamais atteint (10%).**"
  );
  md.push('');
  md.push('| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(m15CandlesBySymbolFull, dailyCandlesBySymbolFull, divergenceCandidatesFull, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades (' + r.fvgTrades + ' FVG-idx + ' + r.goldTrades + ' FVG-or + ' + r.divTrades + ' div + ' + r.rsiTrades + ' RSI-2), solde $' + r.finalBalance.toFixed(0) + ', challenge: ' + r.challengeLabel : 'skip'}`);
  }

  const outMd = path.join(dir, 'final-combined-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
