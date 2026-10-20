import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest } from './lib/krysBacktestD.js';
import { backtest as backtestC } from './lib/krysBacktestC.js';
import { judgeREE, runYearAFRaw } from './comboAF_reentree.mjs';

// Série synthétique : 100 bougies plates (89-91, amplitude 2) puis une structure d'indices F..F+8 :
// FVG de vente [115,120] (cible), FVG d'achat [102,104] (zone), ordre limite à 103, stop 97,5, TP 119,5 ; rempli à F+8.
const F = 100, T0 = 1.4e9;
const bar = (o, h, l, c) => ({ o, h, l, c, t: 0, raw: 0 });
const base = () => {
  const x = Array.from({ length: F }, () => bar(90, 91, 89, 90));
  x.push(bar(122, 125, 120, 122));   // F   : a
  x.push(bar(121, 122, 113, 114));   // F+1
  x.push(bar(114, 115, 110, 112));   // F+2 : FVG de vente [115,120]
  x.push(bar(112, 113, 100, 101));   // F+3
  x.push(bar(100, 102, 98, 101));    // F+4 : c1 de la zone d'achat (stop = 98 - 0,5)
  x.push(bar(101, 108, 101, 107));   // F+5
  x.push(bar(107, 109, 104, 108));   // F+6 : c3, FVG d'achat [102,104]
  x.push(bar(108, 110, 106, 109));   // F+7 : c4 (ne touche pas) -> zone valide, ordre posé à 103
  x.push(bar(108, 108, 102.5, 107)); // F+8 : rempli à 103
  return x;
};
const withT = (x) => x.map((k, i) => ({ ...k, t: T0 + i * 900, raw: (T0 + i * 900) * 1000 }));
const O = { spread: 0, stopMargin: 0.5, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 0, hourTo: 24, entryFraction: 0.5, buyOnly: true, filter: ({ z }) => z.dir > 0 && z.created === F + 6 };
const run = (x, reentry) => backtest(withT(x), { ...O, ...(reentry ? { reentry } : {}) }).trades;

test('sans l\'option : identique au moteur C (un seul trade, stop)', () => {
  const x = [...base(), bar(100, 100, 96, 98)];
  const d = run(x), c = backtestC(withT(x), O).trades;
  assert.equal(d.length, 1); assert.equal(d[0].why, 'stop'); assert.equal(d[0].r, -1);
  assert.deepEqual(d.map((t) => [t.entry, t.stop, t.tp, t.r, t.fillIdx, t.exitIdx]), c.map((t) => [t.entry, t.stop, t.tp, t.r, t.fillIdx, t.exitIdx]));
});

test('stop sans grande baissière : réentrée au marché à l\'ouverture suivante, même TP, stop sous le plus bas du stop', () => {
  const x = [...base(), bar(100, 100, 96, 98), bar(99, 101, 97, 100), bar(100, 120, 99, 119)]; // F+9 stop (corps 2 < 2 x ~2,5) ; F+10 ouverture 99 ; F+11 TP
  const t = run(x, { bigMult: 2 });
  assert.equal(t.length, 2);
  assert.equal(t[1].reentry, true); assert.equal(t[1].fillIdx, F + 10);
  assert.equal(t[1].entry, 99); assert.equal(t[1].stop, 95.5); assert.equal(t[1].tp, t[0].tp);
  assert.equal(t[1].why, 'tp'); assert.ok(Math.abs(t[1].r - (119.5 - 99) / 3.5) < 1e-9);
});

test('stop par une grande bougie baissière : pas de réentrée', () => {
  const x = [...base(), bar(104, 104, 96, 96), bar(99, 101, 97, 100), bar(100, 120, 99, 119)]; // corps 8 >= 2 x moyenne
  const ev = []; const t = backtest(withT(x), { ...O, reentry: { bigMult: 2 }, onReentry: (e) => ev.push(e.kind) }).trades;
  assert.equal(t.length, 1); assert.deepEqual(ev, ['big']);
});

test('sans filtre (bigMult null) : la grande baissière ne bloque plus', () => {
  const x = [...base(), bar(104, 104, 96, 96), bar(99, 101, 97, 100), bar(100, 120, 99, 119)];
  assert.equal(run(x, { bigMult: null }).length, 2);
});

test('une seule réentrée : le stop de la réentrée ne déclenche rien', () => {
  const x = [...base(), bar(100, 100, 96, 98), bar(99, 101, 97, 100), bar(100, 100, 95, 96), bar(96, 97, 90, 92), bar(92, 93, 90, 91)];
  const t = run(x, { bigMult: 2 });
  assert.equal(t.length, 2); assert.equal(t[1].why, 'stop'); assert.equal(t[1].r, -1);
});

test('pas de réentrée hors de la plage horaire (la bougie suivant le stop ouvre à 16:00 NY)', () => {
  const x = [...base(), bar(100, 100, 96, 98), bar(99, 101, 97, 100), bar(100, 120, 99, 119)];
  const tStop = Date.UTC(2014, 4, 13, 20, 45) / 1000, tt = (i) => tStop - (F + 9) * 900 + i * 900; // F+9 (stop) à 15:45 NY (décalage fixe 5 h du moteur), F+10 à 16:00
  const xs = x.map((k, i) => ({ ...k, t: tt(i), raw: tt(i) * 1000 }));
  const inRange = backtest(xs, { ...O, hourFrom: 6, hourTo: 17, reentry: { bigMult: 2 } }).trades, out = backtest(xs, { ...O, hourFrom: 6, hourTo: 16, reentry: { bigMult: 2 } }).trades;
  assert.equal(inRange.length, 2); assert.equal(out.length, 1);
});

test('réentrée refusée si le TP est déjà sous le prix d\'entrée', () => {
  const x = [...base(), bar(100, 100, 96, 98), bar(125, 126, 124, 125)]; // ouverture 125 > TP 119,5
  assert.equal(run(x, { bigMult: 2 }).length, 1);
});

test('spread payé à l\'entrée de la réentrée (ouverture + spread)', () => {
  const x = [...base(), bar(100, 100, 96, 98), bar(99, 101, 97, 100), bar(100, 120, 99, 119)];
  const t = backtest(withT(x), { ...O, spread: 0.2, reentry: { bigMult: 2 } }).trades;
  const r = t.find((q) => q.reentry); assert.ok(r); assert.ok(Math.abs(r.entry - 99.2) < 1e-9);
});

test('judgeREE : critères sur des séries simples', () => {
  const mk = (rs2, re) => rs2.map((r, i) => ({ key: `k${i}${re ? 'r' : ''}`, r, why: r > 0 ? 'tp' : 'stop', re, rr: 3 }));
  const ctrl = { 2011: { trades: mk([1, -1, -1, 1], false), cnt: {} }, 2017: { trades: mk([1, -1], false), cnt: {} } };
  const vari = { 2011: { trades: [...mk([1, -1, -1, 1], false), ...mk([2, 2, -1, 2, 2, 2, 2, 2, 2, 2], true)], cnt: {} }, 2017: { trades: [...mk([1, -1], false), ...mk([2, -1, 2, 2, 2, 2, 2, 2, 2, 2], true)], cnt: {} } };
  const j = judgeREE(ctrl, vari, 1.5);
  assert.equal(j.sRe.n, 20); assert.equal(j.c.halves, true); assert.equal(j.c.rate, true); assert.equal(j.c.noDilution, true);
  assert.equal(judgeREE(ctrl, vari, 0.5).c.rate, false);
});

test('série trop courte : null', () => {
  const c = Array.from({ length: 50 }, (_, i) => ({ t: 1.2e9 + i * 900, raw: Date.UTC(2015, 0, 1) + i * 900000, o: 1, h: 2, l: 0.5, c: 1.5 }));
  assert.equal(runYearAFRaw(c, 2015, 'ree'), null);
});
