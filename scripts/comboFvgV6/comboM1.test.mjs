import test from 'node:test';
import assert from 'node:assert/strict';
import { replayBuy } from './comboM1.mjs';
const mk = (rows) => ({ ms: Float64Array.from(rows.map((_, i) => i * 60000)), h: Float64Array.from(rows.map((r) => r[0])), l: Float64Array.from(rows.map((r) => r[1])), c: Float64Array.from(rows.map((r) => r[2] ?? r[1])) });
const O = { entry: 100, stop: 95, tp: 115, risk: 5, startMs: 0, limitMs: Infinity };
test('TP touché avant le stop dans la même bougie M15 : M1 donne +3R (le M15 pessimiste aurait donné -1R)', () => {
  const m1 = mk([[103, 99.4], [116, 100], [101, 94]]); // minute 0 : remplissage ; minute 1 : TP ; minute 2 : stop (trop tard)
  const r = replayBuy(O, m1, 0.5); assert.equal(r.why, 'tp'); assert.equal(r.r, 3);
});
test('stop touché dès la minute de remplissage : -1R', () => {
  const r = replayBuy(O, mk([[103, 94]]), 0.5); assert.equal(r.r, -1); assert.equal(r.why, 'stop');
});
test('TP touché avant le remplissage : ordre annulé', () => {
  const r = replayBuy(O, mk([[116, 105], [110, 99]]), 0.5); assert.equal(r.status, 'annule'); assert.equal(r.why, 'tp_avant_fill');
});
test('pas de remplissage si low + spread > entry', () => {
  const r = replayBuy(O, mk([[103, 99.8], [103, 99.8]]), 0.5); assert.notEqual(r.status, 'ok');
});
test('sortie au temps : fermeture de la dernière minute avant limitMs', () => {
  const m1 = mk([[103, 99.4, 99.4], [104, 100, 103], [104, 100, 104], [104, 100, 102]]);
  const r = replayBuy({ ...O, limitMs: 3 * 60000 }, m1, 0.5); assert.equal(r.why, 'temps'); assert.equal(r.r, (104 - 100) / 5);
});
