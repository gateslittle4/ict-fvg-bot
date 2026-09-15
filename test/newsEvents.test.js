import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allEventTimesAsCandleTime, US_ET_EVENTS, ECB_CET_EVENTS } from '../src/backtest/newsEvents.js';

test('allEventTimesAsCandleTime: returns one candle.time per configured event, sorted ascending', () => {
  const times = allEventTimesAsCandleTime();
  assert.equal(times.length, US_ET_EVENTS.length + ECB_CET_EVENTS.length);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1]);
});

test('allEventTimesAsCandleTime: a winter (EST, no DST) NFP at real 8:30 AM ET maps to candle.time 08:30 UTC exactly', () => {
  const times = allEventTimesAsCandleTime();
  const janNfp = times.find((t) => new Date(t).toISOString() === '2024-01-05T08:30:00.000Z');
  assert.ok(janNfp, 'expected the Jan 5 2024 NFP event to map to exactly 08:30 UTC (no DST discrepancy in winter)');
});

test('allEventTimesAsCandleTime: a summer (EDT, DST active) FOMC at real 2:00 PM ET maps to candle.time 13:00 UTC (1h earlier than the winter case)', () => {
  const times = allEventTimesAsCandleTime();
  const julyFomc = times.find((t) => new Date(t).toISOString() === '2024-07-31T13:00:00.000Z');
  assert.ok(julyFomc, 'expected the Jul 31 2024 FOMC event (real 14:00 EDT) to map to candle.time 13:00 UTC - fixed-EST is always UTC-5, so a real EDT (UTC-4) instant is 1h earlier in candle.time than the same wall-clock hour would be in winter');
});

test('allEventTimesAsCandleTime: a summer (CEST, DST active) ECB decision at real 14:15 CEST maps to candle.time 07:15 UTC', () => {
  const times = allEventTimesAsCandleTime();
  const julyEcb = times.find((t) => new Date(t).toISOString() === '2024-07-18T07:15:00.000Z');
  assert.ok(julyEcb, 'expected the Jul 18 2024 ECB event (real 14:15 CEST, UTC+2) to map to candle.time 07:15 UTC');
});

test('allEventTimesAsCandleTime: a winter (CET, no DST) ECB decision at real 14:15 CET maps to candle.time 08:15 UTC', () => {
  const times = allEventTimesAsCandleTime();
  const janEcb = times.find((t) => new Date(t).toISOString() === '2024-01-25T08:15:00.000Z');
  assert.ok(janEcb, 'expected the Jan 25 2024 ECB event (real 14:15 CET, UTC+1) to map to candle.time 08:15 UTC');
});
