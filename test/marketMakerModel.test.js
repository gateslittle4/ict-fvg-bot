import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketMakerTrades, buildBars } from '../scripts/lib/marketMakerModel.js';

const MIN = 60000, T0 = Date.UTC(2020, 0, 6, 0, 0);

/** M15 bars [o, h, l, c] -> M1 series (15 minutes each: open, high at minute 3, low at minute 8, close). */
function m1From(m15) {
  const t = [], o = [], h = [], l = [], c = [];
  m15.forEach(([bo, bh, bl, bc], k) => {
    for (let m = 0; m < 15; m++) {
      const p = m === 0 ? bo : m < 3 ? bo : m === 3 ? bh : m < 8 ? (bh + bl) / 2 : m === 8 ? bl : bc;
      t.push(T0 + (k * 15 + m) * MIN); o.push(p); c.push(p);
      h.push(m === 3 ? bh : p); l.push(m === 8 ? bl : p);
    }
  });
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}
const flat = (n, mid, w = 0.1) => Array.from({ length: n }, (_, k) => [mid, mid + w, mid - w, mid + (k % 2 ? w / 2 : -w / 2)]);
const bar = (o, h, l, c, n = 1) => Array.from({ length: n }, () => [o, h, l, c]);

// Buy Model: 40 h of tight range around 100 (ATR ~0.2, original consolidation 99.9-100.1), breakout below, a decline in stages with an H1
// swing low at 99.0, a deeper extreme at 98.0 that sweeps it, an M15 swing high at 98.8 before the extreme, a rally that closes above it
// leaving a bullish FVG (98.3 -> 98.5), a pullback into the FVG, then a run back to the consolidation (target 99.9).
function buyScenario(w = 0.1) {
  return [
    ...flat(40 * 4, 100, w),
    ...bar(100, 100, 99.6, 99.6, 4), // H1 closes below 99.9 -> breakout
    ...bar(99.6, 99.6, 99.3, 99.3, 4),
    ...bar(99.3, 99.3, 99.0, 99.0, 4), // H1 swing low 99.0 (lower than 2 H1 bars on each side)
    ...bar(99.2, 99.4, 99.2, 99.4, 4),
    ...bar(99.4, 99.6, 99.3, 99.5, 4),
    ...bar(99.5, 99.5, 99.1, 99.2, 4),
    [99.2, 99.2, 98.6, 98.6],
    ...bar(98.6, 98.65, 98.5, 98.55, 2),
    [98.55, 98.8, 98.55, 98.7], // M15 swing high 98.8 (2 bars on each side lower)
    ...bar(98.7, 98.7, 98.5, 98.5, 2),
    [98.5, 98.5, 98.0, 98.2], // extreme 98.0 (sweeps the 99.0 H1 swing low)
    [98.2, 98.3, 98.1, 98.3], // k-2: high 98.3
    [98.3, 98.9, 98.3, 98.9], // close 98.9 > 98.8 -> MSS
    [98.9, 99.0, 98.5, 98.9], // k = MSS + 1: low 98.5 > 98.3 -> FVG, entry 98.5
    [98.9, 98.9, 98.45, 98.6], // pullback fills the LIMIT at 98.5
    ...bar(98.6, 99.2, 98.6, 99.2, 2),
    ...bar(99.2, 100.0, 99.2, 100.0, 2), // target 99.9 reached
    ...flat(40, 100),
  ];
}

test('marketMakerModel: finds the hand-built Buy Model, enters at the FVG edge, stop at the extreme, exits at the consolidation', () => {
  const trades = marketMakerTrades(m1From(buyScenario()), () => 0.01);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.long, true); assert.equal(t.entry, 98.5); assert.equal(t.stop, 98.0); assert.ok(Math.abs(t.target - 99.9) < 1e-9);
  assert.equal(t.reason, 'target'); assert.ok(Math.abs(t.r - 2.8) < 1e-9);
});

test('marketMakerModel: the Sell Model is the exact mirror (prices reflected around 100)', () => {
  const mirror = buyScenario().map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c]);
  const trades = marketMakerTrades(m1From(mirror), () => 0.01);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.long, false); assert.equal(t.entry, 101.5); assert.equal(t.stop, 102.0); assert.ok(Math.abs(t.target - 100.1) < 1e-9);
  assert.equal(t.reason, 'target');
});

test('marketMakerModel: no trade when the decline is too small (less than 3 ATR) or the target is under 2R', () => {
  // wider consolidation (ATR ~1): the same 2-point decline is now under 3 ATR below it
  assert.equal(marketMakerTrades(m1From(buyScenario(0.5)), () => 0.01).length, 0);
  assert.equal(marketMakerTrades(m1From(buyScenario()), () => 0.01, { minRR: 3 }).length, 0); // 99.9 - 98.5 = 1.4 = 2.8R < 3R
});

test('marketMakerModel: buildBars groups M1 into periods with first/last M1 indices', () => {
  const S = m1From(flat(8, 100));
  const H = buildBars(S, 3600000);
  assert.equal(H.n, 2); assert.equal(H.i0[1], 60); assert.equal(H.i1[1], 120);
});
