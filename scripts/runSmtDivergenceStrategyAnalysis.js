#!/usr/bin/env node
// runSmtDivergenceStrategyAnalysis.js
// Usage: node scripts/runSmtDivergenceStrategyAnalysis.js <dir-with-csvs>
//
// ICT "SMT Divergence" (Smart Money Technique) — a new mechanism, distinct
// from both the existing statistical Divergence (mean-reversion on the
// US100/US500 log-ratio z-score) and the already-tested/rejected cross-pair
// liquidity-sweep confluence. See src/backtest/smtDivergence.js for the
// full method writeup: swing highs/lows via the existing symmetric-fractal
// detector (marketStructure.js, lookback=5, same convention already used
// for the structure/sweep filters), a divergence when one instrument
// extends its own prior swing extreme while its correlated partner does
// not, confirmed only once instrument A's own Market Structure Shift (a
// close beyond its most recently confirmed opposite swing — the same BOS
// rule as marketStructure.js) fires. Entry at next-candle open, stop
// beyond the swept extreme, fixed 1:3 R:R target, 480 M15-candle timeout
// (same conventions as FVG/OTE/Judas Swing/Asian Range Breakout).
//
// Scope intrinsically limited to a correlated pair, same documented
// limitation as the existing statistical Divergence strategy. US100/US500
// reused (already the correlated pair used elsewhere in this project).
// BOTH assignments tested and reported (US100 as the diverging instrument
// checked against US500, and the mirror) — decided up front, never
// picking the better one after seeing results.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project (including the "not
// enough trades" guard). All parameters above were fixed BEFORE running
// this script against real data.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { summarizeTrades } from '../src/backtest/backtestEngine.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { runSmtDivergenceBacktest } from '../src/backtest/smtDivergence.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const PAIRS = [
  { a: 'US100', b: 'US500' },
  { a: 'US500', b: 'US100' },
];

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
    console.error('Usage: node scripts/runSmtDivergenceStrategyAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const cache = {};
  function loadSymbol(symbol) {
    if (!cache[symbol]) cache[symbol] = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`)).candles;
    return cache[symbol];
  }

  const md = [];
  md.push('# Stratégie exploratoire ICT #9 : SMT Divergence (Smart Money Technique, US100/US500)');
  md.push('');
  md.push(
    "⚠ Concept ICT publié, jamais testé jusqu'ici dans ce projet — distinct de la Divergence statistique déjà en " +
      "production (celle-ci trade l'ÉCART entre les deux instruments ; celle-ci trade UN SEUL instrument, l'autre " +
      "servant uniquement de confirmation structurelle) et du filtre de confluence liquidity-sweep croisé déjà " +
      "testé/rejeté (cross-pair-sweep-confluence-analysis.md, qui exigeait un sweep sur les deux à la fois pour " +
      "filtrer une entrée FVG — ceci compare l'EXTENSION d'un swing, sans aucun FVG). Swings détectés via le même " +
      "fractal symétrique déjà utilisé pour les filtres structure/sweep (lookback=5). Divergence = l'instrument A " +
      "dépasse son propre plus-haut/plus-bas de swing précédent alors que B ne confirme pas au même point de " +
      "swing. Entrée seulement après confirmation par Market Structure Shift (MSS) sur A lui-même (même règle BOS " +
      "que marketStructure.js), à l'ouverture de la bougie suivante, stop au-delà de l'extrême balayé, cible fixe " +
      "1:3, timeout 480 bougies M15 (mêmes conventions que FVG/OTE/Judas Swing/Asian Range Breakout). Scope " +
      "intrinsèquement limité à une paire corrélée (même limite documentée que la Divergence statistique) — " +
      'US100/US500 réutilisés (déjà la paire corrélée du projet). Les DEUX sens testés et rapportés (A=US100/' +
      'B=US500 et le miroir) — décidé à l\'avance, jamais choisi après coup.'
  );
  md.push('');
  md.push('| A (dirige) / B (confirme) | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const { a, b } of PAIRS) {
    const candlesA = loadSymbol(a);
    const candlesB = loadSymbol(b);
    const trainA = candlesA.filter((c) => c.time < TRAIN_CUTOFF);
    const trainB = candlesB.filter((c) => c.time < TRAIN_CUTOFF);
    const testA = candlesA.filter((c) => c.time >= TRAIN_CUTOFF);
    const testB = candlesB.filter((c) => c.time >= TRAIN_CUTOFF);

    const trainTrades = runSmtDivergenceBacktest(trainA, trainB);
    const testTrades = runSmtDivergenceBacktest(testA, testB);
    const { net: trainNet } = withCosts(trainTrades, a);
    const { net: testNet } = withCosts(testTrades, a);
    const ts = summarizeTrades(trainNet);
    const es = summarizeTrades(testNet);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${a}/${b} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${a} dirige / ${b} confirme] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'smt-divergence-strategy-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
