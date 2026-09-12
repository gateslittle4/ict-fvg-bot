import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildChartOverlays } from '../src/backtest/chartOverlays.js';

function loadCsv(path, n) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  return lines.slice(0, n).map((line) => {
    const [time, open, high, low, close] = line.split(',');
    return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
}

// The real production config is deliberately very selective (HTF EMA200
// bias AND market structure AND a 1-hour session window AND liquidity-sweep
// confluence), so a short window contains ZERO signals - measured: 0 signals
// in 1500 candles, 3 in 5000, 14 in 12000. Tests that need real signals
// therefore have to use a window big enough to actually contain some, or
// they assert on an empty set and prove nothing. Affordable because the
// overlay build is O(n): ~80ms for 12000 candles across all three symbols.
const N = 12000;
const history = () => ({
  US100: loadCsv('data/backtest-input/US100.csv', N),
  US500: loadCsv('data/backtest-input/US500.csv', N),
  XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv', N),
});

test('buildChartOverlays: finds real FVG zones on real market data, each well-formed', () => {
  const { zones } = buildChartOverlays(history(), { symbol: 'US100' });
  assert.ok(zones.length > 0, 'expected the real config to detect at least one FVG zone in this window');
  for (const z of zones) {
    assert.ok(['bullish', 'bearish'].includes(z.direction));
    assert.ok(z.top > z.bottom, 'a zone must have a real height');
    assert.ok(['watching', 'validated', 'expired', 'stale'].includes(z.status));
    assert.equal(typeof z.formedAt, 'number');
    if (z.endedAt !== null) assert.ok(z.endedAt >= z.formedAt, 'a zone cannot end before it formed');
  }
});

test('buildChartOverlays: returns only the requested symbol', () => {
  const { zones, signals } = buildChartOverlays(history(), { symbol: 'XAUUSD' });
  const us100 = buildChartOverlays(history(), { symbol: 'US100' });
  // Different symbols must not produce identical overlay sets.
  assert.notDeepEqual(
    zones.map((z) => z.id),
    us100.zones.map((z) => z.id)
  );
  for (const s of signals) assert.ok(s.id, 'every signal carries the id it was keyed by');
});

test('buildChartOverlays: a validated zone is closed off at its validation time, not left open', () => {
  // maxZones raised past the default: validations are rare, and the default
  // cap keeps only the most RECENT zones, which can crop every validated one
  // out of the result and make this assertion vacuous.
  const { zones } = buildChartOverlays(history(), { symbol: 'US100', maxZones: 5000 });
  const validated = zones.filter((z) => z.status === 'validated');
  assert.ok(validated.length > 0, 'expected at least one zone to be validated in this window');
  for (const z of validated) {
    assert.equal(typeof z.endedAt, 'number');
    assert.ok(z.endedAt >= z.formedAt);
  }
});

test('buildChartOverlays: signals carry entry/stop and a resolved outcome where one exists', () => {
  const { signals } = buildChartOverlays(history(), { symbol: 'US100' });
  assert.ok(signals.length > 0, 'expected at least one signal in this window');
  for (const s of signals) {
    assert.ok(['fvg', 'divergence'].includes(s.source));
    assert.ok(s.outcome === null || ['win', 'loss', 'timeout'].includes(s.outcome));
    if (s.outcome !== null) assert.ok(s.exitTime >= s.time, 'a trade cannot close before it opened');
    // An unblocked signal is one the bot acted on, so it must carry a real entry.
    if (!s.blockedReason) assert.equal(typeof s.entryPrice, 'number');
  }
});

test('buildChartOverlays: blocked signals are kept and flagged, not silently dropped', () => {
  const { signals } = buildChartOverlays(history(), { symbol: 'US100' });
  // Not asserting that blocked ones necessarily exist in this window - only
  // that if they do, they are labelled rather than hidden.
  for (const s of signals) {
    if (s.blockedReason !== null) {
      assert.equal(typeof s.blockedReason, 'string');
      assert.equal(s.outcome, null, 'a blocked signal never opened, so it can never have an outcome');
    }
  }
});

test('buildChartOverlays: timeOffsetMs shifts every emitted time by exactly that amount', () => {
  const OFFSET = 5 * 60 * 60 * 1000;
  const plain = buildChartOverlays(history(), { symbol: 'US100' });
  const shifted = buildChartOverlays(history(), { symbol: 'US100', timeOffsetMs: OFFSET });

  assert.equal(shifted.zones.length, plain.zones.length);
  for (let i = 0; i < plain.zones.length; i++) {
    assert.equal(shifted.zones[i].formedAt, plain.zones[i].formedAt + OFFSET);
    if (plain.zones[i].endedAt !== null) {
      assert.equal(shifted.zones[i].endedAt, plain.zones[i].endedAt + OFFSET);
    }
  }
  for (let i = 0; i < plain.signals.length; i++) {
    assert.equal(shifted.signals[i].time, plain.signals[i].time + OFFSET);
  }
});

test('buildChartOverlays: caps how much it returns, keeping the MOST RECENT items', () => {
  const { zones, signals } = buildChartOverlays(history(), { symbol: 'US100', maxZones: 3, maxSignals: 2 });
  assert.ok(zones.length <= 3);
  assert.ok(signals.length <= 2);

  const uncapped = buildChartOverlays(history(), { symbol: 'US100' });
  if (uncapped.zones.length > 3) {
    assert.deepEqual(zones.map((z) => z.id), uncapped.zones.slice(-3).map((z) => z.id));
  }
});

test('buildChartOverlays: empty history produces empty overlays, not a crash', () => {
  const { zones, signals } = buildChartOverlays({ US100: [], US500: [], XAUUSD: [] }, { symbol: 'US100' });
  assert.deepEqual(zones, []);
  assert.deepEqual(signals, []);
});

test('buildChartOverlays: has no side effects on any shared/live state (fresh isolated engine each call)', () => {
  const first = buildChartOverlays(history(), { symbol: 'US100' });
  const second = buildChartOverlays(history(), { symbol: 'US100' });
  assert.deepEqual(second, first, 'two identical calls must produce identical results');
});

test('buildChartOverlays: a zone we never saw end is closed off at the engine max-age horizon and labelled "stale"', () => {
  // A filter wrapper (bias/structure/session/sweep) rejecting a validation
  // consumes the zone inside FvgEngine without any event reaching us, so
  // "no end observed" must NOT be read as "still live" - otherwise old zones
  // stretch to the right edge forever and bury the chart.
  //
  // US500, not US100: since 2026-09 US100 runs MultiTouchFvgEngine
  // (CONFIG.fvg.perSymbol.US100.multiTouch - see HANDOFF.md "multi-contact"),
  // which always reports a REAL 'expired' event once a zone ages out
  // (rejected touches no longer silently consume it) - so US100 now
  // produces ZERO 'stale' zones, by design, and would make this assertion
  // vacuous. US500 stays on the single-touch engine, so it still exhibits
  // the silent-consumption case this test exists to cover.
  const { zones } = buildChartOverlays(history(), { symbol: 'US500', maxZones: 5000 });
  const stale = zones.filter((z) => z.status === 'stale');
  assert.ok(stale.length > 0, 'expected stale zones on a window this long');

  const MAX_AGE_MS = 50 * 15 * 60 * 1000;
  for (const z of stale) {
    assert.equal(z.endedAt, z.formedAt + MAX_AGE_MS, 'a stale zone ends exactly at its max-age horizon');
  }
});

test('buildChartOverlays: a zone young enough to still be live is left open-ended', () => {
  const { zones } = buildChartOverlays(history(), { symbol: 'US100', maxZones: 5000 });
  const open = zones.filter((z) => z.endedAt === null);
  const MAX_AGE_MS = 50 * 15 * 60 * 1000;
  const lastCandle = loadCsv('data/backtest-input/US100.csv', N).at(-1).time;
  for (const z of open) {
    assert.ok(
      z.formedAt + MAX_AGE_MS >= lastCandle,
      'only zones still inside their max-age window may be left open-ended'
    );
  }
});

test('buildChartOverlays: "stale" is kept distinct from a confirmed "expired"', () => {
  // US500, not US100 - same reason as the test above (US100's multi-touch
  // engine never produces a 'stale' zone).
  const { zones } = buildChartOverlays(history(), { symbol: 'US500', maxZones: 5000 });
  const statuses = new Set(zones.map((z) => z.status));
  assert.ok(statuses.has('expired'), 'engine-confirmed expiries must still be reported as expired');
  assert.ok(statuses.has('stale'), 'inferred ends must be reported separately, not relabelled as expired');
});

test('buildChartOverlays: US100 multi-contact never produces a "stale" zone - every ending is a real engine event', () => {
  // Direct positive assertion of the design difference explained above: with
  // MultiTouchFvgEngine, a rejected touch leaves the zone active rather than
  // silently consuming it, and age-out always fires a real 'expired' event
  // - so the 'stale' heuristic (needed for the single-touch engines) should
  // never trigger for US100.
  const { zones } = buildChartOverlays(history(), { symbol: 'US100', maxZones: 5000 });
  const stale = zones.filter((z) => z.status === 'stale');
  assert.equal(stale.length, 0);
  assert.ok(zones.some((z) => z.status === 'expired'), 'sanity: this window must still contain real expiries');
});
