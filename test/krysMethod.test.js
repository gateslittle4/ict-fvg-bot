import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZones, scan, plan, targetFvg } from '../scripts/lib/krysMethod.js';

const T0 = Date.UTC(2019, 10, 12, 15, 0) / 1000; // 10:00 NY
const bars = (rows) => rows.map(([o, h, l, c], i) => ({ t: T0 + i * 900, o, h, l, c }));

test('krysMethod: FVG de vente strict, validé quand la bougie suivante reste entièrement dehors', () => {
  // c1 low 110 > c3 high 105 : zone [105, 110]
  const c = bars([[112, 115, 110, 111], [111, 111, 104, 104], [104, 105, 100, 101], [101, 104.5, 99, 100]]);
  const { zones } = buildZones(c);
  assert.equal(zones.length, 1);
  assert.deepEqual([zones[0].lo, zones[0].hi, zones[0].status], [105, 110, 'valid']);
});

test('krysMethod: la bougie qui touche devient le nouveau c3 et déplace le bord proche', () => {
  const c = bars([[112, 115, 110, 111], [111, 111, 104, 104], [104, 105, 100, 101], [101, 107, 99, 102], [102, 104, 98, 99]]);
  const { zones } = buildZones(c);
  assert.deepEqual([zones[0].lo, zones[0].hi, zones[0].status], [107, 110, 'valid']); // bas déplacé à 107, puis validée
});

test('krysMethod: une bougie qui traverse toute la zone la tue', () => {
  const c = bars([[112, 115, 110, 111], [111, 111, 104, 104], [104, 105, 100, 101], [101, 111, 99, 108]]);
  assert.notEqual(buildZones(c).zones[0].dead, undefined);
});

test('krysMethod: FVG d\'âge 0 non validé', () => {
  const c = bars([[112, 115, 110, 111], [111, 111, 104, 104], [104, 105, 100, 101]]);
  assert.equal(scan(c, 2).length, 0);
});

test('krysMethod.plan: entrée à 50 %, stop au bord lointain + 1, TP = max(moitié du FVG cible, 3R)', () => {
  const z = { dir: -1, lo: 105, hi: 110 };
  const tg = { lo: 80, hi: 90 }; // moitié du FVG cible : 85
  const p = plan(z, tg);
  assert.equal(p.entry, 107.5);
  assert.equal(p.stop, 111);
  assert.equal(p.tp, Math.min(85, 107.5 - 3 * 3.5)); // 3R = 97 ; 85 est plus loin
  assert.ok(p.rr >= 3);
});

test('krysMethod.targetFvg: ignore un FVG cible entièrement rempli', () => {
  const gaps = [{ dir: 1, lo: 90, hi: 95, created: 1 }];
  const c = bars([[100, 100, 90, 95], [95, 98, 94, 97], [97, 99, 96, 98], [98, 98, 88, 90]]); // la bougie 3 traverse 90-95
  assert.equal(targetFvg(c, gaps, 3, -1, 107), null);
});
