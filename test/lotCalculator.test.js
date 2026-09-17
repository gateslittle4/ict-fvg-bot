import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateLotSize, getDefaultSpec, buildSpecFromBrokerSymbol } from '../src/engines/lotCalculator.js';

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

// --- buildSpecFromBrokerSymbol -------------------------------------------
// 2026-09-16. Fixtures below are the VERBATIM ProtoOASymbolByIdReq responses
// this broker returned for the five live symbols (trimmed to the fields that
// matter), captured from Render logs the day the bug was found.
//
// The bug: _submitOrder computed `lots * (spec.lotSize || 100000) * 100`,
// and NO spec in this file has ever defined a lotSize - so every order used
// the forex-shaped 100000 constant, multiplied by a further 100 that
// cTrader's own lotSize already includes. Correct for EURUSD by pure
// coincidence, 100000x too large on the index symbols, 1000x on gold. Those
// volumes exceed the symbols' own maxVolume, so the broker would have
// rejected every auto-executed order on four of the five live symbols. It
// went unnoticed because the only symbol that ever really traded (BTCUSD)
// set rawVolume:true and skipped this path entirely.
const BROKER_SPECS = {
  US100: { symbolId: '213', digits: 2, pipPosition: 1, lotSize: '100', minVolume: '1', stepVolume: '1', maxVolume: '20000' },
  US500: { symbolId: '215', digits: 2, pipPosition: 1, lotSize: '100', minVolume: '1', stepVolume: '1', maxVolume: '20000' },
  GER40: { symbolId: '206', digits: 2, pipPosition: 1, lotSize: '100', minVolume: '1', stepVolume: '1', maxVolume: '20000' },
  XAUUSD: { symbolId: '41', digits: 2, pipPosition: 2, lotSize: '10000', minVolume: '100', stepVolume: '100', maxVolume: '200000' },
  EURUSD: { symbolId: '1', digits: 5, pipPosition: 4, lotSize: '10000000', minVolume: '100000', stepVolume: '100000', maxVolume: '500000000' },
};

test('buildSpecFromBrokerSymbol: every real symbol resolves to cTrader\'s standard 0.01 minimum lot', () => {
  // This is the cross-check that pins the volume model down: five symbols
  // with lotSizes spanning 100 -> 10000000 all landing on exactly 0.01 lots
  // is not something a wrong reading of the units produces.
  for (const [symbol, brokerSpec] of Object.entries(BROKER_SPECS)) {
    const spec = buildSpecFromBrokerSymbol(brokerSpec, getDefaultSpec(symbol));
    assert.equal(spec.minVolume, 0.01, `${symbol} minimum lot`);
    assert.equal(spec.volumeStep, 0.01, `${symbol} lot step`);
  }
});

test('buildSpecFromBrokerSymbol: lotSize is taken from the broker, never the old 100000 guess', () => {
  assert.equal(buildSpecFromBrokerSymbol(BROKER_SPECS.US100, getDefaultSpec('US100')).lotSize, 100);
  assert.equal(buildSpecFromBrokerSymbol(BROKER_SPECS.XAUUSD, getDefaultSpec('XAUUSD')).lotSize, 10000);
  assert.equal(buildSpecFromBrokerSymbol(BROKER_SPECS.EURUSD, getDefaultSpec('EURUSD')).lotSize, 10000000);
});

test('buildSpecFromBrokerSymbol: maxVolume converts to lots instead of staying in raw broker units', () => {
  assert.equal(buildSpecFromBrokerSymbol(BROKER_SPECS.US100, getDefaultSpec('US100')).maxVolume, 200);
  assert.equal(buildSpecFromBrokerSymbol(BROKER_SPECS.XAUUSD, getDefaultSpec('XAUUSD')).maxVolume, 20);
  assert.equal(buildSpecFromBrokerSymbol(BROKER_SPECS.EURUSD, getDefaultSpec('EURUSD')).maxVolume, 50);
});

// The regression itself, stated as the volume actually put on the wire.
test('buildSpecFromBrokerSymbol: the resulting volume is within the symbol\'s own maxVolume (the old formula was not)', () => {
  const lots = 0.5;
  for (const [symbol, brokerSpec] of Object.entries(BROKER_SPECS)) {
    const spec = buildSpecFromBrokerSymbol(brokerSpec, getDefaultSpec(symbol));
    const fixed = Math.round(lots * spec.lotSize);
    const old = Math.round(lots * (getDefaultSpec(symbol).lotSize || 100000) * 100);
    assert.ok(fixed <= Number(brokerSpec.maxVolume), `${symbol}: fixed volume ${fixed} must fit maxVolume`);
    if (symbol !== 'EURUSD') {
      assert.ok(old > Number(brokerSpec.maxVolume), `${symbol}: the OLD formula must be shown to overflow maxVolume`);
    }
  }
});

test('buildSpecFromBrokerSymbol: EURUSD is where the old formula was accidentally right - the fix must not change it', () => {
  const spec = buildSpecFromBrokerSymbol(BROKER_SPECS.EURUSD, getDefaultSpec('EURUSD'));
  assert.equal(Math.round(0.5 * spec.lotSize), Math.round(0.5 * 100000 * 100));
});

test('buildSpecFromBrokerSymbol: cash-side fields are carried over untouched, and nothing claims to be fully verified', () => {
  const placeholder = getDefaultSpec('XAUUSD');
  const spec = buildSpecFromBrokerSymbol(BROKER_SPECS.XAUUSD, placeholder);
  assert.equal(spec.pointSize, placeholder.pointSize);
  assert.equal(spec.valuePerPointPerLot, placeholder.valuePerPointPerLot);
  assert.equal(spec.verified, false); // only the volume side is confirmed
  assert.equal(spec.volumeVerified, true);
});

test('buildSpecFromBrokerSymbol: an unusable response returns null so the caller keeps the placeholder', () => {
  assert.equal(buildSpecFromBrokerSymbol(null, getDefaultSpec('US100')), null);
  assert.equal(buildSpecFromBrokerSymbol({ lotSize: '0' }, getDefaultSpec('US100')), null);
  assert.equal(buildSpecFromBrokerSymbol({ lotSize: 'nonsense' }, getDefaultSpec('US100')), null);
  assert.equal(buildSpecFromBrokerSymbol({}, getDefaultSpec('US100')), null);
});

test('buildSpecFromBrokerSymbol: a missing bound falls back to the placeholder rather than becoming 0 or NaN', () => {
  const spec = buildSpecFromBrokerSymbol({ lotSize: '100' }, getDefaultSpec('US100'));
  assert.equal(spec.lotSize, 100);
  assert.equal(spec.minVolume, getDefaultSpec('US100').minVolume);
  assert.equal(spec.maxVolume, getDefaultSpec('US100').maxVolume);
});

test('calculateLotSize: sizing on a broker spec respects the real 0.01 minimum, not the placeholder 0.1', () => {
  const spec = buildSpecFromBrokerSymbol(BROKER_SPECS.US100, getDefaultSpec('US100'));
  // $10k at 0.3% = $30 risk over a 400-point stop -> 0.075 lots, which the
  // placeholder's 0.1 minimum would have rounded UP to 0.1 (33% over-risk).
  const r = calculateLotSize({ balance: 10000, riskPct: 0.3, entryPrice: 29000, stopPrice: 28600, symbolSpec: spec });
  assert.equal(r.lots, 0.07);
  assert.equal(r.cappedByMin, false);
  assert.ok(r.actualRiskAmount <= 30);
});
