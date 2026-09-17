// newsEvents.js
// Real, publicly-sourced high-impact ("red") news events, 2024-2025 - built
// at Esdras's explicit request ("les props firms ont l'habitude de dire Red
// News, donc je pense que c'est TOUS les red news") to measure the impact
// of a "no trade ±10min around red news" rule on the combined 5-mechanism
// portfolio (see HANDOFF.md). Covers the highest-tier USD and EUR releases:
//   - CPI, NFP (Employment Situation), PPI-adjacent releases NOT included
//     (deliberately left out - more commonly "orange"/medium-impact on most
//     calendars, not universally red) - bls.gov/schedule/2024, /2025,
//     always 8:30 AM ET.
//   - FOMC statement - federalreserve.gov/monetarypolicy/fomccalendars.htm,
//     always 2:00 PM ET.
//   - GDP (Advance Estimate only - the second/third estimates move markets
//     far less since the data is already largely known) and Personal
//     Income and Outlays / PCE Price Index - bea.gov News Release Schedule
//     PDFs (2024, 2025), 8:30 AM ET (a few 10:00 AM ET exceptions, noted).
//   - Advance Monthly Retail Sales - census.gov schedule PDFs, 8:30 AM ET.
//   - ECB Governing Council monetary policy decision -
//     ecb.europa.eu meeting calendar, always 14:15 CET/CEST.
// Deliberately NOT included (lower-confidence or lower-tier by most
// calendars' own classification, not chased further): German Ifo Business
// Climate, ZEW Economic Sentiment, ISM Manufacturing/Services PMI, weekly
// jobless claims (would swamp the list with ~104 more low/medium-impact
// events over 2 years).
//
// Known real gaps, left as gaps rather than guessed:
//   - 2025 CPI has no November date, NFP has no October date, GDP has no
//     2025 Q3 advance estimate, PCE has no Oct/Nov 2025 releases within
//     this project's data window (ends 2025-12-31) - all real casualties of
//     the US government's Oct-Nov 2025 shutdown (BLS/BEA release delays and
//     cancellations), confirmed via each agency's own schedule-update
//     announcements, not a research gap.
//   - December 2024 Retail Sales was listed "to be announced" in the
//     source PDF at research time - omitted rather than guessed.

export const US_ET_EVENTS = [
  // [year, month, day, hour, minute] in real America/New_York local time
  // CPI 2024
  [2024,1,11,8,30],[2024,2,13,8,30],[2024,3,12,8,30],[2024,4,10,8,30],[2024,5,15,8,30],[2024,6,12,8,30],
  [2024,7,11,8,30],[2024,8,14,8,30],[2024,9,11,8,30],[2024,10,10,8,30],[2024,11,13,8,30],[2024,12,11,8,30],
  // NFP 2024
  [2024,1,5,8,30],[2024,2,2,8,30],[2024,3,8,8,30],[2024,4,5,8,30],[2024,5,3,8,30],[2024,6,7,8,30],
  [2024,7,5,8,30],[2024,8,2,8,30],[2024,9,6,8,30],[2024,10,4,8,30],[2024,11,1,8,30],[2024,12,6,8,30],
  // FOMC 2024
  [2024,1,31,14,0],[2024,3,20,14,0],[2024,5,1,14,0],[2024,6,12,14,0],[2024,7,31,14,0],[2024,9,18,14,0],[2024,11,7,14,0],[2024,12,18,14,0],
  // CPI 2025
  [2025,1,15,8,30],[2025,2,12,8,30],[2025,3,12,8,30],[2025,4,10,8,30],[2025,5,13,8,30],[2025,6,11,8,30],
  [2025,7,15,8,30],[2025,8,12,8,30],[2025,9,11,8,30],[2025,10,24,8,30],[2025,12,18,8,30],
  // NFP 2025
  [2025,1,10,8,30],[2025,2,7,8,30],[2025,3,7,8,30],[2025,4,4,8,30],[2025,5,2,8,30],[2025,6,6,8,30],
  [2025,7,3,8,30],[2025,8,1,8,30],[2025,9,5,8,30],[2025,11,20,8,30],[2025,12,16,8,30],
  // FOMC 2025
  [2025,1,29,14,0],[2025,3,19,14,0],[2025,5,7,14,0],[2025,6,18,14,0],[2025,7,30,14,0],[2025,8,22,14,0],[2025,9,17,14,0],[2025,10,29,14,0],[2025,12,10,14,0],

  // GDP Advance Estimate (bea.gov 2024/2025 News Release Schedule PDFs), 8:30 AM ET.
  // 2025 Q3 advance estimate was CANCELLED by the Oct-Nov 2025 government
  // shutdown (confirmed via BEA's own release-schedule-update blog posts) -
  // correctly omitted below, not a gap.
  [2024,1,25,8,30],[2024,4,25,8,30],[2024,7,25,8,30],[2024,10,30,8,30],
  [2025,1,30,8,30],[2025,4,30,8,30],[2025,7,30,8,30],

  // Personal Income and Outlays / PCE Price Index (bea.gov schedules), 8:30
  // AM ET (a few exceptions at 10:00 AM ET, noted). 2025 Oct/Nov releases
  // were delayed past year-end into Jan 2026 by the government shutdown
  // (confirmed - "combined into one release" Jan 22, 2026) - correctly
  // omitted below (they never happened within this project's data window),
  // not fabricated.
  [2024,1,26,8,30],[2024,2,29,8,30],[2024,3,29,8,30],[2024,4,26,8,30],[2024,5,31,8,30],[2024,6,28,8,30],
  [2024,7,26,8,30],[2024,8,30,8,30],[2024,9,27,8,30],[2024,10,31,8,30],[2024,11,27,10,0],[2024,12,20,8,30],
  [2025,1,31,8,30],[2025,2,28,8,30],[2025,3,28,8,30],[2025,4,30,10,0],[2025,5,30,8,30],[2025,6,27,8,30],
  [2025,7,31,8,30],[2025,8,29,8,30],[2025,9,26,8,30],

  // Advance Monthly Retail Sales (census.gov schedules), 8:30 AM ET.
  // December 2024's date was listed "to be announced" in the source PDF at
  // fetch time - omitted rather than guessed (one data point, not chased
  // further).
  [2024,1,17,8,30],[2024,2,15,8,30],[2024,3,14,8,30],[2024,4,15,8,30],[2024,5,15,8,30],[2024,6,18,8,30],
  [2024,7,16,8,30],[2024,8,15,8,30],[2024,9,17,8,30],[2024,10,17,8,30],[2024,11,15,8,30],
  [2025,1,16,8,30],[2025,2,14,8,30],[2025,3,17,8,30],[2025,4,16,8,30],[2025,5,15,8,30],[2025,6,17,8,30],
  [2025,7,17,8,30],[2025,8,15,8,30],[2025,9,16,8,30],[2025,10,16,8,30],[2025,11,14,8,30],[2025,12,17,8,30],
];

export const ECB_CET_EVENTS = [
  [2024,1,25,14,15],[2024,3,7,14,15],[2024,4,11,14,15],[2024,6,6,14,15],[2024,7,18,14,15],[2024,9,12,14,15],[2024,10,17,14,15],[2024,12,12,14,15],
  [2025,1,30,14,15],[2025,3,6,14,15],[2025,4,17,14,15],[2025,6,5,14,15],[2025,7,24,14,15],[2025,9,11,14,15],[2025,10,30,14,15],[2025,12,18,14,15],
];

/**
 * Standard double-format trick to convert a wall-clock time in `timeZone`
 * to the real UTC instant, DST-aware (no timezone library needed): guess
 * the instant by treating the wall-clock digits as UTC, then correct by
 * the offset that guess actually formats to in the target zone.
 */
function zonedTimeToUtc(y, m, d, hh, mm, timeZone) {
  const guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = fmt.formatToParts(new Date(guessUtc));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtcOfGuess = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return guessUtc + (guessUtc - asUtcOfGuess);
}

// This project's whole candle-time convention (convertHistData.js,
// nySession.js, weekdayFilter.js, ...): HistData's own "fixed EST, UTC-5,
// never DST-adjusted" timestamps, stored/read as if they were plain UTC.
// A real-world instant's candle.time equivalent is therefore always the
// real UTC instant MINUS 5 hours, regardless of whether real ET/CET that
// day observed DST or not - already verified against known cases (e.g. a
// winter NFP at real 8:30 AM EST maps to candle.time 08:30 UTC exactly; a
// summer FOMC at real 2:00 PM EDT maps to candle.time 13:00 UTC).
const FIXED_EST_OFFSET_MS = 5 * 3600 * 1000;

/** @returns {number[]} every event's real-world moment, converted to THIS PROJECT's candle.time (fixed-EST-as-UTC) convention, sorted ascending */
export function allEventTimesAsCandleTime() {
  const out = [];
  for (const [y, m, d, hh, mm] of US_ET_EVENTS) {
    out.push(zonedTimeToUtc(y, m, d, hh, mm, 'America/New_York') - FIXED_EST_OFFSET_MS);
  }
  for (const [y, m, d, hh, mm] of ECB_CET_EVENTS) {
    out.push(zonedTimeToUtc(y, m, d, hh, mm, 'Europe/Berlin') - FIXED_EST_OFFSET_MS);
  }
  return out.sort((a, b) => a - b);
}
