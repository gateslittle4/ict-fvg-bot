#!/usr/bin/env node
// runRRAccountImpact.js
// Usage: node scripts/runRRAccountImpact.js <dir-with-csvs>
//
// rr-multiple-sweep.md showed that lowering R:R raises the win rate but
// LOWERS expectancy per trade in R (1:3 -> 0.70-0.79R test expectancy,
// 1:2.5 -> 0.48-0.61R, 1:2 -> 0.26-0.40R, worse from there). Since dollar
// expectancy per trade = risk_amount x expectancy_in_R and risk_amount is
// the same fixed %, a lower R:R should mean a SLOWER account-level climb
// despite the higher win rate - this confirms that directly instead of just
// asserting it, using the only R:R that still fully "tient" out-of-sample
// besides the current 1:3 pick: 1:2.5.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_PCT = 0.5;
const STATIC_MAX_DD_PCT = 10;
const PHASE1_TARGET_MULTIPLE = 1.08;
const PHASE2_TARGET_MULTIPLE = 1.05;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
function strategyConfig(rrMultiple) {
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  };
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

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
    guardrailConfig: CONFIG.guardrails,
  });

  const firstTime = Math.min(...activeSymbols.map((s) => candlesBySymbol[s][0].time));
  const curve = result.equityCurve;
  const minBalance = curve.length > 0 ? Math.min(STARTING_BALANCE, ...curve.map((p) => p.balance)) : STARTING_BALANCE;
  const staticDrawdownPct = ((STARTING_BALANCE - minBalance) / STARTING_BALANCE) * 100;
  const busted = staticDrawdownPct >= STATIC_MAX_DD_PCT;
  const bustPoint = curve.find((p) => (STARTING_BALANCE - p.balance) / STARTING_BALANCE * 100 >= STATIC_MAX_DD_PCT);

  const phase1Target = STARTING_BALANCE * PHASE1_TARGET_MULTIPLE;
  const phase1Point = curve.find((p) => p.balance >= phase1Target);
  let phase1Label = 'jamais';
  let phase2Label = 'jamais';
  if (phase1Point) {
    phase1Label = `jour ${daysBetween(firstTime, phase1Point.time)}`;
    const phase2Target = phase1Point.balance * PHASE2_TARGET_MULTIPLE;
    const phase2Point = curve.find((p) => p.time > phase1Point.time && p.balance >= phase2Target);
    if (phase2Point) phase2Label = `jour ${daysBetween(firstTime, phase2Point.time)}`;
  }

  return {
    trades: result.totalTrades,
    winRate: result.winRate,
    staticDrawdownPct,
    trailingDrawdownPct: result.maxDrawdownPct,
    busted,
    bustDate: bustPoint ? fmtDate(bustPoint.time) : null,
    phase1Label,
    phase2Label,
    finalBalance: result.finalBalance,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.phase1Label} | ${r.phase2Label} | $${r.finalBalance.toFixed(0)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runRRAccountImpact.js <dir-with-csvs>');
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
  mdSections.push('# Impact d\'un R:R plus bas au niveau du COMPTE complet — US100 + US500, 0.5%/trade');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte $${STARTING_BALANCE}, risque fixe 0.5%/trade, mêmes filtres partout (structure ON, session 10h-11h, ` +
      "sweep ON), seul rrMultiple change. 1:2.5 est le seul autre R:R qui \"tient\" encore pleinement hors-échantillon " +
      "(voir rr-multiple-sweep.md) - 1:2 et en dessous s'affaiblissent ou cassent carrément sur test."
  );
  mdSections.push('');

  for (const rrMultiple of [3, 2.5]) {
    mdSections.push(`## R:R 1:${rrMultiple}`);
    mdSections.push('| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|');
    const cfg = strategyConfig(rrMultiple);
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, year, cfg);
      mdSections.push(fmtRow(year, r));
      console.error(`[R:R 1:${rrMultiple}] ${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) : 'skip'}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'rr-account-impact.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
