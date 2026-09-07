#!/usr/bin/env node
// runCombinedAccountImpact.js
// Usage: node scripts/runCombinedAccountImpact.js <dir-with-csvs>
//
// Runs FVG (US100 + US500, validated setup) AND the divergence strategy
// (lookback=100, threshold=2, picked by TRAIN ranking - see
// divergence-strategy-analysis.md) TOGETHER on one shared account: one
// GuardrailEngine, one balance, one shared max-trades-per-day budget across
// ALL THREE signal sources. This is the direct test of "does adding a
// second, independent edge on the SAME two instruments buy more speed
// without concentrating risk" - the same question a genuinely uncorrelated
// third instrument would answer, but usable today since it needs no new data.
//
// Design (three independent "slots", one position at a time each):
//   - FVG-US100 and FVG-US500: exactly the existing validated engines
//     (buildFilteredEngine), walked candle-by-candle on M15 like
//     portfolioSimulator.js does.
//   - Divergence: candidate entry triggers precomputed ONCE over the whole
//     history from H1 z-score crossings (same logic as
//     runDivergenceAccountImpact.js), each tagged with which symbol (US100
//     or US500) it would trade; resolution (stop/target/timeout) then walks
//     the M15 stream for whichever symbol it's on, for more precise fills
//     than checking only at H1 candle closes.
//   - KNOWN SIMPLIFICATION: the Divergence slot and the FVG slot for the
//     same instrument are tracked independently, so in principle a
//     Divergence-US100 position and an FVG-US100 position could be open at
//     the same time (doubling exposure on that one instrument in this
//     model). Flagged here rather than hidden - a real deployment would
//     need an explicit netting/priority rule between the two.
//   - Same GuardrailEngine config as the live bot (CONFIG.guardrails) -
//     NOT loosened to "make room" for the extra signal source, to see
//     honestly what a shared, unmodified budget does when a much
//     higher-frequency source is added alongside the sparser one.

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
const STATIC_MAX_DD_PCT = 10;
const PHASE1_TARGET_MULTIPLE = 1.08;
const PHASE2_TARGET_MULTIPLE = 1.05;
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
  let phase1Point = null;
  let phase2Point = null;

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

    const staticDdPct = ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100;
    if (staticDdPct >= STATIC_MAX_DD_PCT && !busted) { busted = true; bustDate = fmtDate(exitTime); }
    if (!phase1Point && balance >= STARTING_BALANCE * PHASE1_TARGET_MULTIPLE) phase1Point = { time: exitTime, balance };
    if (phase1Point && !phase2Point && exitTime > phase1Point.time && balance >= phase1Point.balance * PHASE2_TARGET_MULTIPLE) {
      phase2Point = { time: exitTime };
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
    phase1Label: phase1Point ? `jour ${daysBetween(firstTime, phase1Point.time)}` : 'jamais',
    phase2Label: phase2Point ? `jour ${daysBetween(firstTime, phase2Point.time)}` : 'jamais',
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} (${r.fvgTrades} FVG-idx + ${r.goldTrades} FVG-or + ${r.divTrades} div.) | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.phase1Label} | ${r.phase2Label} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runCombinedAccountImpact.js <dir-with-csvs>');
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
  md.push('# Impact au niveau du COMPTE — FVG (US100+US500+OR) + Divergence COMBINÉS, avec netting même-instrument (0.5%/trade)');
  md.push('');
  md.push(
    `⚠ Compte $${STARTING_BALANCE}, un seul budget de garde-fous PARTAGÉ entre les 4 sources de signaux (US100-FVG, ` +
      'US500-FVG, XAUUSD-FVG, Divergence US100/US500), garde-fous INCHANGÉS (max 2 trades/jour, cooldown 30min après ' +
      "perte, perte quotidienne max 2%) - pas assouplis pour laisser plus de place aux sources supplémentaires. " +
      "XAUUSD-FVG = config choisie par classement TRAIN seul dans full-session-grid-search-gold.md (fenêtre Londres-NY " +
      "07h-10h, H4_EMA20, stop swing, 1:3) - fenêtre et mode de stop différents des indices, propres à l'or. Divergence " +
      "= config choisie par classement TRAIN seul (lookback 100, seuil z=2), reste scoping US100/US500 uniquement " +
      "(relation de paire, pas applicable à l'or seul). Donnée XAUUSD manque l'année 2022 (zip source jamais fourni) " +
      "- cette année-là tourne donc sans la source or, comme un rappel de robustesse partielle plutôt qu'un vrai trou. " +
      "RÈGLE DE NETTING (nouveau, corrige la simplification des runs précédents) : au plus UNE position ouverte par " +
      "instrument, tous types confondus - si une position Divergence est déjà ouverte sur US100, une nouvelle " +
      "position FVG-US100 ne peut PAS s'ouvrir tant que la première n'est pas fermée, et vice-versa. Ordre d'arrivée " +
      "(premier arrivé bloque le second), pas de priorité fixe entre les deux sources."
  );
  md.push('');
  md.push('| Année | Trades (détail) | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    const r = simulateYear(m15CandlesBySymbolFull, divergenceCandidatesFull, year);
    md.push(fmtRow(year, r));
    console.error(`${year}: ${r ? r.trades + ' trades (' + r.fvgTrades + ' FVG-idx + ' + r.goldTrades + ' FVG-or + ' + r.divTrades + ' div), solde $' + r.finalBalance.toFixed(0) : 'skip'}`);
  }

  const outMd = path.join(dir, 'combined-with-gold-netted-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
