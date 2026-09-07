#!/usr/bin/env node
// runFundingPipsZeroFeasibility.js
// Usage: node scripts/runFundingPipsZeroFeasibility.js <dir-with-csvs>
//
// Tests the "skip the challenge, go straight to FundingPips Zero (instant
// funding, $20,000, no evaluation)" idea directly against its REAL reward
// rules (verified this session against help.fundingpips.com/.../FundingPips-Zero):
//   - Daily loss limit 3% (of opening balance/equity, whichever higher)
//   - Max trailing loss 5% of highest-ever equity, floor locks permanently
//     at the starting size once +5% profit is ever reached
//   - Max combined open risk 1% of starting size across ALL open positions
//     at once (US100+US500 both open at 0.5%/trade = 1.0% - right at the
//     limit, so 0.25%/trade is the safer choice here, same as elsewhere)
//   - To UNLOCK a reward (withdrawal): 7 PROFITABLE DAYS (each >= +0.25% of
//     that day's balance) within any ROLLING 30-CALENDAR-DAY window, AND a
//     consistency score <= 15% (the single best day's profit can't be more
//     than 15% of total profit-to-date - profits must be spread across
//     multiple days, not one lucky day), AND largest loss must not exceed
//     largest win.
// There is no Phase 1/2 profit target here (no evaluation) - the only
// question is WHEN (if ever) the reward-unlock conditions are first met,
// which is what actually gates a withdrawal, not a profit percentage.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';

const STARTING_BALANCE = 20000;
const RISK_PCT = 0.25; // keeps combined open risk (2 symbols) at 0.5%, safely under Zero's 1% cap
const ZERO_GUARDRAILS = { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 3, dayBoundaryHourUTC: 0 };
const PROFITABLE_DAY_MIN_PCT = 0.25; // Zero's own per-day threshold to count as a "profitable day"
const REQUIRED_PROFITABLE_DAYS = 7;
const ROLLING_WINDOW_DAYS = 30;
const CONSISTENCY_SCORE_MAX_PCT = 15;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
function strategyConfig(liquiditySweepEnabled) {
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled, spread: DEFAULT_SPREADS.US100 },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled, spread: DEFAULT_SPREADS.US500 },
  };
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function dayKey(ms) { return Math.floor(ms / (24 * 60 * 60 * 1000)); } // UTC calendar day index, matches dayBoundaryHourUTC=0

// Groups closed trades into per-day net pnl and per-day approximate opening
// balance (balance right before that day's first trade), then evaluates
// the rolling-30-day / 7-profitable-day condition.
function evaluateRewardUnlock(closedTrades, startingBalance) {
  if (closedTrades.length === 0) return { unlockDate: null, dailyPnlByDay: new Map() };

  const dailyPnlByDay = new Map(); // dayKey -> { pnl, balanceBefore, time }
  let runningBalance = startingBalance;
  for (const t of closedTrades) {
    const key = dayKey(t.entryTime ?? t.exitTime);
    if (!dailyPnlByDay.has(key)) {
      dailyPnlByDay.set(key, { pnl: 0, balanceBefore: runningBalance, time: t.exitTime });
    }
    dailyPnlByDay.get(key).pnl += t.pnl;
    runningBalance = t.balanceAfter;
  }

  const days = [...dailyPnlByDay.entries()].sort((a, b) => a[0] - b[0]);
  const profitableDayKeys = days
    .filter(([, d]) => d.balanceBefore > 0 && (d.pnl / d.balanceBefore) * 100 >= PROFITABLE_DAY_MIN_PCT)
    .map(([key]) => key);

  // Slide a 30-calendar-day window forward; report the first day-key at
  // which the window ending there contains >= REQUIRED_PROFITABLE_DAYS.
  let unlockDayKey = null;
  for (const endKey of days.map(([key]) => key)) {
    const windowStart = endKey - ROLLING_WINDOW_DAYS + 1;
    const count = profitableDayKeys.filter((k) => k >= windowStart && k <= endKey).length;
    if (count >= REQUIRED_PROFITABLE_DAYS) {
      unlockDayKey = endKey;
      break;
    }
  }

  let consistencyScorePct = null;
  let consistencyOk = null;
  if (unlockDayKey !== null) {
    // Cumulative profit and single best day up to the unlock point.
    const upToUnlock = days.filter(([key]) => key <= unlockDayKey);
    const totalProfit = upToUnlock.reduce((s, [, d]) => s + Math.max(0, d.pnl), 0);
    const bestDayProfit = Math.max(...upToUnlock.map(([, d]) => d.pnl));
    consistencyScorePct = totalProfit > 0 ? (bestDayProfit / totalProfit) * 100 : null;
    consistencyOk = consistencyScorePct !== null ? consistencyScorePct <= CONSISTENCY_SCORE_MAX_PCT : null;
  }

  return {
    unlockDayKey,
    unlockDate: unlockDayKey !== null ? fmtDate(unlockDayKey * 24 * 60 * 60 * 1000) : null,
    totalProfitableDaysInYear: profitableDayKeys.length,
    totalTradingDays: days.length,
    consistencyScorePct,
    consistencyOk,
  };
}

function simulateYear(candlesBySymbolFull, year, configBySymbol) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
  const candlesBySymbol = {};
  for (const [symbol, candles] of Object.entries(candlesBySymbolFull)) {
    candlesBySymbol[symbol] = candles.filter((c) => c.time >= yearStart && c.time < yearEnd);
  }
  const activeSymbols = Object.keys(candlesBySymbol).filter((s) => candlesBySymbol[s].length >= 50);
  if (activeSymbols.length === 0) return null;

  const result = runPortfolioBacktest({
    candlesBySymbol,
    configBySymbol,
    riskPctPerTrade: RISK_PCT,
    startingBalance: STARTING_BALANCE,
    guardrailConfig: ZERO_GUARDRAILS,
  });

  const minBalance = result.equityCurve.length > 0 ? Math.min(STARTING_BALANCE, ...result.equityCurve.map((p) => p.balance)) : STARTING_BALANCE;
  const trailingLossFromStartPct = ((STARTING_BALANCE - minBalance) / STARTING_BALANCE) * 100; // approximates the 5% trailing-from-highest-equity rule
  const zeroBusted = trailingLossFromStartPct >= 5; // conservative proxy - real rule tracks from highest-ever equity, this is at least as strict

  const unlock = evaluateRewardUnlock(result.closedTrades, STARTING_BALANCE);

  return {
    trades: result.totalTrades,
    winRate: result.winRate,
    maxDrawdownPct: result.maxDrawdownPct,
    zeroBusted,
    ...unlock,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year} | — | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.zeroBusted ? '**OUI**' : 'non';
  const unlockCell = r.unlockDate ? `✅ ${r.unlockDate}` : `jamais (max ${r.totalProfitableDaysInYear} jours profitables/an, sur ${r.totalTradingDays} jours de trading)`;
  const consistencyCell = r.consistencyScorePct !== null ? `${r.consistencyScorePct.toFixed(0)}% ${r.consistencyOk ? '✅' : '❌ ÉCHOUE'}` : '—';
  return `| ${year} | ${r.trades} | ${wr} | ${r.maxDrawdownPct.toFixed(1)}% | ${bustCell} | ${unlockCell} | ${consistencyCell} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFundingPipsZeroFeasibility.js <dir-with-csvs>');
    process.exit(1);
  }

  const candlesBySymbolFull = {};
  for (const symbol of ['US100', 'US500']) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) continue;
    const { candles } = loadCandlesFromCsv(filePath);
    candlesBySymbolFull[symbol] = candles;
  }

  const mdSections = [];
  mdSections.push('# Faisabilité "FundingPips Zero, $20,000, sans challenge" — US100 + US500');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte $${STARTING_BALANCE}, risque ${RISK_PCT}%/trade (garde le risque ouvert combiné à 0.5%, sous la limite ` +
      "Zero de 1%), setup actuel validé, garde-fous ajustés aux VRAIES règles Zero (perte quotidienne max 3%, perte " +
      'trailing max 5% - approximée ici par une perte statique max de 5% depuis le départ, une approximation au moins ' +
      "aussi stricte que la vraie règle qui se base sur le plus haut équity jamais atteint). Chaque année simulée " +
      "indépendamment depuis $20,000 le 1er janvier de cette année (pas de report d'une année à l'autre). Pas de Phase " +
      "1/2 ici (compte déjà 'live' dès le jour 1) - la seule question est QUAND (si jamais) les conditions de " +
      'déblocage de retrait sont remplies : 7 jours profitables (chacun ≥0.25% net) sur une fenêtre glissante de 30 ' +
      'jours calendaires, ET un score de consistance ≤15% (le meilleur jour ne doit pas représenter plus de 15% du ' +
      'profit total cumulé à ce moment-là).'
  );
  mdSections.push('');

  for (const [label, sweepEnabled] of [['Avec liquidity sweep (setup recommandé)', true], ['Sans liquidity sweep (plus de trades)', false]]) {
    const cfg = strategyConfig(sweepEnabled);
    mdSections.push(`## ${label}`);
    mdSections.push('| Année | Trades | Win rate | Drawdown max | Busté (perte trailing >5%)? | Premier déblocage de retrait | Score de consistance au déblocage |');
    mdSections.push('|---|---|---|---|---|---|---|');
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, year, cfg);
      mdSections.push(fmtRow(year, r));
      console.error(`[${label}] ${year}: ${r ? r.trades + ' trades, unlock=' + r.unlockDate : 'skip'}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'fundingpips-zero-feasibility.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
