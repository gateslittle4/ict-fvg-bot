import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from './comboF.mjs';
import { runYearT } from './comboT.mjs';
import { runYearLogged, orderEnd, candleOf } from './compareMesTradesF2.mjs';

const NY5 = 5 * 3600, d0 = Date.UTC(2025, 2, 10) / 1000;
const mk = (i, h, l) => ({ t: d0 + NY5 + 6 * 3600 + 900 * i, o: (h + l) / 2, h, l, c: (h + l) / 2, raw: 0 }); // 06:00 NY + i x 15 min
test('candleOf : bougie qui contient l\'instant ; hors bougie = -1', () => {
  const c = [mk(0, 10, 9), mk(1, 10, 9), mk(2, 10, 9)], base = Date.UTC(2025, 2, 10, 6, 0);
  assert.equal(candleOf(c, base), 0); assert.equal(candleOf(c, base + 14 * 60000), 0); assert.equal(candleOf(c, base + 15 * 60000), 1); assert.equal(candleOf(c, base + 45 * 60000), -1);
});
test('orderEnd achat : remplissage, stop, TP, fin de plage', () => {
  const sp = 0.5, od = { dir: 1, entry: 100, stop: 90, tp: 130, placedIdx: 0 };
  const c1 = [mk(0, 120, 110), mk(1, 115, 105), mk(2, 112, 99.2), mk(3, 112, 100)]; // bougie 2 : bas 99,2 + 0,5 <= 100 : remplie
  assert.equal(orderEnd(c1, od, sp), 2);
  const c2 = [mk(0, 120, 110), mk(1, 115, 89), mk(2, 112, 99)]; assert.equal(orderEnd(c2, od, sp), 1); // le stop (et le remplissage) touchés bougie 1
  const c3 = [mk(0, 120, 110), mk(1, 131, 105), mk(2, 112, 99)]; assert.equal(orderEnd(c3, od, sp), 1); // TP touché avant remplissage
  const late = Array.from({ length: 41 }, (_, i) => mk(i, 120, 110)); assert.equal(orderEnd(late, od, sp), 40); // 06:00 + 40 x 15 min = 16:00 : hors plage
});
test('orderEnd vente : remplissage par le haut, stop au-dessus', () => {
  const od = { dir: -1, entry: 100, stop: 110, tp: 70, placedIdx: 0 };
  assert.equal(orderEnd([mk(0, 90, 85), mk(1, 95, 90), mk(2, 100.5, 95)], od, 0.5), 2);
  assert.equal(orderEnd([mk(0, 90, 85), mk(1, 111, 80)], od, 0.5), 1);
});
const all = loadAll();
test('identité : le journal des ordres ne change pas les trades de F2 (2025)', () => {
  const a = runYearLogged(all, 2025, +1), b = runYearT(all, 2025, {});
  assert.equal(a.T.length, b.length); for (let i = 0; i < b.length; i++) assert.ok(Math.abs(a.T[i].r - b[i].r) < 1e-12);
  assert.ok(a.orders.length >= a.T.length && a.orders.every((o) => o.endIdx >= o.placedIdx));
});
