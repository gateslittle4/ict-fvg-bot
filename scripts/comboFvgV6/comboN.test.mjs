import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest } from './lib/krysBacktestW.js';
import { backtest as backtestRef } from './lib/krysBacktest.js';
import { judge } from './comboN.mjs';

function series(n = 4000) {
  let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const t0 = Date.UTC(2020, 0, 6, 5) / 1000, out = []; let p = 8000;
  for (let i = 0; i < n; i++) { const o = p, mv = (rnd() - 0.5) * 24, c = o + mv, h = Math.max(o, c) + rnd() * 6, l = Math.min(o, c) - rnd() * 6; out.push({ t: t0 + i * 900, o, h, l, c }); p = c; }
  return out;
}
const base = { spread: 0.6, stopMargin: 3, stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, filter: (a) => a.z.dir > 0 };

test('modes near/half/3r : identiques à krysBacktest.js', () => {
  const c = series();
  for (const [tpMode, minRR] of [['half', 3], ['near', 3], ['3r', 3], ['half', 0]]) {
    const a = backtestRef(c, { ...base, tpMode, minRR }).trades, b = backtest(c, { ...base, tpMode, minRR }).trades;
    assert.deepEqual(b.map((t) => [t.entry, t.stop, t.tp, t.r]), a.map((t) => [t.entry, t.stop, t.tp, t.r]));
  }
});
test('TP : bord proche <= moitié <= bord lointain du FVG cible, tous au-dessus de l entrée (achats)', () => {
  const c = series(), m = {};
  for (const tpMode of ['near', 'half', 'far']) m[tpMode] = new Map(backtest(c, { ...base, tpMode, minRR: 0 }).trades.map((t) => [t.placedIdx, t]));
  let n = 0;
  for (const [k, tn] of m.near) { const th = m.half.get(k), tf = m.far.get(k); if (!th || !tf) continue; n++; assert.ok(tn.tp <= th.tp + 1e-9 && th.tp <= tf.tp + 1e-9); assert.ok(tn.tp > tn.entry); assert.equal(tn.entry, th.entry); assert.equal(tn.stop, tf.stop); }
  assert.ok(n > 3);
});
test('judge : une variante identique au contrôle ne passe pas', () => {
  const ctrl = {}, vari = {}; for (let Y = 2011; Y <= 2022; Y++) { const rows = [{ key: Y + ':1', r: -1, rr: 3 }, { key: Y + ':2', r: 3, rr: 3 }, { key: Y + ':3', r: -1, rr: 3 }]; ctrl[Y] = rows; vari[Y] = rows.map((x) => ({ ...x })); }
  assert.equal(judge(ctrl, vari, 2).pass, false);
});
