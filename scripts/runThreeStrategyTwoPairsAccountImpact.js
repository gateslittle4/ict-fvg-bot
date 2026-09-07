#!/usr/bin/env node
// runThreeStrategyTwoPairsAccountImpact.js
// Usage: node scripts/runThreeStrategyTwoPairsAccountImpact.js <dir-with-csvs>
//
// Direct test of "do we need a 3rd instrument, or is stacking more
// independent STRATEGIES on the SAME 2 pairs (US100/US500) enough": one
// shared account, one shared GuardrailEngine, THREE genuinely different
// signal mechanisms, NO gold/XAUUSD anywhere in this file.
//   - FVG (validated ICT setup, existing engines).
//   - Divergence (US100/US500 pairs mean-reversion, lookback=100, z=2).
//   - Turtle System 2 (Donchian 55-day entry / 20-day exit, 2xATR stop) -
//     the ORIGINAL published parameters (see breakout-strategy-analysis.md),
//     the one of the two tested Turtle systems that held up on TEST for
//     both US100 and US500.
//
// THREE-WAY NETTING: at most ONE open position per instrument, across ALL
// THREE mechanisms (extends the FVG<->Divergence netting rule added
// earlier to also cover Turtle) - whichever source gets there first blocks
// the other two on that same instrument until it closes.
//
// Turtle runs on DAILY bars (resampled from M15, UTC day buckets),
// interleaved into the SAME merged, time-sorted event timeline as the M15
// FVG/Divergence events, so the shared GuardrailEngine sees every entry
// attempt from all three sources in true chronological order (this is
// what makes the shared max-trades-per-day budget honest, not just three
// backtests summed after the fact).
//
// Re-targeted at FTMO 1-Step rules (see ftmo-1step-account-impact.md),
// since that's the product actually being considered: single +10% target,
// bust = TRAILING off the highest balance ever reached (not static off the
// starting balance). Own guardrail daily-loss cap stays at the
// self-imposed 2% (stricter than FTMO's real 3% allowance).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
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
const FVG_SYMBOLS = ['US100', 'US500'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
};

// ---- Divergence candidate-entry precomputation (same logic/params as elsewhere) ----
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_M15_CANDLES = 480;

// ---- Turtle System 2 (published params, not tuned on our data - see breakout-strategy-analysis.md) ----
const TURTLE_ENTRY_DAYS = 55;
const TURTLE_EXIT_DAYS = 20;
const TURTLE_ATR_PERIOD = 20;
const TURTLE_STOP_ATR_MULTIPLE = 2;
const TURTLE_MAX_HOLDING_DAYS = 250;

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

function computeDonchianSeries(daily, n) {
  const highs = new Array(daily.length).fill(null);
  const lows = new Array(daily.length).fill(null);
  for (let i = n; i < daily.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n; j < i; j++) {
      hi = Math.max(hi, daily[j].high);
      lo = Math.min(lo, daily[j].low);
    }
    highs[i] = hi;
    lows[i] = lo;
  }
  return { highs, lows };
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
    m15BySymbol[symbol] = m15CandlesBySymbolFull[symbol].filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  if (FVG_SYMBOLS.every((s) => m15BySymbol[s].length < 50)) return null;

  const dailyBySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    dailyBySymbol[symbol] = dailyCandlesBySymbolFull[symbol].filter((c) => c.time >= yearStart && c.time < yearEnd);
  }

  const divCandidatesByTime = new Map();
  for (const symbol of FVG_SYMBOLS) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) {
    if (cand.entryTime >= yearStart && cand.entryTime < yearEnd) {
      divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);
    }
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  // Precompute Turtle ATR/Donchian series per symbol, per year (no state carried across year boundaries,
  // same convention as the FVG/Divergence side of this simulation).
  const turtleAtr = {};
  const turtleEntryCh = {};
  const turtleExitCh = {};
  const turtleStartIdx = {};
  for (const symbol of FVG_SYMBOLS) {
    const daily = dailyBySymbol[symbol];
    turtleAtr[symbol] = computeAtrSeries(daily, TURTLE_ATR_PERIOD);
    turtleEntryCh[symbol] = computeDonchianSeries(daily, TURTLE_ENTRY_DAYS);
    turtleExitCh[symbol] = computeDonchianSeries(daily, TURTLE_EXIT_DAYS);
    turtleStartIdx[symbol] = Math.max(TURTLE_ENTRY_DAYS, TURTLE_EXIT_DAYS, TURTLE_ATR_PERIOD) + 1;
  }

  // Merged, time-sorted event timeline: M15 candles (FVG + Divergence) and once-per-day Turtle
  // check-ins (timestamped at day's end so they sort after that day's own M15 events).
  const timeline = [];
  for (const symbol of FVG_SYMBOLS) {
    for (const candle of m15BySymbol[symbol]) timeline.push({ kind: 'm15', symbol, candle, time: candle.time });
  }
  for (const symbol of FVG_SYMBOLS) {
    const daily = dailyBySymbol[symbol];
    for (let i = turtleStartIdx[symbol]; i < daily.length; i++) {
      timeline.push({ kind: 'turtle', symbol, day: daily[i], dayIndex: i, time: daily[i].time + DAY_MS - 1 });
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
  const openTurtle = {}; for (const s of FVG_SYMBOLS) openTurtle[s] = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1; // M15 candle index, for FVG/Divergence timeouts
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0;
  let wins = 0;
  let resolvedCount = 0;
  let fvgTrades = 0;
  let divTrades = 0;
  let turtleTrades = 0;

  const anyOpenOnSymbol = (symbol) => !!openFvg[symbol] || (openDivergence && openDivergence.symbol === symbol) || !!openTurtle[symbol];

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
    else if (source === 'turtle') turtleTrades++;
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
      // Turtle daily check-in: resolve an open Turtle position, then look for a new breakout entry.
      const day = ev.day;
      const i = ev.dayIndex;
      const spread = DEFAULT_SPREADS[symbol] ?? 0;

      const openT = openTurtle[symbol];
      if (openT && i > openT.entryDayIndex) {
        const bullish = openT.direction === 'bullish';
        const hitStop = bullish ? day.low <= openT.stopPrice : day.high >= openT.stopPrice;
        const exitLevel = bullish ? turtleExitCh[symbol].lows[i] : turtleExitCh[symbol].highs[i];
        const hitChannelExit = exitLevel !== null && (bullish ? day.low <= exitLevel : day.high >= exitLevel);
        const timedOut = i - openT.entryDayIndex >= TURTLE_MAX_HOLDING_DAYS;
        if (hitStop || hitChannelExit || timedOut) {
          let exitPrice;
          if (hitStop) exitPrice = openT.stopPrice;
          else if (hitChannelExit) exitPrice = bullish ? Math.min(day.open, exitLevel) : Math.max(day.open, exitLevel);
          else exitPrice = day.close;
          const signedMove = bullish ? exitPrice - openT.entryPrice : openT.entryPrice - exitPrice;
          const grossR = signedMove / openT.distance;
          const costR = spread > 0 ? spread / openT.distance : 0;
          const netR = grossR - costR;
          const outcome = netR > 0 ? 'win' : 'loss';
          resolveClose(symbol, netR, day.time, openT.riskAmount, 'turtle', outcome);
          openTurtle[symbol] = null;
        }
      }

      if (!openTurtle[symbol] && !anyOpenOnSymbol(symbol)) {
        const entryHigh = turtleEntryCh[symbol].highs[i];
        const entryLow = turtleEntryCh[symbol].lows[i];
        const atrYesterday = turtleAtr[symbol][i - 1];
        if (entryHigh !== null && day.high >= entryHigh && atrYesterday > 0 && guardrail.canTakeNewTrade(day.time)) {
          const entryPrice = Math.max(day.open, entryHigh);
          const distance = TURTLE_STOP_ATR_MULTIPLE * atrYesterday;
          if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
            openTurtle[symbol] = { direction: 'bullish', entryDayIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice - distance, distance, riskAmount: balance * (RISK_PCT / 100) };
          }
        } else if (entryLow !== null && day.low <= entryLow && atrYesterday > 0 && guardrail.canTakeNewTrade(day.time)) {
          const entryPrice = Math.min(day.open, entryLow);
          const distance = TURTLE_STOP_ATR_MULTIPLE * atrYesterday;
          if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
            openTurtle[symbol] = { direction: 'bearish', entryDayIndex: i, entryTime: day.time, entryPrice, stopPrice: entryPrice + distance, distance, riskAmount: balance * (RISK_PCT / 100) };
          }
        }
      }
    }
  }

  const firstTime = timeline[0].time;
  return {
    trades: totalTrades,
    fvgTrades,
    divTrades,
    turtleTrades,
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
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades} FVG + ${r.divTrades} div. + ${r.turtleTrades} turtle) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runThreeStrategyTwoPairsAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15CandlesBySymbolFull = {};
  const dailyCandlesBySymbolFull = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
    dailyCandlesBySymbolFull[symbol] = resampleCandles(candles, DAY_MS);
  }
  const divergenceCandidatesFull = computeDivergenceCandidates(m15CandlesBySymbolFull.US100, m15CandlesBySymbolFull.US500);
  console.error(`Divergence candidates precomputed: ${divergenceCandidatesFull.length}`);

  const md = [];
  md.push('# Impact au niveau du COMPTE — 3 STRATÉGIES (FVG + Divergence + Turtle System 2), seulement US100/US500, règles FTMO 1-Step');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, AUCUN 3e instrument (pas d'or ici) - test direct de : empiler des stratégies ` +
      "sur les mêmes 2 paires suffit-il, sans avoir besoin d'un nouvel instrument ? Un seul budget de garde-fous " +
      "PARTAGÉ entre les 3 mécanismes (FVG, Divergence, Turtle System 2), garde-fous INCHANGÉS (max 2 trades/jour, " +
      "cooldown 30min après perte, perte quotidienne max 2% - plus strict que le 3% réel de FTMO 1-Step). NETTING " +
      "À TROIS : au plus une position ouverte par instrument, tous mécanismes confondus. Turtle System 2 = 55j " +
      "entrée / 20j sortie, stop 2xATR(20), paramètres ORIGINAUX publiés (pas ajustés sur nos données - voir " +
      "breakout-strategy-analysis.md). **Cible = +10% une seule fois (FTMO 1-Step). Perte totale max = TRAILING " +
      "sur le plus haut solde jamais atteint (10%).**"
  );
  md.push('');
  md.push('| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(m15CandlesBySymbolFull, dailyCandlesBySymbolFull, divergenceCandidatesFull, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades (' + r.fvgTrades + ' FVG + ' + r.divTrades + ' div + ' + r.turtleTrades + ' turtle), solde $' + r.finalBalance.toFixed(0) + ', challenge: ' + r.challengeLabel : 'skip'}`);
  }

  const outMd = path.join(dir, 'three-strategy-two-pairs-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
