import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearA } from './comboO.mjs';
import { runYearQ } from './comboQ.mjs';
import { runYearR, tOne } from './comboR.mjs';

const all = loadAll();
const same = (a, b) => { assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) { assert.equal(a[i].key.split(':').slice(0, 2).join(':'), b[i].key.split(':').slice(0, 2).join(':')); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); } };

test('identité : moteur accéléré = ancien moteur (F2, tranches anciennes)', () => { for (const Y of [2013, 2019]) same(runYearR(all, Y, {}, 'old'), runYearA(all, Y, null)); });
test('identité : cible limitée à 30 jours (tranches anciennes)', () => { same(runYearR(all, 2016, { cap: 30 }, 'old'), runYearA(all, 2016, 30)); });
test('identité : règle du lundi (tranches anciennes)', () => { for (const Y of [2012, 2018]) same(runYearR(all, Y, { monday: true }, 'old'), runYearQ(all, Y, true)); });
test('série continue : aucune cible plus vieille que la limite ; F2C a toujours une cible', () => {
  const Y = 2015, c30 = runYearR(all, Y, { cap: 30 }, 'full'), ctrl = runYearR(all, Y, {}, 'full');
  assert.ok(c30.every((t) => t.added || t.age <= 30 + 1e-9));
  assert.ok(ctrl.length > 0 && ctrl.every((t) => t.age != null));
});
test('tOne dégénéré', () => { assert.equal(tOne([1]), 0); assert.equal(tOne([2, 2, 2]), 0); });
