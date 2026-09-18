import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAggregator, parseM1Text, parseFlexibleTime, detectMedianStepMinutes, candlesToCsv, parseDatasetCsv, readDatasetCsvInto, isValidDatasetName, ImportError, BUCKET_MS } from '../src/backtest/m1Import.js';

const MIN = 60000;
const T0 = Date.UTC(2020, 0, 6, 10, 0); // a Monday, aligned to a 15-minute bucket

// HistData row: "YYYYMMDD HHMMSS;o;h;l;c;vol"
function hd(ms, o, h, l, c) {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)} ${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)};${o};${h};${l};${c};0`;
}
// 15 M1 rows filling exactly one bucket: open 1.0 ... close 1.5, high 2.0 in row 3, low 0.5 in row 9
function bucketRows(start) {
  const rows = [];
  for (let i = 0; i < 15; i++) {
    let o = 1.2, c = 1.2, h = 1.3, l = 1.1;
    if (i === 0) o = 1.0;
    if (i === 14) c = 1.5;
    if (i === 3) h = 2.0;
    if (i === 9) l = 0.5;
    rows.push({ t: start + i * MIN, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c });
  }
  return rows;
}
const asHistData = (rows) => rows.map((r) => hd(r.t, r.o, r.h, r.l, r.c)).join('\n');

test('aggregation: 15 M1 rows become one M15 candle with the right open/high/low/close', () => {
  const agg = createAggregator();
  const r = parseM1Text(asHistData(bucketRows(T0)), agg);
  assert.equal(r.format, 'histdata');
  assert.equal(r.rows, 15);
  const [c] = agg.toCandles();
  assert.deepEqual({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }, { time: T0, open: 1.0, high: 2.0, low: 0.5, close: 1.5 });
  assert.equal(agg.size, 1);
});

test('aggregation: row order does not matter (shuffled input gives the identical candle)', () => {
  const rows = [...bucketRows(T0), ...bucketRows(T0 + BUCKET_MS)];
  const ordered = createAggregator();
  parseM1Text(asHistData(rows), ordered);
  const shuffled = createAggregator();
  parseM1Text(asHistData([...rows].reverse()), shuffled);
  assert.deepEqual(shuffled.toCandles(), ordered.toCandles());
});

test('aggregation: duplicated lines (overlapping exports) change nothing', () => {
  const rows = bucketRows(T0);
  const once = createAggregator();
  parseM1Text(asHistData(rows), once);
  const twice = createAggregator();
  parseM1Text(asHistData([...rows, ...rows]), twice);
  assert.deepEqual(twice.toCandles(), once.toCandles());
});

test('aggregation: a bucket split across two parses merges with the true open and close', () => {
  const rows = bucketRows(T0);
  const whole = createAggregator();
  parseM1Text(asHistData(rows), whole);
  const split = createAggregator();
  parseM1Text(asHistData(rows.slice(7)), split); // later half FIRST - the hard order
  parseM1Text(asHistData(rows.slice(0, 7)), split);
  assert.deepEqual(split.toCandles(), whole.toCandles());
});

test('time zone: est is used as written, utc is shifted back 5 h to engine time', () => {
  const est = createAggregator();
  parseM1Text(asHistData(bucketRows(T0)), est, { tz: 'est' });
  assert.equal(est.toCandles()[0].time, T0);
  const utc = createAggregator();
  parseM1Text(asHistData(bucketRows(T0)), utc, { tz: 'utc' });
  assert.equal(utc.toCandles()[0].time, T0 - 5 * 60 * MIN);
  assert.throws(() => parseM1Text('x', createAggregator(), { tz: 'paris' }), ImportError);
});

test('csv with a header: comma + ISO time, quoted cells, CRLF and a BOM are all fine', () => {
  const lines = ['﻿"time","open","high","low","close","volume"'];
  for (const r of bucketRows(T0)) lines.push(`"${new Date(r.t).toISOString()}","${r.o}","${r.h}","${r.l}","${r.c}",10`);
  const agg = createAggregator();
  const r = parseM1Text(lines.join('\r\n'), agg);
  assert.equal(r.format, 'csv');
  const [c] = agg.toCandles();
  assert.deepEqual([c.time, c.open, c.high, c.low, c.close], [T0, 1.0, 2.0, 0.5, 1.5]);
});

test('csv with a header: semicolons and separate dotted Date + Time columns (MetaTrader style)', () => {
  const lines = ['Date;Time;Open;High;Low;Close;Volume'];
  for (const r of bucketRows(T0)) {
    const iso = new Date(r.t).toISOString();
    lines.push(`${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)};${iso.slice(11, 16)};${r.o};${r.h};${r.l};${r.c};5`);
  }
  const agg = createAggregator();
  parseM1Text(lines.join('\n'), agg);
  assert.equal(agg.toCandles()[0].time, T0);
});

test('csv with a header: unix seconds work too', () => {
  const lines = ['time,open,high,low,close'];
  for (const r of bucketRows(T0)) lines.push(`${r.t / 1000},${r.o},${r.h},${r.l},${r.c}`);
  const agg = createAggregator();
  parseM1Text(lines.join('\n'), agg);
  assert.equal(agg.toCandles()[0].close, 1.5);
});

test('parseFlexibleTime: reads digits as written, refuses ambiguous formats instead of guessing', () => {
  assert.equal(parseFlexibleTime('2020-01-06 10:00'), Date.UTC(2020, 0, 6, 10, 0));
  assert.equal(parseFlexibleTime('2020.01.06 10:00:30'), Date.UTC(2020, 0, 6, 10, 0, 30));
  assert.equal(parseFlexibleTime('2020-01-06T10:00:00Z'), Date.UTC(2020, 0, 6, 10, 0));
  assert.equal(parseFlexibleTime('2020-01-06T12:00:00+02:00'), Date.UTC(2020, 0, 6, 10, 0)); // explicit offset honoured
  assert.ok(Number.isNaN(parseFlexibleTime('06/01/2020 10:00')), 'day/month order cannot be known');
  assert.ok(Number.isNaN(parseFlexibleTime('hello')));
});

test('detectMedianStepMinutes: M1 reads as 1, weekend gaps do not distort it', () => {
  const times = [];
  for (let i = 0; i < 100; i++) times.push(T0 + i * MIN);
  times.push(T0 + 100 * MIN + 48 * 60 * MIN); // a weekend-sized gap
  for (let i = 1; i < 100; i++) times.push(times[times.length - 1] + MIN);
  assert.equal(detectMedianStepMinutes(times), 1);
});

test('rejects data coarser than M15 - a wrong-timeframe file must not be silently accepted', () => {
  const lines = [];
  for (let i = 0; i < 50; i++) lines.push(hd(T0 + i * 60 * MIN, 1, 2, 0.5, 1.5));
  assert.throws(() => parseM1Text(lines.join('\n'), createAggregator()), /impossible de reconstruire du M15/);
});

test('rejects garbage, empty files and headers missing required columns with a message that says what IS accepted', () => {
  assert.throws(() => parseM1Text('', createAggregator()), /Fichier vide/);
  assert.throws(() => parseM1Text('hello world\nfoo bar', createAggregator()), /Format non reconnu/);
  assert.throws(() => parseM1Text('time,open,close\n1,2,3', createAggregator()), /Format non reconnu/);
  assert.throws(() => parseM1Text('time,open,high,low,close\n06/01/2020 10:00,1,2,0.5,1.5', createAggregator()), /Aucune ligne exploitable/);
});

test('bad lines are skipped and counted, not fatal', () => {
  const text = [asHistData(bucketRows(T0)), '20200106 101500;abc;1;1;1;0', 'garbage'].join('\n');
  const r = parseM1Text(text, createAggregator());
  assert.equal(r.rows, 15);
  assert.equal(r.skipped, 2);
});

test('stored dataset csv round-trips, keeping first/last so a later upload can extend it exactly', () => {
  const agg = createAggregator();
  parseM1Text(asHistData(bucketRows(T0)), agg);
  const candles = agg.toCandles();
  assert.deepEqual(parseDatasetCsv(candlesToCsv(candles)), candles);
});

test('isValidDatasetName: blocks path traversal and odd characters', () => {
  for (const ok of ['EURGBP', 'eur-gbp_2', 'A']) assert.equal(isValidDatasetName(ok), true);
  for (const bad of ['', '../etc', 'a/b', 'a b', '.hidden', 'x'.repeat(25), null, 5]) assert.equal(isValidDatasetName(bad), false);
});

test('compact aggregator: streamed csv chunks equal the classic csv, and reading it back into a fresh aggregator loses nothing', () => {
  const agg = createAggregator();
  // > 4096 buckets so the typed columns must grow at least once; rows shuffled.
  const rows = [];
  for (let i = 0; i < 5000; i++) rows.push(hd(T0 + i * BUCKET_MS + (i % 3) * MIN, 1 + i, 2 + i, 0.5 + i, 1.5 + i));
  rows.reverse();
  parseM1Text(rows.join('\n'), agg);
  assert.equal(agg.size, 5000);
  const streamed = [...agg.csvChunks()].join('');
  assert.equal(streamed.trimEnd(), candlesToCsv(agg.toCandles()));
  assert.deepEqual(agg.range(), { from: T0, to: T0 + 4999 * BUCKET_MS });

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm1-')), 'd.csv');
  fs.writeFileSync(file, streamed);
  const again = createAggregator();
  assert.equal(readDatasetCsvInto(file, again), 5000);
  assert.deepEqual(again.toCandles(), agg.toCandles());
  fs.rmSync(path.dirname(file), { recursive: true });
});
