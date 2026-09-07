import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pearsonCorrelation, computeCorrelationMatrix, computeZScoreSeries, alignByTime } from '../src/backtest/correlation.js';

test('pearsonCorrelation returns ~1 for perfectly correlated series', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [2, 4, 6, 8, 10];
  const r = pearsonCorrelation(xs, ys);
  assert.ok(Math.abs(r - 1) < 1e-9);
});

test('pearsonCorrelation returns ~-1 for perfectly anti-correlated series', () => {
  const xs = [1, 2, 3, 4, 5];
  const ys = [10, 8, 6, 4, 2];
  const r = pearsonCorrelation(xs, ys);
  assert.ok(Math.abs(r - -1) < 1e-9);
});

test('pearsonCorrelation returns null for a constant series (zero variance)', () => {
  const xs = [1, 1, 1, 1];
  const ys = [1, 2, 3, 4];
  assert.equal(pearsonCorrelation(xs, ys), null);
});

test('computeCorrelationMatrix: two symbols moving in lockstep are highly correlated', () => {
  const times = Array.from({ length: 100 }, (_, i) => i * 900000);
  let priceA = 100;
  const candlesA = [];
  const candlesB = [];
  for (const t of times) {
    const move = (Math.random() - 0.5) * 2;
    priceA += move;
    candlesA.push({ time: t, close: priceA });
    candlesB.push({ time: t, close: priceA * 5 + 3 }); // perfectly derived from A -> correlation should be ~1
  }
  const { matrix, overlapCounts } = computeCorrelationMatrix({ A: candlesA, B: candlesB });
  assert.ok(matrix.A.B > 0.99);
  assert.equal(matrix.A.A, 1);
  assert.equal(overlapCounts.A.B, 100);
});

test('computeCorrelationMatrix: independent random walks show low correlation', () => {
  const times = Array.from({ length: 500 }, (_, i) => i * 900000);
  let priceA = 100;
  let priceB = 50;
  const candlesA = [];
  const candlesB = [];
  for (const t of times) {
    priceA += (Math.random() - 0.5) * 2;
    priceB += (Math.random() - 0.5) * 2;
    candlesA.push({ time: t, close: priceA });
    candlesB.push({ time: t, close: priceB });
  }
  const { matrix } = computeCorrelationMatrix({ A: candlesA, B: candlesB });
  assert.ok(Math.abs(matrix.A.B) < 0.3); // should be roughly uncorrelated, allow noise margin
});

test('computeCorrelationMatrix only uses overlapping timestamps and reports null below minOverlap', () => {
  const candlesA = [
    { time: 0, close: 100 },
    { time: 900000, close: 101 },
  ];
  const candlesB = [
    { time: 0, close: 50 },
    { time: 900000, close: 51 },
  ];
  const { matrix, overlapCounts } = computeCorrelationMatrix({ A: candlesA, B: candlesB }, 30);
  assert.equal(overlapCounts.A.B, 2);
  assert.equal(matrix.A.B, null); // fewer than minOverlap=30 common points -> not trusted
});

test('computeZScoreSeries: stays null during warm-up, then flags a big deviation as an extreme z-score', () => {
  // 10 flat values (mean 0, std 0) then a jump -> null while std is 0 (no info yet from a
  // perfectly flat window would actually be handled as std===0 -> z=0, but here we build a
  // window with real variance so std > 0 and the jump reads as clearly extreme).
  const series = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 20];
  const z = computeZScoreSeries(series, 10);
  for (let i = 0; i < 10; i++) assert.equal(z[i], null);
  assert.ok(z[10] > 2, `expected a large positive z-score for the jump, got ${z[10]}`);
});

test('computeZScoreSeries: a perfectly flat window (zero variance) yields z=0 rather than NaN/Infinity', () => {
  const series = [5, 5, 5, 5, 5, 5];
  const z = computeZScoreSeries(series, 5);
  assert.equal(z[5], 0);
});

test('computeZScoreSeries only uses PRIOR values, never the current one (no lookahead)', () => {
  // If index i's own value were included, a huge value at i would inflate its own z-score's
  // denominator and pull the mean toward itself, shrinking the resulting z. Confirm the z-score
  // at the jump matches a hand-computed value that excludes it from the window.
  const series = [0, 0, 0, 0, 0, 100];
  const z = computeZScoreSeries(series, 5);
  // mean of [0,0,0,0,0] = 0, std = 0 -> z = 0 per the zero-variance rule, NOT influenced by the 100.
  assert.equal(z[5], 0);
});

test('alignByTime keeps only common timestamps, in order, from both series', () => {
  const a = [{ time: 0, v: 'a0' }, { time: 100, v: 'a1' }, { time: 200, v: 'a2' }];
  const b = [{ time: 100, v: 'b1' }, { time: 200, v: 'b2' }, { time: 300, v: 'b3' }];
  const { alignedA, alignedB } = alignByTime(a, b);
  assert.deepEqual(alignedA.map((c) => c.time), [100, 200]);
  assert.deepEqual(alignedB.map((c) => c.time), [100, 200]);
  assert.equal(alignedA[0].v, 'a1');
  assert.equal(alignedB[0].v, 'b1');
});

test('alignByTime returns empty arrays when there is no overlap', () => {
  const a = [{ time: 0 }, { time: 100 }];
  const b = [{ time: 200 }, { time: 300 }];
  const { alignedA, alignedB } = alignByTime(a, b);
  assert.equal(alignedA.length, 0);
  assert.equal(alignedB.length, 0);
});
