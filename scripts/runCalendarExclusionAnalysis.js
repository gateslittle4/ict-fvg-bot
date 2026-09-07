#!/usr/bin/env node
// runCalendarExclusionAnalysis.js
// Usage: node scripts/runCalendarExclusionAnalysis.js <dir-with-csvs>
//
// Tests removing specific calendar days from the ALREADY validated FVG
// config (US100/US500/XAUUSD, same variant/stopMode/structure/session/
// sweep as production) to see whether low-liquidity days, market holidays,
// and scheduled high-impact US macro news days (FOMC, CPI, NFP) are
// hurting the edge - as opposed to helping it, which is also possible (a
// news-driven move can create a genuine, well-defended imbalance too).
//
// Every excluded-date list is decided BEFORE running this script, from
// PUBLIC, independently-sourced calendars - never from looking at which
// days performed badly in our own data (that would be exactly the
// "rejected Friday exclusion" mistake this project avoided at the very
// start - see HANDOFF.md):
//   - NYSE market holidays 2019-2025 + the two best-known half-days
//     (day after Thanksgiving, Christmas Eve) - standard textbook US
//     holiday formulas (nth-weekday-of-month rules + the Easter/Good
//     Friday computus), not independently re-verified date-by-date via
//     search, but these are well-established public facts.
//   - FOMC policy-decision dates 2019-2025 - sourced directly from the
//     Federal Reserve's own historical meeting-calendar pages
//     (federalreserve.gov/monetarypolicy/fomccalendars.htm and the
//     per-year fomchistorical pages), including the two unscheduled
//     March 2020 COVID emergency announcements.
//   - CPI release dates 2019-2025 - sourced directly from the Bureau of
//     Labor Statistics' own per-year schedule pages (bls.gov/schedule/
//     <year>/home.htm).
//   - NFP (Non-Farm Payrolls) dates - computed directly as the first
//     Friday of each month 2019-2025 (the standing BLS convention), no
//     external lookup needed since the rule itself is fixed and public.
// Also tests weekday exclusion (Monday / Friday / both) per the user's
// explicit request - decided up front, same discipline, NOT chosen after
// peeking at which weekday looked bad this time.
//
// Screened on TRAIN (2019-2023), verified on TEST (2024-2025), same
// verdict rule as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runBacktest } from '../src/backtest/backtestEngine.js';
import { buildFilteredEngine, withNet } from '../src/backtest/gridRunner.js';
import { WeekdayFilteredFvgEngine } from '../src/backtest/weekdayFilter.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const FIXED_EST_TO_UTC_OFFSET_MS = 5 * 60 * 60 * 1000; // see nySession.js / weekdayFilter.js for why
const nyDateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
function nyDateKey(histDataTimeMs) {
  const parts = nyDateFormatter.formatToParts(new Date(histDataTimeMs + FIXED_EST_TO_UTC_OFFSET_MS));
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const LONDON_NY_OVERLAP_WINDOW = { startHour: 7, endHour: 10 };
const SYMBOLS = ['US100', 'US500', 'XAUUSD'];
const FVG_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US100 },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.US500 },
  XAUUSD: { variant: 'H4_EMA20', stopMode: 'swing', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: LONDON_NY_OVERLAP_WINDOW, liquiditySweepEnabled: true, spread: DEFAULT_SPREADS.XAUUSD },
};

// ---- NYSE holidays 2019-2025 (full closures) + the two best-known half-days ----
const HOLIDAYS = [
  '2019-01-01', '2019-01-21', '2019-02-18', '2019-04-19', '2019-05-27', '2019-07-04', '2019-09-02', '2019-11-28', '2019-11-29', '2019-12-25',
  '2020-01-01', '2020-01-20', '2020-02-17', '2020-04-10', '2020-05-25', '2020-07-03', '2020-09-07', '2020-11-26', '2020-11-27', '2020-12-25', '2020-12-24',
  '2021-01-01', '2021-01-18', '2021-02-15', '2021-04-02', '2021-05-31', '2021-07-05', '2021-09-06', '2021-11-25', '2021-11-26', '2021-12-24',
  '2022-01-17', '2022-02-21', '2022-04-15', '2022-05-30', '2022-06-20', '2022-07-04', '2022-09-05', '2022-11-24', '2022-11-25', '2022-12-26',
  '2023-01-02', '2023-01-16', '2023-02-20', '2023-04-07', '2023-05-29', '2023-06-19', '2023-07-04', '2023-09-04', '2023-11-23', '2023-11-24', '2023-12-25',
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-11-29', '2024-12-25', '2024-12-24',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-11-28', '2025-12-25', '2025-12-24',
];

// ---- FOMC policy-decision dates 2019-2025 (federalreserve.gov) ----
const FOMC_DAYS = [
  '2019-01-30', '2019-03-20', '2019-05-01', '2019-06-19', '2019-07-31', '2019-09-18', '2019-10-11', '2019-10-30', '2019-12-11',
  '2020-01-29', '2020-03-03', '2020-03-15', '2020-04-29', '2020-06-10', '2020-07-29', '2020-09-16', '2020-11-05', '2020-12-16',
  '2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15',
  '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14',
  '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13',
  '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
];

// ---- CPI release dates 2019-2025 (bls.gov) ----
const CPI_DAYS = [
  '2019-01-11', '2019-02-13', '2019-03-12', '2019-04-10', '2019-05-10', '2019-06-12', '2019-07-11', '2019-08-13', '2019-09-12', '2019-10-10', '2019-11-13', '2019-12-11',
  '2020-01-14', '2020-02-13', '2020-03-11', '2020-04-10', '2020-05-12', '2020-06-10', '2020-07-14', '2020-08-12', '2020-09-11', '2020-10-13', '2020-11-12', '2020-12-10',
  '2021-01-13', '2021-02-10', '2021-03-10', '2021-04-13', '2021-05-12', '2021-06-10', '2021-07-13', '2021-08-11', '2021-09-14', '2021-10-13', '2021-11-10', '2021-12-10',
  '2022-01-12', '2022-02-10', '2022-03-10', '2022-04-12', '2022-05-11', '2022-06-10', '2022-07-13', '2022-08-10', '2022-09-13', '2022-10-13', '2022-11-10', '2022-12-13',
  '2023-01-12', '2023-02-14', '2023-03-14', '2023-04-12', '2023-05-10', '2023-06-13', '2023-07-12', '2023-08-10', '2023-09-13', '2023-10-12', '2023-11-14', '2023-12-12',
  '2024-01-11', '2024-02-13', '2024-03-12', '2024-04-10', '2024-05-15', '2024-06-12', '2024-07-11', '2024-08-14', '2024-09-11', '2024-10-10', '2024-11-13', '2024-12-11',
  '2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11', '2025-07-15', '2025-08-12', '2025-09-11', '2025-10-24', '2025-12-18',
];

/** NFP = first Friday of every month (standing BLS convention) - computed, not hardcoded. */
function computeNfpDays(years) {
  const days = [];
  for (const year of years) {
    for (let month = 0; month < 12; month++) {
      const d = new Date(Date.UTC(year, month, 1));
      while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1); // 5 = Friday
      days.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
    }
  }
  return days;
}
const NFP_DAYS = computeNfpDays([2019, 2020, 2021, 2022, 2023, 2024, 2025]);

class DateExclusionFilteredFvgEngine {
  constructor(innerEngine, excludedDateKeys) {
    this.inner = innerEngine;
    this.excluded = new Set(excludedDateKeys);
    this.filteredCount = 0;
    this.passedCount = 0;
  }
  processCandle(candle) {
    const events = this.inner.processCandle(candle);
    const out = [];
    for (const e of events) {
      if (e.type !== 'validated') { out.push(e); continue; }
      if (!this.excluded.has(nyDateKey(candle.time))) { this.passedCount++; out.push(e); }
      else this.filteredCount++;
    }
    return out;
  }
}

function fmtPct(x) { return x !== null && x !== undefined ? (x * 100).toFixed(1) + '%' : '—'; }
function fmtNum(x, d = 2) { return x !== null && x !== undefined && isFinite(x) ? x.toFixed(d) : (x === Infinity ? '∞' : '—'); }
function verdict(trainExp, testExp, trainN, testN) {
  if (trainN < 10 || testN < 10) return '❓ pas assez de trades';
  if (testExp === null || testExp === undefined) return '❓ pas assez de trades';
  if (testExp <= 0) return '❌ ne tient pas';
  if (trainExp > 0 && testExp >= 0.3 * trainExp) return '✅ tient';
  return '⚠️ affaibli';
}

function buildVariantEngine(candles, symbol, cfg, { excludedWeekdays = [], excludedDates = null }) {
  let { engine } = buildFilteredEngine(candles, symbol, cfg);
  if (excludedWeekdays.length > 0) engine = new WeekdayFilteredFvgEngine(engine, excludedWeekdays);
  if (excludedDates) engine = new DateExclusionFilteredFvgEngine(engine, excludedDates);
  return engine;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runCalendarExclusionAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const ALL_EXCLUDED = [...new Set([...HOLIDAYS, ...FOMC_DAYS, ...CPI_DAYS, ...NFP_DAYS])];

  const VARIANTS = [
    { key: 'Aucune exclusion (déjà validé)', weekdays: [], dates: null },
    { key: 'Sans lundi', weekdays: [1], dates: null },
    { key: 'Sans vendredi', weekdays: [5], dates: null },
    { key: 'Sans lundi ni vendredi', weekdays: [1, 5], dates: null },
    { key: 'Sans jours fériés US (+ 2 demi-journées)', weekdays: [], dates: HOLIDAYS },
    { key: 'Sans jours NFP (1er vendredi du mois)', weekdays: [], dates: NFP_DAYS },
    { key: 'Sans jours FOMC', weekdays: [], dates: FOMC_DAYS },
    { key: 'Sans jours CPI', weekdays: [], dates: CPI_DAYS },
    { key: 'Tout combiné (fériés+NFP+FOMC+CPI+lundi+vendredi)', weekdays: [1, 5], dates: ALL_EXCLUDED },
  ];

  const md = [];
  md.push('# Exclusion calendaire : jours fériés, NFP, FOMC, CPI, lundi/vendredi');
  md.push('');
  md.push(
    "⚠ Même config FVG déjà validée par instrument (variant/stopMode/structure/session/sweep inchangés) - on " +
      "ajoute juste un filtre supplémentaire qui bloque les entrées certains jours précis, décidés AVANT de lancer " +
      "ce script à partir de calendriers publics indépendants de nos données : jours fériés NYSE 2019-2025 (+ 2 " +
      "demi-journées connues), dates de décision FOMC (site de la Fed), dates de publication du CPI (site du BLS), " +
      "et jours NFP (1er vendredi du mois, calculé, pas une liste externe). Lundi/vendredi testés à la demande de " +
      "l'utilisateur, décidé à l'avance - pas choisi après coup en fonction de ce qui a l'air mauvais cette fois-ci. " +
      "Écran TRAIN (2019-2023) / vérification TEST (2024-2025), même règle de verdict que partout ailleurs."
  );
  md.push('');
  md.push('| Symbole | Variante | Trades train | WR train | PF train | Espérance train (R) | Trades test | WR test | PF test | Espérance test (R) | Verdict |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|');

  for (const symbol of SYMBOLS) {
    const { candles } = loadCandlesFromCsv(path.join(dir, `${symbol}.csv`));
    const cfg = FVG_CONFIG[symbol];
    const trainCandles = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const testCandles = candles.filter((c) => c.time >= TRAIN_CUTOFF);

    for (const v of VARIANTS) {
      const trainEngine = buildVariantEngine(trainCandles, symbol, cfg, { excludedWeekdays: v.weekdays, excludedDates: v.dates });
      const trainTrades = runBacktest({ candles: trainCandles, symbol, fvgEngine: trainEngine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });
      const testEngine = buildVariantEngine(testCandles, symbol, cfg, { excludedWeekdays: v.weekdays, excludedDates: v.dates });
      const testTrades = runBacktest({ candles: testCandles, symbol, fvgEngine: testEngine, stopMode: cfg.stopMode, rrMultiple: cfg.rrMultiple });

      const { summaryNet: ts } = withNet(trainTrades, cfg.spread);
      const { summaryNet: es } = withNet(testTrades, cfg.spread);
      const verd = verdict(ts.expectancyR, es.expectancyR, ts.totalSignals, es.totalSignals);

      md.push(`| ${symbol} | ${v.key} | ${ts.totalSignals} | ${fmtPct(ts.winRate)} | ${fmtNum(ts.profitFactor)} | ${fmtNum(ts.expectancyR)} | ${es.totalSignals} | ${fmtPct(es.winRate)} | ${fmtNum(es.profitFactor)} | ${fmtNum(es.expectancyR)} | ${verd} |`);
      console.error(`[${symbol} / ${v.key}] train n=${ts.totalSignals} wr=${fmtPct(ts.winRate)} exp=${fmtNum(ts.expectancyR)} | test n=${es.totalSignals} wr=${fmtPct(es.winRate)} exp=${fmtNum(es.expectancyR)}`);
    }
  }

  const outMd = path.join(dir, 'calendar-exclusion-analysis.md');
  fs.writeFileSync(outMd, md.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
