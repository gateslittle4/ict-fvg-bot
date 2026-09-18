// m1Import.js
// Pure parsing/aggregation behind the Labo's "importer mes données" feature
// (2026-09-18, Esdras: add several years of ONE pair, in M1, and test the
// strategies already available on it - "faire ton travail mais dans le
// site"). "Ton travail" is scripts/convertHistData.js: HistData ASCII M1
// files -> one M15 CSV. This is the same job, but streaming and
// order-independent so it can run per uploaded file, and it also accepts
// the header-CSV shape csvLoader.js already understands.
//
// TIME CONVENTION - the classic silent trap in this project. The strategies
// (session windows, killzones, ...) assume "engine time": fixed UTC-5, no
// DST. HistData timestamps ARE already fixed EST, so they are used as-is
// (same as convertHistData.js and every CSV in data/backtest-input). A
// broker export (cTrader etc.) is genuine UTC and must be shifted back by
// FIXED_EST_TO_UTC_OFFSET_MS exactly like scripts/run*RealData*.js do. The
// caller says which one it is (`tz`); nothing is guessed.

import { FIXED_EST_TO_UTC_OFFSET_MS } from './nySession.js';

export const BUCKET_MS = 15 * 60 * 1000;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;

/** A message meant for the person uploading (bad file, bad option) - the
 * server maps it to HTTP 400, anything else stays a 500. */
export class ImportError extends Error {}

export function isValidDatasetName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

/**
 * Order-independent M1(or finer) -> M15 aggregation. Each bucket remembers
 * the time of the FIRST and LAST row it has seen, so:
 *  - rows can arrive in any order and duplicates change nothing;
 *  - a bucket split across two uploaded files (a file boundary that is not
 *    15-minute aligned) is merged with the correct open and close, not
 *    "whichever file came last".
 */
export function createAggregator(bucketMs = BUCKET_MS) {
  const buckets = new Map(); // key -> { open, high, low, close, first, last }

  function addSpan(key, open, high, low, close, first, last) {
    const b = buckets.get(key);
    if (!b) {
      buckets.set(key, { open, high, low, close, first, last });
      return;
    }
    if (high > b.high) b.high = high;
    if (low < b.low) b.low = low;
    if (first < b.first) { b.first = first; b.open = open; }
    if (last > b.last) { b.last = last; b.close = close; }
  }

  return {
    bucketMs,
    addRow(time, open, high, low, close) {
      addSpan(Math.floor(time / bucketMs), open, high, low, close, time, time);
    },
    /** Re-adds an already-aggregated candle (the dataset being extended). */
    addCandle(c) {
      addSpan(Math.floor(c.time / bucketMs), c.open, c.high, c.low, c.close, c.first ?? c.time, c.last ?? c.time);
    },
    get size() { return buckets.size; },
    toCandles() {
      return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([key, b]) => ({ time: key * bucketMs, open: b.open, high: b.high, low: b.low, close: b.close, first: b.first, last: b.last }));
    },
  };
}

// --- time parsing -----------------------------------------------------------

const ISO_LIKE = /^(\d{4})[-./](\d{2})[-./](\d{2})(?:[T ]+(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]00:?00)?$/;
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Digits are read as written (no local-time interpretation - the server's own
 * timezone must never leak into a backtest). Only an explicit non-zero UTC
 * offset is honoured; an ambiguous format (e.g. 01/02/2018) is refused
 * rather than guessed, since day/month order cannot be known.
 * @returns {number} epoch ms, or NaN
 */
export function parseFlexibleTime(raw) {
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    if (s.length >= 13) return Number(s);
    if (s.length === 10) return Number(s) * 1000;
    return NaN;
  }
  const m = ISO_LIKE.exec(s);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (HAS_OFFSET.test(s)) return Date.parse(s);
  return NaN;
}

function median(sortedNumbers) {
  const n = sortedNumbers.length;
  if (n === 0) return null;
  return n % 2 ? sortedNumbers[(n - 1) / 2] : (sortedNumbers[n / 2 - 1] + sortedNumbers[n / 2]) / 2;
}

/**
 * Typical candle size of a series, in minutes - median gap between
 * consecutive rows, ignoring weekend/holiday gaps (> 4 h). null if there is
 * nothing to compare.
 */
export function detectMedianStepMinutes(times) {
  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0 && d <= 4 * 60 * 60 * 1000) gaps.push(d);
  }
  gaps.sort((a, b) => a - b);
  const m = median(gaps);
  return m === null ? null : Math.round((m / 60000) * 10) / 10;
}

// --- text parsing -----------------------------------------------------------

const HISTDATA_LINE = /^\d{8} \d{6};/;

function unquote(s) {
  return s.length >= 2 && s.charCodeAt(0) === 34 && s.charCodeAt(s.length - 1) === 34 ? s.slice(1, -1) : s;
}

function pickDelimiter(headerLine) {
  const counts = [',', ';', '\t'].map((d) => [d, headerLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : null;
}

/**
 * Streams `text` line by line into `aggregator`. Never builds an array of M1
 * candles - memory stays proportional to the number of M15 buckets.
 * @param {string} text
 * @param {ReturnType<typeof createAggregator>} aggregator
 * @param {{tz?: 'est'|'utc'}} [opts] 'est' = already engine time (HistData);
 *   'utc' = genuine UTC (broker export), shifted to engine time
 * @returns {{format:'histdata'|'csv', rows:number, skipped:number, stepMinutes:number|null, firstTime:number, lastTime:number}}
 */
export function parseM1Text(text, aggregator, { tz = 'est' } = {}) {
  if (tz !== 'est' && tz !== 'utc') throw new ImportError(`Fuseau horaire inconnu: "${tz}" (attendu: est ou utc)`);
  const shift = tz === 'utc' ? FIXED_EST_TO_UTC_OFFSET_MS : 0;
  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // BOM

  function nextLine() {
    while (pos < len) {
      let end = text.indexOf('\n', pos);
      if (end === -1) end = len;
      let line = text.slice(pos, end);
      pos = end + 1;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.trim().length > 0) return line;
    }
    return null;
  }

  const first = nextLine();
  if (first === null) throw new ImportError('Fichier vide.');

  let format;
  let parseRow; // (line) -> [time, o, h, l, c] | null
  let pending = null; // first line is data for HistData, header for csv

  if (HISTDATA_LINE.test(first)) {
    format = 'histdata';
    pending = first;
    parseRow = (line) => {
      // 20180101 170000;1.200370;1.201000;1.200370;1.201000;0
      const f = line.split(';');
      if (f.length < 5) return null;
      const d = f[0];
      const time = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +d.slice(9, 11), +d.slice(11, 13), +d.slice(13, 15));
      return [time, +f[1], +f[2], +f[3], +f[4]];
    };
  } else {
    const delimiter = pickDelimiter(first);
    const header = delimiter ? first.split(delimiter).map((h) => unquote(h.trim()).toLowerCase()) : [];
    const idx = (name) => header.indexOf(name);
    const open = idx('open'), high = idx('high'), low = idx('low'), close = idx('close');
    const combined = idx('date') !== -1 && idx('time') !== -1;
    const timeIdx = ['datetime', 'timestamp', 'time', 'date'].map(idx).find((i) => i !== -1);
    if ([open, high, low, close].includes(-1) || timeIdx === undefined) {
      throw new ImportError(
        'Format non reconnu. Formats acceptés : HistData ASCII M1 ("20180101 170000;open;high;low;close;volume", sans en-tête), ' +
        'ou un CSV avec une ligne d\'en-tête contenant time (ou date/datetime/timestamp), open, high, low, close.'
      );
    }
    format = 'csv';
    const dateIdx = idx('date'), clockIdx = idx('time');
    parseRow = (line) => {
      const f = line.split(delimiter);
      const cell = (i) => unquote((f[i] ?? '').trim());
      const time = combined ? parseFlexibleTime(`${cell(dateIdx)} ${cell(clockIdx)}`) : parseFlexibleTime(cell(timeIdx));
      return [time, +cell(open), +cell(high), +cell(low), +cell(close)];
    };
  }

  let rows = 0;
  let skipped = 0;
  let firstTime = Infinity;
  let lastTime = -Infinity;
  const sample = [];
  const SAMPLE = 4000;

  const consume = (line) => {
    const r = parseRow(line);
    if (!r || !Number.isFinite(r[0]) || !Number.isFinite(r[1]) || !Number.isFinite(r[2]) || !Number.isFinite(r[3]) || !Number.isFinite(r[4])) {
      skipped++;
      return;
    }
    const time = r[0] - shift;
    aggregator.addRow(time, r[1], r[2], r[3], r[4]);
    rows++;
    if (time < firstTime) firstTime = time;
    if (time > lastTime) lastTime = time;
    if (sample.length < SAMPLE) sample.push(time);
  };

  if (pending !== null) consume(pending);
  for (let line = nextLine(); line !== null; line = nextLine()) consume(line);

  if (rows === 0) {
    throw new ImportError(`Aucune ligne exploitable dans ce fichier (${skipped} ligne(s) ignorée(s)). Vérifie le format et les colonnes.`);
  }
  const stepMinutes = detectMedianStepMinutes(sample);
  if (stepMinutes !== null && stepMinutes > 15) {
    throw new ImportError(`Bougies de ~${stepMinutes} min détectées : impossible de reconstruire du M15 (il faut du M15 ou plus fin, idéalement du M1).`);
  }
  return { format, rows, skipped, stepMinutes, firstTime, lastTime };
}

// --- stored dataset format ---------------------------------------------------
// time,open,high,low,close,first,last - the first five columns are exactly
// what csvLoader.js reads (it ignores extras), so a stored dataset is loaded
// by the very same code as every built-in one; first/last only exist so a
// later upload can extend the dataset without corrupting a split candle.

export function candlesToCsv(candles) {
  const lines = ['time,open,high,low,close,first,last'];
  for (const c of candles) lines.push(`${c.time},${c.open},${c.high},${c.low},${c.close},${c.first},${c.last}`);
  return lines.join('\n');
}

export function parseDatasetCsv(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split(',');
    const time = +f[0];
    if (!Number.isFinite(time)) continue;
    out.push({ time, open: +f[1], high: +f[2], low: +f[3], close: +f[4], first: f[5] !== undefined ? +f[5] : time, last: f[6] !== undefined ? +f[6] : time });
  }
  return out;
}
