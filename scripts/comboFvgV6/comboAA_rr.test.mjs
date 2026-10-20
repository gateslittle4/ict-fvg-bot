import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { runYearRR, runYearRRRaw } from './comboAA_rr.mjs';

const all = loadAll();
test('identité : plancher de 3 R = F2C de comboT', () => { for (const Y of [2013, 2019]) { const a = runYearRR(all, Y, 3), b = runYearT(all, Y, {}); assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) { assert.equal(a[i].key, b[i].key); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); } } });
test('plancher de 5 R et de 6 R : RR visé ≥ plancher ; un TP touché rapporte au moins le plancher moins le spread ; sorties au temps entre −1 et le RR visé', () => {
  for (const minRR of [5, 6]) for (const Y of [2014, 2020]) {
    const { T } = runYearRRRaw(all, Y, minRR); assert.ok(T.length > 40);
    for (const t of T) {
      const rr = (t.tp - t.entry) / t.risk; assert.ok(rr >= minRR - 1e-9, `RR visé ${rr}`);
      if (t.why === 'tp') assert.ok(Math.abs(t.r - rr) < 1e-9);
      if (t.why === 'stop') assert.ok(Math.abs(t.r + 1) < 1e-9);
      assert.ok(t.r >= -1 - 1e-9 && t.r <= rr + 1e-9);
    }
  }
});
test('un plancher plus haut change peu le nombre de trades (moins d\'ordres annulés par un TP touché avant le remplissage, mais des positions plus longues qui en bloquent d\'autres)', () => { for (const Y of [2014, 2020]) { const n3 = runYearRR(all, Y, 3).length, n5 = runYearRR(all, Y, 5).length, n6 = runYearRR(all, Y, 6).length; assert.ok(n5 >= n3 * 0.8 && n5 <= n3 * 1.2 && n6 >= n3 * 0.8 && n6 <= n3 * 1.2, `${n3} ${n5} ${n6}`); } });
