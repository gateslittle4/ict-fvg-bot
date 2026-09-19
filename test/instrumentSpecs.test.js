import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentSpec, conversionPlan, buildRateSeries } from '../src/backtest/instrumentSpecs.js';

test('instrumentSpec: forex pairs quote in their last 3 letters with a 100 000 lot; gold and indices have their own', () => {
  assert.deepEqual([instrumentSpec('EURUSD').quote, instrumentSpec('EURUSD').contractSize], ['USD', 100000]);
  assert.deepEqual([instrumentSpec('USDJPY').quote, instrumentSpec('USDJPY').contractSize], ['JPY', 100000]);
  assert.deepEqual([instrumentSpec('EURGBP').quote], ['GBP']);
  assert.deepEqual([instrumentSpec('XAUUSD').quote, instrumentSpec('XAUUSD').contractSize], ['USD', 100]);
  assert.equal(instrumentSpec('GER40').quote, 'EUR');
  assert.equal(instrumentSpec('UKX').quote, 'GBP');
  assert.equal(instrumentSpec('US100').contractSize, 1);
  assert.equal(instrumentSpec('WHATEVER-1').unknown, true);
});

const ALL = ['AUDUSD', 'EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'NZDJPY', 'US100'];

test('conversionPlan: USD needs none; direct pairs multiply, inverse pairs divide; NZD goes through the JPY cross', () => {
  assert.deepEqual(conversionPlan('USD', ALL), { status: 'none' });
  assert.deepEqual(conversionPlan('EUR', ALL), { status: 'ok', combine: 'single', legs: [{ symbol: 'EURUSD', mode: 'mul' }] });
  assert.deepEqual(conversionPlan('JPY', ALL).legs, [{ symbol: 'USDJPY', mode: 'div' }]);
  assert.deepEqual(conversionPlan('CAD', ALL).legs, [{ symbol: 'USDCAD', mode: 'div' }]);
  assert.equal(conversionPlan('NZD', ALL).combine, 'ratio');
  assert.equal(conversionPlan('CHF', ALL).status, 'unavailable'); // no CHF pair in the data: says so, never a made-up rate
});

test('buildRateSeries: multiply, invert, and the ratio of two crosses with forward fill', () => {
  const eur = [{ time: 1, close: 1.1 }, { time: 2, close: 1.2 }];
  assert.deepEqual(buildRateSeries('single', [{ mode: 'mul', bars: eur }]), [[1, 1.1], [2, 1.2]]);
  const jpy = buildRateSeries('single', [{ mode: 'div', bars: [{ time: 1, close: 100 }] }]);
  assert.equal(jpy[0][1], 0.01);
  const ratio = buildRateSeries('ratio', [
    { mode: 'mul', bars: [{ time: 1, close: 90 }, { time: 3, close: 96 }] }, // NZDJPY
    { mode: 'mul', bars: [{ time: 2, close: 150 }] }, // USDJPY, later start
  ]);
  assert.deepEqual(ratio.map((r) => r[0]), [2, 3]); // no rate before both legs exist
  assert.ok(Math.abs(ratio[0][1] - 90 / 150) < 1e-12);
  assert.ok(Math.abs(ratio[1][1] - 96 / 150) < 1e-12);
});
