import test from 'node:test';
import assert from 'node:assert/strict';
import { passSell, runYearAERaw } from './comboAE_dailyPD_ventes.mjs';

const swYes = () => true, swNo = () => false;
const sell = { z: { dir: -1 }, m: 3 }, buy = { z: { dir: 1 }, m: 3 };
const st = Int8Array.from([0, 0, 0, -1, 1]);

test('seules les ventes passent le filtre (les achats sont refusés dans les deux modes)', () => {
  assert.equal(passSell(buy, swYes, st, 'ctrl'), false);
  assert.equal(passSell(buy, swYes, st, 'td2s'), false);
  assert.equal(passSell(sell, swYes, st, 'ctrl'), true);
});

test('mode td2s : vente seulement si la daily est baissière à la bougie de pose', () => {
  assert.equal(passSell({ z: { dir: -1 }, m: 3 }, swYes, st, 'td2s'), true); // état -1
  assert.equal(passSell({ z: { dir: -1 }, m: 4 }, swYes, st, 'td2s'), false); // état +1
  assert.equal(passSell({ z: { dir: -1 }, m: 1 }, swYes, st, 'td2s'), false); // neutre
});

test('le balayage H4 reste exigé', () => {
  assert.equal(passSell(sell, swNo, st, 'ctrl'), false);
  assert.equal(passSell(sell, swNo, st, 'td2s'), false);
});

test('série trop courte : null', () => {
  const c = Array.from({ length: 50 }, (_, i) => ({ t: 1.2e9 + i * 900, raw: Date.UTC(2015, 0, 1) + i * 900000, o: 1, h: 2, l: 0.5, c: 1.5 }));
  assert.equal(runYearAERaw(c, 2015, 'td2s'), null);
});
