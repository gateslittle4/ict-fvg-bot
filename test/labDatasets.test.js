import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importIntoDataset, listDatasets, deleteDataset, readDatasetMeta, csvPathFor, MAX_CUSTOM_DATASETS } from '../src/backtest/labDatasets.js';
import { ImportError } from '../src/backtest/m1Import.js';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { runLabBacktestTrainTest } from '../src/backtest/labRunner.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lab-datasets-'));
const MIN = 60000;
const BUCKET = 15 * MIN;

function hd(ms, o, h, l, c) {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)} ${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)};${o};${h};${l};${c};0`;
}

// Splits one real M15 candle into 15 M1 rows that resample back to EXACTLY
// that candle: first open, last close, one row carrying the high, one the low.
function m1RowsFor(c, shiftMs = 0) {
  const mid = (c.open + c.close) / 2;
  const rows = [];
  for (let i = 0; i < 15; i++) {
    let o = mid, cl = mid;
    if (i === 0) o = c.open;
    if (i === 14) cl = c.close;
    let h = Math.max(o, cl), l = Math.min(o, cl);
    if (i === 3) h = c.high;
    if (i === 9) l = c.low;
    rows.push(hd(c.time + shiftMs + i * MIN, o, h, l, cl));
  }
  return rows;
}

// Real data: 400 consecutive EURUSD M15 candles from the project's own CSV.
const { candles: allEurusd } = loadCandlesFromCsv(path.join('data', 'backtest-input', 'EURUSD.csv'));
const REAL = allEurusd.slice(120000, 120400);

test('END TO END: real M15 -> synthetic M1 -> import -> the SAME candles come back, bit for bit', () => {
  const dir = tmp();
  const text = REAL.flatMap((c) => m1RowsFor(c)).join('\n');
  const { dataset } = importIntoDataset({ dir, name: 'EQ', symbol: 'EURUSD', text });
  assert.equal(dataset.candles, REAL.length);
  const { candles } = loadCandlesFromCsv(csvPathFor(dir, 'EQ'));
  assert.deepEqual(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })), REAL.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
});

test('END TO END: a strategy gives IDENTICAL results on the imported dataset and on the original candles', () => {
  const dir = tmp();
  importIntoDataset({ dir, name: 'EQ', symbol: 'EURUSD', text: REAL.flatMap((c) => m1RowsFor(c)).join('\n') });
  const { candles: imported } = loadCandlesFromCsv(csvPathFor(dir, 'EQ'));
  const cutoff = REAL[200].time;
  const a = runLabBacktestTrainTest('macd-trend', REAL, 'EURUSD', { cutoff });
  const b = runLabBacktestTrainTest('macd-trend', imported, 'EURUSD', { cutoff });
  assert.ok(a.train.summary.totalSignals + a.test.summary.totalSignals > 0, 'the comparison must be over real trades');
  assert.deepEqual(b.train.summary, a.train.summary);
  assert.deepEqual(b.test.summary, a.test.summary);
});

test('END TO END: a broker export in real UTC + tz=utc lands on the same engine-time candles as EST data', () => {
  const dir = tmp();
  const FIVE_H = 5 * 60 * MIN;
  const text = REAL.flatMap((c) => m1RowsFor(c, FIVE_H)).join('\n'); // the same market, stamped 5 h later (UTC)
  importIntoDataset({ dir, name: 'UTC1', symbol: 'EURUSD', tz: 'utc', text });
  const { candles } = loadCandlesFromCsv(csvPathFor(dir, 'UTC1'));
  assert.deepEqual(candles.map((c) => c.time), REAL.map((c) => c.time));
});

test('several files for ONE pair extend the same dataset, including a file boundary that cuts a candle in two', () => {
  const dir = tmp();
  const rows = REAL.slice(0, 40).flatMap((c) => m1RowsFor(c));
  const cut = 15 * 20 + 6; // mid-candle: 6 minutes into the 21st bucket
  importIntoDataset({ dir, name: 'MULTI', symbol: 'EURUSD', text: rows.slice(cut).join('\n'), filename: 'year2.csv' }); // later file FIRST
  const { dataset } = importIntoDataset({ dir, name: 'MULTI', symbol: 'EURUSD', text: rows.slice(0, cut).join('\n'), filename: 'year1.csv' });
  const { candles } = loadCandlesFromCsv(csvPathFor(dir, 'MULTI'));
  assert.deepEqual(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })), REAL.slice(0, 40).map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  assert.equal(dataset.files.length, 2);
  assert.equal(dataset.m1Rows, rows.length);
});

test('re-uploading the same file is harmless (idempotent)', () => {
  const dir = tmp();
  const text = REAL.slice(0, 30).flatMap((c) => m1RowsFor(c)).join('\n');
  importIntoDataset({ dir, name: 'IDEM', symbol: 'EURUSD', text });
  const before = fs.readFileSync(csvPathFor(dir, 'IDEM'), 'utf8');
  importIntoDataset({ dir, name: 'IDEM', symbol: 'EURUSD', text });
  assert.equal(fs.readFileSync(csvPathFor(dir, 'IDEM'), 'utf8'), before);
});

test('spread: a known pair uses the project table, an unknown pair must supply one (never a silent zero cost)', () => {
  const dir = tmp();
  const text = REAL.slice(0, 20).flatMap((c) => m1RowsFor(c)).join('\n');
  const known = importIntoDataset({ dir, name: 'K', symbol: 'EURUSD', text }).dataset;
  assert.equal(known.spread, 0.00011);
  assert.equal(known.spreadSource, 'table du projet');
  assert.throws(() => importIntoDataset({ dir, name: 'U', symbol: 'EURGBP', text }), (e) => e instanceof ImportError && /Spread inconnu pour EURGBP/.test(e.message));
  const custom = importIntoDataset({ dir, name: 'U', symbol: 'EURGBP', spread: 0.00013, text }).dataset;
  assert.equal(custom.spread, 0.00013);
  assert.equal(custom.spreadSource, 'saisi');
  assert.equal(importIntoDataset({ dir, name: 'Z', symbol: 'EURGBP', spread: 0, text }).dataset.spread, 0, 'an explicit 0 is honoured');
});

test('guardrails: cannot mix pairs or time zones into one dataset, "replace" starts over', () => {
  const dir = tmp();
  const text = REAL.slice(0, 20).flatMap((c) => m1RowsFor(c)).join('\n');
  importIntoDataset({ dir, name: 'G', symbol: 'EURUSD', text });
  assert.throws(() => importIntoDataset({ dir, name: 'G', symbol: 'GBPUSD', text }), /impossible d'y mélanger/);
  assert.throws(() => importIntoDataset({ dir, name: 'G', symbol: 'EURUSD', tz: 'utc', text }), /décalerait les heures de 5 h/);
  const replaced = importIntoDataset({ dir, name: 'G', symbol: 'GBPUSD', replace: true, text }).dataset;
  assert.equal(replaced.symbol, 'GBPUSD');
  assert.equal(replaced.files.length, 1);
});

test('a failed import leaves the existing dataset byte-for-byte untouched', () => {
  const dir = tmp();
  const text = REAL.slice(0, 20).flatMap((c) => m1RowsFor(c)).join('\n');
  importIntoDataset({ dir, name: 'SAFE', symbol: 'EURUSD', text });
  const csv = fs.readFileSync(csvPathFor(dir, 'SAFE'), 'utf8');
  const meta = fs.readFileSync(path.join(dir, 'SAFE.meta.json'), 'utf8');
  assert.throws(() => importIntoDataset({ dir, name: 'SAFE', symbol: 'EURUSD', text: 'not,a,real,file\n1,2,3,4' }), ImportError);
  assert.equal(fs.readFileSync(csvPathFor(dir, 'SAFE'), 'utf8'), csv);
  assert.equal(fs.readFileSync(path.join(dir, 'SAFE.meta.json'), 'utf8'), meta);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('.tmp-')), [], 'no temp files left behind');
});

test('a dataset that stops before 2024 records a proportional train/test split and says so', () => {
  const dir = tmp();
  const start = Date.UTC(2012, 0, 2);
  const lines = [];
  for (let i = 0; i < 600; i++) lines.push(...m1RowsFor({ time: start + i * BUCKET * 96, open: 1.1, high: 1.2, low: 1.0, close: 1.15 })); // one candle per day
  const { dataset } = importIntoDataset({ dir, name: 'OLD', symbol: 'EURUSD', text: lines.join('\n') });
  assert.equal(dataset.cutoffKind, 'proportional');
  assert.ok(dataset.trainCutoff > dataset.from && dataset.trainCutoff < dataset.to);
});

test('listDatasets / deleteDataset / cap: names stay safe, deletion removes both files, the total is capped', () => {
  const dir = tmp();
  assert.deepEqual(listDatasets(path.join(dir, 'nope')), []);
  const text = REAL.slice(0, 20).flatMap((c) => m1RowsFor(c)).join('\n');
  assert.throws(() => importIntoDataset({ dir, name: '../evil', symbol: 'EURUSD', text }), /Nom de jeu de données invalide/);
  importIntoDataset({ dir, name: 'A', symbol: 'EURUSD', text });
  assert.equal(listDatasets(dir).length, 1);
  assert.equal(deleteDataset(dir, 'A'), true);
  assert.equal(deleteDataset(dir, 'A'), false);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(readDatasetMeta(dir, 'A'), null);
  for (let i = 0; i < MAX_CUSTOM_DATASETS; i++) importIntoDataset({ dir, name: `D${i}`, symbol: 'EURUSD', text });
  assert.throws(() => importIntoDataset({ dir, name: 'ONETOOMANY', symbol: 'EURUSD', text }), /Trop de jeux de données/);
  importIntoDataset({ dir, name: 'D0', symbol: 'EURUSD', text }); // extending an existing one is still fine at the cap
});
