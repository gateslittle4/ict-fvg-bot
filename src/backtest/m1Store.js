// m1Store.js
// Keeps the imported dataset's ONE-MINUTE candles (the Labo only ever kept the M15 aggregate), so
// the Simulateur can replay in M1/M5 (2026-09-19, Esdras: "on veut construire un véritable
// simulateur" - the M15 replay cannot tell which of a stop and a target was touched first inside
// a 15-minute bar, M1 mostly can).
//
// FORMAT - one file per dataset, sorted, fixed 20-byte records (little endian):
//   uint32 minute    engine-time ms / 60000 (the same fixed UTC-5 convention as everything else)
//   int32  open, high, low, close   price x 10^scale, rounded
// Prices as scaled integers are lossless whenever the data has <= `scale` decimals (checked and
// reported), 4x smaller than doubles, and let a window be read by binary search without loading
// the file: 15 years of EURUSD M1 is ~110 MB on disk and a 30-day window costs ~1 MB of reads.
//
// Merging a new yearly file is a streaming two-way merge of two sorted runs into a temp file
// (renamed over the old one at the end), so the memory used is one uploaded file's rows, never the
// whole history - the import runs in the Labo's memory-capped worker thread.

import fs from 'node:fs';
import { ImportError } from './m1Import.js';

export const RECORD_BYTES = 20;
export const MAX_M1_TOTAL_BYTES = 400 * 1024 * 1024; // free-tier disk is small; the cap is checked BEFORE writing
const INT32_MAX = 2_147_483_647;
const BLOCK_RECORDS = 65_536;
const MINUTE_MS = 60_000;

export const m1PathFor = (dir, name) => `${dir}/${name}.m1.bin`;

/** Digits after the decimal point of a number as JS prints it (capped: float noise beyond 8 is not data). */
function decimalsOf(x) {
  const s = String(x);
  if (s.includes('e')) return 8;
  const i = s.indexOf('.');
  return i === -1 ? 0 : Math.min(8, s.length - i - 1);
}

/** Collects parsed M1 rows (one uploaded file's worth) in typed arrays. */
export function createRowCollector() {
  let cap = 1 << 16;
  let n = 0;
  let minute = new Uint32Array(cap);
  let open = new Float64Array(cap), high = new Float64Array(cap), low = new Float64Array(cap), close = new Float64Array(cap);
  let maxDecimals = 0;
  let maxAbs = 0;
  const grow = () => {
    cap *= 2;
    const g = (a, T) => { const b = new T(cap); b.set(a); return b; };
    minute = g(minute, Uint32Array); open = g(open, Float64Array); high = g(high, Float64Array); low = g(low, Float64Array); close = g(close, Float64Array);
  };
  return {
    add(timeMs, o, h, l, c) {
      if (n === cap) grow();
      minute[n] = Math.floor(timeMs / MINUTE_MS);
      open[n] = o; high[n] = h; low[n] = l; close[n] = c;
      if (n < 5000) maxDecimals = Math.max(maxDecimals, decimalsOf(o), decimalsOf(h), decimalsOf(l), decimalsOf(c));
      if (h > maxAbs) maxAbs = h;
      if (o > maxAbs) maxAbs = o;
      n++;
    },
    get size() { return n; },
    get maxDecimals() { return maxDecimals; },
    get maxAbs() { return maxAbs; },
    /** Row indices in time order; equal minutes keep insertion order (the last one wins on dedupe). */
    sortedOrder() {
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      return idx.sort((a, b) => minute[a] - minute[b] || a - b);
    },
    row(i) { return { minute: minute[i], open: open[i], high: high[i], low: low[i], close: close[i] }; },
  };
}

/** The number of decimals to keep so every price fits an int32 with headroom (and a lossless flag). */
export function chooseScale(collector) {
  const want = Math.min(6, collector.maxDecimals);
  const room = Math.floor(Math.log10(INT32_MAX / Math.max(1, collector.maxAbs * 1.5)));
  const scale = Math.max(0, Math.min(want, room));
  return { scale, lossless: scale >= collector.maxDecimals };
}

function encodeRow(buf, off, minute, o, h, l, c, mul) {
  buf.writeUInt32LE(minute, off);
  const v = (x) => {
    const r = Math.round(x * mul);
    if (Math.abs(r) > INT32_MAX) throw new ImportError('Un prix est trop grand pour le stockage M1 de ce jeu (importe-le avec « repartir de zéro »).');
    return r;
  };
  buf.writeInt32LE(v(o), off + 4); buf.writeInt32LE(v(h), off + 8); buf.writeInt32LE(v(l), off + 12); buf.writeInt32LE(v(c), off + 16);
}

/** Streams an existing store as blocks of records. */
function* readBlocks(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(BLOCK_RECORDS * RECORD_BYTES);
  try {
    for (let n = fs.readSync(fd, buf, 0, buf.length, null); n > 0; n = fs.readSync(fd, buf, 0, buf.length, null)) {
      yield buf.subarray(0, n - (n % RECORD_BYTES));
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function storeInfo(file) {
  try {
    const size = fs.statSync(file).size;
    const rows = Math.floor(size / RECORD_BYTES);
    if (!rows) return null;
    const fd = fs.openSync(file, 'r');
    const b = Buffer.allocUnsafe(4);
    try {
      fs.readSync(fd, b, 0, 4, 0); const first = b.readUInt32LE(0);
      fs.readSync(fd, b, 0, 4, (rows - 1) * RECORD_BYTES); const last = b.readUInt32LE(0);
      return { rows, bytes: size, from: first * MINUTE_MS, to: last * MINUTE_MS };
    } finally { fs.closeSync(fd); }
  } catch { return null; }
}

/**
 * Merges a collector's rows into the store at `file` (creating it). Order-independent and
 * duplicate-safe: rows are matched by minute, the NEW row replaces an old one of the same minute.
 * @returns {{rows:number, from:number, to:number, bytes:number}}
 */
export function mergeIntoStore(file, collector, { scale, otherStoresBytes = 0 }) {
  if (collector.size === 0) throw new ImportError('Aucune ligne M1 exploitable dans ce fichier.');
  const mul = 10 ** scale;
  const oldBytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
  if (oldBytes + collector.size * RECORD_BYTES + otherStoresBytes > MAX_M1_TOTAL_BYTES) {
    throw new ImportError(`Le stockage M1 dépasserait ${Math.round(MAX_M1_TOTAL_BYTES / 1048576)} Mo au total (le disque du serveur est limité) : décoche « garder le M1 » ou supprime un jeu importé.`);
  }
  const order = collector.sortedOrder();
  const tmp = `${file}.tmp-${process.pid}`;
  const out = fs.openSync(tmp, 'w');
  const outBuf = Buffer.allocUnsafe(BLOCK_RECORDS * RECORD_BYTES);
  let outN = 0, written = 0, firstMin = null, lastMin = null;
  const flush = () => { if (outN) { fs.writeSync(out, outBuf, 0, outN * RECORD_BYTES); written += outN; outN = 0; } };
  try {
    // 1) dedupe the new rows first (last wins), so the merge below only ever sees strictly increasing minutes from that side
    const newRows = [];
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const r = collector.row(i);
      if (newRows.length && newRows[newRows.length - 1].minute === r.minute) newRows[newRows.length - 1] = r; else newRows.push(r);
    }
    // 2) two-way merge with the old file; on an equal minute the new row wins
    let ni = 0;
    const takeNew = (upTo) => { while (ni < newRows.length && newRows[ni].minute < upTo) { const r = newRows[ni++]; emitClean(r.minute, r.open, r.high, r.low, r.close); } };
    const emitClean = (minute, o, h, l, c) => {
      if (outN === BLOCK_RECORDS) flush();
      encodeRow(outBuf, outN * RECORD_BYTES, minute, o, h, l, c, mul);
      outN++;
      if (firstMin === null) firstMin = minute;
      lastMin = minute;
    };
    if (oldBytes) {
      for (const block of readBlocks(file)) {
        for (let off = 0; off < block.length; off += RECORD_BYTES) {
          const minute = block.readUInt32LE(off);
          takeNew(minute); // strictly earlier new rows first
          if (ni < newRows.length && newRows[ni].minute === minute) { const r = newRows[ni++]; emitClean(r.minute, r.open, r.high, r.low, r.close); continue; }
          emitClean(minute, block.readInt32LE(off + 4) / mul, block.readInt32LE(off + 8) / mul, block.readInt32LE(off + 12) / mul, block.readInt32LE(off + 16) / mul);
        }
      }
    }
    takeNew(Infinity);
    flush();
  } catch (err) {
    fs.closeSync(out);
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.closeSync(out);
  fs.renameSync(tmp, file);
  return { rows: written, from: firstMin * MINUTE_MS, to: lastMin * MINUTE_MS, bytes: written * RECORD_BYTES };
}

/**
 * Reads the candles with minute in [fromMs, toMs] (engine time) - binary search then one sequential read.
 * @returns {Array<[number, number, number, number, number]>} [timeMs, open, high, low, close]
 */
export function readWindow(file, scale, fromMs, toMs) {
  const info = storeInfo(file);
  if (!info) return [];
  const mul = 10 ** scale;
  const fd = fs.openSync(file, 'r');
  try {
    const b4 = Buffer.allocUnsafe(4);
    const minuteAt = (i) => { fs.readSync(fd, b4, 0, 4, i * RECORD_BYTES); return b4.readUInt32LE(0); };
    const lowerBound = (target) => { let lo = 0, hi = info.rows; while (lo < hi) { const m = (lo + hi) >> 1; if (minuteAt(m) * MINUTE_MS >= target) hi = m; else lo = m + 1; } return lo; };
    const a = lowerBound(fromMs);
    const z = lowerBound(toMs + 1);
    const out = [];
    const buf = Buffer.allocUnsafe(BLOCK_RECORDS * RECORD_BYTES);
    for (let i = a; i < z;) {
      const want = Math.min(BLOCK_RECORDS, z - i);
      const got = fs.readSync(fd, buf, 0, want * RECORD_BYTES, i * RECORD_BYTES);
      const n = Math.floor(got / RECORD_BYTES);
      if (!n) break;
      for (let k = 0; k < n; k++) {
        const off = k * RECORD_BYTES;
        out.push([buf.readUInt32LE(off) * MINUTE_MS, buf.readInt32LE(off + 4) / mul, buf.readInt32LE(off + 8) / mul, buf.readInt32LE(off + 12) / mul, buf.readInt32LE(off + 16) / mul]);
      }
      i += n;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** Groups [t,o,h,l,c] rows into `minutes`-long bars (engine time, aligned on the epoch like the M15 aggregation). */
export function aggregateRows(rows, minutes) {
  if (minutes <= 1) return rows;
  const ms = minutes * MINUTE_MS;
  const out = [];
  let cur = null;
  for (const [t, o, h, l, c] of rows) {
    const key = Math.floor(t / ms) * ms;
    if (cur && cur[0] === key) { if (h > cur[2]) cur[2] = h; if (l < cur[3]) cur[3] = l; cur[4] = c; }
    else { cur = [key, o, h, l, c]; out.push(cur); }
  }
  return out;
}
