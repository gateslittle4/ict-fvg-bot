#!/usr/bin/env node
// checkOutcomeSerialCorrelationFullCombo.js
// Usage: node scripts/checkOutcomeSerialCorrelationFullCombo.js <dir-with-csvs>
//
// checkOutcomeSerialCorrelation.js already checked the premise behind a
// streak-based risk ladder (does a win make the next trade more likely to
// win too?) — but only on FVG US100+US500, TWO of the FOUR signal sources
// actually running in the real recommended combo (FVG on US100+US500+XAUUSD
// + Divergence US100/US500, see HANDOFF.md "Combo recommandé actuel").
// Before extending the adaptive risk ladder to the REAL combo, re-check the
// same premise on the SAME shared chronological close-time sequence the
// real combo would actually produce — XAUUSD and Divergence could easily
// have different serial-correlation behavior than the original two-symbol
// check found (Divergence is mean-reversion, a different mechanism
// entirely; mixing sources changes the sequence a shared ladder would see).
//
// Run as ONE CONTINUOUS 2019-2025 sequence (not per-year, which would break
// up close streaks at each Dec 31 -> Jan 1 boundary and understate any real
// serial correlation) — same convention as the original
// checkOutcomeSerialCorrelation.js, which also ran continuously rather than
// per-year.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { computeZScoreSeries, alignByTime } from '../src/backtest/correlation.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_M15_CANDLES = 480;

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
      if (atr && atr > 0) candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: 1.5 * atr });
    }
    wasExtended = extended;
  }
  return candidates;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/checkOutcomeSerialCorrelationFullCombo.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15BySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15BySymbol[symbol] = candles;
  }
  const divergenceCandidatesFull = computeDivergenceCandidates(m15BySymbol.US100, m15BySymbol.US500);
  const divCandidatesByTime = new Map();
  for (const symbol of ['US100', 'US500']) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  const timeline = [];
  for (const symbol of FVG_SYMBOLS) {
    for (const candle of m15BySymbol[symbol]) timeline.push({ symbol, candle });
  }
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));
  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  let balance = STARTING_BALANCE;
  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  const closedTrades = []; // { exitTime, outcome, source }

  const resolveClose = (symbol, netR, exitTime, riskAmount, source, outcome) => {
    balance += riskAmount * netR;
    guardrail.recordTrade({ pnl: riskAmount * netR, time: exitTime, balanceAfter: balance });
    closedTrades.push({ exitTime, outcome, source });
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = FVG_CONFIG[symbol].spread ?? 0;

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
        resolveClose(symbol, legR - costR, candle.time, STARTING_BALANCE * (RISK_PCT / 100), symbol === 'XAUUSD' ? 'fvg-gold' : 'fvg-idx', outcome);
        openFvg[symbol] = null;
      }
    }

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
        resolveClose(symbol, legR - costR, candle.time, STARTING_BALANCE * (RISK_PCT / 100), 'div', outcome);
        openDivergence = null;
      }
    }

    const events = engines[symbol].processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexBySymbol[symbol].set(e.id, i);
      } else if (e.type === 'validated' && !openFvg[symbol] && !(openDivergence && openDivergence.symbol === symbol)) {
        const c3Index = formationIndexBySymbol[symbol].get(e.id);
        const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
        const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
        const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: m15BySymbol[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
        const distance = Math.abs(entryPrice - stopPrice);
        if (distance <= 0) continue;
        if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
        if (!guardrail.canTakeNewTrade(candle.time)) continue;
        const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
        openFvg[symbol] = { direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple };
      }
    }

    const divMap = divCandidatesByTime.get(symbol);
    const cand = divMap ? divMap.get(candle.time) : undefined;
    if (cand && !openDivergence && !openFvg[symbol]) {
      const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
      const distance = cand.stopDistance;
      if ((!divSpread || distance >= divSpread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
        const entryPrice = candle.open;
        openDivergence = { symbol, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance };
      }
    }
  }

  const trades = closedTrades.filter((t) => t.outcome !== 'timeout');
  console.log(`Trades combo complet (win/loss only, timeouts exclus): ${trades.length}`);

  function stat(subset) {
    let aw = { w: 0, t: 0 }, al = { w: 0, t: 0 };
    for (let i = 1; i < subset.length; i++) {
      const prevWin = subset[i - 1].outcome === 'win';
      const thisWin = subset[i].outcome === 'win';
      if (prevWin) { aw.t++; if (thisWin) aw.w++; } else { al.t++; if (thisWin) al.w++; }
    }
    return { aw, al };
  }

  const { aw, al } = stat(trades);
  console.log(`P(win | trade précédent gagné) = ${aw.w}/${aw.t} = ${aw.t ? (100 * aw.w / aw.t).toFixed(1) : '—'}%`);
  console.log(`P(win | trade précédent perdu) = ${al.w}/${al.t} = ${al.t ? (100 * al.w / al.t).toFixed(1) : '—'}%`);

  const trainTrades = trades.filter((t) => t.exitTime < TRAIN_CUTOFF);
  const testTrades = trades.filter((t) => t.exitTime >= TRAIN_CUTOFF);
  const trainStat = stat(trainTrades);
  const testStat = stat(testTrades);
  console.log(`\nTRAIN (2019-2023): P(win|prevWin)=${trainStat.aw.t ? (100 * trainStat.aw.w / trainStat.aw.t).toFixed(1) : '—'}% (n=${trainStat.aw.t}) vs P(win|prevLoss)=${trainStat.al.t ? (100 * trainStat.al.w / trainStat.al.t).toFixed(1) : '—'}% (n=${trainStat.al.t})`);
  console.log(`TEST  (2024-2025): P(win|prevWin)=${testStat.aw.t ? (100 * testStat.aw.w / testStat.aw.t).toFixed(1) : '—'}% (n=${testStat.aw.t}) vs P(win|prevLoss)=${testStat.al.t ? (100 * testStat.al.w / testStat.al.t).toFixed(1) : '—'}% (n=${testStat.al.t})`);

  let longestWinStreak = 0, longestLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of trades) {
    if (t.outcome === 'win') { curWin++; curLoss = 0; } else { curLoss++; curWin = 0; }
    longestWinStreak = Math.max(longestWinStreak, curWin);
    longestLossStreak = Math.max(longestLossStreak, curLoss);
  }
  console.log(`\nPlus longue série de gains observée: ${longestWinStreak}, plus longue série de pertes: ${longestLossStreak}`);

  const bySource = {};
  for (const t of trades) { bySource[t.source] = (bySource[t.source] || 0) + 1; }
  console.log(`\nRépartition par source: ${JSON.stringify(bySource)}`);
}

main();
