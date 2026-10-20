import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, durMin, hourOf, dowOf, addR, addDayContext, bootCI, summ } from './analyseMesTrades.mjs';

const csv = 'open_time_ny,open_price,close_time_ny,close_price,side,symbol,volume,profit_usd\n2025-03-07 09:35,100,2025-03-07 09:42,101,Sell,NAS100.x,0.08,-40\n2025-03-07 12:32,100,2025-03-07 13:32,101,Buy,NAS100.x,0.1,-20\n2025-03-10 11:30,100,2025-03-10 11:37,101,Buy,NAS100.x,0.09,120\n';
test('parseCsv et champs dérivés', () => {
  const T = parseCsv(csv); assert.equal(T.length, 3); assert.equal(T[0].usd, -40); assert.equal(durMin(T[0]), 7); assert.equal(durMin(T[1]), 60); assert.equal(hourOf(T[0]), 9); assert.equal(dowOf(T[0]), 5); assert.equal(dowOf(T[2]), 1);
});
test('addR : R du mois = perte médiane des perdants du mois', () => {
  const T = parseCsv(csv); const R = addR(T); assert.equal(R['2025-03'], 30); assert.ok(Math.abs(T[0].R - (-40 / 30)) < 1e-9); assert.ok(Math.abs(T[2].R - 4) < 1e-9);
});
test('bootCI : reproductible ; encadre la moyenne ; vide si trop peu de trades', () => {
  const x = [1, -1, 2, -1, 3, -1, 0.5, -1, 4, -1], a = bootCI(x), b = bootCI(x), m = x.reduce((p, q) => p + q, 0) / x.length;
  assert.deepEqual(a, b); assert.ok(a[0] < m && m < a[1]); assert.ok(Number.isNaN(bootCI([1, 2])[0]));
});
test('summ : n, taux de gagnants, R total', () => {
  const g = [{ usd: -10, R: -1 }, { usd: 30, R: 3 }, { usd: -10, R: -1 }, { usd: -10, R: -1 }, { usd: -10, R: -1 }, { usd: 20, R: 2 }]; const s = summ(g);
  assert.equal(s.n, 6); assert.ok(Math.abs(s.win - 2 / 6) < 1e-9); assert.equal(s.totR, 1);
});

test('addDayContext : R déjà réalisé dans le jour et écart avec le trade précédent', () => {
  const T = parseCsv('open_time_ny,open_price,close_time_ny,close_price,side,symbol,volume,profit_usd\n2025-03-07 09:00,1,2025-03-07 09:10,1,Buy,N,0.1,-30\n2025-03-07 09:20,1,2025-03-07 09:40,1,Buy,N,0.1,-30\n2025-03-07 10:00,1,2025-03-07 11:00,1,Buy,N,0.1,60\n2025-03-10 09:00,1,2025-03-10 09:05,1,Buy,N,0.1,-30\n');
  addR(T); addDayContext(T);
  assert.equal(T[0].dayR, 0); assert.equal(T[0].gap, null); assert.equal(T[1].dayR, -1); assert.equal(T[1].gap, 20); assert.equal(T[2].dayR, -2); assert.equal(T[2].gap, 40); assert.equal(T[3].dayR, 0); assert.equal(T[3].gap, null);
});
