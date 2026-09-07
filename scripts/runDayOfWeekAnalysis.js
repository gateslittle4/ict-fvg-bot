#!/usr/bin/env node
// runDayOfWeekAnalysis.js
// Usage: node scripts/runDayOfWeekAnalysis.js <dir-with-csvs>
//
// Exploratory: does the current best setup's edge concentrate on certain
// weekdays (ICT lore often singles out Tuesday/Wednesday for NY session
// setups)? Post-hoc split of the SAME validated config's trades by entry
// weekday (NY local time, since the whole setup is built around the NY
// session), train (2019-2023) vs test (2024-2025), so any day-of-week
// pattern found on train gets checked for survival on test before trusting
// it - same discipline as everywhere else in this project.

import fs from 'node:fs';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runOneConfig, withNet } from '../src/backtest/gridRunner.js';
import { DEFAULT_SPREADS } from '../src/backtest/transactionCosts.js';

const TRAIN_CUTOFF = new Date('2024-01-01T00:00:00Z').getTime();
const SILVER_BULLET_WINDOW = { startHour: 10, endHour: 11 };
const NY_OFFSET_HOURS = -5; // approximation (EST, no DST adjustment - trades cluster in the 10-11h NY window anyway)

const SYMBOL_CONFIG = {
  US100: { variant: 'H4_EMA200', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
  US500: { variant: 'H1_EMA50', stopMode: 'fvg-edge', rrMultiple: 3, structureEnabled: true, sessionEnabled: true, sessionWindow: SILVER_BULLET_WINDOW, liquiditySweepEnabled: true },
};

const WEEKDAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function nyWeekday(utcMs) {
  const d = new Date(utcMs + NY_OFFSET_HOURS * 60 * 60 * 1000);
  return d.getUTCDay();
}

function statsByWeekday(trades) {
  const byDay = {};
  for (let d = 0; d <= 6; d++) byDay[d] = { trades: [], sumR: 0 };
  for (const t of trades) {
    const day = nyWeekday(t.entryTime);
    byDay[day].trades.push(t);
    byDay[day].sumR += t.rMultiple;
  }
  return byDay;
}

function fmtRow(dayLabel, entry) {
  const n = entry.trades.length;
  if (n === 0) return `| ${dayLabel} | 0 | — | — | — |`;
  const wins = entry.trades.filter((t) => t.outcome === 'win').length;
  const resolved = entry.trades.filter((t) => t.outcome !== 'timeout').length;
  const wr = resolved > 0 ? ((100 * wins) / resolved).toFixed(1) + '%' : '—';
  const avgR = (entry.sumR / n).toFixed(2);
  return `| ${dayLabel} | ${n} | ${wr} | ${avgR} | ${entry.sumR.toFixed(1)} |`;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/runDayOfWeekAnalysis.js <dir-with-csvs>');
    process.exit(1);
  }

  const mdSections = [];
  mdSections.push('# Analyse exploratoire : le jour de la semaine influence-t-il le résultat ?');
  mdSections.push('');
  mdSections.push(
    "⚠ Découpage a posteriori des trades du setup DÉJÀ validé (mêmes filtres, rien ne change dans le moteur), " +
      "par jour de la semaine côté heure de New York (approximation EST fixe, sans ajustement DST - les trades " +
      "sont de toute façon concentrés dans la fenêtre 10h-11h NY). Train (2019-2023) vs test (2024-2025) - un " +
      "jour qui a l'air bon uniquement sur train et pas sur test est probablement du bruit, pas un vrai edge."
  );
  mdSections.push('');

  for (const [symbol, baseCfg] of Object.entries(SYMBOL_CONFIG)) {
    const filePath = path.join(dir, `${symbol}.csv`);
    if (!fs.existsSync(filePath)) continue;
    const { candles } = loadCandlesFromCsv(filePath);
    const train = candles.filter((c) => c.time < TRAIN_CUTOFF);
    const test = candles.filter((c) => c.time >= TRAIN_CUTOFF);
    const spread = DEFAULT_SPREADS[symbol];

    const trainResult = runOneConfig(train, symbol, spread, baseCfg);
    const testResult = runOneConfig(test, symbol, spread, baseCfg);
    const trainNetTrades = withNet(trainResult.trades, spread).trades;
    const testNetTrades = withNet(testResult.trades, spread).trades;
    const trainByDayReal = statsByWeekday(trainNetTrades);
    const testByDayReal = statsByWeekday(testNetTrades);

    mdSections.push(`## ${symbol}`);
    mdSections.push('### TRAIN (2019-2023)');
    mdSections.push('| Jour (NY) | Trades | Win rate | R moyen | R total |');
    mdSections.push('|---|---|---|---|---|');
    for (let d = 1; d <= 5; d++) mdSections.push(fmtRow(WEEKDAY_NAMES[d], trainByDayReal[d]));
    mdSections.push('');
    mdSections.push('### TEST (2024-2025)');
    mdSections.push('| Jour (NY) | Trades | Win rate | R moyen | R total |');
    mdSections.push('|---|---|---|---|---|');
    for (let d = 1; d <= 5; d++) mdSections.push(fmtRow(WEEKDAY_NAMES[d], testByDayReal[d]));
    mdSections.push('');
    console.error(`[${symbol}] done`);
  }

  const outMd = path.join(dir, 'day-of-week-analysis.md');
  fs.writeFileSync(outMd, mdSections.join('\n'));
  console.log(`Wrote ${outMd}`);
}

main();
