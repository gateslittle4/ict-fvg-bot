import test from 'node:test';
import assert from 'node:assert/strict';
import { carryOk } from './comboJ.mjs';
const bar = (i, h = 101, l = 99) => ({ t: i * 900 + 5 * 3600, o: 100, h, l, c: 100 }); // i = quart d'heure depuis minuit NY du jour 0 ; jour = floor(i/96)
const day = (d, hr) => d * 96 + hr * 4;
function series(over) { const c = []; for (let i = 0; i < 14 * 96; i++) c.push(bar(i, ...(over[i] || [101, 99]))); return c; }
test('balayage le soir (hors plage) : valable le lendemain, pas le surlendemain, pas le jour même', () => {
  const s = day(10, 20), c = series({ [s]: [100, 98] }), ok = carryOk(c, 6);
  assert.equal(ok[s + 4], 0);               // même jour
  assert.equal(ok[day(11, 4)], 1);          // lendemain 04:00 (c3 avant la plage)
  assert.equal(ok[day(11, 15)], 1);
  assert.equal(ok[day(12, 4)], 0);          // surlendemain
});
test('FVG d\'achat formé le jour du balayage dans la plage horaire : pas de report', () => {
  const s = day(10, 8), g = day(10, 11); // FVG d'achat : c3 à 11:00 (c1.high 101 < c3.low 103)
  const c = series({ [s]: [100, 98], [g]: [105, 103], [g - 1]: [104, 102] }), ok = carryOk(c, 6);
  assert.equal(ok[day(11, 4)], 0);
});
test('FVG d\'achat le jour du balayage mais hors plage (après 16:00) : le report reste valable', () => {
  const s = day(10, 8), g = day(10, 18);
  const c = series({ [s]: [100, 98], [g]: [105, 103], [g - 1]: [104, 102] }), ok = carryOk(c, 6);
  assert.equal(ok[day(11, 4)], 1);
});
