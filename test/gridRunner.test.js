import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGrid, runOneConfig, rankKey, MIN_SIGNALS_FOR_RANKING } from '../src/backtest/gridRunner.js';

// Simple synthetic M15 candle series long enough to warm up EMA200 on H4
// (needs 800+ hours of H4 buckets) and produce at least a handful of FVGs.
function buildSyntheticCandles(count) {
  const candles = [];
  let price = 1.1;
  const startMs = Date.UTC(2020, 0, 1);
  for (let i = 0; i < count; i++) {
    // Oscillate with a slow drift so both bullish and bearish FVGs occur.
    const drift = Math.sin(i / 50) * 0.002;
    const open = price;
    const high = open + 0.0015 + Math.abs(Math.sin(i / 7)) * 0.0008;
    const low = open - 0.0015 - Math.abs(Math.cos(i / 11)) * 0.0008;
    const close = open + drift * 0.1;
    candles.push({ time: startMs + i * 15 * 60 * 1000, open, high, low, close });
    price = close;
  }
  return candles;
}

test('runGrid produces 7 variants x 2 structure x 2 session x 2 stopMode x 3 RR = 168 configs', () => {
  const candles = buildSyntheticCandles(6000);
  const results = runGrid(candles, 'EURUSD', 0.0001);
  assert.equal(results.length, 168);
  const baselineCount = results.filter((r) => r.variant === 'baseline').length;
  assert.equal(baselineCount, 24); // 2 structure x 2 session x 2 stopMode x 3 RR
  const htfCount = results.filter((r) => r.variant !== 'baseline').length;
  assert.equal(htfCount, 144); // 6 HTF variants x 24
  const structureOnCount = results.filter((r) => r.structureEnabled).length;
  assert.equal(structureOnCount, 84);
  const sessionOnCount = results.filter((r) => r.sessionEnabled).length;
  assert.equal(sessionOnCount, 84);
  for (const r of results) {
    assert.ok('summary' in r);
    assert.ok('summaryNet' in r);
    assert.ok(typeof r.droppedAsNonViable === 'number');
    assert.ok(typeof r.structureEnabled === 'boolean');
    assert.ok(typeof r.sessionEnabled === 'boolean');
  }
});

test('runOneConfig for a given (variant, stopMode, rrMultiple) matches the equivalent entry from runGrid', () => {
  const candles = buildSyntheticCandles(6000);
  const results = runGrid(candles, 'EURUSD', 0.0001);
  const target = results.find(
    (r) => r.variant === 'H1_EMA50' && r.stopMode === 'swing' && r.rrMultiple === 3 && !r.structureEnabled && !r.sessionEnabled
  );
  assert.ok(target, 'expected to find H1_EMA50/swing/1:3 (no structure, no session) in the grid');

  const rerun = runOneConfig(candles, 'EURUSD', 0.0001, { variant: 'H1_EMA50', stopMode: 'swing', rrMultiple: 3 });
  assert.equal(rerun.summary.totalSignals, target.summary.totalSignals);
  assert.equal(rerun.summaryNet.totalSignals, target.summaryNet.totalSignals);
  assert.equal(rerun.summary.avgR, target.summary.avgR);
});

test('enabling the structure filter only ever keeps the same trades or fewer than with it off', () => {
  const candles = buildSyntheticCandles(6000);
  const off = runOneConfig(candles, 'EURUSD', 0.0001, { variant: 'baseline', stopMode: 'swing', rrMultiple: 2 });
  const on = runOneConfig(candles, 'EURUSD', 0.0001, {
    variant: 'baseline',
    stopMode: 'swing',
    rrMultiple: 2,
    structureEnabled: true,
  });
  assert.ok(on.summary.totalSignals <= off.summary.totalSignals);
});

test('enabling the NY AM session filter only ever keeps the same trades or fewer than with it off', () => {
  const candles = buildSyntheticCandles(6000);
  const off = runOneConfig(candles, 'EURUSD', 0.0001, { variant: 'baseline', stopMode: 'swing', rrMultiple: 2 });
  const on = runOneConfig(candles, 'EURUSD', 0.0001, {
    variant: 'baseline',
    stopMode: 'swing',
    rrMultiple: 2,
    sessionEnabled: true,
  });
  assert.ok(on.summary.totalSignals <= off.summary.totalSignals);
});

test('rankKey returns -Infinity for configs below the minimum signal threshold', () => {
  const sparse = { summary: { totalSignals: MIN_SIGNALS_FOR_RANKING - 1 }, summaryNet: { avgR: 5 } };
  assert.equal(rankKey(sparse), -Infinity);

  const enough = { summary: { totalSignals: MIN_SIGNALS_FOR_RANKING }, summaryNet: { avgR: 0.5 } };
  assert.equal(rankKey(enough), 0.5);
});
