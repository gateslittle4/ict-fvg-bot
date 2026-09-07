#!/usr/bin/env node
// runFtmo1StepAccountImpact.js
// Usage: node scripts/runFtmo1StepAccountImpact.js <dir-with-csvs>
//
// Same validated 4-source combined engine as
// combined-with-gold-netted-account-impact.md (FVG on US100+US500+XAUUSD +
// Divergence US100/US500, netting rule so at most one position per
// instrument regardless of source), but re-targeted at FTMO's actual
// 1-Step challenge rules instead of FundingPips' 2-Step ones, since that's
// the product actually being considered now:
//   - ONE profit target only, +10% of starting balance - no Phase 2.
//   - Max total loss is a TRAILING limit off the highest balance ever
//     reached (not static off the starting balance) - confirmed via
//     ftmo.com/en/trading-objectives/, Sept 2026. This is what
//     `trailingDrawdownPct` was already tracking; the bust check now uses
//     it instead of the static-from-start measure FundingPips' 2-Step uses.
//   - Max daily loss for FTMO 1-Step is 3% - our own guardrail
//     (CONFIG.guardrails.dailyLossLimitPct, currently 2%) is left
//     UNCHANGED and is *stricter* than what FTMO actually allows, so this
//     run is, if anything, a conservative underestimate of how much room
//     there really is day-to-day.
//   - No minimum trading days, no time limit - both already established
//     for FTMO 1-Step, nothing to encode here.

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
const RISK_PCT = 0.5;
const TRAILING_MAX_LOSS_PCT = 10; // FTMO 1-Step: equity can't drop >10% below the highest balance ever reached
const CHALLENGE_TARGET_MULTIPLE = 1.10; // FTMO 1-Step: single +10% target, no Phase 2
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  // XAUUSD: picked by TRAIN ranking in full-session-grid-search-gold.md (#3: best test PF/R among configs that "tient") -
  // note the different session window (London-NY overlap, not Silver Bullet) and swing stop (not fvg-edge) - gold's
  // own best combo, not just copy-pasted from the indices.
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};

// ---- Divergence candidate-entry precomputation (same logic/params as runDivergenceAccountImpact.js) ----
const DIV_LOOKBACK = 100;
const DIV_Z_THRESHOLD = 2;
const DIV_ATR_PERIOD = 14;
const DIV_RR_MULTIPLE = 3;
const DIV_MAX_HOLDING_M15_CANDLES = 480; // 120 H1 candles x 4, same convention as FVG's own 480 M15 timeout

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

// computeZScoreSeries / alignByTime now shared from src/backtest/correlation.js
// (extracted 2026-09, see test/correlation.test.js) - was duplicated and
// untested here before.

/** @returns {Array<{entryTime:number, symbol:string, stopDistance:number}>} candidate divergence entries, keyed by the M15 candle time they'd fill at (= the H1 entry candle's own start time, always a valid M15 boundary) */
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

function simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

  const m15BySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    m15BySymbol[symbol] = (m15CandlesBySymbolFull[symbol] || []).filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  if (FVG_SYMBOLS.every((s) => m15BySymbol[s].length < 50)) return null;

  const divCandidatesByTime = new Map(); // symbol -> Map(time -> candidate), for O(1) lookup while walking
  for (const symbol of ['US100', 'US500']) divCandidatesByTime.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) {
    if (cand.entryTime >= yearStart && cand.entryTime < yearEnd) {
      divCandidatesByTime.get(cand.symbol).set(cand.entryTime, cand);
    }
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

  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null; // { symbol, entryIndex, entryTime, entryPrice, stopPrice, targetPrice, distance }
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0;
  let wins = 0;
  let resolvedCount = 0;
  let fvgTrades = 0; // FVG trades on US100+US500 (the original two indices)
  let goldTrades = 0; // FVG trades on XAUUSD specifically
  let divTrades = 0;

  const resolveClose = (symbol, netR, exitTime, riskAmount, isDivergence, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    if (isDivergence) divTrades++;
    else if (symbol === 'XAUUSD') goldTrades++;
    else fvgTrades++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }

    // FTMO 1-Step bust rule: TRAILING off the highest balance ever reached, not static off the
    // starting balance - `ddPct` (computed above from `peak`) IS that trailing measure already.
    if (ddPct >= TRAILING_MAX_LOSS_PCT && !busted) { busted = true; bustDate = fmtDate(exitTime); }
    if (!challengePoint && balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE) {
      challengePoint = { time: exitTime, balance };
    }
  };

  for (const { symbol, candle } of timeline) {
    if (busted) break;
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
        resolveClose(symbol, legR - costR, candle.time, openF.riskAmount, false, outcome);
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
        resolveClose(symbol, legR - costR, candle.time, openDivergence.riskAmount, true, outcome);
        openDivergence = null;
      }
    }

    // 3) Feed candle to the FVG engine -> maybe open a new FVG trade.
    // NETTING RULE: don't open an FVG position on `symbol` while a Divergence position is
    // already open on that SAME symbol - one open position per instrument, whichever source
    // got there first blocks the other until it closes. Prevents doubling exposure on one
    // instrument across the two sources (the "known simplification" flagged in earlier runs).
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

    // 4) Check for a Divergence candidate entry trigger on this exact candle/symbol (divergence is scoped to US100/US500 only - no map entry exists for XAUUSD).
    // Same netting rule, mirrored: don't open Divergence on `symbol` while an FVG position is already open on it.
    const divMap = divCandidatesByTime.get(symbol);
    const cand = divMap ? divMap.get(candle.time) : undefined;
    if (cand && !openDivergence && !openFvg[symbol]) {
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
  }

  const firstTime = timeline[0].candle.time;
  return {
    trades: totalTrades,
    fvgTrades,
    goldTrades,
    divTrades,
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
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades} FVG-idx + ${r.goldTrades} FVG-or + ${r.divTrades} div.) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFtmo1StepAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15CandlesBySymbolFull = {};
  for (const symbol of ['US100', 'US500', 'XAUUSD']) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
  }
  console.error(`XAUUSD candles loaded: ${m15CandlesBySymbolFull.XAUUSD.length} (expect a 2022 gap - that year's raw data was never sourced)`);
  const divergenceCandidatesFull = computeDivergenceCandidates(m15CandlesBySymbolFull.US100, m15CandlesBySymbolFull.US500);
  console.error(`Divergence candidates precomputed: ${divergenceCandidatesFull.length}`);

  const md = [];
  md.push('# Impact au niveau du COMPTE — même setup validé (FVG US100+US500+OR + Divergence, netting), sous les règles FTMO 1-Step');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, un seul budget de garde-fous PARTAGÉ entre les 4 sources de signaux (US100-FVG, ` +
      'US500-FVG, XAUUSD-FVG, Divergence US100/US500), netting même-instrument actif (au plus une position par ' +
      "instrument, peu importe la source). Notre propre garde-fou de perte quotidienne (2%, INCHANGÉ) reste plus " +
      "strict que la limite réelle de FTMO 1-Step (3%) - donc ce test sous-estime plutôt la marge réelle. " +
      "**Cible = +10% une seule fois (FTMO 1-Step), pas de Phase 2.** **Perte totale max = TRAILING sur le plus " +
      "haut solde jamais atteint (10%), pas statique sur le solde de départ** - règle confirmée sur " +
      "ftmo.com/en/trading-objectives/ (sept. 2026); c'est une mesure plus stricte que le 10-12% statique de " +
      "FundingPips utilisé dans les runs précédents, donc le nombre de bustés peut différer même à stratégie " +
      "identique. XAUUSD-FVG = config choisie par classement TRAIN seul (fenêtre Londres-NY 07h-10h, H4_EMA20, stop " +
      "swing, 1:3). Divergence = config choisie par classement TRAIN seul (lookback 100, seuil z=2), scope " +
      "US100/US500 uniquement. Donnée XAUUSD manque l'année 2022 (zip source jamais fourni)."
  );
  md.push('');
  md.push('| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades (' + r.fvgTrades + ' FVG-idx + ' + r.goldTrades + ' FVG-or + ' + r.divTrades + ' div), solde $' + r.finalBalance.toFixed(0) : 'skip'}`);
  }

  const outMd = path.join(dir, 'ftmo-1step-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
