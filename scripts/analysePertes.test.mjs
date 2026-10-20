import test from 'node:test';
import assert from 'node:assert/strict';
import { nyToUtcMs, pathStats, afterStats, randomStats, wilson, rng, lowerBound } from './analysePertes.mjs';

const M = (rows, t0 = 1000000 * 60000) => ({ t: Float64Array.from(rows.map((_, i) => t0 + i * 60000)), o: Float64Array.from(rows.map((r) => r[0])), h: Float64Array.from(rows.map((r) => r[1])), l: Float64Array.from(rows.map((r) => r[2])), c: Float64Array.from(rows.map((r) => r[3])) });
test('nyToUtcMs : heure standard et heure d\'été', () => {
  assert.equal(new Date(nyToUtcMs('2025-03-07 09:35')).toISOString(), '2025-03-07T14:35:00.000Z');
  assert.equal(new Date(nyToUtcMs('2025-03-10 11:30')).toISOString(), '2025-03-10T15:30:00.000Z');
});
test('pathStats : AFM d\'un achat et d\'une vente', () => {
  const m = M([[100, 101, 99, 100], [100, 110, 99, 105], [105, 106, 90, 91], [91, 92, 80, 85]]), t0 = m.t[0];
  const b = pathStats(m, t0, m.t[2], 1, 10); assert.equal(b.E, 100); assert.ok(Math.abs(b.afm - 1) < 1e-9);
  const s = pathStats(m, t0, m.t[2], -1, 10); assert.ok(Math.abs(s.afm - 1) < 1e-9);
  assert.equal(pathStats(m, t0 + 3600000 * 10, t0 + 3600000 * 11, 1, 10), null);
});
test('afterStats : retour à E, cible 3 R, perte propre', () => {
  const up = M([[90, 90, 90, 90], [90, 101, 90, 95], [95, 135, 94, 130]]); // achat, E=100, R=10 : atteint E puis E+30
  const a = afterStats(up, up.t[0], 1, 10, 100); assert.ok(a.backE && a.tp3 && !a.clean);
  const down = M([[90, 90, 90, 90], [90, 91, 65, 70], [70, 72, 60, 65]]); // s'éloigne jusqu'à E-3R = 70 sans revenir
  const b = afterStats(down, down.t[0], 1, 10, 100); assert.ok(!b.backE && !b.tp3 && b.clean);
});
test('randomStats : +1 R et +4 R depuis un instant', () => {
  const m = M([[100, 100, 100, 100], [100, 111, 99, 105], [105, 141, 100, 140]]);
  const s = randomStats(m, 0, 1, 10); assert.ok(s.r1 && s.r4);
  const v = randomStats(m, 0, -1, 10); assert.ok(!v.r1 && !v.r4);
});
test('wilson et rng reproductible', () => {
  const [a, b] = wilson(25, 100); assert.ok(a < 0.25 && b > 0.25 && a > 0.17 && b < 0.35);
  const r1 = rng(5), r2 = rng(5); assert.equal(r1(), r2());
  assert.equal(lowerBound(Float64Array.from([1, 3, 5]), 4), 2);
});
