import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHistoryWindows, MAX_TRENDBARS_PER_REQUEST } from '../src/dataSources/cTraderDataSource.js';

test('245 days of M15 stay in a single request (as the export always did)', () => {
  const w = planHistoryWindows(245, 96, 24000);
  assert.equal(w.length, 1);
  assert.deepEqual(w[0], { fromDaysAgo: 245, toDaysAgo: 0, spanDays: 245 });
});

test('M1 is paged backwards without gaps or overlaps and covers the whole look-back', () => {
  const w = planHistoryWindows(120, 1440, 24000); // 16 days per window
  assert.equal(w.length, 8);
  for (let i = 1; i < w.length; i++) assert.equal(w[i].toDaysAgo, w[i - 1].fromDaysAgo);
  assert.equal(w[0].toDaysAgo, 0);
  assert.equal(w[w.length - 1].fromDaysAgo, 120);
  for (const x of w) assert.ok(x.spanDays * 1440 <= 24000);
});

test('a short look-back is one window', () => {
  assert.deepEqual(planHistoryWindows(5, 1440, 24000), [{ fromDaysAgo: 5, toDaysAgo: 0, spanDays: 5 }]);
});

test('production window size keeps every M1/M5/M15 request under the broker cap (~14 000 bars per response), so no window loses bars at its edge', () => {
  assert.ok(MAX_TRENDBARS_PER_REQUEST <= 12000, 'a window above ~14 000 real bars silently drops ~2 days (seen 2026-09-21: 14 % of M1 missing)');
  for (const bpd of [1440, 288, 96]) for (const w of planHistoryWindows(1500, bpd, MAX_TRENDBARS_PER_REQUEST)) assert.ok(w.spanDays * bpd <= MAX_TRENDBARS_PER_REQUEST);
});
