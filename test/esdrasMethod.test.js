import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h4Bias, m15Bms, bmsOf, pickTarget, entryPlan, runOrder } from '../scripts/lib/esdrasMethod.js';

const MIN = 60000;
// bougies fictives : une minute par bougie, i0 = i1 = index
function bars(list) { return list.map(([o, h, l, c], x) => ({ t: x * MIN, i0: x, i1: x, o, h, l, c })); }
function series(list) { const f = (k) => Float64Array.from(list, (r) => r[k]); return { t: Float64Array.from(list, (_, x) => x * MIN), o: f(0), h: f(1), l: f(2), c: f(3), n: list.length }; }

test('esdrasMethod.pickTarget: nearest level beyond, or the second when it is close', () => {
  assert.equal(pickTarget([110, 130, 90], 100, 1), 110);
  assert.equal(pickTarget([110, 114, 90], 100, 1), 114); // 114 - 110 < 0,5 × 10
  assert.equal(pickTarget([90, 80], 100, 1), null);
  assert.equal(pickTarget([90, 88, 120], 100, -1), 88);
});

test('esdrasMethod.entryPlan: edge with A-wick stop, else a ladder edge/middle, else middle only, always >= 3R', () => {
  const z = { top: 100, bot: 98 };
  assert.deepEqual(entryPlan(z, { l: 97, h: 0 }, 115, 1), [{ entry: 100, stop: 97 }]); // 15 / 3 = 5R
  assert.deepEqual(entryPlan(z, { l: 95, h: 0 }, 110, 1), [{ entry: 100, stop: 99 }]); // M -> SA = 11/4 < 3 : pas de 2e ordre
  assert.deepEqual(entryPlan(z, { l: 97, h: 0 }, 107, 1), [{ entry: 100, stop: 99 }, { entry: 99, stop: 97 }]); // 7R puis 4R
  assert.equal(entryPlan(z, { l: 90, h: 0 }, 101, 1), null);
});

test('esdrasMethod.m15Bms: close above the last confirmed swing high is a bullish BMS', () => {
  const list = [[10, 11, 9, 10], [10, 13, 10, 12], [12, 12.5, 11, 11], [11, 12, 10, 11.5], [11.5, 14, 11.4, 13.5]];
  const S = series(list), X = { S, b15: bars(list) };
  const b = m15Bms(X);
  assert.equal(b.length, 1);
  assert.equal(b[0].dir, 1);
  assert.equal(b[0].t, 5 * MIN); // fermeture de la bougie 4
});

test('esdrasMethod.h4Bias: sweep of an intact low (wick below, close above) turns bullish; the high above becomes a target', () => {
  const list = [
    [100, 101, 99, 100], [100, 105, 99.5, 104], [104, 104.5, 97, 98], [98, 100, 98, 99.5], // sommet 105 (bougie 1), creux 97 (bougie 2)
    [99.5, 100, 95, 98.5], // mèche sous 97, fermeture au-dessus : prise -> acheteur
  ];
  const S = series(list), X = { S, b4h: bars(list), fvg: [[], [], []] };
  const out = h4Bias(X);
  assert.equal(out[3].bias, 0);
  assert.equal(out[4].bias, 1);
  assert.equal(out[4].since, 5 * MIN);
  assert.deepEqual(out[4].highs, [105]);
});

test('esdrasMethod.runOrder: limit fill, stop checked first in the entry minute, target from the next minute', () => {
  const S = series([[101, 101, 100.5, 100.8], [100.8, 101, 99.9, 100.2], [100.2, 103.5, 100.1, 103], [103, 103, 103, 103]]);
  const r = runOrder(S, { dir: 1, i: 0, entry: 100, stop: 99, target: 103, expiry: 10 * MIN, exitAt: Infinity });
  assert.equal(r.fill, 100);
  assert.equal(r.reason, 'target');
  assert.equal(r.r, 3);
  const miss = runOrder(S, { dir: 1, i: 0, entry: 99, stop: 98, target: 101, expiry: 10 * MIN, exitAt: Infinity });
  assert.equal(miss.missed, 'target-first');
});

test('esdrasMethod.runOrder: breakeven at 2R moves the stop to the entry price from the next minute', () => {
  const S = series([[101, 101, 99.9, 100.5], [100.5, 102.2, 100.4, 102], [102, 102, 99.95, 100], [100, 100, 100, 100]]);
  const r = runOrder(S, { dir: 1, i: 0, entry: 100, stop: 99, target: 103, expiry: 10 * MIN, exitAt: Infinity, beAt: 2 });
  assert.equal(r.reason, 'breakeven');
  assert.equal(r.r, 0);
});

test('esdrasMethod.bmsOf: works on any bars (bearish close under the last swing low)', () => {
  const list = [[10, 11, 9, 10], [10, 10.5, 8, 9], [9, 10, 9.5, 9.8], [9.8, 10, 9, 9.5], [9.5, 9.6, 7, 7.5]];
  const b = bmsOf(series(list), bars(list));
  assert.deepEqual(b.map((x) => x.dir), [-1]);
});

test('esdrasMethod.runOrder: an infinite buy limit fills at the open plus spread (market re-entry)', () => {
  const S = series([[100, 100.5, 99.5, 100], [100, 104, 100, 104]]);
  const r = runOrder(S, { dir: 1, i: 0, entry: Infinity, stop: 99, target: 103, expiry: 10 * MIN, exitAt: Infinity, spread: 0.1 });
  assert.equal(r.fill, 100.1);
  assert.equal(r.reason, 'target');
});

test('esdrasMethod.bmsIdx: same events as bmsOf, with the bar index', async () => {
  const { bmsIdx } = await import('../scripts/lib/esdrasMethod.js');
  const list = [[10, 11, 9, 10], [10, 13, 10, 12], [12, 12.5, 11, 11], [11, 12, 10, 11.5], [11.5, 14, 11.4, 13.5]];
  const b = bmsIdx(bars(list));
  assert.deepEqual(b, [{ q: 4, dir: 1 }]);
  assert.deepEqual(bmsOf(series(list), bars(list)).map((x) => x.dir), b.map((x) => x.dir));
});
