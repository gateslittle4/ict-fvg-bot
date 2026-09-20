// newsEventsHistorical.js
// The 2019-2023 red-news events, read from OFFICIAL pages (BLS, Federal Reserve, BEA) by scripts/fetchHistoricalNews.py
// (2026-09-20) and stored in data/news-calendar-2019-2023.json with the source of every date. Used for the Simulateur's
// chart labels through newsCalendar.js; deliberately NOT merged into newsEvents.js's US_ET_EVENTS, which the "no trade
// around red news" backtests read (changing that list would silently change those analyses).
// Known gaps, left as gaps: ECB decisions and Census retail sales before 2024, ISM/PMI (see the JSON's `method`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'news-calendar-2019-2023.json');
let cache;

/** @returns {Array<{kind:'CPI'|'NFP'|'FOMC'|'GDP'|'PCE', date:string, time:string, tz:string, source:string, timeAssumed?:boolean}>} [] when the file is unreadable */
export function historicalNewsEvents() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')).events; } catch { cache = []; }
  return cache;
}
