import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDivergenceMomentumCandidates, runDivergenceMomentumBacktestForSymbol } from '../src/backtest/divergenceMomentum.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}
const H1 = 60 * 60 * 1000;

// Same "small oscillation then a jump" shape already proven (in
// test/correlation.test.js) to push a z-score well past a threshold of 2
// with lookback=10, applied here to the logRatio = log(A) - log(B) via
// exact log-space construction: A_close[i] = 100 * exp(r[i]), B_close
// constant at 100, so logRatio[i] is EXACTLY r[i] - a deliberate jump at
// the end reads as "A pulled ahead" (A is the leader).
const R_PATTERN = [0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.5, 0.5];

function buildHourlyCandles(closes, startTime = 0) {
  // Tiny nonzero range on every candle - ATR must be > 0 for a candidate to
  // be produced at all (see computeDivergenceMomentumCandidates' own
  // `atr && atr > 0` guard), which a perfectly flat OHLC (as a real gapless
  // synthetic close-only series would be) can never satisfy.
  return closes.map((close, i) => c(startTime + i * H1, close, close + 0.01, close - 0.01, close));
}

test('computeDivergenceMomentumCandidates: A pulling ahead of B (z very positive) trades the LEADER (A), not the laggard (B)', () => {
  const aCloses = R_PATTERN.map((r) => 100 * Math.exp(r));
  const bCloses = R_PATTERN.map(() => 100);
  const m15A = buildHourlyCandles(aCloses);
  const m15B = buildHourlyCandles(bCloses);
  const candidates = computeDivergenceMomentumCandidates(m15A, 'SYM_A', m15B, 'SYM_B', { lookback: 10, atrPeriod: 2 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].symbol, 'SYM_A');
  assert.equal(candidates[0].entryTime, m15A[11].time);
  assert.ok(candidates[0].stopDistance > 0);
});

test('computeDivergenceMomentumCandidates: the mirror case (B pulls ahead) trades B instead', () => {
  const aCloses = R_PATTERN.map(() => 100);
  const bCloses = R_PATTERN.map((r) => 100 * Math.exp(r)); // B rises -> logRatio = logA - logB goes very negative
  const m15A = buildHourlyCandles(aCloses);
  const m15B = buildHourlyCandles(bCloses);
  const candidates = computeDivergenceMomentumCandidates(m15A, 'SYM_A', m15B, 'SYM_B', { lookback: 10, atrPeriod: 2 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].symbol, 'SYM_B');
});

test('computeDivergenceMomentumCandidates: no divergence (flat series) produces no candidates', () => {
  const flat = R_PATTERN.map(() => 100);
  const m15A = buildHourlyCandles(flat);
  const m15B = buildHourlyCandles(flat);
  assert.equal(computeDivergenceMomentumCandidates(m15A, 'SYM_A', m15B, 'SYM_B', { lookback: 10, atrPeriod: 2 }).length, 0);
});

const M15 = 15 * 60 * 1000;

test('runDivergenceMomentumBacktestForSymbol: always long - resolves to a loss on stop', () => {
  const candles = [
    c(0, 100, 100, 100, 100),
    c(M15, 100, 100.5, 99.5, 100), // entry candle, open=100
    c(2 * M15, 99.9, 100, 97, 98), // low 97 <= stop 98 (distance=2) -> loss
  ];
  const candidates = [{ symbol: 'X', entryTime: M15, stopDistance: 2 }];
  const trades = runDivergenceMomentumBacktestForSymbol(candles, candidates);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.direction, 'bullish');
  assert.equal(t.entryPrice, 100);
  assert.equal(t.stopPrice, 98);
  assert.equal(t.outcome, 'loss');
  assert.equal(t.rMultiple, -1);
});

test('runDivergenceMomentumBacktestForSymbol: resolves to a win at the fixed 1:3 target', () => {
  // entry=100, distance=2, target=100+6=106
  const candles = [
    c(0, 100, 100, 100, 100),
    c(M15, 100, 100.5, 99.5, 100),
    c(2 * M15, 100, 107, 99.5, 106.5), // high 107 >= target 106 -> win
  ];
  const candidates = [{ symbol: 'X', entryTime: M15, stopDistance: 2 }];
  const trades = runDivergenceMomentumBacktestForSymbol(candles, candidates);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.outcome, 'win');
  assert.equal(t.targetPrice, 106);
  assert.equal(t.rMultiple, 3);
});

test('runDivergenceMomentumBacktestForSymbol: times out after maxHoldingCandles with no stop/target hit', () => {
  const candles = [c(0, 100, 100, 100, 100), c(M15, 100, 100.2, 99.8, 100)];
  for (let i = 2; i <= 4; i++) candles.push(c(i * M15, 100, 100.2, 99.8, 100));
  const candidates = [{ symbol: 'X', entryTime: M15, stopDistance: 2 }];
  const trades = runDivergenceMomentumBacktestForSymbol(candles, candidates, { maxHoldingCandles: 2 });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
});
