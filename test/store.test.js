import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setAutoExecute, isAutoExecuteActive, setRiskPctPerTrade, store } from '../src/store.js';
import { MIN_RISK_PCT, MAX_RISK_PCT } from '../src/config.js';

const HOUR = 3600 * 1000;

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
