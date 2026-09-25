import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessions } from '../scripts/lib/intradayMomentum.js';
import { orbHoldNextDay } from '../scripts/lib/orbHold.js';

// Two New York sessions (winter, 9:30 NY = 14:30 UTC) plus the night in between, one M1 bar per minute.
const MIN = 60000, D1 = Date.UTC(2021, 0, 12, 14, 30), D2 = Date.UTC(2021, 0, 13, 14, 30);
function build(night, day2) {
  const t = [], o = [], h = [], l = [], c = [];
  const push = (time, p, hi = p, lo = p) => { t.push(time); o.push(p); h.push(hi); l.push(lo); c.push(p); };
  for (let k = 0; k < 390; k++) push(D1 + k * MIN, k < 5 ? 100 + k : 105, k < 5 ? 100 + k + 0.5 : 105.5, k < 5 ? 100 + k - 0.5 : 104.8); // up opening, flat after
  for (let k = 0; k < 60; k++) push(D1 + (390 + 60 + k) * MIN, night); // an hour of night quotes (17:00-18:00 NY)
  for (let k = 0; k < 390; k++) push(D2 + k * MIN, day2(k));
  return { t: Float64Array.from(t), o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), n: t.length };
}

test('orbHold: a trade still open at 15:59 is held overnight and closed at 15:59 the next day (swap counted)', () => {
  const S = build(106, () => 108);
  const [d1, d2] = buildSessions(S);
  const { base, hold } = orbHoldNextDay(d1, d2, S, () => 0, () => -0.1);
  assert.equal(base.reason, 'close'); assert.equal(hold.reason, 'close2');
  assert.equal(hold.exit, 108); assert.ok(Math.abs(hold.r - (108 - base.fill - 0.1) / base.R) < 1e-9);
  assert.ok(hold.r > base.r);
});

test('orbHold: the stop is watched overnight, a gap below it exits at the open', () => {
  const S = build(96, () => 96); // night opens under the 5-minute low (99.5)
  const [d1, d2] = buildSessions(S);
  const { hold } = orbHoldNextDay(d1, d2, S, () => 0);
  assert.equal(hold.reason, 'stop'); assert.equal(hold.exit, 96);
});

test('orbHold: a trade closed by its stop or target on day 1 is unchanged', () => {
  const S = build(106, () => 108);
  const [d1, d2] = buildSessions(S);
  const { base, hold } = orbHoldNextDay(d1, null, S, () => 0);
  assert.deepEqual(hold, base);
  void d2;
});
