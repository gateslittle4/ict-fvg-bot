#!/usr/bin/env node
// testNewComboWithDynamicTarget.js
// Usage: node scripts/testNewComboWithDynamicTarget.js
//
// Esdras (2026-09-16): "Teste aussi sur US500/XAUUSD, et fais le forward
// test aussi. Ensuite teste le nouveau systeme de combo pour les 7 derniers
// mois."
//
// Part 1 (US500/XAUUSD) already run separately via
// runDynamicLiquidityTargetAnalysis.js - result: the dynamic "draw on
// liquidity" target HELPS US100 (win rate/R/PF/drawdown all improve, train
// AND test) but HURTS US500 and is mixed/flat on XAUUSD (lower average RR
// used -> lower R despite a higher win rate). Conclusion: the "nouveau
// système de combo" tested below swaps ONLY US100's FVG target to the
// dynamic mechanism - US500/XAUUSD/EURUSD/GER40/Divergence/NWOG/Judas
// Swing/Weekly Sweep all stay EXACTLY as production (unchanged, still fixed
// R multiples).
//
// Part 2 (forward test): this script's whole design IS the forward test -
// entries/stops/every OTHER mechanism identical to production, evaluated
// out-of-sample on the same train/test discipline already used throughout
// this project (nothing about the dynamic-target rule was tuned by looking
// at the window being reported here).
//
// Part 3 (7 derniers mois) : this session has no live broker connection (no
// CTRADER credentials configured in this sandbox) - "les 7 derniers mois"
// here means the last 7 CALENDAR MONTHS of the historical CSV window
// actually available (data/backtest-input/*.csv ends 2025-12-31), i.e.
// 2025-06-01 -> 2025-12-31. Same caveat as every other script in this repo
// that reaches for "real data": clearly NOT live broker candles, flagged
// explicitly rather than silently presented as if it were.
//
// Method: full warm-up over the ENTIRE available history (so every
// indicator/filter has its normal lookback, no truncated-history artifact),
// then trades are filtered to the 7-month reporting window only AFTER the
// full replay - same convention as replayLastWeekOnRealData.js.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { runBacktestDynamicTarget } from '../src/backtest/dynamicLiquidityTarget.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { fileURLToPath } from 'node:url';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const CSV_DIR = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'data', 'backtest-input');
const US100_CFG = { ...CONFIG.fvg.perSymbol.US100 };

function loadHistory() {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(CSV_DIR, `${symbol}.csv`)).candles;
  }
  return historyBySymbol;
}

// Every mechanism EXCEPT US100's own FVG (fvgConfig omits US100 - see file
// header) - Divergence/NWOG/Judas Swing/Weekly Sweep are untouched and still
// see US100 candles where their own config needs them (Divergence pair,
// NWOG symbols).
function replayEverythingExceptUs100Fvg(historyBySymbol) {
  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const fvgConfigWithoutUs100 = { ...CONFIG.fvg.perSymbol };
  delete fvgConfigWithoutUs100.BTCUSD;
  delete fvgConfigWithoutUs100.US100;
  const engine = new LiveStrategyEngine({
    symbols: REAL_SYMBOLS,
    fvgConfig: fvgConfigWithoutUs100,
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
  return trades;
}

function buildUs100Engine(candles) {
  const checkFilters = buildMultiTouchFilterPredicate(candles, 'US100', US100_CFG);
  return new MultiTouchFvgEngine({ symbol: 'US100', checkFilters });
}

// US100 FVG replayed in ISOLATION (same discipline as
// runDynamicLiquidityTargetAnalysis.js) - fixed 1:5 (current production) vs
// the dynamic liquidity target (proposed), both using the SAME entries/
// stops. Raw (gross) rMultiple, no separate transaction-cost netting - kept
// consistent with every other full-combo replay script in this session
// (buildBacktestSummary.js/monthlyStartAnalysis.js), none of which call
// withNet() either.
function replayUs100Fixed(candles) {
  const trades = runBacktest({ candles, symbol: 'US100', fvgEngine: buildUs100Engine(candles), stopMode: US100_CFG.stopMode, rrMultiple: 5 });
  return trades.map((t) => ({ symbol: 'US100', source: 'fvg', entryTime: t.entryTime, exitTime: t.exitTime, outcome: t.outcome, rMultiple: t.rMultiple }));
}
function replayUs100Dynamic(candles) {
  const trades = runBacktestDynamicTarget({ candles, symbol: 'US100', fvgEngine: buildUs100Engine(candles), stopMode: US100_CFG.stopMode });
  return trades.map((t) => ({ symbol: 'US100', source: 'fvg', entryTime: t.entryTime, exitTime: t.exitTime, outcome: t.outcome, rMultiple: t.rMultiple }));
}

function summarize(label, trades) {
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  const wins = decided.filter((t) => t.outcome === 'win').length;
  const totalR = decided.reduce((s, t) => s + (t.rMultiple || 0), 0);
  console.log(`${label} : ${trades.length} trades (${decided.length} décidés), taux de gain ${decided.length > 0 ? (100 * wins / decided.length).toFixed(1) : '—'}%, total ${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`);
  return { count: trades.length, decided: decided.length, wins, totalR };
}

function bySource(trades) {
  const map = {};
  for (const t of trades) {
    map[t.source] ??= { count: 0, wins: 0, losses: 0, totalR: 0 };
    map[t.source].count++;
    if (t.outcome === 'win') map[t.source].wins++;
    else if (t.outcome === 'loss') map[t.source].losses++;
    map[t.source].totalR += t.rMultiple || 0;
  }
  return map;
}

function main() {
  const historyBySymbol = loadHistory();
  const latestTime = Math.max(...REAL_SYMBOLS.map((s) => historyBySymbol[s][historyBySymbol[s].length - 1].time));
  // 7 calendar months back from the last available candle's month.
  const latestDate = new Date(latestTime);
  const windowStart = Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth() - 6, 1);
  const windowEnd = latestTime;

  console.log(`\n=== Nouveau système de combo (US100 : cible dynamique de liquidité) vs production (US100 : cible fixe 1:5) ===`);
  console.log(`Fenêtre de rapport : ${new Date(windowStart).toISOString().slice(0, 10)} -> ${new Date(windowEnd).toISOString().slice(0, 10)} (7 derniers mois calendaires disponibles - CSV historiques, PAS de connexion broker réelle dans ce sandbox)\n`);

  console.log('Rejeu de la production (hors US100/FVG) sur tout l\'historique disponible...');
  const otherTrades = replayEverythingExceptUs100Fvg(historyBySymbol);

  console.log('Rejeu US100/FVG (fixe 1:5, production actuelle)...');
  const us100Fixed = replayUs100Fixed(historyBySymbol.US100);

  console.log('Rejeu US100/FVG (cible dynamique de liquidité, nouveau système proposé)...');
  const us100Dynamic = replayUs100Dynamic(historyBySymbol.US100);

  const comboProduction = [...otherTrades, ...us100Fixed].sort((a, b) => a.entryTime - b.entryTime);
  const comboNew = [...otherTrades, ...us100Dynamic].sort((a, b) => a.entryTime - b.entryTime);

  const windowProd = comboProduction.filter((t) => t.exitTime >= windowStart && t.exitTime <= windowEnd);
  const windowNew = comboNew.filter((t) => t.exitTime >= windowStart && t.exitTime <= windowEnd);

  console.log('\n--- Sur les 7 derniers mois ---\n');
  summarize('COMBO PRODUCTION (US100 fixe 1:5)', windowProd);
  summarize('COMBO NOUVEAU     (US100 dynamique)', windowNew);

  console.log('\nDétail par mécanisme (production) :');
  for (const [src, b] of Object.entries(bySource(windowProd))) {
    console.log(`  ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L, ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }
  console.log('\nDétail par mécanisme (nouveau) :');
  for (const [src, b] of Object.entries(bySource(windowNew))) {
    console.log(`  ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L, ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }

  // Monthly $10,000-reset metric - same convention as monthlyStartAnalysis.js,
  // applied to each of the 7 individual calendar months in the window.
  function simulateMonth(trades, year, month) {
    const monthStart = Date.UTC(year, month, 1);
    const monthEnd = Date.UTC(year, month + 1, 1);
    const monthTrades = trades.filter((t) => t.exitTime >= monthStart && t.exitTime < monthEnd);
    if (monthTrades.length === 0) return null;
    const STARTING_BALANCE = 10000;
    const TARGET_PROFIT = 1000;
    const RISK_PCT = 0.5;
    let balance = STARTING_BALANCE;
    let totalR = 0;
    let count = 0;
    let reachedAt = null;
    let reachedTrades = 0;
    const firstTime = monthTrades[0].exitTime;
    for (const t of monthTrades) {
      if (reachedAt) break;
      const risk = balance * (RISK_PCT / 100);
      balance += risk * (t.rMultiple || 0);
      totalR += t.rMultiple || 0;
      count++;
      if (balance - STARTING_BALANCE >= TARGET_PROFIT) {
        reachedAt = t.exitTime;
        reachedTrades = count;
      }
    }
    return {
      reached: reachedAt !== null,
      days: reachedAt ? Math.round((reachedAt - firstTime) / 86400000) : null,
      trades: reachedAt ? reachedTrades : count,
      rUnits: Math.round(totalR * 100) / 100,
      finalBalance: Math.round(balance * 100) / 100,
    };
  }

  console.log('\n--- Mois par mois (reset $10,000, cible +10%) ---\n');
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  let cursor = windowStart;
  while (cursor < windowEnd) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const prod = simulateMonth(comboProduction, y, m);
    const neu = simulateMonth(comboNew, y, m);
    const fmt = (r) => r ? (r.reached ? `✓ ${r.days}j, ${r.trades} trades, +${r.rUnits}R` : `✗ jamais, ${r.trades} trades, ${r.rUnits >= 0 ? '+' : ''}${r.rUnits}R (solde ${r.finalBalance})`) : '(pas de trade)';
    console.log(`${monthNames[m]} ${y} :`);
    console.log(`  Production : ${fmt(prod)}`);
    console.log(`  Nouveau    : ${fmt(neu)}`);
    cursor = Date.UTC(y, m + 1, 1);
  }
}

main();
