import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsCalendar, newsBetween, newsCoverage, NEWS_GROUPS_TOTAL } from '../src/backtest/newsCalendar.js';
import { US_ET_EVENTS, ECB_CET_EVENTS } from '../src/backtest/newsEvents.js';

test('the label groups cover the source list exactly (an edit to newsEvents.js must update the groups too)', () => {
  assert.equal(NEWS_GROUPS_TOTAL, US_ET_EVENTS.length);
  assert.equal(newsCalendar().length, US_ET_EVENTS.length + ECB_CET_EVENTS.length);
});

test('labels land on the right releases at every group boundary (anchors with known real dates)', () => {
  const at = (iso) => newsCalendar().find((e) => e.time === Date.parse(iso));
  assert.equal(at('2024-01-11T13:30:00Z').label, 'CPI'); // 8:30 ET in January = 13:30 UTC
  assert.equal(at('2024-01-05T13:30:00Z').label, 'NFP');
  assert.equal(at('2024-01-31T19:00:00Z').label, 'FOMC'); // 14:00 ET
  assert.equal(at('2025-01-15T13:30:00Z').label, 'CPI');
  assert.equal(at('2025-01-10T13:30:00Z').label, 'NFP');
  assert.equal(at('2025-12-10T19:00:00Z').label, 'FOMC');
  assert.equal(at('2024-01-25T13:30:00Z').label, 'PIB');
  assert.equal(at('2024-01-26T13:30:00Z').label, 'PCE');
  assert.equal(at('2024-01-17T13:30:00Z').label, 'Ventes');
  assert.equal(at('2024-01-25T13:15:00Z').label, 'BCE'); // 14:15 CET in January = 13:15 UTC
});

test('daylight saving is handled: 8:30 ET is 12:30 UTC in July', () => {
  assert.ok(newsCalendar().some((e) => e.time === Date.parse('2024-07-11T12:30:00Z') && e.label === 'CPI'));
});

test('sorted oldest first, with a coverage that is honest about the 2024-2025 limit', () => {
  const all = newsCalendar();
  for (let i = 1; i < all.length; i++) assert.ok(all[i].time >= all[i - 1].time);
  const cov = newsCoverage();
  assert.equal(new Date(cov.from).getUTCFullYear(), 2024);
  assert.equal(new Date(cov.to).getUTCFullYear(), 2025);
  assert.equal(newsBetween(Date.parse('2019-01-01'), Date.parse('2019-12-31')).length, 0);
  assert.ok(newsBetween(Date.parse('2024-01-01'), Date.parse('2024-01-31')).length >= 5);
});
