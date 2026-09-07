import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setAutoExecute, isAutoExecuteActive, store } from '../src/store.js';

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
