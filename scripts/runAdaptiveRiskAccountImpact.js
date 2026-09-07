#!/usr/bin/env node
// runAdaptiveRiskAccountImpact.js
// Usage: node scripts/runAdaptiveRiskAccountImpact.js <dir-with-csvs>
//
// Tests the user's proposed "streak-based risk ladder" idea at the FULL
// ACCOUNT level: start at 0.25%/trade, add +0.25% after each trade that
// closes profitably (capped), and after a loss drop straight back to the
// 0.25% base - then, if losses keep coming while already at/below base,
// step DOWN further below it (floored). The risk level is SHARED across
// both symbols (one ladder for the whole account, updated the instant any
// trade on either symbol closes), matching how the guardrail's trade budget
// is already shared across symbols in this project.
//
// Before trusting this, checkOutcomeSerialCorrelation.js checked the actual
// premise behind it on our own trade history: is a win actually followed by
// a higher chance of another win (and a loss by another loss)? Result: yes,
// on this dataset - P(win | prev won) ~56.5% vs P(win | prev lost) ~35.4%
// combined, and the gap holds up in both train (2019-2023) and test
// (2024-2025) years, though it's narrower out of sample (a small-sample
// caveat, not a certainty). That's what justifies testing this for real
// instead of dismissing it as gambler's-fallacy reasoning.

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
function strategyConfig() {
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  };
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((b - a) / (24 * 60 * 60 * 1000)); }

function simulateYear(candlesBySymbolFull, year, configBySymbol, { riskPct, adaptiveRiskConfig }) {
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
    adaptiveRiskConfig,
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

  const risksUsed = result.closedTrades.map((t) => t.riskPctUsed).filter((v) => v !== undefined);
  const riskRange =
    risksUsed.length > 0
      ? `${Math.min(...risksUsed).toFixed(2)}%-${Math.max(...risksUsed).toFixed(2)}% (moy ${(risksUsed.reduce((a, b) => a + b, 0) / risksUsed.length).toFixed(2)}%)`
      : '—';

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
    riskRange,
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — | | | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.phase1Label} | ${r.phase2Label} | $${r.finalBalance.toFixed(0)} | ${r.riskRange} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runAdaptiveRiskAccountImpact.js <dir-with-csvs>');
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
  mdSections.push('# Risque évolutif (échelle "gagne = monte, perd = redescend") au niveau du COMPTE complet — US100 + US500');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte $${STARTING_BALANCE}, setup validé (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h, ` +
      'fvg-edge, 1:3, sweep ON), même GuardrailEngine que le bot réel. Chaque année simulée indépendamment depuis ' +
      "$10,000 le 1er janvier. Échelle testée : base 0.25%, +0.25% après chaque trade gagnant (plafond 1.00%), " +
      'reset direct à 0.25% après une perte, puis -0.05% supplémentaire par perte additionnelle en dessous de la ' +
      "base (plancher 0.10%) si la série de pertes continue. Un seul niveau de risque PARTAGÉ entre US100 et " +
      "US500 (comme le budget de trades des garde-fous), mis à jour au moment où N'IMPORTE QUEL trade se ferme. " +
      "Comparé à risque fixe 0.25% et 0.5% (nos deux références habituelles)."
  );
  mdSections.push('');

  const cfg = strategyConfig();
  const scenarios = [
    { label: 'Risque fixe — 0.25%/trade', riskPct: 0.25, adaptiveRiskConfig: null },
    { label: 'Risque fixe — 0.5%/trade', riskPct: 0.5, adaptiveRiskConfig: null },
    {
      label: 'Risque évolutif — base 0.25%, +0.25%/gain (plafond 1.00%), reset puis -0.05%/perte (plancher 0.10%)',
      riskPct: 0.25,
      adaptiveRiskConfig: { base: 0.25, step: 0.25, cap: 1.0, stepDown: 0.05, floor: 0.1 },
    },
    {
      label:
        'Risque évolutif (v2, tolère 1 perte isolée) — base 0.25%, +0.25%/gain (plafond 1.00%), NE reset qu\'à la 2e perte d\'affilée, puis -0.05%/perte (plancher 0.10%)',
      riskPct: 0.25,
      adaptiveRiskConfig: { base: 0.25, step: 0.25, cap: 1.0, stepDown: 0.05, floor: 0.1, resetAfterLosses: 2 },
    },
  ];

  for (const scenario of scenarios) {
    mdSections.push(`## ${scenario.label}`);
    mdSections.push('| Année | Trades | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5%) | Solde final | Risque utilisé (min-max, moy) |');
    mdSections.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const year of YEARS) {
      const r = simulateYear(candlesBySymbolFull, year, cfg, scenario);
      mdSections.push(fmtRow(year, r));
      console.error(`[${scenario.label}] ${year}: ${r ? r.trades + ' trades, solde $' + r.finalBalance.toFixed(0) : 'skip'}`);
    }
    mdSections.push('');
  }

  const outMd = path.join(dir, 'adaptive-risk-account-impact.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
