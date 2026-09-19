import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHtfLevelReversalEvents,
  runHtfSupportReversalBacktest,
  resampleWithBoundaries,
  isDoji,
  isBullishEngulfing,
  isBearishEngulfing,
} from '../src/backtest/htfSupportReversal.js';
import { weekKeyOf, monthKeyOf, nyDayKey } from '../src/backtest/dailyLevels.js';

const M15 = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// --- pure pattern helpers (no history needed) -----------------------------

test('isDoji: true when the body is <= 10% of the candle range', () => {
  assert.equal(isDoji(c(0, 100, 101, 99, 100.05)), true);
  assert.equal(isDoji(c(0, 100, 101, 99, 100.5)), false);
});

test('isBullishEngulfing: red then green, green fully covers red\'s body', () => {
  const prev = c(0, 90, 91, 79, 80);
  const cur = c(1, 79, 95, 78, 91);
  assert.equal(isBullishEngulfing(prev, cur), true);
});

test('isBearishEngulfing: mirror of isBullishEngulfing', () => {
  const prev = c(0, 80, 91, 79, 90);
  const cur = c(1, 91, 92, 65, 79);
  assert.equal(isBearishEngulfing(prev, cur), true);
  assert.equal(isBullishEngulfing(prev, cur), false);
});

// --- resampleWithBoundaries -------------------------------------------------

test('resampleWithBoundaries: fixed-ms buckets (H1) group candles correctly and endIndexExclusive points at the next bucket\'s first candle', () => {
  const H1 = 60 * 60 * 1000;
  const candles = [
    c(0, 100, 101, 99, 100.5), // bucket 0
    c(15 * 60 * 1000, 100.5, 102, 100, 101), // bucket 0
    c(H1, 101, 103, 100.5, 102), // bucket 1
  ];
  const htf = resampleWithBoundaries(candles, (x) => Math.floor(x.time / H1));
  assert.equal(htf.length, 2);
  assert.deepEqual(htf[0], { time: 0, open: 100, high: 102, low: 99, close: 101, endIndexExclusive: 2 });
  assert.equal(htf[1].endIndexExclusive, 3); // last bucket - "next" is past the end of the data
});

test('resampleWithBoundaries: a real NY calendar key (week) aggregates several days and rolls over correctly', () => {
  // 2020-01-06 and 2020-01-07 are both in the same NY week (verified against weekKeyOf/nyDayKey directly).
  const start = Date.UTC(2020, 0, 6, 0, 0, 0);
  const candles = [
    c(start, 100, 105, 95, 101),
    c(start + DAY_MS, 101, 110, 90, 102), // same week - widens the bucket's high/low
    c(start + 7 * DAY_MS, 102, 106, 96, 103), // next week
  ];
  const htf = resampleWithBoundaries(candles, (x) => weekKeyOf(nyDayKey(x.time)));
  assert.equal(htf.length, 2);
  assert.equal(htf[0].high, 110);
  assert.equal(htf[0].low, 90);
  assert.equal(htf[0].endIndexExclusive, 2);
});

test('resampleWithBoundaries: empty input is a safe no-op', () => {
  assert.deepEqual(resampleWithBoundaries([], () => 0), []);
});

// --- detectHtfLevelReversalEvents / runHtfSupportReversalBacktest ----------
// One M15-shaped candle per CALENDAR DAY (spaced 24h apart) so each fixture
// candle is simultaneously: (a) its own daily HTF candle (nyDayKey groups
// exactly one candle per day) and (b) its own H1 entry-timeframe candle
// (24h apart always lands in a different H1 bucket) - lets the swing/pool
// fixture be built directly, the same way equalHighsLows.test.js builds its
// 2-touch fixture, just extended to a 3rd touch and spaced by full days
// instead of M15 steps.

function flat(candles, t) { candles.push(c(t, 100, 100.2, 99.8, 100)); return t + DAY_MS; }
function swingLow(candles, t, low) { candles.push(c(t, 95, 96, low, 94)); return t + DAY_MS; }
function swingHigh(candles, t, high) { candles.push(c(t, 105, high, 104, 106)); return t + DAY_MS; }

/** 3 confirmed swing lows within 0.1% of each other (90, 90.05, 89.97) -> qualifies a daily support at ~90. */
function buildThreeTouchSupport({ touches = [90, 90.05, 89.97] } = {}) {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 6; i++) t = flat(candles, t);
  t = swingLow(candles, t, touches[0]);
  for (let i = 0; i < 5; i++) t = flat(candles, t);
  for (let i = 0; i < 6; i++) t = flat(candles, t);
  t = swingLow(candles, t, touches[1]);
  for (let i = 0; i < 5; i++) t = flat(candles, t);
  for (let i = 0; i < 6; i++) t = flat(candles, t);
  t = swingLow(candles, t, touches[2]);
  for (let i = 0; i < 5; i++) t = flat(candles, t);
  return { candles, nextTime: t };
}

/** Mirror of buildThreeTouchSupport for resistance. */
function buildThreeTouchResistance({ touches = [110, 110.05, 109.97] } = {}) {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 6; i++) t = flat(candles, t);
  t = swingHigh(candles, t, touches[0]);
  for (let i = 0; i < 5; i++) t = flat(candles, t);
  for (let i = 0; i < 6; i++) t = flat(candles, t);
  t = swingHigh(candles, t, touches[1]);
  for (let i = 0; i < 5; i++) t = flat(candles, t);
  for (let i = 0; i < 6; i++) t = flat(candles, t);
  t = swingHigh(candles, t, touches[2]);
  for (let i = 0; i < 5; i++) t = flat(candles, t);
  return { candles, nextTime: t };
}

test('detectHtfLevelReversalEvents: 3 confirmed touches on the DAILY timeframe qualify a support, then a doji on the H1 entry candle fires a bullish event', () => {
  const { candles, nextTime } = buildThreeTouchSupport();
  const doji = c(nextTime, 90.02, 90.5, 90, 89.99); // body 0.03 / range 0.5 = 6% -> doji; low touches the qualified support (90)
  const withTrigger = [...candles, doji, c(nextTime + DAY_MS, 90.6, 91, 90, 90.8)]; // + 1 more candle so the entry can actually fill

  const events = detectHtfLevelReversalEvents(withTrigger);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].pattern, 'doji');
  assert.equal(events[0].levelTimeframe, 'daily');
  assert.equal(events[0].entryIndex, withTrigger.length - 1); // the candle right after the doji
});

test('detectHtfLevelReversalEvents: only 2 touches (not 3) never qualifies a level, even with a perfect doji afterwards', () => {
  const { candles, nextTime } = buildThreeTouchSupport();
  const twoTouchCandles = candles.slice(0, candles.length - 6); // drop the 3rd swing low and its trailing confirmation candles
  const doji = c(nextTime, 90.02, 90.5, 90, 89.99);
  const withTrigger = [...twoTouchCandles, doji, c(nextTime + DAY_MS, 90.6, 91, 90, 90.8)];

  assert.deepEqual(detectHtfLevelReversalEvents(withTrigger), []);
});

test('detectHtfLevelReversalEvents: the resistance mirror also fires (bearish, doji)', () => {
  const { candles, nextTime } = buildThreeTouchResistance();
  const doji = c(nextTime, 109.98, 110, 109.5, 110.01); // high touches the qualified resistance (110)
  const withTrigger = [...candles, doji, c(nextTime + DAY_MS, 109.4, 109.8, 108, 108.5)];

  const events = detectHtfLevelReversalEvents(withTrigger);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].pattern, 'doji');
});

test('detectHtfLevelReversalEvents: a bullish engulfing (not a doji) at the qualified support also fires', () => {
  const { candles, nextTime } = buildThreeTouchSupport();
  const bearishTouch = c(nextTime, 92, 93, 90, 90.5); // touches support but is not itself a valid pattern
  const engulfing = c(nextTime + DAY_MS, 90, 93, 89.97, 92.5); // engulfs the previous candle's body, low still touches support
  const withTrigger = [...candles, bearishTouch, engulfing, c(nextTime + 2 * DAY_MS, 92.6, 93, 92, 92.8)];

  const events = detectHtfLevelReversalEvents(withTrigger);
  assert.equal(events.length, 1); // the touch-but-no-pattern candle produced nothing
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].pattern, 'bullish-engulfing');
});

test('detectHtfLevelReversalEvents: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(detectHtfLevelReversalEvents([]), []);
});

test('detectHtfLevelReversalEvents: a flat/no-signal market produces zero events, not a crash', () => {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 60; i++) t = flat(candles, t);
  assert.deepEqual(detectHtfLevelReversalEvents(candles), []);
});

// --- runHtfSupportReversalBacktest -----------------------------------------

test('runHtfSupportReversalBacktest: entry fills at the NEXT M15 candle open after the H1 confirmation candle, stop beyond the setup, fixed 1:3 target', () => {
  const { candles, nextTime } = buildThreeTouchSupport();
  const doji = c(nextTime, 90.02, 90.5, 90, 89.99);
  const entry = c(nextTime + DAY_MS, 90.6, 91, 90, 90.8); // entry candle, open=90.6
  const rally = c(nextTime + 2 * DAY_MS, 90.8, 200, 90.5, 195); // sustained rally, hits the bullish 1:3 target
  const withTrades = [...candles, doji, entry, rally];

  const trades = runHtfSupportReversalBacktest(withTrades);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.pattern, 'doji');
  assert.equal(trade.entryPrice, entry.open);
  assert.equal(trade.stopPrice, 90); // min(doji.low, prevCandle.low) = min(90, 99.8)
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runHtfSupportReversalBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const { candles, nextTime } = buildThreeTouchSupport();
  const doji = c(nextTime, 90.02, 90.5, 90, 89.99);
  const entry = c(nextTime + DAY_MS, 90.6, 91, 90, 90.8);
  const reversal = c(nextTime + 2 * DAY_MS, 90.5, 90.6, 80, 82); // drops straight through the stop (90)
  const withTrades = [...candles, doji, entry, reversal];

  const trades = runHtfSupportReversalBacktest(withTrades);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});

test('runHtfSupportReversalBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 60; i++) t = flat(candles, t);
  assert.deepEqual(runHtfSupportReversalBacktest(candles), []);
});

test('runHtfSupportReversalBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runHtfSupportReversalBacktest([]), []);
});
