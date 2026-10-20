import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { nyHour } from './lib/krysMethod.js';
import { utcClock, runYearFM2Raw } from './comboAL_fvg_matin_utc.mjs';

const all = loadAll(), allUtc = utcClock(all);
const utcH = (raw) => { const d = new Date(raw); return d.getUTCHours() + d.getUTCMinutes() / 60; };

test('utcClock : nyHour du moteur renvoie l\'heure UTC, été comme hiver', () => {
  const cases = [Date.UTC(2020, 6, 15, 6, 45), Date.UTC(2020, 0, 15, 6, 45), Date.UTC(2024, 9, 8, 8, 15), Date.UTC(2013, 11, 3, 23, 0)];
  for (const ms of cases) assert.equal(nyHour(utcClock([{ raw: ms, t: 0 }])[0].t), utcH(ms), new Date(ms).toISOString());
});
test('utcClock : ne modifie que t (raw, o, h, l, c intacts) et garde l\'ordre', () => {
  assert.equal(allUtc.length, all.length);
  for (const i of [0, 1000, all.length - 1]) { const a = all[i], b = allUtc[i]; assert.equal(b.raw, a.raw); assert.equal(b.o, a.o); assert.equal(b.h, a.h); assert.equal(b.l, a.l); assert.equal(b.c, a.c); }
});
test('données réelles : tout trade FM2 a son c3 formé entre 4 h et 7 h UTC et son remplissage entre 7 h 00 et 9 h 45 UTC (heure UTC calculée sans le moteur)', () => {
  let nB = 0, nS = 0;
  for (const Y of [2014, 2019, 2024]) {
    const { c, T } = runYearFM2Raw(allUtc, Y); assert.ok(T.length > 20, `${Y} : ${T.length} trades`);
    for (const t of T) {
      const hz = utcH(c[t.zCreated].raw), hf = utcH(c[t.fillIdx].raw);
      assert.ok(hz >= 4 && hz < 7, `${Y} formation ${hz} UTC`);
      assert.ok(hf >= 7 && hf <= 9.75, `${Y} remplissage ${hf} UTC`);
      if (t.dir > 0) nB++; else nS++;
    }
  }
  assert.ok(nB > 0 && nS > 0, `achats ${nB}, ventes ${nS}`);
});
test('données réelles : stop et cible du bon côté de l\'entrée', () => {
  const { T } = runYearFM2Raw(allUtc, 2018);
  for (const t of T) { if (t.dir > 0) assert.ok(t.stop < t.entry && t.entry < t.tp); else assert.ok(t.tp < t.entry && t.entry < t.stop); }
});
