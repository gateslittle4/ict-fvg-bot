// csvLoader.js
// Robust-ish loader for OHLC CSV exports (TradingView's "Export chart data",
// or a similar MT5/cTrader export). Handles:
//   - header names in different cases/orders (time/date/datetime, open, high, low, close)
//   - time as a unix timestamp (seconds or milliseconds) OR a parseable date string
//   - blank lines / trailing newline
// Throws with a clear message if required columns can't be found, rather than
// silently producing garbage candles (which would poison the backtest stats).

import fs from 'node:fs';

const TIME_HEADER_CANDIDATES = ['time', 'date', 'datetime', 'timestamp'];

function parseTime(raw) {
  const trimmed = String(raw).trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    // Heuristic: 10-digit numbers are unix seconds, 13-digit are unix ms.
    return trimmed.length >= 13 ? n : n * 1000;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) throw new Error(`Unparseable time value: "${raw}"`);
  return parsed;
}

export function loadCandlesFromCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error(`${filePath}: no data rows found`);

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const timeIdx = header.findIndex((h) => TIME_HEADER_CANDIDATES.includes(h));
  const openIdx = header.indexOf('open');
  const highIdx = header.indexOf('high');
  const lowIdx = header.indexOf('low');
  const closeIdx = header.indexOf('close');

  if ([timeIdx, openIdx, highIdx, lowIdx, closeIdx].some((idx) => idx === -1)) {
    throw new Error(
      `${filePath}: could not find required columns in header "${lines[0]}". ` +
        `Expected a time/date column plus open, high, low, close.`
    );
  }

  const candles = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length <= Math.max(timeIdx, openIdx, highIdx, lowIdx, closeIdx)) {
      skipped++;
      continue;
    }
    try {
      const time = parseTime(cols[timeIdx]);
      const open = Number(cols[openIdx]);
      const high = Number(cols[highIdx]);
      const low = Number(cols[lowIdx]);
      const close = Number(cols[closeIdx]);
      if ([open, high, low, close].some((v) => Number.isNaN(v))) {
        skipped++;
        continue;
      }
      candles.push({ time, open, high, low, close });
    } catch {
      skipped++;
    }
  }

  candles.sort((a, b) => a.time - b.time);

  // De-duplicate identical timestamps (can happen with overlapping exports)
  const deduped = [];
  for (const c of candles) {
    if (deduped.length > 0 && deduped[deduped.length - 1].time === c.time) continue;
    deduped.push(c);
  }

  return { candles: deduped, skippedRows: skipped, totalRows: lines.length - 1 };
}
