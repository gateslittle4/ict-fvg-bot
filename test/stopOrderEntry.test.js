import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopEntryOrder, targetFromFill } from '../src/execution/entryPolicy.js';
import { firstContact, limitEntry, stopEntry, manage } from '../scripts/lib/stopOrderEntry.js';

const MIN = 60000, T0 = Date.UTC(2024, 0, 8, 9); // début de la bougie de signal (temps moteur)
/** Minutes [o, h, l, c] à partir de T0. */
function series(rows) {
  return { t: rows.map((_, k) => T0 + k * MIN), o: rows.map((r) => r[0]), h: rows.map((r) => r[1]), l: rows.map((r) => r[2]), c: rows.map((r) => r[3]), n: rows.length };
}
const flat = (n, p) => Array.from({ length: n }, () => [p, p, p, p]);
const noSwap = () => 0;
// Achat : zone 100-102, stop 98 (bord du FVG), entrée LIMIT au haut 102 (distance 4), objectif 1:5 = 122.
const SIG = { direction: 'bullish', zone: { top: 102, bottom: 100 }, entryPrice: 102, stopPrice: 98, targetPrice: 122, rrMultiple: 5, time: T0 };

test('entryPolicy.stopEntryOrder: buy stop at the top + 1 tick, sell stop at the bottom - 1 tick; target from the real risk', () => {
  assert.deepEqual(stopEntryOrder(SIG), { side: 'buy', triggerPrice: 102.01, stopPrice: 98, rrMultiple: 5 });
  assert.equal(stopEntryOrder({ ...SIG, direction: 'bearish', stopPrice: 104 }).triggerPrice, 99.99);
  assert.equal(targetFromFill({ side: 'buy', fill: 103, stopPrice: 98, rrMultiple: 5 }), 128); // risque réel 5 -> 5 x 5
  assert.equal(targetFromFill({ side: 'sell', fill: 99, stopPrice: 104, rrMultiple: 5 }), 74);
  assert.equal(targetFromFill({ side: 'buy', fill: 97, stopPrice: 98, rrMultiple: 5 }), null);
});

test('stopEntry: active from the next candle; crossing the trigger fills at the trigger; target = 5 x real risk', () => {
  // bougie de signal (15 min) sous le niveau, puis montée progressive à travers 102,01, puis l'objectif
  const S = series([...flat(15, 101), ...flat(5, 101.5), [101.5, 103, 101.5, 102.8], ...flat(5, 103), [103, 125, 103, 125]]);
  const r = stopEntry(S, SIG, { spread: 0.5, swap: noSwap, sessionEnd: T0 + 600 * MIN });
  assert.equal(r.fill, 102.01); assert.equal(r.reason, 'target');
  assert.ok(Math.abs(r.exit - (102.01 + 5 * 4.01)) < 1e-9); assert.ok(Math.abs(r.r - 5) < 1e-9);
});

test('stopEntry: a next candle opening above the trigger fills at that open (ask); nothing after the session end', () => {
  const gap = series([...flat(15, 101), ...flat(3, 104), [104, 104, 97, 97]]);
  const r = stopEntry(gap, SIG, { spread: 0.5, swap: noSwap, sessionEnd: T0 + 600 * MIN });
  assert.equal(r.fill, 104.5); assert.equal(r.reason, 'stop'); assert.ok(Math.abs(r.r - -1) < 1e-9);
  const never = series([...flat(15, 101), ...flat(30, 101), ...flat(5, 110)]);
  assert.deepEqual(stopEntry(never, SIG, { spread: 0.5, swap: noSwap, sessionEnd: T0 + 45 * MIN }), { missed: 'session-end' });
});

test('limitEntry: placed at the close, lost when the target comes first, filled when the ask comes back to the level', () => {
  const runaway = series([...flat(15, 102.5), ...flat(5, 110), [110, 123, 110, 123]]);
  assert.deepEqual(limitEntry(runaway, SIG, { spread: 0.5, swap: noSwap, maxAgeCandles: 50 }), { missed: 'target-first' });
  const back = series([...flat(15, 102.5), ...flat(5, 104), [104, 104, 101, 101], ...flat(3, 101), [101, 123, 101, 123]]);
  const r = limitEntry(back, SIG, { spread: 0.5, swap: noSwap, maxAgeCandles: 50 });
  assert.equal(r.fill, 102); assert.equal(r.reason, 'target'); assert.ok(Math.abs(r.r - 5) < 1e-9);
});

test('firstContact: enters at the zone edge inside the signal candle, paying the spread on a buy', () => {
  const S = series([...flat(3, 103), [103, 103, 101.8, 102.2], ...flat(11, 102.5), [102.5, 123, 102.5, 123]]);
  const r = firstContact(S, SIG, { spread: 0.5, swap: noSwap });
  assert.equal(r.fill, 102.5); assert.equal(r.reason, 'target'); assert.ok(Math.abs(r.r - (122 - 102.5) / 4.5) < 1e-9);
});

test('manage: stop first when stop and target share a minute; a gap through the stop exits at the open', () => {
  const S = series([[100, 100, 100, 100], [100, 130, 90, 100]]);
  assert.equal(manage(S, { buy: true, i: 0, fill: 100, stop: 95, target: 125, spread: 0 }).reason, 'stop');
  const g = series([[100, 100, 100, 100], [90, 91, 89, 90]]);
  const r = manage(g, { buy: true, i: 0, fill: 100, stop: 95, target: 125, spread: 0 });
  assert.equal(r.exit, 90); assert.equal(r.r, -2);
});

test('limitEntry: no trade when the first reachable price is already beyond the protective stop (no fake +1 R exit "at the stop")', () => {
  // la bougie de signal clôture sous le stop (97) : l'ordre LIMIT d'achat à 102 serait rempli à 97,5 (ask), sous le stop 98
  const below = series([...flat(15, 97), ...flat(30, 97)]);
  assert.deepEqual(limitEntry(below, SIG, { spread: 0.5, swap: noSwap, maxAgeCandles: 50 }), { missed: 'stop-crossed' });
});
