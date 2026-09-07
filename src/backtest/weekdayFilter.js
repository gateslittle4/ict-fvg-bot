// weekdayFilter.js
// Optional day-of-week filter, same DST-aware NY-time approach as
// nySession.js (see that file's header comment for the fixed-EST-offset
// caveat in our HistData candles). Exploratory: runDayOfWeekAnalysis.js
// found the current best US500 config's Monday trades were consistently
// bad in BOTH train (2019-2023) and test (2024-2025), which is what
// justifies testing an actual exclusion filter here instead of dismissing
// it as noise.

const FIXED_EST_TO_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

const nyWeekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
});

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** @returns {number} 0=Sunday .. 6=Saturday, in REAL (DST-aware) New York local time */
export function getRealNyWeekday(histDataTimeMs) {
  const trueUtcMs = histDataTimeMs + FIXED_EST_TO_UTC_OFFSET_MS;
  const short = nyWeekdayFormatter.format(new Date(trueUtcMs));
  return WEEKDAY_INDEX[short];
}

export class WeekdayFilteredFvgEngine {
  /**
   * @param {object} innerEngine - a FvgEngine, or another filtered wrapper (filters compose)
   * @param {number[]} excludedWeekdays - e.g. [1] to drop Monday signals
   */
  constructor(innerEngine, excludedWeekdays) {
    this.inner = innerEngine;
    this.excluded = new Set(excludedWeekdays);
    this.filteredCount = 0;
    this.passedCount = 0;
  }

  processCandle(candle) {
    const events = this.inner.processCandle(candle);
    const out = [];
    for (const e of events) {
      if (e.type !== 'validated') {
        out.push(e);
        continue;
      }
      if (!this.excluded.has(getRealNyWeekday(candle.time))) {
        this.passedCount++;
        out.push(e);
      } else {
        this.filteredCount++;
      }
    }
    return out;
  }
}
