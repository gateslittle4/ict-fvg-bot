import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPortfolioBacktest } from '../src/backtest/portfolioSimulator.js';

function candle(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// One full bullish FVG lifecycle using the exact same numeric pattern as
// fvgEngine.test.js (known-good): c1/c2/c3 form the gap [101,103], a
// no-return candle, then a validation candle (low dips to 102, into the
// zone). With stopMode='fvg-edge' and rrMultiple=1: entry=103 (zone.top),
// stop=100.8 (zone.bottom - 10% buffer), distance=2.2, target=105.2.
// The 6th candle resolves the trade: win (high >= 105.2, low stays > 100.8)
// or loss (low <= 100.8).
function bullishCycle(baseTime, stepMs, resolveAsWin) {
  const t = (i) => baseTime + i * stepMs;
  return [
    candle(t(0), 100, 101, 99, 100.5),
    candle(t(1), 100.5, 105, 100.4, 104.8),
    candle(t(2), 104.8, 106, 103, 105.5), // watching: zone [101,103]
    candle(t(3), 105.5, 107, 105, 106.5), // no return yet
    candle(t(4), 106.5, 106.6, 102, 102.5), // validated: entry=103, stop=100.8, target=105.2
    resolveAsWin ? candle(t(5), 102.5, 106, 102, 105) : candle(t(5), 102.5, 105, 100.5, 100.7),
  ];
}

// Two "wide" filler candles (range [90,110] engulfs every real candle's range)
// to insert between chained cycles on the SAME symbol: the FVG gap check
// only looks at the high/low of the FIRST and THIRD candle in any rolling
// 3-window, so a filler in either of those slots can never satisfy the
// strict gap inequality — this neutralizes an accidental cross-cycle "gap"
// that otherwise forms from the seam between one cycle's last candle and
// the next cycle's first (verified empirically: two adjacent cycles chained
// directly DO spuriously form an extra FVG at the seam without this buffer).
function filler(baseTime, stepMs) {
  return [candle(baseTime, 103, 110, 90, 103), candle(baseTime + stepMs, 103, 110, 90, 103)];
}

// Chains cycles (each built by `build(baseTime) => candle[]`) back to back on
// one symbol's timeline, inserting the 2-candle filler buffer between each
// pair so no spurious FVG forms across the seam. Returns {candles, starts}
// where starts[i] is the timestamp each cycle actually began at (useful for
// tests that need to reason about elapsed time between cycles).
function chainCycles(startTime, stepMs, builders) {
  const candles = [];
  const starts = [];
  let t = startTime;
  builders.forEach((build, i) => {
    if (i > 0) {
      candles.push(...filler(t, stepMs));
      t += 2 * stepMs;
    }
    starts.push(t);
    candles.push(...build(t));
    t += 6 * stepMs;
  });
  return { candles, starts };
}

const BASE_CONFIG = { variant: 'baseline', stopMode: 'fvg-edge', rrMultiple: 1, structureEnabled: false, sessionEnabled: false, spread: 0 };
const DAY1 = Date.UTC(2024, 0, 10, 8, 0, 0); // Jan 10 2024, 08:00 UTC

test('guardrail blocks a 3rd signal once maxTradesPerDay closed trades is reached', () => {
  const stepMs = 15 * 60 * 1000;
  const { candles } = chainCycles(DAY1, stepMs, [
    (t) => bullishCycle(t, stepMs, true), // win, closes as trade #1
    (t) => bullishCycle(t, stepMs, false), // loss, closes as trade #2
    (t) => bullishCycle(t, stepMs, true), // should never open - blocked
  ]);

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: BASE_CONFIG },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 2);
  assert.equal(result.blockedSignalsCount, 1);
  assert.ok(result.blockedSignals[0].reasons.includes('max_trades_reached'));
});

test('guardrail blocks a signal that falls inside the post-loss cooldown window', () => {
  // Elapsed time from cycle1's close to cycle2's candidate entry, with the
  // 2-candle filler in between, is 7*stepMs. At stepMs=4min that's 28min -
  // inside a 30-min cooldown.
  const stepMs = 4 * 60 * 1000;
  const { candles } = chainCycles(DAY1, stepMs, [
    (t) => bullishCycle(t, stepMs, false), // loss
    (t) => bullishCycle(t, stepMs, true), // candidate entry ~28 min after cycle1 closes
  ]);

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: BASE_CONFIG },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 1); // only cycle1 closed; cycle2 never got to open
  assert.equal(result.blockedSignalsCount, 1);
  assert.ok(result.blockedSignals[0].reasons.includes('cooldown_active'));
});

test('a signal is allowed once the cooldown window has fully elapsed', () => {
  // Same shape, but stepMs=15min -> elapsed = 7*15 = 105min, past a 30-min cooldown.
  const stepMs = 15 * 60 * 1000;
  const { candles } = chainCycles(DAY1, stepMs, [
    (t) => bullishCycle(t, stepMs, false), // loss
    (t) => bullishCycle(t, stepMs, true),
  ]);

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: BASE_CONFIG },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 2);
  assert.equal(result.blockedSignalsCount, 0);
});

test('guardrail blocks further entries once the daily loss limit is reached', () => {
  const stepMs = 15 * 60 * 1000;
  const { candles } = chainCycles(DAY1, stepMs, [
    (t) => bullishCycle(t, stepMs, false), // loss: risking 2% of balance -> daily loss = 2%
    (t) => bullishCycle(t, stepMs, true),
  ]);

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: BASE_CONFIG },
    riskPctPerTrade: 2,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 100, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 2, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 1);
  assert.equal(result.blockedSignalsCount, 1);
  assert.ok(result.blockedSignals[0].reasons.includes('daily_loss_limit_reached'));
});

test('daily counters reset on the next trading day', () => {
  const stepMs = 15 * 60 * 1000;
  const { candles: day1Candles } = chainCycles(DAY1, stepMs, [
    (t) => bullishCycle(t, stepMs, true), // trade #1, day 1
    (t) => bullishCycle(t, stepMs, false), // trade #2, day 1 -> hits maxTradesPerDay
  ]);
  const lastTime = day1Candles[day1Candles.length - 1].time;
  const bridge = filler(lastTime + stepMs, stepMs); // neutralize the seam before day 2's cycle
  const DAY2 = DAY1 + 24 * 60 * 60 * 1000;
  const cycle3 = bullishCycle(DAY2, stepMs, true); // day 2 - should be allowed again

  const candles = [...day1Candles, ...bridge, ...cycle3];
  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: BASE_CONFIG },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 2, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 3);
  assert.equal(result.blockedSignalsCount, 0);
});

test('risk per trade compounds off the current balance, not the starting balance', () => {
  const stepMs = 15 * 60 * 1000;
  const { candles } = chainCycles(DAY1, stepMs, [
    (t) => bullishCycle(t, stepMs, true), // win
    (t) => bullishCycle(t, stepMs, true), // win
  ]);

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: BASE_CONFIG },
    riskPctPerTrade: 10,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 100, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  // Trade 1: risk = 10% of 10000 = 1000, rMultiple = 1 (target hit) -> +1000 -> balance 11000
  // Trade 2: risk = 10% of 11000 = 1100, rMultiple = 1 -> +1100 -> balance 12100
  assert.equal(result.closedTrades[0].pnl, 1000);
  assert.equal(result.closedTrades[0].balanceAfter, 11000);
  assert.equal(result.closedTrades[1].pnl, 1100);
  assert.equal(result.finalBalance, 12100);
});

// Pyramid-mode tests: same c1-c5 setup as bullishCycle (entry=103, stop=100.8,
// distance=2.2), but with rrMultiple=3 (target=109.6) and two extra candles so
// the trade first reaches +1R (105.2) WITHOUT resolving, then resolves on a
// later candle - exactly what triggers the pyramid add.
function pyramidSetupCandles(baseTime, stepMs, resolveAsWin) {
  const t = (i) => baseTime + i * stepMs;
  return [
    candle(t(0), 100, 101, 99, 100.5),
    candle(t(1), 100.5, 105, 100.4, 104.8),
    candle(t(2), 104.8, 106, 103, 105.5), // watching: zone [101,103]
    candle(t(3), 105.5, 107, 105, 106.5), // no return yet
    candle(t(4), 106.5, 106.6, 102, 102.5), // validated: entry=103, stop=100.8, distance=2.2
    candle(t(5), 103.2, 105.3, 103, 104), // high 105.3 >= 105.2 (+1R) -> triggers the pyramid add, doesn't resolve
    resolveAsWin
      ? candle(t(6), 104, 110, 103.5, 109.8) // high 110 >= target 109.6 -> win
      : candle(t(6), 104, 104.5, 102, 103.1), // low 102 <= breakeven (103) -> reverses
  ];
}

test('pyramid mode: a full win pays out BOTH units (original 3R + added 2R)', () => {
  const stepMs = 15 * 60 * 1000;
  const candles = pyramidSetupCandles(DAY1, stepMs, true);
  const cfg = { ...BASE_CONFIG, rrMultiple: 3, tradeManagement: { mode: 'pyramid', addAtR: 1 } };

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: cfg },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 100, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 1);
  assert.equal(result.closedTrades[0].outcome, 'win');
  assert.equal(result.closedTrades[0].pyramided, true);
  // riskAmount = 1% of 10000 = 100 for EACH unit (added unit sized off the
  // same still-unchanged balance, since this is the only trade in the run).
  // original leg: 100 * 3R = 300. added leg: 100 * (3R - 1R) = 200. Total = 500.
  assert.equal(result.closedTrades[0].pnl, 500);
  assert.equal(result.finalBalance, 10500);
});

test('pyramid mode: a reversal to breakeven AFTER the add produces a NET LOSS, not a scratch', () => {
  const stepMs = 15 * 60 * 1000;
  const candles = pyramidSetupCandles(DAY1, stepMs, false);
  const cfg = { ...BASE_CONFIG, rrMultiple: 3, tradeManagement: { mode: 'pyramid', addAtR: 1 } };

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: candles },
    configBySymbol: { A: cfg },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 100, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 1);
  assert.equal(result.closedTrades[0].outcome, 'breakeven');
  assert.equal(result.closedTrades[0].pyramided, true);
  // original leg: 100 * 0R = 0 (scratch). added leg: 100 * (0R - 1R) = -100. Total = -100.
  assert.equal(result.closedTrades[0].pnl, -100);
  assert.equal(result.finalBalance, 9900);
});

test('the guardrail budget is shared across symbols (a trade on A can block a signal on B)', () => {
  const stepMs = 15 * 60 * 1000;
  const cycleA = bullishCycle(DAY1, stepMs, true); // closes as the account's 1st trade today
  const cycleB = bullishCycle(DAY1 + 6 * stepMs, stepMs, true); // B's candidate entry - should be blocked

  const result = runPortfolioBacktest({
    candlesBySymbol: { A: cycleA, B: cycleB },
    configBySymbol: { A: BASE_CONFIG, B: BASE_CONFIG },
    riskPctPerTrade: 1,
    startingBalance: 10000,
    guardrailConfig: { maxTradesPerDay: 1, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 },
  });

  assert.equal(result.totalTrades, 1);
  assert.equal(result.closedTrades[0].symbol, 'A');
  assert.equal(result.blockedSignalsCount, 1);
  assert.equal(result.blockedSignals[0].symbol, 'B');
  assert.ok(result.blockedSignals[0].reasons.includes('max_trades_reached'));
});
