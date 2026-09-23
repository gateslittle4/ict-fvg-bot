#!/usr/bin/env node
// monthlyStartAnalysis.js
// Usage: node scripts/monthlyStartAnalysis.js
//
// Esdras: "Je veux que tu teste Le combo pendant Les 17 ans pour voir sa
// performance, chaque mois soit commencer avec 10,000, tu me donne le nombre
// de rrr et LA quantite de temps pris pour arriver 10%"
//
// Tests the full combo (FVG + Divergence + NWOG + Judas Swing + Weekly Sweep)
// across all 17 years of available backtest data (2009-2025), with monthly
// resets: for EACH calendar month across ALL years in the dataset, starts
// fresh with $10,000 balance on the first trading day of that month, tracks
// when +$1,000 profit is reached (10% gain), and reports:
// - R units gained to reach the target
// - Number of days taken (calendar days, not trading days)
// - Number of trades executed to reach the target
// - If target never reached, reports "—" and final balance
//
// Aggregates by month (Jan-Dec) across all years to show which months are
// fastest/slowest to reach the 10% target.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { fileURLToPath } from 'node:url';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const CSV_DIR = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'backtest-input');
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const STARTING_BALANCE = 10000;
const TARGET_PROFIT = 1000; // 10% of $10,000
const RISK_PCT_PER_TRADE = 0.5; // challenge mode, compounding

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
  // Find first trading day of the month (first trade on or after the 1st)
  const monthStartTime = Date.UTC(year, month, 1);
  const monthEndTime = Date.UTC(year, month + 1, 1); // exclusive

  const monthTrades = trades.filter((t) => t.exitTime >= monthStartTime && t.exitTime < monthEndTime);
  if (monthTrades.length === 0) return null; // no trades in this month

  const firstTradeTime = monthTrades[0].exitTime;

  let balance = STARTING_BALANCE;
  let totalR = 0;
  let tradesCount = 0;
  let targetReachedAt = null;
  let targetReachedTradeCount = 0;
  let targetReachedDays = null;

  for (const t of monthTrades) {
    if (targetReachedAt) break; // stop once target is reached

    const riskAmount = balance * (RISK_PCT_PER_TRADE / 100);
    const pnl = riskAmount * (t.rMultiple || 0);
    balance += pnl;
    totalR += (t.rMultiple || 0);
    tradesCount++;

    // Check if target reached
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

  // Detect all years dynamically from trade data
  const years = new Set(trades.map((t) => new Date(t.exitTime).getUTCFullYear()));
  const yearsSorted = [...years].sort((a, b) => a - b);

  console.log(`\n=== Analyse par mois avec reset $10,000 (combo 17 ans, ${yearsSorted[0]}-${yearsSorted[yearsSorted.length - 1]}) ===\n`);
  console.log(`Total trades replayés : ${trades.length}`);
  console.log(`Période : ${new Date(earliestTime).toISOString().slice(0, 10)} -> ${new Date(latestTime).toISOString().slice(0, 10)}\n`);

  // Run simulations for each month of each year
  const resultsByMonth = Array.from({ length: 12 }, () => []);

  for (const year of yearsSorted) {
    for (let month = 0; month < 12; month++) {
      const result = simulateFromMonthStart(trades, year, month);
      if (result && result.hasData) {
        resultsByMonth[month].push(result);
      }
    }
  }

  // Report per month
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

  // Detailed per-year-month breakdown
  console.log('\n\n=== Détail année par année et mois par mois ===\n');
  for (const year of yearsSorted) {
    console.log(`\n--- ${year} ---`);
    let yearHasData = false;
    for (let month = 0; month < 12; month++) {
      const result = resultsByMonth[month].find((r) => new Date(r.monthStart).getUTCFullYear() === year);
      if (!result) continue;
      yearHasData = true;

      const statusStr = result.targetReached
        ? `✓ cible atteinte en ${result.daysToTarget}j (${result.tradesToTarget} trades, +${result.rUnits}R, solde final $${result.finalBalance})`
        : `✗ cible jamais atteinte (${result.totalTrades} trades, ${result.rUnits >= 0 ? '+' : ''}${result.rUnits}R, solde final $${result.finalBalance})`;

      console.log(`  ${MONTH_NAMES[month]} : ${statusStr}`);
    }
    if (!yearHasData) console.log(`  (pas de données pour cette année)`);
  }

  // Summary statistics
  console.log('\n\n=== Résumé statistique ===\n');
  const allResults = resultsByMonth.flat();
  const allReached = allResults.filter((r) => r.targetReached);
  const allNotReached = allResults.filter((r) => !r.targetReached);

  console.log(`Total tentatives (mois) : ${allResults.length}`);
  console.log(`Cible atteinte : ${allReached.length}/${allResults.length} (${(100 * allReached.length / allResults.length).toFixed(1)}%)`);

  if (allReached.length > 0) {
    const avgDaysAll = (allReached.reduce((s, r) => s + (r.daysToTarget || 0), 0) / allReached.length).toFixed(1);
    const avgTradesAll = (allReached.reduce((s, r) => s + (r.tradesToTarget || 0), 0) / allReached.length).toFixed(1);
    const avgRAll = (allReached.reduce((s, r) => s + r.rUnits, 0) / allReached.length).toFixed(2);
    const minDaysAll = Math.min(...allReached.map((r) => r.daysToTarget || Infinity));
    const maxDaysAll = Math.max(...allReached.map((r) => r.daysToTarget || -Infinity));

    console.log(`Jours moyen à la cible (sur ceux qui l'atteignent) : ${avgDaysAll}j`);
    console.log(`Trades moyen à la cible : ${avgTradesAll}`);
    console.log(`R moyen à la cible : +${avgRAll}R`);
    console.log(`Fenêtre jour : ${minDaysAll}j - ${maxDaysAll}j`);
  }

  if (allNotReached.length > 0) {
    const avgRNotReached = (allNotReached.reduce((s, r) => s + r.rUnits, 0) / allNotReached.length).toFixed(2);
    console.log(`\nMois sans cible atteinte : ${allNotReached.length} (${(100 * allNotReached.length / allResults.length).toFixed(1)}%)`);
    console.log(`R moyen dans ces mois : ${avgRNotReached}R`);
  }
}

main();
