import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLiveFilters, requiredH1LookbackCandles } from '../src/backtest/liveFvgFilterStatus.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}
const H1 = 60 * 60 * 1000;
const M15 = 15 * 60 * 1000;

test('evaluateLiveFilters: a baseline config (no filters enabled) returns all 4 items as not applicable', () => {
  const items = evaluateLiveFilters({ candles: [], h1Candles: null, cfg: { variant: 'baseline' }, direction: 'bullish', atTime: 0 });
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((i) => i.key).sort(), ['bias', 'session', 'structure', 'sweep']);
  for (const item of items) assert.equal(item.applicable, false, `${item.key} should not be applicable`);
});

test('evaluateLiveFilters: bias configured but no H1 candles available degrades to "non vérifiable", not a guessed pass', () => {
  const items = evaluateLiveFilters({ candles: [], h1Candles: null, cfg: { variant: 'H1_EMA5' }, direction: 'bullish', atTime: 0 });
  const bias = items.find((i) => i.key === 'bias');
  assert.equal(bias.applicable, false);
  assert.match(bias.detail, /non vérifiable/i);
});

test('evaluateLiveFilters: bias check reuses the real production bias math - matches "bullish" only when the direction actually agrees', () => {
  // Same fixture shape as htfBias.test.js: flat EMA around 100, then a clear bullish close.
  const flat = Array(10).fill(100);
  const closes = [...flat, 100, 110, 110]; // settles bullish
  const h1Candles = closes.map((close, i) => c(i * H1, close, close + 0.1, close - 0.1, close));
  const atTime = h1Candles[h1Candles.length - 1].time + 1; // just after the last H1 candle closed

  const bullishItems = evaluateLiveFilters({ candles: [], h1Candles, cfg: { variant: 'H1_EMA5' }, direction: 'bullish', atTime });
  const bearishItems = evaluateLiveFilters({ candles: [], h1Candles, cfg: { variant: 'H1_EMA5' }, direction: 'bearish', atTime });
  const biasBull = bullishItems.find((i) => i.key === 'bias');
  const biasBear = bearishItems.find((i) => i.key === 'bias');
  assert.equal(biasBull.applicable, true);
  assert.equal(biasBull.ok, true, 'a bullish zone should match a bullish HTF bias');
  assert.equal(biasBear.ok, false, 'a bearish zone should NOT match a bullish HTF bias');
});

test('evaluateLiveFilters: structure check disabled stays not applicable regardless of candles', () => {
  const items = evaluateLiveFilters({ candles: [c(0, 1, 1, 1, 1)], h1Candles: null, cfg: { variant: 'baseline', structureEnabled: false }, direction: 'bullish', atTime: 0 });
  const structure = items.find((i) => i.key === 'structure');
  assert.equal(structure.applicable, false);
});

test('evaluateLiveFilters: structure check reuses the real swing-break math - bullish structure agrees with a bullish zone, not a bearish one', () => {
  // Same "break above a confirmed swing high" fixture shape as marketStructure.test.js,
  // widened for STRUCTURE_LOOKBACK=5 (gridRunner.js's real production constant).
  const candles = [];
  for (let i = 0; i < 10; i++) candles.push(c(i * M15, 1, 1.02, 0.98, 1));
  candles[5] = c(5 * M15, 1, 1.10, 0.98, 1.0); // swing high at 1.10
  for (let i = 10; i < 20; i++) candles.push(c(i * M15, 1, 1.05, 0.98, 1.0));
  candles.push(c(20 * M15, 1.05, 1.20, 1.04, 1.15)); // breaks above 1.10 -> bullish structure
  const atTime = candles[candles.length - 1].time;

  const bullishItems = evaluateLiveFilters({ candles, h1Candles: null, cfg: { variant: 'baseline', structureEnabled: true }, direction: 'bullish', atTime });
  const bearishItems = evaluateLiveFilters({ candles, h1Candles: null, cfg: { variant: 'baseline', structureEnabled: true }, direction: 'bearish', atTime });
  const structBull = bullishItems.find((i) => i.key === 'structure');
  const structBear = bearishItems.find((i) => i.key === 'structure');
  assert.equal(structBull.applicable, true);
  assert.equal(structBull.ok, true);
  assert.equal(structBear.ok, false);
});

test('evaluateLiveFilters: session check disabled stays not applicable', () => {
  const items = evaluateLiveFilters({ candles: [], h1Candles: null, cfg: { variant: 'baseline', sessionEnabled: false }, direction: 'bullish', atTime: 0 });
  assert.equal(items.find((i) => i.key === 'session').applicable, false);
});

test('evaluateLiveFilters: session check uses the fixed-EST-as-UTC convention, same as the live engine - a plain UTC timestamp would get this backwards', () => {
  const cfg = { variant: 'baseline', sessionEnabled: true, sessionWindow: { startHour: 10, endHour: 11 } };
  // Same values as fvgMultiTouch.test.js's own session test: +5h = true UTC.
  const insideWindow = Date.parse('2026-01-07T10:00:00Z'); // +5h = 15:00Z = 10:00 EST
  const outsideWindow = Date.parse('2026-01-07T08:00:00Z'); // +5h = 13:00Z = 08:00 EST

  const inside = evaluateLiveFilters({ candles: [], h1Candles: null, cfg, direction: 'bullish', atTime: insideWindow });
  const outside = evaluateLiveFilters({ candles: [], h1Candles: null, cfg, direction: 'bullish', atTime: outsideWindow });
  assert.equal(inside.find((i) => i.key === 'session').ok, true);
  assert.equal(outside.find((i) => i.key === 'session').ok, false);
});

test('evaluateLiveFilters: sweep check disabled stays not applicable', () => {
  const items = evaluateLiveFilters({ candles: [], h1Candles: null, cfg: { variant: 'baseline', liquiditySweepEnabled: false }, direction: 'bullish', atTime: 0 });
  assert.equal(items.find((i) => i.key === 'sweep').applicable, false);
});

test('evaluateLiveFilters: sweep check reuses the real sweep-detection math - a recent bullish sweep matches a bullish zone, not a bearish one', () => {
  // Same "wick below a confirmed swing low, close reclaims above it" fixture
  // shape as liquiditySweep.test.js, widened for SWEEP_LOOKBACK=5.
  const candles = [];
  for (let i = 0; i < 10; i++) candles.push(c(i * M15, 1, 1.02, 1.0, 1));
  candles[5] = c(5 * M15, 1, 1.02, 0.98, 1); // swing low at 0.98
  for (let i = 10; i < 20; i++) candles.push(c(i * M15, 1, 1.02, 1.0, 1));
  candles.push(c(20 * M15, 1.0, 1.01, 0.95, 1.0)); // wicks below 0.98, closes back above -> bullish sweep
  const atTime = candles[candles.length - 1].time; // right at the sweep - well within SWEEP_WINDOW_CANDLES

  const bullishItems = evaluateLiveFilters({ candles, h1Candles: null, cfg: { variant: 'baseline', liquiditySweepEnabled: true }, direction: 'bullish', atTime });
  const bearishItems = evaluateLiveFilters({ candles, h1Candles: null, cfg: { variant: 'baseline', liquiditySweepEnabled: true }, direction: 'bearish', atTime });
  assert.equal(bullishItems.find((i) => i.key === 'sweep').ok, true);
  assert.equal(bearishItems.find((i) => i.key === 'sweep').ok, false);
});

test('evaluateLiveFilters: sweep check goes false once the sweep ages out of SWEEP_WINDOW_CANDLES', () => {
  const candles = [];
  for (let i = 0; i < 10; i++) candles.push(c(i * M15, 1, 1.02, 1.0, 1));
  candles[5] = c(5 * M15, 1, 1.02, 0.98, 1);
  for (let i = 10; i < 20; i++) candles.push(c(i * M15, 1, 1.02, 1.0, 1));
  candles.push(c(20 * M15, 1.0, 1.01, 0.95, 1.0)); // bullish sweep at candle 20
  for (let i = 21; i < 40; i++) candles.push(c(i * M15, 1, 1.02, 1.0, 1)); // 19 quiet candles afterwards
  const farAfter = candles[candles.length - 1].time;

  const items = evaluateLiveFilters({ candles, h1Candles: null, cfg: { variant: 'baseline', liquiditySweepEnabled: true }, direction: 'bullish', atTime: farAfter });
  assert.equal(items.find((i) => i.key === 'sweep').ok, false, 'a sweep long past SWEEP_WINDOW_CANDLES should no longer count as confluence');
});

test('evaluateLiveFilters: a fully-configured symbol (all 4 filters, like US100) evaluates every criterion independently, not short-circuited', () => {
  const cfg = { variant: 'baseline', structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 0, endHour: 24 }, liquiditySweepEnabled: true };
  const candles = [c(0, 1, 1.02, 0.98, 1)];
  const items = evaluateLiveFilters({ candles, h1Candles: null, cfg, direction: 'bullish', atTime: 0 });
  assert.equal(items.length, 4);
  assert.equal(items.find((i) => i.key === 'bias').applicable, false, 'baseline variant stays not applicable even with other filters on');
  assert.equal(items.find((i) => i.key === 'structure').applicable, true);
  assert.equal(items.find((i) => i.key === 'session').applicable, true);
  assert.equal(items.find((i) => i.key === 'sweep').applicable, true);
});

test('requiredH1LookbackCandles is re-exported unchanged from tradeCompliance.js (single source of truth, no drift)', () => {
  assert.equal(requiredH1LookbackCandles('baseline'), 0);
  assert.ok(requiredH1LookbackCandles('H4_EMA200') > 0);
});
