import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FvgEngine } from '../src/engines/fvgEngine.js';

function candle(time, open, high, low, close) {
  return { time, open, high, low, close };
}

test('detects a bullish FVG and emits "watching"', () => {
  const engine = new FvgEngine({ symbol: 'US100' });
  const c1 = candle(1, 100, 101, 99, 100.5);   // high = 101
  const c2 = candle(2, 100.5, 105, 100.4, 104.8); // impulsive up candle
  const c3 = candle(3, 104.8, 106, 103, 105.5);   // low = 103 > c1.high (101) => gap [101,103]

  engine.processCandle(c1);
  engine.processCandle(c2);
  const events = engine.processCandle(c3);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'watching');
  assert.equal(events[0].direction, 'bullish');
  assert.equal(events[0].zone.bottom, 101);
  assert.equal(events[0].zone.top, 103);
});

test('detects a bearish FVG and emits "watching"', () => {
  const engine = new FvgEngine({ symbol: 'US500' });
  const c1 = candle(1, 100, 100.5, 99, 99.2);     // low = 99
  const c2 = candle(2, 99.2, 99.3, 95, 95.5);     // impulsive down candle
  const c3 = candle(3, 95.5, 97, 94, 94.5);       // high = 97 < c1.low (99) => gap [97,99]

  engine.processCandle(c1);
  engine.processCandle(c2);
  const events = engine.processCandle(c3);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'watching');
  assert.equal(events[0].direction, 'bearish');
  assert.equal(events[0].zone.bottom, 97);
  assert.equal(events[0].zone.top, 99);
});

test('no FVG emitted when candles do not leave a gap', () => {
  const engine = new FvgEngine({ symbol: 'EURUSD' });
  const c1 = candle(1, 1.1, 1.102, 1.098, 1.101);
  const c2 = candle(2, 1.101, 1.103, 1.099, 1.1);
  const c3 = candle(3, 1.1, 1.101, 1.0995, 1.1005); // overlaps c1 range, no gap

  engine.processCandle(c1);
  engine.processCandle(c2);
  const events = engine.processCandle(c3);

  assert.equal(events.length, 0);
  assert.equal(engine.getActiveFvgs().length, 0);
});

test('emits "validated" when price returns into a bullish FVG, and stops watching it', () => {
  const engine = new FvgEngine({ symbol: 'US100' });
  engine.processCandle(candle(1, 100, 101, 99, 100.5));
  engine.processCandle(candle(2, 100.5, 105, 100.4, 104.8));
  const formed = engine.processCandle(candle(3, 104.8, 106, 103, 105.5)); // zone [101,103]
  assert.equal(formed[0].type, 'watching');

  // price keeps rallying, no return yet
  const noReturn = engine.processCandle(candle(4, 105.5, 107, 105, 106.5));
  assert.equal(noReturn.length, 0);
  assert.equal(engine.getActiveFvgs().length, 1);

  // price dips back into the [101,103] zone -> validated
  const validated = engine.processCandle(candle(5, 106.5, 106.6, 102, 102.5));
  assert.equal(validated.length, 1);
  assert.equal(validated[0].type, 'validated');
  assert.equal(validated[0].suggestedSide, 'buy');
  assert.equal(engine.getActiveFvgs().length, 0); // consumed, no longer watched
});

test('emits "validated" when price returns into a bearish FVG', () => {
  const engine = new FvgEngine({ symbol: 'US500' });
  engine.processCandle(candle(1, 100, 100.5, 99, 99.2));
  engine.processCandle(candle(2, 99.2, 99.3, 95, 95.5));
  engine.processCandle(candle(3, 95.5, 97, 94, 94.5)); // zone [97,99]

  const validated = engine.processCandle(candle(4, 94.5, 98, 94, 97.5)); // high 98 enters zone
  assert.equal(validated.length, 1);
  assert.equal(validated[0].type, 'validated');
  assert.equal(validated[0].suggestedSide, 'sell');
});

test('drops a stale FVG as "expired" after maxAgeCandles', () => {
  const engine = new FvgEngine({ symbol: 'US100', maxAgeCandles: 2 });
  engine.processCandle(candle(1, 100, 101, 99, 100.5));
  engine.processCandle(candle(2, 100.5, 105, 100.4, 104.8));
  engine.processCandle(candle(3, 104.8, 106, 103, 105.5)); // zone [101,103], age starts at 0

  // two candles that never dip into [101,103]
  engine.processCandle(candle(4, 105.5, 108, 104, 107));   // age -> 1
  const expiredEvents = engine.processCandle(candle(5, 107, 109, 105, 108)); // age -> 2 -> expired

  assert.ok(expiredEvents.some((e) => e.type === 'expired'));
  assert.equal(engine.getActiveFvgs().length, 0);
});

test('tracks independent FVG queues per symbol instance', () => {
  const a = new FvgEngine({ symbol: 'US100' });
  const b = new FvgEngine({ symbol: 'EURUSD' });
  a.processCandle(candle(1, 100, 101, 99, 100.5));
  a.processCandle(candle(2, 100.5, 105, 100.4, 104.8));
  a.processCandle(candle(3, 104.8, 106, 103, 105.5));

  assert.equal(a.getActiveFvgs().length, 1);
  assert.equal(b.getActiveFvgs().length, 0);
});
