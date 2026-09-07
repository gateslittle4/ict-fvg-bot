#!/usr/bin/env node
// runTimeframeComparisonAnalysis.js
// Usage: node scripts/runTimeframeComparisonAnalysis.js <dir-with-csvs>
//
// Direct answer to: "is it the TIMEFRAME (M15) that's causing our low win
// rate?" Isolates that one variable - same FVG rule (3-candle gap), same
// stop mode (fvg-edge), same 1:3 R:R, same maxAgeCandles=50, NO other
// filters (no HTF bias, no structure/BOS, no session, no liquidity sweep)
// - run on the exact same underlying price history resampled to three
// timeframes: M15 (what the project actually trades), H1, and H4. Any
// difference in win rate/expectancy between the three rows for the same
// symbol is then attributable to timeframe/bar-size alone, not to a
// confound from the other filters this project already uses.
//
// Important framing check BEFORE looking at any result: 1:3 R:R already
// has a mechanical breakeven win rate of 25% (1 win pays for 3 losses)
// before costs - so a "low" 30-45% win rate at 1:3 is not evidence of a
// problem, it is what a working 1:3 strategy is SUPPOSED to look like.
// This script exists to check whether trading the SAME rule on a higher
// timeframe changes that number, not to chase a higher win rate for its
// own sake (see bollinger-rsi-*-analysis.md for why that's a trap).
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { FvgEngine } from '../src/engines/fvgEngine.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { withNet } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const RR_MULTIPLE = 3; // same convention as the project's validated FVG configs
const STOP_MODE = 'fvg-edge';
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const TIMEFRAMES = [
  { key: 'M15', ms: null }, // null = use the raw M15 candles as-is, no resampling
  { key: 'H1', ms: TIMEFRAME_MS.H1 },
  { key: 'H4', ms: TIMEFRAME_MS.H4 },
];

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp) {
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runTimeframeComparisonAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# Le timeframe (M15) explique-t-il le taux de gain relativement bas ?');
  md.push('');
  md.push(
    "⚠ Isolation d'UNE seule variable : même règle FVG (gap à 3 bougies), même stop (fvg-edge), même cible 1:3, " +
      "même âge max de zone (50 bougies), AUCUN autre filtre (pas de biais HTF, pas de structure/BOS, pas de " +
      "session, pas de liquidity sweep) - lancé sur le MÊME historique de prix, ré-échantillonné en M15 (ce qui " +
      "tourne réellement), H1 et H4. Toute différence entre les lignes d'un même symbole vient donc du " +
      "timeframe/de la taille de bougie seule, pas d'un des autres filtres déjà utilisés par ailleurs. Rappel avant " +
      "de lire les résultats : à 1:3, le seuil de rentabilité mécanique est 25% de gains (1 gain paie 3 pertes) " +
      "AVANT coûts - un taux de gain de 30-45% à 1:3 n'est donc pas un problème en soi, c'est à ça que ressemble " +
      "une stratégie 1:3 qui fonctionne. Ce script sert à vérifier si le timeframe change ce chiffre, pas à " +
      "chasser un taux de gain plus haut pour lui-même (voir bollinger-rsi-*-analysis.md sur ce piège). Écran " +
      "TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Timeframe | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    if (!m15 || m15.length === 0) continue;
    const spread = DEFAULT_SPREADS[symbol] ?? 0;

    for (const tf of TIMEFRAMES) {
      const candles = tf.ms ? resampleCandles(m15, tf.ms) : m15;
      const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
      const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);
      if (trainCandles.length < 20 || testCandles.length < 20) continue;

      const trainEngine = new FvgEngine({ symbol });
      const trainTrades = runBacktest({ candles: trainCandles, symbol, fvgEngine: trainEngine, stopMode: STOP_MODE, rrMultiple: RR_MULTIPLE });
      const testEngine = new FvgEngine({ symbol });
      const testTrades = runBacktest({ candles: testCandles, symbol, fvgEngine: testEngine, stopMode: STOP_MODE, rrMultiple: RR_MULTIPLE });

      const { summaryNet: ts } = withNet(trainTrades, spread);
      const { summaryNet: es } = withNet(testTrades, spread);
      const v = verdict(ts.expectancyR, es.expectancyR);

      md.push(`| ${symbol} | ${tf.key} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
      console.error(`[${symbol} ${tf.key}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'timeframe-comparison-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
