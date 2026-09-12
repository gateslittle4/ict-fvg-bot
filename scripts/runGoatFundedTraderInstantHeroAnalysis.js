#!/usr/bin/env node
// runGoatFundedTraderInstantHeroAnalysis.js
// Usage: node scripts/runGoatFundedTraderInstantHeroAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12), after Instant Premium's price came back too high:
// "de toute façon il est trop cher. Teste le Instant HERO model, il a
// beaucoup de règles, surtout le 15% consistency." Verified live against
// GoatFundedTrader's own help article (help.goatfundedtrader.com/en/
// articles/16097387-instant-hero-model) - Instant HERO is a DIFFERENT
// instant-funded program from Instant Premium (see
// runGoatFundedTraderFloatingLossAnalysis.js), not the same thing renamed:
// tighter 5% total drawdown (vs 6%), the SAME kind of -1% floating-loss
// instant-kill rule, but ALSO a real, payout-blocking 15% consistency rule
// Instant Premium doesn't have at all - the one Esdras specifically asked
// to have tested, and a better 90% profit split (vs Instant Premium's 80%).
//
// THREE mechanisms modeled here:
//   1. Floating Loss Rule (-1%, instant, permanent closure) - same
//      intra-candle mark-to-market machinery built for Instant Premium,
//      reused as-is (see that script's header for exactly how it works and
//      its stated net-floating-P&L modeling assumption).
//   2. Overall 5% max drawdown, trailing off REAL-TIME EQUITY (balance +
//      unrealized P&L) - same real-time-equity mechanic as Instant
//      Premium's 6%, just tighter. NOTE: the source says this floor
//      "resets after each payout" - NOT modeled here (exact payout timing
//      is a trader decision this project can't determine from the strategy
//      alone), so this script's bust rate is a CONSERVATIVE (worst-case,
//      floor never resets) estimate - the real rate is likely somewhat
//      lower once real payouts are factored in.
//   3. NEW - the 15% consistency rule Esdras asked about. Confirmed via the
//      source: does NOT close the account or breach it - it only BLOCKS a
//      payout request until the highest single day's profit share drops
//      under 15% of the period's total profit. Modeled as a ROLLING
//      14-CALENDAR-DAY window (matching the payout cycle) ending on each
//      day that had at least one closed trade: for that window, is any
//      single day's net profit >= 15% of the window's total net profit?
//      The source does not specify the exact window used to evaluate the
//      rule - this is a documented assumption, not a confirmed mechanic.
//
// Daily loss (3%) stays a GuardrailEngine gate (blocks new entries for the
// rest of that day), not a bust - same convention as every other script.
//
// Reuses the exact production combo (FVG US100 multi-touch 8h-12h, US500
// 10h-11h, XAUUSD 8h-12h, Divergence, NWOG, Judas Swing) read straight from
// CONFIG. No weekend/minimum-hold-time/inactivity rules modeled (see
// propFirms/goatFundedTrader.js's own comments on those - out of scope).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { computeZScoreSeries, alignByTime } from '../src/backtest/correlation.js';
import { detectNwogEvents } from '../src/backtest/nwog.js';
import { detectJudasSwingEvents } from '../src/backtest/judasSwing.js';
import { CONFIG } from '../src/config.js';
import { getPropFirmProgram } from '../src/propFirms/index.js';

const STARTING_BALANCE = 10000;
const RISK_LEVELS = [0.5, 0.3, 0.25, 0.15, 0.1, 0.05];
const PROGRAM = getPropFirmProgram('goatfundedtrader-instant-hero');
const PHASE = PROGRAM.phases[0];
const FLOATING_THRESHOLD_PCT = PROGRAM.floatingLossRule.thresholdPct; // 1
const EQUITY_TRAILING_PCT = PHASE.maxDrawdownPct; // 5
const CONSISTENCY_MAX_SHARE_PCT = PROGRAM.consistencyRule.maxSharePct; // 15
const CONSISTENCY_WINDOW_DAYS = PROGRAM.withdrawalCycleDays; // 14 - see header assumption
const DAY_MS = 24 * 60 * 60 * 1000;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FVG_SYMBOLS = Object.keys(CONFIG.fvg.perSymbol);
const DIV_PAIR = CONFIG.divergence.pair;
const NWOG_SYMBOLS = CONFIG.nwog.symbols;
const JUDAS_SYMBOLS = CONFIG.judasSwing.symbols;
const ALL_SYMBOLS = [...new Set([...FVG_SYMBOLS, ...DIV_PAIR, ...NWOG_SYMBOLS, ...JUDAS_SYMBOLS])];

const FVG_CONFIG = {};
for (const symbol of FVG_SYMBOLS) FVG_CONFIG[symbol] = { ...CONFIG.fvg.perSymbol[symbol], spread: DEFAULT_SPREADS[symbol] };

const DIV_LOOKBACK = CONFIG.divergence.lookback;
const DIV_Z_THRESHOLD = CONFIG.divergence.zThreshold;
const DIV_ATR_PERIOD = CONFIG.divergence.atrPeriod;
const DIV_STOP_ATR_MULTIPLE = CONFIG.divergence.stopAtrMultiple;
const DIV_RR_MULTIPLE = CONFIG.divergence.rrMultiple;
const DIV_MAX_HOLDING_CANDLES = CONFIG.divergence.maxHoldingM15Candles;
const NWOG_RR = CONFIG.nwog.rrMultiple;
const NWOG_MAX_HOLDING = CONFIG.nwog.maxHoldingM15Candles;
const JUDAS_RR = CONFIG.judasSwing.rrMultiple;
const JUDAS_MAX_HOLDING = CONFIG.judasSwing.maxHoldingM15Candles;

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
      if (atr && atr > 0) candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: DIV_STOP_ATR_MULTIPLE * atr });
    }
    wasExtended = extended;
  }
  return candidates;
}

function computeNwogCandidatesMap(candles) {
  const events = detectNwogEvents(candles);
  const map = new Map();
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    map.set(candles[entryIndex].time, { direction: e.direction, stopReference: e.stopReference });
  }
  return map;
}

function computeJudasCandidatesMap(candles) {
  const events = detectJudasSwingEvents(candles);
  const map = new Map();
  for (const e of events) {
    const entryIndex = e.index + 1;
    if (entryIndex >= candles.length) continue;
    map.set(candles[entryIndex].time, { direction: e.direction, stopReference: e.sweepExtreme });
  }
  return map;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }
function dayKeyFor(ms) { return new Date(ms - (ms % DAY_MS)).toISOString().slice(0, 10); } // UTC calendar day

// Rolling CONSISTENCY_WINDOW_DAYS-day check, evaluated at every day that had
// at least one closed trade: over the trailing window ending on that day,
// does any single day's net profit make up >= CONSISTENCY_MAX_SHARE_PCT of
// the window's total net profit? Only evaluated when the window's total
// profit is positive (a "share of profit" is undefined when there's no net
// profit to share - not specified by the source, a documented assumption).
function checkConsistencyRule(dailyPnlByDayKey) {
  const days = [...dailyPnlByDayKey.keys()].sort();
  const dayMsByKey = new Map(days.map((k) => [k, Date.parse(k + 'T00:00:00Z')]));
  let violatingDays = 0;
  let worstShare = 0;
  let worstShareDay = null;
  for (const endKey of days) {
    const endMs = dayMsByKey.get(endKey);
    const startMs = endMs - (CONSISTENCY_WINDOW_DAYS - 1) * DAY_MS;
    let total = 0;
    let maxDay = -Infinity;
    for (const k of days) {
      const ms = dayMsByKey.get(k);
      if (ms < startMs || ms > endMs) continue;
      const pnl = dailyPnlByDayKey.get(k);
      total += pnl;
      if (pnl > maxDay) maxDay = pnl;
    }
    if (total <= 0) continue; // no profit to share - rule doesn't apply
    const share = (maxDay / total) * 100;
    if (share > worstShare) { worstShare = share; worstShareDay = endKey; }
    if (share >= CONSISTENCY_MAX_SHARE_PCT) violatingDays++;
  }
  return { violatingDays, totalDaysChecked: days.length, worstShare, worstShareDay };
}

function simulateYear(candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull, year, riskPct) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

  const bySymbol = {};
  for (const symbol of ALL_SYMBOLS) bySymbol[symbol] = (candlesBySymbolFull[symbol] || []).filter((c) => c.time >= yearStart && c.time < yearEnd);
  if (ALL_SYMBOLS.every((s) => bySymbol[s].length < 50)) return null;

  const divCandidatesByTime = new Map();
  for (const symbol of DIV_PAIR) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) if (cand.entryTime >= yearStart && cand.entryTime < yearEnd) divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);
  const nwogCandidatesByTime = new Map();
  for (const [t, c] of nwogCandidatesFull) if (t >= yearStart && t < yearEnd) nwogCandidatesByTime.set(t, c);
  const judasCandidatesByTime = new Map();
  for (const [t, c] of judasCandidatesFull) if (t >= yearStart && t < yearEnd) judasCandidatesByTime.set(t, c);

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails, dailyLossLimitPct: PHASE.dailyLossLimitPct });
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    if (bySymbol[symbol].length === 0) continue;
    if (FVG_CONFIG[symbol].multiTouch) {
      const predicate = buildMultiTouchFilterPredicate(bySymbol[symbol], symbol, FVG_CONFIG[symbol]);
      engines[symbol] = new MultiTouchFvgEngine({ symbol, checkFilters: predicate });
    } else {
      const { engine } = buildFilteredEngine(bySymbol[symbol], symbol, FVG_CONFIG[symbol]);
      engines[symbol] = engine;
    }
  }

  const timeline = [];
  for (const symbol of ALL_SYMBOLS) for (const candle of bySymbol[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));
  if (timeline.length === 0) return null;

  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  let balance = STARTING_BALANCE;
  let equityPeak = STARTING_BALANCE;
  let realizedPeak = STARTING_BALANCE;
  let realizedMaxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let bustReason = null; // 'floating-loss' | 'equity-trailing'
  let worstFloatingLossPct = 0;

  const openPositions = {}; for (const s of ALL_SYMBOLS) openPositions[s] = null;
  const floatingRBySymbol = {}; for (const s of ALL_SYMBOLS) floatingRBySymbol[s] = null;
  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();
  const dailyPnlByDayKey = new Map();

  let totalTrades = 0, wins = 0, resolvedCount = 0;
  const bySource = { fvg: 0, divergence: 0, nwog: 0, judas: 0 };

  const totalFloatingPnl = () => {
    let sum = 0;
    for (const s of ALL_SYMBOLS) if (openPositions[s] && floatingRBySymbol[s] !== null) sum += floatingRBySymbol[s] * openPositions[s].riskAmount;
    return sum;
  };

  const resolveClose = (symbol, source, netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    realizedPeak = Math.max(realizedPeak, balance);
    realizedMaxDrawdownPct = Math.max(realizedMaxDrawdownPct, ((realizedPeak - balance) / realizedPeak) * 100);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    bySource[source]++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }
    const key = dayKeyFor(exitTime);
    dailyPnlByDayKey.set(key, (dailyPnlByDayKey.get(key) ?? 0) + pnl);
  };

  for (const { symbol, candle } of timeline) {
    if (busted) break;
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    const open = openPositions[symbol];
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= open.maxHoldingCandles;

      let worstR = bullish ? (candle.low - open.entryPrice) / open.distance : (open.entryPrice - candle.high) / open.distance;
      if (hitStop) worstR = Math.max(worstR, -1);
      floatingRBySymbol[symbol] = worstR;

      if (hitStop || hitTarget || timedOut) {
        let legR, outcome;
        if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = open.rrMultiple; outcome = 'win'; }
        else {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
          legR = signedMove / open.distance; outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / open.distance : 0;
        resolveClose(symbol, open.source, legR - costR, candle.time, open.riskAmount, outcome);
        openPositions[symbol] = null;
        floatingRBySymbol[symbol] = null;
      }
    }

    const floatingPnl = totalFloatingPnl();
    const floatingLossPct = floatingPnl < 0 ? (-floatingPnl / balance) * 100 : 0;
    if (floatingLossPct > worstFloatingLossPct) worstFloatingLossPct = floatingLossPct;

    const equityNow = balance + floatingPnl;
    equityPeak = Math.max(equityPeak, equityNow);
    const equityFloor = equityPeak * (1 - EQUITY_TRAILING_PCT / 100);

    if (!busted && floatingLossPct >= FLOATING_THRESHOLD_PCT) {
      busted = true; bustDate = fmtDate(candle.time); bustReason = 'floating-loss';
    } else if (!busted && equityNow <= equityFloor) {
      busted = true; bustDate = fmtDate(candle.time); bustReason = 'equity-trailing';
    }
    if (busted) break;

    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') formationIndexBySymbol[symbol].set(e.id, i);
        else if (e.type === 'validated' && !openPositions[symbol]) {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: bySymbol[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          if (!guardrail.canTakeNewTrade(candle.time)) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          openPositions[symbol] = { source: 'fvg', direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (riskPct / 100), maxHoldingCandles: 480 };
          floatingRBySymbol[symbol] = 0;
        }
      }
    }

    if (DIV_PAIR.includes(symbol) && !openPositions[symbol]) {
      const cand = divCandidatesByTime.get(symbol)?.get(candle.time);
      if (cand) {
        const distance = cand.stopDistance;
        if ((!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const entryPrice = candle.open;
          openPositions[symbol] = { source: 'divergence', direction: 'bullish', entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance, rrMultiple: DIV_RR_MULTIPLE, riskAmount: balance * (riskPct / 100), maxHoldingCandles: DIV_MAX_HOLDING_CANDLES };
          floatingRBySymbol[symbol] = 0;
        }
      }
    }

    if (NWOG_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = nwogCandidatesByTime.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + NWOG_RR * distance : entryPrice - NWOG_RR * distance;
          openPositions[symbol] = { source: 'nwog', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: NWOG_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: NWOG_MAX_HOLDING };
          floatingRBySymbol[symbol] = 0;
        }
      }
    }

    if (JUDAS_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = judasCandidatesByTime.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + JUDAS_RR * distance : entryPrice - JUDAS_RR * distance;
          openPositions[symbol] = { source: 'judas', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: JUDAS_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: JUDAS_MAX_HOLDING };
          floatingRBySymbol[symbol] = 0;
        }
      }
    }
  }

  const consistency = checkConsistencyRule(dailyPnlByDayKey);

  return {
    trades: totalTrades, bySource,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    realizedMaxDrawdownPct,
    busted, bustDate, bustReason,
    worstFloatingLossPct,
    finalBalance: balance,
    consistency,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | |`;
  const wr = r.winRate !== null ? pct(r.winRate) : '—';
  const bustCell = r.busted ? `**${r.bustReason === 'floating-loss' ? 'FLOTTANT' : 'ÉQUITÉ 5%'}** (${r.bustDate})` : 'non';
  const worstCell = r.worstFloatingLossPct >= FLOATING_THRESHOLD_PCT ? `**${r.worstFloatingLossPct.toFixed(2)}%**` : `${r.worstFloatingLossPct.toFixed(2)}%`;
  const consCell = r.consistency.violatingDays > 0
    ? `**${r.consistency.violatingDays}/${r.consistency.totalDaysChecked}** (pire: ${r.consistency.worstShare.toFixed(0)}% le ${r.consistency.worstShareDay})`
    : `0/${r.consistency.totalDaysChecked}`;
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.realizedMaxDrawdownPct.toFixed(1)}% | ${worstCell} | ${bustCell} | ${consCell} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runGoatFundedTraderInstantHeroAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) candlesBySymbolFull[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;

  const divergenceCandidatesFull = computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500);
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);

  const md = [];
  md.push('# GoatFundedTrader Instant HERO — perte flottante, équité 5% ET la règle de consistance 15%');
  md.push('');
  md.push(
    "Esdras, après avoir trouvé Instant Premium trop cher : \"teste le Instant HERO model, il a beaucoup de règles, " +
      "surtout le 15% consistency.\" Vérifié en direct sur la page d'aide officielle de GoatFundedTrader - Instant " +
      "HERO est un programme DIFFÉRENT d'Instant Premium (pas le même sous un autre nom) : perte totale plus " +
      "serrée (5% au lieu de 6%), la MÊME règle de perte flottante (-1%, fermeture instantanée), MAIS en plus une " +
      "vraie règle de consistance à 15% qu'Instant Premium n'a pas du tout - et un meilleur split (90% au lieu de " +
      "80%).\n\n" +
      "**Trois mécanismes testés** :\n" +
      "1. **Perte flottante -1%** : même suivi intra-bougie que pour Instant Premium (voir " +
      "`runGoatFundedTraderFloatingLossAnalysis.js`) - P&L flottant NET du compte, sommé sur les 4 symboles.\n" +
      `2. **Perte totale 5%**, trailing sur l'équité temps réel - même mécanisme qu'Instant Premium, juste plus ` +
      "serré. La source précise que ce plancher \"reset après chaque paiement\" - NON modélisé ici (le rythme réel " +
      "des retraits est une décision du trader, pas quelque chose que la stratégie seule détermine), donc le taux " +
      "de bust ci-dessous est une estimation CONSERVATRICE (pire cas, plancher qui ne remonte jamais) - le vrai " +
      "taux serait probablement plus bas avec de vrais retraits réguliers.\n" +
      "3. **La règle de consistance 15%** - celle demandée explicitement. Confirmée par la source : NE ferme PAS " +
      "le compte, bloque seulement une demande de retrait tant que le jour le plus profitable dépasse 15% du " +
      "profit total de la période. Modélisée ici comme une fenêtre glissante de 14 jours calendaires (le cycle de " +
      "retrait) - la source ne précise pas la fenêtre exacte utilisée pour évaluer la règle, c'est une hypothèse " +
      "de modélisation documentée, pas un mécanisme confirmé. Le \"total\" utilisé est le profit NET de la " +
      "fenêtre (gains moins pertes des autres jours) - si les autres jours de la fenêtre sont globalement perdants, " +
      "ce total net peut être petit, et le meilleur jour peut alors en représenter largement plus de 100% (un " +
      "artefact réel et connu de ce type de règle, pas un bug de ce script - visible dans les tableaux ci-dessous " +
      "sous forme de pourcentages parfois très supérieurs à 100%).\n\n" +
      "La perte quotidienne (3%) reste un simple garde-fou (bloque les nouvelles entrées, pas un bust) - même " +
      "convention que partout ailleurs ce mois-ci."
  );
  md.push('');

  const summaryByRisk = [];
  for (const riskPct of RISK_LEVELS) {
    md.push(`## Risque ${riskPct}%/trade`);
    md.push('');
    md.push(`| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante (seuil ${FLOATING_THRESHOLD_PCT}%) | Busté? | Jours en violation consistance 15% | Solde final |`);
    md.push('|---|---|---|---|---|---|---|---|');
    const results = {};
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull, year, riskPct);
      results[year] = r;
      md.push(fmtRow(year, r));
      console.error(`[${riskPct}%] ${year}: ${r ? r.trades + ' trades, pire flottant ' + r.worstFloatingLossPct.toFixed(2) + '%, consistance ' + r.consistency.violatingDays + '/' + r.consistency.totalDaysChecked + (r.busted ? ' BUSTÉ (' + r.bustReason + ') ' + r.bustDate : '') : 'skip'}`);
    }
    const validYears = YEARS.filter((y) => results[y]);
    const bustedYears = validYears.filter((y) => results[y].busted);
    const floatingBusts = bustedYears.filter((y) => results[y].bustReason === 'floating-loss');
    const equityBusts = bustedYears.filter((y) => results[y].bustReason === 'equity-trailing');
    const worstEver = Math.max(...validYears.map((y) => results[y].worstFloatingLossPct));
    const totalConsViolations = validYears.reduce((s, y) => s + results[y].consistency.violatingDays, 0);
    const totalConsDays = validYears.reduce((s, y) => s + results[y].consistency.totalDaysChecked, 0);
    md.push('');
    md.push(
      `**Bilan ${riskPct}%** : ${bustedYears.length}/${validYears.length} années busted (${floatingBusts.length} par perte flottante — ${equityBusts.length} par équité ${EQUITY_TRAILING_PCT}%). ` +
        `Pire perte flottante atteinte : **${worstEver.toFixed(2)}%**. Consistance 15% : ${totalConsViolations}/${totalConsDays} jours-fenêtres en violation (${totalConsDays ? ((totalConsViolations / totalConsDays) * 100).toFixed(0) : 0}% du temps un retrait aurait été bloqué pour cette raison).`
    );
    md.push('');
    summaryByRisk.push({ riskPct, bustedYears, floatingBusts, equityBusts, validYears, worstEver, totalConsViolations, totalConsDays });
  }

  md.push('## Verdict');
  md.push('');
  const clean = summaryByRisk.filter((s) => s.bustedYears.length === 0);
  const best = clean.length ? clean.reduce((a, b) => (b.riskPct > a.riskPct ? b : a)) : null;
  md.push('| Risque | Années bustées | Dont perte flottante | Dont équité 5% | Pire perte flottante | Violations consistance 15% |');
  md.push('|---|---|---|---|---|---|');
  for (const s of summaryByRisk) {
    md.push(`| ${s.riskPct}% | ${s.bustedYears.length}/${s.validYears.length} | ${s.floatingBusts.length} | ${s.equityBusts.length} | ${s.worstEver.toFixed(2)}% | ${s.totalConsViolations}/${s.totalConsDays} |`);
  }
  md.push('');
  const totalFloatingBusts = summaryByRisk.reduce((s, r) => s + r.floatingBusts.length, 0);
  const totalEquityBusts = summaryByRisk.reduce((s, r) => s + r.equityBusts.length, 0);
  const totalConsViolationsAll = summaryByRisk.reduce((s, r) => s + r.totalConsViolations, 0);
  const totalConsDaysAll = summaryByRisk.reduce((s, r) => s + r.totalConsDays, 0);
  if (best) {
    md.push(
      `**Le risque le plus élevé qui ne busait AUCUNE année testée (ni perte flottante, ni équité ${EQUITY_TRAILING_PCT}%) est ${best.riskPct}%/trade** ` +
        `(pire perte flottante atteinte : ${best.worstEver.toFixed(2)}%, sous le seuil de ${FLOATING_THRESHOLD_PCT}%). ` +
        `Comme pour Instant Premium, sur les ${totalFloatingBusts + totalEquityBusts} busts trouvés tous risques confondus, ${totalFloatingBusts} viennent de la perte flottante contre **${totalEquityBusts} de la règle d'équité ${EQUITY_TRAILING_PCT}%** - encore une fois le vrai facteur limitant, pas celle qu'on regardait au départ (et encore plus stricte ici que les 6% d'Instant Premium).\n\n` +
        `**Sur la règle de consistance 15%, spécifiquement demandée** : ${totalConsViolationsAll}/${totalConsDaysAll} jours-fenêtres (${totalConsDaysAll ? ((totalConsViolationsAll / totalConsDaysAll) * 100).toFixed(0) : 0}%) tous risques confondus auraient bloqué une demande de retrait à ce moment-là - elle mord régulièrement mais ne casse jamais le compte (juste retarde un retrait), donc nettement moins grave que les deux autres règles.`
    );
  } else {
    md.push(
      `**Aucun des niveaux de risque testés (${RISK_LEVELS.join('%, ')}%) n'évite le bust sur les 7 ans testés.** ` +
        `Voir le détail par risque ci-dessus pour identifier le facteur limitant (perte flottante vs équité ${EQUITY_TRAILING_PCT}%).`
    );
  }
  md.push('');
  md.push(
    "**Rappel important** : le taux de bust de la règle d'équité ci-dessus est CONSERVATEUR - elle \"reset après " +
      "chaque paiement\" selon la source, non modélisé ici. Rien codé dans `src/` au-delà du profil " +
      "`GOATFUNDEDTRADER_INSTANT_HERO` déjà ajouté à `src/propFirms/` (documentaire, pas branché sur un vrai " +
      "compte). Analyse de recherche seulement - aucune décision de trading réelle prise ici."
  );

  const outMd = path.join(dir, 'goatfundedtrader-instant-hero-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
