#!/usr/bin/env node
// checkOutcomeSerialCorrelation.js
// Usage: node scripts/checkOutcomeSerialCorrelation.js <dir-with-csvs>
//
// Before testing a streak-based ("adaptive") risk ladder, check the premise
// it depends on: does a win actually make the NEXT trade more likely to win
// too (and a loss more likely to be followed by another loss)? If trade
// outcomes are close to independent (like our IID assumption throughout this
// project), sizing UP after a win and DOWN after a loss is just adding
// variance to a "coin" that doesn't remember its last flip - it wouldn't
// reflect a real edge, just a bet that TODAY happens to be a hot/cold streak.
// This computes P(win | previous trade was a win) vs P(win | previous trade
// was a loss), on the single shared chronological close-time sequence across
// BOTH symbols (matching how the guardrail budget and the proposed risk
// ladder are both shared across the whole account, not per-symbol).

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const cfg = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
};

function main() {
  const dir = process.argv[2];
  const candlesBySymbol = {};
  for (const symbol of ['US100', 'US500']) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    candlesBySymbol[symbol] = candles;
  }

  const result = runPortfolioBacktest({
    candlesBySymbol,
    configBySymbol: cfg,
    riskPctPerTrade: 0.5,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 2, dayBoundaryHourUTC: 0 },
  });

  // Chronological CLOSE order across both symbols (they're already pushed in
  // close-time order since the simulator processes one merged timeline).
  const trades = result.closedTrades.filter((t) => t.outcome !== 'timeout');
  console.log(`Trades (win/loss only, timeouts excluded): ${trades.length}`);

  let afterWin = { wins: 0, total: 0 };
  let afterLoss = { wins: 0, total: 0 };
  for (let i = 1; i < trades.length; i++) {
    const prevWin = trades[i - 1].outcome === 'win';
    const thisWin = trades[i].outcome === 'win';
    if (prevWin) { afterWin.total++; if (thisWin) afterWin.wins++; }
    else { afterLoss.total++; if (thisWin) afterLoss.wins++; }
  }

  const pctAfterWin = afterWin.total > 0 ? (100 * afterWin.wins / afterWin.total).toFixed(1) : '—';
  const pctAfterLoss = afterLoss.total > 0 ? (100 * afterLoss.wins / afterLoss.total).toFixed(1) : '—';
  console.log(`P(win | previous trade won)  = ${afterWin.wins}/${afterWin.total} = ${pctAfterWin}%`);
  console.log(`P(win | previous trade lost) = ${afterLoss.wins}/${afterLoss.total} = ${pctAfterLoss}%`);
  console.log(`Overall win rate: ${(100 * result.winRate).toFixed(1)}%`);

  // Longest observed win/loss streaks, for context on how far the ladder would actually climb/descend.
  let longestWinStreak = 0, longestLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of trades) {
    if (t.outcome === 'win') { curWin++; curLoss = 0; } else { curLoss++; curWin = 0; }
    longestWinStreak = Math.max(longestWinStreak, curWin);
    longestLossStreak = Math.max(longestLossStreak, curLoss);
  }
  console.log(`Longest win streak observed: ${longestWinStreak}, longest loss streak observed: ${longestLossStreak}`);

  // Train/test split check - is this pattern robust, or concentrated in a
  // handful of anomalous years?
  const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
  function splitStat(subset) {
    let aw = { w: 0, t: 0 }, al = { w: 0, t: 0 };
    for (let i = 1; i < subset.length; i++) {
      const prevWin = subset[i - 1].outcome === 'win';
      const thisWin = subset[i].outcome === 'win';
      if (prevWin) { aw.t++; if (thisWin) aw.w++; } else { al.t++; if (thisWin) al.w++; }
    }
    return { aw, al };
  }
  const trainTrades = trades.filter((t) => t.entryTime < TRAIN_CUTOFF);
  const testTrades = trades.filter((t) => t.entryTime >= TRAIN_CUTOFF);
  const trainStat = splitStat(trainTrades);
  const testStat = splitStat(testTrades);
  console.log(`
--- TRAIN (2019-2023) ---`);
  console.log(`P(win | prev won) = ${trainStat.aw.w}/${trainStat.aw.t} = ${trainStat.aw.t ? (100*trainStat.aw.w/trainStat.aw.t).toFixed(1) : '—'}%`);
  console.log(`P(win | prev lost) = ${trainStat.al.w}/${trainStat.al.t} = ${trainStat.al.t ? (100*trainStat.al.w/trainStat.al.t).toFixed(1) : '—'}%`);
  console.log(`
--- TEST (2024-2025) ---`);
  console.log(`P(win | prev won) = ${testStat.aw.w}/${testStat.aw.t} = ${testStat.aw.t ? (100*testStat.aw.w/testStat.aw.t).toFixed(1) : '—'}%`);
  console.log(`P(win | prev lost) = ${testStat.al.w}/${testStat.al.t} = ${testStat.al.t ? (100*testStat.al.w/testStat.al.t).toFixed(1) : '—'}%`);

}

main();
