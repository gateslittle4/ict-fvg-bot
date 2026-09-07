#!/usr/bin/env node
// runFvgH1NativeAnalysis.js
// Usage: node scripts/runFvgH1NativeAnalysis.js <dir-with-csvs>
//
// Follow-up to timeframe-comparison-analysis.md: that test isolated
// timeframe alone (baseline FVG, no filters) and found H1/H4 often beat
// M15 on raw expectancy. This script asks the real question: does that
// hold up once we apply the EXACT SAME validated filter stack each symbol
// already uses on M15 (HTF bias variant, structure/BOS, session window,
// liquidity sweep, stop mode, 1:3 R:R) - but with FVG zones detected and
// traded NATIVELY on H1 candles instead of M15? Same configs, same
// decision made BEFORE running (no new tuning) - just swap the base
// timeframe from M15 to H1.
//
// Expected trade-off, stated up front: H1-native will have far fewer
// signals (3-candle FVG gaps are rarer on H1; the session window that
// captures ~4 M15 candles/day now captures ~1 H1 candle/day) - so this is
// explicitly a frequency-for-quality trade, and some cells may have too
// few trades to trust. Reported honestly either way.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();

// Same validated per-symbol configs as the final combined account-impact script -
// unchanged, just applied to H1-native candles instead of M15.
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < 10 || testN < 10) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runFvgH1NativeAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const md = [];
  md.push('# FVG négocié nativement en H1 (au lieu de M15) - même config validée par instrument');
  md.push('');
  md.push(
    "⚠ Même config EXACTE que le combo M15 recommandé (variant de biais, structure/BOS, fenêtre de session, " +
      "liquidity sweep, mode de stop, cible 1:3) - décidée AVANT ce test, aucun nouveau réglage. Seul changement : " +
      "les zones FVG sont détectées et négociées directement sur des bougies D'1 HEURE au lieu de 15 minutes. " +
      "Attendu à l'avance : beaucoup moins de signaux (un gap à 3 bougies est plus rare en H1 ; une fenêtre de " +
      "session qui capturait ~4 bougies M15/jour n'en capture plus qu'~1 en H1) - certaines cases auront donc peu " +
      "de trades, signalé honnêtement plutôt que caché. Écran TRAIN (2019-2023) / vérification TEST (2024-2025), " +
      "même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles: m15 } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    if (!m15 || m15.length === 0) continue;
    const h1 = resampleCandles(m15, TIMEFRAME_MS.H1);
    const trainCandles = h1.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = h1.filter((c) => c.time >= TRAIN_CUTOFF);
    const cfg = FVG_CONFIG[symbol];

    const { engine: trainEngine } = buildFilteredEngine(trainCandles, symbol, cfg);
    const trainTrades = runBacktest({ candles: trainCandles, symbol, fvgEngine: trainEngine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
    const { engine: testEngine } = buildFilteredEngine(testCandles, symbol, cfg);
    const testTrades = runBacktest({ candles: testCandles, symbol, fvgEngine: testEngine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });

    const { summaryNet: ts } = withNet(trainTrades, cfg.spread);
    const { summaryNet: es } = withNet(testTrades, cfg.spread);
    const v = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

    md.push(`| ${symbol} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${v} |`);
    console.error(`[${symbol}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
  }

  const outMd = path.join(dir, 'fvg-h1-native-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
