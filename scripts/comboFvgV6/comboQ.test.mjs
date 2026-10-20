import test from 'node:test';
import assert from 'node:assert/strict';
import { backtest } from './lib/krysBacktestW.js';
import { backtest as backtestRef } from './lib/krysBacktest.js';
import { qualifyingDates, tOne, judge } from './comboQ.mjs';

function series(n = 8000) {
  let seed = 31337; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const t0 = Date.UTC(2020, 0, 6, 5) / 1000, out = []; let p = 8000;
  for (let i = 0; i < n; i++) { const o = p, mv = (rnd() - 0.45) * 24, c = o + mv, h = Math.max(o, c) + rnd() * 6, l = Math.min(o, c) - rnd() * 6; out.push({ t: t0 + i * 900, o, h, l, c }); p = c; }
  return out;
}
const base = { spread: 0.6, stopMargin: 3, minRR: 3, tpMode: 'half', stopMode: 'c1', maxAge: 8, hourFrom: 6, hourTo: 16, entryFraction: 0.5, filter: (a) => a.z.dir > 0 };

test('sans noTargetRR : identique à krysBacktest.js', () => {
  const c = series(), a = backtestRef(c, base).trades, b = backtest(c, base).trades;
  assert.ok(a.length > 5); assert.deepEqual(b.map((t) => [t.entry, t.stop, t.tp, t.r]), a.map((t) => [t.entry, t.stop, t.tp, t.r]));
});
test('noTargetRR = 3 : trades ajoutés sans cible avec TP à 3 R exactement ; les trades avec cible sont inchangés en prix', () => {
  const c = series(), ref = new Map(backtest(c, base).trades.map((t) => [t.placedIdx, t])), w = backtest(c, { ...base, noTargetRR: () => 3 }).trades;
  let added = 0;
  for (const t of w) { const noT = t.target[0] === 0 && t.target[1] === 0; if (noT) { added++; assert.ok(Math.abs(Math.abs(t.tp - t.entry) / t.risk - 3) < 1e-9); } else if (ref.has(t.placedIdx)) assert.equal(t.tp, ref.get(t.placedIdx).tp); }
  assert.ok(added > 0);
});
test('noTargetRR retournant null : aucun ordre sans cible (comme avant)', () => {
  const c = series(), w = backtest(c, { ...base, noTargetRR: () => null }).trades, ref = backtest(c, base).trades;
  assert.deepEqual(w.map((t) => t.r), ref.map((t) => t.r));
});
test('qualifyingDates : lundi après vendredi haussier seulement', () => {
  const c = []; // vendredi 2024-03-01 haussier (06-16 NY), lundi 2024-03-04
  const push = (iso, o, h, l, cl) => c.push({ t: Date.parse(iso) / 1000, o, h, l, c: cl });
  for (let i = 0; i < 40; i++) { const t = Date.UTC(2024, 2, 1, 11) / 1000 + i * 900; c.push({ t, o: 100 + i * 0.5, h: 101 + i * 0.5, l: 99.5 + i * 0.5, c: 100.8 + i * 0.5 }); }
  for (let i = 0; i < 40; i++) { const t = Date.UTC(2024, 2, 4, 11) / 1000 + i * 900; c.push({ t, o: 120, h: 121, l: 119, c: 120 }); }
  const q = qualifyingDates(c); assert.ok(q.has('2024-03-04')); assert.equal(q.has('2024-03-01'), false);
});
test('tOne et judge : cas dégénérés', () => {
  assert.equal(tOne([1]), 0); assert.ok(tOne([1, 1.2, 0.9, 1.1]) > 5);
  const ctrl = { 2011: [{ key: 'a', r: 1, added: false }] }, vari = { 2011: [{ key: 'a', r: 1, added: false }] };
  assert.equal(judge(ctrl, vari).pass, false);
});
