#!/usr/bin/env node
// checkFastChallengeRisk.js
// Usage: node scripts/checkFastChallengeRisk.js <dir-with-csvs>
//
// Question: could we just crank up risk-per-trade to finish a challenge in
// ~30 days instead of months? Tests that directly instead of guessing -
// runs the CURRENT best setup (US100 H4/EMA200, US500 H1/EMA50, structure
// ON, session 10h-11h Silver Bullet, fvg-edge, 1:3), WITH and WITHOUT the
// liquidity-sweep filter (sweep = fewer but higher-quality trades - the
// opposite lever from raising risk: more trades per month instead of bigger
// ones), at escalating risk levels (0.25% up to 5%), for each of the 7
// available years, and checks two things in just the FIRST 30 CALENDAR DAYS
// of that year:
//   1. Did the account reach the combined challenge target (+8% then +5% of
//      the new balance, ~13.4% total) within 30 days?
//   2. Did the account bust first (balance ever below 90% of starting
//      balance = the same static-drawdown proxy used elsewhere)?
//
// This directly tests the "keep the win rate, just go faster" idea: raising
// risk-per-trade doesn't change the win rate or R:R at all (same signals,
// same entries) - it only scales how much each win/loss is worth in
// dollars. So if the account can hit the target fast WITHOUT busting at
// some risk level, in every/most years, that would validate the idea. If
// it consistently busts before reaching target, that's hard evidence the
// "just risk more" plan doesn't actually work with this strategy's win
// rate/frequency - not a guess, a direct empirical check.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_LEVELS = [0.25, 0.5, 1, 2, 3, 5];
const STATIC_MAX_DD_PCT = 10;
const COMBINED_TARGET_MULTIPLE = 1.084 * 1.05; // ~+8% then +5% of the new balance, combined ballpark
const WINDOW_DAYS = 30;
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const TRAIN_YEARS = new Set([2019, 2020, 2021, 2022, 2023]);

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
function strategyConfig(liquiditySweepEnabled) {
  return {
    US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled, spread: DEFAULT_SPREADS.US100 },
    US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled, spread: DEFAULT_SPREADS.US500 },
  };
}

function fmtDate(ms) { return new Date(ms).toISOString().slice(0, 10); }

function simulate30Days(candlesBySymbolFull, year, riskPct, configBySymbol) {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const windowEnd = yearStart + WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const candlesBySymbol = {};
  for (const [symbol, candles] of Object.entries(candlesBySymbolFull)) {
    candlesBySymbol[symbol] = candles.filter((c) => c.time >= yearStart && c.time < windowEnd);
  }
  const activeSymbols = Object.keys(candlesBySymbol).filter((s) => candlesBySymbol[s].length >= 10);
  if (activeSymbols.length === 0) return null;

  const result = runPortfolioBacktest({
    candlesBySymbol,
    configBySymbol,
    riskPctPerTrade: riskPct,
    startingBalance: STARTING_BALANCE,
    guardrailConfig: CONFIG.guardrails,
  });

  const curve = result.equityCurve;
  const target = STARTING_BALANCE * COMBINED_TARGET_MULTIPLE;
  const bustThreshold = STARTING_BALANCE * (1 - STATIC_MAX_DD_PCT / 100);

  let bustDate = null;
  let targetDate = null;
  for (const p of curve) {
    if (!bustDate && p.balance <= bustThreshold) bustDate = fmtDate(p.time);
    if (!targetDate && p.balance >= target) targetDate = fmtDate(p.time);
    if (bustDate) break; // bust ends the challenge - nothing after counts
  }

  return {
    trades: result.totalTrades,
    finalBalance: curve.length > 0 ? curve.at(-1).balance : STARTING_BALANCE,
    bustDate,
    targetDate: bustDate ? null : targetDate, // a target reached AFTER busting doesn't count
  };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/checkFastChallengeRisk.js <dir-with-csvs>');
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
  mdSections.push('# "Aller plus vite en augmentant le risque" — test direct, 30 premiers jours de chaque année');
  mdSections.push('');
  mdSections.push(
    `⚠ Setup actuel (US100 H4/EMA200, US500 H1/EMA50, structure ON, session 10h-11h) testé SANS et AVEC le filtre ` +
      'liquidity sweep - sweep = moins de trades mais meilleure qualité, donc moins de munitions disponibles en 30 ' +
      `jours ; sans sweep = plus de trades, l'autre levier possible pour aller plus vite. Seul le risque/trade change ` +
      `dans chaque bloc, de 0.25% à 5%. Objectif combiné visé ≈ +13.4% (Phase 1 +8% puis Phase 2 +5% du nouveau solde) ` +
      `en ${WINDOW_DAYS} jours. Bust = solde tombé sous 90% du départ (repère indicatif, non revérifié sur ` +
      "fundingpips.com). Un bust arrête tout : un objectif atteint APRÈS un bust ne compte pas, exactement comme un " +
      'vrai challenge qui s\'arrête à la limite de perte.'
  );
  mdSections.push('');

  for (const [label, sweepEnabled] of [['Avec liquidity sweep (setup recommandé)', true], ['Sans liquidity sweep (plus de trades)', false]]) {
    const cfg = strategyConfig(sweepEnabled);
    mdSections.push(`## ${label}`);
    mdSections.push('| Risque/trade | ' + YEARS.map((y) => `${y}${TRAIN_YEARS.has(y) ? '*' : ''}`).join(' | ') + ' |');
    mdSections.push('|---|' + YEARS.map(() => '---').join('|') + '|');

    for (const riskPct of RISK_LEVELS) {
      const cells = YEARS.map((year) => {
        const r = simulate30Days(candlesBySymbolFull, year, riskPct, cfg);
        if (!r) return '—';
        if (r.bustDate) return `💥 busté (${r.bustDate})`;
        if (r.targetDate) return `✅ ${r.targetDate}`;
        return `pas atteint (${r.trades} trades, solde $${r.finalBalance.toFixed(0)})`;
      });
      mdSections.push(`| ${riskPct}% | ${cells.join(' | ')} |`);
      console.error(`[${label} @ ${riskPct}%] done`);
    }
    mdSections.push('');
  }
  mdSections.push('*années 2019-2023 = train (utilisées pour choisir la config, résultats optimistes) ; 2024-2025 = test (fiables).');

  const outMd = path.join(dir, 'fast-challenge-risk-check.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
