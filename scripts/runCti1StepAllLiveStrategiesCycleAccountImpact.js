#!/usr/bin/env node
// runCti1StepAllLiveStrategiesCycleAccountImpact.js
// Usage: node scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js <dir-with-csvs>
//
// Direct fork of runFtmoAllLiveStrategiesCycleAccountImpact.js (same
// continuous-reset architecture, see that file's own header for the full
// rationale) - built 2026-09-12 at Esdras's request after pricing out City
// Traders Imperium's 1-Step Challenge as a cheaper alternative to FTMO
// ("il est probable qu'on le prenne plutôt que FTMO à cause de l'argent" -
// CTI $25k challenge is $159 vs FTMO's ~$200-265+, and CTI already runs on
// Match-Trader, which this bot already has code for, unlike FTMO's
// cTrader). The one thing that was NOT yet validated: CTI's max drawdown
// is a TIGHTER 5% (vs FTMO's 10%) - literally half the margin for error at
// the same risk-per-trade, and every risk level calibrated so far (0.5%
// challenge / 0.3% live) was tuned against the 10% floor, never tested
// against 5%. This script exists purely to answer that question before
// treating CTI as a real candidate.
//
// Two rule changes from the FTMO version, sourced live from
// citytradersimperium.com/1-step-challenge-trailing-drawdown/ (fetched
// 2026-09-12): profit target 8% (not 10%), max drawdown 5% trailing on the
// highest BALANCE reached (not FTMO's 10% end-of-day trailing - CTI's is
// balance-based and updates the instant a trade closes, which is actually
// what this script's cyclePeak/ddPct mechanic already models, so no code
// change needed there, just the two constants below). CTI has NO daily
// loss limit (FTMO has 3%) - not modeled as a separate cap here either
// way, since the bot's own GuardrailEngine daily-loss protection (from
// CONFIG.guardrails, a bot safety feature, not a firm rule) already applies
// regardless of which firm is being tested, same as the FTMO script.
//
// Same 5 scenarios (0.5/0.4/0.3% risk, plus 2 concurrency-cap variants at
// 0.5%) so the CTI numbers are directly comparable to the FTMO report's
// table, row for row. Same combined strategy scope, same source, same
// priority order (FVG, Divergence, NWOG, Judas Swing). All non-risk params
// (RR, windows, guardrails) read straight from CONFIG, same as the FTMO
// script - no code in src/ touched, research only.

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

const STARTING_BALANCE = 10000;
const TRAILING_MAX_LOSS_PCT = 5; // CTI: 5% trailing on highest balance reached (vs FTMO's 10%)
const CHALLENGE_TARGET_MULTIPLE = 1.08; // CTI: 8% profit target (vs FTMO's 10%)
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FVG_SYMBOLS = Object.keys(CONFIG.fvg.perSymbol);
const DIV_PAIR = CONFIG.divergence.pair;
const NWOG_SYMBOLS = CONFIG.nwog.symbols;
const JUDAS_SYMBOLS = CONFIG.judasSwing.symbols;
const ALL_SYMBOLS = [...new Set([...FVG_SYMBOLS, ...DIV_PAIR, ...NWOG_SYMBOLS, ...JUDAS_SYMBOLS])];

const FVG_CONFIG = {};
for (const symbol of FVG_SYMBOLS) {
  FVG_CONFIG[symbol] = { ...CONFIG.fvg.perSymbol[symbol], spread: DEFAULT_SPREADS[symbol] };
}

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

// Same 5 base scenarios as the FTMO report (direct row-for-row comparison),
// plus a 6th (0.2%) since CTI's 5% floor is half of FTMO's 10% - worth
// checking whether the current production risk (0.5%) needs to drop
// further than what was ever necessary against the 10% floor.
const SCENARIOS = [
  { key: 'Actuel (0.5%, aucun plafond)', riskPct: 0.5, maxConcurrentPositions: Infinity },
  { key: '0.4% par trade, aucun plafond', riskPct: 0.4, maxConcurrentPositions: Infinity },
  { key: '0.3% par trade, aucun plafond', riskPct: 0.3, maxConcurrentPositions: Infinity },
  { key: '0.2% par trade, aucun plafond', riskPct: 0.2, maxConcurrentPositions: Infinity },
  { key: '0.5% par trade, max 2 positions simultanées', riskPct: 0.5, maxConcurrentPositions: 2 },
  { key: '0.5% par trade, max 1 position simultanée (sérialisé)', riskPct: 0.5, maxConcurrentPositions: 1 },
];

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
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function buildFvgEngines(candlesBySymbolFull) {
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    const candles = candlesBySymbolFull[symbol];
    if (!candles || candles.length === 0) continue;
    if (FVG_CONFIG[symbol].multiTouch) {
      const predicate = buildMultiTouchFilterPredicate(candles, symbol, FVG_CONFIG[symbol]);
      engines[symbol] = new MultiTouchFvgEngine({ symbol, checkFilters: predicate });
    } else {
      const { engine } = buildFilteredEngine(candles, symbol, FVG_CONFIG[symbol]);
      engines[symbol] = engine;
    }
  }
  return engines;
}

/**
 * ONE continuous pass over the full multi-year candle range (2019-2025),
 * with a fresh $10k "cycle" starting immediately every time the current one
 * either passes (+10%) or busts (-10% trailing). Returns the full sequence
 * of cycles plus aggregate stats.
 */
function simulateContinuous({ candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull, riskPct, maxConcurrentPositions }) {
  const engines = buildFvgEngines(candlesBySymbolFull);

  const timeline = [];
  for (const symbol of ALL_SYMBOLS) for (const candle of candlesBySymbolFull[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  const openPositions = {}; for (const s of ALL_SYMBOLS) openPositions[s] = null;
  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let balance = STARTING_BALANCE;
  let cycleStartTime = timeline[0].candle.time;
  let cyclePeak = STARTING_BALANCE;
  let openCount = 0;
  let cycleTrades = 0, cycleWins = 0, cycleResolved = 0;

  const cycles = [];

  const resetCycle = (endTime, outcome, ddPct) => {
    cycles.push({
      startTime: cycleStartTime,
      endTime,
      outcome,
      days: daysBetween(cycleStartTime, endTime),
      trades: cycleTrades,
      winRate: cycleResolved > 0 ? cycleWins / cycleResolved : null,
      maxDrawdownPct: ddPct,
    });
    balance = STARTING_BALANCE;
    cyclePeak = STARTING_BALANCE;
    cycleStartTime = endTime;
    cycleTrades = 0; cycleWins = 0; cycleResolved = 0;
    // A fresh account (live or a new challenge) starts flat - any position
    // still open on another symbol under the old account is discarded, not
    // carried over and not counted (deliberate simplification).
    for (const s of ALL_SYMBOLS) openPositions[s] = null;
    openCount = 0;
  };

  const resolveClose = (symbol, netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    cyclePeak = Math.max(cyclePeak, balance);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    cycleTrades++;
    openCount = Math.max(0, openCount - 1);
    if (outcome !== 'timeout') { cycleResolved++; if (outcome === 'win') cycleWins++; }

    const ddPct = cyclePeak > 0 ? ((cyclePeak - balance) / cyclePeak) * 100 : 0;
    const passed = balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE;
    const busted = ddPct >= TRAILING_MAX_LOSS_PCT;
    if (passed || busted) resetCycle(exitTime, passed ? 'pass' : 'bust', ddPct);
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    // 1) Resolve any open position on this symbol.
    const open = openPositions[symbol];
    if (open && candle.time > open.entryTime) {
      const bullish = open.direction === 'bullish';
      const hitStop = bullish ? candle.low <= open.stopPrice : candle.high >= open.stopPrice;
      const hitTarget = bullish ? candle.high >= open.targetPrice : candle.low <= open.targetPrice;
      const timedOut = i - open.entryIndex >= open.maxHoldingCandles;
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
        openPositions[symbol] = null;
        resolveClose(symbol, legR - costR, candle.time, open.riskAmount, outcome);
      }
    }

    const canOpenMore = openCount < maxConcurrentPositions;

    // 2) FVG. The engine always sees every candle regardless of whether a
    // signal can currently be acted on (matching production) - only the
    // ACTUAL OPEN is gated by the cap/guardrail/netting checks.
    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') {
          formationIndexBySymbol[symbol].set(e.id, i);
        } else if (e.type === 'validated' && !openPositions[symbol] && openCount < maxConcurrentPositions) {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: candlesBySymbolFull[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          if (!guardrail.canTakeNewTrade(candle.time)) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          openPositions[symbol] = {
            source: 'fvg', direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (riskPct / 100), maxHoldingCandles: 480,
          };
          openCount++;
        }
      }
    }

    // 3) Divergence.
    if (canOpenMore && DIV_PAIR.includes(symbol) && !openPositions[symbol]) {
      const cand = divCandidatesByTime(symbol, divergenceCandidatesFull, candle.time);
      if (cand) {
        const distance = cand.stopDistance;
        if ((!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const entryPrice = candle.open;
          openPositions[symbol] = {
            source: 'divergence', direction: 'bullish', entryIndex: i, entryTime: candle.time, entryPrice,
            stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance,
            rrMultiple: DIV_RR_MULTIPLE, riskAmount: balance * (riskPct / 100), maxHoldingCandles: DIV_MAX_HOLDING_CANDLES,
          };
          openCount++;
        }
      }
    }

    // 4) NWOG.
    if (canOpenMore && NWOG_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = nwogCandidatesFull.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + NWOG_RR * distance : entryPrice - NWOG_RR * distance;
          openPositions[symbol] = {
            source: 'nwog', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: NWOG_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: NWOG_MAX_HOLDING,
          };
          openCount++;
        }
      }
    }

    // 5) Judas Swing.
    if (canOpenMore && JUDAS_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
      const cand = judasCandidatesFull.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const targetPrice = bullish ? entryPrice + JUDAS_RR * distance : entryPrice - JUDAS_RR * distance;
          openPositions[symbol] = {
            source: 'judas', direction: cand.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice,
            distance, rrMultiple: JUDAS_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: JUDAS_MAX_HOLDING,
          };
          openCount++;
        }
      }
    }
  }

  return { cycles, lastCandleTime: timeline[timeline.length - 1].candle.time };
}

// Divergence candidates were precomputed as a flat array (entryTime, symbol,
// stopDistance) - small helper for O(1)-ish lookup without re-filtering per
// scenario call (built once outside, reused).
function makeDivIndex(divergenceCandidatesFull) {
  const bySymbol = new Map();
  for (const symbol of DIV_PAIR) bySymbol.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) bySymbol.get(cand.symbol).set(cand.entryTime, cand);
  return bySymbol;
}
function divCandidatesByTime(symbol, index, time) {
  return index.get(symbol)?.get(time);
}

function summarizeScenario(cycles) {
  const passes = cycles.filter((c) => c.outcome === 'pass');
  const busts = cycles.filter((c) => c.outcome === 'bust');
  const avgDays = passes.length ? Math.round(passes.reduce((s, c) => s + c.days, 0) / passes.length) : null;
  const avgTrades = cycles.length ? Math.round(cycles.reduce((s, c) => s + c.trades, 0) / cycles.length) : null;
  return {
    totalCycles: cycles.length,
    passes: passes.length,
    busts: busts.length,
    passRate: cycles.length ? (passes.length / cycles.length) * 100 : null,
    avgDaysToPass: avgDays,
    avgTradesPerCycle: avgTrades,
  };
}

function fmtCycleRow(n, c) {
  const outcomeCell = c.outcome === 'pass' ? '✅ pass' : '❌ **bust**';
  const wr = c.winRate !== null ? (c.winRate * 100).toFixed(1) + '%' : '—';
  return `| ${n} | ${fmtDate(c.startTime)} → ${fmtDate(c.endTime)} | ${c.days}j | ${c.trades} | ${wr} | ${c.maxDrawdownPct.toFixed(1)}% | ${outcomeCell} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runCti1StepAllLiveStrategiesCycleAccountImpact.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    candlesBySymbolFull[symbol] = candles;
  }

  const divergenceCandidatesFull = makeDivIndex(computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500));
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);

  const md = [];
  md.push('# Simulation continue avec reset au +8% ou au bust (-5% trailing) — CTI 1-Step, toutes stratégies live, compte 10k');
  md.push('');
  md.push(
    "Fork direct de ftmo-1step-all-live-strategies-cycle-account-impact.md (même architecture de reset continu, " +
      "voir ce rapport pour le détail du mécanisme). Esdras (2026-09-12), après avoir vu le prix CTI 1-Step " +
      "($159 pour un compte $25k, contre ~$200-265+ chez FTMO) : \"il est probable qu'on le prenne plutôt que " +
      "FTMO à cause de l'argent.\" La seule inconnue avant de traiter CTI comme un vrai candidat : son drawdown " +
      "max est deux fois plus serré que FTMO (**5% trailing sur le plus haut solde atteint**, contre 10% chez " +
      "FTMO) - tout le calibrage de risque fait jusqu'ici (0.5% challenge, 0.3% live) n'a jamais été testé contre " +
      "un plancher aussi serré.\n\n" +
      "**Règles CTI utilisées ici** (sourcées en direct sur citytradersimperium.com/1-step-challenge-trailing-" +
      "drawdown/, 2026-09-12) : target **+8%** (au lieu de +10%), drawdown max **5% trailing** basé sur le solde " +
      "(pas l'équité intra-journalière) - mécanisme déjà correctement modélisé par ce script (le plancher suit le " +
      "plus haut solde atteint APRÈS chaque trade fermé, identique à la logique FTMO déjà en place, seuls les " +
      "deux seuils changent). Aucune limite de perte journalière chez CTI (contre 3% chez FTMO) - non modélisée " +
      "séparément ici, la propre protection journalière du bot (GuardrailEngine, une sécurité du bot, pas une " +
      "règle de la prop firm) reste active comme pour le test FTMO.\n\n" +
      "**6 scénarios** : les 5 mêmes que le rapport FTMO (comparaison directe ligne à ligne) plus un 6e à 0.2%, " +
      "vu que le plancher CTI est deux fois plus serré.\n\n" +
      "Note sur les dates : simulation continue sur TOUT l'historique CSV disponible par symbole (XAUUSD/EURUSD " +
      "dès début 2018, US100/US500 dès début 2019), identique au rapport FTMO."
  );
  md.push('');
  md.push('## Comparaison des 6 scénarios (historique complet en continu)');
  md.push('');
  md.push('| Scénario | Cycles totaux | Passes | Busts | Taux de bust | Jours moy. pour passer | Trades moy. / cycle |');
  md.push('|---|---|---|---|---|---|---|');

  const scenarioResults = [];
  for (const scenario of SCENARIOS) {
    const { cycles } = simulateContinuous({
      candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, judasCandidatesFull,
      riskPct: scenario.riskPct, maxConcurrentPositions: scenario.maxConcurrentPositions,
    });
    const s = summarizeScenario(cycles);
    scenarioResults.push({ scenario, cycles, s });
    md.push(
      `| ${scenario.key} | ${s.totalCycles} | ${s.passes} | ${s.busts} | ${s.passRate !== null ? (100 - s.passRate).toFixed(0) + '%' : '—'} | ` +
        `${s.avgDaysToPass ?? '—'} | ${s.avgTradesPerCycle ?? '—'} |`
    );
    console.error(`[${scenario.key}] ${s.totalCycles} cycles, ${s.passes} pass / ${s.busts} bust, ${s.avgDaysToPass}j moy.`);
  }
  md.push('');

  md.push('## Détail cycle par cycle, scénario actuel (0.5%, aucun plafond)');
  md.push('');
  md.push('| # | Période | Durée | Trades | Win rate | Drawdown trailing max | Résultat |');
  md.push('|---|---|---|---|---|---|---|');
  const baseline = scenarioResults[0];
  baseline.cycles.forEach((c, idx) => md.push(fmtCycleRow(idx + 1, c)));
  md.push('');

  const baselineS = baseline.s;
  const best = scenarioResults.reduce((a, b) => (b.s.passRate > a.s.passRate ? b : a));
  md.push('## Verdict');
  md.push('');
  md.push(
    `Contre le plancher CTI (5% trailing, deux fois plus serré que FTMO), le scénario actuel (0.5% par trade, ` +
      `aucun plafond) produit ${baselineS.totalCycles} cycles sur l'historique complet : ${baselineS.passes} passes ` +
      `(challenge/live gagné) contre ${baselineS.busts} busts, soit un taux de bust de ` +
      `${(100 - baselineS.passRate).toFixed(0)}% - à comparer directement au taux de bust FTMO à 0.5% (9% sur 46 ` +
      `cycles, plancher 10%) pour mesurer l'effet réel du drawdown plus serré.\n\n` +
      `Le scénario qui réduit le plus le taux de bust est **"${best.scenario.key}"** ` +
      `(${(100 - best.s.passRate).toFixed(0)}% de bust contre ${(100 - baselineS.passRate).toFixed(0)}% pour l'actuel), ` +
      `${best.s.avgDaysToPass && baselineS.avgDaysToPass ? (best.s.avgDaysToPass > baselineS.avgDaysToPass ? `au prix d'un passage un peu plus lent (${best.s.avgDaysToPass}j contre ${baselineS.avgDaysToPass}j en moyenne).` : `sans ralentir le passage (${best.s.avgDaysToPass}j contre ${baselineS.avgDaysToPass}j).`) : ''} ` +
      `Comparer les 6 lignes du tableau ci-dessus donne l'arbitrage complet vitesse/risque de chaque levier - à ` +
      `Esdras de choisir le compromis. Aucun changement fait dans \`src/\` — recherche seulement.`
  );

  const outMd = path.join(dir, 'cti-1step-all-live-strategies-cycle-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
