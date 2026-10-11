import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFF, toM15 } from '../scripts/lib/m1Data.js';
import { detectFvgs, pickTarget, buildOrder, inWindow, simulateOrder, runSymbol, trainVerdict, stats } from '../scripts/lib/fvgGauche.js';

const MIN = 60000;
const bar = (o, h, l, c) => ({ time: 0, open: o, high: h, low: l, close: c });
const engineTime = (y, m, d, hh, mm) => Date.UTC(y, m, d, hh, mm) - OFF; // temps moteur = UTC - 5 h fixe

test('detectFvgs: baissier Low[k-2] > High[k], haussier High[k-2] < Low[k], bornes correctes', () => {
  const bear = detectFvgs([bar(0, 20, 15, 0), bar(0, 16, 10, 0), bar(0, 12, 8, 0)]);
  assert.deepEqual([bear[2].dir, bear[2].sup, bear[2].inf, bear[2].h], [-1, 15, 12, 3]);
  const bull = detectFvgs([bar(0, 10, 8, 0), bar(0, 14, 9, 0), bar(0, 16, 12, 0)]);
  assert.deepEqual([bull[2].dir, bull[2].sup, bull[2].inf, bull[2].h], [1, 12, 10, 2]);
});

test('detectFvgs: touch = première bougie qui touche la zone, Infinity sinon', () => {
  // FVG haussier k=2 (sup 12) ; la bougie 4 descend à 11,5 <= 12
  const f = detectFvgs([bar(0, 10, 8, 0), bar(0, 14, 9, 0), bar(0, 16, 12, 0), bar(0, 17, 13, 0), bar(0, 15, 11.5, 0)]);
  assert.equal(f[2].touch, 4);
  const g = detectFvgs([bar(0, 10, 8, 0), bar(0, 14, 9, 0), bar(0, 16, 12, 0), bar(0, 17, 13, 0)]);
  assert.equal(g[2].touch, Infinity);
});

test('pickTarget: le FVG « à gauche » doit être DEVANT l\'entrée (pas de cible du mauvais côté)', () => {
  // vente à 110 : un FVG haussier dont le bord haut est AU-DESSUS de 110 ne peut pas servir de cible
  const above = [null, null, null, { k: 3, dir: 1, sup: 120, inf: 118, h: 2, touch: Infinity }];
  assert.equal(pickTarget(above, 10, -1, 110), null);
  const below = [null, null, null, { k: 3, dir: 1, sup: 100, inf: 98, h: 2, touch: Infinity }];
  assert.equal(pickTarget(below, 10, -1, 110).target, 100);
  // achat à 110 : un FVG baissier dont le bord bas est SOUS 110 est refusé, au-dessus il sert (bord bas)
  const bearBelow = [null, null, null, { k: 3, dir: -1, sup: 105, inf: 103, h: 2, touch: Infinity }];
  assert.equal(pickTarget(bearBelow, 10, 1, 110), null);
  const bearAbove = [null, null, null, { k: 3, dir: -1, sup: 122, inf: 120, h: 2, touch: Infinity }];
  assert.equal(pickTarget(bearAbove, 10, 1, 110).target, 120);
});

test('pickTarget: pas de regard vers l\'avenir (touché après k : encore valable ; touché jusqu\'à k : exclu), le plus proche l\'emporte', () => {
  const later = [null, null, null, { k: 3, dir: 1, sup: 100, inf: 98, h: 2, touch: 20 }];
  assert.equal(pickTarget(later, 10, -1, 110).target, 100); // touché en 20 > k = 10 : inconnu à k
  const already = [null, null, null, { k: 3, dir: 1, sup: 100, inf: 98, h: 2, touch: 10 }];
  assert.equal(pickTarget(already, 10, -1, 110), null); // touché à la bougie 10 <= k
  const two = [null, null, null, { k: 3, dir: 1, sup: 100, inf: 98, h: 2, touch: Infinity }, null, { k: 5, dir: 1, sup: 105, inf: 103, h: 2, touch: Infinity }];
  assert.equal(pickTarget(two, 10, -1, 110).target, 105); // le plus proche de l'entrée
  const tooRecent = [null, null, null, null, null, null, null, null, { k: 8, dir: 1, sup: 100, inf: 98, h: 2, touch: Infinity }];
  assert.equal(pickTarget(tooRecent, 10, -1, 110), null); // formé en 8 > k-3 = 7 : pas « à gauche »
  const justOld = [null, null, null, null, null, null, null, { k: 7, dir: 1, sup: 100, inf: 98, h: 2, touch: Infinity }];
  assert.equal(pickTarget(justOld, 10, -1, 110).target, 100); // formé en 7 = k-3 : la limite est incluse
});

test('buildOrder: vente = entrée au bord bas, stop au-dessus + 10 % de hauteur, cible >= 2 R', () => {
  const Z = { k: 7, dir: -1, sup: 116, inf: 113, h: 3 };
  const o = buildOrder(Z, 103);
  assert.equal(o.side, 'sell');
  assert.equal(o.entry, 113);
  assert.ok(Math.abs(o.stop - 116.3) < 1e-9);
  assert.equal(o.rrOk, true);
  assert.equal(buildOrder(Z, 110).rrOk, false); // 3 points pour un risque de 3,3 : sous 2 R
  const buy = buildOrder({ k: 7, dir: 1, sup: 116, inf: 113, h: 3 }, 130);
  assert.equal(buy.side, 'buy');
  assert.equal(buy.entry, 116);
  assert.ok(Math.abs(buy.stop - 112.7) < 1e-9);
});

test('inWindow: 08:30 inclus, 11:30 exclu, heure de New York réelle (été et hiver)', () => {
  assert.equal(inWindow(engineTime(2024, 6, 1, 12, 30)), true); // 08:30 New York (été, UTC-4)
  assert.equal(inWindow(engineTime(2024, 6, 1, 12, 29)), false);
  assert.equal(inWindow(engineTime(2024, 6, 1, 15, 29)), true); // 11:29
  assert.equal(inWindow(engineTime(2024, 6, 1, 15, 30)), false); // 11:30
  assert.equal(inWindow(engineTime(2024, 0, 15, 13, 30)), true); // 08:30 New York (hiver, UTC-5)
  assert.equal(inWindow(engineTime(2024, 0, 15, 16, 30)), false); // 11:30
});

function minutes(rows, t0) {
  return { t: Float64Array.from(rows, (_, i) => t0 + i * MIN), o: Float64Array.from(rows, (r) => r[0]), h: Float64Array.from(rows, (r) => r[1]), l: Float64Array.from(rows, (r) => r[2]), c: Float64Array.from(rows, (r) => r[3]), n: rows.length };
}
const flat = (n, p) => Array.from({ length: n }, () => [p, p, p, p]);
const T0 = engineTime(2024, 6, 1, 14, 0);
const noSwap = () => 0;
const SELL = { side: 'sell', entry: 113, stop: 116.3, target: 103 };

test('simulateOrder: vente remplie au niveau, puis cible atteinte (R = gain / risque réel)', () => {
  const S = minutes([...flat(4, 109), [109, 113.5, 109, 112], [112, 112, 102, 103], ...flat(3, 103)], T0);
  const r = simulateOrder(S, SELL, T0, { spread: 0, swap: noSwap });
  assert.equal(r.reason, 'target');
  assert.ok(Math.abs(r.r - 10 / 3.3) < 1e-9);
  assert.ok(r.control); // contrôle cible fixe 3 R calculé sur le même remplissage
});

test('simulateOrder: cible atteinte avant le remplissage = annulé ; ouverture au-delà du stop = pas de trade ; expiration', () => {
  const drop = minutes([...flat(2, 109), [109, 109, 102, 103], ...flat(3, 103)], T0);
  assert.equal(simulateOrder(drop, SELL, T0, { spread: 0, swap: noSwap }).missed, 'target-first');
  const gap = minutes([...flat(2, 109), [117, 118, 117, 117]], T0);
  assert.equal(simulateOrder(gap, SELL, T0, { spread: 0, swap: noSwap }).missed, 'stop-crossed');
  const quiet = minutes(flat(16 * 15 + 5, 109), T0);
  const q = simulateOrder(quiet, SELL, T0, { spread: 0, swap: noSwap });
  assert.equal(q.missed, 'expired');
  assert.equal(q.endTime, T0 + 16 * 15 * MIN);
});

test('simulateOrder: stop d\'abord dans la minute de remplissage', () => {
  const S = minutes([...flat(2, 109), [109, 117, 109, 116], ...flat(3, 116)], T0);
  const r = simulateOrder(S, SELL, T0, { spread: 0, swap: noSwap });
  assert.equal(r.reason, 'stop');
  assert.ok(r.r < 0 && r.r > -1.01);
});

/** Chaque bougie M15 devient 15 minutes : ouverture, pic haut en minute 4, pic bas en minute 8, clôture en minute 14. */
function expand(bars, t0) {
  const rows = [];
  for (const b of bars) {
    for (let m = 0; m < 15; m++) {
      if (m === 4) rows.push([b.o, b.h, b.o, b.o]);
      else if (m === 8) rows.push([b.o, b.o, b.l, b.o]);
      else if (m === 14) rows.push([b.o, b.o, b.o, b.c]);
      else rows.push([b.o, b.o, b.o, b.o]);
    }
  }
  return minutes(rows, t0);
}
const B = (o, h, l, c) => ({ o, h, l, c });

test('runSymbol: scénario complet (FVG haussier à gauche jamais touché, FVG baissier déclencheur, vente, cible atteinte), un seul trade', () => {
  const b = [
    B(99, 100, 98, 100), B(100, 106, 100, 105), B(103, 107, 103, 106), // FVG haussier k=2 : bornes 100-103, jamais touché ensuite
    B(106, 112, 104, 110), B(110, 121, 109, 120), // montée
    B(120, 121, 116, 117), B(117, 117, 111, 112), B(112, 113, 108, 109), // FVG baissier k=7 : sup 116, inf 113
    B(109, 113.5, 109, 112), B(112, 112, 102, 103), // remplissage à 113, puis cible 103
    ...Array.from({ length: 30 }, () => B(103, 103, 103, 103)),
  ];
  const t0 = engineTime(2024, 6, 1, 13, 0); // 09:00 New York : la bougie 7 se clôture à 11:00, dans la fenêtre
  const S = expand(b, t0);
  const bars = toM15(S);
  const { trades, counters } = runSymbol(S, bars, { from: -Infinity, to: Infinity, spreadAt: () => 0, swapFor: noSwap });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].dir, -1);
  assert.equal(trades[0].reason, 'target');
  assert.ok(Math.abs(trades[0].r - 10 / 3.3) < 1e-6, `r = ${trades[0].r}`);
  assert.equal(counters.remplis, 1);
});

test('stats et trainVerdict: seuils du pré-enregistrement (60 trades, t >= 2,6, deux moitiés positives)', () => {
  const s = stats([1, -1, 1, -1]);
  assert.equal(s.n, 4);
  assert.equal(s.mean, 0);
  const pooled = { n: 80, mean: 0.2, t: 3, sum: 16 };
  assert.equal(trainVerdict({ pooled, h1: { sum: 5 }, h2: { sum: 11 } }).status, 'VALIDÉ');
  assert.equal(trainVerdict({ pooled, h1: { sum: -1 }, h2: { sum: 17 } }).status, 'ÉCHEC');
  assert.equal(trainVerdict({ pooled: { ...pooled, t: 2.5 }, h1: { sum: 5 }, h2: { sum: 11 } }).status, 'ÉCHEC');
  assert.equal(trainVerdict({ pooled: { ...pooled, n: 59 }, h1: { sum: 5 }, h2: { sum: 11 } }).status, 'NON CONCLUANT');
});
