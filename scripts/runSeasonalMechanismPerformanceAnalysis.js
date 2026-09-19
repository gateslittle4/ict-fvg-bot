#!/usr/bin/env node
// runSeasonalMechanismPerformanceAnalysis.js
// Usage: node scripts/runSeasonalMechanismPerformanceAnalysis.js
//
// Esdras, after the 2025 FTMO cycle bust post-mortem (cycle 4, 2025-03-06 ->
// 2025-05-09, driven mainly by NWOG going 0/14 and Weekly Sweep 0/11 that
// window): "Est-ce que c'est quelque chose de récurrent? Vérifie si ça se
// répète, peut-être qu'on pourrait réduire la fréquence de ces stratégies
// pendant cette période-là."
//
// Two separate questions, answered separately rather than conflated:
//   1. Is March-May a genuinely weak SEASON for these mechanisms, averaged
//      across every year of real history (not just 2025)? -> per-mechanism
//      monthly aggregate, all years combined.
//   2. Does march-may specifically look bad EVERY year, or was 2025 an
//      outlier that happened to land there? -> per-mechanism, per-year
//      march-may breakdown, so a genuine seasonal pattern (repeats most
//      years) is visually distinguishable from "one bad stretch that
//      happened to fall in these months this one time."
//
// Reuses the exact same Phase-1 method as
// runFtmo1Step2025FullComboCycle.js (real LiveStrategyEngine.warmUp(),
// same 8 live mechanisms including CBDR, same 2010-2025 historical CSVs,
// same permissive warm-up guardrail so signal generation isn't distorted)
// but does NOT filter to 2025 - every trade across the full window is
// used here, since the whole point is comparing years against each other.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const DATA_DIR = 'data/backtest-input';
const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];

function netRMultipleOf(direction, entryPrice, distance, exitPrice, symbol) {
  const bullish = direction === 'bullish';
  const signedMove = bullish ? exitPrice - entryPrice : entryPrice - exitPrice;
  const grossR = signedMove / distance;
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const costR = spread > 0 ? spread / distance : 0;
  return grossR - costR;
}

function runFullHistoryReplay() {
  const symbols = CONFIG.symbols;
  const candlesBySymbol = {};
  for (const symbol of symbols) {
    const { candles } = loadCandlesFromCsv(path.join(DATA_DIR, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles; // already engine-time convention
  }
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const ordered = {};
  for (const s of orderedSymbols) ordered[s] = candlesBySymbol[s];

  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1000, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, ordered[orderedSymbols[0]][0].time);

  const engine = new LiveStrategyEngine({
    symbols: orderedSymbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog,
    judasSwingConfig: CONFIG.judasSwing,
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
    cbdrConfig: CONFIG.cbdr,
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    spreads: DEFAULT_SPREADS,
  });

  const pendingOpen = new Map();
  const trades = [];
  engine.warmUp(ordered, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, {
          source: signal.source, direction: signal.direction,
          entryPrice: signal.entryPrice, stopPrice: signal.stopPrice, targetPrice: signal.targetPrice,
          distance: signal.distance, entryTime: candle.time,
        });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;
      const exitPrice = signal.outcome === 'win' ? open.targetPrice : signal.outcome === 'loss' ? open.stopPrice : candle.close;
      trades.push({
        symbol: signal.symbol, source: open.source, direction: open.direction,
        entryTime: open.entryTime, exitTime: signal.exitTime,
        netRMultiple: netRMultipleOf(open.direction, open.entryPrice, open.distance, exitPrice, signal.symbol),
      });
    },
  });
  return trades;
}

function main() {
  console.log('Replay complet 2010-2025, les 8 mécanismes live réels (warmUp() une seule fois)...\n');
  const trades = runFullHistoryReplay();
  console.log(`Total trades sur toute la période : ${trades.length}\n`);

  const sources = [...new Set(trades.map((t) => t.source))].sort();

  // --- Question 1: per-mechanism monthly aggregate, ALL years combined ---
  console.log('='.repeat(100));
  console.log("QUESTION 1 : mars-mai est-il faible EN MOYENNE sur toutes les années, par mécanisme ?");
  console.log('='.repeat(100));
  for (const source of sources) {
    const list = trades.filter((t) => t.source === source);
    const byMonth = new Map();
    for (const t of list) {
      const month = new Date(t.entryTime).getUTCMonth(); // engine-time convention, month boundary close enough for a seasonal read
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(t);
    }
    console.log(`\n${source} (${list.length} trades, ${new Set(list.map(t => t.symbol)).size} symbole(s)) :`);
    console.log('| Mois | Trades | WR | Espérance (R) |');
    console.log('|---|---|---|---|');
    for (let m = 0; m < 12; m++) {
      const monthTrades = byMonth.get(m) || [];
      if (monthTrades.length === 0) { console.log(`| ${MONTH_NAMES[m]} | 0 | — | — |`); continue; }
      const wins = monthTrades.filter((t) => t.netRMultiple > 0).length;
      const wr = (100 * wins) / monthTrades.length;
      const expectancy = monthTrades.reduce((s, t) => s + t.netRMultiple, 0) / monthTrades.length;
      const flag = (m >= 2 && m <= 4 && expectancy < 0) ? '  <- mars-mai, négatif' : '';
      console.log(`| ${MONTH_NAMES[m]} | ${monthTrades.length} | ${wr.toFixed(1)}% | ${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}${flag} |`);
    }
  }

  // --- Question 2: per-mechanism, per-year March-May breakdown ---
  console.log('\n' + '='.repeat(100));
  console.log('QUESTION 2 : mars-mai est-il faible CHAQUE année, ou 2025 était-il un cas particulier ?');
  console.log('='.repeat(100));
  const years = [...new Set(trades.map((t) => new Date(t.entryTime).getUTCFullYear()))].sort();
  for (const source of sources) {
    console.log(`\n${source} - mars/avril/mai, année par année :`);
    console.log('| Année | Trades | WR | Espérance (R) |');
    console.log('|---|---|---|---|');
    let negativeYears = 0, totalYearsWithTrades = 0;
    for (const year of years) {
      const list = trades.filter((t) => {
        const d = new Date(t.entryTime);
        return t.source === source && d.getUTCFullYear() === year && d.getUTCMonth() >= 2 && d.getUTCMonth() <= 4;
      });
      if (list.length === 0) continue;
      totalYearsWithTrades++;
      const wins = list.filter((t) => t.netRMultiple > 0).length;
      const wr = (100 * wins) / list.length;
      const expectancy = list.reduce((s, t) => s + t.netRMultiple, 0) / list.length;
      if (expectancy < 0) negativeYears++;
      console.log(`| ${year} | ${list.length} | ${wr.toFixed(1)}% | ${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)} |`);
    }
    console.log(`-> mars-mai négatif ${negativeYears}/${totalYearsWithTrades} années avec des trades`);
  }
}

main();
