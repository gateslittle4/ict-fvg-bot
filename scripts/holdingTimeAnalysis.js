import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';

const dir = 'data/backtest-input';
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const cfg = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
};

const candlesBySymbol = {};
for (const symbol of ['US100', 'US500']) {
  const filePath = path.join(dir, `${symbol}.csv`);
  const { candles } = loadCandlesFromCsv(filePath);
  candlesBySymbol[symbol] = candles;
}

const result = runPortfolioBacktest({
  candlesBySymbol,
  configBySymbol: cfg,
  riskPctPerTrade: 0.5,
  startingBalance: 10000,
  guardrailConfig: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, dayBoundaryHourUTC: 0 },
});

const trades = result.closedTrades;
console.log(`Total trades: ${trades.length}`);

function isWeekendCrossing(entryMs, exitMs) {
  // check if any Saturday falls within [entry, exit)
  let d = new Date(entryMs);
  d.setUTCHours(0,0,0,0);
  const exitDate = new Date(exitMs);
  while (d.getTime() < exitMs) {
    if (d.getUTCDay() === 6) return true; // Saturday
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return false;
}

const durationsHours = trades.map(t => (t.exitTime - t.entryTime) / (1000*60*60));
durationsHours.sort((a,b)=>a-b);
const weekendCrossers = trades.filter(t => isWeekendCrossing(t.entryTime, t.exitTime));

console.log(`Median holding (hours): ${durationsHours[Math.floor(durationsHours.length/2)].toFixed(1)}`);
console.log(`Mean holding (hours): ${(durationsHours.reduce((a,b)=>a+b,0)/durationsHours.length).toFixed(1)}`);
console.log(`Max holding (hours): ${durationsHours[durationsHours.length-1].toFixed(1)}`);
console.log(`Min holding (hours): ${durationsHours[0].toFixed(1)}`);
console.log(`Trades crossing at least one weekend (Sat): ${weekendCrossers.length} / ${trades.length} (${(100*weekendCrossers.length/trades.length).toFixed(1)}%)`);

// distribution buckets
const buckets = { '<24h':0, '24-72h':0, '72-168h (1w)':0, '>168h':0 };
for (const h of durationsHours) {
  if (h < 24) buckets['<24h']++;
  else if (h < 72) buckets['24-72h']++;
  else if (h < 168) buckets['72-168h (1w)']++;
  else buckets['>168h']++;
}
console.log('Distribution:', buckets);
