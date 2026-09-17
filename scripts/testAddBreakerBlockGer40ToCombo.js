#!/usr/bin/env node
// testAddBreakerBlockGer40ToCombo.js
// Usage: node scripts/testAddBreakerBlockGer40ToCombo.js [real-data-dir]
//
// Esdras (2026-09-16): "check encore d'autre combo ou strategy pour
// augmenter le nombre de trade" - direct follow-up to deploying NWOG/GER40.
//
// Breaker Block/GER40 was previously left in a "zone grise" (see HANDOFF.md
// "GER40 — vrai spread confirmé... NWOG réhabilité", 2026-09-15): it passed
// the formal train/test verdict but was only checked with the WRONG spread
// (1.0 instead of the confirmed real 0.5) and never got the same 2-year-
// block/buy-sell robustness pass that rehabilitated NWOG. Re-verified here
// with the correct spread (already fixed in transactionCosts.js since
// 2026-09-15) and the SAME checks:
//   - Buy/sell split: 60% buy / 40% sell (n=1562) - balanced, not a hidden
//     long-bias trap like Asian Range Breakout/Unicorn Model/Asian Range Fade.
//   - 2-year blocks: 7/8 positive (only 2010-2011 negative).
//   - Best single year (2024): 34% of total net profit - a bit more
//     concentrated than NWOG (22%) or Weekly Sweep (16%), but nowhere near
//     the 82-146% that sank Asian Range Breakout/Unicorn Model.
//   - Sample size: 1562 trades over 16 years - by far the largest GER40
//     candidate tested (NWOG ~940, Weekly Sweep smaller still).
// Clears the same bar NWOG cleared. This script now checks whether adding
// it to the PRODUCTION combo (which, after this session's earlier change,
// already runs Weekly Sweep + NWOG on GER40) is additive or just adds noisy
// overlapping trades on the same symbol.

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBreakerBlockBacktest } from '../src/backtest/breakerBlock.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const HIST_CSV_DIR = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-input');
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;

function loadHistory(dir) {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
  }
  return historyBySymbol;
}

// Current production combo, AS DEPLOYED (already includes Weekly Sweep +
// NWOG on GER40, from the previous change this session).
function replayProductionCombo(historyBySymbol) {
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
  return trades;
}

function replayBreakerBlockGer40(candles) {
  const spread = DEFAULT_SPREADS.GER40;
  const raw = runBreakerBlockBacktest(candles, {});
  const viable = raw.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    const outcome = t.rMultiple > 0 ? 'win' : t.rMultiple < 0 ? 'loss' : 'timeout';
    return { symbol: 'GER40', source: 'breaker-ger40', entryTime: t.entryTime, exitTime: t.exitTime, outcome, rMultiple: t.rMultiple - costR };
  });
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

// Overlap check: how often Breaker Block/GER40 opens while ANOTHER GER40
// mechanism (Weekly Sweep or NWOG) already has a position open.
function overlapCheck(comboTrades, breakerTrades) {
  const otherGer40 = comboTrades.filter((t) => t.symbol === 'GER40' && (t.source === 'weeklysweep' || t.source === 'nwog'));
  let overlapCount = 0;
  for (const bt of breakerTrades) {
    const overlapping = otherGer40.some((o) => bt.entryTime <= o.exitTime && bt.exitTime >= o.entryTime);
    if (overlapping) overlapCount++;
  }
  console.log(`Chevauchement temporel Breaker Block/GER40 vs (Weekly Sweep OU NWOG)/GER40 : ${overlapCount}/${breakerTrades.length}.`);
}

function main() {
  const realDir = process.argv[2];

  console.log('=== Historique complet (backtest CSV, 2010-2025) ===\n');
  const histHistory = loadHistory(HIST_CSV_DIR);
  const histCombo = replayProductionCombo(histHistory);
  const histBreaker = replayBreakerBlockGer40(histHistory.GER40);
  const histComboWithBreaker = [...histCombo, ...histBreaker].sort((a, b) => a.entryTime - b.entryTime);

  summarize('Combo production actuel (sans Breaker Block)', histCombo);
  summarize('Combo + Breaker Block/GER40                 ', histComboWithBreaker);
  console.log('\nBreaker Block/GER40 seul :');
  summarize('  ', histBreaker);
  overlapCheck(histCombo, histBreaker);

  console.log('\nDétail par mécanisme (combo + Breaker Block) :');
  for (const [src, b] of Object.entries(bySource(histComboWithBreaker))) {
    console.log(`  ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L, ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }

  if (realDir) {
    console.log('\n\n=== Fenêtre réelle (broker cTrader, 2026-02 -> 2026-09) ===\n');
    const realHistory = loadHistory(realDir);
    const realCombo = replayProductionCombo(realHistory);
    const realBreaker = replayBreakerBlockGer40(realHistory.GER40);
    const realComboWithBreaker = [...realCombo, ...realBreaker].sort((a, b) => a.entryTime - b.entryTime);

    summarize('Combo production actuel (sans Breaker Block)', realCombo);
    summarize('Combo + Breaker Block/GER40                 ', realComboWithBreaker);
    console.log('\nBreaker Block/GER40 seul sur cette fenêtre :');
    summarize('  ', realBreaker);
    overlapCheck(realCombo, realBreaker);
  }
}

main();
