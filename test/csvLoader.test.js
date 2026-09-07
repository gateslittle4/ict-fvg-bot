import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';

function writeTmpCsv(content) {
  const file = path.join(os.tmpdir(), `csvLoaderTest-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(file, content);
  return file;
}

test('loads a CSV with unix-seconds time column', () => {
  const file = writeTmpCsv(
    'time,open,high,low,close\n' +
      '1700000000,1.1,1.101,1.099,1.1005\n' +
      '1700000900,1.1005,1.102,1.1,1.1015\n'
  );
  const { candles, skippedRows } = loadCandlesFromCsv(file);
  assert.equal(candles.length, 2);
  assert.equal(skippedRows, 0);
  assert.equal(candles[0].time, 1700000000000); // converted to ms
  assert.equal(candles[0].close, 1.1005);
});

test('loads a CSV with a date-string time column and different header case/order', () => {
  const file = writeTmpCsv(
    'Date,Close,Open,High,Low\n' + '2026-01-02T00:00:00Z,105.5,100,106,99\n'
  );
  const { candles } = loadCandlesFromCsv(file);
  assert.equal(candles.length, 1);
  assert.equal(candles[0].open, 100);
  assert.equal(candles[0].close, 105.5);
  assert.equal(candles[0].time, Date.parse('2026-01-02T00:00:00Z'));
});

test('sorts candles chronologically even if the file is out of order', () => {
  const file = writeTmpCsv(
    'time,open,high,low,close\n' +
      '1700000900,2,2,2,2\n' +
      '1700000000,1,1,1,1\n'
  );
  const { candles } = loadCandlesFromCsv(file);
  assert.equal(candles[0].close, 1);
  assert.equal(candles[1].close, 2);
});

test('skips malformed rows instead of throwing, and reports the count', () => {
  const file = writeTmpCsv(
    'time,open,high,low,close\n' +
      '1700000000,1,1.1,0.9,1.05\n' +
      '1700000900,not-a-number,1.1,0.9,1.05\n' +
      '1700001800,1.1,1.2,1.0,1.15\n'
  );
  const { candles, skippedRows, totalRows } = loadCandlesFromCsv(file);
  assert.equal(candles.length, 2);
  assert.equal(skippedRows, 1);
  assert.equal(totalRows, 3);
});

test('de-duplicates rows with the same timestamp', () => {
  const file = writeTmpCsv(
    'time,open,high,low,close\n' +
      '1700000000,1,1.1,0.9,1.05\n' +
      '1700000000,1,1.1,0.9,1.05\n'
  );
  const { candles } = loadCandlesFromCsv(file);
  assert.equal(candles.length, 1);
});

test('throws a clear error when required columns are missing', () => {
  const file = writeTmpCsv('foo,bar\n1,2\n');
  assert.throws(() => loadCandlesFromCsv(file), /could not find required columns/);
});
