import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest } from './lib/krysBacktestW.js';
import { backtest as backtestRef } from './lib/krysBacktest.js';
import { judge } from './comboO.mjs';

function series(n = 6000) {
  let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const t0 = Date.UTC(2020, 0, 6, 5) / 1000, out = []; let p = 8000;
  for (let i = 0; i < n; i++) { const o = p, mv = (rnd() - 0.5) * 24, c = o + mv, h = Math.max(o, c) + rnd() * 6, l = Math.min(o, c) - rnd() * 6; out.push({ t: t0 + i * 900, o, h, l, c }); p = c; }
  return out;
}
const base = { spread: 0.6, stopMargin: 3, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, filter: (a) => a.z.dir > 0 };

test('sans maxTargetAgeDays : identique à krysBacktest.js ; avec une limite énorme : identique aussi', () => {
  const c = series(), a = backtestRef(c, base).trades, b = backtest(c, base).trades, big = backtest(c, { ...base, maxTargetAgeDays: 100000 }).trades;
  assert.ok(a.length > 5); assert.deepEqual(b.map((t) => [t.entry, t.tp, t.r]), a.map((t) => [t.entry, t.tp, t.r])); assert.deepEqual(big.map((t) => [t.entry, t.tp, t.r]), a.map((t) => [t.entry, t.tp, t.r]));
});
test('avec limite : aucun trade n a une cible plus vieille que la limite ; jamais plus de trades qu en base', () => {
  const c = series(), days = 1, w = backtest(c, { ...base, maxTargetAgeDays: days }).trades, a = backtest(c, base).trades;
  for (const t of w) assert.ok(c[t.placedIdx].t - c[t.targetCreated].t <= days * 86400);
  assert.ok(w.length <= a.length + 3);
});
test('judge : une variante identique au contrôle ne passe pas', () => {
  const ctrl = {}, vari = {}; for (let Y = 2011; Y <= 2022; Y++) { const rows = [{ key: Y + ':1', r: -1, age: 1 }, { key: Y + ':2', r: 3, age: 2 }, { key: Y + ':3', r: -1, age: 3 }]; ctrl[Y] = rows; vari[Y] = rows.map((x) => ({ ...x })); }
  assert.equal(judge(ctrl, vari, 2).pass, false);
});
