import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { fvgRank, runYearABRaw, runYearAB } from './comboAB_premier_fvg.mjs';
import { h4Sweeps } from './lib/krysBacktest.js';

// Jeu synthétique : 8 barres H4 plates (creux 100) puis un balayage, puis deux FVG d'achat dans le même épisode, puis un 2e balayage et un nouveau FVG.
const NY5 = 5 * 3600, day0 = Date.UTC(2020, 0, 6) / 1000;
let idx = 0; const mk = (o, h, l, cl) => ({ t: day0 + NY5 + 900 * idx++, o, h, l, c: cl, raw: 0 });
test('fvgRank : premier, deuxième FVG de l\'épisode ; nouvel épisode après un nouveau balayage ; sans balayage = 0', () => {
  idx = 0; const c = [];
  for (let i = 0; i < 6 * 16 + 4; i++) c.push(mk(110, 112, 100 + (i % 3) * 0.1, 111)); // ~6 barres H4 + un peu, creux ~100
  const sw = h4Sweeps(c, 6); assert.ok(sw.lastLow.every((x) => x === -1), 'aucun balayage encore');
  // balayage : bougie qui passe sous 100
  c.push(mk(105, 106, 98, 99)); const li1 = c.length - 1;
  // FVG d'achat 1 : c1 = h 101, c3 low 103 (c2 entre)
  c.push(mk(99, 101, 98.5, 100.5)); c.push(mk(101, 108, 100.8, 107)); c.push(mk(107, 110, 103, 109)); const z1 = c.length - 1; // c[z1-2].h = 101 < c[z1].l = 103
  // FVG d'achat 2 : c1 h 110, c3 low 112
  c.push(mk(109, 110, 108, 109.5)); c.push(mk(110, 116, 109.5, 115)); const z2 = c.length - 1; c.push(mk(115, 118, 112, 117)); const z2b = c.length - 1;
  const r = fvgRank(c);
  const sw2 = h4Sweeps(c, 6); assert.ok(sw2.lastLow[z1] >= 0);
  assert.equal(r[z1], 1); assert.equal(r[z2b], 2);
  assert.equal(r[0], 0); assert.equal(r[5], 0);
});
const all = loadAll();
test('identité : mode old = F2C de comboT', () => { for (const Y of [2013, 2019]) { const a = runYearAB(all, Y, 'old'), b = runYearT(all, Y, {}); assert.equal(a.length, b.length); for (let i = 0; i < a.length; i++) { assert.equal(a[i].key, b[i].key); assert.ok(Math.abs(a[i].r - b[i].r) < 1e-12); } } });
test('données réelles : chaque trade FB1 est le premier FVG de son épisode (vérification indépendante), moins fourni que F2C', () => {
  for (const Y of [2015, 2021]) {
    const { c, T } = runYearABRaw(all, Y, 'fb1'), base = runYearT(all, Y, {}), { lastLow } = h4Sweeps(c, 6);
    assert.ok(T.length > 0 && T.length < base.length * 1.15, `${Y} ${T.length}/${base.length}`);
    for (const t of T) {
      const z = t.zCreated, li = lastLow[z]; assert.ok(li >= 0 && z - li <= 32);
      for (let m = Math.max(2, li); m < z; m++) if (c[m - 2].h < c[m].l) assert.notEqual(lastLow[m], li, `${Y} z${z} : FVG antérieur ${m} dans le même épisode`);
    }
  }
});
