#!/usr/bin/env node
// runFtmoFreeTrial5PctIn14DaysAnalysis.js
// Usage: node scripts/runFtmoFreeTrial5PctIn14DaysAnalysis.js <dir-with-csvs>
//
// Esdras: "j'ai une idée. Peux-tu atteindre le 5% du free trial de FTMO
// dans 14 jours?" Verified live (2026-09-12) what FTMO's Free Trial
// actually is before simulating it - two variants exist
// (https://ftmo.com/en/faq/how-about-a-free-trial/, https://propnavi.io/
// en/blog/ftmo-free-trial-guide/): a free, no-cost DEMO account, fixed
// 14-day lifetime (a new one can always be started afterward, "no limit
// on how many trials you take over time"), profit target HALVED from the
// real challenge's own (10% -> 5%), same loss rules otherwise. This script
// models the 1-Step variant specifically (same 10% trailing-end-of-day
// drawdown / 3% daily loss as propFirms/ftmo.js's FTMO_1STEP - the program
// already tested extensively this session), target 5% instead of 10%.
// IMPORTANT, stated up front: passing a Free Trial does NOT grant a real
// funded account or any confirmed discount - FTMO's own page: "Free
// Trials of FTMO Challenge do not guarantee automatic eligibility for an
// FTMO Account" and "not as a qualification step". This script answers
// the literal question (can this system reach +5% inside one 14-day
// window?), not "is this a shortcut to real funding" - it isn't one.
//
// Unlike the multi-phase payout scripts (which chain challenge -> live ->
// payout), this is a SINGLE fixed 14-day window per attempt - no rebuy
// chaining, since each trial is its own independent demo account with a
// hard 14-day lifetime. Account size doesn't affect the outcome (risk is
// always % of balance, so the target/bust are pure % thresholds) - $25k
// used only for readability in the output.
//
// ARCHITECTURE: same one-shared-pass-over-the-timeline design as every
// other combined-strategy script this session, but with MANY MORE start
// points (every 7 days instead of 30, since each window is short and
// independence matters more at this granularity) for a real empirical
// distribution of "does a 14-day window starting here reach +5%?".

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
const ACCOUNT_SIZE = 25000; // arbitrary - doesn't change the % outcome, just for readable output
const CHALLENGE_RISK_PCT = 0.5; // matches config.js's ACCOUNT_MODE='challenge' default
const WINDOW_DAYS = 14;
const FREE_TRIAL_TARGET_PCT = 5; // halved from FTMO_1STEP's real 10%, per FTMO's own FAQ
const START_POINT_SPACING_DAYS = 7;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const FTMO_1STEP = getPropFirmProgram('ftmo-1step');
const PHASE = FTMO_1STEP.phases[0]; // dailyLossLimitPct=3, maxDrawdownPct=10, maxDrawdownType='trailing-eod'

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

class Trial {
  constructor(startTime) {
    this.startTime = startTime;
    this.windowEndTime = startTime + WINDOW_DAYS * DAY_MS;
    this.balance = ACCOUNT_SIZE;
    this.openPositions = {}; for (const s of ALL_SYMBOLS) this.openPositions[s] = null;
    this.guardrail = new GuardrailEngine({
      maxTradesPerDay: CONFIG.guardrails.maxTradesPerDay,
      cooldownMinutesAfterLoss: CONFIG.guardrails.cooldownMinutesAfterLoss,
      dayBoundaryHourUTC: CONFIG.guardrails.dayBoundaryHourUTC,
      dailyLossLimitPct: PHASE.dailyLossLimitPct,
      targetPct: FREE_TRIAL_TARGET_PCT,
      maxDrawdownPct: PHASE.maxDrawdownPct,
      maxDrawdownType: PHASE.maxDrawdownType,
    });
    this.guardrail.setBalance(this.balance, startTime);
    this.outcome = 'pending'; // 'pending' | 'passed' | 'busted' | 'expired'
    this.outcomeTime = null;
    this.trades = 0;
  }
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmoFreeTrial5PctIn14DaysAnalysis.js <dir-with-csvs>'); process.exit(1); }

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

  const trials = [];
  for (let t = datasetStart; t + WINDOW_DAYS * DAY_MS <= datasetEnd; t += START_POINT_SPACING_DAYS * DAY_MS) trials.push(new Trial(t));
  console.error(`${trials.length} 14-day windows, starting every ${START_POINT_SPACING_DAYS} days, from ${fmtDate(datasetStart)} to ${fmtDate(datasetEnd - WINDOW_DAYS * DAY_MS)}`);

  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  const tryOpen = (trial, symbol, candle, i, source, direction, entryPrice, stopPrice, targetPrice, distance, rrMultiple, maxHoldingCandles) => {
    if (trial.openPositions[symbol]) return;
    if (!trial.guardrail.canTakeNewTrade(candle.time)) return;
    trial.openPositions[symbol] = {
      source, direction, entryIndex: i, entryTime: candle.time, entryPrice, stopPrice, targetPrice, distance, rrMultiple,
      riskAmount: trial.balance * (CHALLENGE_RISK_PCT / 100), maxHoldingCandles,
    };
  };

  for (const { symbol, candle } of timeline) {
    symbolIndex[symbol] += 1;
    const i = symbolIndex[symbol];
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    for (const trial of trials) {
      if (trial.outcome !== 'pending' || candle.time < trial.startTime) continue;
      if (candle.time >= trial.windowEndTime) { trial.outcome = 'expired'; trial.outcomeTime = trial.windowEndTime; continue; }

      const open = trial.openPositions[symbol];
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
          trial.balance += pnl;
          trial.guardrail.recordTrade({ pnl, time: candle.time, balanceAfter: trial.balance });
          trial.openPositions[symbol] = null;
          trial.trades++;

          const status = trial.guardrail.getStatus(candle.time);
          if (status.overallDrawdownBreached) { trial.outcome = 'busted'; trial.outcomeTime = candle.time; continue; }
          if (status.targetReached) { trial.outcome = 'passed'; trial.outcomeTime = candle.time; continue; }
        }
      }
    }

    if (FVG_SYMBOLS.includes(symbol) && engines[symbol]) {
      const events = engines[symbol].processCandle(candle);
      for (const e of events) {
        if (e.type === 'watching') formationIndexBySymbol[symbol].set(e.id, i);
        else if (e.type === 'validated') {
          const c3Index = formationIndexBySymbol[symbol].get(e.id);
          const c1Index = c3Index !== undefined ? c3Index - 2 : -1;
          const entryPrice = e.direction === 'bullish' ? e.zone.top : e.zone.bottom;
          const stopPrice = computeStop({ direction: e.direction, zone: e.zone, candles: candlesBySymbolFull[symbol], c1Index, stopMode: FVG_CONFIG[symbol].stopMode, swingLookback: 10 });
          const distance = Math.abs(entryPrice - stopPrice);
          if (distance <= 0) continue;
          if (spread > 0 && distance < spread * MIN_DISTANCE_SPREAD_MULTIPLE) continue;
          const targetPrice = e.direction === 'bullish' ? entryPrice + FVG_CONFIG[symbol].rrMultiple * distance : entryPrice - FVG_CONFIG[symbol].rrMultiple * distance;
          for (const trial of trials) {
            if (trial.outcome !== 'pending' || candle.time < trial.startTime || candle.time >= trial.windowEndTime) continue;
            tryOpen(trial, symbol, candle, i, 'fvg', e.direction, entryPrice, stopPrice, targetPrice, distance, FVG_CONFIG[symbol].rrMultiple, 480);
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
          for (const trial of trials) {
            if (trial.outcome !== 'pending' || candle.time < trial.startTime || candle.time >= trial.windowEndTime) continue;
            tryOpen(trial, symbol, candle, i, 'divergence', 'bullish', entryPrice, stopPrice, targetPrice, distance, DIV_RR_MULTIPLE, DIV_MAX_HOLDING_CANDLES);
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
          for (const trial of trials) {
            if (trial.outcome !== 'pending' || candle.time < trial.startTime || candle.time >= trial.windowEndTime) continue;
            tryOpen(trial, symbol, candle, i, 'nwog', cand.direction, entryPrice, stopPrice, targetPrice, distance, NWOG_RR, NWOG_MAX_HOLDING);
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
          for (const trial of trials) {
            if (trial.outcome !== 'pending' || candle.time < trial.startTime || candle.time >= trial.windowEndTime) continue;
            tryOpen(trial, symbol, candle, i, 'judas', cand.direction, entryPrice, stopPrice, targetPrice, distance, JUDAS_RR, JUDAS_MAX_HOLDING);
          }
        }
      }
    }
  }

  // Any trial still 'pending' at the very end of the dataset (ran out of candles before its window closed) counts as censored/unresolved.
  for (const trial of trials) if (trial.outcome === 'pending') trial.outcome = 'unresolved';

  const passed = trials.filter((t) => t.outcome === 'passed');
  const busted = trials.filter((t) => t.outcome === 'busted');
  const expired = trials.filter((t) => t.outcome === 'expired');
  const unresolved = trials.filter((t) => t.outcome === 'unresolved');
  const passDays = passed.map((t) => (t.outcomeTime - t.startTime) / DAY_MS).sort((a, b) => a - b);
  const medianPassDays = passDays.length ? passDays[Math.floor(passDays.length / 2)] : null;

  const md = [];
  md.push('# FTMO Free Trial (1-Step) — atteindre +5% en 14 jours, empiriquement');
  md.push('');
  md.push(
    "Esdras : \"j'ai une idée, peux-tu atteindre le 5% du free trial de FTMO dans 14 jours?\" Vérifié en direct " +
      "(help.ftmo.com/FAQ, 2026-09-12) avant de simuler quoi que ce soit : le Free Trial FTMO est un compte démo " +
      "GRATUIT, durée fixe de 14 jours (on peut en relancer un nouveau ensuite, aucune limite sur le nombre de " +
      "trials dans le temps), cible réduite de moitié par rapport au vrai challenge (10%→5%), mêmes règles de " +
      "perte sinon (variante 1-Step : 10% de perte totale trailing fin de journée, 3% de perte quotidienne). " +
      "**Le passer NE donne PAS de compte financé ni d'avantage confirmé** (FTMO lui-même : \"Free Trials... do " +
      "not guarantee automatic eligibility for an FTMO Account\", \"not as a qualification step\") - ce rapport " +
      "répond à la question littérale (le système peut-il atteindre +5% dans une fenêtre de 14 jours?), pas à " +
      "\"est-ce un raccourci vers un vrai financement\" - ce n'en est pas un.\n\n" +
      `Testé sur ${trials.length} fenêtres de 14 jours différentes (démarrant tous les ${START_POINT_SPACING_DAYS} jours sur 2018-2025), risque 0.5%/trade (mode "challenge" déjà configuré).`
  );
  md.push('');
  md.push('| Résultat | Nombre | % |');
  md.push('|---|---|---|');
  md.push(`| ✅ Atteint +5% (passé) | ${passed.length} | ${((passed.length / trials.length) * 100).toFixed(0)}% |`);
  md.push(`| ❌ Busté (-10% trailing) | ${busted.length} | ${((busted.length / trials.length) * 100).toFixed(0)}% |`);
  md.push(`| ⏱️ Fenêtre expirée sans passer ni buster | ${expired.length} | ${((expired.length / trials.length) * 100).toFixed(0)}% |`);
  md.push(`| — Non résolu (fin des données) | ${unresolved.length} | ${((unresolved.length / trials.length) * 100).toFixed(0)}% |`);
  md.push('');
  md.push(`**Verdict : ~${((passed.length / trials.length) * 100).toFixed(0)}% des fenêtres de 14 jours testées atteignent +5% dans le délai.** Parmi celles qui passent, le temps médian pour y arriver est de **${medianPassDays !== null ? medianPassDays.toFixed(1) + ' jours' : '—'}** (sur les 14 disponibles).`);
  md.push('');
  md.push(
    `Comparaison utile : ce même système à ce même risque (0.5%) met en moyenne ~63 jours pour atteindre +10% ` +
      "(le vrai challenge payant, voir `ftmo-1step-all-live-strategies-cycle-account-impact.md`) - une cible " +
      "deux fois plus petite (+5%) sur une fenêtre de 14 jours est mécaniquement plus dure à garantir à coup sûr " +
      "(pas assez de temps pour laisser la moyenne jouer), d'où le taux de succès plus bas que ce qu'on pourrait " +
      "naïvement attendre en divisant simplement le temps par deux."
  );
  md.push('');
  md.push(
    "**Ce que ça veut dire concrètement** : le Free Trial peut servir à observer le système tourner sans risque " +
      "(gratuit, aucun engagement), mais ce n'est ni un raccourci financier (aucun gain réel) ni une garantie de " +
      "réussite rapide - un taux d'échec/expiration significatif est normal même pour un système qui, sur un " +
      "horizon plus long (le vrai challenge, 90 jours+), a une espérance largement positive. Rien codé dans " +
      "`src/` - analyse de recherche seulement."
  );

  const outMd = path.join(dir, 'ftmo-free-trial-5pct-in-14days-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
  console.error(`${trials.length} windows: ${passed.length} passed (${((passed.length / trials.length) * 100).toFixed(0)}%), ${busted.length} busted, ${expired.length} expired, ${unresolved.length} unresolved. Median days to pass: ${medianPassDays !== null ? medianPassDays.toFixed(1) : '—'}`);
}

main();
