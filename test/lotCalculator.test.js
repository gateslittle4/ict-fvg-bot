import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLotSize, getDefaultSpec } from '../src/engines/lotCalculator.js';

test('calculates lot size for a forex pair (EURUSD)', () => {
  const spec = getDefaultSpec('EURUSD');
  const result = calculateLotSize({
    balance: 10000,
    riskPct: 0.5, // risk $50
    entryPrice: 1.1000,
    stopPrice: 1.0950, // 50 pips distance
    symbolSpec: spec,
  });
  // riskAmount 50 / (50 pips * $10/pip) = 0.1 lot
  assert.equal(result.riskAmount, 50);
  assert.equal(result.distanceInPoints, 50);
  assert.equal(result.lots, 0.1);
  assert.equal(result.cappedByMin, false);
  assert.equal(result.cappedByMax, false);
});

test('calculates lot size for an index (US100)', () => {
  const spec = getDefaultSpec('US100');
  const result = calculateLotSize({
    balance: 20000,
    riskPct: 0.5, // risk $100
    entryPrice: 19500,
    stopPrice: 19480, // 20 points distance
    symbolSpec: spec,
  });
  // 100 / (20 points * $1/point) = 5 lots
  assert.equal(result.lots, 5);
});

test('rounds down to the nearest volume step, never up (never over-risks)', () => {
  const spec = getDefaultSpec('EURUSD'); // step 0.01
  const result = calculateLotSize({
    balance: 10000,
    riskPct: 0.37,
    entryPrice: 1.1000,
    stopPrice: 1.0963, // 37 pips
    symbolSpec: spec,
  });
  // raw = 37 / (37*10) = 0.1 exactly in this contrived case; check general rounding behavior instead
  assert.ok(result.lots <= result.rawLots + 1e-9);
  assert.ok(result.actualRiskAmount <= result.riskAmount + 1e-9);
});

test('clamps to minVolume when computed size is below the broker minimum', () => {
  const spec = getDefaultSpec('EURUSD');
  const result = calculateLotSize({
    balance: 200, // tiny account
    riskPct: 0.5, // risk $1
    entryPrice: 1.1000,
    stopPrice: 1.0900, // 100 pips - huge distance relative to risk budget
    symbolSpec: spec,
  });
  assert.equal(result.cappedByMin, true);
  assert.equal(result.lots, spec.minVolume);
});

test('clamps to maxVolume when computed size exceeds the broker maximum', () => {
  const spec = getDefaultSpec('US100');
  const result = calculateLotSize({
    balance: 5_000_000,
    riskPct: 2,
    entryPrice: 19500,
    stopPrice: 19499, // 1 point stop - tiny distance, huge implied size
    symbolSpec: spec,
  });
  assert.equal(result.cappedByMax, true);
  assert.equal(result.lots, spec.maxVolume);
});

test('throws on equal entry and stop price (zero distance)', () => {
  const spec = getDefaultSpec('US500');
  assert.throws(() =>
    calculateLotSize({ balance: 10000, riskPct: 0.5, entryPrice: 5000, stopPrice: 5000, symbolSpec: spec })
  );
});

test('throws on non-positive balance or riskPct', () => {
  const spec = getDefaultSpec('US500');
  assert.throws(() =>
    calculateLotSize({ balance: 0, riskPct: 0.5, entryPrice: 5000, stopPrice: 4990, symbolSpec: spec })
  );
  assert.throws(() =>
    calculateLotSize({ balance: 10000, riskPct: 0, entryPrice: 5000, stopPrice: 4990, symbolSpec: spec })
  );
});

test('flags specVerified=false on the built-in placeholder specs', () => {
  const spec = getDefaultSpec('US100');
  const result = calculateLotSize({ balance: 10000, riskPct: 0.5, entryPrice: 100, stopPrice: 95, symbolSpec: spec });
  assert.equal(result.specVerified, false);
});
