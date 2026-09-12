#!/usr/bin/env node
// runForwardTestAllLiveStrategiesCycleAnalysis.js
// Usage: node scripts/runForwardTestAllLiveStrategiesCycleAnalysis.js <dir-with-forward-test-csvs>
//
// Esdras (2026-09-12), right after flipping ACCOUNT_MODE=live on Render:
// "dis moi combien de cycle de 10% j'aurais eu pendant les 7 mois que tu
// as les données là." Same reset-on-pass/bust cycle methodology as
// runFtmoAllLiveStrategiesCycleAccountImpact.js, but run on the REAL
// forward-test data (data/forward-test-2026/, live cTrader export,
// 2026-02-05 -> 2026-09-09, ~7 months) instead of the 2018-2025 historical
// CSVs - an actual out-of-sample period that was never used to choose any
// of this config.
//
// SCOPE DIFFERENCE, stated up front: data/forward-test-2026/ has US100,
// US500, XAUUSD candles but NO EURUSD export, so Judas Swing (EURUSD-only)
// cannot be simulated here - this covers FVG (US100 multi-touch 8h-12h,
// US500 10h-11h, XAUUSD 7h-10h) + Divergence (US100/US500) + NWOG (US100)
// only. Documented, not silently dropped.
//
// Reports cycles at BOTH 0.5% (what was actually configured for this whole
// 7-month window, since ACCOUNT_MODE=live/0.3% was only switched on today)
// and 0.3% (the new live default), so the historically-accurate answer and
// the forward-looking one are both visible.

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
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

// No EURUSD forward-test export - Judas Swing excluded, see header note.
const FVG_SYMBOLS = ['US100', 'US500', 'XAUUSD'].filter((s) => CONFIG.fvg.perSymbol[s]);
const DIV_PAIR = CONFIG.divergence.pair;
const NWOG_SYMBOLS = CONFIG.nwog.symbols;
const ALL_SYMBOLS = [...new Set([...FVG_SYMBOLS, ...DIV_PAIR, ...NWOG_SYMBOLS])];

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

const RISK_SCENARIOS = [
  { key: '0.5% (config réelle sur ces 7 mois)', riskPct: 0.5 },
  { key: '0.3% (nouveau défaut "live")', riskPct: 0.3 },
];

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

function makeDivIndex(divergenceCandidatesFull) {
  const bySymbol = new Map();
  for (const symbol of DIV_PAIR) bySymbol.set(symbol, new Map());
  for (const cand of divergenceCandidatesFull) bySymbol.get(cand.symbol).set(cand.entryTime, cand);
  return bySymbol;
}
function divCandidatesByTime(symbol, index, time) { return index.get(symbol)?.get(time); }

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

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

function simulateContinuous({ candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, riskPct }) {
  const engines = buildFvgEngines(candlesBySymbolFull);

  const timeline = [];
  for (const symbol of ALL_SYMBOLS) for (const candle of candlesBySymbolFull[symbol]) timeline.push({ symbol, candle });
  timeline.sort((a, b) => a.candle.time - b.candle.time || a.symbol.localeCompare(b.symbol));
  if (timeline.length === 0) return { cycles: [] };

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  guardrail.setBalance(STARTING_BALANCE, timeline[0].candle.time);

  const openPositions = {}; for (const s of ALL_SYMBOLS) openPositions[s] = null;
  const symbolIndex = {}; for (const s of ALL_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let balance = STARTING_BALANCE;
  let cycleStartTime = timeline[0].candle.time;
  let cyclePeak = STARTING_BALANCE;
  let cycleTrades = 0, cycleWins = 0, cycleResolved = 0;

  const cycles = [];

  const resetCycle = (endTime, outcome, ddPct) => {
    cycles.push({
      startTime: cycleStartTime, endTime, outcome,
      days: daysBetween(cycleStartTime, endTime),
      trades: cycleTrades,
      winRate: cycleResolved > 0 ? cycleWins / cycleResolved : null,
      maxDrawdownPct: ddPct,
    });
    balance = STARTING_BALANCE;
    cyclePeak = STARTING_BALANCE;
    cycleStartTime = endTime;
    cycleTrades = 0; cycleWins = 0; cycleResolved = 0;
    for (const s of ALL_SYMBOLS) openPositions[s] = null;
  };

  const resolveClose = (netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    cyclePeak = Math.max(cyclePeak, balance);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    cycleTrades++;
    if (outcome !== 'timeout') { cycleResolved++; if (outcome === 'win') cycleWins++; }
    const ddPct = cyclePeak > 0 ? ((cyclePeak - balance) / cyclePeak) * 100 : 0;
    const passed = balance >= STARTING_BALANCE * CHALLENGE_TARGET_MULTIPLE;
    const busted = ddPct >= TRAILING_MAX_LOSS_PCT;
    if (passed || busted) resetCycle(exitTime, passed ? 'pass' : 'bust', ddPct);
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
        resolveClose(legR - costR, candle.time, open.riskAmount, outcome);
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
            distance, rrMultiple: FVG_CONFIG[symbol].rrMultiple, riskAmount: balance * (riskPct / 100), maxHoldingCandles: 480,
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
            rrMultiple: DIV_RR_MULTIPLE, riskAmount: balance * (riskPct / 100), maxHoldingCandles: DIV_MAX_HOLDING_CANDLES,
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
            distance, rrMultiple: NWOG_RR, riskAmount: balance * (riskPct / 100), maxHoldingCandles: NWOG_MAX_HOLDING,
          };
        }
      }
    }
  }

  return { cycles };
}

function fmtCycleRow(n, c) {
  const outcomeCell = c.outcome === 'pass' ? '✅ pass' : '❌ **bust**';
  const wr = c.winRate !== null ? (c.winRate * 100).toFixed(1) + '%' : '—';
  return `| ${n} | ${fmtDate(c.startTime)} → ${fmtDate(c.endTime)} | ${c.days}j | ${c.trades} | ${wr} | ${c.maxDrawdownPct.toFixed(1)}% | ${outcomeCell} |`;
}

function main() {
  const dir = process.argv[2] || 'data/forward-test-2026';

  const candlesBySymbolFull = {};
  for (const symbol of ALL_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    candlesBySymbolFull[symbol] = candles;
  }

  const divergenceCandidatesFull = makeDivIndex(computeDivergenceCandidates(candlesBySymbolFull.US100, candlesBySymbolFull.US500));
  const nwogCandidatesFull = computeNwogCandidatesMap(candlesBySymbolFull.US100);

  const firstTime = Math.min(...ALL_SYMBOLS.map((s) => candlesBySymbolFull[s][0]?.time).filter(Number.isFinite));
  const lastTime = Math.max(...ALL_SYMBOLS.map((s) => candlesBySymbolFull[s].at(-1)?.time).filter(Number.isFinite));

  const md = [];
  md.push('# Combien de cycles de +10% sur les 7 mois de forward-test réel (US100+US500+XAUUSD, sans EURUSD)');
  md.push('');
  md.push(
    `Esdras, juste après avoir basculé \`ACCOUNT_MODE=live\` sur Render : "dis-moi combien de cycle de 10% j'aurais eu ` +
      `pendant les 7 mois que tu as les données là." Même méthode reset-au-+10%/bust que le test combiné (voir ` +
      `ftmo-1step-all-live-strategies-cycle-account-impact.md), mais appliquée aux vraies données forward-test ` +
      `(export cTrader réel, ${fmtDate(firstTime)} → ${fmtDate(lastTime)}) au lieu de l'historique 2018-2025 - une ` +
      `vraie période out-of-sample qui n'a jamais servi à choisir cette config.\n\n` +
      `**Différence de scope à noter** : \`data/forward-test-2026/\` n'a pas d'export EURUSD, donc **Judas Swing ` +
      `est exclu ici** (pas de bug, pas de données pour le simuler) - ce test couvre FVG (US100 multi-contact ` +
      `8h-12h, US500 10h-11h, XAUUSD 7h-10h) + Divergence (US100/US500) + NWOG (US100) seulement.\n\n` +
      `Deux risques comparés : 0.5% (la config qui a réellement tourné pendant ces 7 mois, puisque le mode "live"/` +
      `0.3% vient tout juste d'être activé aujourd'hui) et 0.3% (le nouveau défaut live), pour avoir la réponse ` +
      `historiquement exacte ET la projection avec le nouveau réglage.`
  );
  md.push('');
  md.push('| Risque par trade | Cycles totaux | Passes | Busts | Jours moy. pour passer |');
  md.push('|---|---|---|---|---|');

  const results = [];
  for (const scenario of RISK_SCENARIOS) {
    const { cycles } = simulateContinuous({ candlesBySymbolFull, divergenceCandidatesFull, nwogCandidatesFull, riskPct: scenario.riskPct });
    const passes = cycles.filter((c) => c.outcome === 'pass');
    const busts = cycles.filter((c) => c.outcome === 'bust');
    const avgDays = passes.length ? Math.round(passes.reduce((s, c) => s + c.days, 0) / passes.length) : null;
    results.push({ scenario, cycles, passes, busts, avgDays });
    md.push(`| ${scenario.key} | ${cycles.length} | ${passes.length} | ${busts.length} | ${avgDays ?? '—'} |`);
    console.error(`[${scenario.key}] ${cycles.length} cycles, ${passes.length} pass / ${busts.length} bust, ${avgDays}j moy.`);
  }
  md.push('');

  md.push('## Détail cycle par cycle, à 0.5% (la config réellement active sur ces 7 mois)');
  md.push('');
  md.push('| # | Période | Durée | Trades | Win rate | Drawdown trailing max | Résultat |');
  md.push('|---|---|---|---|---|---|---|');
  results[0].cycles.forEach((c, idx) => md.push(fmtCycleRow(idx + 1, c)));
  if (results[0].cycles.length === 0) md.push('| — | aucun cycle complété (ni +10% ni bust) sur ces 7 mois | | | | | |');
  md.push('');

  const r5 = results[0];
  md.push('## Verdict');
  md.push('');
  if (r5.cycles.length === 0) {
    md.push(
      `Sur ces 7 mois réels, aucun cycle ne s'est complété (ni +10% atteint, ni bust) avec la config qui a réellement ` +
        `tourné (0.5%, source FVG+Divergence+NWOG seulement, pas de Judas Swing faute de données EURUSD). ` +
        `Échantillon nettement plus petit que l'historique 2018-2025 (14 trades sur toute la période, voir results.md) - ` +
        `pas assez de volume pour compléter un cycle de +10% dans cette fenêtre, cohérent avec le rythme lent déjà ` +
        `observé sur les données forward-test.`
    );
  } else {
    md.push(
      `Sur ces 7 mois réels, à 0.5% (la config qui a réellement tourné) : **${r5.cycles.length} cycle(s)**, ` +
        `${r5.passes.length} passe(s) et ${r5.busts.length} bust(s). À 0.3% (nouveau défaut live) : ` +
        `${results[1].cycles.length} cycle(s), ${results[1].passes.length} passe(s), ${results[1].busts.length} bust(s). ` +
        `Rappel : Judas Swing (EURUSD) est absent de ce test faute de données forward-test pour cette paire - le ` +
        `chiffre réel (avec Judas Swing) serait probablement un peu plus rapide, comme dans le test combiné complet.`
    );
  }

  const outMd = path.join(dir, 'forward-test-all-live-strategies-cycle-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
