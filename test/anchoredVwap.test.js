import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAnchoredVwapSeries,
  detectAnchoredVwapEvents,
  runAnchoredVwapBacktest,
} from '../src/backtest/anchoredVwap.js';

// January dates keep this simple: real NY time == the fixed-EST digits used
// project-wide for candle .time (no DST in effect) — see test/nySession.test.js.
function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}
function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('computeAnchoredVwapSeries: resets to null accumulation at the start of a new NY calendar day', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 23, 45), 100, 101, 99, 100),
    c(histDataTime(2024, 1, 16, 0, 0), 200, 201, 199, 200), // new NY day - fresh anchor
  ];
  const series = computeAnchoredVwapSeries(candles);
  // second candle's vwap must be computed from ONLY itself (weight=2, typical=200), not carrying day 1's ~100 average
  assert.ok(Math.abs(series[1].vwap - 200) < 1e-9);
  assert.equal(series[1].candlesIntoDay, 1);
});

test('computeAnchoredVwapSeries: a zero-range (doji) candle contributes zero weight but does not crash the running average', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100, 100, 100), // zero range, zero weight
    c(histDataTime(2024, 1, 15, 0, 15), 100, 102, 98, 100),
  ];
  const series = computeAnchoredVwapSeries(candles);
  assert.equal(series[0], null); // no weight accumulated yet
  assert.ok(series[1].vwap > 0);
});

function buildQuietDay(day, count, base = 100) {
  // low-range candles hovering near `base`, to establish a tight VWAP/band before the extension candle.
  const out = [];
  for (let k = 0; k < count; k++) {
    out.push(c(histDataTime(2024, 1, day, 0, k * 15), base, base + 0.5, base - 0.5, base));
  }
  return out;
}

test('detectAnchoredVwapEvents: a confirmed close above the upper band is a bearish fade signal, target = current VWAP', () => {
  const quiet = buildQuietDay(15, 6);
  const extension = [c(histDataTime(2024, 1, 15, 1, 30), 100, 130, 99, 125)]; // closes far above the tight band
  const events = detectAnchoredVwapEvents([...quiet, ...extension]);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].stopReference, 130); // signal candle's own high
  // Target = the running VWAP AT signal time, which already includes the
  // signal candle's own (large) weight pulling it up from the prior ~100 -
  // the same single-pass convention real-time VWAP-band indicators use.
  assert.ok(events[0].target > 100 && events[0].target < 125);
});

test('detectAnchoredVwapEvents: the mirror case (confirmed close below the lower band) is a bullish fade signal', () => {
  const quiet = buildQuietDay(15, 6);
  const extension = [c(histDataTime(2024, 1, 15, 1, 30), 100, 101, 70, 75)];
  const events = detectAnchoredVwapEvents([...quiet, ...extension]);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].stopReference, 70);
});

test('detectAnchoredVwapEvents: too early in the day (fewer than MIN_CANDLES_INTO_DAY) never signals, even with an extreme move', () => {
  const candles = [
    c(histDataTime(2024, 1, 15, 0, 0), 100, 100.5, 99.5, 100),
    c(histDataTime(2024, 1, 15, 0, 15), 100, 200, 90, 190), // huge move, but only the 2nd candle of the day
  ];
  assert.equal(detectAnchoredVwapEvents(candles).length, 0);
});

test('detectAnchoredVwapEvents: only one signal per direction per day', () => {
  const quiet = buildQuietDay(15, 6);
  const extension = [
    c(histDataTime(2024, 1, 15, 1, 30), 100, 130, 99, 125), // first bearish signal
    c(histDataTime(2024, 1, 15, 1, 45), 125, 135, 124, 130), // still extended - must NOT re-signal
  ];
  const events = detectAnchoredVwapEvents([...quiet, ...extension]);
  assert.equal(events.length, 1);
});

test('runAnchoredVwapBacktest: enters one candle after the signal, wins by reverting to the VWAP target', () => {
  const quiet = buildQuietDay(15, 6);
  const signal = c(histDataTime(2024, 1, 15, 1, 30), 100, 130, 99, 125); // bearish, stop=130
  const entryCandle = c(histDataTime(2024, 1, 15, 1, 45), 125, 126, 123, 124); // entry open=125
  const exitCandle = c(histDataTime(2024, 1, 15, 2, 0), 124, 125, 99, 100); // low 99 reaches target ~100 -> win
  const trades = runAnchoredVwapBacktest([...quiet, signal, entryCandle, exitCandle]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, 'bearish');
  assert.equal(trades[0].entryPrice, 125);
  assert.equal(trades[0].stopPrice, 130);
  assert.equal(trades[0].outcome, 'win');
});
