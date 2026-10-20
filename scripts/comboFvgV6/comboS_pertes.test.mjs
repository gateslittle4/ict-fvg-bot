import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeMetrics, afterStop, baseStat, quartiles, wilson, rng } from './comboS_pertes.mjs';

const mk = (rows) => rows.map(([o, h, l, c], i) => ({ t: 1e9 + i * 900, o, h, l, c }));
test('tradeMetrics : AFM, MAE, S, RR', () => {
  const c = mk([[100, 102, 98, 100], [100, 102, 98, 100], [100, 104, 99, 100], [100, 100, 94, 95], [95, 96, 90, 91]]);
  const t = { fillIdx: 2, exitIdx: 3, entry: 100, risk: 4, tp: 112 }; const m = tradeMetrics(c, t);
  assert.ok(Math.abs(m.afm - 0) < 1e-9); // la bougie de remplissage ne compte pas, la suivante n'a pas de sommet au-dessus de l'entrée
  assert.ok(Math.abs(m.mae - 1.5) < 1e-9); assert.ok(Math.abs(m.rr - 3) < 1e-9); assert.ok(Math.abs(m.S - 4 / 4) < 1e-9); // amplitude moyenne des 2 bougies précédentes = 4
  const t2 = { fillIdx: 0, exitIdx: 2, entry: 100, risk: 4, tp: 112 }; assert.ok(Math.abs(tradeMetrics(c, t2).afm - 1) < 1e-9);
});
test('afterStop : retour à l\'entrée, atteint le TP, horizon', () => {
  const c = mk([[90, 90, 90, 90], [90, 101, 89, 100], [100, 113, 99, 110], [110, 111, 109, 110]]); const t = { exitIdx: 0, entry: 100, tp: 112 };
  assert.deepEqual(afterStop(c, t, 1), { backE: true, tp: false }); assert.deepEqual(afterStop(c, t, 2), { backE: true, tp: true });
  assert.deepEqual(afterStop(c, { exitIdx: 3, entry: 100, tp: 112 }, 96), { backE: false, tp: false });
});
test('baseStat : +R et +(1+RR)R', () => {
  const c = mk([[100, 100, 100, 100], [100, 111, 99, 110], [110, 141, 109, 140]]);
  assert.deepEqual(baseStat(c, 0, 10, 3), { r1: true, rtp: true }); assert.deepEqual(baseStat(c, 0, 10, 4), { r1: true, rtp: false });
});
test('quartiles : 4 groupes de même effectif, ordre croissant', () => {
  const q = quartiles(Array.from({ length: 10 }, (_, i) => ({ s: 10 - i })), (x) => x.s); assert.equal(q.reduce((a, g) => a + g.length, 0), 10); assert.ok(q[0].every((x) => x.s <= Math.min(...q[1].map((y) => y.s)))); assert.ok(q.every((g) => g.length >= 2));
});
test('wilson et rng', () => { const [a, b] = wilson(50, 100); assert.ok(a < 0.5 && b > 0.5); assert.equal(rng(3)(), rng(3)()); });
