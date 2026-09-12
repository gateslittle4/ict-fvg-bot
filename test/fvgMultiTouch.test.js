import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MultiTouchFvgEngine, buildMultiTouchFilterPredicate } from '../src/backtest/fvgMultiTouch.js';

function candle(time, open, high, low, close) {
  return { time, open, high, low, close };
}
const M15 = 900000;

test('with no filter (default "always pass"), behaves identically to a single-touch engine: first touch validates', () => {
  const engine = new MultiTouchFvgEngine({ symbol: 'US100' });
  engine.processCandle(candle(0, 100, 101, 99, 100.5));
  engine.processCandle(candle(M15, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(2 * M15, 104.8, 106, 103, 105.5)); // watching, zone [101,103]

  const events = engine.processCandle(candle(3 * M15, 105, 105.5, 102, 102.5)); // low=102 dips into zone
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'validated');
  assert.equal(events[0].touchAttempts, 1);
  assert.equal(engine.getActiveFvgs().length, 0); // consumed
});

test('THE core behavior change: a touch that fails checkFilters does NOT consume the zone - it survives to try again', () => {
  let callCount = 0;
  const rejectFirstTwo = () => { callCount += 1; return callCount > 2; }; // first 2 touches fail, 3rd passes
  const engine = new MultiTouchFvgEngine({ symbol: 'US100', checkFilters: rejectFirstTwo });
  engine.processCandle(candle(0, 100, 101, 99, 100.5));
  engine.processCandle(candle(M15, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(2 * M15, 104.8, 106, 103, 105.5)); // watching, zone [101,103]

  const e1 = engine.processCandle(candle(3 * M15, 105, 105.5, 102, 102.5)); // touch 1, rejected
  assert.equal(e1.length, 0); // rejected touches emit nothing (unlike fvgEngine.js's single-shot 'validated'-then-filtered - here the zone never got far enough to try emitting)
  assert.equal(engine.getActiveFvgs().length, 1, 'zone must survive a rejected touch');

  const e2 = engine.processCandle(candle(4 * M15, 102.5, 103, 101.5, 102)); // touch 2, still rejected
  assert.equal(e2.length, 0);
  assert.equal(engine.getActiveFvgs().length, 1, 'zone must still survive a second rejected touch');

  const e3 = engine.processCandle(candle(5 * M15, 102, 102.5, 101.8, 102.2)); // touch 3, passes
  assert.equal(e3.length, 1);
  assert.equal(e3[0].type, 'validated');
  assert.equal(e3[0].touchAttempts, 3, 'carries how many touches (including the accepted one) this zone survived');
  assert.equal(engine.getActiveFvgs().length, 0);
});

test('a zone whose every touch is rejected still expires at maxAgeCandles, same cutoff as fvgEngine.js', () => {
  const alwaysReject = () => false;
  const engine = new MultiTouchFvgEngine({ symbol: 'US100', maxAgeCandles: 5, checkFilters: alwaysReject });
  engine.processCandle(candle(0, 100, 101, 99, 100.5));
  engine.processCandle(candle(M15, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(2 * M15, 104.8, 106, 103, 105.5)); // watching

  let expiredEvent = null;
  for (let i = 1; i <= 5; i++) {
    // Touches the zone (low 102.3 <= zone.top 103) without accidentally forming
    // a NEW gap against the neighboring real candles (high 103.2 overlaps c2's
    // low of 103, so no fresh c1/c3 gap opens here - this repeated candle must
    // stay a pure "touch", not spawn its own FVG).
    const events = engine.processCandle(candle((2 + i) * M15, 102.8, 103.2, 102.3, 102.8));
    const exp = events.find((e) => e.type === 'expired');
    if (exp) expiredEvent = exp;
  }
  assert.ok(expiredEvent, 'expected the zone to expire once maxAgeCandles is reached, even though every touch was rejected rather than validated');
  assert.equal(expiredEvent.touchAttempts, 5);
  assert.equal(engine.getActiveFvgs().length, 0);
});

test('a zone with no touches at all still expires normally at maxAgeCandles (age-out path untouched by the experiment)', () => {
  const engine = new MultiTouchFvgEngine({ symbol: 'US100', maxAgeCandles: 3 });
  engine.processCandle(candle(0, 100, 101, 99, 100.5));
  engine.processCandle(candle(M15, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(2 * M15, 104.8, 106, 103, 105.5)); // watching, zone [101,103]

  engine.processCandle(candle(3 * M15, 110, 111, 109, 110.5)); // never dips near the zone
  engine.processCandle(candle(4 * M15, 110.5, 111, 109.5, 110));
  const events = engine.processCandle(candle(5 * M15, 110, 110.5, 109, 109.5));
  const exp = events.find((e) => e.type === 'expired');
  assert.ok(exp);
  assert.equal(exp.touchAttempts, 0);
});

test('buildMultiTouchFilterPredicate with no filters enabled always passes (matches buildFilteredEngine baseline)', () => {
  const predicate = buildMultiTouchFilterPredicate([], 'US100', { variant: 'baseline' });
  assert.equal(predicate(candle(0, 1, 1, 1, 1), { direction: 'bullish' }), true);
  assert.equal(predicate(candle(0, 1, 1, 1, 1), { direction: 'bearish' }), true);
});

test('buildMultiTouchFilterPredicate: session-only config rejects a touch outside the window and passes one inside it', () => {
  // Fixed-EST-as-UTC convention (nySession.js) - a Wednesday at 15:00 UTC is 10:00 NY (EST, winter).
  const predicate = buildMultiTouchFilterPredicate([], 'US100', {
    variant: 'baseline',
    sessionEnabled: true,
    sessionWindow: { startHour: 10, endHour: 11 },
  });
  // isInNySessionWindow expects the fixed-EST-as-UTC convention (candle.time
  // + 5h = true UTC, per nySession.js's own header) - not a plain UTC stamp.
  const insideWindow = Date.parse('2026-01-07T10:00:00Z'); // +5h = 15:00Z = 10:00 EST
  const outsideWindow = Date.parse('2026-01-07T08:00:00Z'); // +5h = 13:00Z = 08:00 EST
  assert.equal(predicate(candle(insideWindow, 1, 1, 1, 1), { direction: 'bullish' }), true);
  assert.equal(predicate(candle(outsideWindow, 1, 1, 1, 1), { direction: 'bullish' }), false);
});

test('minCandlesBeforeEligible=2: a touch on the very first candle after formation is skipped entirely (not even a rejected attempt)', () => {
  const engine = new MultiTouchFvgEngine({ symbol: 'US100', minCandlesBeforeEligible: 2 });
  const M15 = 900000;
  engine.processCandle(candle(0, 100, 101, 99, 100.5));
  engine.processCandle(candle(M15, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(2 * M15, 104.8, 106, 103, 105.5)); // watching, zone [101,103]

  const e1 = engine.processCandle(candle(3 * M15, 105, 105.5, 102, 102.5)); // low=102 dips in, but this is candlesSinceFormed=1 - must be ignored
  assert.equal(e1.length, 0);
  assert.equal(engine.getActiveFvgs()[0].touchAttempts, 0, 'a skipped-as-ineligible touch must not even count as an attempt');

  const e2 = engine.processCandle(candle(4 * M15, 102.5, 103, 102, 102.8)); // candlesSinceFormed=2, now eligible, and still dips in
  assert.equal(e2.length, 1);
  assert.equal(e2[0].type, 'validated');
});

test('minCandlesBeforeEligible=1 (default) matches the original always-eligible behavior', () => {
  const engine = new MultiTouchFvgEngine({ symbol: 'US100' });
  const M15 = 900000;
  engine.processCandle(candle(0, 100, 101, 99, 100.5));
  engine.processCandle(candle(M15, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(2 * M15, 104.8, 106, 103, 105.5));
  const events = engine.processCandle(candle(3 * M15, 105, 105.5, 102, 102.5));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'validated');
});
