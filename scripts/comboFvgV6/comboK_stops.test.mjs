import test from 'node:test';
import assert from 'node:assert/strict';
import { afterStop } from './comboK_stops.mjs';

const K = (h, l) => ({ h, l });
// trade d'achat : entrée 100, stop 90 (risque 10), TP 130, stoppé à la bougie 0
const t = { entry: 100, stop: 90, tp: 130, risk: 10, exitIdx: 0 };
test('retour direct au TP sans creuser : TP atteint, jamais 0,5R sous le stop', () => {
  const r = afterStop([K(100, 89), K(135, 90)], t, 10); assert.equal(r.tp, true); assert.equal(r.wideDead[0.5], false); assert.equal(r.entry, true);
});
test('le prix creuse de 1R sous le stop puis revient au TP : stops élargis touchés', () => {
  const r = afterStop([K(100, 89), K(92, 79), K(135, 95)], t, 10); assert.equal(r.tp, true); assert.equal(r.wideDead[0.5], true); assert.equal(r.wideDead[1], true); assert.ok(r.minDepth >= 1);
});
test('le prix ne revient jamais : ni entrée ni TP', () => {
  const r = afterStop([K(100, 89), K(95, 60), K(80, 50)], t, 10); assert.equal(r.tp, false); assert.equal(r.entry, false);
});
test('horizon : un TP au-delà de H bougies n est pas compté', () => {
  const r = afterStop([K(100, 89), K(95, 85), K(96, 86), K(140, 100)], t, 2); assert.equal(r.tp, false);
});
test('TP dans la même bougie que le stop : signalé', () => {
  assert.equal(afterStop([K(131, 89)], t, 5).sameCandleTP, true);
});
