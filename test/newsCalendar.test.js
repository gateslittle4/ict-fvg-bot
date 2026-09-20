import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newsCalendar, newsBetween, newsCoverage, NEWS_GROUPS_TOTAL } from '../src/backtest/newsCalendar.js';
import { US_ET_EVENTS, ECB_CET_EVENTS } from '../src/backtest/newsEvents.js';
import { historicalNewsEvents } from '../src/backtest/newsEventsHistorical.js';

test('the label groups cover the source list exactly (an edit to newsEvents.js must update the groups too)', () => {
  assert.equal(NEWS_GROUPS_TOTAL, US_ET_EVENTS.length);
  assert.equal(newsCalendar().length, US_ET_EVENTS.length + ECB_CET_EVENTS.length + historicalNewsEvents().length);
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

test('sorted oldest first, with a coverage that is honest about the 2019-2025 limit', () => {
  const all = newsCalendar();
  for (let i = 1; i < all.length; i++) assert.ok(all[i].time >= all[i - 1].time);
  const cov = newsCoverage();
  assert.equal(new Date(cov.from).getUTCFullYear(), 2019);
  assert.equal(new Date(cov.to).getUTCFullYear(), 2025);
  assert.equal(newsBetween(Date.parse('2018-01-01'), Date.parse('2018-12-31')).length, 0); // before the covered years: nothing invented
  assert.ok(newsBetween(Date.parse('2019-01-01'), Date.parse('2019-12-31')).length >= 30);
  assert.ok(newsBetween(Date.parse('2024-01-01'), Date.parse('2024-01-31')).length >= 5);
});

test('2019-2023 official-source events: counts per kind, weekdays only, known real anchors', () => {
  const ev = historicalNewsEvents();
  const count = (k) => ev.filter((e) => e.kind === k).length;
  assert.equal(count('CPI'), 60); assert.equal(count('NFP'), 60); assert.equal(count('FOMC'), 39); assert.equal(count('GDP'), 20);
  assert.ok(count('PCE') >= 58);
  for (const e of ev) { const day = new Date(`${e.date}T12:00:00Z`).getUTCDay(); assert.ok(day >= 1 && day <= 5, `${e.kind} ${e.date} falls on a weekend`); assert.ok(e.source.startsWith('https://'), e.date); }
  const at = (iso) => newsCalendar().find((e) => e.time === Date.parse(iso));
  assert.equal(at('2022-06-10T12:30:00Z').label, 'CPI'); // 8:30 EDT
  assert.equal(at('2023-01-06T13:30:00Z').label, 'NFP'); // 8:30 EST
  assert.equal(at('2020-04-29T18:00:00Z').label, 'FOMC'); // 14:00 EDT
  assert.equal(at('2021-07-29T12:30:00Z').label, 'PIB');
});

test('the unscheduled March 2020 FOMC meetings are NOT in the calendar (their statement times were not sourced)', () => {
  const ev = historicalNewsEvents().filter((e) => e.kind === 'FOMC' && e.date.startsWith('2020-03'));
  assert.equal(ev.length, 0);
});
