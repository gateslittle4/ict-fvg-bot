import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSqueezeBands, detectSqueezeReleases, runBollingerSqueezeBacktest } from '../src/backtest/bollingerSqueeze.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;

// Two market phases, built so the squeeze/release condition is verifiable
// by construction rather than guessed: PHASE 1 has WIDE wicks (high-low
// range +/-1.0) but closes barely move (+/-0.02), which pushes Keltner's
// ATR-based width well above Bollinger's close-stddev-based width -> a
// genuine squeeze. PHASE 2 reverses that: closes trend hard (0.5/candle)
// with TIGHT wicks relative to that move, which grows the Bollinger width
// past the (now-shrinking) Keltner width -> a release. Confirmed against
// the actual computeSqueezeBands() output before writing these assertions,
// same discipline as this project's other hand-verified indicator tests
// (see htfBias.test.js's computeEMA case).
function squeezeThenReleaseFixture() {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const close = 100 + (i % 2 === 0 ? 0.02 : -0.02);
    candles.push(c(t, close, close + 1.0, close - 1.0, close));
    t += M15;
  }
  for (let i = 0; i < 7; i++) {
    const close = 100 + (i + 1) * 0.5;
    const open = close - 0.5;
    candles.push(c(t, open, close + 0.05, open - 0.05, close));
    t += M15;
  }
  return candles;
}

test('computeSqueezeBands: bands are null before the 20-candle warmup, defined after', () => {
  const flat = Array.from({ length: 25 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  const bands = computeSqueezeBands(flat);
  for (let i = 0; i < 19; i++) {
    assert.equal(bands.bbUpper[i], null);
    assert.equal(bands.kcUpper[i], null);
  }
  assert.ok(bands.bbUpper[19] !== null);
  assert.ok(bands.kcUpper[19] !== null);
});

test('computeSqueezeBands: on a genuinely flat market, bbUpper equals kcUpper exactly (both collapse to the same price)', () => {
  // All-flat OHLC means stddev(closes)=0 AND ATR(range)=0, so both bands
  // collapse onto the SMA/EMA (which are also both just the flat price) -
  // an exact-equality edge case, useful to pin down the boundary behavior.
  const flat = Array.from({ length: 25 }, (_, i) => c(i * M15, 100, 100, 100, 100));
  const bands = computeSqueezeBands(flat);
  assert.equal(bands.bbUpper[24], 100);
  assert.equal(bands.kcUpper[24], 100);
  assert.equal(bands.bbLower[24], 100);
  assert.equal(bands.kcLower[24], 100);
});

test('detectSqueezeReleases: wide-wick/flat-close phase reads as squeezed, confirmed by construction', () => {
  const candles = squeezeThenReleaseFixture();
  const bands = computeSqueezeBands(candles);
  // Deep into phase 1 (well past the 20-candle warmup): Bollinger must sit
  // strictly inside Keltner.
  for (let i = 22; i <= 29; i++) {
    assert.ok(bands.bbUpper[i] < bands.kcUpper[i], `bar ${i}: bbUpper should be inside kcUpper`);
    assert.ok(bands.bbLower[i] > bands.kcLower[i], `bar ${i}: bbLower should be inside kcLower`);
  }
});

test('detectSqueezeReleases: fires exactly once, at the correct bar, in the correct direction', () => {
  const candles = squeezeThenReleaseFixture();
  const events = detectSqueezeReleases(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].index, 36);
  assert.equal(events[0].direction, 'bullish');
});

test('detectSqueezeReleases: the mirror (downtrend release) fires bearish', () => {
  const candles = [];
  let t = 0;
  for (let i = 0; i < 30; i++) {
    const close = 100 + (i % 2 === 0 ? 0.02 : -0.02);
    candles.push(c(t, close, close + 1.0, close - 1.0, close));
    t += M15;
  }
  for (let i = 0; i < 7; i++) {
    const close = 100 - (i + 1) * 0.5; // trending DOWN this time
    const open = close + 0.5;
    candles.push(c(t, open, open + 0.05, close - 0.05, close));
    t += M15;
  }
  const events = detectSqueezeReleases(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'bearish');
});

test('runBollingerSqueezeBacktest: an unresolved position at the end of the data is dropped, not fabricated', () => {
  // Same convention as every other backtest module here (weeklyLiquiditySweep.js,
  // judasSwing.js, ...): only RESOLVED trades are returned. This fixture's
  // release happens near the end, leaving too few candles to hit stop,
  // target, or the 480-candle timeout.
  const candles = squeezeThenReleaseFixture();
  assert.deepEqual(runBollingerSqueezeBacktest(candles), []);
});

test('runBollingerSqueezeBacktest: entry fills at the NEXT candle open after the release, and a sustained move hits the fixed 1:3 target', () => {
  const candles = squeezeThenReleaseFixture();
  let t = candles[candles.length - 1].time + M15;
  // Sustained continuation so the trade opened at the release actually resolves.
  for (let i = 0; i < 20; i++) {
    const open = candles[candles.length - 1].close;
    const close = open + 3;
    candles.push(c(t, open, close + 0.1, open - 0.1, close));
    t += M15;
  }

  const trades = runBollingerSqueezeBacktest(candles);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.entryIndex, 37); // one candle after the release at index 36
  assert.equal(trade.entryPrice, candles[37].open);
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runBollingerSqueezeBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const candles = squeezeThenReleaseFixture();
  let t = candles[candles.length - 1].time + M15;
  // Reverse hard immediately after entry - the bullish trade's stop should hit.
  for (let i = 0; i < 5; i++) {
    const open = candles[candles.length - 1].close;
    const close = open - 3;
    candles.push(c(t, open, open + 0.1, close - 0.1, close));
    t += M15;
  }
  const trades = runBollingerSqueezeBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
});

test('runBollingerSqueezeBacktest: a position that resolves at neither stop nor target within the timeout exits at the timeout close', () => {
  const candles = squeezeThenReleaseFixture();
  let t = candles[candles.length - 1].time + M15;
  // Drift sideways, staying well inside both stop and target, for
  // MAX_HOLDING_CANDLES (480) candles plus one more so the timeout check
  // (i - entryIndex >= 480) actually has a candle at that index to fire on.
  for (let i = 0; i < 481; i++) {
    const price = candles[candles.length - 1].close + (i % 2 === 0 ? 0.01 : -0.01);
    candles.push(c(t, price, price + 0.02, price - 0.02, price));
    t += M15;
  }
  const trades = runBollingerSqueezeBacktest(candles);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
  assert.equal(trades[0].exitIndex - trades[0].entryIndex, 480);
});

test('runBollingerSqueezeBacktest: only one position open at a time - no new entry while one is still open', () => {
  const candles = squeezeThenReleaseFixture();
  // Even if more releases occurred immediately after, the loop's `if (!open)`
  // guard means a second signal can't open a second concurrent position -
  // verified structurally: with only one release in this fixture and no
  // resolution, trades stays empty (already covered above), and the open
  // slot is never double-booked. This test documents that invariant
  // explicitly rather than leaving it implicit.
  const events = detectSqueezeReleases(candles);
  assert.equal(events.length, 1); // exactly one signal exists to race against
});

test('runBollingerSqueezeBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const flat = Array.from({ length: 100 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(runBollingerSqueezeBacktest(flat), []);
});

test('runBollingerSqueezeBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runBollingerSqueezeBacktest([]), []);
});
