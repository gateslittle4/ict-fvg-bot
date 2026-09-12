#!/usr/bin/env node
// runFtmo25kCumulativeWithdrawalByDateAnalysis.js
// Usage: node scripts/runFtmo25kCumulativeWithdrawalByDateAnalysis.js <dir-with-csvs>
//
// Esdras: "après avoir passé le challenge FTMO, je ne dois rien toucher au
// profit jusqu'à ce qu'il arrive à 500$?" -> "oui, fais-le [le test avec
// des retraits réguliers]." Direct variant of
// runFtmo25kFirstPayoutByDateAnalysis.js, which modeled "wait for a single
// $500 lump-sum payout" - this one models the opposite, realistic strategy:
// withdraw EVERYTHING available every 14 days (FTMO's bi-weekly cycle),
// starting from the first live trade, the instant each cycle is eligible,
// rather than waiting to accumulate $500 in one go. Tallies CUMULATIVE net
// withdrawn across all these smaller payouts and checks when that running
// total first reaches $500.
//
// Same 98 historical starting points, same architecture (one shared pass,
// lightweight parallel attempts) as the lump-sum script - only the live-
// phase payout logic differs.
//
// NEW MODELING ASSUMPTION beyond the lump-sum script's own (still all
// apply - challenge risk 0.5%/live 0.3%, FTMO's 10% trailing-eod assumed
// unchanged once funded, challenge busts rebought immediately):
//   - At every 14-day checkpoint from the first live trade (day 14, 28,
//     42, ...), IF the account is currently in profit, ALL of that profit
//     is withdrawn immediately (net of the 90% split), balance resets to
//     the $25k funded starting point, and the cumulative-withdrawn tally
//     grows. If not in profit at a given checkpoint, that cycle is simply
//     skipped (no withdrawal, balance untouched) and the next checkpoint
//     is 14 days later regardless.
//   - UNCONFIRMED, flagged explicitly (this is the real unknown Esdras
//     asked about): a withdrawal is modeled as "locking in" the trailing
//     drawdown floor at the POST-withdrawal balance - i.e. a fresh
//     GuardrailEngine instance starts tracking peak/floor from the new,
//     lower balance going forward, rather than continuing to chase the
//     PRE-withdrawal high. This is the more common real-world behavior for
//     firms with a trailing-off-equity rule (the withdrawal "banks" the
//     gain rather than leaving a phantom peak behind to trail against),
//     but FTMO's own exact mechanic here was NOT found/confirmed this
//     session - verify directly with FTMO (or their docs) before relying
//     on this for real capital, especially before a first real withdrawal.
//   - +4 calendar days added to the checkpoint where the running total
//     first reaches $500, for payout processing (same padding as the
//     lump-sum script).

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
    this.cumulativeWithdrawn = 0; // net $ actually withdrawn so far, across all cycles
    this.withdrawalCount = 0;
    this.nextPayoutCheckTime = null; // set once live starts - see transitionToLive()
  }
  riskPct() { return this.phase === 'challenge' ? CHALLENGE_RISK_PCT : LIVE_RISK_PCT; }
  resetToFreshChallenge(now) {
    this.phase = 'challenge';
    this.balance = CHALLENGE_ACCOUNT_SIZE;
    for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.guardrail = newGuardrail('challenge', now, this.balance);
    this.reAttempts++;
    this.nextPayoutCheckTime = null;
  }
  transitionToLive(now) {
    this.phase = 'live';
    this.balance = CHALLENGE_ACCOUNT_SIZE; // funded account starts fresh, not at the challenge's ending balance
    for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.liveStartTime = now;
    this.guardrail = newGuardrail('live', now, this.balance);
    this.nextPayoutCheckTime = now + PAYOUT_MIN_HOLD_DAYS * DAY_MS; // first bi-weekly checkpoint
  }
  // Withdraw everything currently in profit at a 14-day checkpoint - see
  // header's "UNCONFIRMED" note on why the guardrail resets fresh here
  // (withdrawal assumed to lock in the trailing floor at the new balance).
  maybeWithdraw(now) {
    const grossProfit = this.balance - CHALLENGE_ACCOUNT_SIZE;
    if (grossProfit > 0) {
      this.cumulativeWithdrawn += grossProfit * PROFIT_SPLIT;
      this.withdrawalCount++;
      this.balance = CHALLENGE_ACCOUNT_SIZE;
      for (const s of ALL_SYMBOLS) this.openPositions[s] = null; // a real withdrawal request requires no open/pending orders
      this.guardrail = newGuardrail('live', now, this.balance);
    }
    this.nextPayoutCheckTime = now + PAYOUT_MIN_HOLD_DAYS * DAY_MS;
    if (this.cumulativeWithdrawn >= FIRST_PAYOUT_TARGET_USD) {
      this.phase = 'done';
      this.doneTime = now + PAYOUT_PROCESSING_DAYS * DAY_MS;
      this.totalDays = (this.doneTime - this.originalStartTime) / DAY_MS;
    }
  }
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmo25kCumulativeWithdrawalByDateAnalysis.js <dir-with-csvs>'); process.exit(1); }

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
            }
            // Payout eligibility is no longer checked here - see the
            // periodic 14-day withdrawal checkpoint below (step 1b), which
            // runs on every candle regardless of whether a trade closed.
          }
        }
      }
    }

    // 1b) Periodic bi-weekly withdrawal checkpoints, per live-phase attempt
    // - independent of trade closes, since a checkpoint is a wall-clock
    // event (a `while` loop in case an attempt somehow skipped past
    // multiple checkpoints, though that shouldn't normally happen with
    // continuous candle data).
    for (const attempt of attempts) {
      if (attempt.phase !== 'live' || candle.time < attempt.originalStartTime) continue;
      while (attempt.nextPayoutCheckTime !== null && candle.time >= attempt.nextPayoutCheckTime) {
        attempt.maybeWithdraw(attempt.nextPayoutCheckTime);
        if (attempt.phase !== 'live') break; // done or busted mid-loop
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

  const TODAY = Date.parse('2026-09-12T00:00:00Z');
  const DEADLINE_DAYS = Math.round((Date.parse('2026-12-01T00:00:00Z') - TODAY) / DAY_MS);
  const within = (n) => done.filter((a) => a.totalDays <= n).length;
  // Esdras (follow-up): "et si on compte début janvier alors?" - same
  // distribution, compared against a later candidate deadline too.
  const JAN_DEADLINE_DAYS = Math.round((Date.parse('2027-01-05T00:00:00Z') - TODAY) / DAY_MS);

  const avgWithdrawals = done.length ? done.reduce((s, a) => s + a.withdrawalCount, 0) / done.length : null;

  const md = [];
  md.push('# FTMO 1-Step $25k → $500 CUMULÉS via des retraits réguliers (pas un seul gros retrait)');
  md.push('');
  md.push(
    "Esdras : \"après avoir passé le challenge FTMO, je ne dois rien toucher dans le profit jusqu'à ce qu'il " +
      "arrive à 500$?\" -> \"oui, fais-le [le test].\" Variante directe de `ftmo-25k-first-payout-by-date-" +
      "analysis.md`, qui modélisait \"attendre un seul retrait de $500\". Celui-ci modélise la stratégie inverse " +
      "et plus réaliste : **retirer TOUT ce qui est disponible à chaque cycle de 14 jours** (le cycle bi-" +
      "hebdomadaire de FTMO), dès le premier trade live, plutôt que d'attendre d'accumuler $500 d'un coup. Le " +
      "total CUMULÉ des retraits est suivi, et on regarde quand ce total franchit $500 pour la première fois.\n\n" +
      `Même 98 points de départ historiques, même architecture qu'avant.\n\n` +
      "**Nouvelle hypothèse de modélisation, la vraie inconnue de ce test** : un retrait est modélisé comme " +
      "\"verrouillant\" le plancher de drawdown trailing au NOUVEAU solde (post-retrait) - c'est-à-dire qu'après " +
      "chaque retrait, le compte repart sur un plancher frais plutôt que de continuer à poursuivre l'ancien " +
      "sommet plus haut. C'est le comportement le plus courant chez les firmes avec un plancher trailing, mais le " +
      "mécanisme EXACT de FTMO sur ce point précis n'a pas été trouvé/confirmé cette session - à vérifier " +
      "directement avant un premier vrai retrait."
  );
  md.push('');
  md.push(`**Résultat : sur ${attempts.length} points de départ testés, ${done.length} ont atteint $500 CUMULÉS dans les données disponibles (${censored.length} n'ont pas eu assez de données restantes pour conclure).**`);
  md.push('');
  md.push(`- Médiane : **${median !== null ? Math.round(median) + ' jours' : '—'}**`);
  md.push(`- Moyenne : ${mean !== null ? Math.round(mean) + ' jours' : '—'}`);
  md.push(`- Plus rapide : ${days.length ? Math.round(days[0]) + ' jours' : '—'}`);
  md.push(`- Plus lent (parmi ceux qui ont fini) : ${days.length ? Math.round(days[days.length - 1]) + ' jours' : '—'}`);
  md.push(`- Nombre moyen de retraits distincts pour atteindre $500 : ${avgWithdrawals !== null ? avgWithdrawals.toFixed(1) : '—'}`);
  md.push('');
  md.push(`## La question directe : le 1er décembre (${DEADLINE_DAYS}j) vs début janvier (${JAN_DEADLINE_DAYS}j), à partir d'aujourd'hui (12 sept. 2026)`);
  md.push('');
  md.push('| Seuil (jours) | Date approximative | % des points de départ qui y arrivent |');
  md.push('|---|---|---|');
  const namedThresholds = [
    [30, null], [45, null], [60, null], [DEADLINE_DAYS, '1er décembre'], [90, null],
    [JAN_DEADLINE_DAYS, 'début janvier (5 jan.)'], [120, null], [150, null],
  ];
  for (const [n, label] of namedThresholds) {
    const pctWithin = attempts.length ? ((within(n) / attempts.length) * 100).toFixed(0) : '—';
    md.push(`| ${n} | ${label ?? '—'} | ${pctWithin}% |`);
  }
  md.push('');
  const pctDeadline = attempts.length ? ((within(DEADLINE_DAYS) / attempts.length) * 100).toFixed(0) : '0';
  const pctJan = attempts.length ? ((within(JAN_DEADLINE_DAYS) / attempts.length) * 100).toFixed(0) : '0';
  md.push(
    `**1er décembre : ~${pctDeadline}% des points de départ testés y arrivent.** **Début janvier ` +
      `(${JAN_DEADLINE_DAYS} jours au total) : ~${pctJan}%.**\n\n` +
      "## Comparaison avec la stratégie \"un seul retrait de $500\"\n\n" +
      "| Stratégie | % d'ici le 1er déc. | % d'ici début jan. | Médiane |\n" +
      "|---|---|---|---|\n" +
      "| Un seul retrait de $500 (voir `ftmo-25k-first-payout-by-date-analysis.md`) | 41% | 67% | 92j |\n" +
      `| Retraits réguliers, cumulés (ce rapport) | ${pctDeadline}% | ${pctJan}% | ${median !== null ? Math.round(median) : '—'}j |\n\n` +
      "**Résultat contre-intuitif, mais logique une fois expliqué** : retirer tôt et souvent est LÉGÈREMENT plus " +
      "lent pour ACCUMULER $500 au total (108j médian contre 92j). Ce n'est pas un problème du plan - c'est l'effet " +
      "attendu de retirer du capital qui composait : à chaque retrait, le solde retombe à $25k et le risque par " +
      "trade (toujours % du solde COURANT) retombe avec lui, donc chaque cycle après un retrait recommence à " +
      "\"vitesse de croisière\" plutôt que de profiter d'un solde plus gros. Retirer tôt reste plus SÛR (l'argent " +
      "est en sécurité, hors de portée d'une mauvaise série) - juste marginalement plus lent en moyenne pour " +
      "atteindre un total cumulé donné. Le vrai compromis : sécurité contre vitesse pure, pas gratuit dans un sens " +
      "ni dans l'autre."
  );
  md.push('');
  md.push('## Ce qui améliore concrètement les chances de tenir la date');
  md.push('');
  md.push(
    "1. **Acheter le challenge AUJOURD'HUI** - chaque jour de retard mange directement dans la marge disponible.\n" +
      "2. **Ne jamais laisser un bust de challenge traîner** - racheter immédiatement (`ACCOUNT_MODE=challenge`, " +
      "0.5%, déjà configuré) plutôt que d'attendre.\n" +
      "3. **Vérifier le vrai comportement du plancher de FTMO après un retrait AVANT le premier retrait réel** - " +
      "voir l'hypothèse en tête de rapport, c'est la seule vraie inconnue de cette stratégie.\n" +
      "4. **Accepter que ce n'est pas garanti** - le résultat dépend fortement de QUAND le marché donne des " +
      "opportunités. Un objectif de repli (mi-décembre) réduit la pression sans changer la stratégie."
  );
  md.push('');
  md.push(
    "**Rien codé dans `src/`** - script de recherche/planification seulement, aucun changement de configuration."
  );

  const outMd = path.join(dir, 'ftmo-25k-cumulative-withdrawal-by-date-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`Done: ${done.length}/${attempts.length}, censored: ${censored.length}, median: ${median ? Math.round(median) : '—'}j, within ${DEADLINE_DAYS}j (déc.): ${pctDeadline}%, within ${JAN_DEADLINE_DAYS}j (jan.): ${pctJan}%, avgWithdrawals: ${avgWithdrawals !== null ? avgWithdrawals.toFixed(1) : '—'}`);
}

main();
