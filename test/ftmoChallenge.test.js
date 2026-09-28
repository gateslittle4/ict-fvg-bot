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

test('ftmoChallenge worst case: open positions count at their stop, so two losers open together with -5 R realized break the daily limit', () => {
  const T = Date.UTC(2020, 0, 6, 10);
  const tr = [
    ...Array(5).fill(0).map((_, k) => ({ u: T + k * 60000, x: T + k * 60000 + 1000, r: -1 })), // -5 R réalisés
    { u: T + H, x: T + 3 * H, r: 2 }, // ouverte ensemble : -1 R latent chacune au pire
    { u: T + H + 1000, x: T + 3 * H, r: 2 },
  ].sort((a, b) => a.x - b.x);
  assert.equal(challengeOutcome(tr, T - H).res, 'open'); // solde réalisé seulement : -5 R puis +4 R, jamais -6 R
  assert.equal(challengeOutcome(tr, T - H, { worstCaseOpen: true }).res, 'bust-day'); // -5 - 2 = -7 R latents
});

test('ftmoChallenge mae mode: a winner that only dipped -0.3 R costs -0.3 R while open, not -1 R', () => {
  const T = Date.UTC(2020, 0, 6, 10);
  const tr = [
    ...Array(5).fill(0).map((_, k) => ({ u: T + k * 60000, x: T + k * 60000 + 1000, r: -1, mae: -1 })),
    { u: T + H, x: T + 3 * H, r: 2, mae: -0.3 },
    { u: T + H + 1000, x: T + 3 * H, r: 2, mae: -0.3 },
  ].sort((a, b) => a.x - b.x);
  assert.equal(challengeOutcome(tr, T - H, { open: 'mae' }).res, 'open'); // -5 - 0.6 = -5.6 R > -6 R
  assert.equal(challengeOutcome(tr, T - H, { open: 'stop' }).res, 'bust-day');
});
