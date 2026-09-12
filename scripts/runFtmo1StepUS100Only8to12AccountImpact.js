#!/usr/bin/env node
// runFtmo1StepUS100Only8to12AccountImpact.js
// Usage: node scripts/runFtmo1StepUS100Only8to12AccountImpact.js <dir-with-csvs>
//
// Direct follow-up to runFtmo1StepUS100OnlyAccountImpact.js (10h-11h NY), at
// Esdras's explicit question (2026-09-12): "et si on utilise 8h-12h ? dis
// moi si c'est pas un meilleur compromis, car beaucoup de trades que j'ai
// pris étaient dans cet intervalle." The pure-R comparison
// (fvg-multi-touch-window-weekday-analysis.md) already showed 8h-12h takes
// ~2.2x more trades at a lower per-trade expectancy (1.10R vs 1.40R test)
// and a somewhat higher drawdown in R - this script answers the question in
// the terms that actually matter for a prop-firm challenge: does the extra
// volume pass the challenge FASTER, and does it still never bust, in a real
// day-by-day $ simulation with the actual FTMO trailing-drawdown rule?
//
// IDENTICAL to runFtmo1StepUS100OnlyAccountImpact.js in every other respect
// (MultiTouchFvgEngine, RR=5 read from CONFIG.fvg.perSymbol.US100, US100
// only, no Divergence/XAUUSD/US500) - the ONLY change is FVG_CONFIG.US100's
// sessionWindow, overridden to {8,12} instead of the production {10,11}.

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
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const FVG_SYMBOLS = ['US100'];

// Read directly from production config - no local re-typed copy to drift out of sync -
// EXCEPT sessionWindow, deliberately overridden to 8h-12h for this comparison
// (everything else - variant, structure/sweep, stopMode, rrMultiple - stays
// production-verbatim).
const FVG_CONFIG = {};
for (const symbol of FVG_SYMBOLS) {
  FVG_CONFIG[symbol] = {
    ...CONFIG.fvg.perSymbol[symbol],
    spread: DEFAULT_SPREADS[symbol],
    sessionWindow: { startHour: 8, endHour: 12 },
  };
}

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

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

  const m15BySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    m15BySymbol[symbol] = (m15CandlesBySymbolFull[symbol] || []).filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  if (FVG_SYMBOLS.every((s) => m15BySymbol[s].length < 50)) return null;

  const divCandidatesByTime = new Map();
  for (const symbol of ['US100', 'US500']) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) {
    if (cand.entryTime >= yearStart && cand.entryTime < yearEnd) divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    if (m15BySymbol[symbol].length === 0) continue;
    if (symbol === 'US100') {
      // THE experimental change: multi-touch instead of the production
      // single-touch engine, same criteria/config otherwise.
      const predicate = buildMultiTouchFilterPredicate(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
      engines[symbol] = new MultiTouchFvgEngine({ symbol, checkFilters: predicate });
    } else {
      const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
      engines[symbol] = engine;
    }
  }

  const timeline = [];
  for (const symbol of FVG_SYMBOLS) for (const candle of m15BySymbol[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));
  if (timeline.length === 0) return null;

  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  let balance = STARTING_BALANCE;
  let peak = STARTING_BALANCE;
  let staticMin = STARTING_BALANCE;
  let maxDrawdownPct = 0;
  let busted = false;
  let bustDate = null;
  let challengePoint = null;

  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0, wins = 0, resolvedCount = 0, fvgTrades = 0, goldTrades = 0, divTrades = 0;

  const resolveClose = (symbol, netR, exitTime, riskAmount, isDivergence, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    if (isDivergence) divTrades++; else if (symbol === 'XAUUSD') goldTrades++; else fvgTrades++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }
    if (ddPct >= TRAILING_MAX_LOSS_PCT && !busted) { busted = true; bustDate = fmtDate(exitTime); }
    if (!challengePoint && balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE) challengePoint = { time: exitTime, balance };
  };

  for (const { symbol, candle } of timeline) {
    if (busted) break;
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
          legR = signedMove / openF.distance; outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / openF.distance : 0;
        resolveClose(symbol, legR - costR, candle.time, openF.riskAmount, false, outcome);
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
        resolveClose(symbol, legR - costR, candle.time, openDivergence.riskAmount, true, outcome);
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
        openFvg[symbol] = { direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (RISK_PCT / 100) };
      }
    }

    const divMap = divCandidatesByTime.get(symbol);
    const cand = divMap ? divMap.get(candle.time) : undefined;
    if (cand && !openDivergence && !openFvg[symbol]) {
      const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
      const distance = cand.stopDistance;
      if ((!divSpread || distance >= divSpread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
        const entryPrice = candle.open;
        openDivergence = { symbol, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance, riskAmount: balance * (RISK_PCT / 100) };
      }
    }
  }

  const firstTime = timeline[0].candle.time;
  return {
    trades: totalTrades, fvgTrades, goldTrades, divTrades,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted, bustDate,
    challengeDays: challengePoint ? daysBetween(firstTime, challengePoint.time) : null,
    challengeLabel: challengePoint ? `jour ${daysBetween(firstTime, challengePoint.time)}` : 'jamais',
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades} FVG-idx + ${r.goldTrades} FVG-or + ${r.divTrades} div.) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmo1StepUS100Only8to12AccountImpact.js <dir-with-csvs>'); process.exit(1); }

  const m15CandlesBySymbolFull = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
  }
  // Esdras's explicit follow-up: "et si je prenais seulement le FVG
  // multi-contact, et on laisse XAUUSD et divergence?" - US100 alone, no
  // other source at all. No Divergence candidates computed (it needs
  // US500 data this run never loads, and is excluded on purpose anyway).
  const divergenceCandidatesFull = [];

  const md = [];
  md.push('# FTMO 1-Step, US100 multi-contact seul, fenêtre 8h-12h — comparé à 10h-11h');
  md.push('');
  md.push(
    `Question directe d'Esdras (2026-09-12) : "et si on utilise 8h-12h ? dis-moi si c'est pas un meilleur ` +
      `compromis que 10h-11h, car beaucoup de trades que j'ai pris étaient dans cet intervalle." Identique à ` +
      `\`ftmo-1step-us100-only-account-impact.md\` (US100 multi-contact seul, \`MultiTouchFvgEngine\`, RR=5, ` +
      `aucune autre source) - seule la fenêtre de session change : 8h-12h au lieu de 10h-11h, tout le reste ` +
      `production-verbatim.`
  );
  md.push('');
  md.push('| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) + ', ' + r.challengeLabel + (r.busted ? ' BUSTÉ ' + r.bustDate : '') : 'skip'}`);
  }

  const outMd = path.join(dir, 'ftmo-1step-us100-only-8to12-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
