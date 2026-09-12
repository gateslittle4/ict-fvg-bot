#!/usr/bin/env node
// runFvgMultiTouchWindowAndWeekdayAnalysis.js
// Usage: node scripts/runFvgMultiTouchWindowAndWeekdayAnalysis.js <dir-with-csvs>
//
// Esdras's explicit follow-up (2026-09-12), after the "FVG en M15"
// comprehension check: "est-ce qu'on doit attendre 10-11h pour que le prix
// frappe le FVG ? Fais le test pour 8h-12h et 10-11h vs toute la journée
// pour voir lequel serait le plus profitable, ensuite fais le test pour les
// jours de la semaine le plus profitable aussi."
//
// Two independent questions, both on US100 multi-contact (MultiTouchFvgEngine,
// coded on this research branch, not yet deployed) - RR=5, H4_EMA200 bias,
// structure+sweep enabled, stop fvg-edge: every OTHER parameter identical to
// CONFIG.fvg.perSymbol.US100, only the thing under test changes each time,
// same discipline as every other comparison this session.
//
// 1) SESSION WINDOW: 08h-12h (wider Silver Bullet) vs 10h-11h (current
//    production) vs no session filter at all (24h). Only 3 discrete windows
//    tested, exactly what was asked - NOT a grid search over every possible
//    window (that would risk picking whichever window flatters the result
//    by chance, the same overfitting trap already documented elsewhere in
//    this project).
// 2) WEEKDAY: post-hoc split of the WINNING window's trades by entry weekday
//    (real, DST-aware NY local time via weekdayFilter.js's getRealNyWeekday -
//    more accurate than the older runDayOfWeekAnalysis.js's fixed -5h
//    approximation). Purely descriptive/exploratory - per-day sample sizes
//    are small (a fifth of an already-modest trade count), so this is NOT
//    run through the train/test verdict rule the way a real filter proposal
//    would be; it's reported as "worth watching", not "confirmed".
//
// Train (2019-2023) screen / test (2024-2025) verification throughout, same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest, summarizeTrades } from '../src/backtest/backtestEngine.js';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';
import { getRealNyWeekday } from '../src/backtest/weekdayFilter.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';
import { CONFIG } from '../src/config.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const MIN_DISTANCE_SPREAD_MULTIPLE = 3;
const MIN_TRADES_FOR_VERDICT = 10;
const SYMBOL = 'US100';
const BASE_CFG = CONFIG.fvg.perSymbol.US100;
const SPREAD = DEFAULT_SPREADS[SYMBOL] ?? 0;

const WINDOWS = [
  { key: '08h-12h', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 } } },
  { key: '10h-11h (production)', cfg: { ...BASE_CFG, sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 } } },
  { key: 'toute la journée (pas de fenêtre)', cfg: { ...BASE_CFG, sessionEnabled: false } },
];

const WEEKDAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function withCosts(trades) {
  const viable = trades.filter((t) => !SPREAD || t.distance >= SPREAD * MIN_DISTANCE_SPREAD_MULTIPLE);
  return viable.map((t) => {
    const costR = SPREAD > 0 ? SPREAD / t.distance : 0;
    return { ...t, rMultiple: t.rMultiple - costR };
  });
}

function runWindow(candles, cfg) {
  const predicate = buildMultiTouchFilterPredicate(candles, SYMBOL, cfg);
  const engine = new MultiTouchFvgEngine({ symbol: SYMBOL, checkFilters: predicate });
  const trades = withCosts(runBacktest({ candles, symbol: SYMBOL, fvgEngine: engine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple }));
  return { trades, summary: summarizeTrades(trades) };
}

function fmtNum(x, d = 2) { return x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '—'; }
function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < MIN_TRADES_FOR_VERDICT || testN < MIN_TRADES_FOR_VERDICT) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function statsByWeekday(trades) {
  const byDay = {};
  for (let d = 0; d <= 6; d++) byDay[d] = { trades: [], sumR: 0 };
  for (const t of trades) {
    const day = getRealNyWeekday(t.entryTime);
    byDay[day].trades.push(t);
    byDay[day].sumR += t.rMultiple;
  }
  return byDay;
}

function fmtWeekdayRow(label, entry) {
  const n = entry.trades.length;
  if (n === 0) return `| ${label} | 0 | — | — | — |`;
  const wins = entry.trades.filter((t) => t.outcome === 'win').length;
  const resolved = entry.trades.filter((t) => t.outcome !== 'timeout').length;
  const wr = resolved > 0 ? fmtPct(wins / resolved) : '—';
  const avgR = entry.sumR / n;
  return `| ${label} | ${n} | ${wr} | ${fmtNum(avgR)} | ${fmtNum(entry.sumR)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node scripts/runFvgMultiTouchWindowAndWeekdayAnalysis.js <dir-with-csvs>'); process.exit(1); }

  const { candles } = loadCandlesFromCsv(path.join(dir, `${SYMBOL}.csv`));
  const train = candles.filter((c) => c.time < TRAIN_CUTOFF);
  const test = candles.filter((c) => c.time >= TRAIN_CUTOFF);

  const md = [];
  md.push('# US100 multi-contact — fenêtre horaire (8h-12h / 10h-11h / journée entière) et jour de la semaine');
  md.push('');
  md.push(
    "Question directe d'Esdras (2026-09-12) : \"est-ce qu'on doit attendre 10-11h pour que le prix frappe le FVG ? " +
      "Fais le test pour 8h-12h et 10-11h vs toute la journée... ensuite fais le test pour les jours de la semaine " +
      "le plus profitable aussi.\" Tout tourne sur US100 multi-contact (`MultiTouchFvgEngine`, config production " +
      "verbatim à part la fenêtre testée), net de coûts. 3 fenêtres discrètes seulement — pas une recherche sur " +
      "toutes les fenêtres possibles, pour ne pas retomber dans le piège du surajustement déjà documenté ailleurs " +
      "dans ce projet."
  );
  md.push('');
  md.push('## 1. Fenêtre horaire');
  md.push('');
  md.push('| Fenêtre | Trades train | Espérance train (R) | Trades test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|');

  const results = {};
  for (const w of WINDOWS) {
    const trainR = runWindow(train, w.cfg);
    const testR = runWindow(test, w.cfg);
    results[w.key] = { train: trainR, test: testR };
    const v = verdict(trainR.summary.expectancyR, testR.summary.expectancyR, trainR.summary.totalSignals, testR.summary.totalSignals);
    md.push(`| ${w.key} | ${trainR.summary.totalSignals} | ${fmtNum(trainR.summary.expectancyR)} | ${testR.summary.totalSignals} | ${fmtNum(testR.summary.expectancyR)} | ${v} |`);
    console.error(`[${w.key}] train n=${trainR.summary.totalSignals} exp=${fmtNum(trainR.summary.expectancyR)} R_total=${fmtNum(trainR.summary.finalEquityR)} | test n=${testR.summary.totalSignals} exp=${fmtNum(testR.summary.expectancyR)} R_total=${fmtNum(testR.summary.finalEquityR)}`);
  }
  md.push('');
  md.push('| Fenêtre | R total train | R total test | Drawdown max train (R) | Drawdown max test (R) |');
  md.push('|---|---|---|---|---|');
  for (const w of WINDOWS) {
    const r = results[w.key];
    md.push(`| ${w.key} | ${fmtNum(r.train.summary.finalEquityR)} | ${fmtNum(r.test.summary.finalEquityR)} | ${fmtNum(r.train.summary.maxDrawdownR)} | ${fmtNum(r.test.summary.maxDrawdownR)} |`);
  }
  md.push('');

  // Pick the window with the best TEST expectancy among those that "tiennent" as the one to break down by weekday -
  // the test period is the honest, out-of-sample measure, not train (which every window necessarily fits better).
  const passing = WINDOWS.filter((w) => {
    const r = results[w.key];
    return r.test.summary.totalSignals >= MIN_TRADES_FOR_VERDICT && r.test.summary.expectancyR > 0;
  });
  const bestWindow = (passing.length > 0 ? passing : WINDOWS).reduce((best, w) => {
    const exp = results[w.key].test.summary.expectancyR ?? -Infinity;
    const bestExp = best ? results[best.key].test.summary.expectancyR ?? -Infinity : -Infinity;
    return exp > bestExp ? w : best;
  }, null);

  md.push(
    `**Fenêtre la plus profitable sur données jamais vues (test 2024-2025)** : **${bestWindow.key}** ` +
      `(espérance test ${fmtNum(results[bestWindow.key].test.summary.expectancyR)}R). La suite (jour de la semaine) est calculée sur cette fenêtre.`
  );
  md.push('');

  md.push('## 2. Jour de la semaine');
  md.push('');
  md.push(
    `⚠ Découpage a posteriori des trades de la fenêtre "${bestWindow.key}" par jour d'entrée, heure de New York ` +
      'réelle (DST prise en compte, `getRealNyWeekday()`). Purement exploratoire : les échantillons par jour sont ' +
      "petits (environ un cinquième d'un total déjà modeste) — un jour qui a l'air bon UNIQUEMENT sur train ou " +
      'UNIQUEMENT sur test est probablement du bruit, pas un vrai signal. Pas de filtre proposé ici, juste un état des lieux.'
  );
  md.push('');
  const trainByDay = statsByWeekday(results[bestWindow.key].train.trades);
  const testByDay = statsByWeekday(results[bestWindow.key].test.trades);
  md.push('### TRAIN (2019-2023)');
  md.push('| Jour (NY) | Trades | Win rate | R moyen | R total |');
  md.push('|---|---|---|---|---|');
  for (let d = 1; d <= 5; d++) md.push(fmtWeekdayRow(WEEKDAY_NAMES[d], trainByDay[d]));
  md.push('');
  md.push('### TEST (2024-2025)');
  md.push('| Jour (NY) | Trades | Win rate | R moyen | R total |');
  md.push('|---|---|---|---|---|');
  for (let d = 1; d <= 5; d++) md.push(fmtWeekdayRow(WEEKDAY_NAMES[d], testByDay[d]));
  md.push('');

  // Flag any day that is consistently weak/strong on BOTH periods - the only pattern worth naming out loud here.
  const notes = [];
  for (let d = 1; d <= 5; d++) {
    const trainN = trainByDay[d].trades.length, testN = testByDay[d].trades.length;
    if (trainN < 5 || testN < 5) continue; // too thin to say anything
    const trainAvg = trainByDay[d].sumR / trainN, testAvg = testByDay[d].sumR / testN;
    if (trainAvg < 0 && testAvg < 0) notes.push(`**${WEEKDAY_NAMES[d]}** est négatif sur train ET test (${fmtNum(trainAvg)}R / ${fmtNum(testAvg)}R) — le seul jour qui mérite un vrai regard, pas juste du bruit d'échantillon.`);
  }
  if (notes.length > 0) {
    md.push(notes.join(' '));
  } else {
    md.push("Aucun jour n'est négatif à la fois sur train et sur test — pas de pattern jour-de-semaine assez solide pour justifier un filtre, sur cette fenêtre.");
  }

  const outMd = path.join(dir, 'fvg-multi-touch-window-weekday-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
