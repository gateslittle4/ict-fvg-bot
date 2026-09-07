#!/usr/bin/env node
// runChallengeSimulationByYear.js
// Usage: node scripts/runChallengeSimulationByYear.js <dir-with-csvs>
//
// Extends runChallengeSimulation2025.js: same $10,000 "if I'd started a
// FundingPips challenge on Jan 1 of year Y" question, but run across EVERY
// calendar year we have data for (2019-2025), and for both variants of the
// current setup - WITHOUT and WITH the ICT liquidity-sweep confluence filter
// (see docs/STRATEGY.md / liquidity-sweep-comparison.md).
//
// ⚠ CRITICAL to read the results correctly: 2019-2023 are TRAIN years - the
// exact years used to originally pick this strategy's parameters (HTF bias,
// structure, 10h-11h session window, 1:3 R:R). Results in those years are
// expected to look better than reality because the config was implicitly
// selected to do well there. 2024-2025 are the genuine out-of-sample TEST
// years - never used to choose anything - and are the only years that
// really tell you what to expect going forward. Both are reported, clearly
// labeled, so you can see the gap between "years we tuned on" and "years we
// didn't."
//
// Same FundingPips reference numbers as runChallengeSimulation2025.js
// (Phase 1 = +8% of starting balance, Phase 2 = +5% of the balance AT THE
// END of Phase 1, static bust = balance ever below 90% of the $10,000
// starting balance) - NOT reverified against fundingpips.com this session.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_LEVELS = [0.25, 0.5]; // the new setup's much lower observed drawdowns leave room to test 0.5% too
const STATIC_MAX_DD_PCT = 10;
const PHASE1_TARGET_MULTIPLE = 1.08;
const PHASE2_TARGET_MULTIPLE = 1.05;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
// Best-found combo per symbol from silver-bullet-grid-search.md (HTF bias
// re-added on top of structure+session, window fixed to 10h-11h from the
// start of the search) - not the recycled 08h-12h-era config anymore.
function strategyConfig(liquiditySweepEnabled) {
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled, spread: DEFAULT_SPREADS.US100 },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled, spread: DEFAULT_SPREADS.US500 },
  };
}

function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

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
    phase1Label = `jour ${daysBetween(firstTime, phase1Point.time)} (${fmtDate(phase1Point.time)})`;
    const phase2Target = phase1Point.balance * PHASE2_TARGET_MULTIPLE;
    const phase2Point = curve.find((p) => p.time > phase1Point.time && p.balance >= phase2Target);
    if (phase2Point) phase2Label = `jour ${daysBetween(firstTime, phase2Point.time)} (${fmtDate(phase2Point.time)})`;
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
  };
}

function fmtRow(year, r) {
  if (!r) return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | — pas assez de données | | | | | | |`;
  const wr = r.winRate !== null ? (r.winRate * 100).toFixed(1) + '%' : '—';
  const bustCell = r.busted ? `**OUI** (${r.bustDate})` : 'non';
  return `| ${year}${TRAIN_YEARS.has(year) ? ' (train)' : ' (test)'} | ${r.trades} | ${wr} | ${r.staticDrawdownPct.toFixed(1)}% | ${r.trailingDrawdownPct.toFixed(1)}% | ${bustCell} | ${r.phase1Label} | ${r.phase2Label} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runChallengeSimulationByYear.js <dir-with-csvs>');
    process.exit(1);
  }

  const candlesBySymbolFull = {};
  for (const symbol of ['US100', 'US500']) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    candlesBySymbolFull[symbol] = candles;
  }

  const mdSections = [];
  mdSections.push('# Simulation "challenge $10,000" par année, avec et sans filtre liquidity sweep');
  mdSections.push('');
  mdSections.push(
    `⚠ Compte de $${STARTING_BALANCE}, setup US100 (H4/EMA200) + US500 (H1/EMA50), structure ICT ON, session 10h-11h NY ` +
      '"Silver Bullet", fvg-edge, 1:3 - le meilleur combo trouvé en fixant la fenêtre dès le départ de la recherche (voir ' +
      'silver-bullet-grid-search.md), même GuardrailEngine que le bot réel. Chaque année est simulée INDÉPENDAMMENT à ' +
      "partir de $10,000 le 1er janvier de cette année-là (pas de report du solde d'une année à l'autre). Deux niveaux de " +
      'risque testés (0.25% et 0.5%) - ce setup montre des drawdowns nettement plus bas que le précédent, ce qui laisse ' +
      'de la marge pour tester un risque un peu plus élevé sans dépasser les limites FundingPips.'
  );
  mdSections.push('');
  mdSections.push(
    '⚠⚠ **2019-2023 = années "train"** (utilisées pour choisir cette config au départ - les résultats y sont probablement ' +
      'optimistes/gonflés). **2024-2025 = années "test"**, jamais utilisées pour choisir quoi que ce soit - ce sont les ' +
      "SEULES qui donnent une vraie idée de ce à quoi s'attendre. Repères FundingPips (Phase 1 +8%, Phase 2 +5% du " +
      'nouveau solde, bust statique à -10%) non revérifiés sur fundingpips.com cette session.'
  );
  mdSections.push('');

  for (const [sweepLabel, sweepEnabled] of [['Sans filtre liquidity sweep', false], ['Avec filtre liquidity sweep', true]]) {
    const cfg = strategyConfig(sweepEnabled);
    for (const riskPct of RISK_LEVELS) {
      mdSections.push(`## ${sweepLabel} — risque ${riskPct}%/trade`);
      mdSections.push('| Année | Trades pris | Win rate | Drawdown statique max | Drawdown trailing max | Busté (-10% statique)? | Phase 1 (+8%) | Phase 2 (+5% du nouveau solde) |');
      mdSections.push('|---|---|---|---|---|---|---|---|');
      for (const year of YEARS) {
        const r = simulateYear(candlesBySymbolFull, year, cfg, riskPct);
        mdSections.push(fmtRow(year, r));
        console.error(`[${sweepLabel} @ ${riskPct}%] ${year}: ${r ? r.trades + ' trades' : 'skip'}`);
      }
      mdSections.push('');
    }
  }

  const outMd = path.join(dir, 'challenge-simulation-by-year.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
