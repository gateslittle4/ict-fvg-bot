#!/usr/bin/env node
// runComboWeeklyTradeFrequencyAnalysis.js
// Usage: node scripts/runComboWeeklyTradeFrequencyAnalysis.js [startISO] [endISO]
//
// Esdras: "combien de trade dois je mattendre paar semaine" - runs the
// EXACT real production combo (every live mechanism, imported directly from
// src/config.js) through LiveStrategyEngine's own warmUp(), on the full
// 2024-2025 historical CSVs (data/backtest-input/) - the same out-of-sample
// "test" window every one of these mechanisms was individually validated
// against, so this isn't a new/different period. Real guardrail config
// (CONFIG.guardrails) applied, so this reports realistic post-netting,
// post-guardrail trade frequency - not a naive sum of each mechanism's own
// isolated trade count (which would overstate frequency: several mechanisms
// share a single netting slot per symbol, e.g. GER40 now has 4 competing
// for one).

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

function main() {
  const startArg = process.argv[2] || '2024-01-01T00:00:00Z';
  const endArg = process.argv[3] || '2026-01-01T00:00:00Z';
  const startMs = new Date(startArg).getTime();
  const endMs = new Date(endArg).getTime();

  const candlesBySymbol = {};
  for (const symbol of CONFIG.symbols) {
    const { candles } = loadCandlesFromCsv(path.join('data/backtest-input', `${symbol}.csv`));
    candlesBySymbol[symbol] = candles.filter((c) => c.time >= startMs && c.time < endMs);
  }

  const guardrail = new GuardrailEngine(CONFIG.guardrails);
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
  });

  const opened = [];
  engine.warmUp(candlesBySymbol, {
    onEvent: (e) => {
      if (e.type === 'validated' && e.blockedReason === null && e.entryPrice !== undefined) opened.push(e);
    },
  });

  const weeks = (endMs - startMs) / (7 * 24 * 3600 * 1000);
  console.log(`Fenêtre : ${startArg} -> ${endArg} (${weeks.toFixed(1)} semaines)`);
  console.log(`Total ouvert par le combo : ${opened.length} trades (${(opened.length / weeks).toFixed(2)}/semaine)\n`);

  const bySource = {};
  const bySymbol = {};
  for (const e of opened) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    bySymbol[e.symbol] = (bySymbol[e.symbol] || 0) + 1;
  }
  console.log('Par mécanisme (trades/semaine) :');
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source.padEnd(12)} ${count} (${(count / weeks).toFixed(2)}/semaine)`);
  }
  console.log('\nPar symbole (trades/semaine) :');
  for (const [symbol, count] of Object.entries(bySymbol).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${symbol.padEnd(8)} ${count} (${(count / weeks).toFixed(2)}/semaine)`);
  }

  // Distribution check: how many weeks had 0 / 1-2 / 3+ trades, so "X/week"
  // doesn't hide a lumpy reality (e.g. NWOG firing in weekly bursts).
  const byWeek = new Map();
  for (const e of opened) {
    const weekKey = Math.floor((e.validatedAt - startMs) / (7 * 24 * 3600 * 1000));
    byWeek.set(weekKey, (byWeek.get(weekKey) || 0) + 1);
  }
  const totalWeeks = Math.ceil(weeks);
  let zero = 0, oneToTwo = 0, threePlus = 0;
  for (let w = 0; w < totalWeeks; w++) {
    const n = byWeek.get(w) || 0;
    if (n === 0) zero++;
    else if (n <= 2) oneToTwo++;
    else threePlus++;
  }
  console.log(`\nDistribution par semaine calendaire : ${zero} semaines à 0 trade, ${oneToTwo} semaines à 1-2, ${threePlus} semaines à 3+ (sur ${totalWeeks} semaines).`);
}

main();
