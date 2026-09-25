import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeOutcome, weeklyStarts } from '../scripts/lib/ftmoChallenge.js';

const H = 3600000, D = 24 * H, T0 = Date.UTC(2020, 0, 6, 12);
const seq = (rs, perDay = 1) => rs.map((r, k) => ({ u: T0 + Math.floor(k / perDay) * D + (k % perDay) * H, x: T0 + Math.floor(k / perDay) * D + (k % perDay) * H + H / 2, r }));

test('ftmoChallenge: +20 R spread over days passes at 0.5 %', () => {
  assert.equal(challengeOutcome(seq(Array(20).fill(1)), T0).res, 'pass');
});

test('ftmoChallenge: the best-day rule delays the pass (one day cannot be more than half of the gain)', () => {
  const tr = seq([...Array(12).fill(1), ...Array(9).fill(1)], 12); // day 1 : +12 R, day 2 : +9 R -> 21 R, best day 12 > 10.5
  assert.equal(challengeOutcome(tr, T0).res, 'open');
  const more = seq([...Array(12).fill(1), ...Array(12).fill(1)], 12); // 24 R, best day 12 <= 12
  assert.equal(challengeOutcome(more, T0).res, 'pass');
});

test('ftmoChallenge: -6 R in a day is the daily limit; -20 R under the end-of-day high is a bust', () => {
  assert.equal(challengeOutcome(seq(Array(6).fill(-1), 6), T0).res, 'bust-day');
  const r = challengeOutcome(seq([...Array(10).fill(1), ...Array(20).fill(-1)]), T0);
  assert.equal(r.res, 'bust');
});

test('ftmoChallenge: weekly starts fall on Mondays', () => {
  const s = weeklyStarts(Date.UTC(2020, 0, 1), Date.UTC(2020, 1, 1), Infinity);
  assert.equal(s.length, 4); assert.ok(s.every((t) => new Date(t).getUTCDay() === 1));
});
