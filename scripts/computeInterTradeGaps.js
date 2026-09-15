#!/usr/bin/env node
// computeInterTradeGaps.js
// Usage: node scripts/computeInterTradeGaps.js <dir-with-csvs>
//
// Esdras a demandé le plus long écart RÉEL entre deux trades consécutifs,
// pas seulement la moyenne annuelle déjà documentée (HANDOFF.md). Réutilise
// EXACTEMENT la même simulation combo (FVG US100+US500+XAUUSD + Divergence
// US100/US500, même config, même guardrail, même timeline triée
// chronologiquement) que checkOutcomeSerialCorrelationFullCombo.js — pas une
// réimplémentation séparée — et calcule l'écart en jours entre chaque
// OUVERTURE de trade consécutive (entryTime), pas entre les clôtures : "un
// jour sans trade" veut dire "aucun trade ouvert ce jour-là", pas "aucune
// clôture".

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
  for (let i = 0; i < n; i++) {
    if (z[i] === null) continue;
    if (Math.abs(z[i]) < DIV_Z_THRESHOLD) continue;
    const symbol = z[i] > 0 ? 'US100' : 'US500';
    const entryCandle = symbol === 'US100' ? alignedA[i] : alignedB[i];
    const atr = symbol === 'US100' ? atrA[i] : atrB[i];
    if (atr && atr > 0) candidates.push({ entryTime: entryCandle.time, symbol, stopDistance: 1.5 * atr });
  }
  return candidates;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/computeInterTradeGaps.js <dir-with-csvs>');
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

  const entryTimes = []; // every trade OPEN, chronological (FVG + Divergence, all symbols)

  const resolveClose = (netR, exitTime, riskAmount) => {
    balance += riskAmount * netR;
    guardrail.recordTrade({ pnl: riskAmount * netR, time: exitTime, balanceAfter: balance });
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
        let legR;
        if (hitStop) legR = -1;
        else if (hitTarget) legR = openF.rrMultiple;
        else {
          const exitPrice = candle.close;
          const signedMove = bullish ? exitPrice - openF.entryPrice : openF.entryPrice - exitPrice;
          legR = signedMove / openF.distance;
        }
        const costR = spread > 0 ? spread / openF.distance : 0;
        resolveClose(legR - costR, candle.time, STARTING_BALANCE * (RISK_PCT / 100));
        openFvg[symbol] = null;
      }
    }

    if (openDivergence && openDivergence.symbol === symbol && candle.time > openDivergence.entryTime) {
      const hitStop = candle.low <= openDivergence.stopPrice;
      const hitTarget = candle.high >= openDivergence.targetPrice;
      const timedOut = i - openDivergence.entryIndex >= DIV_MAX_HOLDING_M15_CANDLES;
      if (hitStop || hitTarget || timedOut) {
        let legR;
        if (hitStop) legR = -1;
        else if (hitTarget) legR = DIV_RR_MULTIPLE;
        else legR = (candle.close - openDivergence.entryPrice) / openDivergence.distance;
        const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
        const costR = divSpread > 0 ? divSpread / openDivergence.distance : 0;
        resolveClose(legR - costR, candle.time, STARTING_BALANCE * (RISK_PCT / 100));
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
        entryTimes.push(candle.time);
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
        entryTimes.push(candle.time);
      }
    }
  }

  // XAUUSD.csv commence en 2018, US100/US500 seulement en 2019 (vérifié via
  // csvLoader directement) - toute l'année 2018 n'a donc QUE XAUUSD réellement
  // tradable dans ce combo, pas un vrai "combo à 3 symboles" comme le reste de
  // la période. Les longs écarts de 2018 seraient un artefact de données
  // manquantes, pas un vrai silence du combo complet - exclu de l'analyse
  // "en régime établi" ci-dessous pour ne pas fausser la réponse.
  const STEADY_STATE_CUTOFF = new Date('2019-01-01T00:00:00Z').getTime();

  entryTimes.sort((a, b) => a - b);
  console.log(`Total trades ouverts (combo complet, ${entryTimes.length > 0 ? new Date(entryTimes[0]).toISOString().slice(0, 10) : '—'} -> ${entryTimes.length > 0 ? new Date(entryTimes[entryTimes.length - 1]).toISOString().slice(0, 10) : '—'}): ${entryTimes.length}`);

  const gaps = [];
  for (let i = 1; i < entryTimes.length; i++) {
    gaps.push({ days: (entryTimes[i] - entryTimes[i - 1]) / 86400000, from: entryTimes[i - 1], to: entryTimes[i] });
  }
  gaps.sort((a, b) => b.days - a.days);

  console.log('\nLes 10 plus longs écarts SANS AUCUN trade ouvert (combo entier, tous instruments confondus) :');
  for (const g of gaps.slice(0, 10)) {
    console.log(`  ${g.days.toFixed(1)} jours : du ${new Date(g.from).toISOString().slice(0, 10)} au ${new Date(g.to).toISOString().slice(0, 10)}`);
  }

  const gapsOver2Days = gaps.filter((g) => g.days >= 2);
  const gapDaysArr = gaps.map((g) => g.days);
  const avg = gapDaysArr.reduce((s, d) => s + d, 0) / gapDaysArr.length;
  const median = gapDaysArr.slice().sort((a, b) => a - b)[Math.floor(gapDaysArr.length / 2)];
  console.log(`\nÉcart moyen entre deux trades (période complète, XAUUSD-only 2018 inclus): ${avg.toFixed(2)} jours, médian: ${median.toFixed(2)} jours.`);
  console.log(`Nombre d'écarts >= 2 jours: ${gapsOver2Days.length} / ${gaps.length} (${(100 * gapsOver2Days.length / gaps.length).toFixed(1)}%).`);

  console.log('\n=== Même calcul, "régime établi" seulement (2019+, les 3 symboles FVG réellement disponibles) ===');
  const steadyEntryTimes = entryTimes.filter((t) => t >= STEADY_STATE_CUTOFF);
  const steadyGaps = [];
  for (let i = 1; i < steadyEntryTimes.length; i++) {
    steadyGaps.push({ days: (steadyEntryTimes[i] - steadyEntryTimes[i - 1]) / 86400000, from: steadyEntryTimes[i - 1], to: steadyEntryTimes[i] });
  }
  steadyGaps.sort((a, b) => b.days - a.days);
  console.log('Les 10 plus longs écarts (2019+):');
  for (const g of steadyGaps.slice(0, 10)) {
    console.log(`  ${g.days.toFixed(1)} jours : du ${new Date(g.from).toISOString().slice(0, 10)} au ${new Date(g.to).toISOString().slice(0, 10)}`);
  }
  const steadyGapDaysArr = steadyGaps.map((g) => g.days);
  const steadyAvg = steadyGapDaysArr.reduce((s, d) => s + d, 0) / steadyGapDaysArr.length;
  const steadyMedian = steadyGapDaysArr.slice().sort((a, b) => a - b)[Math.floor(steadyGapDaysArr.length / 2)];
  const steadyOver2 = steadyGaps.filter((g) => g.days >= 2);
  console.log(`Écart moyen: ${steadyAvg.toFixed(2)} jours, médian: ${steadyMedian.toFixed(2)} jours.`);
  console.log(`Nombre d'écarts >= 2 jours: ${steadyOver2.length} / ${steadyGaps.length} (${(100 * steadyOver2.length / steadyGaps.length).toFixed(1)}%).`);
}

main();
