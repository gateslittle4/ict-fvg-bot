import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setAutoExecute, isAutoExecuteActive, setRiskPctPerTrade, store, pushSignalEvents, recordOrderOutcome } from '../src/store.js';
import { MIN_RISK_PCT, MAX_RISK_PCT } from '../src/config.js';

const HOUR = 3600 * 1000;
const DAY_MS = 24 * HOUR;

test('store.autoExecute: off by default - the semi-automatic alert-and-click flow is the norm', () => {
  // Fresh process state (this file doesn't touch it before this point).
  assert.equal(store.autoExecute.enabled, false);
  assert.equal(isAutoExecuteActive(), false);
});

test('setAutoExecute(true, hours): activates immediately and stays active until it expires', () => {
  const now = 1_000_000_000;
  const result = setAutoExecute(true, 24, now);
  assert.equal(result.enabled, true);
  assert.equal(result.expiresAt, now + 24 * HOUR);
  assert.equal(isAutoExecuteActive(now), true);
  assert.equal(isAutoExecuteActive(now + 23 * HOUR), true);
  assert.equal(isAutoExecuteActive(now + 24 * HOUR), false); // exactly at expiry - no longer active
  assert.equal(isAutoExecuteActive(now + 25 * HOUR), false);
});

test('setAutoExecute(false): switches back to semi-automatic immediately, regardless of prior state', () => {
  setAutoExecute(true, 24, 1_000_000_000);
  const result = setAutoExecute(false);
  assert.equal(result.enabled, false);
  assert.equal(result.expiresAt, null);
  assert.equal(isAutoExecuteActive(1_000_000_000), false);
});

test('setAutoExecute(true, hours) requires a positive duration - no "on forever" option', () => {
  assert.throws(() => setAutoExecute(true, 0), /positive/);
  assert.throws(() => setAutoExecute(true, -5), /positive/);
  assert.throws(() => setAutoExecute(true), /positive/);
});

test('setAutoExecute(true, hours) caps the duration at 7 days - a forgotten toggle cannot stay on for months unattended', () => {
  const now = 1_000_000_000;
  const result = setAutoExecute(true, 24 * 365, now); // ask for a full year
  assert.equal(result.expiresAt, now + 7 * 24 * HOUR); // capped to 7 days
});

test('setRiskPctPerTrade: changes the live engine value immediately', () => {
  setRiskPctPerTrade(0.75);
  assert.equal(store.strategyEngine.riskPctPerTrade, 0.75);
  setRiskPctPerTrade(0.5); // restore the default so later tests/other files aren't affected by ordering
  assert.equal(store.strategyEngine.riskPctPerTrade, 0.5);
});

test('setRiskPctPerTrade: rejects non-finite input rather than silently clamping', () => {
  assert.throws(() => setRiskPctPerTrade('0.5'), /finite number/);
  assert.throws(() => setRiskPctPerTrade(NaN), /finite number/);
  assert.throws(() => setRiskPctPerTrade(undefined), /finite number/);
});

test('setRiskPctPerTrade: rejects out-of-bounds values - this number sizes every live order', () => {
  assert.throws(() => setRiskPctPerTrade(MIN_RISK_PCT - 0.01), /between/);
  assert.throws(() => setRiskPctPerTrade(MAX_RISK_PCT + 0.01), /between/);
  assert.throws(() => setRiskPctPerTrade(50)); // the exact fat-finger scenario this guards against
  // the engine value from the last SUCCESSFUL call above is untouched by a rejected one
  assert.equal(store.strategyEngine.riskPctPerTrade, 0.5);
});

test('setRiskPctPerTrade: the bounds themselves are valid, inclusive', () => {
  setRiskPctPerTrade(MIN_RISK_PCT);
  assert.equal(store.strategyEngine.riskPctPerTrade, MIN_RISK_PCT);
  setRiskPctPerTrade(MAX_RISK_PCT);
  assert.equal(store.strategyEngine.riskPctPerTrade, MAX_RISK_PCT);
  setRiskPctPerTrade(0.5); // restore
});

// pushSignalEvents' volatility-regime OBSERVATION tagging (2026-09, at
// Esdras's explicit request for a forward-test démo before changing any
// real position sizing - see HANDOFF.md and src/backtest/volatilityRegime.js).
// Purely additive fields for later comparison - never feeds back into real
// order sizing (setRiskPctPerTrade/riskAmount untouched by any of this).

test('pushSignalEvents: tags a validated fvg/divergence signal with a volatility regime once enough history exists', () => {
  const symbol = 'US100';
  const base = Date.parse('2020-01-01T00:00:00Z');
  // 200 quiet, flat, day-spaced candles - enough to warm up ATR(14)/SMA(100)
  // (fed via ingestCandle purely to populate history for resampling; this
  // symbol's own trading logic/events are irrelevant to this test).
  for (let i = 0; i < 200; i++) {
    store.strategyEngine.ingestCandle(symbol, { time: base + i * DAY_MS, open: 100, high: 100.5, low: 99.5, close: 100 });
  }
  const entryTime = base + 200 * DAY_MS;
  pushSignalEvents([{ type: 'validated', source: 'fvg', symbol, validatedAt: entryTime, direction: 'bullish', id: 'vol-test-1' }]);
  const logged = store.signalLog[store.signalLog.length - 1];
  assert.equal(logged.id, 'vol-test-1');
  assert.ok(['low', 'normal', 'high'].includes(logged.volRegime));
  assert.equal(typeof logged.suggestedRiskPct, 'number');
});

test('pushSignalEvents: does not tag sources outside the volatility-regime research (nwog/judaswing/pyramid)', () => {
  pushSignalEvents([{ type: 'validated', source: 'nwog', symbol: 'US100', validatedAt: Date.now(), id: 'vol-test-2' }]);
  const logged = store.signalLog[store.signalLog.length - 1];
  assert.equal(logged.id, 'vol-test-2');
  assert.equal(logged.volRegime, undefined);
  assert.equal(logged.suggestedRiskPct, undefined);
});

test('pushSignalEvents: does not tag a blocked signal (blockedReason set) even for fvg/divergence', () => {
  pushSignalEvents([{ type: 'validated', source: 'fvg', symbol: 'US100', validatedAt: Date.now(), blockedReason: 'netting', id: 'vol-test-3' }]);
  const logged = store.signalLog[store.signalLog.length - 1];
  assert.equal(logged.id, 'vol-test-3');
  assert.equal(logged.volRegime, undefined);
});

test('pushSignalEvents: no history yet for the symbol -> tags nothing, never throws', () => {
  pushSignalEvents([{ type: 'validated', source: 'fvg', symbol: 'XAUUSD', validatedAt: Date.now(), id: 'vol-test-4' }]);
  const logged = store.signalLog[store.signalLog.length - 1];
  assert.equal(logged.id, 'vol-test-4');
  assert.equal(logged.volRegime, undefined);
});

test('pushSignalEvents: a non-"validated" event (e.g. "closed") is never tagged', () => {
  pushSignalEvents([{ type: 'closed', source: 'fvg', symbol: 'US100', outcome: 'win', id: 'vol-test-5' }]);
  const logged = store.signalLog[store.signalLog.length - 1];
  assert.equal(logged.id, 'vol-test-5');
  assert.equal(logged.volRegime, undefined);
});

// recordOrderOutcome (2026-09, at Esdras's explicit request - "il faut que
// l'ordre passe vraiment" after a believed-open position turned out to have
// no confirmed broker outcome behind it) - ground truth from a REAL
// ProtoOAExecutionEvent, never from the engine's own belief.
test('recordOrderOutcome: appends a filled outcome with all fields', () => {
  const before = store.orderOutcomeLog.length;
  recordOrderOutcome({ symbol: 'XAUUSD', source: 'fvg', signalId: 'order-test-1', outcome: 'filled', executionType: 'ORDER_FILLED' });
  assert.equal(store.orderOutcomeLog.length, before + 1);
  const logged = store.orderOutcomeLog[store.orderOutcomeLog.length - 1];
  assert.equal(logged.symbol, 'XAUUSD');
  assert.equal(logged.source, 'fvg');
  assert.equal(logged.signalId, 'order-test-1');
  assert.equal(logged.outcome, 'filled');
  assert.equal(logged.executionType, 'ORDER_FILLED');
  assert.equal(typeof logged.at, 'number');
});

test('recordOrderOutcome: appends an unfilled outcome (e.g. an expired limit)', () => {
  recordOrderOutcome({ symbol: 'XAUUSD', source: 'fvg', signalId: 'order-test-2', outcome: 'unfilled', executionType: 'ORDER_EXPIRED' });
  const logged = store.orderOutcomeLog[store.orderOutcomeLog.length - 1];
  assert.equal(logged.outcome, 'unfilled');
  assert.equal(logged.executionType, 'ORDER_EXPIRED');
});

test('recordOrderOutcome: the log is capped at MAX_LOG_LENGTH (200), same convention as signalLog', () => {
  for (let i = 0; i < 210; i++) {
    recordOrderOutcome({ symbol: 'US100', source: 'fvg', signalId: `cap-test-${i}`, outcome: 'filled', executionType: 'ORDER_FILLED' });
  }
  assert.equal(store.orderOutcomeLog.length, 200);
  assert.equal(store.orderOutcomeLog[store.orderOutcomeLog.length - 1].signalId, 'cap-test-209');
});
