import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { directionFilter, runYearXRaw, runYearX, VARS, nyDate } from './comboX_direction.mjs';
import { nyHour } from './lib/krysMethod.js';

// Jour synthétique : t = secondes ; nyHour(t) = (t - NY) ... on passe par un jeu où t = 5 h de décalage + heure NY (hiver) : heure NY = (t - 5 h) / 3600 mod 24, comme dans nyHour/nyDate.
const NY5 = 5 * 3600, mk = (day0, h, o, cl) => ({ t: day0 + NY5 + h * 3600, o, h: Math.max(o, cl), l: Math.min(o, cl), c: cl, raw: 0 });
test('nyHour et nyDate cohérents avec le jeu synthétique', () => { const d = Date.UTC(2020, 0, 6) / 1000, k = mk(d, 9.5, 1, 2); assert.equal(nyHour(k.t), 9.5); assert.equal(nyDate(k.t), '2020-01-06'); });
test('D930 : avant 09:30 gardé ; à partir de 09:30 clôture > ouverture 09:30 strictement ; égalité refusée ; bougie 09:30 absente : première bougie après', () => {
  const d = Date.UTC(2020, 0, 6) / 1000, c = [mk(d, 6, 10, 11), mk(d, 9.25, 12, 9), mk(d, 9.5, 10, 10.5), mk(d, 9.75, 10.5, 10.0), mk(d, 10, 10, 10.1), mk(d, 10.25, 10.1, 10)];
  const f = directionFilter(c, VARS.D930);
  assert.equal(f(0), true); assert.equal(f(1), true); // avant 9 h 30 : gardés
  assert.equal(f(2), true);  // bougie de référence : clôture 10,5 > ouverture 10
  assert.equal(f(3), false); // clôture 10,0 = ouverture 10 : refusé (strict)
  assert.equal(f(4), true);  // 10,1 > 10
  assert.equal(f(5), false); // 10 = 10 : refusé
  const c2 = [mk(d, 9.25, 12, 13), mk(d, 9.75, 10, 10.4), mk(d, 10, 10.4, 10.2)]; const g = directionFilter(c2, VARS.D930); // pas de bougie à 9 h 30 : la première à partir de 9 h 30 est 9 h 45
  assert.equal(g(1), true);  // référence = 9 h 45 (ouverture 10) ; sa clôture 10,4 > 10
  assert.equal(g(2), true);  // 10,2 > 10
  const c3 = [mk(d, 9.75, 10, 10.4), mk(d, 10, 10.4, 9.9)]; assert.equal(directionFilter(c3, VARS.D930)(1), false); // 9,9 < 10
});
test('D06 : tous les ordres sont filtrés, y compris la bougie de 06:00 elle-même ; jour suivant indépendant', () => {
  const d = Date.UTC(2020, 0, 6) / 1000, d2 = Date.UTC(2020, 0, 7) / 1000;
  const c = [mk(d, 6, 10, 9), mk(d, 7, 9, 10.5), mk(d, 8, 10.5, 9.9), mk(d2, 6, 20, 21), mk(d2, 7, 21, 19)];
  const f = directionFilter(c, VARS.D06);
  assert.equal(f(0), false); // 9 < 10 (sa propre ouverture)
  assert.equal(f(1), true);  // 10,5 > 10
  assert.equal(f(2), false); // 9,9 < 10
  assert.equal(f(3), true); assert.equal(f(4), false); // 19 < 20 : référence du 2e jour = 20, pas celle du 1er
});

const all = loadAll();
test('identité : sans filtre, comboX = F2C de comboT', () => { for (const Y of [2013, 2019]) { const a = runYearX(all, Y, {}), b = runYearT(all, Y, {}); assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) { assert.equal(a[i].key, b[i].key); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); } } });
test('données réelles : chaque ordre d\'une variante respecte la règle (vérification indépendante) ; la variante est moins fournie que F2C', () => {
  for (const nm of ['D930', 'D06']) for (const Y of [2015, 2021]) {
    const { c, T } = runYearXRaw(all, Y, VARS[nm]), spec = VARS[nm], base = runYearT(all, Y, {});
    assert.ok(T.length > 0 && T.length < base.length * 1.15, `${nm} ${Y} ${T.length}/${base.length}`);
    for (const t of T) {
      const m = t.placedIdx, d = nyDate(c[m].t); if (nyHour(c[m].t) < spec.fromHour) continue;
      let r = -1; for (let i = m; i >= 0 && nyDate(c[i].t) === d; i--) if (nyHour(c[i].t) >= spec.refHour) r = i; // la plus ancienne bougie du jour à partir de refHour
      assert.ok(r >= 0 && r <= m && c[m].c > c[r].o, `${nm} ${Y} ${m}`);
    }
  }
});
