import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearR } from './comboR.mjs';
import { runYearT, runYearTRaw, sOf } from './comboT.mjs';

const all = loadAll();
const same = (a, b) => { assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) { assert.equal(a[i].key, b[i].key); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); } };

test('identité : sans option, comboT = F2C de comboR', () => { for (const Y of [2013, 2019]) same(runYearT(all, Y, {}), runYearR(all, Y, {}, 'full')); });
test('identité : seuils inactifs (S >= 0, breakeven à 1000 R)', () => { same(runYearT(all, 2016, { sMin: 0 }), runYearT(all, 2016, {})); same(runYearT(all, 2016, { beR: 1000 }), runYearT(all, 2016, {})); });
test('H1 : un seuil énorme supprime tous les ordres ; sOf', () => {
  assert.equal(runYearT(all, 2016, { sMin: 1e9 }).length, 0);
  const ps = new Float64Array(201); for (let i = 0; i < 200; i++) ps[i + 1] = ps[i] + 4; assert.ok(Math.abs(sOf(ps, 150, 8) - 2) < 1e-9); assert.equal(sOf(ps, 50, 8), Infinity);
});
test('H2 : sorties au breakeven à 0 R, déclenchement après la bougie de remplissage, pas dans la même bougie', () => {
  let nBe = 0;
  for (const Y of [2014, 2018]) {
    const { c, T } = runYearTRaw(all, Y, { beR: 1 });
    for (const t of T) {
      if (t.why === 'be') { nBe++; assert.ok(Math.abs(t.r) < 1e-12); let m1 = -1; for (let m = t.fillIdx + 1; m <= t.exitIdx; m++) if (c[m].h >= t.entry + t.risk) { m1 = m; break; } assert.ok(m1 > t.fillIdx && t.exitIdx > m1, 'sortie au BE strictement après la bougie de déclenchement'); }
      if (t.why === 'stop') assert.ok(!t.be && Math.abs(t.r + 1) < 1e-9);
    }
  }
  assert.ok(nBe > 0);
});
