import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSilverBulletFvgs, runSilverBulletBacktest } from '../src/backtest/silverBullet.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 15 * 60 * 1000;

// January 2024: NY is on fixed EST (no DST) that month, and this project's
// HistData convention already treats candle `.time` as a fixed-EST-as-UTC
// instant (see nySession.js's own caveat) - so in January, `.time`'s own
// UTC hour-of-day equals the real NY local hour-of-day, making fixture
// construction straightforward without fighting the DST-aware lookup.
//
// Builds: 10 flat candles, a swing high pivot at 110 (confirmed 5 candles
// later), more flat candles, then a break-of-structure candle closing above
// 110 (flips the structure bias to 'bullish'), then pads with flat candles
// up to 09:30 UTC/NY. From there, a 3-candle bullish FVG (gap [108.5,108.9])
// is formed with its c3 (formation) candle landing at 10:00 - inside the
// Silver Bullet window - while the bullish bias is already active. Verified
// against the actual function output before hardcoding (same discipline as
// every other backtest module's test in this project) - the structure-bias
// confirmation lag and the window/MSS interaction aren't simple enough to
// hand-verify without running it first.
function baseToFvg() {
  let t = Date.UTC(2024, 0, 1, 0, 0);
  const candles = [];
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15; // swing high = 110
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 112, 104, 111)); t += M15; // BOS: close 111 > 110 -> bullish structure bias
  for (let i = 0; i < 5; i++) { candles.push(c(t, 108, 108.2, 107.8, 108)); t += M15; }
  while (new Date(t).getUTCHours() < 9 || (new Date(t).getUTCHours() === 9 && new Date(t).getUTCMinutes() < 30)) {
    candles.push(c(t, 108, 108.2, 107.8, 108)); t += M15;
  }
  candles.push(c(t, 108, 108.5, 107.5, 108)); t += M15; // c1, high=108.5
  candles.push(c(t, 108, 109, 107, 108)); t += M15; // c2
  candles.push(c(t, 109, 110, 108.9, 109.5)); t += M15; // c3 (10:00 NY) -> bullish FVG [108.5, 108.9]
  const fvgIndex = candles.length - 1;
  return { candles, t, fvgIndex };
}

test('detectSilverBulletFvgs: an FVG formed inside the killzone, agreeing with the active structure bias, is eligible', () => {
  const { candles, fvgIndex } = baseToFvg();
  const events = detectSilverBulletFvgs(candles);
  assert.equal(events.length, 1);
  assert.equal(events[0].formedIndex, fvgIndex);
  assert.equal(events[0].direction, 'bullish');
  assert.deepEqual(events[0].zone, { top: 108.9, bottom: 108.5 });
});

test('detectSilverBulletFvgs: the same gap shape formed OUTSIDE the killzone window is rejected', () => {
  // Same setup as baseToFvg() but the pad loop is skipped, so the FVG's c3
  // candle lands at 08:30 - a genuine gap, in the direction of the active
  // bullish bias, just at the wrong hour.
  let t = Date.UTC(2024, 0, 1, 0, 0);
  const candles = [];
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15;
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 112, 104, 111)); t += M15; // BOS
  for (let i = 0; i < 5; i++) { candles.push(c(t, 108, 108.2, 107.8, 108)); t += M15; }
  candles.push(c(t, 108, 108.5, 107.5, 108)); t += M15; // c1
  candles.push(c(t, 108, 109, 107, 108)); t += M15; // c2
  candles.push(c(t, 109, 110, 108.9, 109.5)); t += M15; // c3 at 08:30 NY - before the window
  assert.deepEqual(detectSilverBulletFvgs(candles), []);
});

test('detectSilverBulletFvgs: a same-shaped gap inside the window with NO prior break of structure (bias still neutral) is rejected', () => {
  let t = Date.UTC(2024, 0, 1, 0, 0);
  const candles = [];
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  // No BOS anywhere - structure bias stays 'neutral' throughout.
  while (new Date(t).getUTCHours() < 9 || (new Date(t).getUTCHours() === 9 && new Date(t).getUTCMinutes() < 30)) {
    candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15;
  }
  candles.push(c(t, 100, 100.5, 99.5, 100)); t += M15; // c1
  candles.push(c(t, 100, 101, 99, 100)); t += M15; // c2
  candles.push(c(t, 100.6, 101.5, 100.5, 101)); t += M15; // c3 (10:00 NY) - a real gap, but no MSS backs it
  assert.deepEqual(detectSilverBulletFvgs(candles), []);
});

test('detectSilverBulletFvgs: a flat/no-signal market produces zero events, not a crash', () => {
  const flat = Array.from({ length: 100 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(detectSilverBulletFvgs(flat), []);
});

test('detectSilverBulletFvgs: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(detectSilverBulletFvgs([]), []);
});

test('runSilverBulletBacktest: an unresolved position at the end of the data is dropped, not fabricated', () => {
  const { candles } = baseToFvg();
  assert.deepEqual(runSilverBulletBacktest(candles), []);
});

test('runSilverBulletBacktest: entry fills at the NEXT candle open after mitigation, stop beyond the gap edge (10% buffer), and a clean move hits the fixed 1:3 target', () => {
  const { candles, t: t0 } = baseToFvg();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 109.3, 109.4, 108.7, 108.8)); t += M15; // mitigation: low 108.7 <= zone.top 108.9
  withEntry.push(c(t, 109.5, 109.6, 109.4, 109.5)); t += M15; // entry candle, open=109.5
  withEntry.push(c(t, 109.5, 113, 109.2, 112.8)); t += M15; // clean rally, stays above the stop, hits target

  const trades = runSilverBulletBacktest(withEntry);
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.direction, 'bullish');
  assert.equal(trade.entryPrice, 109.5);
  assert.ok(Math.abs(trade.stopPrice - 108.46) < 1e-9); // zone.bottom(108.5) - 10%*(0.4) buffer
  assert.equal(trade.outcome, 'win');
  assert.ok(Math.abs(trade.rMultiple - 3) < 1e-6);
});

test('runSilverBulletBacktest: a losing trade resolves at exactly -1R at the stop price', () => {
  const { candles, t: t0 } = baseToFvg();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 109.3, 109.4, 108.7, 108.8)); t += M15; // mitigation
  withEntry.push(c(t, 109.5, 109.6, 109.4, 109.5)); t += M15; // entry candle
  withEntry.push(c(t, 109.4, 109.5, 108, 108.2)); t += M15; // reverses hard, dips through the stop

  const trades = runSilverBulletBacktest(withEntry);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].exitPrice, trades[0].stopPrice);
  assert.ok(Math.abs(trades[0].rMultiple - -1) < 1e-6);
});

test('runSilverBulletBacktest: a position that resolves at neither stop nor target within the timeout exits at the timeout close', () => {
  const { candles, t: t0 } = baseToFvg();
  let t = t0;
  const withEntry = [...candles];
  withEntry.push(c(t, 109.3, 109.4, 108.7, 108.8)); t += M15; // mitigation
  withEntry.push(c(t, 109.5, 109.6, 109.4, 109.5)); t += M15; // entry candle
  for (let i = 0; i < 481; i++) {
    const price = withEntry[withEntry.length - 1].close + (i % 2 === 0 ? 0.01 : -0.01);
    withEntry.push(c(t, price, price + 0.02, price - 0.02, price));
    t += M15;
  }
  const trades = runSilverBulletBacktest(withEntry);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
  assert.equal(trades[0].exitIndex - trades[0].entryIndex, 480);
});

test('runSilverBulletBacktest: a flat/no-signal market produces zero trades, not a crash', () => {
  const flat = Array.from({ length: 100 }, (_, i) => c(i * M15, 100, 100.1, 99.9, 100));
  assert.deepEqual(runSilverBulletBacktest(flat), []);
});

test('runSilverBulletBacktest: empty/undefined input is a safe no-op', () => {
  assert.deepEqual(runSilverBulletBacktest([]), []);
});
