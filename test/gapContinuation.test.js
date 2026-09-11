import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGapContinuationEvents, runGapContinuationBacktest, DAILY_GAP_HOURS, WEEKLY_GAP_HOURS } from '../src/backtest/gapContinuation.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const H = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;

test('detectGapContinuationEvents: a weekend gap-up is a BULLISH continuation bet (opposite of NWOG\'s fade)', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100), // Friday's last candle, close=100
    c(50 * H, 108, 109, 107.5, 108.2), // Sunday's open, gapped up to 108
  ];
  const events = detectGapContinuationEvents(candles, WEEKLY_GAP_HOURS);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 1);
  assert.equal(events[0].direction, 'bullish'); // NWOG would bet bearish (fade) here - this bets WITH the gap
  assert.equal(events[0].stopReference, 107.5); // the gap candle's own low (protective side for a bullish trade)
});

test('detectGapContinuationEvents: the mirror case (gapped down) is a BEARISH continuation bet', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 92, 93, 91, 92.5), // gapped down to 92
  ];
  const events = detectGapContinuationEvents(candles, WEEKLY_GAP_HOURS);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].stopReference, 93); // the gap candle's own high
});

test('detectGapContinuationEvents: a normal 15-minute candle spacing is never a signal', () => {
  const candles = [c(0, 100, 100.5, 99.5, 100), c(M15, 100, 101, 99, 100.5)];
  assert.equal(detectGapContinuationEvents(candles, WEEKLY_GAP_HOURS).length, 0);
});

test('detectGapContinuationEvents: the daily threshold catches a 1-3h break, not a weekend one', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(2 * H, 103, 104, 102.5, 103.2), // 2h break, gapped up
  ];
  const daily = detectGapContinuationEvents(candles, DAILY_GAP_HOURS);
  assert.equal(daily.length, 1);
  assert.equal(daily[0].direction, 'bullish');
  const weekly = detectGapContinuationEvents(candles, WEEKLY_GAP_HOURS);
  assert.equal(weekly.length, 0); // 2h is below the weekly floor (20h)
});

test('runGapContinuationBacktest: enters at the open of the candle AFTER the gap candle, resolves to a loss on stop', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 108, 109, 107.5, 108.2), // gap up -> bullish continuation, stop=107.5 (gap candle's low)
    c(51 * H, 108.2, 108.5, 108, 108.3), // entry candle, open=108.2
    c(52 * H, 108.3, 108.6, 107, 107.2), // low 107 <= stop 107.5 -> loss
  ];
  const trades = runGapContinuationBacktest(candles, WEEKLY_GAP_HOURS);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 2);
  assert.equal(t.entryPrice, 108.2);
  assert.equal(t.stopPrice, 107.5);
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runGapContinuationBacktest: resolves to a win at the fixed 1:3 target', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 108, 109, 107.5, 108.2), // bullish continuation, stop=107.5, distance from entry(108.2)=0.7, target=108.2+2.1=110.3
    c(51 * H, 108.2, 108.5, 108, 108.3),
    c(52 * H, 108.3, 110.5, 108, 110.4), // high 110.5 >= target 110.3 -> win
  ];
  const trades = runGapContinuationBacktest(candles, WEEKLY_GAP_HOURS);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.outcome, 'win');
  assert.ok(Math.abs(t.targetPrice - 110.3) < 1e-9);
  assert.equal(t.rMultiple, 3);
});

test('runGapContinuationBacktest: a signal whose entry would land beyond its own stop is discarded, not mis-signed', () => {
  const candles = [
    c(0, 100, 100.5, 99.5, 100),
    c(50 * H, 108, 109, 107.5, 108.2), // bullish continuation, stop=107.5
    c(51 * H, 107, 107.2, 106.8, 107.1), // entry candle opens BELOW the stop (107 < 107.5) - invalid long
  ];
  const trades = runGapContinuationBacktest(candles, WEEKLY_GAP_HOURS);
  assert.equal(trades.length, 0);
});
