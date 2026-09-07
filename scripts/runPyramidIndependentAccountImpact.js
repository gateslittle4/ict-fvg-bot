#!/usr/bin/env node
// runPyramidIndependentAccountImpact.js
// Usage: node scripts/runPyramidIndependentAccountImpact.js <dir-with-csvs>
//
// Same question as runPyramidAccountImpact.js ("does pyramiding help at the
// FULL ACCOUNT level, not just in per-trade R stats?"), but for the NEW
// 'pyramid-independent' design: the original unit's stop is NEVER moved to
// breakeven - only a genuinely SEPARATE second unit is added at +1R, with
// its own entry/stop/target, resolved fully independently. This was built
// in direct response to "is there a better way to pyramid, without putting
// it to breakeven?" - trade-management-comparison.md already showed this
// design preserves the ORIGINAL win rate exactly (unlike the old shared-stop
// 'pyramid' mode, which forced some recoveries into 0R scratches) and
// improves the per-trade R net average, at the cost of a WORSE max
// drawdown-in-R on individual trades (a pyramided trade's worst case is now
// -2R - both units stop out independently - instead of the old design's
// floor of 0R once triggered). This script checks whether that per-trade
// trade-off nets out to a win or a loss once real dollars, compounding, and
// the guardrail are in the loop - same $10,000 "if I'd started on Jan 1 of
// year Y" framing as the other account-impact scripts, and again comparing
// normal risk AND a halved base risk for the pyramid-independent variant,
// since a completed pyramid can deploy up to 2x the normal risk at once.

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
function strategyConfig(mode) {
  const tradeManagement = mode ? { mode, addAtR: 1 } : undefined;
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

  // Count distinct pyramid *events* (one 'added' leg = one completed pyramid),
  // not both legs, so this is comparable to the old design's pyramidedCount.
  const pyramidedCount = result.closedTrades.filter((t) => t.pyramidLeg === 'added').length;

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
    console.error('Usage: node scripts/runPyramidIndependentAccountImpact.js <dir-with-csvs>');
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
  mdSections.push('# Impact de la pyramide "stops indépendants, sans breakeven" au niveau du COMPTE complet — US100 + US500');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte $${STARTING_BALANCE}, setup validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, ` +
      'fvg-edge, 1:3, sweep ON), même GuardrailEngine que le bot réel. Chaque année simulée indépendamment depuis ' +
      "$10,000 le 1er janvier. Design testé : le stop de l'unité ORIGINALE n'est JAMAIS déplacé (elle se comporte " +
      "exactement comme sans gestion active) ; une SECONDE unité, totalement indépendante (sa propre entrée/stop/target), " +
      "est ouverte à +1R et se résout seule - un pullback qui la stoppe ne touche pas l'unité originale. Comparé SANS " +
      "pyramide vs AVEC cette pyramide, à risque normal ET à risque de base moitié (0.125%/0.25%) pour la variante " +
      "pyramide - un trade pyramidé pouvant déployer jusqu'à 2x le risque normal si les deux unités perdent, risquer " +
      "moitié en base rend le pire cas dollar comparable à la version sans pyramide au risque normal (comparaison à " +
      'pire cas égal).'
  );
  mdSections.push('');

  const scenarios = [
    { label: 'Sans pyramide — 0.25%/trade', mode: null, risk: 0.25 },
    { label: 'Sans pyramide — 0.5%/trade', mode: null, risk: 0.5 },
    { label: 'Pyramide stops indépendants — 0.25%/trade de base (pire cas ~0.5%)', mode: 'pyramid-independent', risk: 0.25 },
    { label: 'Pyramide stops indépendants — 0.5%/trade de base (pire cas ~1%)', mode: 'pyramid-independent', risk: 0.5 },
    { label: 'Pyramide stops indépendants — 0.125%/trade de base (pire cas ~0.25%, comparaison à risque égal)', mode: 'pyramid-independent', risk: 0.125 },
  ];

  for (const scenario of scenarios) {
    mdSections.push(`## ${scenario.label}`);
    mdSections.push('| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |');
    mdSections.push('|---|---|---|---|---|---|---|---|');
    const cfg = strategyConfig(scenario.mode);
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, year, cfg, scenario.risk);
      mdSections.push(fmtRow(year, r));
      console.error(`[${scenario.label}] ${year}: ${r ? r.trades + ' trades' : 'skip'}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'pyramid-independent-account-impact.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
