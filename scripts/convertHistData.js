#!/usr/bin/env node
// convertHistData.js
// Converts HistData.com "Generic ASCII" M1 exports (semicolon-delimited,
// no header, "YYYYMMDD HHMMSS;open;high;low;close;volume", split into one
// file per year) into a single CSV per symbol that csvLoader.js /
// runBacktestReport.js can consume directly. Defaults to M15 (this
// project's live/production timeframe); pass a 4th argument to build a
// different granularity instead (2026-09, at Esdras's request to research
// scalping on USDJPY M5 - the only instrument with real M1 source data in
// this project).
//
// Usage: node scripts/convertHistData.js <rawDir> <outFile> <SYMBOL> [bucketMinutes]
//   rawDir: folder containing one or more DAT_ASCII_<SYMBOL>_M1_*.csv files
//   outFile: path to write the merged CSV to
//   bucketMinutes: candle size in minutes (default 15)
//
// Note on time: HistData timestamps are in a fixed EST offset (no DST) per
// their own documentation. We parse the digits as-is (as if UTC) rather than
// shifting - this keeps every candle internally consistent with itself and
// with the bot's own H1/H4 resampling, which is all that matters for the
// FVG/EMA-bias logic (none of it depends on true UTC wall-clock alignment).

import fs from 'node:fs';
import path from 'node:path';
import { resampleCandles, TIMEFRAME_MS } from '../src/backtest/htfBias.js';

function parseHistDataLine(line) {
  // 20180101 170000;1.200370;1.201000;1.200370;1.201000;0
  const [dt, open, high, low, close] = line.split(';');
  const year = Number(dt.slice(0, 4));
  const month = Number(dt.slice(4, 6)) - 1;
  const day = Number(dt.slice(6, 8));
  const hour = Number(dt.slice(9, 11));
  const min = Number(dt.slice(11, 13));
  const sec = Number(dt.slice(13, 15));
  const time = Date.UTC(year, month, day, hour, min, sec);
  return { time, open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
}

function main() {
  const [rawDir, outFile, symbol, bucketMinutesArg] = process.argv.slice(2);
  if (!rawDir || !outFile || !symbol) {
    console.error('Usage: node scripts/convertHistData.js <rawDir> <outFile> <SYMBOL> [bucketMinutes]');
    process.exit(1);
  }
  const bucketMinutes = bucketMinutesArg ? Number(bucketMinutesArg) : 15;
  if (!Number.isFinite(bucketMinutes) || bucketMinutes <= 0) {
    console.error(`Invalid bucketMinutes: "${bucketMinutesArg}"`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(rawDir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort();

  let m1Candles = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(rawDir, file), 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const c = parseHistDataLine(line);
      if (Number.isFinite(c.time) && [c.open, c.high, c.low, c.close].every(Number.isFinite)) {
        m1Candles.push(c);
      }
    }
    console.log(`  parsed ${file}: ${lines.length} rows`);
  }

  m1Candles.sort((a, b) => a.time - b.time);
  // de-dupe identical timestamps (can happen at year-file boundaries)
  const deduped = [];
  for (const c of m1Candles) {
    if (deduped.length > 0 && deduped[deduped.length - 1].time === c.time) continue;
    deduped.push(c);
  }

  const resampled = resampleCandles(deduped, bucketMinutes * 60 * 1000);

  const header = 'time,open,high,low,close';
  const rows = resampled.map((c) => `${c.time},${c.open},${c.high},${c.low},${c.close}`);
  fs.writeFileSync(outFile, [header, ...rows].join('\n'));

  console.log(`\n${symbol}: ${deduped.length} M1 candles -> ${resampled.length} M${bucketMinutes} candles`);
  console.log(`  from ${new Date(resampled[0].time).toISOString()} to ${new Date(resampled[resampled.length - 1].time).toISOString()}`);
  console.log(`Wrote ${outFile}`);
}

main();
