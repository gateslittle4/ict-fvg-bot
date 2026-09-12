#!/usr/bin/env node
// runFtmo25kFirstPayoutByDateAnalysis.js
// Usage: node scripts/runFtmo25kFirstPayoutByDateAnalysis.js <dir-with-csvs>
//
// Esdras (2026-09-12), after ruling out GoatFundedTrader's instant programs
// as too constraining: "je veux toucher mon premier 500$ de forex ou
// futures le 1 December." A real date-specific financial goal deserves a
// real empirical answer, not a hand-waved estimate - this script simulates
// the FULL pipeline (buy FTMO 1-Step $25k -> pass the challenge, rebuying
// immediately on any bust, no time limit per FTMO's own rules -> go live at
// $25k funded -> accumulate real net profit -> first payout eligible 14
// calendar days after the first live trade, per FTMO's own payout policy
// (sourced live, 2026-09-12: https://tradersunion.com/brokers/prop/view/
// ftmo/payout-and-withdrawal-rules/, https://bestpropfirmguide.com/faqs/
// ftmo/payouts/ - "first payout begins 14 calendar days after the first
// trade... reviewed within 1-2 business days, reward sent within a further
// 1-2 business days") -> money actually in hand.
//
// Rather than running this ONCE from today, it runs the SAME pipeline from
// MANY different historical starting points (every 30 days across the full
// 2018-2025 dataset) so the result is a real EMPIRICAL DISTRIBUTION of
// "how many days does this whole pipeline actually take", not a single
// guess - directly answering "what are the real odds of an 80-day deadline
// (today -> Dec 1)".
//
// ARCHITECTURE: ONE single pass over the full candle timeline (FVG engines
// built once, Divergence/NWOG/Judas candidates computed once - same
// discipline as every other combined-strategy script this session, avoids
// the predicate-reuse bug by construction). Every start-point "attempt" is
// a lightweight, independent account simulator (own balance, own
// GuardrailEngine, own open positions) that listens to the SAME shared
// signal stream from the moment its own start time arrives - far cheaper
// than rebuilding engines per start point.
//
// MODELING ASSUMPTIONS, stated explicitly (none silently guessed):
//   - Challenge risk 0.5%, live risk 0.3% - matches this project's own
//     ACCOUNT_MODE defaults (config.js), not re-derived here.
//   - FTMO 1-Step's own maxDrawdownPct/Type (10%, trailing-eod) and
//     dailyLossLimitPct (3%) are read directly from propFirms/ftmo.js (the
//     source of truth), used for BOTH the challenge AND the live/funded
//     stage - FTMO's own rules don't separately document a different
//     funded-stage drawdown limit anywhere found this session, so this is
//     an assumption, not a confirmed fact.
//   - On a challenge bust: immediately buy a new $25k challenge (FTMO has
//     no time limit and no penalty beyond the $199 fee) and keep going -
//     the fee itself is not subtracted from the payout target here (a
//     separate, smaller cost, not the point of this analysis).
//   - On a LIVE (funded) bust: modeled as buying a fresh challenge and
//     starting over (loses the funded account, matches how these programs
//     actually work) - the elapsed-day counter is NOT reset, it just keeps
//     running against the original start point.
//   - Payout eligibility requires BOTH >= $500 NET (90% split) profit AND
//     >= 14 calendar days since the first live trade (FTMO's own rule) -
//     whichever condition is met later. +4 calendar days added for
//     processing (a light padding over FTMO's stated "1-2 + 1-2 business
//     days").
//   - The 90% split applies to the ACCOUNT'S CURRENT PROFIT ABOVE THE
//     FUNDED STARTING BALANCE at any moment (not per-trade) - matches how
//     a real payout is actually computed.

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

const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_ACCOUNT_SIZE = 25000;
const CHALLENGE_RISK_PCT = 0.5; // matches config.js's ACCOUNT_MODE='challenge' default
const LIVE_RISK_PCT = 0.3; // matches config.js's ACCOUNT_MODE='live' default
const FIRST_PAYOUT_TARGET_USD = 500;
const PAYOUT_MIN_HOLD_DAYS = 14; // sourced live, 2026-09-12 - see header
const PAYOUT_PROCESSING_DAYS = 4; // light padding over the sourced "1-2 + 1-2 business days"
const START_POINT_SPACING_DAYS = 30;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FTMO_1STEP = getPropFirmProgram('ftmo-1step');
const CHALLENGE_PHASE = FTMO_1STEP.phases[0];
const PROFIT_SPLIT = FTMO_1STEP.profitSplit; // 0.9

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

function makeDivIndex(divergenceCandidatesFull) {
  const bySymbol = new Map();
  for (const symbol of DIV_PAIR) bySymbol.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) bySymbol.get(cand.symbol).set(cand.entryTime, cand);
  return bySymbol;
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

function newGuardrail(phase, startTime, balance) {
  const g = new GuardrailEngine({
    maxTradesPerDay: CONFIG.guardrails.maxTradesPerDay,
    cooldownMinutesAfterLoss: CONFIG.guardrails.cooldownMinutesAfterLoss,
    dayBoundaryHourUTC: CONFIG.guardrails.dayBoundaryHourUTC,
    dailyLossLimitPct: CHALLENGE_PHASE.dailyLossLimitPct,
    targetPct: phase === 'challenge' ? CHALLENGE_PHASE.targetPct : null,
    maxDrawdownPct: CHALLENGE_PHASE.maxDrawdownPct,
    maxDrawdownType: CHALLENGE_PHASE.maxDrawdownType,
  });
  g.setBalance(balance, startTime);
  return g;
}

class Attempt {
  constructor(startTime) {
    this.originalStartTime = startTime;
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    this.openPositions = {}; for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', startTime, this.balance);
    this.liveStartTime = null;
    this.reAttempts = 1; // challenge sub-attempts (initial buy + any rebuys)
    this.liveBustCount = 0;
    this.doneTime = null;
    this.totalDays = null;
  }
  riskPct() { return this.phase === 'challenge' ? CHALLENGE_RISK_PCT : LIVE_RISK_PCT; }
  resetToFreshChallenge(now) {
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', now, this.balance);
    this.reAttempts++;
  }
  transitionToLive(now) {
    this.phase = 'live';
    this.balance = CHALLENGE_ACCOUNT_SIZE; // funded account starts fresh, not at the challenge's ending balance
    for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.liveStartTime = now;
    this.guardrail = newGuardrail('live', now, this.balance);
  }
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmo25kFirstPayoutByDateAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) candlesBySymbolFull[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;

  const divergenceCandidatesFull = makeDivIndex(computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500));
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);
  const judasCandidatesFull = computeJudasCandidatesMap(candlesBySymbolFull.EURUSD);

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

  const timeline = [];
  for (const symbol of ALL_SYMBOLS) for (const candle of candlesBySymbolFull[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));

  const datasetStart = timeline[0].candle.time;
  const datasetEnd = timeline[timeline.length - 1].candle.time;

  const attempts = [];
  for (let t = datasetStart; t < datasetEnd; t += START_POINT_SPACING_DAYS * DAY_MS) attempts.push(new Attempt(t));
  console.error(`${attempts.length} start points, every ${START_POINT_SPACING_DAYS} days, from ${fmtDate(datasetStart)} to ${fmtDate(datasetEnd)}`);

  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  const tryOpen = (attempt, symbol, candle, i, source, direction, entryPrice, stopPrice, targetPrice, distance, rrMultiple, maxHoldingCandles) => {
    if (attempt.openPositions[symbol]) return;
    if (!attempt.guardrail.canTakeNewTrade(candle.time)) return;
    attempt.openPositions[symbol] = {
      source, direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple,
      riskAmount: attempt.balance * (attempt.riskPct() / 100), maxHoldingCandles,
    };
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    // 1) Resolve closes + phase transitions, per active attempt.
    for (const attempt of attempts) {
      if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
      const open = attempt.openPositions[symbol];
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
            const signedMove = bullish ? candle.close - open.entryPrice : open.entryPrice - candle.close;
            legR = signedMove / open.distance; outcome = 'timeout';
          }
          const costR = spread > 0 ? spread / open.distance : 0;
          const pnl = open.riskAmount * (legR - costR);
          attempt.balance += pnl;
          attempt.guardrail.recordTrade({ pnl, time: candle.time, balanceAfter: attempt.balance });
          attempt.openPositions[symbol] = null;

          const status = attempt.guardrail.getStatus(candle.time);
          if (attempt.phase === 'challenge') {
            if (status.overallDrawdownBreached) {
              attempt.resetToFreshChallenge(candle.time);
            } else if (attempt.balance >= CHALLENGE_ACCOUNT_SIZE * (1 + CHALLENGE_PHASE.targetPct / 100)) {
              attempt.transitionToLive(candle.time);
            }
          } else if (attempt.phase === 'live') {
            if (status.overallDrawdownBreached) {
              attempt.liveBustCount++;
              attempt.resetToFreshChallenge(candle.time);
            } else {
              const grossProfit = attempt.balance - CHALLENGE_ACCOUNT_SIZE;
              const netEligible = grossProfit > 0 ? grossProfit * PROFIT_SPLIT : 0;
              const daysSinceLive = (candle.time - attempt.liveStartTime) / DAY_MS;
              if (netEligible >= FIRST_PAYOUT_TARGET_USD && daysSinceLive >= PAYOUT_MIN_HOLD_DAYS) {
                attempt.phase = 'done';
                attempt.doneTime = candle.time + PAYOUT_PROCESSING_DAYS * DAY_MS;
                attempt.totalDays = (attempt.doneTime - attempt.originalStartTime) / DAY_MS;
              }
            }
          }
        }
      }
    }

    // 2) Shared signal computation (once per candle), then let each eligible attempt decide to open.
    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') {
          formationIndexBySymbol[symbol].set(e.id, i);
        } else if (e.type === 'validated') {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: candlesBySymbolFull[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'fvg', e.direction, entryPrice, stopPrice, targetPrice, distance, FVG_CONFIG[symbol].rrMultiple, 480);
          }
        }
      }
    }

    if (DIV_PAIR.includes(symbol)) {
      const cand = divergenceCandidatesFull.get(symbol)?.get(candle.time);
      if (cand) {
        const distance = cand.stopDistance;
        if (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE) {
          const entryPrice = candle.open;
          const stopPrice = entryPrice - distance;
          const targetPrice = entryPrice + DIV_RR_MULTIPLE * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'divergence', 'bullish', entryPrice, stopPrice, targetPrice, distance, DIV_RR_MULTIPLE, DIV_MAX_HOLDING_CANDLES);
          }
        }
      }
    }

    if (NWOG_SYMBOLS.includes(symbol)) {
      const cand = nwogCandidatesFull.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE)) {
          const targetPrice = bullish ? entryPrice + NWOG_RR * distance : entryPrice - NWOG_RR * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'nwog', cand.direction, entryPrice, stopPrice, targetPrice, distance, NWOG_RR, NWOG_MAX_HOLDING);
          }
        }
      }
    }

    if (JUDAS_SYMBOLS.includes(symbol)) {
      const cand = judasCandidatesFull.get(candle.time);
      if (cand) {
        const bullish = cand.direction === 'bullish';
        const entryPrice = candle.open;
        const stopPrice = cand.stopReference;
        const distance = Math.abs(entryPrice - stopPrice);
        const validStopSide = bullish ? stopPrice < entryPrice : stopPrice > entryPrice;
        if (distance > 0 && validStopSide && (!spread || distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE)) {
          const targetPrice = bullish ? entryPrice + JUDAS_RR * distance : entryPrice - JUDAS_RR * distance;
          for (const attempt of attempts) {
            if (attempt.phase === 'done' || candle.time < attempt.originalStartTime) continue;
            tryOpen(attempt, symbol, candle, i, 'judas', cand.direction, entryPrice, stopPrice, targetPrice, distance, JUDAS_RR, JUDAS_MAX_HOLDING);
          }
        }
      }
    }
  }

  // Results.
  const done = attempts.filter((a) => a.phase === 'done');
  const censored = attempts.filter((a) => a.phase !== 'done');
  const days = done.map((a) => a.totalDays).sort((a, b) => a - b);
  const median = days.length ? days[Math.floor(days.length / 2)] : null;
  const mean = days.length ? days.reduce((s, d) => s + d, 0) / days.length : null;

  const DEADLINE_DAYS = Math.round((Date.parse('2026-12-01T00:00:00Z') - Date.parse('2026-09-12T00:00:00Z')) / DAY_MS);
  const within = (n) => done.filter((a) => a.totalDays <= n).length;

  const md = [];
  md.push('# FTMO 1-Step $25k → premier retrait de $500 — combien de temps ça prend vraiment?');
  md.push('');
  md.push(
    "Esdras, après avoir écarté GoatFundedTrader (trop contraignant) : \"je veux toucher mon premier 500$ de forex " +
      "ou futures le 1 December.\" Plutôt qu'une estimation à la main, simulation empirique du pipeline COMPLET : " +
      "acheter un challenge FTMO 1-Step $25k, le passer (rachat immédiat d'un nouveau challenge à chaque bust - " +
      "FTMO n'a ni limite de temps ni pénalité au-delà des frais), passer live sur un compte financé $25k, " +
      "accumuler du profit réel, et devenir éligible au premier retrait 14 jours calendaires après le premier " +
      "trade live (règle FTMO sourcée en direct aujourd'hui) + ~4 jours de traitement. Testé depuis " +
      `${attempts.length} points de départ historiques différents (tous les ${START_POINT_SPACING_DAYS} jours sur ` +
      "2018-2025) pour obtenir une vraie DISTRIBUTION empirique, pas une seule estimation.\n\n" +
      "**Hypothèses de modélisation à connaître** : risque 0.5% en challenge / 0.3% en live (les défauts déjà " +
      "codés) ; la limite de perte totale de FTMO (10%, trailing fin de journée) est supposée IDENTIQUE une fois " +
      "financé - non confirmée séparément dans les sources consultées cette session ; un bust en live repart sur " +
      "un nouveau challenge (perte du compte financé), sans réinitialiser le compteur de jours écoulés depuis le " +
      "point de départ initial ; le split 90% s'applique au profit COURANT au-dessus du solde financé de départ, " +
      "pas trade par trade."
  );
  md.push('');
  md.push(`**Résultat : sur ${attempts.length} points de départ testés, ${done.length} ont atteint un premier retrait de $500 dans les données disponibles (${censored.length} n'ont pas eu assez de données restantes pour conclure - à traiter comme "plus de temps que la fenêtre testée", pas comme un échec).**`);
  md.push('');
  md.push(`- Médiane : **${median !== null ? Math.round(median) + ' jours' : '—'}**`);
  md.push(`- Moyenne : ${mean !== null ? Math.round(mean) + ' jours' : '—'}`);
  md.push(`- Plus rapide : ${days.length ? Math.round(days[0]) + ' jours' : '—'}`);
  md.push(`- Plus lent (parmi ceux qui ont fini) : ${days.length ? Math.round(days[days.length - 1]) + ' jours' : '—'}`);
  md.push('');
  md.push(`## La question directe : le 1er décembre, c'est dans ${DEADLINE_DAYS} jours à partir d'aujourd'hui (12 sept. 2026)`);
  md.push('');
  md.push('| Seuil (jours) | % des points de départ qui y arrivent |');
  md.push('|---|---|');
  for (const n of [30, 45, 60, DEADLINE_DAYS, 90, 120, 150]) {
    const pctWithin = attempts.length ? ((within(n) / attempts.length) * 100).toFixed(0) : '—';
    md.push(`| ${n}${n === DEADLINE_DAYS ? ' (= 1er décembre)' : ''} | ${pctWithin}% |`);
  }
  md.push('');
  const pctDeadline = attempts.length ? ((within(DEADLINE_DAYS) / attempts.length) * 100).toFixed(0) : '0';
  md.push(
    `**Verdict : environ ${pctDeadline}% des points de départ historiques testés atteignent $500 net en main en ` +
      `${DEADLINE_DAYS} jours ou moins.** ${Number(pctDeadline) >= 50
        ? "C'est un objectif réaliste (plus probable qu'improbable), pas garanti."
        : "C'est un objectif TENDU (moins probable qu'improbable) avec cette config précise - possible dans un scénario favorable, mais PAS le cas moyen/attendu."} ` +
      "Le facteur qui domine le calendrier est presque toujours la VITESSE DE PASSAGE DU CHALLENGE (très variable " +
      "d'un point de départ à l'autre) plus que la phase live elle-même (14 jours minimum + accumulation du " +
      "profit, plus stable une fois financé)."
  );
  md.push('');
  md.push('## Ce qui améliore concrètement les chances de tenir la date');
  md.push('');
  md.push(
    "1. **Acheter le challenge AUJOURD'HUI** - chaque jour de retard mange directement dans la marge disponible.\n" +
      "2. **Ne jamais laisser un bust de challenge traîner** - racheter immédiatement (`ACCOUNT_MODE=challenge`, " +
      "0.5%, déjà configuré) plutôt que d'attendre.\n" +
      "3. **Demander le premier retrait dès l'éligibilité (jour 14 de trading live), même si c'est moins de $500** " +
      "- rien n'oblige à attendre un seul gros retrait de $500 : plusieurs petits retraits qui s'additionnent à " +
      "$500 avant le 1er décembre comptent tout autant pour \"toucher\" cet argent, et réduisent le risque d'un " +
      "bust live qui repousserait tout.\n" +
      "4. **Accepter que ce n'est pas garanti** - avec cette config précise, le résultat dépend fortement de QUAND " +
      "le marché donne des opportunités, pas seulement du système. Un deuxième point de repli (ex. viser " +
      "mi-décembre plutôt qu'une date dure) réduit la pression sans changer la stratégie."
  );
  md.push('');
  md.push(
    "**Rien codé dans `src/`** - script de recherche/planification seulement, aucun changement de configuration. " +
      `Détail complet (chaque point de départ, son issue, son nombre de jours) : voir la sortie console du script ` +
      "pour la liste brute si besoin d'auditer un cas précis."
  );

  const outMd = path.join(dir, 'ftmo-25k-first-payout-by-date-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`Done: ${done.length}/${attempts.length}, censored: ${censored.length}, median: ${median ? Math.round(median) : '—'}j, within ${DEADLINE_DAYS}j: ${pctDeadline}%`);
}

main();
