import test from 'node:test';
import assert from 'node:assert/strict';
import { nyDate, addDays, dowOf, sessions, bullish, status } from './comboP_lundis.mjs';

const T = (iso) => Date.parse(iso) / 1000; // temps moteur en hiver : t = UTC (heure NY = t - 5 h)
test('nyDate / addDays / dowOf : lundi 2024-03-04 09:30 NY = 14:30 UTC', () => {
  assert.equal(nyDate(T('2024-03-04T14:30:00Z')), '2024-03-04'); assert.equal(nyDate(T('2024-03-04T03:00:00Z')), '2024-03-03'); // 22:00 NY la veille
  assert.equal(addDays('2024-03-04', -3), '2024-03-01'); assert.equal(dowOf('2024-03-04'), 1); assert.equal(dowOf('2024-03-01'), 5);
});
test('sessions : seules les bougies 06-16 NY comptent ; open/close/high/low', () => {
  const c = []; for (let i = 0; i < 60; i++) { const t = T('2024-03-01T10:00:00Z') + i * 900; c.push({ t, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i }); } // 05:00 NY -> 20:00 NY
  const s = sessions(c).get('2024-03-01'); assert.equal(s.n, 40); assert.equal(s.open, 104); assert.equal(s.first, 4); assert.equal(s.close, 101 + 43);
});
test('bullish : clôture > ouverture et dans le tiers haut', () => {
  assert.equal(bullish({ n: 40, open: 100, close: 108, high: 110, low: 99 }), true); assert.equal(bullish({ n: 40, open: 100, close: 103, high: 110, low: 99 }), false);
  assert.equal(bullish({ n: 10, open: 100, close: 108, high: 110, low: 99 }), false); assert.equal(bullish(null), false);
});
test('status : ordre / sans cible / autre', () => {
  assert.equal(status({ orders: 1, noTarget: 3 }), 'ordre'); assert.equal(status({ orders: 0, noTarget: 2 }), 'sans cible'); assert.equal(status({ orders: 0, noTarget: 0 }), 'autre');
});
