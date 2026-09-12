// Multi-account isolation (2026-09, multi-account rollout - see
// HANDOFF.md "Multi-compte" and the session plan file). The whole point of
// Phase 2 is that N accounts can run concurrently in ONE process without
// ever leaking state into each other - these tests are the isolation
// guarantee the rest of the rollout depends on, exercised two ways: (1)
// directly driving two AccountRuntime instances the way a data source would
// (fast, deterministic), and (2) actually running two concurrent
// startMockDataSource() intervals for real (slower, but proves the
// per-account interval tracking in mockDataSource.js itself, not just
// AccountRuntime's own isolation).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AccountRuntime } from '../src/accountRuntime.js';
import { CONFIG } from '../src/config.js';
import { startMockDataSource, stopMockDataSource } from '../src/dataSources/mockDataSource.js';

function makeAccount(id, overrides = {}) {
  return new AccountRuntime({ id, config: { ...CONFIG, ...overrides } });
}

test('two AccountRuntime instances never share balance, guardrail, signal log, or candle history', () => {
  const a = makeAccount('acc-a');
  const b = makeAccount('acc-b');

  a.setBalance(12000);
  a.strategyEngine.ingestCandle('US100', { time: 1_000_000, open: 100, high: 101, low: 99, close: 100.5 });
  a.pushSignalEvents([{ type: 'validated', source: 'fvg', symbol: 'US100', validatedAt: Date.now(), id: 'a-signal-1' }]);
  a.guardrail.recordTrade({ pnl: 50, time: Date.now(), balanceAfter: 12050 });

  assert.equal(a.balance, 12000);
  assert.equal(b.balance, 10000); // untouched default

  assert.equal(a.signalLog.length, 1);
  assert.equal(b.signalLog.length, 0);

  assert.equal(a.strategyEngine.getHistory('US100').length, 1);
  assert.equal(b.strategyEngine.getHistory('US100').length, 0);

  assert.equal(a.guardrail.getStatus().tradesToday, 1);
  assert.equal(b.guardrail.getStatus().tradesToday, 0);

  // Genuinely different object graphs, not aliases of the same instance.
  assert.notEqual(a.guardrail, b.guardrail);
  assert.notEqual(a.strategyEngine, b.strategyEngine);
  assert.notEqual(a.lastCandleBySymbol, b.lastCandleBySymbol);
});

test('an overall-drawdown breach on one account never blocks another account with the same symbols', () => {
  const a = makeAccount('acc-a', { guardrails: { ...CONFIG.guardrails, maxDrawdownPct: 10, maxDrawdownType: 'static' } });
  const b = makeAccount('acc-b', { guardrails: { ...CONFIG.guardrails, maxDrawdownPct: 10, maxDrawdownType: 'static' } });

  a.setBalance(10000);
  b.setBalance(10000);
  a.guardrail.recordTrade({ pnl: -1500, time: Date.now(), balanceAfter: 8500 }); // breaches A's 10% floor (9000)

  const aStatus = a.guardrail.getStatus();
  const bStatus = b.guardrail.getStatus();
  assert.equal(aStatus.overallDrawdownBreached, true);
  assert.equal(aStatus.blocked, true);
  assert.equal(bStatus.overallDrawdownBreached, false);
  assert.equal(bStatus.blocked, false);
});

test('startMockDataSource runs two accounts concurrently without cross-contamination, and stopping one leaves the other running', async () => {
  const a = makeAccount('mock-a');
  const b = makeAccount('mock-b');
  const symbols = ['US100'];

  try {
    startMockDataSource(a, { candleIntervalMs: 15, symbols });
    startMockDataSource(b, { candleIntervalMs: 15, symbols });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const aCandlesBeforeStop = a.strategyEngine.getHistory('US100').length;
    const bCandlesBeforeStop = b.strategyEngine.getHistory('US100').length;
    assert.ok(aCandlesBeforeStop > 30, `expected account a to have ingested candles beyond warm-up, got ${aCandlesBeforeStop}`);
    assert.ok(bCandlesBeforeStop > 30, `expected account b to have ingested candles beyond warm-up, got ${bCandlesBeforeStop}`);
    // Independent random walks seeded identically but advancing separately -
    // extremely unlikely to be bit-for-bit identical after 30+ random candles,
    // which is exactly the point: two SEPARATE simulators, not one shared.
    assert.notDeepEqual(a.strategyEngine.getHistory('US100'), b.strategyEngine.getHistory('US100'));

    stopMockDataSource(a);
    const aCandlesAfterStopA = a.strategyEngine.getHistory('US100').length;
    await new Promise((resolve) => setTimeout(resolve, 60));

    // a's interval is stopped - its history must not have grown further...
    assert.equal(a.strategyEngine.getHistory('US100').length, aCandlesAfterStopA);
    // ...while b's interval is still running and DID grow.
    assert.ok(b.strategyEngine.getHistory('US100').length > bCandlesBeforeStop);
  } finally {
    stopMockDataSource(a);
    stopMockDataSource(b);
  }
});

test('startMockDataSource is a no-op if called twice for the same account (does not double the interval)', async () => {
  const a = makeAccount('mock-double-start');
  try {
    startMockDataSource(a, { candleIntervalMs: 15, symbols: ['US100'] });
    startMockDataSource(a, { candleIntervalMs: 15, symbols: ['US100'] }); // second call - must be ignored
    await new Promise((resolve) => setTimeout(resolve, 80));
    // If a second interval had been created, the warm-up loop would have run
    // twice (60 candles instead of 30 baseline) - the count staying in a
    // single-interval-sized range confirms it didn't.
    const count = a.strategyEngine.getHistory('US100').length;
    assert.ok(count < 60, `expected a single interval's worth of candles, got ${count} (looks like a duplicate interval was started)`);
  } finally {
    stopMockDataSource(a);
  }
});
