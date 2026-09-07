#!/usr/bin/env node
// runPortfolioReport.js
// Usage: node scripts/runPortfolioReport.js <dir-with-csvs>
//
// Guardrail-aware, multi-symbol account simulation for the two configs that
// survived out-of-sample validation (EURUSD/GBPUSD dropped from the plan -
// see src/config.js; neither pair held up on test data with a real edge):
//   US100: baseline (no HTF filter), structure ON, session 10h-11h (Silver Bullet, NY time), fvg-edge, 1:3
//   US500: H1_EMA200, structure ON, session 10h-11h (Silver Bullet, NY time), fvg-edge, 1:3
// The 10h-11h window replaces the original 08h-12h NY AM reference: it beat
// 08h-12h on TEST for both indices (see session-window-comparison.md).
// Both symbols share ONE account and the EXACT SAME GuardrailEngine class
// the live bot uses (max 2 trades/day, 30-min cooldown after a loss, 2%
// daily loss stop — see src/config.js), so this answers "what would this
// account's balance and drawdown actually have looked like," not the
// idealized every-signal-taken numbers in backtest-report.md.
//
// Their DEFAULT_SPREADS values (1.0 point / 0.4 point) remain INDICATIVE and
// unverified against the real FundingPips/cTrader contract specs — see
// transactionCosts.js.
//
// Runs each of 2 risk levels (0.5%, 0.25% of balance per trade) over 2
// windows (the full available history, and the 2024-2025 out-of-sample test
// period only), and reports starting/ending balance, max drawdown %, trade
// count, and how many candidate signals the guardrail blocked and why.
//
// ⚠ US100 and US500 are ~0.93-correlated with each other (see
// backtest-report.md's correlation matrix) — this is NOT a diversified
// 2-asset account, it's close to the same bet taken twice. Treat the
// drawdown numbers below accordingly.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';
import { CONFIG } from '../src/config.js';

const CUTOFF_ISO = '2024-01-01T00:00:00Z';
const STARTING_BALANCE = 10000;
const RISK_LEVELS = [0.5, 0.25];

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };

// Found by re-running the full 168-config grid with the session window FIXED
// to 10h-11h (see silver-bullet-grid-search.md) instead of recycling the
// config chosen back when the window was still 08h-12h. Adding back the HTF
// EMA bias filter AND the liquidity-sweep filter on top of structure+session
// beats every earlier candidate on TEST profit factor for both symbols -
// at the cost of a smaller signal count (30-40 test signals), so treat the
// exact PF numbers as promising but statistically thinner than before.
const STRATEGY_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
};

// Only one portfolio composition now that the plan is indices-only.
const PORTFOLIOS = {
  'US100 + US500 (session 10h-11h Silver Bullet)': ['US100', 'US500'],
};

function fmtPct(x, d = 1) {
  return x === null || x === undefined ? '—' : (x * 1).toFixed(d) + '%';
}
function fmtNum(x, d = 0) {
  return Number(x).toFixed(d);
}
function fmtDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// First date (if any) the equity curve closed at or above `targetMultiple x startingBalance`.
function daysToReachTarget(equityCurve, startingBalance, targetMultiple, firstTime) {
  const target = startingBalance * targetMultiple;
  const hit = equityCurve.find((p) => p.balance >= target);
  if (!hit) return null;
  return Math.round((hit.time - firstTime) / (24 * 60 * 60 * 1000));
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runPortfolioReport.js <dir-with-csvs>');
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
    candlesBySymbol[symbol] = candles;
  }

  if (Object.keys(candlesBySymbol).length === 0) {
    console.error('No usable CSVs found.');
    process.exit(1);
  }

  const cutoffMs = new Date(CUTOFF_ISO).getTime();
  const windows = {
    'Historique complet': candlesBySymbol,
    'Test seul (2024-2025, hors-échantillon)': Object.fromEntries(
      Object.entries(candlesBySymbol).map(([s, c]) => [s, c.filter((x) => x.time >= cutoffMs)])
    ),
  };

  const mdSections = [];
  mdSections.push('# Simulation de compte avec garde-fous — ICT FVG (M15)');
  mdSections.push('');
  mdSections.push(
    `⚠ Simule EXACTEMENT le même GuardrailEngine que le bot en direct (max ${CONFIG.guardrails.maxTradesPerDay} trades/jour, ` +
      `cooldown ${CONFIG.guardrails.cooldownMinutesAfterLoss} min après une perte, arrêt à -${CONFIG.guardrails.dailyLossLimitPct}%/jour, ` +
      'budget PARTAGÉ entre US100 et US500). Risque composé sur le solde courant (pas fixe). ' +
      'Configs utilisées : le meilleur combo trouvé en fixant la fenêtre 10h-11h "Silver Bullet" dès le départ de la ' +
      'recherche (voir silver-bullet-grid-search.md), pas juste la config recyclée de la fenêtre 08h-12h : ' +
      'US100 = H4/EMA200, structure ON, session 10h-11h, fvg-edge, 1:3, liquidity sweep ON — ' +
      'US500 = H1/EMA50, structure ON, session 10h-11h, fvg-edge, 1:3, liquidity sweep ON.'
  );
  mdSections.push('');
  mdSections.push(
    '⚠⚠ Repères FundingPips (2-Step Standard, à revérifier sur fundingpips.com car ça varie selon la formule choisie et peut ' +
      'changer) : perte quotidienne max ~5%, perte totale max ~10% (statique), objectif +8% (phase 1) puis +5% (phase 2).'
  );
  mdSections.push('');
  mdSections.push(
    '⚠⚠⚠ US100 et US500 sont corrélés à 0.93 entre eux (voir backtest-report.md) — ce compte à 2 symboles ne diversifie ' +
      "presque rien, c'est plus proche du même pari pris deux fois qu'un vrai portefeuille à 2 actifs indépendants. " +
      'Les spreads US100 (1.0 point) et US500 (0.4 point) restent des valeurs INDICATIVES non vérifiées contre les vraies ' +
      'specs FundingPips/cTrader.'
  );
  mdSections.push('');

  for (const [portfolioLabel, symbolsInPortfolio] of Object.entries(PORTFOLIOS)) {
    mdSections.push(`# Compte : ${portfolioLabel}`);
    mdSections.push('');

    for (const [windowLabel, windowCandles] of Object.entries(windows)) {
      const activeSymbols = symbolsInPortfolio.filter(
        (s) => windowCandles[s] && windowCandles[s].length >= 200
      );
      if (activeSymbols.length === 0) continue;

      mdSections.push(`## ${windowLabel}`);
      for (const symbol of activeSymbols) {
        const c = windowCandles[symbol];
        mdSections.push(`- ${symbol}: ${c.length} bougies M15, du ${fmtDate(c[0].time)} au ${fmtDate(c.at(-1).time)}.`);
      }
      mdSections.push('');
      mdSections.push('| Risque/trade | Solde final | Rendement total | Max drawdown | Trades pris | Win rate | Signaux bloqués (garde-fous) | dont max/jour | dont cooldown | dont stop journalier | Jours pour +8% | Jours pour +5% |');
      mdSections.push('|---|---|---|---|---|---|---|---|---|---|---|---|');

      for (const riskPct of RISK_LEVELS) {
        const candlesForWindow = Object.fromEntries(activeSymbols.map((s) => [s, windowCandles[s]]));
        const configForWindow = Object.fromEntries(activeSymbols.map((s) => [s, STRATEGY_CONFIG[s]]));
        const result = runPortfolioBacktest({
          candlesBySymbol: candlesForWindow,
          configBySymbol: configForWindow,
          riskPctPerTrade: riskPct,
          startingBalance: STARTING_BALANCE,
          guardrailConfig: CONFIG.guardrails,
        });

        const firstTime = Math.min(...activeSymbols.map((s) => windowCandles[s][0].time));
        const days8 = daysToReachTarget(result.equityCurve, STARTING_BALANCE, 1.08, firstTime);
        const days5 = daysToReachTarget(result.equityCurve, STARTING_BALANCE, 1.05, firstTime);

        mdSections.push(
          `| ${riskPct}% | ${fmtNum(result.finalBalance)} | ${result.totalReturnPct >= 0 ? '+' : ''}${fmtNum(result.totalReturnPct, 1)}% | ` +
            `${fmtNum(result.maxDrawdownPct, 1)}% | ${result.totalTrades} | ${fmtPct(result.winRate !== null ? result.winRate * 100 : null)} | ` +
            `${result.blockedSignalsCount} | ${result.blockReasonCounts.max_trades_reached || 0} | ${result.blockReasonCounts.cooldown_active || 0} | ` +
            `${result.blockReasonCounts.daily_loss_limit_reached || 0} | ${days8 === null ? 'jamais dans la fenêtre' : days8} | ${days5 === null ? 'jamais dans la fenêtre' : days5} |`
        );
      }
      mdSections.push('');
    }
  }

  const outMd = path.join(dir, 'portfolio-simulation.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
