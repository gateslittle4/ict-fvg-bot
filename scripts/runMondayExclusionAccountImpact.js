#!/usr/bin/env node
// runMondayExclusionAccountImpact.js
// Usage: node scripts/runMondayExclusionAccountImpact.js <dir-with-csvs>
//
// exploratory-analysis.md found that excluding US500 Monday signals raises
// test expectancy from 0.63R to 0.98R (US500 Mondays were independently bad
// in BOTH train, found first, and test, confirmed after - the legitimate
// direction, unlike the Friday exclusion also tried there, which must be
// rejected: that one was only noticed BECAUSE test-period Fridays looked
// bad, which is test-set peeking, not real validation). Before adopting
// "no Monday on US500", check it at the FULL ACCOUNT level like every other
// idea in this project - a per-trade R improvement doesn't automatically
// mean a faster/safer account curve once guardrails and real position
// sizing are in the loop.

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
function strategyConfig(excludeMondayOnUS500) {
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500, excludedWeekdays: excludeMondayOnUS500 ? [1] : [] },
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
    console.error('Usage: node scripts/runMondayExclusionAccountImpact.js <dir-with-csvs>');
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
  mdSections.push('# Impact au niveau du COMPTE d\'exclure le lundi sur US500 — US100 + US500, 0.5%/trade');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte $${STARTING_BALANCE}, risque fixe 0.5%/trade, US100 inchangé, seul US500 exclut les signaux du lundi ` +
      "(piste trouvée sur train AVANT de regarder test - contrairement à l'exclusion du vendredi, testée dans " +
      "exploratory-analysis.md mais rejetée car découverte en regardant test, donc invalide méthodologiquement)."
  );
  mdSections.push('');

  for (const [label, excludeMonday] of [['US500 sans exclusion (actuel)', false], ['US500 sans lundi', true]]) {
    mdSections.push(`## ${label}`);
    mdSections.push('| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|');
    const cfg = strategyConfig(excludeMonday);
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, year, cfg);
      mdSections.push(fmtRow(year, r));
      console.error(`[${label}] ${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) : 'skip'}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'monday-exclusion-account-impact.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
