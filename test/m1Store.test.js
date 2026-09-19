import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRowCollector, chooseScale, mergeIntoStore, readWindow, storeInfo, aggregateRows, RECORD_BYTES } from '../src/backtest/m1Store.js';
import { ImportError } from '../src/backtest/m1Import.js';

const MIN = 60000;
const T0 = Date.UTC(2020, 0, 6, 10, 0);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'm1s-'));

function collect(rows) {
  const c = createRowCollector();
  for (const [t, o, h, l, cl] of rows) c.add(t, o, h, l, cl);
  return c;
}
// prices printed with 5 decimals, like a real export (raw float sums would carry noise digits that are not data)
const px = (x) => Number(x.toFixed(5));
const row = (i, base = 1.1) => [T0 + i * MIN, px(base + i * 1e-5), px(base + i * 1e-5 + 2e-5), px(base + i * 1e-5 - 2e-5), px(base + i * 1e-5 + 1e-5)];

test('chooseScale: keeps the data\'s own decimals when they fit an int32 (lossless), and says so', () => {
  const eur = chooseScale(collect([row(0), row(1)]));
  assert.equal(eur.lossless, true);
  assert.ok(eur.scale >= 5);
  const idx = chooseScale(collect([[T0, 25000.5, 25010.25, 24990.5, 25001.75]]));
  assert.equal(idx.lossless, true);
  assert.equal(idx.scale, 2);
  const huge = chooseScale(collect([[T0, 3e9, 3e9, 3e9, 3e9]]));
  assert.equal(huge.scale, 0); // headroom leaves no decimals at all
});

test('a store round-trips: write, read a window back, exact to the data\'s decimals', () => {
  const dir = tmp(); const file = path.join(dir, 'x.m1.bin');
  const rows = Array.from({ length: 500 }, (_, i) => row(i));
  const c = collect(rows); const { scale } = chooseScale(c);
  const r = mergeIntoStore(file, c, { scale });
  assert.equal(r.rows, 500);
  assert.equal(fs.statSync(file).size, 500 * RECORD_BYTES);
  const back = readWindow(file, scale, T0 + 100 * MIN, T0 + 199 * MIN);
  assert.equal(back.length, 100);
  assert.equal(back[0][0], T0 + 100 * MIN);
  for (let i = 0; i < back.length; i++) for (let k = 1; k <= 4; k++) assert.ok(Math.abs(back[i][k] - rows[100 + i][k]) < 1e-9);
  assert.deepEqual(readWindow(file, scale, T0 - 10 * MIN, T0 - 1), []);
  assert.equal(readWindow(file, scale, T0 + 490 * MIN, T0 + 10_000 * MIN).length, 10);
  const info = storeInfo(file);
  assert.equal(info.rows, 500); assert.equal(info.from, T0); assert.equal(info.to, T0 + 499 * MIN);
  fs.rmSync(dir, { recursive: true });
});

test('merging files in any order, with overlaps, gives the same sorted store (new rows win on an equal minute)', () => {
  const dir = tmp();
  const a = Array.from({ length: 300 }, (_, i) => row(i));
  const b = Array.from({ length: 300 }, (_, i) => row(200 + i)); // overlaps a on minutes 200-299
  const shuffled = [...b].reverse();
  const s = chooseScale(collect(a)).scale;
  const f1 = path.join(dir, '1.bin'); mergeIntoStore(f1, collect(a), { scale: s }); mergeIntoStore(f1, collect(shuffled), { scale: s });
  const f2 = path.join(dir, '2.bin'); mergeIntoStore(f2, collect(b), { scale: s }); mergeIntoStore(f2, collect(a), { scale: s });
  assert.equal(storeInfo(f1).rows, 500);
  assert.equal(storeInfo(f2).rows, 500);
  // the merged content covers every minute exactly once, ascending
  const all = readWindow(f1, s, T0, T0 + 600 * MIN);
  assert.equal(all.length, 500);
  for (let i = 1; i < all.length; i++) assert.equal(all[i][0] - all[i - 1][0], MIN);
  // f1: b was merged last -> its rows won on 200-299 ; f2: a was merged last -> its rows won. Both identical here (same prices), so compare a differing overlap:
  const c1 = path.join(dir, 'c.bin');
  mergeIntoStore(c1, collect([[T0, 1, 1, 1, 1]]), { scale: 4 });
  mergeIntoStore(c1, collect([[T0, 2, 2, 2, 2]]), { scale: 4 });
  assert.equal(readWindow(c1, 4, T0, T0)[0][1], 2);
  fs.rmSync(dir, { recursive: true });
});

test('duplicate minutes inside one file are collapsed (the last row wins)', () => {
  const dir = tmp(); const f = path.join(dir, 'd.bin');
  mergeIntoStore(f, collect([[T0, 1, 1, 1, 1], [T0, 5, 5, 5, 5], [T0 + MIN, 2, 2, 2, 2]]), { scale: 2 });
  const back = readWindow(f, 2, T0, T0 + MIN);
  assert.equal(back.length, 2);
  assert.equal(back[0][1], 5);
  fs.rmSync(dir, { recursive: true });
});

test('refuses to write past the disk cap (before touching the file) and rejects an empty collector', () => {
  const dir = tmp(); const f = path.join(dir, 'e.bin');
  assert.throws(() => mergeIntoStore(f, collect([row(0)]), { scale: 5, otherStoresBytes: 1e12 }), (e) => e instanceof ImportError && /dépasserait/.test(e.message));
  assert.equal(fs.existsSync(f), false);
  assert.throws(() => mergeIntoStore(f, createRowCollector(), { scale: 5 }), ImportError);
  fs.rmSync(dir, { recursive: true });
});

test('a price too large for the dataset\'s scale is refused and leaves no half-written file', () => {
  const dir = tmp(); const f = path.join(dir, 'f.bin');
  assert.throws(() => mergeIntoStore(f, collect([[T0, 25000, 25000, 25000, 25000]]), { scale: 6 }), ImportError);
  assert.equal(fs.readdirSync(dir).length, 0);
  fs.rmSync(dir, { recursive: true });
});

test('aggregateRows: M1 -> M5 keeps open of the first, high/low extremes, close of the last', () => {
  const rows = Array.from({ length: 12 }, (_, i) => [T0 + i * MIN, 10 + i, 20 + i, 5 + i, 11 + i]);
  const m5 = aggregateRows(rows, 5);
  assert.equal(m5.length, 3); // T0 = 10:00 is aligned on 5 minutes -> 3 bars of 5,5,2
  assert.deepEqual(m5[0], [T0, 10, 24, 5, 15]);
  assert.equal(aggregateRows(rows, 1), rows);
});
