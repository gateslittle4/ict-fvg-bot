import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runLabJob, shutdownLabWorker } from '../src/backtest/labClient.js';

// A deterministic wavy series straddling the 2024-01-01 train/test cutoff,
// written as a real CSV because the worker loads datasets from disk (that is
// the point: the main thread never holds them).
function writeCsv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-client-test-'));
  const file = path.join(dir, 'TEST.csv');
  const rows = ['time,open,high,low,close'];
  const start = Date.UTC(2023, 11, 20);
  let price = 100;
  for (let i = 0; i < 2500; i++) {
    const open = price;
    const close = open + Math.sin(i / 9) * 1.5 + (i % 17 === 0 ? 3 : 0) - (i % 23 === 0 ? 3 : 0);
    rows.push(`${start + i * 900000},${open},${Math.max(open, close) + 0.8},${Math.min(open, close) - 0.8},${close}`);
    price = close;
  }
  fs.writeFileSync(file, rows.join('\n'));
  return file;
}

const csvPath = writeCsv();
after(async () => { await shutdownLabWorker(); });

test('runLabJob runTrainTest: round-trips through the worker thread with the full result shape', async () => {
  const r = await runLabJob('runTrainTest', { csvPath, strategyId: 'macd-trend', symbol: 'US100' });
  assert.equal(r.candleCount, 2500);
  assert.ok(['holds', 'weakened', 'fails', 'not-enough-trades'].includes(r.verdict));
  assert.equal(typeof r.trainCutoff, 'number');
  for (const side of [r.train, r.test]) {
    assert.equal(typeof side.summary.totalSignals, 'number');
    assert.ok(Array.isArray(side.equityCurve));
    assert.ok(side.recentTrades.length <= 100);
  }
});

test('runLabJob: an error thrown inside the worker rejects the promise instead of hanging or crashing the process', async () => {
  await assert.rejects(runLabJob('runTrainTest', { csvPath, strategyId: 'nope', symbol: 'US100' }), /Unknown lab strategy/);
  await assert.rejects(runLabJob('doesNotExist', {}), /Opération inconnue/);
  await assert.rejects(runLabJob('runTrainTest', { csvPath: '/no/such/file.csv', strategyId: 'macd-trend', symbol: 'US100' }));
});

test('runLabJob screenSymbols: reports a bad dataset per-entry without failing the good ones', async () => {
  const results = await runLabJob('screenSymbols', {
    strategyId: 'macd-trend',
    datasets: [
      { key: 'GOOD', symbol: 'US100', csvPath },
      { key: 'BAD', symbol: 'US100', csvPath: '/no/such/file.csv' },
    ],
  });
  assert.equal(results.find((r) => r.symbol === 'GOOD').ok, true);
  assert.equal(results.find((r) => r.symbol === 'BAD').ok, false);
});

test('runLabJob screenStrategies: returns one row per registered strategy', async () => {
  const { candleCount, results } = await runLabJob('screenStrategies', { csvPath, symbol: 'US100' });
  assert.equal(candleCount, 2500);
  assert.ok(results.length >= 15);
  assert.ok(results.every((r) => r.ok || typeof r.error === 'string'));
});

test('runLabJob: a job past its deadline is rejected and does not wedge the client for the next one', async () => {
  // screenStrategies runs ~20 strategies (~150 ms even with a warm thread), so a 5 ms
  // deadline can't be beaten by the job - a single quick strategy could.
  await assert.rejects(runLabJob('screenStrategies', { csvPath, symbol: 'US100' }, { timeoutMs: 5 }), /trop long/);
  const r = await runLabJob('runTrainTest', { csvPath, strategyId: 'macd-trend', symbol: 'US100' });
  assert.equal(r.candleCount, 2500);
});
