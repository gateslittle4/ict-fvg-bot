#!/usr/bin/env node
// runHaitiForexSameDayComplianceAnalysis.js
// Usage: node scripts/runHaitiForexSameDayComplianceAnalysis.js
//
// Esdras asked for a plan to pass HaitiForex's challenge (haitiforex.org,
// rules read directly off their Open-Account/Practice pages, 2026-09-19):
// every position must be closed by 16:00 (NY, per the site's own trading
// hours context) or the account is cancelled outright - no swing, no
// overnight, ever. Before proposing which of the 8 currently-live
// mechanisms (FVG, Divergence, NWOG, Judas Swing, Weekly Sweep, Breaker
// Block, Silver Bullet, CBDR) to actually use for this challenge, this
// checks which of them ALREADY resolve same-NY-day-before-16:00 on real
// data, rather than guessing from each mechanism's own maxHoldingCandles
// (480 M15 candles = 5 days is just the outer timeout, not the typical
// holding time).
//
// Reuses the exact same real-data replay pattern as
// runFtmo1StepFullComboAccountImpact.js (LiveStrategyEngine built directly
// from CONFIG, warmUp() over the same merged 7-month real cTrader export) -
// same production code path, just a different question asked of the same
// trades: not "did the account pass a prop firm cycle" but "would this
// trade have been open past 16:00 NY, or into a new NY calendar day".
//
// Time convention: LiveStrategyEngine's entryTime/exitTime are in ENGINE
// time (fixed-EST-as-UTC, real UTC - 5h - see nySession.js's own header).
// toRealNyHourMinute() already exists for hour/minute; this script adds its
// own NY calendar-date key (year-month-day) alongside it, since no existing
// helper in this project needed one before.

import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { FIXED_EST_TO_UTC_OFFSET_MS, toRealNyHourMinute } from '../src/backtest/nySession.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

const DIR_A = 'data/real-data-2026-02-to-09';
const DIR_B = 'data/real-data-2026-09-17';

function toEngineTime(candles) {
  return candles.map((c) => ({ ...c, time: c.time - FIXED_EST_TO_UTC_OFFSET_MS }));
}

function mergeCandles(a, b) {
  const byTime = new Map();
  for (const c of a) byTime.set(c.time, c);
  for (const c of b) byTime.set(c.time, c);
  return [...byTime.values()].sort((x, y) => x.time - y.time);
}

const nyDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
function toRealNyDateKey(engineTimeMs) {
  const trueUtcMs = engineTimeMs + FIXED_EST_TO_UTC_OFFSET_MS;
  return nyDateFormatter.format(new Date(trueUtcMs)); // "YYYY-MM-DD"
}

function main() {
  const symbols = CONFIG.symbols;
  const candlesBySymbolRaw = {};
  for (const symbol of symbols) {
    const { candles: a } = loadCandlesFromCsv(path.join(DIR_A, `${symbol}.csv`));
    const { candles: b } = loadCandlesFromCsv(path.join(DIR_B, `${symbol}.csv`));
    candlesBySymbolRaw[symbol] = toEngineTime(mergeCandles(a, b));
  }
  // Divergence pair order fix (runFtmo1StepFullComboAccountImpact.js/
  // runCbdrOverlapAnalysis.js/HANDOFF.md): US500 must warm up before US100.
  const orderedSymbols = ['US500', 'US100', ...symbols.filter((s) => s !== 'US500' && s !== 'US100')];
  const candlesBySymbol = {};
  for (const s of orderedSymbols) candlesBySymbol[s] = candlesBySymbolRaw[s];

  const guardrail = new GuardrailEngine({ ...CONFIG.guardrails, maxTradesPerDay: 1000, dailyLossLimitPct: 100 }); // permissive - not the question here
  guardrail.setBalance(10000, candlesBySymbolRaw[orderedSymbols[0]][0].time);

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
    riskPctPerTrade: 0.5,
    spreads: {},
  });

  const pendingOpen = new Map();
  const trades = [];
  engine.warmUp(candlesBySymbol, {
    onEvent: (signal, candle) => {
      if (signal.type === 'validated' && !signal.blockedReason) {
        pendingOpen.set(signal.symbol, { source: signal.source, entryTime: candle.time });
        return;
      }
      if (signal.type !== 'closed') return;
      const open = pendingOpen.get(signal.symbol);
      pendingOpen.delete(signal.symbol);
      if (!open) return;
      trades.push({ symbol: signal.symbol, source: open.source, outcome: signal.outcome, entryTime: open.entryTime, exitTime: signal.exitTime });
    },
  });

  console.log(`Total trades replayed (8 live mechanisms, ~7 real months): ${trades.length}\n`);

  const bySource = new Map();
  for (const t of trades) {
    if (!bySource.has(t.source)) bySource.set(t.source, []);
    bySource.get(t.source).push(t);
  }

  const rows = [];
  for (const [source, list] of [...bySource.entries()].sort()) {
    let sameDayBefore16 = 0;
    let sameDayAfter16 = 0;
    let laterDay = 0;
    const holdingHours = [];
    for (const t of list) {
      const entryDate = toRealNyDateKey(t.entryTime);
      const exitDate = toRealNyDateKey(t.exitTime);
      const exitHm = toRealNyHourMinute(t.exitTime);
      const exitDecimalHour = exitHm.hour + exitHm.minute / 60;
      holdingHours.push((t.exitTime - t.entryTime) / (1000 * 60 * 60));
      if (entryDate === exitDate) {
        if (exitDecimalHour <= 16) sameDayBefore16++;
        else sameDayAfter16++;
      } else {
        laterDay++;
      }
    }
    holdingHours.sort((a, b) => a - b);
    const median = holdingHours[Math.floor(holdingHours.length / 2)];
    const n = list.length;
    rows.push({
      source,
      n,
      compliantPct: (100 * sameDayBefore16) / n,
      sameDayAfter16Pct: (100 * sameDayAfter16) / n,
      laterDayPct: (100 * laterDay) / n,
      medianHours: median,
    });
  }

  console.log('| Mécanisme | Trades | Conforme (même jour, sortie <=16h NY) | Même jour mais >16h | Jour suivant ou + | Durée médiane |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.source} | ${r.n} | ${r.compliantPct.toFixed(1)}% | ${r.sameDayAfter16Pct.toFixed(1)}% | ${r.laterDayPct.toFixed(1)}% | ${r.medianHours.toFixed(1)}h |`
    );
  }
}

main();
