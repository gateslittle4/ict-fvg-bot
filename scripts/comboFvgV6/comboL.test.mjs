import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest as backtestW } from './lib/krysBacktestW.js';
import { backtest } from './lib/krysBacktest.js';
import { match, pairedT, judge } from './comboL.mjs';

// série M15 pseudo-aléatoire reproductible (temps moteur : heure NY = t - 5 h) ; 2020-01-06 05:00 UTC = 00:00 NY
function series(n = 4000) {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const t0 = Date.UTC(2020, 0, 6, 5) / 1000, out = []; let p = 8000;
  for (let i = 0; i < n; i++) { const o = p, mv = (rnd() - 0.5) * 24, c = o + mv, h = Math.max(o, c) + rnd() * 6, l = Math.min(o, c) - rnd() * 6; out.push({ t: t0 + i * 900, o, h, l, c }); p = c; }
  return out;
}
const opt = { spread: 0.6, stopMargin: 3, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, filter: (a) => a.z.dir > 0 };

test('stopMult absent ou 1 : identique à krysBacktest.js', () => {
  const c = series(), a = backtest(c, opt).trades, b = backtestW(c, opt).trades, b1 = backtestW(c, { ...opt, stopMult: 1 }).trades;
  assert.ok(a.length > 5); assert.deepEqual(b.map((t) => [t.entry, t.stop, t.tp, t.r]), a.map((t) => [t.entry, t.stop, t.tp, t.r])); assert.deepEqual(b1.map((t) => t.r), a.map((t) => t.r));
});
test('stopMult 1,5 : même entrée, même TP, risque x 1,5, stop plus bas', () => {
  const c = series(), a = new Map(backtestW(c, opt).trades.map((t) => [t.placedIdx, t])), w = backtestW(c, { ...opt, stopMult: 1.5 }).trades; let n = 0;
  for (const t of w) { const x = a.get(t.placedIdx); if (!x) continue; n++; assert.equal(t.entry, x.entry); assert.equal(t.tp, x.tp); assert.ok(Math.abs(t.risk / x.risk - 1.5) < 1e-9); assert.ok(t.stop < x.stop); }
  assert.ok(n > 3);
});
test('match : sépare communs et non appariés ; pairedT', () => {
  const m = match([{ key: 'a', r: -1 }, { key: 'b', r: 3 }, { key: 'c', r: -1 }], [{ key: 'a', r: 2 }, { key: 'b', r: 2.4 }, { key: 'd', r: -1 }]);
  assert.deepEqual(m.d, [3, -0.6000000000000001]); assert.deepEqual(m.onlyV, [-1]); assert.deepEqual(m.onlyC, [-1]);
  assert.ok(pairedT([1, 1.2, 0.9, 1.1, 1]) > 10); assert.equal(pairedT([1]), 0); assert.equal(pairedT([2, 2, 2]), 0);
});
test('judge : une variante identique au contrôle ne passe pas', () => {
  const ctrl = {}, vari = {}; for (let Y = 2011; Y <= 2022; Y++) { const rows = [{ key: Y + ':1', r: -1 }, { key: Y + ':2', r: 3 }, { key: Y + ':3', r: -1 }]; ctrl[Y] = rows; vari[Y] = rows.map((x) => ({ ...x })); }
  assert.equal(judge(ctrl, vari, 2).pass, false);
});
