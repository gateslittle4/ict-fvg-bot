#!/usr/bin/env node
// testNewComboOnRealData7Months.js
// Usage: node scripts/testNewComboOnRealData7Months.js <dir-with-real-csvs>
//
// Esdras (2026-09-16), suite directe : après avoir fourni ADMIN_EXPORT_TOKEN,
// ce script rejoue EXACTEMENT la même comparaison que
// testNewComboWithDynamicTarget.js (combo production, US100 fixe 1:5, vs
// nouveau système, US100 cible dynamique de liquidité) mais sur les VRAIES
// bougies M15 exportées depuis le broker cTrader en production
// (GET /api/admin/export-candles?symbol=X&days=245&token=...), PAS les CSV
// historiques (qui s'arrêtent au 2025-12-31). Fenêtre réelle obtenue :
// 2026-02-10 -> 2026-09-16 (~7 mois pile, le plafond de 245 jours de
// cTrader par requête) - correspond exactement à la demande "les 7 derniers
// mois", cette fois sur de vraies données plutôt qu'un proxy CSV.
//
// Toute la fenêtre récupérée EST la fenêtre de rapport ici (pas de
// découpage supplémentaire) - contrairement à testNewComboWithDynamicTarget.js
// qui devait couper 7 mois dans un historique de 17 ans, il n'y a ici
// qu'environ 7 mois de données disponibles au total, donc rien à couper.
// Mise en garde à garder : les filtres qui ont besoin d'un long historique
// pour se stabiliser (biais HTF EMA200 sur H4, structure ICT) n'ont qu'un
// warm-up de quelques semaines ici, contre plusieurs années dans le
// backtest habituel - les tout premiers signaux de la fenêtre (février-mars
// 2026) sont donc moins fiables que ceux de la fin de fenêtre.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { runBacktestDynamicTarget } from '../src/backtest/dynamicLiquidityTarget.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const US100_CFG = { ...CONFIG.fvg.perSymbol.US100 };

function loadHistory(dir) {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
  }
  return historyBySymbol;
}

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

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/testNewComboOnRealData7Months.js <dir-with-real-csvs>');
    process.exit(1);
  }
  const historyBySymbol = loadHistory(dir);
  const earliestTime = Math.min(...REAL_SYMBOLS.map((s) => historyBySymbol[s][0].time));
  const latestTime = Math.max(...REAL_SYMBOLS.map((s) => historyBySymbol[s][historyBySymbol[s].length - 1].time));

  console.log(`\n=== Nouveau système de combo sur VRAIES données broker (production cTrader, via /api/admin/export-candles) ===`);
  console.log(`Fenêtre réelle : ${new Date(earliestTime).toISOString().slice(0, 10)} -> ${new Date(latestTime).toISOString().slice(0, 10)}\n`);

  console.log('Rejeu de la production (hors US100/FVG)...');
  const otherTrades = replayEverythingExceptUs100Fvg(historyBySymbol);
  console.log('Rejeu US100/FVG (fixe 1:5, production actuelle)...');
  const us100Fixed = replayUs100Fixed(historyBySymbol.US100);
  console.log('Rejeu US100/FVG (cible dynamique de liquidité, nouveau système proposé)...');
  const us100Dynamic = replayUs100Dynamic(historyBySymbol.US100);

  const comboProduction = [...otherTrades, ...us100Fixed].sort((a, b) => a.entryTime - b.entryTime);
  const comboNew = [...otherTrades, ...us100Dynamic].sort((a, b) => a.entryTime - b.entryTime);

  console.log('\n--- Sur toute la fenêtre réelle (~7 mois) ---\n');
  summarize('COMBO PRODUCTION (US100 fixe 1:5)  ', comboProduction);
  summarize('COMBO NOUVEAU     (US100 dynamique)', comboNew);

  console.log('\nDétail par mécanisme (production) :');
  for (const [src, b] of Object.entries(bySource(comboProduction))) {
    console.log(`  ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L, ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }
  console.log('\nDétail par mécanisme (nouveau) :');
  for (const [src, b] of Object.entries(bySource(comboNew))) {
    console.log(`  ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L, ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }

  console.log('\n--- Mois par mois (reset $10,000, cible +10%) ---\n');
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  let cursor = Date.UTC(new Date(earliestTime).getUTCFullYear(), new Date(earliestTime).getUTCMonth(), 1);
  while (cursor <= latestTime) {
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
