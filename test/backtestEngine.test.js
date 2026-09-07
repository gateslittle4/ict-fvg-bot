import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FvgEngine } from '../src/engines/fvgEngine.js';
import { runBacktest, runBacktestManaged, runBacktestPyramidIndependentStops, summarizeTrades } from '../src/backtest/backtestEngine.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

// Builds: c1,c2,c3 forming a bullish FVG zone [101,103], then a return candle
// that touches the zone (entry at 103 = zone.top), then either a "win" or
// "loss" continuation depending on the caller.
function bullishSetup() {
  return [
    c(1, 100, 101, 99, 100.5),      // c1: high=101
    c(2, 100.5, 105, 100.4, 104.8), // c2: impulsive
    c(3, 104.8, 106, 103, 105.5),   // c3: low=103 -> zone [101,103]
    c(4, 105.5, 107, 104, 106.5),   // no return yet
    c(5, 106.5, 106.6, 102.5, 103.2), // low=102.5 <= 103 -> validated, entry=103
  ];
}

test('backtest records a WIN when target is hit before stop (fvg-edge stop)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 104, 103, 103.9),     // no stop/target yet (entry=103, distance = 103-100.8=2.2, target=103+2*2.2=107.4, stop=100.8)
    c(7, 103.9, 108, 103.5, 107.8),   // high=108 >= target 107.4 -> WIN
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktest({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 2 });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 2);
  assert.equal(trades[0].entryPrice, 103);
});

test('backtest records a LOSS when stop is hit before target', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 103.5, 100.5, 100.9), // low 100.5 <= stop (100.8) -> LOSS
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktest({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 2 });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1);
});

test('when one candle touches both stop and target, the stop wins (conservative)', () => {
  const candles = [
    ...bullishSetup(),
    // entry=103, stop=100.8, target=107.4 -- this candle's range covers both
    c(6, 103.2, 108, 100.5, 105),
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktest({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 2 });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
});

test('a trade still open after maxHoldingCandles is closed as a timeout with partial R', () => {
  const candles = bullishSetup();
  // add enough flat candles (never touch stop 100.8 nor target 107.4) to force a timeout
  for (let i = 0; i < 5; i++) {
    candles.push(c(6 + i, 104, 104.5, 103.5, 104.2));
  }
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktest({
    candles,
    symbol: 'TEST',
    fvgEngine: engine,
    stopMode: 'fvg-edge',
    rrMultiple: 2,
    maxHoldingCandles: 3,
  });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'timeout');
  // exit at close of the candle where the holding limit is reached (entry index + 3)
  assert.equal(trades[0].exitPrice, 104.2);
});

test('swing stop mode uses the lowest low in the lookback window before c1', () => {
  const candles = [
    c(0, 98, 98.5, 97, 98.2),   // NOTE: a shallow "deep low" of 97, before the setup -> pulled in by a wide lookback
    c(1, 100, 101, 99, 100.5),  // c1 (high=101)
    c(2, 100.5, 105, 100.4, 104.8), // c2
    c(3, 104.8, 106, 103, 105.5),   // c3 -> zone [101,103]
    c(4, 105.5, 107, 104, 106.5),
    c(5, 106.5, 106.6, 102.5, 103.2), // validated, entry=103
    c(6, 103.2, 104, 103, 103.9),
    c(7, 103.9, 108, 103.5, 107.8),
    c(8, 107.8, 116, 107, 115.5), // clears the (further away, swing-based) target
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktest({
    candles,
    symbol: 'TEST',
    fvgEngine: engine,
    stopMode: 'swing',
    rrMultiple: 2,
    swingLookback: 2, // only looks at c1 and the candle right before it (index 0), but window is [c1Index-lookback+1, c1Index]
  });

  assert.equal(trades.length, 1);
  // swingLookback=2 -> window = candles[0..1] -> min low = min(97, 99) = 97 (entry=103, distance=6, target=115)
  assert.equal(trades[0].stopPrice, 97);
  assert.equal(trades[0].outcome, 'win');
});

test('only one open trade per symbol at a time - a second validated signal is ignored while a trade is open', () => {
  const candles = [
    ...bullishSetup(), // opens trade #1: entry=103, stop=100.8, target=107.4 (still open after this)
    // A second, independent bearish FVG forms and validates while trade #1 is open — but its price
    // action stays comfortably between the open trade's stop (100.8) and target (107.4), so trade #1
    // never resolves here. This isolates the "single open trade" rule from resolution timing.
    c(6, 105.8, 106, 105.5, 105.9),   // c1' (low=105.5)
    c(7, 105.9, 105.9, 104, 104.2),   // c2' impulsive down
    c(8, 104.2, 104.8, 103.9, 104.3), // c3' (high=104.8 < c1'.low 105.5) -> bearish zone [104.8, 105.5]
    c(9, 104.3, 105, 104.1, 104.6),   // high=105 >= 104.8 -> would validate the bearish FVG
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktest({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 2 });
  // Trade #1 never resolves in this window, and trade #2 must have been blocked -> 0 closed trades.
  assert.equal(trades.length, 0);
});

test('summarizeTrades computes win rate, profit factor and max drawdown correctly', () => {
  const trades = [
    { rMultiple: 2, outcome: 'win' },
    { rMultiple: -1, outcome: 'loss' },
    { rMultiple: 2, outcome: 'win' },
    { rMultiple: -1, outcome: 'loss' },
    { rMultiple: -1, outcome: 'loss' },
  ];
  const summary = summarizeTrades(trades);

  assert.equal(summary.totalSignals, 5);
  assert.equal(summary.wins, 2);
  assert.equal(summary.losses, 3);
  assert.equal(summary.winRate, 2 / 5);
  // equity path: 2, 1, 3, 2, 1 -> peak 3, trough after peak = 1 -> drawdown 2
  assert.equal(summary.maxDrawdownR, 2);
  // profit factor = grossWin(4) / grossLoss(3)
  assert.equal(summary.profitFactor, 4 / 3);
  assert.equal(summary.finalEquityR, 1);
});

// entry=103, stop=100.8, distance=2.2 (from bullishSetup()); rrMultiple=3 -> target=109.6.
// +1R trigger level = 103 + 2.2 = 105.2.

test('breakeven mode: a reversal AFTER +1R scratches at 0R instead of -1R', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),   // high 105.3 >= 105.2 -> triggers move-to-breakeven (starting next candle)
    c(7, 104, 104.5, 102, 103.1),   // low 102 <= breakeven(103) -> scratch, not the original -1R loss
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'breakeven' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'breakeven');
  assert.equal(trades[0].rMultiple, 0);
});

test('breakeven mode: a trade that reaches +1R and then still hits the original target is unaffected (full R)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),    // triggers move-to-breakeven
    c(7, 104, 110, 103.5, 109.8),    // high 110 >= target 109.6 -> full win, breakeven stop never touched
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'breakeven' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 3);
});

test('partial mode: half taken at +1R, remainder reaching target blends to (0.5*1R + 0.5*3R)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),   // triggers the +1R partial take + breakeven on the remaining half
    c(7, 104, 110, 103.5, 109.8),   // remaining half rides to the original 1:3 target
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'partial' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 0.5 * 1 + 0.5 * 3);
  assert.equal(trades[0].managementOutcome, 'partial-then-win');
});

test('partial mode: half taken at +1R, remainder reversing to breakeven blends to (0.5*1R + 0.5*0)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),   // triggers the +1R partial take + breakeven on the remaining half
    c(7, 104, 104.5, 102, 103.1),   // remaining half reverses to breakeven instead of the target
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'partial' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'breakeven');
  assert.equal(trades[0].rMultiple, 0.5 * 1 + 0.5 * 0);
  assert.equal(trades[0].managementOutcome, 'partial-then-breakeven');
});

test('partial mode: stop hit before ever reaching +1R behaves exactly like the unmanaged baseline (-1R, no partial)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 103.5, 100.5, 100.9), // low 100.5 <= stop (100.8), never reached +1R first -> full -1R
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'partial' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1);
  assert.equal(trades[0].managementOutcome, null);
});

test('pyramid mode: adding a second unit at +1R then reaching the original target combines to (3R + 2R)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),   // triggers the +1R add (second unit at ~105.2, stop moves to breakeven 103 for both)
    c(7, 104, 110, 103.5, 109.8),   // high 110 >= target 109.6 -> original leg = 3R, added leg = 3R - 1R = 2R
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'pyramid' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 3 + (3 - 1));
  assert.equal(trades[0].managementOutcome, 'pyramid-then-win');
  assert.equal(trades[0].unitsDeployed, 2);
});

test('pyramid mode: adding a second unit at +1R then reversing to breakeven combines to a NET LOSS (0R + -1R)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),   // triggers the +1R add
    c(7, 104, 104.5, 102, 103.1),   // reverses to breakeven (103) - original leg scratches, added leg loses its full 1R
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'pyramid' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'breakeven');
  assert.equal(trades[0].rMultiple, 0 + (0 - 1));
  assert.equal(trades[0].managementOutcome, 'pyramid-then-breakeven');
});

test('pyramid mode: stop hit before ever reaching +1R behaves exactly like the unmanaged baseline (-1R, no add)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 103.5, 100.5, 100.9), // low 100.5 <= stop (100.8), never reached +1R first -> full -1R, single unit
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestManaged({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3, mode: 'pyramid' });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1);
  assert.equal(trades[0].managementOutcome, null);
  assert.equal(trades[0].unitsDeployed, 1);
});

test('pyramid-independent mode: stop hit before +1R behaves exactly like the baseline (-1R, single unit, no add)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 103.5, 100.5, 100.9), // low 100.5 <= stop (100.8), never reached +1R -> full -1R, single unit
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestPyramidIndependentStops({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3 });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1);
  assert.equal(trades[0].unitsDeployed, 1);
  assert.equal(trades[0].managementOutcome, null);
});

test('pyramid-independent mode: both legs reach the shared target -> combines to (3R + 2R), same total as the shared-stop pyramid', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),   // triggers the +1R add: added entry ~105.2, added stop = 103 (its OWN stop, not a breakeven move)
    c(7, 104, 110, 103.5, 109.8),   // high 110 >= shared target 109.6 -> both legs win
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestPyramidIndependentStops({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3 });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win');
  assert.equal(trades[0].rMultiple, 3 + (3 - 1));
  assert.equal(trades[0].unitsDeployed, 2);
  assert.equal(trades[0].managementOutcome, 'pyramid-independent-win-win');
});

test('pyramid-independent mode: THE FIX - added unit stops out on a pullback, but the ORIGINAL unit survives (untouched stop) and later still wins', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),      // triggers the +1R add (added entry ~105.2, added stop = 103)
    c(7, 104, 104.5, 103, 103.1),      // pulls back to exactly 103: ADDED leg stops out (-1R); original's own stop (100.8) untouched, stays open
    c(8, 103.1, 110, 103, 109.8),      // original later reaches its own target 109.6 -> ORIGINAL leg wins (+3R)
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestPyramidIndependentStops({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3 });

  // Under the OLD shared-stop 'pyramid' mode, candle 7's pullback to 103 would have closed BOTH
  // units right there (net -1R, trade over) - the original would never have gotten to candle 8's
  // recovery. Here the two units are independent, so the original survives and still wins.
  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'win'); // the ORIGINAL unit's own outcome
  assert.equal(trades[0].rMultiple, 3 + -1); // original win (+3R) + added loss (-1R) = 2R, NOT the -1R the old mode would have locked in
  assert.equal(trades[0].unitsDeployed, 2);
  assert.equal(trades[0].managementOutcome, 'pyramid-independent-win-loss');
});

test('pyramid-independent mode: both legs stop out independently (added first, then the original at its own untouched stop)', () => {
  const candles = [
    ...bullishSetup(),
    c(6, 103.2, 105.3, 103, 104),        // triggers the +1R add (added stop = 103)
    c(7, 104, 104.5, 103, 103.1),        // added leg stops out at 103 (-1R); original untouched, stays open
    c(8, 103.1, 103.5, 100.5, 100.9),    // low 100.5 <= original's own stop 100.8 -> original leg loses too (-1R)
  ];
  const engine = new FvgEngine({ symbol: 'TEST' });
  const trades = runBacktestPyramidIndependentStops({ candles, symbol: 'TEST', fvgEngine: engine, stopMode: 'fvg-edge', rrMultiple: 3 });

  assert.equal(trades.length, 1);
  assert.equal(trades[0].outcome, 'loss');
  assert.equal(trades[0].rMultiple, -1 + -1);
  assert.equal(trades[0].unitsDeployed, 2);
  assert.equal(trades[0].managementOutcome, 'pyramid-independent-loss-loss');
});

test('summarizeTrades handles an all-winning series (profitFactor = Infinity, no drawdown)', () => {
  const trades = [
    { rMultiple: 2, outcome: 'win' },
    { rMultiple: 2, outcome: 'win' },
  ];
  const summary = summarizeTrades(trades);
  assert.equal(summary.profitFactor, Infinity);
  assert.equal(summary.maxDrawdownR, 0);
  assert.equal(summary.winRate, 1);
});
