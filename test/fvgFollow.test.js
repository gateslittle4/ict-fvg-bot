import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFF, toM15 } from '../scripts/lib/m1Data.js';
import { buildZones, simulateFollowOrder, manageFollow, runSymbolFollow } from '../scripts/lib/fvgFollow.js';

const MIN = 60000, M15 = 15 * MIN;
const engineTime = (y, m, d, hh, mm) => Date.UTC(y, m, d, hh, mm) - OFF;
const T0 = engineTime(2024, 6, 1, 13, 0);
/** Barres M15 contiguës [o, h, l, c] démarrant à T0. */
const barsOf = (rows, t0 = T0) => rows.map((r, i) => ({ time: t0 + i * M15, open: r[0], high: r[1], low: r[2], close: r[3] }));
function minutes(rows, t0) {
  return { t: Float64Array.from(rows, (_, i) => t0 + i * MIN), o: Float64Array.from(rows, (r) => r[0]), h: Float64Array.from(rows, (r) => r[1]), l: Float64Array.from(rows, (r) => r[2]), c: Float64Array.from(rows, (r) => r[3]), n: rows.length };
}
const noSwap = () => 0;

test('buildZones: la partie non mangée par la bougie suivante devient la zone ; entièrement mangée = pas de FVG', () => {
  // FVG baissier en k=2 : sup = Low[0] = 110, inf = High[2] = 100
  const base = [[112, 115, 110, 111], [111, 111, 96, 97], [97, 100, 95, 98]];
  const partiel = buildZones(barsOf([...base, [98, 104, 97, 103]])); // la bougie suivante monte à 104 : mange 100-104
  assert.equal(partiel.length, 1);
  assert.deepEqual([partiel[0].dir, partiel[0].remInf, partiel[0].remSup], [-1, 104, 110]);
  assert.equal(partiel[0].entry, 104); // vente au bord bas de la partie non mangée
  assert.ok(Math.abs(partiel[0].stop - 110.6) < 1e-9); // 110 + 10 % de 6
  const dehors = buildZones(barsOf([...base, [98, 99, 97, 98]])); // reste sous le FVG : zone entière
  assert.deepEqual([dehors[0].remInf, dehors[0].remSup], [100, 110]);
  assert.equal(buildZones(barsOf([...base, [98, 111, 97, 110]])).length, 0); // tout mangé
  // FVG haussier en k=2 : inf = High[0] = 101, sup = Low[2] = 104 ; la bougie suivante descend à 102 : partie non mangée 101-102
  const haus = buildZones(barsOf([[100, 101, 99, 100.5], [100.5, 106, 100.4, 105], [105, 107, 104, 106], [106, 108, 102, 107]]));
  assert.deepEqual([haus[0].dir, haus[0].remInf, haus[0].remSup, haus[0].entry], [1, 101, 102, 102]);
});

test('buildZones: des FVG consécutifs de même sens forment une seule zone ; un trou de week-end n\'est pas un FVG', () => {
  // deux FVG haussiers consécutifs (k=2 et k=3)
  const rows = [[100, 101, 99, 100.5], [101, 106, 101, 105], [106, 108, 104, 107], [108, 112, 107, 111], [111, 113, 107.5, 112]];
  const z = buildZones(barsOf(rows));
  assert.equal(z.length, 1);
  assert.equal(z[0].k1, 3);
  assert.equal(z[0].kT, 4);
  // le même motif avec un trou de temps entre la bougie 1 et la bougie 2 : aucun FVG
  const bars = barsOf(rows).map((b, i) => (i >= 2 ? { ...b, time: b.time + 2 * 24 * 3600000 } : b));
  assert.equal(buildZones(bars).length, 0);
});

test('simulateFollowOrder: rempli au niveau ; annulé à cancelAt ; pas de trade si la minute s\'ouvre au-delà du stop', () => {
  const z = { dir: 1, T: T0, entry: 104, stop: 100.7 };
  const flat = (n, p) => Array.from({ length: n }, () => [p, p, p, p]);
  const fill = simulateFollowOrder(minutes([...flat(5, 106), [106, 106, 103.5, 105], ...flat(3, 105)], T0), z, T0 + 60 * MIN, { spread: 0 });
  assert.equal(fill.fill, 104);
  assert.equal(fill.i, 5);
  assert.equal(simulateFollowOrder(minutes([...flat(5, 106), [106, 106, 103.5, 105]], T0), z, T0 + 3 * MIN, { spread: 0 }).missed, 'non_rempli'); // annulé avant
  assert.equal(simulateFollowOrder(minutes([...flat(2, 106), [100, 101, 99, 100]], T0), z, T0 + 60 * MIN, { spread: 0 }).missed, 'stop_franchi');
});

test('manageFollow: sortie au retournement à l\'ouverture de la minute, stop d\'abord, sinon durée', () => {
  const flat = (n, p) => Array.from({ length: n }, () => [p, p, p, p]);
  const S = minutes([[104, 104, 104, 104], ...flat(9, 108), [108, 108, 100, 101], ...flat(3, 100)], T0);
  const flip = manageFollow(S, { buy: true, i: 0, fill: 104, stop: 100.7, flipT: T0 + 5 * MIN, spread: 0 });
  assert.equal(flip.reason, 'retournement');
  assert.equal(flip.exitTime, T0 + 5 * MIN);
  assert.ok(Math.abs(flip.r - (108 - 104) / 3.3) < 1e-9); // sortie à l'ouverture (108)
  const stop = manageFollow(S, { buy: true, i: 0, fill: 104, stop: 100.7, flipT: T0 + 20 * MIN, spread: 0 });
  assert.equal(stop.reason, 'stop'); // la minute 10 descend à 100 : stop touché avant le retournement tardif
  assert.ok(stop.r < -0.99 && stop.r >= -1.0001);
  const vente = manageFollow(minutes([[100, 100, 100, 100], ...flat(3, 96)], T0), { buy: false, i: 0, fill: 100, stop: 103, flipT: T0 + 2 * MIN, spread: 0.5 });
  assert.equal(vente.reason, 'retournement');
  assert.ok(Math.abs(vente.r - (100 - 96.5) / 3) < 1e-9); // une vente sort à l'ask (ouverture + spread)
});

/** Chaque bougie M15 devient 15 minutes : ouverture, pic haut en minute 4, pic bas en minute 8, clôture en minute 14. */
function expand(bars, t0) {
  const rows = [];
  for (const b of bars) {
    for (let m = 0; m < 15; m++) {
      if (m === 4) rows.push([b[0], b[1], b[0], b[0]]);
      else if (m === 8) rows.push([b[0], b[0], b[2], b[0]]);
      else if (m === 14) rows.push([b[0], b[0], b[0], b[3]]);
      else rows.push([b[0], b[0], b[0], b[0]]);
    }
  }
  return minutes(rows, t0);
}

test('runSymbolFollow: achat au retest du FVG haussier, zone dans le même sens ignorée, sortie au FVG baissier (retournement), pas de trade en trop', () => {
  const b = [
    [100, 101, 99, 100.5], [100.5, 106, 100.4, 105], [105, 107, 104, 106], // FVG haussier k=2 : 101-104
    [106, 108, 105, 107], // bougie de confirmation : reste dehors, zone entière ; ordre d'achat à 104, stop 100,7
    [107, 107, 104.5, 105], [105, 105.5, 103.5, 104], // la bougie 5 touche 104 : rempli
    [104, 110, 104, 109], [109, 112, 108, 111], [111, 113, 110, 112], // FVG haussier k=7 (même sens, ignoré)
    [112, 112, 106, 107], [107, 108, 105, 106], // FVG baissier k=10 : 108-110
    [106, 107, 104, 105], // confirmation : la zone baissière devient active ; retournement
    ...Array.from({ length: 24 }, () => [105, 105, 105, 105]),
  ];
  const t0 = T0;
  const S = expand(b, t0);
  const bars = toM15(S);
  const { trades, counters } = runSymbolFollow(S, bars, { from: -Infinity, to: Infinity, spreadAt: () => 0, swapFor: noSwap });
  assert.equal(trades.length, 1);
  assert.equal(trades[0].dir, 1);
  assert.equal(trades[0].reason, 'retournement');
  assert.ok(Math.abs(trades[0].r - (105 - 104) / 3.3) < 1e-6, `r = ${trades[0].r}`);
  assert.equal(counters.remplis, 1);
});
