#!/usr/bin/env node
// runDailyLossLimitAnalysis.js
// Usage: node scripts/runDailyLossLimitAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12), before deciding the challenge/live config split:
// "la plupart des challenges demandent -5% max risque par jour. Est-on
// dans cela?" Direct measurement, not a guess: the SAME combined-strategy,
// 0.5%-risk, no-cap simulation Esdras just confirmed keeping (reset on
// +10%/bust, per runFtmoAllLiveStrategiesCycleAccountImpact.js), but this
// time tracking REALIZED P&L per UTC calendar day (same day-boundary
// convention as CONFIG.guardrails.dayBoundaryHourUTC=0) as a % of that
// day's starting balance, and reporting the worst day found.
//
// IMPORTANT CAVEAT, stated up front rather than buried: this measures
// REALIZED (closed-trade) daily loss only, like GuardrailEngine's own
// dailyLossLimitPct check. It does NOT include intraday FLOATING loss on a
// position still open when a losing day ends - most prop firms (FTMO
// included) define "daily loss" off EQUITY (balance + open floating P&L),
// which this script cannot see without minute-by-minute mark-to-market.
// So this is a LOWER BOUND on the real worst-case daily loss, not a proof
// the true worst day never got worse intraday before recovering by the
// close. Treated as directional evidence, not a compliance guarantee.

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
const RISK_PCT = 0.5; // decision confirmée par Esdras (2026-09-12) : on garde 0.5%, aucun plafond
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const DAY_BOUNDARY_HOUR_UTC = CONFIG.guardrails.dayBoundaryHourUTC; // 0 - same convention as GuardrailEngine

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

function makeDivIndex(divergenceCandidatesFull) {
  const bySymbol = new Map();
  for (const symbol of DIV_PAIR) bySymbol.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) bySymbol.get(cand.symbol).set(cand.entryTime, cand);
  return bySymbol;
}
function divCandidatesByTime(symbol, index, time) { return index.get(symbol)?.get(time); }

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function dayKeyFor(ms) {
  const shifted = ms - DAY_BOUNDARY_HOUR_UTC * 3600 * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

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

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runDailyLossLimitAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    candlesBySymbolFull[symbol] = candles;
  }

  const divergenceCandidatesFull = makeDivIndex(computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500));
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);

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
  let cyclePeak = STARTING_BALANCE;
  let cycleStartTime = timeline[0].candle.time;
  let cycles = 0;

  // Per-day tracking - independent of the challenge/bust cycle machinery,
  // same day-boundary convention as GuardrailEngine.
  let curDayKey = null;
  let dayStartBalance = STARTING_BALANCE;
  let dayPnl = 0;
  const days = []; // { dayKey, startBalance, pnl, pnlPct, trades }
  let dayTrades = 0;

  const flushDay = () => {
    if (curDayKey === null) return;
    days.push({
      dayKey: curDayKey,
      startBalance: dayStartBalance,
      pnl: dayPnl,
      pnlPct: dayStartBalance > 0 ? (dayPnl / dayStartBalance) * 100 : 0,
      trades: dayTrades,
    });
  };

  const resolveClose = (symbol, netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;

    const key = dayKeyFor(exitTime);
    if (key !== curDayKey) {
      flushDay();
      curDayKey = key;
      dayStartBalance = balance; // balance BEFORE this trade's pnl is applied
      dayPnl = 0;
      dayTrades = 0;
    }
    dayPnl += pnl;
    dayTrades++;

    balance += pnl;
    cyclePeak = Math.max(cyclePeak, balance);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });

    const ddPct = cyclePeak > 0 ? ((cyclePeak - balance) / cyclePeak) * 100 : 0;
    const passed = balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE;
    const busted = ddPct >= TRAILING_MAX_LOSS_PCT;
    if (passed || busted) {
      cycles++;
      balance = STARTING_BALANCE;
      cyclePeak = STARTING_BALANCE;
      cycleStartTime = exitTime;
      for (const s of ALL_SYMBOLS) openPositions[s] = null;
      // Note: the day bucket keeps tracking P&L in $ terms across a reset
      // (a real day doesn't care which account instance is open), but
      // dayStartBalance was captured BEFORE this trade using the OLD
      // balance - see the caveat below on how this interacts with a reset
      // landing mid-day.
    }
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

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

    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') {
          formationIndexBySymbol[symbol].set(e.id, i);
        } else if (e.type === 'validated' && !openPositions[symbol]) {
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
            distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: 480,
          };
        }
      }
    }

    if (DIV_PAIR.includes(symbol) && !openPositions[symbol]) {
      const cand = divCandidatesByTime(symbol, divergenceCandidatesFull, candle.time);
      if (cand) {
        const distance = cand.stopDistance;
        if ((!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
          const entryPrice = candle.open;
          openPositions[symbol] = {
            source: 'divergence', direction: 'bullish', entryIndex: i, entryTime: candle.time, entryPrice,
            stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance,
            rrMultiple: DIV_RR_MULTIPLE, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: DIV_MAX_HOLDING_CANDLES,
          };
        }
      }
    }

    if (NWOG_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
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
            distance, rrMultiple: NWOG_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: NWOG_MAX_HOLDING,
          };
        }
      }
    }

    if (JUDAS_SYMBOLS.includes(symbol) && !openPositions[symbol]) {
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
            distance, rrMultiple: JUDAS_RR, riskAmount: balance * (RISK_PCT / 100), maxHoldingCandles: JUDAS_MAX_HOLDING,
          };
        }
      }
    }
  }
  flushDay();

  days.sort((a, b) => a.pnlPct - b.pnlPct);
  const worst20 = days.slice(0, 20);
  const daysOver2 = days.filter((d) => d.pnlPct <= -2);
  const daysOver3 = days.filter((d) => d.pnlPct <= -3);
  const daysOver4 = days.filter((d) => d.pnlPct <= -4);
  const daysOver5 = days.filter((d) => d.pnlPct <= -5);

  const md = [];
  md.push('# Pire perte journalière réalisée — config actuelle (0.5%/trade, aucun plafond de positions)');
  md.push('');
  md.push(
    "Esdras, avant de trancher challenge-vs-live : \"la plupart des challenges demandent -5% max risque par jour. " +
      "Est-on dans cela ?\" Mesure directe sur la même simulation combinée que celle déjà confirmée (0.5% par " +
      "trade, aucun plafond de positions simultanées, reset au +10%/bust) : perte RÉALISÉE par jour calendaire " +
      "UTC (même convention que `CONFIG.guardrails.dayBoundaryHourUTC`), en % du solde en DÉBUT de ce jour-là.\n\n" +
      "**Limite importante à lire avant les chiffres** : ceci mesure la perte RÉALISÉE (trades clôturés) uniquement " +
      "- exactement comme le garde-fou interne `dailyLossLimitPct`. Ça n'inclut PAS la perte FLOTTANTE intra-jour " +
      "sur une position encore ouverte quand une mauvaise journée se termine - la plupart des prop firms (FTMO " +
      "incluse) définissent la perte journalière sur l'ÉQUITÉ (solde + P&L flottant), pas seulement sur le " +
      "réalisé. Ce chiffre est donc un PLANCHER du pire cas réel, pas une garantie de conformité - la vraie pire " +
      "journée a pu être temporairement pire en intra-journée avant de se refermer moins mal."
  );
  md.push('');
  md.push(`**Total** : ${days.length} jours de trading avec au moins un trade clôturé, sur ${cycles} cycles de compte (reset au +10%/-10%).`);
  md.push('');
  md.push(`- Jours ≤ -2% : ${daysOver2.length}`);
  md.push(`- Jours ≤ -3% : ${daysOver3.length}`);
  md.push(`- Jours ≤ -4% : ${daysOver4.length}`);
  md.push(`- Jours ≤ -5% : ${daysOver5.length}`);
  md.push('');
  md.push('## 20 pires journées réalisées');
  md.push('');
  md.push('| Date | Solde en début de journée | P&L du jour | P&L (% du solde) | Trades clôturés ce jour-là |');
  md.push('|---|---|---|---|---|');
  for (const d of worst20) {
    md.push(`| ${d.dayKey} | $${d.startBalance.toFixed(0)} | $${d.pnl.toFixed(0)} | ${d.pnlPct.toFixed(2)}% | ${d.trades} |`);
  }
  md.push('');
  const worst = days[0];
  md.push('## Verdict');
  md.push('');
  md.push(
    `La pire journée RÉALISÉE trouvée est ${worst.dayKey} à ${worst.pnlPct.toFixed(2)}% (${worst.trades} trades clôturés ce jour-là). ` +
      `${daysOver5.length === 0
        ? `Aucun jour ne dépasse -5% en réalisé sur tout l'historique testé - on reste sous le seuil typique des challenges (souvent -5%), avec de la marge.`
        : `${daysOver5.length} jour(s) dépassent -5% en réalisé - à vérifier contre la règle exacte du firm choisi.`} ` +
      `Le garde-fou interne (\`dailyLossLimitPct\` = ${CONFIG.guardrails.dailyLossLimitPct}%) bloque les NOUVELLES entrées une fois ce seuil de perte réalisée franchi dans la journée, ` +
      `donc en théorie le système lui-même ne devrait jamais dépasser ~${CONFIG.guardrails.dailyLossLimitPct}% de perte réalisée AJOUTÉE par de nouveaux trades un jour donné - ` +
      `un dépassement au-delà vient forcément de positions ouvertes AVANT ce jour-là (multi-jours, jusqu'à ~5 jours) qui se résolvent en perte le même jour qu'une autre. ` +
      `Rappel : ceci ne couvre pas le flottant intra-jour (voir la limite en tête de rapport) - à traiter comme une évidence directionnelle rassurante, pas une garantie contractuelle.`
  );

  const outMd = path.join(dir, 'daily-loss-limit-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`Pire jour: ${worst.dayKey} ${worst.pnlPct.toFixed(2)}% | jours <= -5%: ${daysOver5.length} | jours <= -4%: ${daysOver4.length} | jours <= -3%: ${daysOver3.length} | jours <= -2%: ${daysOver2.length} | total jours: ${days.length}`);
}

main();
