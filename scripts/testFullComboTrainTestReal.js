#!/usr/bin/env node
// testFullComboTrainTestReal.js
// Usage: node scripts/testFullComboTrainTestReal.js [real-data-dir]
//
// Esdras (2026-09-16), after a session that added NWOG/GER40, Breaker
// Block/GER40, and FVG multi-touch/US500 on top of the existing production
// combo: "on VA faire un test avec Tous ces strategy combine, train vs test
// vs ces 7 derniers mois avant de sarreter" - one final sanity check of the
// FULLY ASSEMBLED current combo (every mechanism, straight from CONFIG, no
// manual overrides) across THREE windows:
//   - TRAIN: historical CSVs, < 2024-01-01 (same cutoff used throughout
//     this project)
//   - TEST: historical CSVs, >= 2024-01-01 (through 2025-12-31)
//   - RÉEL: the real ~7-month broker window already committed
//     (data/real-data-2026-02-to-09/, 2026-02-10 -> 2026-09-16)
//
// Train/test use a HARD SPLIT (fresh engine per slice, indicators reset at
// the cutoff) - the same convention as every other train/test script in
// this project (e.g. runExtendedTargetAnalysis.js), not a "replay full
// history then filter" approach. The real window is replayed on its own
// (it's the entire available real dataset - nothing to split).

import path from 'node:path';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

const REAL_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];
const HIST_CSV_DIR = path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'backtest-input');
const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();

function loadHistory(dir) {
  const historyBySymbol = {};
  for (const symbol of REAL_SYMBOLS) {
    historyBySymbol[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
  }
  return historyBySymbol;
}

// Replays the CURRENT PRODUCTION combo, straight from CONFIG - every
// mechanism this session touched (FVG incl. US100/US500 multi-touch,
// Divergence, NWOG US100+GER40, Judas Swing EURUSD, Weekly Sweep GER40,
// Breaker Block GER40) - no manual overrides, so this always reflects
// whatever config.js actually says, not a snapshot frozen at write time.
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
    breakerBlockConfig: CONFIG.breakerBlock,
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

function summarize(label, trades) {
  const decided = trades.filter((t) => t.outcome === 'win' || t.outcome === 'loss');
  const wins = decided.filter((t) => t.outcome === 'win').length;
  const totalR = decided.reduce((s, t) => s + (t.rMultiple || 0), 0);
  const avgR = decided.length > 0 ? totalR / decided.length : null;
  console.log(`${label} : ${trades.length} trades (${decided.length} décidés), taux de gain ${decided.length > 0 ? (100 * wins / decided.length).toFixed(1) : '—'}%, R moyen ${avgR !== null ? avgR.toFixed(3) : '—'}, total ${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`);
  return { count: trades.length, decided: decided.length, wins, totalR, avgR };
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

function printBySource(trades) {
  const bs = bySource(trades);
  for (const [src, b] of Object.entries(bs).sort((a, b) => b[1].totalR - a[1].totalR)) {
    const decided = b.wins + b.losses;
    console.log(`    ${src} : ${b.count} trades, ${b.wins}W/${b.losses}L (${decided > 0 ? (100 * b.wins / decided).toFixed(1) : '—'}%), ${b.totalR >= 0 ? '+' : ''}${b.totalR.toFixed(2)}R`);
  }
}

function main() {
  const realDir = process.argv[2] || path.join(new URL('.', import.meta.url).pathname, '..', 'data', 'real-data-2026-02-to-09');

  console.log('=== TRAIN (historique < 2024-01-01) ===\n');
  const histHistory = loadHistory(HIST_CSV_DIR);
  const trainHistory = {};
  const testHistory = {};
  for (const symbol of REAL_SYMBOLS) {
    trainHistory[symbol] = histHistory[symbol].filter((c) => c.time < TRAIN_CUTOFF);
    testHistory[symbol] = histHistory[symbol].filter((c) => c.time >= TRAIN_CUTOFF);
  }
  const trainTrades = replayProductionCombo(trainHistory);
  const trainSummary = summarize('TRAIN', trainTrades);
  console.log('  Par mécanisme :');
  printBySource(trainTrades);

  console.log('\n=== TEST (historique >= 2024-01-01, jusqu\'à fin 2025) ===\n');
  const testTrades = replayProductionCombo(testHistory);
  const testSummary = summarize('TEST', testTrades);
  console.log('  Par mécanisme :');
  printBySource(testTrades);

  console.log('\n=== RÉEL (7 derniers mois, broker cTrader réel, 2026-02 -> 2026-09) ===\n');
  const realHistory = loadHistory(realDir);
  const realTrades = replayProductionCombo(realHistory);
  const realSummary = summarize('RÉEL', realTrades);
  console.log('  Par mécanisme :');
  printBySource(realTrades);

  console.log('\n\n=== Comparaison synthétique ===\n');
  console.log('Fenêtre | Trades | Taux de gain | R moyen | Total R');
  console.log('---|---|---|---|---');
  for (const [label, s] of [['TRAIN', trainSummary], ['TEST', testSummary], ['RÉEL (7 mois)', realSummary]]) {
    const wr = s.decided > 0 ? (100 * s.wins / s.decided).toFixed(1) + '%' : '—';
    console.log(`${label} | ${s.count} | ${wr} | ${s.avgR !== null ? s.avgR.toFixed(3) : '—'} | ${s.totalR >= 0 ? '+' : ''}${s.totalR.toFixed(2)}R`);
  }

  // Cohérence : le taux de gain et le R moyen train/test/réel doivent rester
  // dans le même ordre de grandeur - un écart massif serait un signal
  // d'alerte (surapprentissage historique, ou changement de régime réel).
  console.log('\nÉcarts (réel vs test historique) :');
  const wrTest = testSummary.decided > 0 ? 100 * testSummary.wins / testSummary.decided : null;
  const wrReal = realSummary.decided > 0 ? 100 * realSummary.wins / realSummary.decided : null;
  if (wrTest !== null && wrReal !== null) {
    console.log(`  Taux de gain : ${wrTest.toFixed(1)}% (test) -> ${wrReal.toFixed(1)}% (réel), écart ${(wrReal - wrTest).toFixed(1)} points`);
  }
  if (testSummary.avgR !== null && realSummary.avgR !== null) {
    console.log(`  R moyen : ${testSummary.avgR.toFixed(3)} (test) -> ${realSummary.avgR.toFixed(3)} (réel), écart ${(realSummary.avgR - testSummary.avgR).toFixed(3)}`);
  }
}

main();
