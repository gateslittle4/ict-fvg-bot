import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDailyLevels, nyDayKey } from '../src/backtest/dailyLevels.js';

// January = standard time, so an engine-time hour IS the New York hour (no DST offset to reason about).
const MIN15 = 15 * 60 * 1000;
const DAY = 86400000;
const MON_WEEK1 = Date.UTC(2020, 0, 6); // Monday

// Weekdays 6-10 Jan and 13-15 Jan, 24 h of M15 at 100, plus per-day spikes:
// day d: high 110+d at 09:00, low 90-d at 12:00 (both outside the CBDR/Asian windows).
function build({ skipDayCandlesExcept4 = null, lastHour = 12 } = {}) {
  const candles = [];
  const dayIdx = [0, 1, 2, 3, 4, 7, 8, 9];
  for (const d of dayIdx) {
    const dayStart = MON_WEEK1 + d * DAY;
    const isToday = d === 9;
    for (let q = 0; q < 96; q++) {
      const t = dayStart + q * MIN15;
      const hour = Math.floor(q / 4), minute = (q % 4) * 15;
      if (isToday && (hour > lastHour || (hour === lastHour && minute > 0))) break;
      if (skipDayCandlesExcept4 === d && q >= 4) break;
      const c = { time: t, open: 100, high: 100.5, low: 99.5, close: 100 };
      if (hour === 9 && minute === 0) c.high = 110 + d;
      if (hour === 12 && minute === 0) c.low = 90 - d;
      if (d === 8 && hour === 15 && minute === 0) c.high = 102; // CBDR high
      if (d === 8 && hour === 16 && minute === 0) c.low = 98; // CBDR low
      if (d === 8 && hour === 21 && minute === 0) c.high = 101.4; // Asian high
      if (d === 8 && hour === 22 && minute === 0) c.low = 98.6; // Asian low
      if (isToday && hour === 0 && minute === 0) c.open = 100.25; // NY midnight open
      candles.push(c);
    }
  }
  return candles;
}
const byKey = (r) => Object.fromEntries(r.levels.map((l) => [l.key, l.price]));

test('computeDailyLevels: nothing to say without candles', () => {
  assert.equal(computeDailyLevels([]), null);
  assert.equal(computeDailyLevels(null), null);
});

test('nyDayKey: the New York calendar day, DST-aware (engine time is fixed UTC-5)', () => {
  // 2020-07-01 23:30 engine time = 04:30 UTC July 2 = 00:30 EDT July 2 -> already the 2nd in New York
  assert.equal(nyDayKey(Date.UTC(2020, 6, 1, 23, 30)), '2020-07-02');
  assert.equal(nyDayKey(Date.UTC(2020, 0, 1, 23, 30)), '2020-01-01'); // winter: engine hour = NY hour
});

test('computeDailyLevels: day, week and midnight-open levels', () => {
  const r = computeDailyLevels(build());
  const k = byKey(r);
  assert.equal(r.price, 100);
  assert.equal(k['today-high'], 119); // 110 + 9, from 09:00 today
  assert.equal(k['today-low'], 81); // 90 - 9, from the 12:00 candle (the last one)
  assert.equal(k.pdh, 118); // Tuesday 14 Jan (d=8)
  assert.equal(k.pdl, 82);
  assert.equal(k['pd-mid'], 100);
  assert.equal(k.pwh, 114); // week of 6 Jan: best d=4
  assert.equal(k.pwl, 86);
  assert.equal(k['midnight-open'], 100.25);
});

test('computeDailyLevels: Asian range and CBDR (with the 2-sigma projections) come from yesterday\'s completed cycle', () => {
  const k = byKey(computeDailyLevels(build()));
  assert.equal(k['asia-high'], 101.4);
  assert.equal(k['asia-low'], 98.6);
  assert.equal(k['cbdr-high'], 102);
  assert.equal(k['cbdr-low'], 98);
  assert.equal(k['cbdr-up'], 110); // 102 + 2 * (102 - 98)
  assert.equal(k['cbdr-down'], 90); // 98 - 2 * 4
});

test('computeDailyLevels: a partial previous day (a few candles) never stands in for "yesterday"', () => {
  const k = byKey(computeDailyLevels(build({ skipDayCandlesExcept4: 8 })));
  assert.equal(k.pdh, 117); // falls back to Monday 13 Jan (d=7), the last FULL day
  assert.equal(k.pdl, 83);
});

test('computeDailyLevels: sorted from highest to lowest, each level knows its distance to price', () => {
  const r = computeDailyLevels(build());
  for (let i = 1; i < r.levels.length; i++) assert.ok(r.levels[i - 1].price >= r.levels[i].price);
  const pdh = r.levels.find((l) => l.key === 'pdh');
  assert.equal(pdh.distance, 18);
  assert.ok(Math.abs(pdh.distancePct - 18) < 1e-9);
});

test('computeDailyLevels: a stale Asian range/CBDR (no cycle within ~36 h) is left out rather than shown as current', () => {
  const stale = build().filter((c) => c.time < Date.UTC(2020, 0, 7)); // only Monday 6 Jan
  const shifted = stale.concat([{ time: Date.UTC(2020, 0, 12, 12), open: 100, high: 100.5, low: 99.5, close: 100 }]); // last candle days later
  const k = byKey(computeDailyLevels(shifted));
  assert.equal(k['asia-high'], undefined);
  assert.equal(k['cbdr-high'], undefined);
});
