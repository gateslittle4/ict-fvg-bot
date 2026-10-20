import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { firstOfDay, runYearSellRaw, runYearPS1, nyDate } from './comboW_premier.mjs';

const day = (i) => `d${Math.floor(i / 100)}`; // 100 bougies par « jour » synthétique
const T = (fillIdx) => ({ fillIdx, r: 1 });

test('firstOfDay : plusieurs achats remplis à la même bougie : seul le premier posé est retenu', () => { const a = { fillIdx: 10, placedIdx: 8, zCreated: 5, r: 1 }, b = { fillIdx: 10, placedIdx: 7, zCreated: 6, r: 1 }, c = { fillIdx: 10, placedIdx: 7, zCreated: 4, r: 1 }; const r = firstOfDay([a, b, c], [], day); assert.deepEqual(r.kept, [c]); assert.equal(r.removed.length, 2); });
test('firstOfDay : un seul achat par jour, le plus tôt', () => { const r = firstOfDay([T(10), T(30), T(150)], [], day); assert.deepEqual(r.kept.map((t) => t.fillIdx), [10, 150]); assert.deepEqual(r.removed.map((x) => [x.t.fillIdx, x.by]), [[30, 'achat']]); });
test('firstOfDay : une vente plus tôt retire tous les achats du jour ; égalité : achat retiré ; vente plus tard : achat gardé', () => {
  let r = firstOfDay([T(40), T(60)], [T(20)], day); assert.equal(r.kept.length, 0); assert.deepEqual(r.removed.map((x) => x.by), ['vente', 'achat']);
  r = firstOfDay([T(40)], [T(40)], day); assert.equal(r.kept.length, 0);
  r = firstOfDay([T(40)], [T(70)], day); assert.equal(r.kept.length, 1);
  r = firstOfDay([T(40)], [T(5)], (i) => (i === 5 ? 'autre' : 'même')); assert.equal(r.kept.length, 1); // vente un autre jour : sans effet
});

const all = loadAll();
test('données réelles 2014 et 2019 : F2C identique à comboT, PS1 ⊆ F2C et strictement plus petit, clés uniques, ventes toutes dir < 0', () => {
  for (const Y of [2014, 2019]) {
    const r = runYearPS1(all, Y), c = runYearT(all, Y, {}); assert.deepEqual(r.ctrl.map((t) => t.key), c.map((t) => t.key));
    const ck = new Set(r.ctrl.map((t) => t.key)); for (const t of r.vari) assert.ok(ck.has(t.key));
    assert.ok(r.vari.length > 0 && r.vari.length < r.ctrl.length, `PS1 ${r.vari.length} / F2C ${r.ctrl.length}`);
    const sell = runYearSellRaw(all, Y); assert.ok(sell.T.length > 20 && sell.T.every((t) => t.dir < 0));
    const byDay = new Map(); for (const t of r.vari) { const k = t.key; byDay.set(k, 1); } assert.equal(byDay.size, r.vari.length);
  }
});
test('données réelles : contrôle brute-force du premier remplissage sur 2016', () => {
  const Y = 2016, r = runYearPS1(all, Y), sell = runYearSellRaw(all, Y), c = sell.c;
  // trades d'achat bruts : on les retrouve via firstOfDay inversé n'étant pas exposés, on recalcule avec runYearTRaw
  return import('./comboT.mjs').then(({ runYearTRaw }) => {
    const b = runYearTRaw(all, Y, {}), dk = (i) => nyDate(c[i].t), kept = new Set(r.vari.map((t) => t.key));
    for (const t of b.T) {
      const k = `${Y}:${t.placedIdx}:${t.zCreated}`, d = dk(t.fillIdx);
      const lt = (u) => u.fillIdx < t.fillIdx || (u.fillIdx === t.fillIdx && (u.placedIdx < t.placedIdx || (u.placedIdx === t.placedIdx && u.zCreated < t.zCreated)));
      const earlier = b.T.some((u) => u !== t && dk(u.fillIdx) === d && lt(u)) || sell.T.some((u) => dk(u.fillIdx) === d && u.fillIdx <= t.fillIdx);
      assert.equal(kept.has(k), !earlier, `${k}`);
    }
  });
});
