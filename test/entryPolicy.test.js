import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { entryBlockReason, momentumEntryBlockReason, momentumOrderSignal, orderProtection, capLots, MANAGED_SOURCES } from '../src/execution/entryPolicy.js';

test('entryPolicy: a pair held by a managed strategy blocks every entry, except RSI(2) against its own position', () => {
  assert.equal(entryBlockReason({ source: 'silverbullet', heldBy: null }), null);
  assert.match(entryBlockReason({ source: 'silverbullet', heldBy: 'noise' }), /noise already holds/);
  assert.match(entryBlockReason({ source: 'weeklysweep', heldBy: 'rsi2-daily' }), /daily strategy/);
  assert.equal(entryBlockReason({ source: 'rsi2-daily', heldBy: 'rsi2-daily' }), null);
  assert.match(entryBlockReason({ source: 'rsi2-daily', heldBy: 'orb5' }), /orb5 already holds/);
  assert.match(entryBlockReason({ source: 'silverbullet', legAllowed: false }), /kill switch/);
  assert.deepEqual([...MANAGED_SOURCES].sort(), ['noise', 'orb5', 'rsi2-daily']);
});

test('entryPolicy: A/B entry checks - switch, pair held (managed or combo), shared guardrail, in that order', () => {
  assert.equal(momentumEntryBlockReason({}), null);
  assert.match(momentumEntryBlockReason({ strategyEnabled: false, heldBy: 'noise' }), /désactivée/);
  assert.match(momentumEntryBlockReason({ heldBy: 'rsi2-daily', comboHolds: true }), /rsi2-daily already holds/);
  assert.match(momentumEntryBlockReason({ comboHolds: true, guardrailOk: false }), /combo/);
  assert.match(momentumEntryBlockReason({ guardrailOk: false }), /guardrail/);
});

test('entryPolicy: A order - stop at the 5-min extreme, 10R target from the ask, refused under 3 spreads; B - 3-sigma stop, 1-sigma sizing, no target', () => {
  const cfg = { maxLeverage: 4, orb: { rrMultiple: 10, minStopSpreads: 3 }, noise: { emergencyStopVolMultiple: 3 } };
  const a = momentumOrderSignal({ strategy: 'orb5', side: 'buy', stopPrice: 19970 }, { bid: 20000, spread: 0.6, balance: 10000, cfg });
  assert.equal(a.signal.stopPrice, 19970); assert.ok(Math.abs(a.signal.targetPrice - (20000.6 + 10 * 30.6)) < 1e-9); assert.equal(a.maxNotional, 40000);
  assert.match(momentumOrderSignal({ strategy: 'orb5', side: 'buy', stopPrice: 19999.5 }, { bid: 20000, spread: 0.6, balance: 10000, cfg }).skip, /too tight/);
  const b = momentumOrderSignal({ strategy: 'noise', side: 'sell', vol14: 0.01 }, { bid: 5000, spread: 0.25, balance: 10000, cfg });
  assert.equal(b.signal.stopPrice, 5150); assert.equal(b.signal.sizingStopPrice, 5050); assert.equal(b.signal.targetPrice, null);
  assert.match(momentumOrderSignal({ strategy: 'noise', side: 'sell', vol14: 0 }, { bid: 5000, balance: 10000, cfg }).skip, /volatility/);
});

test('entryPolicy: market order widens the stop by the spread and sizes on it; LIMIT unchanged; B sizes on its 1-sigma stop', () => {
  const m = orderProtection({ suggestedSide: 'buy', entryPrice: 100, stopPrice: 98, targetPrice: 106 }, { spread: 0.5 });
  assert.deepEqual([m.protection.stopPrice, m.protection.targetPrice, m.sizingStopPrice], [97.5, 105.5, 97.5]);
  const l = orderProtection({ suggestedSide: 'buy', entryPrice: 100, stopPrice: 98, targetPrice: 106 }, { spread: 0.5, isLimit: true });
  assert.deepEqual([l.protection.stopPrice, l.sizingStopPrice], [98, 98]);
  const b = orderProtection({ suggestedSide: 'sell', entryPrice: 5000, stopPrice: 5150, sizingStopPrice: 5050, targetPrice: null }, { spread: 0.25 });
  assert.equal(b.protection.stopPrice, 5150.25); assert.equal(b.sizingStopPrice, 5050);
});

test('entryPolicy: capLots caps at the volume step and scales the real risk the same way', () => {
  assert.deepEqual(capLots({ lots: 3, actualRiskAmount: 30 }, 2.005, { volumeStep: 0.01 }), { lots: 2, actualRiskAmount: 20 });
  assert.deepEqual(capLots({ lots: 1, actualRiskAmount: 30 }, 2, {}), { lots: 1, actualRiskAmount: 30 });
});

test('entryPolicy: the bot and the replay both use this module (one rule, one place)', () => {
  const bot = fs.readFileSync(new URL('../src/dataSources/cTraderDataSource.js', import.meta.url), 'utf8');
  const replay = fs.readFileSync(new URL('../scripts/runLiveReplay.js', import.meta.url), 'utf8');
  for (const fn of ['entryBlockReason', 'momentumEntryBlockReason', 'momentumOrderSignal', 'orderProtection']) {
    assert.ok(bot.includes(`${fn}(`), `bot does not call ${fn}`);
    assert.ok(replay.includes(`${fn}(`), `replay does not call ${fn}`);
  }
});
