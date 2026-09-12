#!/usr/bin/env node
// runFundingPipsZeroComplianceAnalysis.js
// Usage: node scripts/runFundingPipsZeroComplianceAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12): "si on code la partie funding pips pour CE challenge,
// fais quelque analyse préliminaire pour voir comment ça se comporterait."
// Direct follow-up to the "verdict final" already in HANDOFF.md (2026-09-11):
// the live bot is NOT compliant with FundingPips Zero as-is (no news filter,
// no forced weekend close). This script asks the next question: if we
// actually BUILT the weekend fix, what would the account have done? Unlike
// the older runFundingPipsZeroAccountImpact.js (single-touch FVG, old 10-11h/
// 7-10h windows, no NWOG/Judas Swing), this one reads the CURRENT production
// combo straight from CONFIG - multi-touch US100 (8h-12h), US500 (10h-11h),
// XAUUSD (8h-12h), Divergence, NWOG, Judas Swing - same architecture as
// runFtmoAllLiveStrategiesAccountImpact.js, adapted to Zero's rules instead
// of FTMO 1-Step's.
//
// TWO things this script actually changes vs. today's bot, simulated for
// real (not just measured):
//   1. Weekend force-close: any position still open at the LAST candle before
//      a weekend gap (Friday close) is closed right there at that candle's
//      close price, instead of running to its natural stop/target/timeout.
//      This is a real behavioral change to the strategy, not a report - see
//      how it moves win rate/expectancy in the verdict below.
//   2. Tested at 3 risk levels (0.5%/0.3%/0.25%) against Zero's OWN numbers
//      (5% trailing-locks-at-start drawdown, 1% max open risk across all
//      symbols at once) - not FTMO's 10% trailing.
//
// ONE thing this script does NOT fix, only MEASURES as a lower bound:
//   - The news-trading rule (cannot open/hold within 10min of a high-impact
//     release - a HARD BREACH on Zero, see HANDOFF.md). No historical
//     economic calendar exists in this repo, and fabricating one from memory
//     (exact FOMC/CPI dates) would be worse than not modeling it - so this
//     script only counts overlaps with NFP (first Friday of the month,
//     08:00-09:00 NY, a fixed public pattern that needs no external data),
//     which is FAR from every high-impact release (CPI, FOMC, PPI, etc. are
//     NOT counted). Treat the reported number as a floor, not the real
//     exposure - the actual news-breach risk is meaningfully higher.

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
import { toRealNyHourMinute, FIXED_EST_TO_UTC_OFFSET_MS } from '../src/backtest/nySession.js';
import { CONFIG } from '../src/config.js';
import { getPropFirmProgram } from '../src/propFirms/index.js';

const STARTING_BALANCE = 10000;
const RISK_LEVELS = [0.5, 0.3, 0.25];
const ZERO = getPropFirmProgram('fundingpips-zero').phases[0]; // dailyLossLimitPct=3, maxDrawdownPct=5, maxDrawdownType='trailing-locks-at-start-balance'
const MAX_OPEN_RISK_PCT = getPropFirmProgram('fundingpips-zero').maxOpenRiskPct; // 1
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// The last candle before a >=6h gap that crosses a Saturday or Sunday -
// i.e. the real "Friday close" this data has for that symbol. Force-closing
// HERE (not on Monday's re-open) is what actually complies with Zero's
// "no position held over the weekend" rule.
function computePreWeekendCloseIndices(candles) {
  const set = new Set();
  for (let i = 0; i + 1 < candles.length; i++) {
    const gap = candles[i + 1].time - candles[i].time;
    if (gap < 6 * 60 * 60 * 1000) continue;
    for (let t = candles[i].time - (candles[i].time % DAY_MS); t < candles[i + 1].time; t += DAY_MS) {
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) { set.add(i); break; }
    }
  }
  return set;
}

// Approximate NFP window ONLY (see file header - this is a floor, not the
// real news-rule exposure). First Friday of the month, 08:00-09:00 NY -
// covers the 08:30 release plus the immediate volatility spike after it.
function isNfpWindow(candleTimeMs) {
  const trueUtcMs = candleTimeMs + FIXED_EST_TO_UTC_OFFSET_MS;
  const nyDate = new Date(trueUtcMs);
  // Reconstruct the NY calendar date (not just hour) via the same Intl
  // approach nySession.js uses, so DST doesn't shift which day this lands on.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', day: '2-digit' }).formatToParts(nyDate);
  const weekday = parts.find((p) => p.type === 'weekday').value;
  const day = Number(parts.find((p) => p.type === 'day').value);
  if (weekday !== 'Fri' || day > 7) return false; // first Friday of the month only
  const { hour } = toRealNyHourMinute(candleTimeMs);
  return hour === 8;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function pct(n) { return (n * 100).toFixed(1) + '%'; }

function simulateYear(candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull, preWeekendIndicesBySymbol, year, riskPct) {
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

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails, dailyLossLimitPct: ZERO.dailyLossLimitPct });
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
  let peak = STARTING_BALANCE;
  let maxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let maxOpenRiskPct = 0;
  let openRiskBreaches = 0;

  const openPositions = {}; for (const s of ALL_SYMBOLS) openPositions[s] = null;
  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0, wins = 0, resolvedCount = 0, forcedWeekendCloses = 0, nfpOverlaps = 0;
  const bySource = { fvg: 0, divergence: 0, nwog: 0, judas: 0 };

  const currentOpenRiskPct = () => {
    let sum = 0;
    for (const s of ALL_SYMBOLS) if (openPositions[s]) sum += openPositions[s].riskAmount;
    return balance > 0 ? (sum / balance) * 100 : 0;
  };

  const resolveClose = (symbol, source, netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    const floor = Math.min(peak * (1 - ZERO.maxDrawdownPct / 100), STARTING_BALANCE); // 'trailing-locks-at-start-balance'
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    bySource[source]++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }
    if (balance < floor && !busted) { busted = true; bustDate = fmtDate(exitTime); }
  };

  for (const { symbol, candle } of timeline) {
    if (busted) break;
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;
    if (isNfpWindow(candle.time)) nfpOverlaps += openPositions[symbol] ? 1 : 0;

    const open = openPositions[symbol];
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= open.maxHoldingCandles;
      // NEW vs the FTMO script this was forked from: force-close BEFORE the
      // weekend, ahead of stop/target/timeout - this is the actual fix being
      // tested, not just a measurement.
      const forcedWeekend = preWeekendIndicesBySymbol[symbol]?.has(i) ?? false;
      if (hitStop || hitTarget || timedOut || forcedWeekend) {
        let legR, outcome;
        if (forcedWeekend && !hitStop && !hitTarget) {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
          legR = signedMove / open.distance; outcome = 'forced-weekend-close'; forcedWeekendCloses++;
        } else if (hitStop) { legR = -1; outcome = 'loss'; }
        else if (hitTarget) { legR = open.rrMultiple; outcome = 'win'; }
        else {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - open.entryPrice : open.entryPrice - exitPrice;
          legR = signedMove / open.distance; outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / open.distance : 0;
        resolveClose(symbol, open.source, legR - costR, candle.time, open.riskAmount, outcome);
        openPositions[symbol] = null;
      }
    }

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
          if (isNfpWindow(candle.time)) continue; // don't open INTO a known NFP window either
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          openPositions[symbol] = { source: 'fvg', direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (riskPct / 100), maxHoldingCandles: 480 };
        }
      }
    }

    if (DIV_PAIR.includes(symbol) && !openPositions[symbol]) {
      const cand = divCandidatesByTime.get(symbol)?.get(candle.time);
      if (cand && !isNfpWindow(candle.time)) {
        const distance = cand.stopDistance;
        if ((!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const entryPrice = candle.open;
          openPositions[symbol] = { source: 'divergence', direction: 'bullish', entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance, rrMultiple: DIV_RR_MULTIPLE, riskAmount: balance * (riskPct / 100), maxHoldingCandles: DIV_MAX_HOLDING_CANDLES };
        }
      }
    }

    if (NWOG_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = nwogCandidatesByTime.get(candle.time);
      if (cand && !isNfpWindow(candle.time)) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + NWOG_RR * distance : entryPrice - NWOG_RR * distance;
          openPositions[symbol] = { source: 'nwog', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: NWOG_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: NWOG_MAX_HOLDING };
        }
      }
    }

    if (JUDAS_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = judasCandidatesByTime.get(candle.time);
      if (cand && !isNfpWindow(candle.time)) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + JUDAS_RR * distance : entryPrice - JUDAS_RR * distance;
          openPositions[symbol] = { source: 'judas', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: JUDAS_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: JUDAS_MAX_HOLDING };
        }
      }
    }

    const openRiskNow = currentOpenRiskPct();
    maxOpenRiskPct = Math.max(maxOpenRiskPct, openRiskNow);
    if (openRiskNow > MAX_OPEN_RISK_PCT) openRiskBreaches++;
  }

  return {
    trades: totalTrades, bySource,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    trailingDrawdownPct: maxDrawdownPct,
    busted, bustDate,
    finalBalance: balance,
    maxOpenRiskPct, openRiskBreaches,
    forcedWeekendCloses,
    nfpOverlaps,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? pct(r.winRate) : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  const riskCell = r.maxOpenRiskPct > MAX_OPEN_RISK_PCT ? `**${r.maxOpenRiskPct.toFixed(2)}%** (${r.openRiskBreaches}x)` : `${r.maxOpenRiskPct.toFixed(2)}%`;
  const detail = `${r.bySource.fvg} FVG + ${r.bySource.divergence} div. + ${r.bySource.nwog} NWOG + ${r.bySource.judas} Judas`;
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${detail}) | ${wr} | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${riskCell} | ${r.forcedWeekendCloses} | ${r.nfpOverlaps} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFundingPipsZeroComplianceAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) candlesBySymbolFull[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;

  const divergenceCandidatesFull = computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500);
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);
  const preWeekendIndicesBySymbol = {};
  for (const symbol of ALL_SYMBOLS) preWeekendIndicesBySymbol[symbol] = computePreWeekendCloseIndices(candlesBySymbolFull[symbol]);

  const md = [];
  md.push('# FundingPips Zero — analyse préliminaire AVEC la fermeture forcée avant le week-end codée');
  md.push('');
  md.push(
    "Suite du verdict \"non conforme tel quel\" (voir HANDOFF.md, 2026-09-11) — Esdras : \"si on code la partie " +
      "funding pips pour CE challenge, fais quelque analyse préliminaire pour voir comment ça se comporterait.\" " +
      "Contrairement à `runFundingPipsZeroAccountImpact.js` (config datée : contact unique, fenêtres 10h-11h/7h-10h, " +
      "sans NWOG/Judas Swing), cette version lit la config de PRODUCTION ACTUELLE directement depuis `src/config.js` " +
      "(US100 multi-contact 8h-12h, US500 10h-11h, XAUUSD 8h-12h, Divergence, NWOG, Judas Swing) et CODE réellement " +
      "la fermeture forcée avant le week-end (au lieu de juste la détecter) - un vrai changement de comportement, " +
      "pas un rapport. Testé à 3 niveaux de risque contre les vraies règles Zero (5% trailing verrouillé au solde de " +
      "départ, 1% de risque ouvert max tous symboles confondus).\n\n" +
      "⚠️ **Le filtre news N'EST PAS codé ici** (voir l'en-tête du script) - seul un chevauchement avec le NFP " +
      "(premier vendredi du mois, 8h-9h NY, seul motif public fixe sans besoin de calendrier externe) est compté, " +
      "à titre de PLANCHER seulement. CPI, FOMC, PPI et le reste ne sont PAS comptés - l'exposition réelle à la " +
      "règle news est plus élevée que le chiffre affiché ici."
  );
  md.push('');

  for (const riskPct of RISK_LEVELS) {
    md.push(`## Risque ${riskPct}%/trade`);
    md.push('');
    md.push('| Année | Trades (détail par source) | Win rate | Drawdown trailing max | Busté (-5%, verrouillé au solde départ)? | Risque ouvert max (limite 1%) | Fermetures forcées (week-end) | Chevauchements NFP (plancher) | Solde final |');
    md.push('|---|---|---|---|---|---|---|---|---|');
    const results = {};
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull, preWeekendIndicesBySymbol, year, riskPct);
      results[year] = r;
      md.push(fmtRow(year, r));
      console.error(`[${riskPct}%] ${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) + (r.busted ? ' BUSTÉ ' + r.bustDate : '') : 'skip'}`);
    }
    const validYears = YEARS.filter((y) => results[y]);
    const bustedYears = validYears.filter((y) => results[y].busted);
    const totalForcedCloses = validYears.reduce((s, y) => s + results[y].forcedWeekendCloses, 0);
    const totalNfpOverlaps = validYears.reduce((s, y) => s + results[y].nfpOverlaps, 0);
    md.push('');
    md.push(`**Bilan ${riskPct}%** : ${bustedYears.length}/${validYears.length} années busted (${bustedYears.join(', ') || 'aucune'}), ${totalForcedCloses} fermetures forcées avant week-end sur ${YEARS.length} ans, ${totalNfpOverlaps} chevauchements NFP détectés (plancher, pas le total réel).`);
    md.push('');
  }

  md.push('## Ce que ça veut dire');
  md.push('');
  md.push(
    "Coder la fermeture forcée avant le week-end est FAISABLE et mesurable (voir les tableaux ci-dessus) - reste à " +
      "décider si l'edge après coupure prématurée reste acceptable, et à quel risque par trade le bust rate devient " +
      "confortable sous le plancher de 5% de Zero (plus serré que le 10% de FTMO). Le filtre news, en revanche, " +
      "n'est PAS testé ici au-delà du NFP seul - une vraie mise en conformité demanderait un calendrier économique " +
      "réel (source externe, pas encore choisie) pour couvrir CPI/FOMC/PPI/etc., sans quoi le chiffre de risque de " +
      "rupture de règle news resterait sous-estimé. Rien codé dans `src/` - script de recherche seulement."
  );

  const outMd = path.join(dir, 'fundingpips-zero-compliance-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
