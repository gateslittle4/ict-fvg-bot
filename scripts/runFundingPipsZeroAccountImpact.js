#!/usr/bin/env node
// runFundingPipsZeroAccountImpact.js
// Usage: node scripts/runFundingPipsZeroAccountImpact.js <dir-with-csvs>
//
// Same validated combo as runFtmo1StepAccountImpact.js (FVG on
// US100+US500+XAUUSD + Divergence US100/US500, same netting rule), re-run
// against FundingPips "Zero" (instant-funded model) rules instead of FTMO
// 1-Step's, at Esdras's explicit request ("check funding pip zero model
// pour voir si le bot se serait fonctionné").
//
// ⚠ RULES SOURCE CAVEAT, stated plainly rather than hidden: this session's
// direct WebFetch access to fundingpips.com/help.fundingpips.com/every
// 3rd-party review site was BLOCKED by this environment's network egress
// policy (confirmed - not just slow/failed once). The numbers below come
// from two independent WebSearch result summaries that agreed with each
// other, NOT a primary-source fetch. Treat this as a first estimate, not a
// verified fact - re-check against fundingpips.com/help.fundingpips.com
// directly before trusting this for real capital, same "VERIFY" discipline
// already applied elsewhere in this project (e.g. transactionCosts.js's
// DEFAULT_SPREADS).
//
// Rules modeled (per that search):
//   - NO profit target - Zero is instant-funded, no challenge phase to pass.
//     (challengeLabel tracking from the FTMO script is dropped - irrelevant here.)
//   - 5% trailing drawdown off the equity high-water-mark, but - per the
//     search summary - it "locks at the starting size": interpreted here as
//     the floor being capped at the STARTING balance once trailing 5% below
//     peak would otherwise exceed it (a well-known FundingPips-style
//     mechanic: the floor stops chasing peak equity once you're
//     comfortably profitable, unlike FTMO's forever-rising trailing floor).
//     floor = min(peak * (1 - 0.05), STARTING_BALANCE). THIS SPECIFIC
//     INTERPRETATION IS UNVERIFIED (see caveat above) - flagged in the
//     output table too.
//   - 3% daily loss limit - our own guardrail (CONFIG.guardrails.dailyLossLimitPct,
//     currently 2%) stays UNCHANGED and is already stricter, same
//     "conservative underestimate" reasoning as the FTMO script.
//   - 1% Max Open Risk Limit - the genuinely NEW constraint this script
//     exists to check: total risk committed across ALL simultaneously open
//     positions, as a % of current balance, capped at 1%. At 0.5% risk per
//     trade with up to 4 symbols able to hold a position at once (FVG x3 +
//     Divergence, one per instrument under netting), the THEORETICAL worst
//     case is 2% aggregate - double the limit - if all 4 ever fire at once.
//     This script tracks the REAL historical peak, not the theoretical one.
//   - Consistency score (15%) / 7 profitable days per 30 / 3% safety cushion
//     are payout-eligibility rules, not bust conditions - NOT modeled here
//     (would need a payout-request simulation, a different question from
//     "does the account survive").

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
const TRAILING_MAX_LOSS_PCT = 5; // FundingPips Zero (unverified, see header caveat)
const MAX_OPEN_RISK_PCT = 1; // FundingPips Zero's own limit - what this script actually checks
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
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
  let maxOpenRiskPct = 0; // the actual thing this script exists to measure
  let openRiskBreaches = 0; // how many times it would have EXCEEDED FundingPips Zero's 1% cap

  const openFvg = {}; for (const s of FVG_SYMBOLS) openFvg[s] = null;
  let openDivergence = null;
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0;
  let wins = 0;
  let resolvedCount = 0;
  let fvgTrades = 0;
  let goldTrades = 0;
  let divTrades = 0;
  let weekendSpanningTrades = 0; // FundingPips Zero prohibits holding ANY position over the weekend - real compliance question, not a risk-sizing one

  const currentOpenRiskPct = () => {
    let riskSum = 0;
    for (const s of FVG_SYMBOLS) if (openFvg[s]) riskSum += openFvg[s].riskAmount;
    if (openDivergence) riskSum += openDivergence.riskAmount;
    return balance > 0 ? (riskSum / balance) * 100 : 0;
  };

  // A trade "spans the weekend" if any UTC calendar date between its entry and exit
  // (inclusive) is a Saturday or Sunday - markets are closed those days regardless of
  // instrument, so a position still open at that point was held THROUGH the pause, not
  // just near it. Simple day-by-day walk, not gap-detection - correct regardless of the
  // NWOG/NDOG "convention HistData" timestamp offset question (this only cares about
  // calendar dates, not session hours).
  const DAY_MS = 24 * 60 * 60 * 1000;
  const spansWeekend = (entryTime, exitTime) => {
    for (let t = entryTime - (entryTime % DAY_MS); t <= exitTime; t += DAY_MS) {
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) return true;
    }
    return false;
  };

  const resolveClose = (symbol, netR, entryTime, exitTime, riskAmount, isDivergence, outcome) => {
    if (spansWeekend(entryTime, exitTime)) weekendSpanningTrades++;
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const floor = Math.min(peak * (1 - TRAILING_MAX_LOSS_PCT / 100), STARTING_BALANCE);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
    if (isDivergence) divTrades++;
    else if (symbol === 'XAUUSD') goldTrades++;
    else fvgTrades++;
    if (outcome !== 'timeout') { resolvedCount++; if (outcome === 'win') wins++; }

    if (balance < floor && !busted) { busted = true; bustDate = fmtDate(exitTime); }
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
        resolveClose(symbol, legR - costR, openF.entryTime, candle.time, openF.riskAmount, false, outcome);
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
        resolveClose(symbol, legR - costR, openDivergence.entryTime, candle.time, openDivergence.riskAmount, true, outcome);
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

    // Check aggregate open risk AFTER every open/close event on this candle - this is the
    // actual thing FundingPips Zero's 1% Max Open Risk Limit would police in real time.
    const openRiskNow = currentOpenRiskPct();
    maxOpenRiskPct = Math.max(maxOpenRiskPct, openRiskNow);
    if (openRiskNow > MAX_OPEN_RISK_PCT) openRiskBreaches++;
  }

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
    finalBalance: balance,
    maxOpenRiskPct,
    openRiskBreaches,
    weekendSpanningTrades,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  const riskCell = r.maxOpenRiskPct > MAX_OPEN_RISK_PCT ? `**${r.maxOpenRiskPct.toFixed(2)}%** (${r.openRiskBreaches}x)` : `${r.maxOpenRiskPct.toFixed(2)}%`;
  const weekendCell = r.weekendSpanningTrades > 0 ? `**${r.weekendSpanningTrades}**` : '0';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades} FVG-idx + ${r.goldTrades} FVG-or + ${r.divTrades} div.) | ${wr} | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${riskCell} | ${weekendCell} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFundingPipsZeroAccountImpact.js <dir-with-csvs>');
    process.exit(1);
  }

  const m15CandlesBySymbolFull = {};
  for (const symbol of ['US100', 'US500', 'XAUUSD']) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
  }
  const divergenceCandidatesFull = computeDivergenceCandidates(m15CandlesBySymbolFull.US100, m15CandlesBySymbolFull.US500);

  const md = [];
  md.push('# Impact au niveau du COMPTE — même setup validé (FVG US100+US500+OR + Divergence, netting), sous les règles FundingPips Zero');
  md.push('');
  md.push(
    "⚠ **Règles NON vérifiées à la source primaire** (fundingpips.com/help.fundingpips.com bloqués par la politique " +
      "réseau de cette session, confirmé après plusieurs tentatives) — synthétisées depuis deux recherches web " +
      "indépendantes qui convergent, pas une lecture directe de la page officielle. À reconfirmer avant de faire " +
      "confiance à ce chiffre pour du capital réel. Modélisé : PAS de cible de profit (financement instantané), " +
      "perte max TRAILING 5% depuis le plus haut solde atteint MAIS plafonnée au solde de départ une fois ce seuil " +
      "dépassé (interprétation de \"locks at the starting size\", elle-même non vérifiée), perte quotidienne max 3% " +
      "(notre propre garde-fou à 2% reste plus strict, donc ce test sous-estime la marge réelle). **Nouveauté testée " +
      "ici** : la limite de risque ouvert total de FundingPips Zero (1% du solde, tous symboles confondus à tout " +
      "instant) — jamais vérifiée avant, potentiellement incompatible avec ce bot qui peut avoir jusqu'à 4 positions " +
      "ouvertes simultanément (FVG x3 + Divergence, une par instrument) à 0.5% chacune. Score de consistance (15%), " +
      "7 jours profitables/30, coussin de sécurité 3% : règles de retrait, pas de survie du compte — PAS modélisées " +
      "ici (question différente)."
  );
  md.push('');
  md.push('| Année | Trades (détail) | Win rate | Drawdown trailing max | Busté (-5% trailing, plafonné au solde de départ)? | Risque ouvert max (limite 1%) | Trades traversant un week-end (interdit sur Zero) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades, risque ouvert max ' + r.maxOpenRiskPct.toFixed(2) + '%, solde $' + r.finalBalance.toFixed(0) + (r.busted ? ' BUSTÉ ' + r.bustDate : '') : 'skip'}`);
  }

  const outMd = path.join(dir, 'fundingpips-zero-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
