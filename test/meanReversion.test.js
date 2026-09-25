import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyBars, meanReversionTrades } from '../scripts/lib/meanReversion.js';

const DAY = 86400000, H17 = 17 * 3600000, D0 = Date.UTC(2020, 0, 1) + H17;
/** One engine-time day per [o, h, l, c]: 4 M1 bars (open, high, low, close) inside the 17:00 -> 17:00 day. */
function series(days) {
  const t = [], o = [], h = [], l = [], c = [];
  days.forEach(([bo, bh, bl, bc], d) => {
    for (const [m, p] of [[0, bo], [60, bh], [120, bl], [180, bc]]) { t.push(D0 + d * DAY + m * 60000); o.push(p); h.push(p); l.push(p); c.push(p); }
  });
  return { t, o, h, l, c, n: t.length };
}
const up = (n, from = 100, step = 0.5) => Array.from({ length: n }, (_, k) => { const p = from + k * step; return [p, p + 1, p - 1, p + 0.5]; });

test('meanReversion: daily bars run 17:00 -> 17:00 engine time', () => {
  const B = dailyBars(series(up(3)));
  assert.equal(B.length, 3); assert.equal(B[1].time, D0 + DAY); assert.equal(B[1].i0, 4); assert.equal(B[1].i1, 8);
});

test('meanReversion IBS: close at the bottom of the day above the 200-day average -> buy next open, sell the open after a close near the top', () => {
  const last = 100 + 219 * 0.5; // uptrend, far above the 200-day average
  const days = [...up(220), [last, last + 1, last - 2, last - 1.9], [last - 1.9, last + 1, last - 2, last + 0.9], [last + 1, last + 2, last, last + 1.5]];
  const tr = meanReversionTrades(series(days), 'ibs', { spreadAt: () => 0.1, smaLen: 200 });
  assert.equal(tr.length, 1);
  assert.equal(tr[0].entry, last - 1.9 + 0.1); // ask at the next open
  assert.equal(tr[0].exit, last + 1); assert.equal(tr[0].reason, 'signal');
  assert.ok(tr[0].r > 0);
});

test('meanReversion: the 3-ATR stop is hit minute by minute, a gap below it exits at the open', () => {
  const last = 100 + 219 * 0.5;
  const days = [...up(220), [last, last + 1, last - 2, last - 1.9], [last - 1.9, last - 1.9, last - 1.9, last - 1.9], [last - 20, last - 20, last - 20, last - 20]];
  const tr = meanReversionTrades(series(days), 'ibs', { spreadAt: () => 0 });
  assert.equal(tr.length, 1); assert.equal(tr[0].reason, 'stop'); assert.equal(tr[0].exit, last - 20);
  assert.ok(tr[0].r < -1); // gap through the stop costs more than 1R
});

test('meanReversion 3-down: three lower closes -> entry; first higher close -> exit; nothing below the 200-day average', () => {
  const last = 100 + 219 * 0.5;
  const d3 = [[last, last + 0.5, last - 1, last - 0.5], [last - 0.5, last, last - 1.5, last - 1], [last - 1, last - 0.5, last - 2, last - 1.5], [last - 1.5, last, last - 1.6, last - 0.2], [last, last + 1, last - 0.5, last + 0.5]];
  const tr = meanReversionTrades(series([...up(220), ...d3]), 'down3', { spreadAt: () => 0 });
  assert.equal(tr.length, 1); assert.equal(tr[0].entry, last - 1.5); assert.equal(tr[0].exit, last); assert.equal(tr[0].reason, 'signal');
  const downtrend = Array.from({ length: 220 }, (_, k) => { const p = 300 - k * 0.5; return [p, p + 1, p - 1, p - 0.5]; });
  assert.equal(meanReversionTrades(series(downtrend), 'down3', { spreadAt: () => 0 }).length, 0);
});
