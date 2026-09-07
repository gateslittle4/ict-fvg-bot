#!/usr/bin/env node
// runPyramidAccountImpact.js
// Usage: node scripts/runPyramidAccountImpact.js <dir-with-csvs>
//
// Tests the pyramid idea (add a second unit at +1R, move stop to breakeven
// for both) at the FULL ACCOUNT level - real $ drawdown %, guardrail
// interactions, bust risk - not just per-trade R stats (see
// trade-management-comparison.md for the per-trade-only view that motivated
// this). Uses the same $10,000 "if I'd started on Jan 1 of year Y" framing
// as challenge-simulation-by-year.md, for both the current setup's normal
// risk (0.25%/0.5%) AND a HALVED risk level per variant - since a pyramided
// trade can deploy 2x the normal risk, halving the base risk keeps the
// WORST-CASE dollar exposure comparable to the non-pyramided baseline at its
// normal risk level, which is the fair way to compare "same worst case, does
// pyramid still add value on top."

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const STATIC_MAX_DD_PCT = 10;
const PHASE1_TARGET_MULTIPLE = 1.08;
const PHASE2_TARGET_MULTIPLE = 1.05;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
function strategyConfig(pyramidEnabled) {
  const tradeManagement = pyramidEnabled ? { mode: 'pyramid', addAtR: 1 } : undefined;
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100, tradeManagement },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500, tradeManagement },
  };
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(candlesBySymbolFull, year, configBySymbol, riskPct) {
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
    riskPctPerTrade: riskPct,
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

  const pyramidedCount = result.closedTrades.filter((t) => t.pyramided).length;

  return {
    trades: result.totalTrades,
    pyramidedCount,
    winRate: result.winRate,
    staticDrawdownPct,
    trailingDrawdownPct: result.maxDrawdownPct,
    busted,
    bustDate: bustPoint ? fmtDate(bustPoint.time) : null,
    phase1Label,
    phase2Label,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  const pyrCell = r.pyramidedCount !== undefined ? ` (dont ${r.pyramidedCount} pyramidés)` : '';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades}${pyrCell} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.phase1Label} | ${r.phase2Label} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runPyramidAccountImpact.js <dir-with-csvs>');
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
  mdSections.push('# Impact de la pyramide (+1 lot à +1R) au niveau du COMPTE complet — US100 + US500');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte $${STARTING_BALANCE}, setup validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, ` +
      'fvg-edge, 1:3, sweep ON), même GuardrailEngine que le bot réel. Chaque année simulée indépendamment depuis ' +
      "$10,000 le 1er janvier. Compare SANS pyramide vs AVEC pyramide, à risque normal ET à risque moitié (0.125%/0.25%) " +
      "pour la version pyramide - puisqu'un trade pyramidé peut déployer 2x le risque normal, risquer moitié en base " +
      "rend le pire cas dollar comparable à la version sans pyramide au risque normal, ce qui est la comparaison honnête " +
      "(\"à risque de pire cas égal, la pyramide ajoute-t-elle vraiment de la valeur?\")."
  );
  mdSections.push('');

  const scenarios = [
    { label: 'Sans pyramide — 0.25%/trade', pyramid: false, risk: 0.25 },
    { label: 'Sans pyramide — 0.5%/trade', pyramid: false, risk: 0.5 },
    { label: 'Avec pyramide — 0.25%/trade de base (pire cas ~0.5%)', pyramid: true, risk: 0.25 },
    { label: 'Avec pyramide — 0.5%/trade de base (pire cas ~1%)', pyramid: true, risk: 0.5 },
    { label: 'Avec pyramide — 0.125%/trade de base (pire cas ~0.25%, comparaison à risque égal)', pyramid: true, risk: 0.125 },
  ];

  for (const scenario of scenarios) {
    mdSections.push(`## ${scenario.label}`);
    mdSections.push('| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |');
    mdSections.push('|---|---|---|---|---|---|---|---|');
    const cfg = strategyConfig(scenario.pyramid);
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, year, cfg, scenario.risk);
      mdSections.push(fmtRow(year, r));
      console.error(`[${scenario.label}] ${year}: ${r ? r.trades + ' trades' : 'skip'}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'pyramid-account-impact.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
