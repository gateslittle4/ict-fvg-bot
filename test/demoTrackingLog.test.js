import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpreadAggregator, toSpreadRow, toOrderEventRow, classifyExit, extraTradeFields, upsertSpreadRows, logOrderEvent, SPREAD_BUCKET_MS } from '../src/dataSources/demoTrackingLog.js';

const T0 = Date.UTC(2026, 8, 21, 12, 0, 0);

test('spreads are aggregated per symbol and 15-minute bucket (min / avg / max / count)', () => {
  const a = createSpreadAggregator();
  a.record('US100', 0.6, T0 + 1000); a.record('US100', 1.8, T0 + 60000); a.record('US100', 0.6, T0 + 120000);
  a.record('GER40', 0.5, T0 + 5000);
  a.record('US100', 0.7, T0 + SPREAD_BUCKET_MS + 1); // next bucket
  const done = a.take(T0 + SPREAD_BUCKET_MS + 2); // first bucket ended, second still open
  assert.equal(done.length, 2);
  const us = toSpreadRow(done.find((b) => b.symbol === 'US100'));
  assert.equal(us.samples, 3); assert.equal(us.spread_min, 0.6); assert.equal(us.spread_max, 1.8);
  assert.ok(Math.abs(us.spread_avg - 1.0) < 1e-9);
  assert.equal(us.bucket_start, new Date(T0).toISOString());
  assert.equal(a.size, 1);
  assert.equal(a.take(0, { force: true }).length, 1); // force flush at shutdown
});

test('garbage spreads are ignored, never stored', () => {
  const a = createSpreadAggregator();
  a.record('US100', NaN, T0); a.record('US100', -1, T0); a.record('', 1, T0); a.record('US100', 1, NaN);
  assert.equal(a.size, 0);
});

test('exit reason: stop, target, gap through the stop, other', () => {
  const buy = { direction: 'bullish', entryPrice: 100, stopPrice: 98, targetPrice: 106 };
  assert.equal(classifyExit(buy, 98.1), 'stop');
  assert.equal(classifyExit(buy, 105.9), 'target');
  assert.equal(classifyExit(buy, 90), 'stop (gap)');
  assert.equal(classifyExit(buy, 102), 'other');
  const sell = { direction: 'bearish', entryPrice: 100, stopPrice: 102, targetPrice: 94 };
  assert.equal(classifyExit(sell, 110), 'stop (gap)');
  assert.equal(classifyExit(null, 100), null);
});

test('extra trade fields: slippage is signed by side, missing data stays null', () => {
  const buy = extraTradeFields({ direction: 'bullish', entryPrice: 100, signalPrice: 100, fillPrice: 100.4, stopPrice: 98, targetPrice: 106, spreadAtEntry: 0.6, riskPct: 0.3, signalTime: T0, orderTime: T0 + 2000 }, 106);
  assert.ok(Math.abs(buy.slippage - 0.4) < 1e-9);
  assert.equal(buy.exit_reason, 'target'); assert.equal(buy.spread_at_entry, 0.6); assert.equal(buy.order_time, new Date(T0 + 2000).toISOString());
  const sell = extraTradeFields({ direction: 'bearish', entryPrice: 100, signalPrice: 100, fillPrice: 99.5 }, 101);
  assert.ok(Math.abs(sell.slippage - 0.5) < 1e-9); // sold lower than planned = worse
  const bare = extraTradeFields({ direction: 'bullish', entryPrice: 100 }, undefined);
  assert.equal(bare.fill_price, null); assert.equal(bare.slippage, null); assert.equal(bare.exit_price, null); assert.equal(bare.risk_pct, null);
});

test('order event row keeps null for missing fields and truncates long details', () => {
  const r = toOrderEventRow({ symbol: 'US100', event: 'rejected', detail: 'x'.repeat(900), time: T0 });
  assert.equal(r.detail.length, 500); assert.equal(r.price, null); assert.equal(r.event_time, new Date(T0).toISOString());
});

test('database failures are swallowed (never disturb the live loop), no client is a no-op', async () => {
  const warns = []; const log = { warn: (m) => warns.push(m) };
  await upsertSpreadRows({ from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) }, [{ a: 1 }], { log });
  await logOrderEvent({ from: () => ({ insert: async () => { throw new Error('down'); } }) }, { symbol: 'X', event: 'signal' }, { log });
  assert.equal(warns.length, 2);
  await upsertSpreadRows(null, [{ a: 1 }]); await logOrderEvent(null, { symbol: 'X', event: 'signal' });
});

import { toTradeRow } from '../src/dataSources/supabaseTradeLog.js';
test('toTradeRow carries the extra demo-tracking columns only when given', () => {
  const base = { symbol: 'US100', source: 'fvg', direction: 'bullish', outcome: 'win', rMultiple: 2, entryPrice: 100, entryTime: T0, exitTime: T0 + 1000, pnlUsd: 10, balanceAfter: 10010 };
  assert.equal('stop_price' in toTradeRow(base), false);
  const row = toTradeRow({ ...base, extra: extraTradeFields({ direction: 'bullish', entryPrice: 100, stopPrice: 98, targetPrice: 106, fillPrice: 100.2 }, 106) });
  assert.equal(row.stop_price, 98); assert.equal(row.exit_reason, 'target'); assert.ok(Math.abs(row.slippage - 0.2) < 1e-9); assert.equal(row.symbol, 'US100');
});
