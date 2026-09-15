import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectStarPatternEvents, runStarPatternsBacktest } from '../src/backtest/starPatterns.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;

test('detectStarPatternEvents: a real morning star (bearish, small star, bullish confirmation past midpoint) is bullish', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // c1 bearish, body=3.5, midpoint=98.25
    c(1 * M15, 96.2, 96.6, 95.8, 96.3), // c2 small star, body=0.1 <= 30% of 3.5
    c(2 * M15, 96.5, 99.5, 96.3, 99), // c3 bullish, closes at 99 > midpoint 98.25
  ];
  const events = detectStarPatternEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 2);
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].stopReference, 95.8); // lowest low across all 3 candles
});

test('detectStarPatternEvents: the mirror case (evening star) is bearish', () => {
  const candles = [
    c(0 * M15, 96, 100.2, 95.8, 100), // c1 bullish, body=4, midpoint=98
    c(1 * M15, 100.1, 100.4, 99.8, 100.2), // c2 small star, body=0.1
    c(2 * M15, 100, 97, 96.5, 97.2), // c3 bearish, closes at 97.2 < midpoint 98
  ];
  const events = detectStarPatternEvents(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].stopReference, 100.4); // highest high across all 3 candles
});

test('detectStarPatternEvents: candle 2 with too large a body (not a "star") is rejected', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // body=3.5
    c(1 * M15, 96.5, 98, 95.5, 97.5), // body=1 > 30% of 3.5 - too big to be a star
    c(2 * M15, 97.5, 99.5, 97, 99),
  ];
  assert.equal(detectStarPatternEvents(candles).length, 0);
});

test('detectStarPatternEvents: candle 3 that fails to close past candle 1\'s midpoint is rejected (no real reversal confirmation)', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // body=3.5, midpoint=98.25
    c(1 * M15, 96.2, 96.6, 95.8, 96.3),
    c(2 * M15, 96.5, 97.8, 96.3, 97.5), // closes at 97.5 - below midpoint 98.25
  ];
  assert.equal(detectStarPatternEvents(candles).length, 0);
});

test('detectStarPatternEvents: candle 2 overlapping too far into candle 1\'s body fails the "gap down" adaptation', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // c1 close=96.5
    c(1 * M15, 97, 97.2, 96.8, 97.1), // c2 body sits ABOVE c1's close (97 > 96.5) - no gap-down equivalent
    c(2 * M15, 97.1, 99.5, 97, 99),
  ];
  assert.equal(detectStarPatternEvents(candles).length, 0);
});

test('detectStarPatternEvents: candle 1 with no real body (already flat) never anchors a pattern', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 99.8, 100), // body=0
    c(1 * M15, 100, 100.1, 99.9, 100),
    c(2 * M15, 100, 103, 99.9, 102),
  ];
  assert.equal(detectStarPatternEvents(candles).length, 0);
});

test('detectStarPatternEvents: requireDoji rejects a small-but-not-doji star (body > 10% of its own range)', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // body=3.5
    c(1 * M15, 96.2, 97, 95.8, 96.4), // c2 body=0.2 (<=30% of 3.5, passes the star check), range=1.2, body/range=16.7% > 10%
    c(2 * M15, 96.5, 99.5, 96.3, 99),
  ];
  assert.equal(detectStarPatternEvents(candles).length, 1); // passes as a regular star...
  assert.equal(detectStarPatternEvents(candles, { requireDoji: true }).length, 0); // ...but not as a doji star
});

test('detectStarPatternEvents: requireDoji accepts a genuine doji (body <= 10% of its own range)', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // body=3.5
    c(1 * M15, 96.2, 96.7, 95.7, 96.25), // c2 body=0.05, range=1.0, body/range=5% <= 10%
    c(2 * M15, 96.5, 99.5, 96.3, 99),
  ];
  assert.equal(detectStarPatternEvents(candles, { requireDoji: true }).length, 1);
});

test('runStarPatternsBacktest: enters at the open of the candle AFTER the pattern, resolves to a win at 1:3', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5), // c1
    c(1 * M15, 96.2, 96.6, 95.8, 96.3), // c2 (star)
    c(2 * M15, 96.5, 99.5, 96.3, 99), // c3 confirmation, event.index=2, stopReference=95.8
    c(3 * M15, 99.2, 99.5, 99, 99.3), // entry candle, open=99.2, distance=99.2-95.8=3.4, target=99.2+10.2=109.4
    c(4 * M15, 99.3, 110, 99, 109.5), // high 110 >= target 109.4 -> win
  ];
  const trades = runStarPatternsBacktest(candles);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryIndex, 3);
  assert.equal(t.entryPrice, 99.2);
  assert.equal(t.stopPrice, 95.8);
  assert.ok(Math.abs(t.targetPrice - 109.4) < 1e-9);
  assert.equal(t.outcome, 'win');
  assert.ok(Math.abs(t.rMultiple - 3) < 1e-9);
});

test('runStarPatternsBacktest: resolves to a loss on stop', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5),
    c(1 * M15, 96.2, 96.6, 95.8, 96.3),
    c(2 * M15, 96.5, 99.5, 96.3, 99), // stopReference=95.8
    c(3 * M15, 99.2, 99.5, 99, 99.3), // entry open=99.2
    c(4 * M15, 99.3, 99.5, 95, 95.5), // low 95 <= stop 95.8 -> loss
  ];
  const trades = runStarPatternsBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1);
});

test('runStarPatternsBacktest: a signal whose entry would land beyond its own stop is discarded, not mis-signed', () => {
  const candles = [
    c(0 * M15, 100, 100.2, 96, 96.5),
    c(1 * M15, 96.2, 96.6, 95.8, 96.3),
    c(2 * M15, 96.5, 99.5, 96.3, 99), // bullish signal, stopReference=95.8
    c(3 * M15, 95, 95.5, 94.8, 95.2), // entry candle opens BELOW the stop (95 < 95.8) - invalid long
  ];
  const trades = runStarPatternsBacktest(candles);
  assert.equal(trades.length, 0);
});
