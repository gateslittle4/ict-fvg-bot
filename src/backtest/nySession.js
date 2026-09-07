// nySession.js
// Filters FVG entries to a New York local time-of-day window (e.g. the
// ICT "NY AM" killzone, 08:00-12:00 New York time).
//
// IMPORTANT time-zone caveat: HistData.com's export (see convertHistData.js)
// is documented as a FIXED EST offset (UTC-5) year-round — it never applies
// daylight saving. Our candle `.time` field stores those digits parsed as if
// they were literal UTC (again see convertHistData.js), so `.time` is NOT a
// true UTC instant: it is exactly 5 hours behind true UTC, always.
// Real New York local time DOES observe DST (EDT = UTC-4 in summer), so
// naively treating `.time`'s hour-of-day as "New York time" would be off by
// one hour for roughly 8 months of the year (mid-March to early November).
// To get the REAL New York wall-clock hour (matching what a trader actually
// means by "8am-12pm New York time"), we first reconstruct the true UTC
// instant (`.time + 5h`), then ask Intl for the DST-aware local hour.

const FIXED_EST_TO_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

const nyTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

export function toRealNyHourMinute(histDataTimeMs) {
  const trueUtcMs = histDataTimeMs + FIXED_EST_TO_UTC_OFFSET_MS;
  const parts = nyTimeFormatter.formatToParts(new Date(trueUtcMs));
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return { hour, minute };
}

/**
 * @param {number} histDataTimeMs - a candle's `.time` (fixed-EST-as-UTC convention)
 * @param {number} startHour - inclusive NY local hour, e.g. 8, or 8.5 for 08:30
 * @param {number} endHour - exclusive NY local hour, e.g. 12 (window = [08:00, 12:00)), or 11.5 for 11:30
 */
export function isInNySessionWindow(histDataTimeMs, startHour, endHour) {
  const { hour, minute } = toRealNyHourMinute(histDataTimeMs);
  const decimalHour = hour + minute / 60; // supports half-hour (or finer) boundaries, not just whole hours
  return decimalHour >= startHour && decimalHour < endHour;
}

export class SessionFilteredFvgEngine {
  /**
   * @param {object} innerEngine - a FvgEngine, or another filtered wrapper (filters compose)
   * @param {object} opts
   * @param {number} opts.startHour - inclusive NY local hour
   * @param {number} opts.endHour - exclusive NY local hour
   */
  constructor(innerEngine, { startHour, endHour }) {
    this.inner = innerEngine;
    this.startHour = startHour;
    this.endHour = endHour;
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
      if (isInNySessionWindow(candle.time, this.startHour, this.endHour)) {
        this.passedCount++;
        out.push(e);
      } else {
        this.filteredCount++;
      }
    }
    return out;
  }
}
