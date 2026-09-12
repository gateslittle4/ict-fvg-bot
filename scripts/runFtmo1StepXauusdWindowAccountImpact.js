#!/usr/bin/env node
// runFtmo1StepXauusdWindowAccountImpact.js
// Usage: node scripts/runFtmo1StepXauusdWindowAccountImpact.js <dir-with-csvs>
//
// Direct follow-up (2026-09-12) to the US500 window check: Esdras asked
// "teste XAUUSD aussi sur 8h-12h." XAUUSD's production window is the
// London-NY overlap 7h-10h, NOT the Silver Bullet 10h-11h used by
// US100/US500 - that's the real baseline here, not an arbitrary choice.
// XAUUSD has no validated multi-touch (CONFIG.fvg.perSymbol.XAUUSD.multiTouch
// is unset) and uses stopMode 'swing' (not 'fvg-edge') - this tests the REAL
// production single-touch engine for XAUUSD, only varying the session
// window (8h-12h vs the current 7h-10h vs no window at all).
//
// Same account-simulation scope as runFtmo1StepUS100OnlyAccountImpact.js:
// XAUUSD FVG alone, no Divergence/other instruments, FTMO 1-Step rules
// (single +10% target, TRAILING 10% max loss off the highest balance ever
// reached).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeStop } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine } from '../src/backtest/gridRunner.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const TRAILING_MAX_LOSS_PCT = 10;
const CHALLENGE_TARGET_MULTIPLE = 1.10;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const FVG_SYMBOLS = ['XAUUSD'];
const WINDOW_7_10 = { startHour: 7, endHour: 10 };
const WINDOW_8_12 = { startHour: 8, endHour: 12 };

// Read directly from production config - no local re-typed copy to drift out of sync.
// sessionWindow is reassigned in main() between the two full runs below.
const FVG_CONFIG = {};
for (const symbol of FVG_SYMBOLS) {
  FVG_CONFIG[symbol] = { ...CONFIG.fvg.perSymbol[symbol], spread: DEFAULT_SPREADS[symbol] };
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(m15CandlesBySymbolFull, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();

  const m15BySymbol = {};
  for (const symbol of FVG_SYMBOLS) {
    m15BySymbol[symbol] = (m15CandlesBySymbolFull[symbol] || []).filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  if (FVG_SYMBOLS.every((s) => m15BySymbol[s].length < 50)) return null;

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engines = {};
  for (const symbol of FVG_SYMBOLS) {
    if (m15BySymbol[symbol].length === 0) continue;
    // XAUUSD has no validated multi-touch - always the production single-touch engine.
    const { engine } = buildFilteredEngine(m15BySymbol[symbol], symbol, FVG_CONFIG[symbol]);
    engines[symbol] = engine;
  }

  const timeline = [];
  for (const symbol of FVG_SYMBOLS) for (const candle of m15BySymbol[symbol]) timeline.push({ symbol, candle });
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
  const symbolIndex = {}; for (const s of FVG_SYMBOLS) symbolIndex[s] = -1;
  const formationIndexBySymbol = {}; for (const s of FVG_SYMBOLS) formationIndexBySymbol[s] = new Map();

  let totalTrades = 0, wins = 0, resolvedCount = 0;

  const resolveClose = (symbol, netR, exitTime, riskAmount, outcome) => {
    const pnl = riskAmount * netR;
    balance += pnl;
    peak = Math.max(peak, balance);
    staticMin = Math.min(staticMin, balance);
    const ddPct = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, ddPct);
    guardrail.recordTrade({ pnl, time: exitTime, balanceAfter: balance });
    totalTrades++;
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
          legR = signedMove / openF.distance; outcome = 'timeout';
        }
        const costR = spread > 0 ? spread / openF.distance : 0;
        resolveClose(symbol, legR - costR, candle.time, openF.riskAmount, outcome);
        openFvg[symbol] = null;
      }
    }

    const events = engines[symbol].processCandle(candle);
    for (const e of events) {
      if (e.type === 'watching') {
        formationIndexBySymbol[symbol].set(e.id, i);
      } else if (e.type === 'validated' && !openFvg[symbol]) {
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
  }

  const firstTime = timeline[0].candle.time;
  return {
    trades: totalTrades,
    winRate: resolvedCount > 0 ? wins / resolvedCount : null,
    staticDrawdownPct: ((STARTING_BALANCE - staticMin) / STARTING_BALANCE) * 100,
    trailingDrawdownPct: maxDrawdownPct,
    busted, bustDate,
    challengeDays: challengePoint ? daysBetween(firstTime, challengePoint.time) : null,
    challengeLabel: challengePoint ? `jour ${daysBetween(firstTime, challengePoint.time)}` : 'jamais',
    finalBalance: balance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.challengeLabel} | $${r.finalBalance.toFixed(0)} |`;
}

function runAllYears(m15CandlesBySymbolFull) {
  const results = {};
  for (const year of YEARS) {
    results[year] = simulateYear(m15CandlesBySymbolFull, year);
  }
  return results;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFtmo1StepXauusdWindowAccountImpact.js <dir-with-csvs>'); process.exit(1); }

  const m15CandlesBySymbolFull = {};
  for (const symbol of FVG_SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    m15CandlesBySymbolFull[symbol] = candles;
  }

  const md = [];
  md.push('# FTMO 1-Step, XAUUSD FVG seul — 8h-12h vs 7h-10h (moteur single-touch, celui réellement en production)');
  md.push('');
  md.push(
    `Suite directe de la vérification US500 (2026-09-12) : "teste XAUUSD aussi sur 8h-12h." XAUUSD tourne sur ` +
      "7h-10h (London-NY overlap) en production, pas 10h-11h - c'est sa vraie fenêtre de référence ici. XAUUSD " +
      "n'a pas de multi-contact validé non plus, donc ce script utilise le moteur single-touch RÉELLEMENT en " +
      "production (`CONFIG.fvg.perSymbol.XAUUSD`, stop `swing`, RR=4), seule la fenêtre horaire change entre les " +
      "deux passages. XAUUSD FVG seul, aucune autre source, pour isoler exactement l'effet de la fenêtre."
  );
  md.push('');

  FVG_CONFIG.XAUUSD.sessionWindow = WINDOW_7_10;
  const results710 = runAllYears(m15CandlesBySymbolFull);
  md.push('## 7h-10h (fenêtre production actuelle)');
  md.push('');
  md.push('| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    md.push(fmtRow(year, results710[year]));
    console.error(`[7h-10h] ${year}: ${results710[year] ? results710[year].trades + ' trades, ' + results710[year].challengeLabel + (results710[year].busted ? ' BUSTÉ ' + results710[year].bustDate : '') : 'skip'}`);
  }
  md.push('');

  FVG_CONFIG.XAUUSD.sessionWindow = WINDOW_8_12;
  const results812 = runAllYears(m15CandlesBySymbolFull);
  md.push('## 8h-12h');
  md.push('');
  md.push('| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% trailing)? | Challenge complété (+10%) | Solde final |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const year of YEARS) {
    md.push(fmtRow(year, results812[year]));
    console.error(`[8h-12h] ${year}: ${results812[year] ? results812[year].trades + ' trades, ' + results812[year].challengeLabel + (results812[year].busted ? ' BUSTÉ ' + results812[year].bustDate : '') : 'skip'}`);
  }
  md.push('');

  md.push('## Comparaison directe');
  md.push('');
  md.push('| Année | Jour de passage 7h-10h | Jour de passage 8h-12h | Drawdown trailing max 7h-10h | Drawdown trailing max 8h-12h |');
  md.push('|---|---|---|---|---|');
  const testDays710 = [], testDays812 = [];
  for (const year of YEARS) {
    const a = results710[year], b = results812[year];
    if (!a || !b) continue;
    if (TRAIN_YEARS.has(year) === false) {
      if (a.challengeDays !== null) testDays710.push(a.challengeDays);
      if (b.challengeDays !== null) testDays812.push(b.challengeDays);
    }
    md.push(
      `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${a.challengeLabel} (DD ${a.trailingDrawdownPct.toFixed(1)}%, busté: ${a.busted ? 'OUI' : 'non'}) | ` +
        `${b.challengeLabel} (DD ${b.trailingDrawdownPct.toFixed(1)}%, busté: ${b.busted ? 'OUI' : 'non'}) | ${a.trailingDrawdownPct.toFixed(1)}% | ${b.trailingDrawdownPct.toFixed(1)}% |`
    );
  }
  md.push('');
  const avg710 = testDays710.length ? testDays710.reduce((s, d) => s + d, 0) / testDays710.length : null;
  const avg812 = testDays812.length ? testDays812.reduce((s, d) => s + d, 0) / testDays812.length : null;
  const worstDD710 = Math.max(...YEARS.map((y) => results710[y]?.trailingDrawdownPct ?? 0));
  const worstDD812 = Math.max(...YEARS.map((y) => results812[y]?.trailingDrawdownPct ?? 0));
  const bustedAny812 = YEARS.some((y) => results812[y]?.busted);
  const bustedAny710 = YEARS.some((y) => results710[y]?.busted);
  md.push(
    `**Verdict** : moyenne test (2024-2025) — 7h-10h ${avg710 !== null ? avg710.toFixed(0) + ' jours' : 'jamais complété'}, ` +
      `8h-12h ${avg812 !== null ? avg812.toFixed(0) + ' jours' : 'jamais complété'}. Drawdown trailing max sur les 7 ans — ` +
      `7h-10h ${worstDD710.toFixed(1)}% (busté: ${bustedAny710 ? 'oui' : 'non'}), 8h-12h ${worstDD812.toFixed(1)}% (busté: ${bustedAny812 ? 'oui' : 'non'}).`
  );

  const outMd = path.join(dir, 'ftmo-1step-xauusd-window-account-impact.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
