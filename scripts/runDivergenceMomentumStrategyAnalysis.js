#!/usr/bin/env node
// runDivergenceMomentumStrategyAnalysis.js
// Usage: node scripts/runDivergenceMomentumStrategyAnalysis.js <dir-with-csvs>
//
// The opposite bet from production Divergence (see src/backtest/
// divergenceMomentum.js): instead of buying the laggard expecting the
// US100/US500 log-price spread to converge (mean reversion, validated and
// live), buy the LEADER expecting the spread to keep widening (momentum).
// Same trigger/entry timing/stop/target conventions as production
// Divergence - only the symbol selection (leader vs laggard) differs.
//
// Priority pair: US100/US500 (the pair Divergence is actually validated
// and live on). EURUSD/GBPUSD included too, mirroring the existing
// "Divergence appliquée à EURUSD/GBPUSD" comparison already done for the
// mean-reversion version (also rejected there).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { computeDivergenceMomentumCandidates, runDivergenceMomentumBacktestForSymbol } from '../src/backtest/divergenceMomentum.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const PAIRS = [['US100', 'US500'], ['EURUSD', 'GBPUSD']];

function withCosts(trades, symbol) {
  const spread = DEFAULT_SPREADS[symbol] ?? 0;
  const viable = trades.filter((t) => !spread || t.distance >= spread * MIN_DISTANCE_SPREAD_MULTIPLE);
  const net = viable.map((t) => {
    const costR = spread > 0 ? spread / t.distance : 0;
    return { ...t, grossRMultiple: t.rMultiple, costR, rMultiple: t.rMultiple - costR };
  });
  return { net, droppedAsNonViable: trades.length - viable.length };
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runDivergenceMomentumStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Stratégie exploratoire #16 : Divergence Momentum (opposé de la Divergence de production)');
  md.push('');
  md.push(
    "⚠ Idée proposée à la demande explicite d'Esdras (\"on continue à chercher d'autres idées comme ça\" — " +
      "inversions de mécanismes déjà testés). La Divergence de production (validée, en direct sur US100/US500) " +
      "achète TOUJOURS le retardataire (laggard), pariant sur la convergence de l'écart de log-prix. Ceci parie " +
      "l'inverse : achète le LEADER (celui qui vient de prendre l'avance), pariant sur la CONTINUATION de " +
      "l'écart (momentum) plutôt que sa convergence. Même déclencheur (z-score du log-ratio, seuil 2, lookback " +
      "100), même entrée (bougie suivante), même stop (1.5×ATR), même cible 1:3, même timeout 480 bougies M15 " +
      "— seul le choix du symbole (leader au lieu de laggard) change. Testé sur US100/US500 (la paire réellement " +
      "validée/live) et EURUSD/GBPUSD (même comparaison déjà faite pour la version convergence). Écran TRAIN " +
      "(2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Paire | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const [symA, symB] of PAIRS) {
    const { candles: allA } = loadCandlesFromCsv(path.join(dir, `${symA}.csv`));
    const { candles: allB } = loadCandlesFromCsv(path.join(dir, `${symB}.csv`));

    const trainA = allA.filter((c) => c.time < TRAIN_CUTOFF);
    const trainB = allB.filter((c) => c.time < TRAIN_CUTOFF);
    const testA = allA.filter((c) => c.time >= TRAIN_CUTOFF);
    const testB = allB.filter((c) => c.time >= TRAIN_CUTOFF);

    function runPeriod(mA, mB) {
      const candidates = computeDivergenceMomentumCandidates(mA, symA, mB, symB);
      const candA = candidates.filter((c) => c.symbol === symA);
      const candB = candidates.filter((c) => c.symbol === symB);
      const tradesA = runDivergenceMomentumBacktestForSymbol(mA, candA);
      const tradesB = runDivergenceMomentumBacktestForSymbol(mB, candB);
      const { net: netA } = withCosts(tradesA, symA);
      const { net: netB } = withCosts(tradesB, symB);
      return summarizeTrades([...netA, ...netB]);
    }

    const ts = runPeriod(trainA, trainB);
    const es = runPeriod(testA, testB);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symA}/${symB} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symA}/${symB}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'divergence-momentum-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
