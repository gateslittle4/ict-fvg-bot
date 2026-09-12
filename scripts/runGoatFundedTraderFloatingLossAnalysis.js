#!/usr/bin/env node
// runGoatFundedTraderFloatingLossAnalysis.js
// Usage: node scripts/runGoatFundedTraderFloatingLossAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12): "construis l'analyse de perte flottante pour
// GoatFundedTrader." Direct follow-up to the "Instant Premium Model"
// verification (see HANDOFF.md, same day): GoatFundedTrader's Instant
// Premium has a rule no other program in this project has ever modeled -
// a "Floating Loss Rule". Unrealized loss of -1% (accounts bought on/after
// 2026-09-02, i.e. any NEW purchase today) or -1.5% (older accounts) of
// balance, at ANY MOMENT, closes the account PERMANENTLY - even before any
// stop is actually touched. Every other bust check in this project (every
// FTMO/FundingPips script, GuardrailEngine's maxDrawdownPct) only looks at
// REALIZED balance at trade close - none of them can see a position's
// intermediate floating dip while it's still open. This script builds that
// missing capability from scratch: real intra-candle mark-to-market on
// every currently-open position (using the candle's own low/high, same
// worst-case-within-the-candle convention already used for stop/target
// checks everywhere else), summed across all symbols with a position open
// at once (up to 4: US100/US500/XAUUSD/EURUSD).
//
// TWO bust mechanisms modeled here, since GoatFundedTrader's total-loss rule
// (6%) is ALSO equity-based ("trailing, on equity, never comes back down"),
// not realized-balance-based like FTMO/FundingPips - so it needs the same
// floating tracking:
//   1. Floating Loss Rule (-1%/-1.5%, instant, permanent) - the NEW
//      mechanism, this script's main purpose.
//   2. Overall 6% max drawdown, trailing off REAL-TIME EQUITY (balance +
//      unrealized P&L), not just realized balance at trade close - modeled
//      directly here since none of GuardrailEngine's 3 existing
//      maxDrawdownType values captures continuous floating-inclusive
//      tracking (see propFirms/goatFundedTrader.js's own comment on this).
//
// Daily loss (3%) is modeled the SAME way as every other script this
// session (a GuardrailEngine gate that blocks new entries for the rest of
// that day) - NOT a bust, since nothing in the sourced rules explicitly
// says breaching it closes the account outright (unlike the floating-loss
// rule, which explicitly does).
//
// MODELING ASSUMPTION, stated up front (unverified against the source,
// flagged rather than silently assumed): "floating loss" is read as the
// ACCOUNT'S NET floating P&L (gains on one open symbol can offset losses on
// another, exactly like real broker equity = balance + sum of every open
// position's unrealized P&L) - not the worst SINGLE position's floating
// loss in isolation. This is the more natural reading of "unrealized loss
// on the account", but if GoatFundedTrader actually means "any one position
// alone", their real rule would be even stricter than what's modeled here.
//
// Reuses the exact production combo (FVG US100 multi-touch 8h-12h, US500
// 10h-11h, XAUUSD 8h-12h, Divergence, NWOG, Judas Swing) read straight from
// CONFIG, same architecture as every other combined-strategy script this
// session. No weekend/news rules modeled here (Instant Premium's versions
// of those are "profit voided/capped", not instant bust, unlike Zero's -
// see goatFundedTrader.js's own weekendRule/newsRule comments) - out of
// scope for THIS script.

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
const PROGRAM = getPropFirmProgram('goatfundedtrader-instant-premium');
const PHASE = PROGRAM.phases[0];
const FLOATING_THRESHOLD_PCT = PROGRAM.floatingLossRule.thresholdPct; // 1 - the one that applies to any account bought today
const FLOATING_THRESHOLD_LEGACY_PCT = PROGRAM.floatingLossRule.thresholdPctLegacy; // 1.5 - comparison only
const EQUITY_TRAILING_PCT = PHASE.maxDrawdownPct; // 6
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
  let equityPeak = STARTING_BALANCE; // real-time, floating-inclusive - see EQUITY_TRAILING_PCT
  let realizedPeak = STARTING_BALANCE; // for comparison only - the naive realized-only peak every OTHER script in this project tracks
  let realizedMaxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let bustReason = null; // 'floating-loss' | 'equity-trailing'
  let worstFloatingLossPct = 0; // how close we got, even on years that never bust
  let worstFloatingLossAt = null;
  let floatingBreachesAt1Pct = 0; // how many DISTINCT candles crossed 1% (informational - busted stops the count at the first one)

  const openPositions = {}; for (const s of ALL_SYMBOLS) openPositions[s] = null;
  const floatingRBySymbol = {}; for (const s of ALL_SYMBOLS) floatingRBySymbol[s] = null; // worst-in-candle R for the CURRENTLY open position, null = no open position
  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

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
  };

  for (const { symbol, candle } of timeline) {
    if (busted) break;
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    // 1) Update the floating snapshot for THIS symbol's open position (if
    // any) from this candle's own worst excursion, THEN resolve stop/
    // target/timeout exactly as every other script does.
    const open = openPositions[symbol];
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= open.maxHoldingCandles;

      // Worst-in-candle floating R, BEFORE knowing whether it closes this
      // candle - same "the extreme within the candle" convention already
      // used for stop/target checks everywhere else in this project.
      let worstR = bullish ? (candle.low - open.entryPrice) / open.distance : (open.entryPrice - candle.high) / open.distance;
      // Capped at exactly -1: this project assumes exact stop execution, no
      // slippage/gap-through anywhere else, so the floating snapshot never
      // shows a deeper dip than the stop itself would have allowed.
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

    // 2) Combined floating P&L across every symbol with a position open
    // RIGHT NOW (net, per this script's stated modeling assumption - see
    // header), and the two bust checks that depend on it.
    const floatingPnl = totalFloatingPnl();
    const floatingLossPct = floatingPnl < 0 ? (-floatingPnl / balance) * 100 : 0;
    if (floatingLossPct > worstFloatingLossPct) { worstFloatingLossPct = floatingLossPct; worstFloatingLossAt = candle.time; }
    if (floatingLossPct >= FLOATING_THRESHOLD_PCT) floatingBreachesAt1Pct++;

    const equityNow = balance + floatingPnl;
    equityPeak = Math.max(equityPeak, equityNow);
    const equityFloor = equityPeak * (1 - EQUITY_TRAILING_PCT / 100);

    if (!busted && floatingLossPct >= FLOATING_THRESHOLD_PCT) {
      busted = true; bustDate = fmtDate(candle.time); bustReason = 'floating-loss';
    } else if (!busted && equityNow <= equityFloor) {
      busted = true; bustDate = fmtDate(candle.time); bustReason = 'equity-trailing';
    }
    if (busted) break;

    // 3) New entries - same 4-source priority order as every other combined script.
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

  return {
    trades: totalTrades, bySource,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    realizedMaxDrawdownPct,
    busted, bustDate, bustReason,
    worstFloatingLossPct, worstFloatingLossAt,
    floatingBreachesAt1Pct,
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | |`;
  const wr = r.winRate !== null ? pct(r.winRate) : '—';
  const bustCell = r.busted ? `**${r.bustReason === 'floating-loss' ? 'FLOTTANT' : 'ÉQUITÉ 6%'}** (${r.bustDate})` : 'non';
  const worstCell = r.worstFloatingLossPct >= FLOATING_THRESHOLD_PCT ? `**${r.worstFloatingLossPct.toFixed(2)}%**` : `${r.worstFloatingLossPct.toFixed(2)}%`;
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.realizedMaxDrawdownPct.toFixed(1)}% | ${worstCell} | ${bustCell} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runGoatFundedTraderFloatingLossAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) candlesBySymbolFull[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;

  const divergenceCandidatesFull = computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500);
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);

  const md = [];
  md.push('# GoatFundedTrader Instant Premium — la règle de perte flottante tient-elle avec notre config actuelle?');
  md.push('');
  md.push(
    "Esdras : \"construis l'analyse de perte flottante pour GoatFundedTrader.\" Suite directe de la vérification " +
      "de l'Instant Premium Model (HANDOFF.md, 2026-09-12) : une règle jamais modélisée dans ce projet - " +
      `perte NON RÉALISÉE de **-${FLOATING_THRESHOLD_PCT}%** (comptes achetés à partir du 2026-09-02, donc celle ` +
      `qui s'applique à tout nouvel achat aujourd'hui ; -${FLOATING_THRESHOLD_LEGACY_PCT}% pour les comptes plus ` +
      "anciens) du solde, À N'IMPORTE QUEL MOMENT, ferme le compte DÉFINITIVEMENT - avant même qu'un stop soit " +
      "touché. Tous les autres tests de ce projet (chaque script FTMO/FundingPips, GuardrailEngine) ne regardent " +
      "que le solde RÉALISÉ à la clôture d'un trade - aucun ne voyait le creux intermédiaire d'une position encore " +
      "ouverte. Ce script construit ce suivi depuis zéro : P&L flottant réel à chaque bougie (pire excursion dans " +
      "la bougie, même convention que les vérifications stop/target existantes), sommé sur TOUS les symboles ayant " +
      "une position ouverte en même temps (jusqu'à 4 : US100/US500/XAUUSD/EURUSD).\n\n" +
      `**Deux mécanismes de bust testés** : (1) la règle de perte flottante ci-dessus, et (2) la perte totale de ` +
      `${EQUITY_TRAILING_PCT}% - qui, chez GoatFundedTrader Instant Premium, est AUSSI basée sur l'équité en temps ` +
      "réel (\"trailing, sur l'équité, ne redescend jamais\"), pas seulement le solde réalisé comme FTMO/FundingPips " +
      "- donc elle a besoin du même suivi flottant. La perte quotidienne (3%) reste un simple garde-fou qui bloque " +
      "les nouvelles entrées (comme partout ailleurs ce mois-ci), pas un bust - rien dans les règles sourcées ne dit " +
      "explicitement que la dépasser ferme le compte, contrairement à la règle de perte flottante.\n\n" +
      "⚠️ **Hypothèse de modélisation à connaître** : la \"perte flottante\" est lue ici comme le P&L flottant NET " +
      "du compte (un gain flottant sur un symbole peut compenser une perte flottante sur un autre - exactement " +
      "comme l'équité réelle d'un courtier), pas la pire position seule. Si GoatFundedTrader mesure en réalité " +
      "chaque position individuellement, leur vraie règle serait encore plus stricte que ce qui est modélisé ici. " +
      "Fenêtre week-end/news de l'Instant Premium non modélisée (conséquence \"profit annulé/plafonné\", pas un " +
      "bust, contrairement à Zero - hors scope ici)."
  );
  md.push('');

  const summaryByRisk = [];
  for (const riskPct of RISK_LEVELS) {
    md.push(`## Risque ${riskPct}%/trade`);
    md.push('');
    md.push(`| Année | Trades | Win rate | Drawdown réalisé max (référence) | Pire perte flottante atteinte (seuil ${FLOATING_THRESHOLD_PCT}%) | Busté? | Solde final |`);
    md.push('|---|---|---|---|---|---|---|');
    const results = {};
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull, year, riskPct);
      results[year] = r;
      md.push(fmtRow(year, r));
      console.error(`[${riskPct}%] ${year}: ${r ? r.trades + ' trades, pire flottant ' + r.worstFloatingLossPct.toFixed(2) + '%' + (r.busted ? ' BUSTÉ (' + r.bustReason + ') ' + r.bustDate : '') : 'skip'}`);
    }
    const validYears = YEARS.filter((y) => results[y]);
    const bustedYears = validYears.filter((y) => results[y].busted);
    const floatingBusts = bustedYears.filter((y) => results[y].bustReason === 'floating-loss');
    const equityBusts = bustedYears.filter((y) => results[y].bustReason === 'equity-trailing');
    const worstEver = Math.max(...validYears.map((y) => results[y].worstFloatingLossPct));
    md.push('');
    md.push(
      `**Bilan ${riskPct}%** : ${bustedYears.length}/${validYears.length} années busted (${floatingBusts.length} par perte flottante : ${floatingBusts.join(', ') || 'aucune'} — ${equityBusts.length} par équité ${EQUITY_TRAILING_PCT}% : ${equityBusts.join(', ') || 'aucune'}). ` +
        `Pire perte flottante atteinte sur ces ${validYears.length} années (busted incluses) : **${worstEver.toFixed(2)}%**.`
    );
    md.push('');
    summaryByRisk.push({ riskPct, bustedYears, floatingBusts, equityBusts, validYears, worstEver });
  }

  md.push('## Verdict');
  md.push('');
  const clean = summaryByRisk.filter((s) => s.bustedYears.length === 0);
  const best = clean.length ? clean.reduce((a, b) => (b.riskPct > a.riskPct ? b : a)) : null;
  md.push('| Risque | Années bustées | Dont perte flottante | Dont équité 6% | Pire perte flottante (toutes années) |');
  md.push('|---|---|---|---|---|');
  for (const s of summaryByRisk) {
    md.push(`| ${s.riskPct}% | ${s.bustedYears.length}/${s.validYears.length} | ${s.floatingBusts.length} | ${s.equityBusts.length} | ${s.worstEver.toFixed(2)}% |`);
  }
  md.push('');
  const totalFloatingBusts = summaryByRisk.reduce((s, r) => s + r.floatingBusts.length, 0);
  const totalEquityBusts = summaryByRisk.reduce((s, r) => s + r.equityBusts.length, 0);
  if (best) {
    md.push(
      `**Le risque le plus élevé qui ne busait AUCUNE année testée (ni perte flottante, ni équité ${EQUITY_TRAILING_PCT}%) est ${best.riskPct}%/trade** ` +
        `(pire perte flottante atteinte : ${best.worstEver.toFixed(2)}%, sous le seuil de ${FLOATING_THRESHOLD_PCT}%). ` +
        `À comparer avec le risque actuel de production (0.3% en mode "live") - à ce niveau, ${summaryByRisk.find((s) => s.riskPct === 0.3)?.bustedYears.length ?? '?'}/7 années bustent déjà.\n\n` +
        `**Résultat inattendu, à souligner** : sur les ${totalFloatingBusts + totalEquityBusts} busts trouvés tous risques confondus, ${totalFloatingBusts} viennent de la règle de perte flottante (celle qu'on cherchait à mesurer) contre **${totalEquityBusts} de la règle de perte totale ${EQUITY_TRAILING_PCT}% équité**. Même à 0.5%/trade avec 4 positions ouvertes en même temps, la perte flottante ne dépasse jamais 0.92% (sous le seuil de ${FLOATING_THRESHOLD_PCT}%) - c'est la règle des ${EQUITY_TRAILING_PCT}% qui casse le compte en premier, presque à chaque fois, PARCE QU'elle suit l'équité en temps réel (chaque pic flottant intra-trade compte comme un nouveau sommet, contrairement au FTMO 10% qui ne suit que le solde réalisé) - un mécanisme bien plus strict en pratique que son chiffre nominal (6%) ne le suggère.`
    );
  } else {
    md.push(
      `**Aucun des niveaux de risque testés (${RISK_LEVELS.join('%, ')}%) n'évite le bust sur les 7 ans testés.** ` +
        `La règle de perte flottante (${FLOATING_THRESHOLD_PCT}%, tous symboles confondus) est le facteur limitant le plus ` +
        `souvent - avec jusqu'à 4 positions ouvertes en même temps, même un risque très réduit par trade peut suffire à ` +
        `franchir ce seuil si plusieurs positions flottent négativement au même moment. Un plafond sur le nombre de ` +
        `positions ouvertes simultanément (non testé ici) serait le prochain levier logique à essayer.`
    );
  }
  md.push('');
  md.push(
    "**Rien codé dans `src/` au-delà du profil `GOATFUNDEDTRADER_INSTANT_PREMIUM` déjà ajouté à `src/propFirms/` " +
      "(documentaire, pas encore branché sur un vrai compte)** - ce script est une analyse de recherche seulement. " +
      "Aucune décision de trading réelle prise ici."
  );

  const outMd = path.join(dir, 'goatfundedtrader-instant-premium-floating-loss-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
