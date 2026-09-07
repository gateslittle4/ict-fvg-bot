#!/usr/bin/env node
// runChallengeSimulation2025.js
// Usage: node scripts/runChallengeSimulation2025.js <dir-with-csvs>
//
// Answers a very concrete question: "if I had started a $10,000 FundingPips
// challenge on 2025-01-01 with the CURRENT setup (US100 + US500, session
// 10h-11h NY 'Silver Bullet', structure ON, fvg-edge, 1:3, no liquidity-sweep
// filter — see docs/STRATEGY.md), how long would it have taken, and would it
// have busted?"
//
// Reuses the exact same runPortfolioBacktest (same GuardrailEngine, same
// compounding risk sizing) as runPortfolioReport.js, restricted to the
// single calendar year 2025 (2025-01-01T00:00:00Z .. 2026-01-01T00:00:00Z),
// starting balance $10,000.
//
// Adds challenge-specific interpretation the generic portfolio report
// doesn't do:
//   - Phase 1 target = +8% of the ORIGINAL starting balance.
//   - Phase 2 target = +5% of the balance AT THE MOMENT Phase 1 was hit (not
//     +5% of the original $10,000) - matches how a 2-step challenge works
//     (you keep trading on the account you already grew).
//   - A STATIC bust check: did the balance ever drop below 90% of the
//     ORIGINAL $10,000 at any point (a common "static max total drawdown"
//     rule)? This is separate from the simulator's own maxDrawdownPct, which
//     measures trailing peak-to-trough drawdown - the two can disagree, and
//     we report both.
//
// ⚠ FundingPips' exact numbers (8%/5% targets, 10% static vs trailing
// drawdown, whether Phase 2's drawdown limit re-bases) were never fully
// verified against fundingpips.com this session - treat the specific
// thresholds as indicative, not authoritative. Re-verify before relying on
// this for a real challenge attempt.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';
import { CONFIG } from '../src/config.js';

const STARTING_BALANCE = 10000;
const RISK_LEVELS = [0.25, 0.5];
const YEAR_START = new Date('2025-01-01T00:00:00Z').getTime();
const YEAR_END = new Date('2026-01-01T00:00:00Z').getTime();
const STATIC_MAX_DD_PCT = 10; // indicative - re-verify against fundingpips.com
const PHASE1_TARGET_MULTIPLE = 1.08;
const PHASE2_TARGET_MULTIPLE = 1.05;

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const STRATEGY_CONFIG = {
  US100: { variant: 'baseline', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, spread: DEFAULT_SPREADS.US500 },
};

function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runChallengeSimulation2025.js <dir-with-csvs>');
    process.exit(1);
  }

  const candlesBySymbol = {};
  for (const symbol of Object.keys(STRATEGY_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) {
      console.error(`[skip] ${symbol}: ${filePath} not found`);
      continue;
    }
    const { candles } = loadCandlesFromCsv(filePath);
    candlesBySymbol[symbol] = candles.filter((c) => c.time >= YEAR_START && c.time < YEAR_END);
  }

  const mdSections = [];
  mdSections.push('# Simulation "challenge 2025" — $10,000, setup actuel (US100 + US500)');
  mdSections.push('');
  mdSections.push(
    `⚠ Simule un compte de $${STARTING_BALANCE} qui aurait ouvert le 2025-01-01 et tradé toute l'année 2025 avec le setup ` +
      'actuellement recommandé (docs/STRATEGY.md) : US100 = baseline, structure ON, session 10h-11h NY, fvg-edge, 1:3 — ' +
      'US500 = H1/EMA200, structure ON, session 10h-11h NY, fvg-edge, 1:3. Sans le filtre liquidity sweep (celui-ci reste ' +
      'optionnel/prudence, voir liquidity-sweep-comparison.md). Même GuardrailEngine que le bot réel (2 trades/jour ' +
      'partagés, cooldown 30 min après perte, stop journalier interne -2%).'
  );
  mdSections.push('');
  mdSections.push(
    '⚠⚠ Repères FundingPips utilisés ici (2-Step Standard, NON reverifiés sur fundingpips.com cette session — à confirmer ' +
      'avant un vrai challenge) : Phase 1 = +8% du solde de départ, Phase 2 = +5% du solde ATTEINT à la fin de la Phase 1 ' +
      '(pas +5% du solde de départ), perte totale max ~10% (on teste ici la version "statique" : solde qui ne descend ' +
      'jamais sous 90% du solde de départ - à distinguer du drawdown "trailing"/pic-à-creux que le simulateur calcule par ' +
      'ailleurs, les deux sont rapportés séparément).'
  );
  mdSections.push('');

  const activeSymbols = Object.keys(candlesBySymbol).filter((s) => candlesBySymbol[s].length >= 50);
  if (activeSymbols.length === 0) {
    console.error('No 2025 candles found for any symbol - check the CSV date ranges.');
    process.exit(1);
  }
  for (const symbol of activeSymbols) {
    const c = candlesBySymbol[symbol];
    mdSections.push(`- ${symbol}: ${c.length} bougies M15 en 2025, du ${fmtDate(c[0].time)} au ${fmtDate(c.at(-1).time)}.`);
  }
  mdSections.push('');

  mdSections.push('| Risque/trade | Trades pris | Win rate | Solde min. atteint | Drawdown statique (vs $10,000 initial) | Drawdown trailing (pic-à-creux) | Busté (>10% statique)? | Phase 1 (+8%) atteinte | Phase 2 (+5% du nouveau solde) atteinte |');
  mdSections.push('|---|---|---|---|---|---|---|---|---|');

  for (const riskPct of RISK_LEVELS) {
    const result = runPortfolioBacktest({
      candlesBySymbol,
      configBySymbol: STRATEGY_CONFIG,
      riskPctPerTrade: riskPct,
      startingBalance: STARTING_BALANCE,
      guardrailConfig: CONFIG.guardrails,
    });

    const firstTime = Math.min(...activeSymbols.map((s) => candlesBySymbol[s][0].time));
    const curve = result.equityCurve;

    const minBalance = curve.length > 0 ? Math.min(STARTING_BALANCE, ...curve.map((p) => p.balance)) : STARTING_BALANCE;
    const staticDrawdownPct = ((STARTING_BALANCE - minBalance) / STARTING_BALANCE) * 100;
    const busted = staticDrawdownPct >= STATIC_MAX_DD_PCT;
    // First point (if any) where the static bust threshold was crossed.
    const bustPoint = curve.find((p) => (STARTING_BALANCE - p.balance) / STARTING_BALANCE * 100 >= STATIC_MAX_DD_PCT);

    const phase1Target = STARTING_BALANCE * PHASE1_TARGET_MULTIPLE;
    const phase1Point = curve.find((p) => p.balance >= phase1Target);
    let phase1Label = 'jamais en 2025';
    let phase2Label = 'jamais en 2025';
    if (phase1Point) {
      const days1 = daysBetween(firstTime, phase1Point.time);
      phase1Label = `${fmtDate(phase1Point.time)} (jour ${days1}, solde $${phase1Point.balance.toFixed(0)})`;

      const phase2Target = phase1Point.balance * PHASE2_TARGET_MULTIPLE;
      const phase2Point = curve.find((p) => p.time > phase1Point.time && p.balance >= phase2Target);
      if (phase2Point) {
        const days2 = daysBetween(firstTime, phase2Point.time);
        phase2Label = `${fmtDate(phase2Point.time)} (jour ${days2}, solde $${phase2Point.balance.toFixed(0)})`;
      }
    }

    mdSections.push(
      `| ${riskPct}% | ${result.totalTrades} | ${result.winRate !== null ? (result.winRate * 100).toFixed(1) + '%' : '—'} | ` +
        `$${minBalance.toFixed(0)} | ${staticDrawdownPct.toFixed(1)}% | ${result.maxDrawdownPct.toFixed(1)}% | ` +
        `${busted ? `**OUI** (le ${fmtDate(bustPoint.time)})` : 'non'} | ${phase1Label} | ${phase2Label} |`
    );
  }
  mdSections.push('');
  mdSections.push(
    "Note : \"busté\" ici veut dire que le solde est descendu sous $9,000 (perte statique de 10% depuis le départ) à un " +
      "moment de l'année - un vrai challenge se serait arrêté à cet instant précis, donc tout ce qui arrive APRÈS cette " +
      "date dans la simulation n'aurait jamais eu lieu en réalité (le calcul continue quand même ici, pour information)."
  );

  const outMd = path.join(dir, 'challenge-simulation-2025.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
