import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest } from './lib/krysBacktestD.js';
import { depthScan, widthRatio, terciles, judgeENT0, runYearAHRaw } from './comboAH_entree_bord.mjs';

// Série synthétique des autres tests : 100 bougies plates (89-91) puis FVG de vente [115,120] (cible), FVG d'achat [102,104] (zone) validé à F+7.
// Ordre à 50 % : entrée 103, stop 97,5, TP 119,5. Ordre au bord : entrée 104, stop 97,5, risque 6,5, TP = max(117,5 ; 104 + 19,5) = 123,5.
const F = 100, T0 = 1.4e9;
const bar = (o, h, l, c) => ({ o, h, l, c, t: 0, raw: 0 });
const base = () => {
  const x = Array.from({ length: F }, () => bar(90, 91, 89, 90));
  x.push(bar(122, 125, 120, 122), bar(121, 122, 113, 114), bar(114, 115, 110, 112), bar(112, 113, 100, 101), bar(100, 102, 98, 101), bar(101, 108, 101, 107), bar(107, 109, 104, 108), bar(108, 110, 106, 109));
  return x;
};
const withT = (x) => x.map((k, i) => ({ ...k, t: T0 + i * 900, raw: (T0 + i * 900) * 1000 }));
const O = { spread: 0, stopMargin: 0.5, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 0, hourTo: 24, buyOnly: true, filter: ({ z }) => z.dir > 0 && z.created === F + 6 };

test('entryFraction 0 : ordre limite au bord proche, TP en 3 R depuis la nouvelle entrée', () => {
  const x = [...base(), bar(108, 108, 103.5, 107), bar(107, 130, 106, 125)]; // F+8 touche 104 (pas 103) ; F+9 atteint 123,5
  const e0 = backtest(withT(x), { ...O, entryFraction: 0 }).trades, e5 = backtest(withT(x), { ...O, entryFraction: 0.5 }).trades;
  assert.equal(e0.length, 1); assert.equal(e0[0].entry, 104); assert.equal(e0[0].stop, 97.5); assert.equal(e0[0].tp, 123.5); assert.equal(e0[0].why, 'tp');
  assert.equal(e5.length, 0); // le prix n'a jamais atteint 103 : pas de trade à 50 %, l'ordre est annulé au TP
});

test('depthScan : profondeur maximale avant le TP ; null si le bord proche n\'est jamais touché', () => {
  const od = { m: 0, near: 104, far: 102, stop: 97.5, tp: 119.5 };
  const c = withT([bar(0, 0, 0, 0), bar(108, 108, 103, 107), bar(107, 120, 106, 119)]); // plus bas 103 : moitié de la zone ; puis TP
  assert.deepEqual(depthScan(c, od, 0), { depth: 0.5, end: 'tp' });
  const c2 = withT([bar(0, 0, 0, 0), bar(108, 108, 105, 107), bar(107, 120, 106, 119)]);
  assert.deepEqual(depthScan(c2, od, 0), { depth: null, end: 'tp' });
});

test('depthScan : plafonné à 1, fin au stop ; le spread décale le plus bas effectif ; fin à la sortie de plage horaire', () => {
  const od = { m: 0, near: 104, far: 102, stop: 97.5, tp: 119.5 };
  assert.deepEqual(depthScan(withT([bar(0, 0, 0, 0), bar(108, 108, 95, 96)]), od, 0), { depth: 1, end: 'stop' });
  assert.equal(depthScan(withT([bar(0, 0, 0, 0), bar(108, 108, 103.5, 107), bar(107, 120, 106, 119)]), od, 1).depth, null); // 103,5 + 1 > 104
  const tt = (i) => Date.UTC(2014, 4, 13, 20, 45) / 1000 + i * 900; // F+0 à 15:45 NY, F+1 à 16:00 : hors plage
  const cc = [bar(0, 0, 0, 0), bar(108, 108, 103, 107)].map((k, i) => ({ ...k, t: tt(i), raw: tt(i) * 1000 }));
  assert.deepEqual(depthScan(cc, od, 0, 6, 16), { depth: null, end: 'heure' });
});

test('widthRatio et terciles', () => {
  const c = Array.from({ length: 120 }, () => bar(1, 3, 1, 2)); // amplitude 2
  assert.equal(widthRatio(c, { m: 100, width: 4 }), 2); assert.equal(widthRatio(c, { m: 50, width: 4 }), null);
  assert.deepEqual(terciles([1, 2, 3, 4, 5, 6, 7, 8, 9]), [4, 7]);
});

test('judgeENT0 : critères sur des séries simples', () => {
  const mk = (rs2) => rs2.map((r, i) => ({ key: `k${i}`, r, why: r > 0 ? 'tp' : 'stop' }));
  const ctrl = { 2011: { trades: mk([1, -1, -1, 1]) }, 2017: { trades: mk([1, -1]) } };
  const vari = { 2011: { trades: mk([2, 2, -1, 2, 2, 2, 2, 2, 2, 2, 2, 2]) }, 2017: { trades: mk([2, 2, -1, 2, 2, 2, 2, 2, 2, 2]) } };
  const j = judgeENT0(ctrl, vari, 1.5);
  assert.equal(j.c.total, true); assert.equal(j.c.mean, true); assert.equal(j.c.halves, true); assert.equal(j.c.rate, true);
  assert.equal(judgeENT0(ctrl, vari, 0.5).c.rate, false);
  assert.equal(judgeENT0(ctrl, { 2011: { trades: mk([-1, -1]) }, 2017: { trades: mk([1]) } }, 2).pass, false);
});

test('série trop courte : null', () => {
  const c = Array.from({ length: 50 }, (_, i) => ({ t: 1.2e9 + i * 900, raw: Date.UTC(2015, 0, 1) + i * 900000, o: 1, h: 2, l: 0.5, c: 1.5 }));
  assert.equal(runYearAHRaw(c, 2015, 'ent0'), null);
});
