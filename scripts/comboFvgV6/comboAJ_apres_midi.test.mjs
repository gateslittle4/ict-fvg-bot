import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { runYearAPRaw, runYearAP, tier } from './comboAJ_apres_midi.mjs';
import { nyHour } from './lib/krysMethod.js';

const all = loadAll();
const j = (c, tw, pass) => ({ c, tw, pass });

test('identité : hourFrom 6 reproduit F2C de comboT (clés et R identiques)', () => {
  for (const Y of [2013, 2019]) {
    const a = runYearAP(all, Y, 6), b = runYearT(all, Y, {});
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) { assert.equal(a[i].key, b[i].key); assert.equal(a[i].r, b[i].r); }
  }
});
test('données réelles : tout ordre AP1 est posé de 12 h à 16 h NY, et AP1 a moins de trades que F2C', () => {
  for (const Y of [2015, 2021]) {
    const { c, T } = runYearAPRaw(all, Y, 12), base = runYearT(all, Y, {});
    assert.ok(T.length > 0 && T.length < base.length, `${Y} ${T.length}/${base.length}`);
    for (const t of T) { const h = nyHour(c[t.placedIdx].t); assert.ok(h >= 12 && h < 16, `${Y} pose à ${h} h`); }
  }
});
test('tier : cinq critères = validée', () => {
  assert.equal(tier(j({ gain: true, t: true, halves: true, dd: true, rate: true }, 2.5, true)), 'validée');
});
test('tier : seul le Welch manque, valeur 1,06 = prometteuse ; 0,99 = rejetée', () => {
  const c = { gain: true, t: false, halves: true, dd: true, rate: true };
  assert.equal(tier(j(c, 1.06, false)), 'prometteuse');
  assert.equal(tier(j(c, 0.99, false)), 'rejetée');
});
test('tier : un autre critère manque (rythme) = rejetée même avec Welch élevé', () => {
  assert.equal(tier(j({ gain: true, t: false, halves: true, dd: true, rate: false }, 1.9, false)), 'rejetée');
  assert.equal(tier(j({ gain: true, t: true, halves: false, dd: true, rate: true }, 2.5, false)), 'rejetée');
});
