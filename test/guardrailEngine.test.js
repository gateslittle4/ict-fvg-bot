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

// 2026-09-13: real bug found live. cTraderDataSource.js's _loadClosedDeals
// (boot-time replay of the last 24h of REAL closed deals, to seed the
// guardrail after a restart) passed the broker's OWN executionTimestamp
// straight through as `time` - and this broker serializes that field as a
// numeric STRING, confirmed via a real ProtoOAExecutionEvent dump. Before
// the fix, `lastTrade.time + cooldownMinutesAfterLoss * 60000` used a raw
// `+`, which string-concatenates instead of adding once either operand is
// a string - producing an astronomically large "cooldown end" that never
// actually elapses. Net effect: after ANY restart (this bot restarts
// often - see HANDOFF.md) where the last deal in the trailing 24h was a
// loss, trading would be silently blocked (`cooldown_active`) for what
// looks like decades, not the configured cooldown. Fixed with Number(time)
// both at the call site AND inside recordTrade itself (defense in depth).
test('recordTrade coerces a STRING time (matches this broker\'s real executionTimestamp shape) - cooldown still elapses normally', () => {
  const g = new GuardrailEngine({ cooldownMinutesAfterLoss: 30, maxTradesPerDay: 10 });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: -100, time: String(DAY1), balanceAfter: 9900 }); // string, like the real broker response

  const duringCooldown = g.getStatus(DAY1 + 10 * 60 * 1000);
  assert.equal(duringCooldown.blocked, true);
  assert.ok(duringCooldown.blockReasons.includes('cooldown_active'));
  // Without the fix this would be an astronomically large number (string
  // concatenation of two epoch-ms values), not a real ~20-minute remainder.
  assert.ok(duringCooldown.cooldownRemainingMs <= 30 * 60 * 1000);

  const afterCooldown = g.getStatus(DAY1 + 31 * 60 * 1000);
  assert.equal(afterCooldown.blocked, false);
  assert.equal(afterCooldown.cooldownRemainingMs, 0);
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

// Overall (not per-day) challenge target/drawdown tracking (2026-09,
// multi-account/prop-firm rollout - see src/propFirms/index.js).

test('overall drawdown/target tracking is off by default - existing callers see no new blocking', () => {
  const g = new GuardrailEngine();
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: -9000, time: DAY1 + 1000, balanceAfter: 1000 }); // a catastrophic loss
  const status = g.getStatus(DAY1 + 2000);
  assert.equal(status.overallDrawdownBreached, false);
  assert.equal(status.targetReached, false);
  assert.equal(status.overallDrawdownFloor, null);
});

test('static drawdown: floor is fixed at the initial balance, never moves even after new highs', () => {
  const g = new GuardrailEngine({ maxDrawdownPct: 10, maxDrawdownType: 'static' });
  g.setBalance(10000, DAY1);
  assert.equal(g.getStatus(DAY1).overallDrawdownFloor, 9000);
  g.recordTrade({ pnl: 2000, time: DAY1 + 1000, balanceAfter: 12000 }); // new high
  assert.equal(g.getStatus(DAY1 + 2000).overallDrawdownFloor, 9000); // floor unchanged - static means static
  g.recordTrade({ pnl: -3100, time: DAY1 + 3000, balanceAfter: 8900 });
  const status = g.getStatus(DAY1 + 4000);
  assert.equal(status.overallDrawdownBreached, true);
  assert.ok(status.blockReasons.includes('overall_drawdown_breached'));
});

test('trailing-eod drawdown: floor follows the highest END-OF-DAY balance, not real-time equity', () => {
  const g = new GuardrailEngine({ maxDrawdownPct: 10, maxDrawdownType: 'trailing-eod' });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: 3000, time: DAY1 + 1000, balanceAfter: 13000 }); // intraday high, same day
  // Still day 1 - peakEodBalance not updated yet (no day boundary crossed), floor still off the initial balance.
  assert.equal(g.getStatus(DAY1 + 2000).overallDrawdownFloor, 9000);
  const day2 = DAY1 + 24 * 3600 * 1000;
  g.setBalance(13000, day2); // day boundary crossed with balance=13000 -> that becomes the new EOD peak
  assert.equal(g.getStatus(day2).overallDrawdownFloor, 11700); // 13000 * 0.9
});

test("trailing-locks-at-start-balance: floor never rises above the initial balance", () => {
  const g = new GuardrailEngine({ maxDrawdownPct: 5, maxDrawdownType: 'trailing-locks-at-start-balance' });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: 5000, time: DAY1 + 1000, balanceAfter: 15000 }); // peak now 15000
  // 15000 * 0.95 = 14250, but the floor LOCKS at the starting balance (10000) instead of rising past it.
  assert.equal(g.getStatus(DAY1 + 2000).overallDrawdownFloor, 10000);
});

test('an unrecognized maxDrawdownType fails OPEN (never blocks on a config typo)', () => {
  const g = new GuardrailEngine({ maxDrawdownPct: 10, maxDrawdownType: 'made-up-typo' });
  g.setBalance(10000, DAY1);
  g.recordTrade({ pnl: -9500, time: DAY1 + 1000, balanceAfter: 500 });
  const status = g.getStatus(DAY1 + 2000);
  assert.equal(status.overallDrawdownFloor, null);
  assert.equal(status.overallDrawdownBreached, false);
});

test('target reached: flips true once, does NOT block trading, and stays true afterward even on a pullback', () => {
  const g = new GuardrailEngine({ targetPct: 10, maxTradesPerDay: 100 });
  g.setBalance(10000, DAY1);
  assert.equal(g.getStatus(DAY1).targetReached, false);
  g.recordTrade({ pnl: 1000, time: DAY1 + 1000, balanceAfter: 11000 });
  let status = g.getStatus(DAY1 + 2000);
  assert.equal(status.targetReached, true);
  assert.equal(status.blocked, false); // reaching target never blocks - trading continues
  g.recordTrade({ pnl: -500, time: DAY1 + 3000, balanceAfter: 10500 }); // pull back below target
  status = g.getStatus(DAY1 + 4000);
  assert.equal(status.targetReached, true); // sticky - stays true
});

test('consumeTargetReachedEvent fires exactly once, on the first call after the target is hit', () => {
  const g = new GuardrailEngine({ targetPct: 10 });
  g.setBalance(10000, DAY1);
  assert.equal(g.consumeTargetReachedEvent(DAY1), false); // not reached yet
  g.recordTrade({ pnl: 1200, time: DAY1 + 1000, balanceAfter: 11200 });
  assert.equal(g.consumeTargetReachedEvent(DAY1 + 2000), true); // first call after reaching it - fires
  assert.equal(g.consumeTargetReachedEvent(DAY1 + 3000), false); // already consumed - never fires again
  assert.equal(g.getStatus(DAY1 + 4000).targetReached, true); // status itself stays true regardless
});

// 2026-09-14 (Esdras, monitoring overnight - "on dirait que le garde-fou se
// réinitialise à chaque redémarrage"): real bug found. cTraderDataSource.js's
// _loadClosedDeals() replays the last 24h of REAL closed deals into
// recordTrade() at boot specifically so tradesToday/dailyLossPct survive a
// restart - but ProtoOADealListReq's response order is never guaranteed
// chronological, and _ensureDay() (below) resets this.trades every time the
// computed day-key changes. That reset is correct for recordTrade()'s real
// intended use (a live, forward-only stream) but unsafe for a historical
// batch replayed out of order - exactly what a 24h lookback window hits on
// every boot after 00:00 UTC (it spans two calendar days). These two tests
// document the failure this class is exposed to, and prove sorting the
// deals chronologically before replay (the actual fix, in
// cTraderDataSource.js's sortDealsChronologically()) is what's required -
// GuardrailEngine itself is correct and unchanged.
test('recordTrade: replaying deals OUT OF ORDER across a day boundary silently loses already-recorded same-day trades (documents why the caller must sort first)', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 10 });
  const yesterday = DAY1 - 20 * 3600 * 1000; // still within a 24h lookback window from DAY1
  // Scrambled order, exactly what an unsorted ProtoOADealListReq response
  // could hand _loadClosedDeals(): today, today, yesterday, today.
  g.recordTrade({ pnl: 10, time: DAY1 + 1000 }); // today, trade 1
  g.recordTrade({ pnl: 10, time: DAY1 + 2000 }); // today, trade 2
  g.recordTrade({ pnl: -5, time: yesterday }); // yesterday, out of order - flips the day-key BACKWARD
  g.recordTrade({ pnl: 10, time: DAY1 + 3000 }); // today, trade 3 - flips forward again

  // Bug: _ensureDay() wiped trades[] on both flips, so only the LAST today
  // trade survived instead of all 3 - undercounting tradesToday.
  const status = g.getStatus(DAY1 + 4000);
  assert.equal(status.tradesToday, 1); // should be 3 - this is the bug, not the desired behavior
});

test('recordTrade: replaying the SAME deals in chronological order (the fix) counts every same-day trade correctly', () => {
  const g = new GuardrailEngine({ maxTradesPerDay: 10 });
  const yesterday = DAY1 - 20 * 3600 * 1000;
  // Same 4 deals as above, sorted ascending by time first - what
  // sortDealsChronologically() now guarantees before _loadClosedDeals()
  // replays them.
  g.recordTrade({ pnl: -5, time: yesterday });
  g.recordTrade({ pnl: 10, time: DAY1 + 1000 });
  g.recordTrade({ pnl: 10, time: DAY1 + 2000 });
  g.recordTrade({ pnl: 10, time: DAY1 + 3000 });

  const status = g.getStatus(DAY1 + 4000);
  assert.equal(status.tradesToday, 3); // all 3 of today's trades correctly counted
});
