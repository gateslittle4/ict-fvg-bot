import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';

const DAY1 = new Date('2026-09-05T08:00:00Z').getTime();

test('allows trading fresh, with no trades recorded', () => {
  const g = new GuardrailEngine();
  g.setBalance(10000, DAY1);
  const status = g.getStatus(DAY1);
  assert.equal(status.blocked, false);
  assert.equal(status.tradesToday, 0);
});

test('blocks after max trades per day reached', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 2 });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: 50, time: DAY1 + 1000, balanceAfter: 10050 });
  let status = g.getStatus(DAY1 + 2000);
  assert.equal(status.blocked, false);

  g.recordTrade({ pnl: 30, time: DAY1 + 3000, balanceAfter: 10080 });
  status = g.getStatus(DAY1 + 4000);
  assert.equal(status.blocked, true);
  assert.ok(status.blockReasons.includes('max_trades_reached'));
});

test('enforces cooldown after a losing trade and clears once it elapses', () => {
  const g = new GuardrailEngine({ cooldownMinutesAfterLoss: 30, maxTradesPerDay: 10 });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: -100, time: DAY1, balanceAfter: 9900 });

  const duringCooldown = g.getStatus(DAY1 + 10 * 60 * 1000); // 10 min later
  assert.equal(duringCooldown.blocked, true);
  assert.ok(duringCooldown.blockReasons.includes('cooldown_active'));
  assert.ok(duringCooldown.cooldownRemainingMs > 0);

  const afterCooldown = g.getStatus(DAY1 + 31 * 60 * 1000); // 31 min later
  assert.equal(afterCooldown.blocked, false);
  assert.equal(afterCooldown.cooldownRemainingMs, 0);
});

test('a winning trade does not trigger cooldown', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 10 });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: 75, time: DAY1, balanceAfter: 10075 });
  const status = g.getStatus(DAY1 + 60 * 1000);
  assert.equal(status.blocked, false);
});

test('blocks once daily loss limit % is reached', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 10, dailyLossLimitPct: 2, cooldownMinutesAfterLoss: 0 });
  g.setBalance(10000, DAY1); // starting balance 10000, 2% = 200
  g.recordTrade({ pnl: -120, time: DAY1, balanceAfter: 9880 });
  let status = g.getStatus(DAY1 + 1000);
  assert.equal(status.blocked, false); // only 1.2% lost so far

  g.recordTrade({ pnl: -90, time: DAY1 + 2000, balanceAfter: 9790 }); // total -210 = 2.1%
  status = g.getStatus(DAY1 + 3000);
  assert.equal(status.blocked, true);
  assert.ok(status.blockReasons.includes('daily_loss_limit_reached'));
});

test('resets trade count, cooldown and daily pnl on a new trading day', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 1, cooldownMinutesAfterLoss: 30 });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: -500, time: DAY1, balanceAfter: 9500 }); // blocks: max trades + cooldown + daily loss

  const sameDay = g.getStatus(DAY1 + 60 * 1000);
  assert.equal(sameDay.blocked, true);

  const nextDay = DAY1 + 24 * 3600 * 1000;
  const status = g.getStatus(nextDay);
  assert.equal(status.blocked, false);
  assert.equal(status.tradesToday, 0);
  assert.equal(status.dailyPnl, 0);
  // starting balance should roll forward to the last known equity (9500), not reset to the old 10000
  assert.equal(status.startingBalance, 9500);
});

test('multiple simultaneous block reasons are all reported', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 1, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 1 });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: -300, time: DAY1, balanceAfter: 9700 });
  const status = g.getStatus(DAY1 + 1000);
  assert.equal(status.blocked, true);
  assert.ok(status.blockReasons.includes('max_trades_reached'));
  assert.ok(status.blockReasons.includes('cooldown_active'));
  assert.ok(status.blockReasons.includes('daily_loss_limit_reached'));
});
