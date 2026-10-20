import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest } from './lib/krysBacktestD.js';
import { runYearAGRaw } from './comboAG_reentree_confirmation.mjs';

// Même série synthétique que comboAF_reentree.test.mjs : ordre à 103, stop d'origine 97,5, TP 119,5 ; rempli à F+8 ; le stop est pris à F+9.
const F = 100, T0 = 1.4e9;
const bar = (o, h, l, c) => ({ o, h, l, c, t: 0, raw: 0 });
const base = () => {
  const x = Array.from({ length: F }, () => bar(90, 91, 89, 90));
  x.push(bar(122, 125, 120, 122), bar(121, 122, 113, 114), bar(114, 115, 110, 112), bar(112, 113, 100, 101), bar(100, 102, 98, 101), bar(101, 108, 101, 107), bar(107, 109, 104, 108), bar(108, 110, 106, 109), bar(108, 108, 102.5, 107));
  return x;
};
const withT = (x) => x.map((k, i) => ({ ...k, t: T0 + i * 900, raw: (T0 + i * 900) * 1000 }));
const O = { spread: 0, stopMargin: 0.5, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 0, hourTo: 24, entryFraction: 0.5, buyOnly: true, filter: ({ z }) => z.dir > 0 && z.created === F + 6 };
const run = (x, reentry, extra = {}) => { const ev = []; const t = backtest(withT(x), { ...O, ...extra, reentry, onReentry: (e) => ev.push(e.kind) }).trades; return { t, ev }; };
const R = { bigMult: 2, wait: 8 };
const S = bar(100, 100, 96, 98); // F+9 : stop pris (97,5), clôture 98 > 97,5 : confirmation immédiate à S, corps 2 (< 2 x ~2,5)

test('confirmation sur la bougie du stop elle-même (mèche rejetée) : entrée à l\'ouverture suivante, stop sous le plus bas', () => {
  const { t, ev } = run([...base(), S, bar(99, 101, 97, 100), bar(100, 120, 99, 119)], R);
  assert.equal(t.length, 2); assert.equal(t[1].reentry, true); assert.equal(t[1].fillIdx, F + 10);
  assert.equal(t[1].entry, 99); assert.equal(t[1].stop, 95.5); assert.equal(t[1].tp, t[0].tp); assert.equal(t[1].why, 'tp'); assert.equal(t[1].delay, 0);
  assert.deepEqual(ev, ['armed', 'confirmed', 'taken']);
});

test('pas de confirmation tout de suite : on attend, le stop tient compte du plus bas de toute la fenêtre', () => {
  // S clôture à 96,5 (< 97,5) ; F+10 clôture 96 ; F+11 clôture 99 (> 97,5) = confirmation ; entrée à l'ouverture de F+12 (100) ; stop = min low (S: 95, F+10: 94) - 0,5 = 93,5
  const x = [...base(), bar(100, 100, 95, 96.5), bar(96.5, 97, 94, 96), bar(96, 99.5, 95.5, 99), bar(100, 120, 99, 119), bar(119, 121, 118, 120)]; // la dernière bougie permet la sortie au TP (jamais vérifié dans la bougie d'entrée)
  const { t, ev } = run(x, R);
  assert.equal(t.length, 2); assert.equal(t[1].why, 'tp'); assert.equal(t[1].fillIdx, F + 12); assert.equal(t[1].entry, 100); assert.equal(t[1].stop, 93.5); assert.equal(t[1].delay, 2);
  assert.deepEqual(ev, ['armed', 'confirmed', 'taken']);
});

test('grande bougie baissière dans la fenêtre : annulation, même si une bougie suivante confirme', () => {
  const x = [...base(), bar(100, 100, 95, 96.5), bar(96.5, 96.5, 88, 88.5), bar(88.5, 99.5, 88, 99), bar(100, 120, 99, 119)]; // F+10 : corps 8 >= 2 x moyenne
  const { t, ev } = run(x, R);
  assert.equal(t.length, 1); assert.deepEqual(ev, ['armed', 'big']);
});

test('fenêtre de 8 bougies sans confirmation : expirée', () => {
  const x = [...base(), bar(100, 100, 95, 96.5), ...Array.from({ length: 8 }, () => bar(96, 97, 95, 96)), bar(100, 120, 99, 119)];
  const { t, ev } = run(x, R);
  assert.equal(t.length, 1); assert.deepEqual(ev, ['armed', 'expired']);
});

test('confirmation à la 8e bougie (dernière de la fenêtre) acceptée, à la 9e refusée', () => {
  const mk = (n) => [...base(), bar(100, 100, 95, 96.5), ...Array.from({ length: n }, () => bar(96, 97, 95, 96)), bar(96, 99.5, 95.5, 99), bar(100, 100.5, 99, 100)];
  assert.equal(run(mk(6), R).ev.includes('confirmed'), true); // S + 6 bougies plates + confirmation = 8e bougie (S comprise)
  assert.equal(run(mk(7), R).ev.includes('confirmed'), false); // 9e bougie : fenêtre expirée avant
});

test('une seule réentrée : son stop ne réarme rien', () => {
  const { t, ev } = run([...base(), S, bar(99, 101, 97, 100), bar(100, 100, 95, 96), bar(96, 97, 90, 92), bar(92, 99, 90, 98)], R);
  assert.equal(t.length, 2); assert.equal(t[1].why, 'stop'); assert.equal(ev.filter((e) => e === 'armed').length, 1);
});

test('position déjà ouverte à l\'entrée : pas de réentrée', () => {
  // un second trade d'origine ne peut pas exister ici ; on simule en refusant par la plage horaire (hourTo = 16 et bougies à 16:00)
  const x = [...base(), S, bar(99, 101, 97, 100), bar(100, 120, 99, 119)];
  const tStop = Date.UTC(2014, 4, 13, 20, 45) / 1000, tt = (i) => tStop - (F + 9) * 900 + i * 900;
  const xs = x.map((k, i) => ({ ...k, t: tt(i), raw: tt(i) * 1000 }));
  assert.equal(backtest(xs, { ...O, hourFrom: 6, hourTo: 16, reentry: R }).trades.length, 1);
  assert.equal(backtest(xs, { ...O, hourFrom: 6, hourTo: 17, reentry: R }).trades.length, 2);
});

test('sans l\'option : identique (un trade) ; avec option immédiate (sans wait) : le mode REE est inchangé', () => {
  const x = [...base(), S, bar(99, 101, 97, 100), bar(100, 120, 99, 119)];
  assert.equal(backtest(withT(x), O).trades.length, 1);
  assert.equal(backtest(withT(x), { ...O, reentry: { bigMult: 2 } }).trades.length, 2);
});

test('série trop courte : null', () => {
  const c = Array.from({ length: 50 }, (_, i) => ({ t: 1.2e9 + i * 900, raw: Date.UTC(2015, 0, 1) + i * 900000, o: 1, h: 2, l: 0.5, c: 1.5 }));
  assert.equal(runYearAGRaw(c, 2015, 'conf'), null);
});
