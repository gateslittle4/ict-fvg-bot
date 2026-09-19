import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { LIVE_VARIANTS, liveFvgSymbols, liveFvgConfig, normalizeCustomOverrides, resolveVariantConfig, runLiveFvg, describeConfig, MAX_VARIANTS_PER_RUN } from '../src/backtest/liveFvgRunner.js';
import { ImportError } from '../src/backtest/m1Import.js';

test('liveFvgSymbols: exactly the symbols CONFIG gives an FVG configuration to', () => {
  assert.deepEqual(liveFvgSymbols(), Object.keys(CONFIG.fvg.perSymbol));
  assert.equal(liveFvgConfig('NOT_A_SYMBOL'), null);
});

test('LIVE_VARIANTS: unique ids, the live one first and changing nothing', () => {
  const ids = LIVE_VARIANTS.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(LIVE_VARIANTS[0].id, 'live');
  assert.deepEqual(LIVE_VARIANTS[0].overrides, {});
  assert.ok(MAX_VARIANTS_PER_RUN >= 4);
});

test('resolveVariantConfig: the live config with only the overridden keys changed', () => {
  const [symbol] = liveFvgSymbols();
  const live = liveFvgConfig(symbol);
  const before = JSON.stringify(live);
  assert.deepEqual(resolveVariantConfig(symbol, {}), live);
  const v = resolveVariantConfig(symbol, { rrMultiple: 3, liquiditySweepEnabled: false });
  assert.equal(v.rrMultiple, 3);
  assert.equal(v.liquiditySweepEnabled, false);
  assert.equal(v.stopMode, live.stopMode);
  assert.equal(JSON.stringify(live), before); // the shared live config object was not mutated
  assert.throws(() => resolveVariantConfig('EURUSD', {}), ImportError);
});

test('describeConfig: says which filters are on, without engine internals', () => {
  const d = describeConfig({ variant: 'H4_EMA200', structureEnabled: true, sessionEnabled: true, sessionWindow: { startHour: 8, endHour: 12 }, liquiditySweepEnabled: false, multiTouch: true, rrMultiple: 5, stopMode: 'swing' });
  assert.deepEqual(d, { bias: 'H4_EMA200', structure: true, session: { startHour: 8, endHour: 12 }, sweep: false, multiTouch: true, rr: 5, stopMode: 'swing' });
  assert.equal(describeConfig({ sessionEnabled: false, sessionWindow: { startHour: 1, endHour: 2 } }).session, null);
});

test('normalizeCustomOverrides: keeps known keys with sane values, refuses the rest', () => {
  const o = normalizeCustomOverrides({ variant: 'H1_EMA50', structureEnabled: 'false', rrMultiple: '4', stopMode: 'swing', sessionWindow: { startHour: 9, endHour: 11.5 }, evil: 'x' });
  assert.deepEqual(o, { variant: 'H1_EMA50', structureEnabled: false, rrMultiple: 4, stopMode: 'swing', sessionWindow: { startHour: 9, endHour: 11.5 } });
  assert.equal(normalizeCustomOverrides({ variant: 'baseline' }).variant, 'baseline');
  assert.throws(() => normalizeCustomOverrides({ variant: 'M5_EMA7' }), ImportError);
  assert.throws(() => normalizeCustomOverrides({ variant: 'H4_EMA13' }), ImportError);
  assert.throws(() => normalizeCustomOverrides({ rrMultiple: 50 }), ImportError);
  assert.throws(() => normalizeCustomOverrides({ stopMode: 'yolo' }), ImportError);
  assert.throws(() => normalizeCustomOverrides({ sessionWindow: { startHour: 12, endHour: 8 } }), ImportError);
});

// Deliberately shape-only: the strategy's own signal logic has its own tests. The point here is that
// the runner wires config -> engine -> costs -> compact trades without dropping or renaming anything.
test('runLiveFvg: returns compact net trades in the shape the statistics module reads', () => {
  const candles = [];
  const start = Date.UTC(2020, 0, 6);
  let price = 100;
  for (let i = 0; i < 4000; i++) {
    const open = price;
    const close = open + Math.sin(i / 11) * 1.4 + (i % 29 === 0 ? 3 : 0) - (i % 41 === 0 ? 3 : 0);
    candles.push({ time: start + i * 900000, open, high: Math.max(open, close) + 0.9, low: Math.min(open, close) - 0.9, close });
    price = close;
  }
  const cfg = resolveVariantConfig('US100', { variant: 'baseline', structureEnabled: false, sessionEnabled: false, liquiditySweepEnabled: false, multiTouch: false });
  const r = runLiveFvg(candles, 'US100', cfg, 0);
  assert.ok(r.rawCount > 0, 'the synthetic series must produce trades for this to prove anything');
  assert.equal(r.trades.length, r.rawCount - r.droppedAsNonViable);
  for (const t of r.trades) {
    assert.ok(Number.isFinite(t.r) && Number.isFinite(t.entryTime) && Number.isFinite(t.exitTime));
    assert.ok(['bullish', 'bearish'].includes(t.direction));
    assert.ok(['win', 'loss', 'timeout'].includes(t.outcome));
    assert.ok(t.holdCandles >= 0);
    assert.ok(t.exitTime >= t.entryTime);
  }
});
