import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHtfConfluenceReversalEvents,
  runHtfSupportReversalBacktest,
  isDoji,
  isBullishEngulfing,
  isBearishEngulfing,
} from '../src/backtest/htfSupportReversal.js';

const M15 = 15 * 60 * 1000;
const DAY = 96 * M15; // continuous 24h of M15 candles

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// --- pure pattern helpers (no history needed) -----------------------------

test('isDoji: true when the body is <= 10% of the candle range', () => {
  assert.equal(isDoji(c(0, 100, 101, 99, 100.05)), true); // body 0.05 / range 2 = 2.5%
  assert.equal(isDoji(c(0, 100, 101, 99, 100.5)), false); // body 0.5 / range 2 = 25%
});

test('isDoji: a zero-range candle (high === low) is never a doji', () => {
  assert.equal(isDoji(c(0, 100, 100, 100, 100)), false);
});

test('isBullishEngulfing: red then green, green fully covers red\'s body', () => {
  const prev = c(0, 90, 91, 79, 80); // bearish, body 80-90
  const cur = c(1, 79, 95, 78, 91); // bullish, opens at/below prev close, closes at/above prev open
  assert.equal(isBullishEngulfing(prev, cur), true);
});

test('isBullishEngulfing: false if the second candle does not fully cover the first\'s body', () => {
  const prev = c(0, 90, 91, 79, 80);
  const cur = c(1, 85, 95, 78, 88); // bullish but doesn't close above prev's open (90)
  assert.equal(isBullishEngulfing(prev, cur), false);
});

test('isBearishEngulfing: mirror of isBullishEngulfing', () => {
  const prev = c(0, 80, 91, 79, 90); // bullish, body 80-90
  const cur = c(1, 91, 92, 65, 79); // bearish, opens at/above prev close, closes at/below prev open
  assert.equal(isBearishEngulfing(prev, cur), true);
  assert.equal(isBullishEngulfing(prev, cur), false);
});

// --- history fixtures ------------------------------------------------------
// 2020-01-01 is a Wednesday (NY calendar) - verified directly against
// nyDayKey/weekKeyOf/monthKeyOf before writing these fixtures (not guessed):
// days 0-30 are the whole of January 2020 (a single month bucket, 31*96 =
// 2976 candles, comfortably over MIN_FULL_MONTH_CANDLES), so day index 31
// (2020-02-01) is the first candle where day/week/month levels are ALL
// available - the previous month (January) has just completed, and the
// previous week/day both fall inside it too. A flat background (constant
// low/high) makes every timeframe's level trivially equal and confluent
// without having to hand-align week/month boundaries beyond that.

const BACKGROUND_START = Date.UTC(2020, 0, 1, 0, 0, 0);
const BACKGROUND_DAYS = 31; // all of January 2020

function flatBackground({ low = 50, high = 100, startTime = BACKGROUND_START, days = BACKGROUND_DAYS } = {}) {
  const candles = [];
  let t = startTime;
  for (let i = 0; i < days * 96; i++) {
    candles.push(c(t, 70, high, low, 80)); // bullish, non-doji, same colour every candle - never fires on its own
    t += M15;
  }
  return candles;
}

const FIRST_CONFLUENT_TIME = BACKGROUND_START + BACKGROUND_DAYS * DAY; // 2020-02-01, first candle of day index 31

test('detectHtfConfluenceReversalEvents: not enough history yet (day/week/month not all established) never fires, even on an otherwise valid setup', () => {
  const short = Array.from({ length: 50 }, (_, i) => c(i * M15, 75, 100, 50, 75.2)); // every candle would be a doji touching 50/100 if levels existed
  assert.deepEqual(detectHtfConfluenceReversalEvents(short), []);
});

test('detectHtfConfluenceReversalEvents: a doji touching a day+week+month-confluent support fires a bullish event', () => {
  const background = flatBackground();
  const doji = c(FIRST_CONFLUENT_TIME, 75, 100, 50, 75.2); // body 0.2 / range 50 = 0.4%, low touches the confluent support (50)
  const candles = [...background, doji];

  const events = detectHtfConfluenceReversalEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, candles.length - 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].pattern, 'doji');
  assert.deepEqual([...events[0].timeframes].sort(), ['day', 'month', 'week']);
});

test('detectHtfConfluenceReversalEvents: a doji touching a confluent resistance (not support) fires a bearish event', () => {
  const background = flatBackground();
  const doji = c(FIRST_CONFLUENT_TIME, 75, 100, 70, 74.8); // low=70 (nowhere near support=50), high=100 touches confluent resistance
  const candles = [...background, doji];

  const events = detectHtfConfluenceReversalEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].pattern, 'doji');
});

test('detectHtfConfluenceReversalEvents: a bullish engulfing at a confluent support fires (not just any doji)', () => {
  const background = flatBackground();
  const bearishTouch = c(FIRST_CONFLUENT_TIME, 90, 95, 50, 51); // touches support(50) but is not itself a valid pattern -> no event
  const engulfing = c(FIRST_CONFLUENT_TIME + M15, 50, 95, 49.97, 92); // engulfs the previous candle's body, low still touches support
  const candles = [...background, bearishTouch, engulfing];

  const events = detectHtfConfluenceReversalEvents(candles);
  assert.equal(events.length, 1); // the bearish touch-but-no-pattern candle produced nothing
  assert.equal(events[0].index, candles.length - 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].pattern, 'bullish-engulfing');
});

test('detectHtfConfluenceReversalEvents: a bearish engulfing at a confluent resistance fires', () => {
  const background = flatBackground();
  const bullishTouch = c(FIRST_CONFLUENT_TIME, 70, 100, 65, 90); // touches resistance(100) but is not a pattern on its own
  const engulfing = c(FIRST_CONFLUENT_TIME + M15, 92, 100.03, 65, 68); // engulfs the previous candle's body, high still touches resistance
  const candles = [...background, bullishTouch, engulfing];

  const events = detectHtfConfluenceReversalEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].pattern, 'bearish-engulfing');
});

test('detectHtfConfluenceReversalEvents: a level only ONE timeframe agrees on (no confluence) never fires, even with a textbook doji', () => {
  // Day index 31 (2020-02-01) only, dipped to low=40/high=90 - EXCLUDED from
  // January's own month aggregate (Feb hasn't completed) and from the
  // still-forming "week of Jan 27" (which day 32 also belongs to, so its
  // prevCompleted week is the one before that, untouched) - verified via the
  // same nyDayKey/weekKeyOf/monthKeyOf probe used to size the fixture above.
  // Day 32 (2020-02-02) is the first candle whose OWN day-level (=40) has no
  // week/month (=50) backing it.
  const background = flatBackground();
  const divergentDay = Array.from({ length: 96 }, (_, i) => c(FIRST_CONFLUENT_TIME + i * M15, 70, 90, 40, 80));
  const touch = c(FIRST_CONFLUENT_TIME + DAY, 40.02, 40.5, 40, 39.99); // doji, low=40 matches ONLY the day-level

  const candles = [...background, ...divergentDay, touch];
  assert.deepEqual(detectHtfConfluenceReversalEvents(candles), []);
});

test('detectHtfConfluenceReversalEvents: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(detectHtfConfluenceReversalEvents([]), []);
});

// --- runHtfSupportReversalBacktest -----------------------------------------

test('runHtfSupportReversalBacktest: entry fills at the NEXT candle open after confirmation, stop beyond the setup, fixed 1:3 target', () => {
  const background = flatBackground();
  const doji = c(FIRST_CONFLUENT_TIME, 75, 100, 50, 75.2);
  let t = FIRST_CONFLUENT_TIME + M15;
  const entry = c(t, 76, 78, 74, 77); t += M15; // entry candle, open=76
  const rally = c(t, 77, 160, 76, 155); t += M15; // sustained rally, hits the bullish 1:3 target
  const candles = [...background, doji, entry, rally];

  const trades = runHtfSupportReversalBacktest(candles);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.pattern, 'doji');
  assert.equal(trade.entryPrice, entry.open);
  assert.equal(trade.stopPrice, 50); // min(doji.low, prevBackground.low) = min(50, 50)
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runHtfSupportReversalBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const background = flatBackground();
  const doji = c(FIRST_CONFLUENT_TIME, 75, 100, 50, 75.2);
  let t = FIRST_CONFLUENT_TIME + M15;
  const entry = c(t, 76, 78, 74, 77); t += M15;
  const reversal = c(t, 77, 78, 40, 45); t += M15; // drops straight through the stop (50)
  const candles = [...background, doji, entry, reversal];

  const trades = runHtfSupportReversalBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});

test('runHtfSupportReversalBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const flat = flatBackground({ days: 5 });
  assert.deepEqual(runHtfSupportReversalBacktest(flat), []);
});

test('runHtfSupportReversalBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runHtfSupportReversalBacktest([]), []);
});
