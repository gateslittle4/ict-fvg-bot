#!/usr/bin/env node
// monthlyStartAnalysisWithGbpusd.js
// Usage: node scripts/monthlyStartAnalysisWithGbpusd.js
//
// Esdras: "Test avec GBPUSD aussi dans le combo" - direct follow-up to
// HANDOFF.md's GBPUSD research (2026-09-16, commit a96f65e): GBPUSD was
// found viable via the FVG mechanism with a NON-DEFAULT config (H4_EMA20,
// stopMode 'swing', rrMultiple 3, structureEnabled true, sessionWindow
// 7h-10h NY overlap instead of the standard 8h-12h grid, liquiditySweep
// OFF) - robust across 3 train/test splits and 6/7 individual years, but
// CONDITIONAL on picking a prop firm with a STATIC drawdown floor (trailing
// drawdown 13-16% exceeds a 10% trailing cap like FTMO 1-Step).
//
// This is the SAME monthly-reset test as monthlyStartAnalysis.js (17-year
// combo, $10,000 reset each calendar month, reports R units + time to +10%)
// but with GBPUSD ADDED to the real combo using that exact validated config
// - to compare directly against the 5-symbol baseline already reported.
//
// GBPUSD.csv only covers 2019-2025 (7 years, like EURUSD) - shorter than
// the other 5 symbols' 2009/2010-2025 window. No artificial homogenization -
// GBPUSD trades only appear in months where its own data exists, exactly
// like EURUSD/Judas Swing's existing precedent in buildBacktestSummary.js.
//
// Research only - config.js is NOT touched by this script. GBPUSD's config
// below is copied verbatim from HANDOFF.md's "Config retenue pour GBPUSD"
// line, not re-tuned here.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40', 'GBPUSD'];
const CSV_DIR = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-input');
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const STARTING_BALANCE = 10000;
const TARGET_PROFIT = 1000; // 10% of $10,000
const RISK_PCT_PER_TRADE = 0.5; // challenge mode, compounding

// Copied verbatim from HANDOFF.md's "Config retenue pour GBPUSD (si activé)"
// line (2026-09-16 research entry) - NOT re-tuned here.
const GBPUSD_FVG_CONFIG = {
  variant: 'H4_EMA20',
  stopMode: 'swing',
  rrMultiple: 3,
  structureEnabled: true,
  sessionEnabled: true,
  sessionWindow: { startHour: 7, endHour: 10 },
  liquiditySweepEnabled: false,
};

function replayAll() {
  const historyBySymbol = {};
  let earliestTime = Infinity;
  let latestTime = -Infinity;
  for (const symbol of REAL_SYMBOLS) {
    const candles = loadCandlesFromCsv(path.join(CSV_DIR, `${symbol}.csv`)).candles;
    historyBySymbol[symbol] = candles;
    earliestTime = Math.min(earliestTime, candles[0].time);
    latestTime = Math.max(latestTime, candles[candles.length - 1].time);
  }
  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const fvgConfigRealOnly = { ...CONFIG.fvg.perSymbol };
  delete fvgConfigRealOnly.BTCUSD;
  fvgConfigRealOnly.GBPUSD = GBPUSD_FVG_CONFIG;
  const engine = new LiveStrategyEngine({
    symbols: REAL_SYMBOLS,
    fvgConfig: fvgConfigRealOnly,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
    pyramidConfig: CONFIG.pyramid,
  });
  const openById = new Map();
  const trades = [];
  engine.warmUp(historyBySymbol, {
    onEvent: (e) => {
      if (!e) return;
      if (e.type === 'validated' && !e.blockedReason) { openById.set(e.id, e); return; }
      if (e.type !== 'closed') return;
      const opened = openById.get(e.id);
      if (!opened) return;
      openById.delete(e.id);
      trades.push({
        symbol: e.symbol,
        source: opened.source,
        entryTime: opened.validatedAt,
        exitTime: e.exitTime,
        outcome: e.outcome,
        rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
      });
    },
  });
  trades.sort((a, b) => a.entryTime - b.entryTime);
  return { trades, earliestTime, latestTime };
}

function simulateFromMonthStart(trades, year, month) {
  const monthStartTime = Date.UTC(year, month, 1);
  const monthEndTime = Date.UTC(year, month + 1, 1);

  const monthTrades = trades.filter((t) => t.exitTime >= monthStartTime && t.exitTime < monthEndTime);
  if (monthTrades.length === 0) return null;

  const firstTradeTime = monthTrades[0].exitTime;

  let balance = STARTING_BALANCE;
  let totalR = 0;
  let tradesCount = 0;
  let targetReachedAt = null;
  let targetReachedTradeCount = 0;
  let targetReachedDays = null;

  for (const t of monthTrades) {
    if (targetReachedAt) break;

    const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
    const pnl = riskAmount * (t.rMultiple || 0);
    balance += pnl;
    totalR += (t.rMultiple || 0);
    tradesCount++;

    if (balance - STARTING_BALANCE >= TARGET_PROFIT) {
      targetReachedAt = t.exitTime;
      targetReachedTradeCount = tradesCount;
      targetReachedDays = Math.round((t.exitTime - firstTradeTime) / 86400000);
    }
  }

  return {
    monthStart: monthStartTime,
    hasData: true,
    targetReached: targetReachedAt !== null,
    rUnits: Math.round(totalR * 100) / 100,
    daysToTarget: targetReachedDays,
    tradesToTarget: targetReachedTradeCount,
    finalBalance: Math.round(balance * 100) / 100,
    totalTrades: tradesCount,
  };
}

function main() {
  const { trades, earliestTime, latestTime } = replayAll();

  const years = new Set(trades.map((t) => new Date(t.exitTime).getUTCFullYear()));
  const yearsSorted = [...years].sort((a, b) => a - b);

  console.log(`\n=== Analyse par mois avec reset $10,000 - COMBO + GBPUSD (${yearsSorted[0]}-${yearsSorted[yearsSorted.length - 1]}) ===\n`);
  console.log(`Total trades replayés : ${trades.length} (dont GBPUSD : ${trades.filter((t) => t.symbol === 'GBPUSD').length})`);
  console.log(`Période : ${new Date(earliestTime).toISOString().slice(0, 10)} -> ${new Date(latestTime).toISOString().slice(0, 10)}`);
  console.log(`GBPUSD lui-même : ${new Date(Math.min(...trades.filter((t) => t.symbol === 'GBPUSD').map((t) => t.entryTime))).toISOString().slice(0, 10)} -> ${new Date(Math.max(...trades.filter((t) => t.symbol === 'GBPUSD').map((t) => t.exitTime))).toISOString().slice(0, 10)} (7 ans, pas 17 - même limite que EURUSD)\n`);

  const resultsByMonth = Array.from({ length: 12 }, () => []);

  for (const year of yearsSorted) {
    for (let month = 0; month < 12; month++) {
      const result = simulateFromMonthStart(trades, year, month);
      if (result && result.hasData) {
        resultsByMonth[month].push(result);
      }
    }
  }

  console.log('Mois | Années | Cible atteinte | Jours moyen | Trades moyen | R total moyen | Plus rapide (jours) | Plus lent (jours)');
  console.log('—————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————————');

  for (let month = 0; month < 12; month++) {
    const results = resultsByMonth[month];
    if (results.length === 0) continue;

    const reached = results.filter((r) => r.targetReached);
    const reachedPct = (100 * reached.length / results.length).toFixed(0);

    if (reached.length === 0) {
      console.log(`${MONTH_NAMES[month]} | ${results.length} | 0/${results.length} (0%) | — | — | — | — | —`);
    } else {
      const avgDays = (reached.reduce((s, r) => s + (r.daysToTarget || 0), 0) / reached.length).toFixed(1);
      const avgTrades = (reached.reduce((s, r) => s + (r.tradesToTarget || 0), 0) / reached.length).toFixed(1);
      const avgR = (reached.reduce((s, r) => s + r.rUnits, 0) / reached.length).toFixed(2);
      const minDays = Math.min(...reached.map((r) => r.daysToTarget || Infinity));
      const maxDays = Math.max(...reached.map((r) => r.daysToTarget || -Infinity));

      console.log(`${MONTH_NAMES[month]} | ${results.length} | ${reached.length}/${results.length} (${reachedPct}%) | ${avgDays}j | ${avgTrades} | +${avgR}R | ${minDays}j | ${maxDays}j`);
    }
  }

  console.log('\n\n=== Résumé statistique (combo + GBPUSD) ===\n');
  const allResults = resultsByMonth.flat();
  const allReached = allResults.filter((r) => r.targetReached);

  console.log(`Total tentatives (mois) : ${allResults.length}`);
  console.log(`Cible atteinte : ${allReached.length}/${allResults.length} (${(100 * allReached.length / allResults.length).toFixed(1)}%)`);

  if (allReached.length > 0) {
    const avgDaysAll = (allReached.reduce((s, r) => s + (r.daysToTarget || 0), 0) / allReached.length).toFixed(1);
    const avgTradesAll = (allReached.reduce((s, r) => s + (r.tradesToTarget || 0), 0) / allReached.length).toFixed(1);
    const avgRAll = (allReached.reduce((s, r) => s + r.rUnits, 0) / allReached.length).toFixed(2);
    console.log(`Jours moyen à la cible : ${avgDaysAll}j`);
    console.log(`Trades moyen à la cible : ${avgTradesAll}`);
    console.log(`R moyen à la cible : +${avgRAll}R`);
  }

  // GBPUSD's own standalone contribution (isolated from the rest of the combo)
  const gbpusdTrades = trades.filter((t) => t.symbol === 'GBPUSD');
  const gbpusdDecided = gbpusdTrades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  const gbpusdWins = gbpusdDecided.filter((t) => t.outcome === 'win').length;
  const gbpusdR = gbpusdDecided.reduce((s, t) => s + (t.rMultiple || 0), 0);
  console.log(`\n=== Contribution GBPUSD isolée (2019-2025, 7 ans) ===`);
  console.log(`Trades décidés : ${gbpusdDecided.length}, taux de gain : ${(100 * gbpusdWins / gbpusdDecided.length).toFixed(1)}%, total R : ${gbpusdR >= 0 ? '+' : ''}${gbpusdR.toFixed(2)}R`);
}

main();
