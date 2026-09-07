#!/usr/bin/env node
// runFtmo1StepVolAdaptiveRiskAccountImpact.js
// Usage: node scripts/runFtmo1StepVolAdaptiveRiskAccountImpact.js <dir-with-csvs>
//
// ATR-based (volatility) position sizing, tested on the REAL recommended
// combo (FVG US100+US500+XAUUSD + Divergence US100/US500, netting, FTMO
// 1-Step TRAILING drawdown), per the user's explicit request to explore
// volatility-based sizing instead of the drawdown-based throttle already
// tested (see HANDOFF.md "Position sizing dynamique").
//
// PREMISE CHECK DONE FIRST (checkVolatilityRegimeImpactFullCombo.js): tag
// every real-combo trade with its OWN INSTRUMENT's volatility regime at
// entry (daily ATR(14) vs its own SMA(100), same lookback already used
// elsewhere in this project) - low/normal/high, thresholds 0.8x/1.5x fixed
// before looking at any split. Result, consistent in TRAIN and TEST:
//   - 'normal' vol carries the bulk of trades (585/994) AND by far the best
//     expectancy (train 0.48R, test 0.44R).
//   - 'high' vol is weaker but still solidly positive both periods (train
//     0.24R, test 0.13R).
//   - 'low' vol (quiet market) is the weak link: train barely positive
//     (0.09R), TEST NEGATIVE (-0.04R) - the edge does not travel into quiet
//     markets.
// IMPORTANT: this is the OPPOSITE of classic inverse-volatility position
// sizing (which shrinks size when vol is HIGH, to equalize risk - CTA/
// managed-futures convention). Here the data says the opposite mechanism is
// what would actually help: the WEAK spot is low volatility, not high. So
// the scheme tested below reduces risk specifically in the 'low' regime,
// not the 'high' one. This is flagged HONESTLY as a discipline departure
// from "decide the mechanism before any result": the choice of WHICH
// regime to size down was informed by this session's own split (unlike the
// win/loss ladder and drawdown-throttle parameters, which were fixed
// before any run). The regime THRESHOLDS themselves (0.8x/1.5x) were still
// fixed before viewing the split.

import fs from 'node:fs';
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
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const ATR_PERIOD = 14;
const ATR_REF_SMA_PERIOD = 100;
const VOL_LOW_THRESHOLD = 0.8;
const VOL_HIGH_THRESHOLD = 1.5;

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

function computeSma(values, period) {
  const sma = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    sma[i] = sum / period;
  }
  return sma;
}

function classifyVolatilitySeries(daily) {
  const atr = computeAtrSeries(daily, ATR_PERIOD);
  const atrValues = atr.map((v) => v ?? 0);
  const atrSma = computeSma(atrValues, ATR_REF_SMA_PERIOD);
  const regime = new Array(daily.length).fill(null);
  for (let i = 0; i < daily.length; i++) {
    if (atr[i] === null || atrSma[i] === null || atrSma[i] === 0) continue;
    const ratio = atr[i] / atrSma[i];
    regime[i] = ratio < VOL_LOW_THRESHOLD ? 'low' : ratio > VOL_HIGH_THRESHOLD ? 'high' : 'normal';
  }
  return regime;
}

function makeRegimeLookup(daily, regime) {
  return (entryTime) => {
    let lo = 0, hi = daily.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (daily[mid].time + DAY_MS <= entryTime) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? regime[ans] : null;
  };
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

function simulateYear(m15CandlesBySymbolFull, dailyBySymbolFull, volRegimeLookupBySymbol, divergenceCandidatesFull, year, { riskPct, volRiskConfig }) {
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
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  const timeline = [];
  for (const symbol of FVG_SYMBOLS) {
    for (const candle of m15BySymbol[symbol]) timeline.push({ symbol, candle });
  }
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

  function getRiskPct(symbol, entryTime) {
    if (!volRiskConfig) return riskPct;
    const regime = volRegimeLookupBySymbol[symbol](entryTime);
    if (regime === 'low') return volRiskConfig.low;
    if (regime === 'high') return volRiskConfig.high;
    if (regime === 'normal') return volRiskConfig.normal;
    return volRiskConfig.normal; // warmup / unknown regime: fall back to the normal rate
  }

  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0, wins = 0, resolvedCount = 0, fvgTrades = 0, goldTrades = 0, divTrades = 0;
  const risksUsed = [];

  const resolveClose = (symbol, netR, exitTime, riskAmount, isDivergence, outcome, riskPctUsed) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    risksUsed.push(riskPctUsed);
    if (isDivergence) divTrades++;
    else if (symbol === 'XAUUSD') goldTrades++;
    else fvgTrades++;
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
          legR = signedMove / openF.distance;
          outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / openF.distance : 0;
        resolveClose(symbol, legR - costR, candle.time, openF.riskAmount, false, outcome, openF.riskPctUsed);
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
        resolveClose(symbol, legR - costR, candle.time, openDivergence.riskAmount, true, outcome, openDivergence.riskPctUsed);
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
        const riskPctUsed = getRiskPct(symbol, candle.time);
        openFvg[symbol] = { direction: e.direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (riskPctUsed / 100), riskPctUsed };
      }
    }

    const divMap = divCandidatesByTime.get(symbol);
    const cand = divMap ? divMap.get(candle.time) : undefined;
    if (cand && !openDivergence && !openFvg[symbol]) {
      const divSpread = DEFAULT_SPREADS[symbol] ?? 0;
      const distance = cand.stopDistance;
      if ((!divSpread || distance >= divSpread * MIN_DISTANCE_SPREAD_MULTIPLE) && guardrail.canTakeNewTrade(candle.time)) {
        const entryPrice = candle.open;
        const riskPctUsed = getRiskPct(symbol, candle.time);
        openDivergence = { symbol, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice: entryPrice - distance, targetPrice: entryPrice + DIV_RR_MULTIPLE * distance, distance, riskAmount: balance * (riskPctUsed / 100), riskPctUsed };
      }
    }
  }

  const firstTime = timeline[0].candle.time;
  const riskRange = risksUsed.length > 0
    ? `${Math.min(...risksUsed).toFixed(2)}%-${Math.max(...risksUsed).toFixed(2)}% (moy ${(risksUsed.reduce((a, b) => a + b, 0) / risksUsed.length).toFixed(2)}%)`
    : '—';

  return {
    trades: totalTrades, fvgTrades, goldTrades, divTrades,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted, bustDate,
    challengeLabel: challengePoint ? `jour ${daysBetween(firstTime, challengePoint.time)}` : 'jamais',
    finalBalance: balance,
    riskRange,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades}+${r.goldTrades}+${r.divTrades}) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} | ${r.riskRange} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFtmo1StepVolAdaptiveRiskAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15CandlesBySymbolFull = {};
  const dailyBySymbolFull = {};
  const volRegimeLookupBySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
    const daily = resampleCandles(candles, DAY_MS);
    dailyBySymbolFull[symbol] = daily;
    const regime = classifyVolatilitySeries(daily);
    volRegimeLookupBySymbol[symbol] = makeRegimeLookup(daily, regime);
  }
  const divergenceCandidatesFull = computeDivergenceCandidates(m15CandlesBySymbolFull.US100, m15CandlesBySymbolFull.US500);

  const md = [];
  md.push('# Position sizing par volatilité (ATR) — testé sur le VRAI combo, règles FTMO 1-Step');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, combo recommandé réel (FVG US100+US500+XAUUSD + Divergence US100/US500, ` +
      "netting), règles FTMO 1-Step (cible +10% unique, perte max TRAILING 10%). **Vérification préalable** " +
      "(checkVolatilityRegimeImpactFullCombo.js) : régime de volatilité = ATR(14) quotidien de l'instrument vs sa " +
      "propre SMA(100), seuils 0.8x/1.5x fixés avant tout résultat. Constat robuste train ET test : le régime " +
      "'normal' porte l'essentiel de l'edge (train 0.48R, test 0.44R, 585/994 trades), 'high' reste solide (train " +
      "0.24R, test 0.13R), mais 'low' (marché calme) est le maillon faible (train à peine positif 0.09R, TEST " +
      "NÉGATIF -0.04R). **C'est l'INVERSE du sizing par volatilité classique** (qui réduit la taille quand la " +
      "vol est HAUTE, pas basse) - ici c'est la vol BASSE qui pose problème. Schéma testé : risque réduit à 0.25% " +
      "spécifiquement en régime 'low', 0.5% ailleurs (normal et high). ⚠️ Écart de discipline assumé : contrairement " +
      "aux seuils de régime (fixés avant résultat), le choix de cibler 'low' plutôt que 'high' pour la réduction " +
      "a été informé par ce constat lui-même - à ne pas confondre avec un résultat totalement anti-data-snooping."
  );
  md.push('');

  const scenarios = [
    { label: 'Risque fixe — 0.5%/trade (RÉFÉRENCE PRODUCTION ACTUELLE)', riskPct: 0.5, volRiskConfig: null },
    { label: "Sizing par volatilité — 0.25% en régime 'low', 0.5% en 'normal'/'high'", riskPct: 0.5, volRiskConfig: { low: 0.25, normal: 0.5, high: 0.5 } },
  ];

  for (const scenario of scenarios) {
    md.push(`## ${scenario.label}`);
    md.push('| Année | Trades (idx+or+div) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge (+10%) | Solde final | Risque utilisé (min-max, moy) |');
    md.push('|---|---|---|---|---|---|---|---|---|');
    for (const year of YEARS) {
      const r = simulateYear(m15CandlesBySymbolFull, dailyBySymbolFull, volRegimeLookupBySymbol, divergenceCandidatesFull, year, scenario);
      md.push(fmtRow(year, r));
      console.error(`[${scenario.label}] ${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) + ', DD trailing ' + r.trailingDrawdownPct.toFixed(1) + '%, ' + r.challengeLabel : 'skip'}`);
    }
    md.push('');
  }

  const outMd = path.join(dir, 'ftmo-1step-vol-adaptive-risk-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
