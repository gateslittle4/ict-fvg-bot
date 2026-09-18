import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// public/riskConcentration.js is a plain browser script (no exports): run it in a
// fresh context, the same way the page loads it, and take its function.
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../public/riskConcentration.js', import.meta.url), 'utf8'), ctx);
const compute = (p) => JSON.parse(JSON.stringify(ctx.computeRiskConcentration(p)));

const pos = (symbol, direction, entryPrice, stopLoss, units = 1) => ({ symbol, direction, entryPrice, stopLoss, units });
const BASE = { balance: 10000, riskPctPerTrade: 1, pendingOrders: [] };

test('riskConcentration: nothing open is reported as empty, not as zero risk on something', () => {
  assert.equal(compute({ ...BASE, positions: [] }).empty, true);
});

test('riskConcentration: US100 and US500 both long are one bet taken twice - warned, with the combined risk', () => {
  const r = compute({ ...BASE, positions: [pos('US100', 'bullish', 100, 50, 1), pos('US500', 'bullish', 200, 150, 2)] });
  assert.equal(r.clusters.length, 1);
  assert.equal(r.clusters[0].name, 'Indices actions');
  assert.equal(r.clusters[0].sameDirection, true);
  assert.equal(r.positionRisk, 50 + 100);
  assert.ok(r.warnings.some((w) => w.level === 'warn' && /US100 \+ US500/.test(w.text) && /achat/.test(w.text)));
});

test('riskConcentration: opposite directions in a cluster are not flagged as the same bet', () => {
  const r = compute({ ...BASE, positions: [pos('US100', 'bullish', 100, 50), pos('US500', 'bearish', 200, 250)] });
  assert.equal(r.clusters[0].sameDirection, false);
  assert.equal(r.warnings.length, 0);
});

test('riskConcentration: a stop already past entry (in profit) carries no risk', () => {
  const r = compute({ ...BASE, positions: [pos('US100', 'bullish', 100, 105), pos('XAUUSD', 'bearish', 2000, 1990)] });
  assert.equal(r.positionRisk, 0);
});

test('riskConcentration: a position with no known stop is assumed to risk one full trade, flagged as an estimate', () => {
  const r = compute({ ...BASE, positions: [pos('US100', 'bullish', 100, null)] });
  assert.equal(r.positionRisk, 100); // 1 % of 10 000
  assert.equal(r.clusters[0].entries[0].estimated, true);
});

test('riskConcentration: pending orders count as potential risk, kept apart from real open risk', () => {
  const r = compute({ ...BASE, positions: [pos('EURUSD', 'bullish', 1.1, 1.09, 1000)], pendingOrders: [{ symbol: 'XAUUSD', tradeSide: 'BUY' }] });
  assert.equal(r.pendingRisk, 100);
  assert.ok(Math.abs(r.positionRisk - 10) < 1e-9);
  assert.equal(r.clusters.length, 1); // EURUSD and XAUUSD share the anti-dollar cluster
  assert.equal(r.clusters[0].sameDirection, true);
});

test('riskConcentration: open risk at or above what is left of today\'s loss limit is a danger', () => {
  // limit 3 %, already lost 2.5 % -> 50 left; open risk 100
  const r = compute({ ...BASE, dailyLossLimitPct: 3, dailyLossPct: 2.5, positions: [pos('US100', 'bullish', 100, 0, 1)] });
  assert.equal(r.dailyRoom, 50);
  assert.ok(r.warnings.some((w) => w.level === 'danger' && /journalière/.test(w.text)));
});

test('riskConcentration: room to spare produces no danger', () => {
  const r = compute({ ...BASE, dailyLossLimitPct: 5, dailyLossPct: 0, positions: [pos('US100', 'bullish', 100, 50, 1)] });
  assert.equal(r.warnings.filter((w) => w.level === 'danger').length, 0);
});

test('riskConcentration: risk that would reach the drawdown floor is a danger', () => {
  const r = compute({ ...BASE, drawdownFloor: 9950, currentBalance: 10000, positions: [pos('GER40', 'bearish', 100, 200, 1)] });
  assert.equal(r.drawdownRoom, 50);
  assert.ok(r.warnings.some((w) => w.level === 'danger' && /drawdown/.test(w.text)));
});

test('riskConcentration: an unknown symbol gets its own cluster instead of being lumped with another', () => {
  const r = compute({ ...BASE, positions: [pos('USDJPY', 'bullish', 150, 149, 1)] });
  assert.equal(r.clusters[0].name, 'USDJPY');
});
