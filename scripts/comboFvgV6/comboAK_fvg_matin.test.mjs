import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { nyHour } from './lib/krysMethod.js';
import { runYearFMRaw, formedInWindow, judgeFM, FORM_FROM, FORM_TO } from './comboAK_fvg_matin.mjs';

const all = loadAll();
const NY5 = 5 * 3600, day0 = Date.UTC(2020, 0, 6) / 1000; // lundi 6 janvier 2020 00:00 UTC ; t' - 5 h = heure NY
const cAt = (hNY) => [{ t: day0 + NY5 + hNY * 3600, o: 1, h: 2, l: 0, c: 1, raw: 0 }];
const fz = (c, i = 0) => formedInWindow(c)({ z: { created: i } });
const S = (avgR, t, dd) => ({ avgR, t, dd });

test('formedInWindow : 4 h 00 incluse, 6 h 45 incluse, 7 h 00 exclue, 3 h 45 exclue', () => {
  assert.equal(fz(cAt(4)), true);
  assert.equal(fz(cAt(6.75)), true);
  assert.equal(fz(cAt(7)), false);
  assert.equal(fz(cAt(3.75)), false);
  assert.equal(fz(cAt(12)), false);
});
test('données réelles : chaque trade FM1 a un c3 formé entre 4 h et 7 h et un remplissage entre 7 h 00 et 9 h 45 (avant 10 h)', () => {
  let nB = 0, nS = 0;
  for (const Y of [2014, 2019, 2024]) {
    const { c, T } = runYearFMRaw(all, Y); assert.ok(T.length > 20, `${Y} : ${T.length} trades`);
    for (const t of T) {
      const hz = nyHour(c[t.zCreated].t), hf = nyHour(c[t.fillIdx].t), hp = nyHour(c[t.placedIdx].t);
      assert.ok(hz >= FORM_FROM && hz < FORM_TO, `${Y} formation ${hz}`);
      assert.ok(hf >= 7 && hf <= 9.75, `${Y} remplissage ${hf}`);
      assert.ok(hp >= 6.75 && hp < 9.75, `${Y} pose ${hp}`);
      if (t.dir > 0) nB++; else nS++;
    }
  }
  assert.ok(nB > 0 && nS > 0, `achats ${nB}, ventes ${nS} : les deux sens doivent apparaître`);
});
test('données réelles : stop et cible du bon côté de l\'entrée (achat : stop < entrée < cible ; vente : l\'inverse)', () => {
  const { T } = runYearFMRaw(all, 2018);
  for (const t of T) { if (t.dir > 0) assert.ok(t.stop < t.entry && t.entry < t.tp); else assert.ok(t.tp < t.entry && t.entry < t.stop); }
});
test('judgeFM : quatre critères = validée', () => {
  const j = judgeFM(S(0.08, 2.5, 20), 0.05, 0.1, 1.4);
  assert.equal(j.tier, 'validée'); assert.equal(j.pass, true);
});
test('judgeFM : seul le t manque (1,5), le reste passe = prometteuse ; t 0,9 = rejetée', () => {
  assert.equal(judgeFM(S(0.08, 1.5, 20), 0.05, 0.1, 1.4).tier, 'prometteuse');
  assert.equal(judgeFM(S(0.08, 0.9, 20), 0.05, 0.1, 1.4).tier, 'rejetée');
});
test('judgeFM : une moitié négative, une baisse trop grande ou un rythme trop bas = rejetée', () => {
  assert.equal(judgeFM(S(0.08, 2.5, 20), -0.01, 0.2, 1.4).tier, 'rejetée');
  assert.equal(judgeFM(S(0.08, 2.5, 40), 0.05, 0.1, 1.4).tier, 'rejetée');
  assert.equal(judgeFM(S(0.08, 2.5, 20), 0.05, 0.1, 0.9).tier, 'rejetée');
});
test('judgeFM : R moyen négatif avec un t élevé en valeur absolue n\'est pas prometteuse', () => {
  assert.equal(judgeFM(S(-0.08, 1.5, 20), 0.05, 0.1, 1.4).tier, 'rejetée');
});
