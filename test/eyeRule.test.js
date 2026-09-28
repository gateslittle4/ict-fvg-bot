import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../scripts/lib/fvgContext.js';
import { opportunities, ruleTrades, nextNyTime, placeboOpps } from '../scripts/lib/eyeRule.js';
import { nyMin } from '../scripts/lib/nightLab.js';

const MIN = 60000, OFF = 5 * 3600000;
function fromM15(startIso, bars) {
  const rows = []; for (const [o, h, l, c] of bars) { rows.push([o, h, l, c]); for (let k = 1; k < 15; k++) rows.push([c, c, c, c]); }
  const t0 = Date.parse(startIso) - OFF, f = (k) => Float64Array.from(rows, (r) => r[k]);
  return { t: Float64Array.from(rows, (_, i) => t0 + i * MIN), o: f(0), h: f(1), l: f(2), c: f(3), n: rows.length };
}
const flat = (n, p = 100) => Array.from({ length: n }, () => [p, p + 0.5, p - 0.5, p]);

test('eyeRule.nextNyTime: the next 11:00 New York after a morning close, same day', () => {
  const t = Date.parse('2024-07-10T13:30:00Z') - OFF; // 09:30 EDT
  assert.equal(nyMin(nextNyTime(t, 660)), 660);
  assert.equal(nextNyTime(t, 660) - t, 90 * MIN);
});

test('eyeRule.opportunities: first qualification of each FVG inside the age and hour windows only', () => {
  const q = (j, k, age, nm, dir = 1) => ({ j, k, age, nm, dir, tau: j });
  const quals = [q(1, 0, 1, 200), q(2, 0, 5, 200), q(3, 0, 6, 200), q(4, 9, 7, 700), q(5, 9, 8, 300)];
  const o = opportunities(quals, { ageMin: 5, ageMax: 12, fromMin: 180, toMin: 660 });
  assert.deepEqual(o.map((x) => x.j), [2, 5]);
});

test('eyeRule.ruleTrades: competing limit orders, the first one filled wins even if it was placed later', () => {
  // départ 03:00 NY (hiver) ; 64 bougies plates pour l'ATR H1 ; deux opportunités d'achat fictives : A (posée à j0, limite 98) et B
  // (posée à j0+1, limite 99,5). Le prix descend à 99,4 à j0+2 (B rempli), puis remonte fort : B gagne, A est annulé.
  const bars = [...flat(64), [100, 100.5, 99.8, 100], [100, 100.2, 99.9, 100], [100, 100, 99.4, 99.6], [99.6, 104, 99.6, 104], [104, 106, 104, 106]];
  const X = buildContext(fromM15('2024-01-10T08:00:00Z', bars)); // 03:00 EST
  const j0 = 64;
  const mk = (j, top) => ({ j, tau: X.b15[j].t + 15 * MIN, nm: nyMin(X.b15[j].t + 15 * MIN), dir: 1, k: j - 5, age: 5, where: 'beyond', z: { top, bot: top - 0.5, dir: 1, k: j - 5, dead: Infinity, touch: Infinity } });
  const opps = [mk(j0, 98), mk(j0 + 1, 99.5)];
  const tr = ruleTrades(X, opps, { entry: 'limit', stop: { type: 'atr', k: 1 }, rr: 2, exit: { type: 'ny', min: 660 }, spreadAt: () => 0 });
  assert.equal(tr.length, 1);
  assert.equal(tr[0].fill, 99.5); assert.equal(tr[0].tau, opps[1].tau);
});

test('eyeRule.placeboOpps: shifted inside the hour window, zone moved with the price', () => {
  const bars = [...flat(40), ...Array.from({ length: 30 }, (_, k) => [100 + k, 100.5 + k, 99.5 + k, 100 + k])];
  const X = buildContext(fromM15('2024-01-10T08:00:00Z', bars));
  const j = 50, tau = X.b15[j].t + 15 * MIN;
  const o = { j, tau, nm: nyMin(tau), dir: 1, k: 45, age: 5, where: 'in', z: { top: X.b15[j].c + 0.2, bot: X.b15[j].c - 0.3, dir: 1, k: 45 } };
  let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (const p of placeboOpps(X, [o], { fromMin: 0, toMin: 1440 }, rnd)) {
    assert.notEqual(p.j, j); assert.ok(Math.abs(p.j - j) <= 6);
    assert.ok(Math.abs(p.z.top - X.b15[p.j].c - 0.2) < 1e-9);
  }
});
