import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';

function c(time, open, high, low, close) {
  return { time, open, high, low, close };
}

const M15 = 900000;
const HOUR = 3600000;

function permissiveGuardrail() {
  return new GuardrailEngine({ maxTradesPerDay: 100, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
}

const BASELINE_FVG_CFG = {
  variant: 'baseline',
  stopMode: 'fvg-edge',
  rrMultiple: 3,
  structureEnabled: false,
  sessionEnabled: false,
  liquiditySweepEnabled: false,
};

test('LiveStrategyEngine (FVG): a 3-candle gap emits "watching", the re-entry candle emits an actionable "validated" signal with entry/stop/target computed via the shared computeStop()', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });

  assert.deepEqual(engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100)), []);
  assert.deepEqual(engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101)), []);

  const watchingEvs = engine.ingestCandle('TEST1', c(2 * M15, 102, 105, 103, 104)); // c1.high(101) < c3.low(103) -> bullish gap [101,103]
  assert.equal(watchingEvs.length, 1);
  assert.equal(watchingEvs[0].type, 'watching');
  assert.equal(watchingEvs[0].source, 'fvg');

  const validatedEvs = engine.ingestCandle('TEST1', c(3 * M15, 104, 104, 102, 103)); // low=102 dips into the zone -> validated
  assert.equal(validatedEvs.length, 1);
  const v = validatedEvs[0];
  assert.equal(v.type, 'validated');
  assert.equal(v.source, 'fvg');
  assert.equal(v.entryPrice, 103); // bullish -> zone.top
  assert.ok(Math.abs(v.stopPrice - 100.8) < 1e-9); // fvg-edge: zone.bottom(101) - 10% of zone height(2) = 100.8
  assert.ok(Math.abs(v.distance - 2.2) < 1e-9);
  assert.ok(Math.abs(v.targetPrice - 109.6) < 1e-9); // entry + 3R
  assert.equal(v.blockedReason, null);
  assert.equal(v.riskAmount, 100); // 1% of the default $10,000 balance

  const open = engine.getOpenPosition('TEST1');
  assert.ok(open, 'expected a position to have opened');
  assert.equal(open.source, 'fvg');
});

test('LiveStrategyEngine (FVG): the open position resolves on a target hit with outcome "win"', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd);
  }
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 110, 103, 109)); // high=110 >= target 109.6... actually target 109.6 <= 110
  const closedEvs = evs.filter((e) => e.type === 'closed');
  assert.equal(closedEvs.length, 1);
  assert.equal(closedEvs[0].outcome, 'win');
  assert.equal(closedEvs[0].source, 'fvg');
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('LiveStrategyEngine (FVG): the open position resolves on a stop hit with outcome "loss"', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd);
  }
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 102, 103, 99, 100)); // low=99 <= stop 100.8
  const closedEvs = evs.filter((e) => e.type === 'closed');
  assert.equal(closedEvs.length, 1);
  assert.equal(closedEvs[0].outcome, 'loss');
});

test('LiveStrategyEngine (FVG): a stale position times out after maxHoldingCandles even without touching stop or target', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd);
  }
  // Force staleness directly rather than replaying 480 candles: back-date the recorded entryIndex.
  engine.openPositions.get('TEST1').entryIndex = -1000;
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 103.5, 102.5, 103)); // stays well inside [stop, target] - no stop/target hit
  const closedEvs = evs.filter((e) => e.type === 'closed');
  assert.equal(closedEvs.length, 1);
  assert.equal(closedEvs[0].outcome, 'timeout');
});

test('LiveStrategyEngine: guardrail block prevents a position from opening, but the signal is still reported with blockedReason', () => {
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 1, cooldownMinutesAfterLoss: 0, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, 0);
  guardrail.recordTrade({ pnl: -10, time: 0, balanceAfter: 9990 }); // exhausts the 1-trade/day budget
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104)]) {
    engine.ingestCandle('TEST1', cd);
  }
  const evs = engine.ingestCandle('TEST1', c(3 * M15, 104, 104, 102, 103));
  assert.equal(evs.length, 1);
  assert.equal(evs[0].blockedReason, 'guardrail');
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('LiveStrategyEngine: netting blocks a second FVG signal on the same symbol while a position is already open', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd);
  }
  const firstOpen = engine.getOpenPosition('TEST1');
  assert.ok(firstOpen);

  engine.ingestCandle('TEST1', c(4 * M15, 103, 104, 103, 103.5)); // stays inside [stop, target] - first position stays open
  engine.ingestCandle('TEST1', c(5 * M15, 103.5, 108, 106, 107)); // forms a second, independent bullish gap's c1
  engine.ingestCandle('TEST1', c(6 * M15, 107, 108, 106, 107.5)); // c2
  const evs = engine.ingestCandle('TEST1', c(7 * M15, 107.5, 109, 108.5, 108.8)); // c3: c1.high(108) < c3.low(108.5) -> new gap watched+validated same tick? (validated fires once price re-enters, checked below)

  // The second gap's own re-entry (a separate later candle) is exactly what would trigger a
  // 'validated' event netted against the still-open first position - assert that path directly.
  const secondEvs = engine.ingestCandle('TEST1', c(8 * M15, 108.8, 108.9, 106, 106.5)); // low dips back into [106,108.5] zone -> validated, but netted
  const secondValidated = secondEvs.find((e) => e.type === 'validated');
  assert.ok(secondValidated, 'expected the second gap to reach validated stage');
  assert.equal(secondValidated.blockedReason, 'netting');

  // Netting must guarantee the ORIGINAL position is still the one open, untouched.
  assert.equal(engine.getOpenPosition('TEST1').id, firstOpen.id);
});

test('LiveStrategyEngine (Divergence): a large z-score deviation triggers a "validated" long-the-laggard signal on the laggard symbol at the aligned H1 boundary candle', () => {
  const guardrail = permissiveGuardrail();
  const divCfg = { pair: ['A', 'B'], lookback: 5, zThreshold: 2, atrPeriod: 3, stopAtrMultiple: 1.5, rrMultiple: 3, maxHoldingM15Candles: 480 };
  const engine = new LiveStrategyEngine({
    symbols: ['A', 'B'],
    fvgConfig: {},
    divergenceConfig: divCfg,
    guardrail,
    riskPctPerTrade: 1,
  });

  // One "candle" per H1 bucket (hourly spacing) keeps the fixture small; resampleCandles
  // buckets purely by timestamp, so this is a faithful (if coarse) H1 series. Small
  // wicks around each close give a non-zero ATR without perturbing the log-ratio (which
  // only reads .close).
  const closesA = [100, 101, 100, 101, 100, 100, 150, 150];
  const closesB = [100, 100, 100, 100, 100, 100, 100, 101];
  const mk = (t, v) => c(t, v, v + 0.5, v - 0.5, v);

  let fired = null;
  for (let i = 0; i < closesA.length; i++) {
    const evs = engine.ingestCandle('A', mk(i * HOUR, closesA[i]));
    if (evs.length) fired = evs;
  }
  assert.equal(fired, null, 'no signal should fire while feeding A alone (B has no history yet)');

  for (let i = 0; i < closesB.length; i++) {
    const evs = engine.ingestCandle('B', mk(i * HOUR, closesB[i]));
    if (evs.length) fired = evs;
  }

  assert.ok(fired, 'expected the divergence signal to fire once B catches up to the aligned boundary candle');
  assert.equal(fired.length, 1);
  const sig = fired[0];
  assert.equal(sig.source, 'divergence');
  assert.equal(sig.symbol, 'B'); // B is the laggard (z >= +threshold)
  assert.equal(sig.direction, 'bullish');
  assert.equal(sig.suggestedSide, 'buy');
  assert.equal(sig.entryPrice, 101); // candle.open of the aligned entry candle
  assert.ok(Math.abs(sig.stopPrice - 99.5) < 1e-9); // entry - 1.5*ATR(3)@signal-bar(1) = 101 - 1.5
  assert.ok(Math.abs(sig.targetPrice - 105.5) < 1e-9); // entry + 3R
  assert.equal(sig.blockedReason, null);
  assert.equal(engine.getOpenPosition('B').source, 'divergence');
});

test('LiveStrategyEngine: netting blocks a Divergence signal on a symbol that already has an open FVG position', () => {
  const guardrail = permissiveGuardrail();
  const divCfg = { pair: ['A', 'B'], lookback: 5, zThreshold: 2, atrPeriod: 3, stopAtrMultiple: 1.5, rrMultiple: 3, maxHoldingM15Candles: 480 };
  const engine = new LiveStrategyEngine({
    symbols: ['A', 'B'],
    fvgConfig: { B: BASELINE_FVG_CFG },
    divergenceConfig: divCfg,
    guardrail,
    riskPctPerTrade: 1,
  });

  // Manually mark B as already having an open FVG position (equivalent to it having formed
  // naturally) so we can isolate the netting check itself from also needing a real FVG fixture.
  engine.openPositions.set('B', {
    source: 'fvg', id: 'fake', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 99, targetPrice: 103, distance: 1, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const closesA = [100, 101, 100, 101, 100, 100, 150, 150];
  const closesB = [100, 100, 100, 100, 100, 100, 100, 101];
  const mk = (t, v) => c(t, v, v + 0.5, v - 0.5, v);
  for (let i = 0; i < closesA.length; i++) engine.ingestCandle('A', mk(i * HOUR, closesA[i]));

  let fired = null;
  for (let i = 0; i < closesB.length; i++) {
    const evs = engine.ingestCandle('B', mk(i * HOUR, closesB[i])).filter((e) => e.source === 'divergence');
    if (evs.length) fired = evs;
  }
  assert.ok(fired, 'the divergence signal should still be reported (informational), just blocked');
  assert.equal(fired[0].blockedReason, 'netting');
  assert.equal(engine.getOpenPosition('B').source, 'fvg', 'the pre-existing FVG position must remain untouched');
});

// --- Pyramid add-on ("stops indépendants, sans breakeven") ---------------

function engineWithPyramid(pyramidConfig = { enabled: true, addAtR: 1, symbols: ['TEST1'] }) {
  const guardrail = permissiveGuardrail();
  return new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
    pyramidConfig,
  });
}

function openBullishTest1(engine) {
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd);
  }
  // open: entry 103, stop 100.8, distance 2.2, target 109.6 (same fixture as the FVG tests above)
}

test('LiveStrategyEngine (pyramid): disabled by default - no pyramid event fires even once +1R is reached', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
    // pyramidConfig intentionally omitted - matches the real default (CONFIG.pyramid.enabled=false)
  });
  openBullishTest1(engine);
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104)); // high 105.3 >= entry(103) + 1*distance(2.2) = 105.2
  assert.equal(evs.filter((e) => e.type.startsWith('pyramid')).length, 0);
  assert.equal(engine.getPyramidPending('TEST1'), null);
});

test('LiveStrategyEngine (pyramid): +1R reached requests an independent add-on order with its own entry/stop/target, original untouched', () => {
  const engine = engineWithPyramid();
  openBullishTest1(engine);
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104)); // high 105.3 >= 105.2 (=103 + 1*2.2)
  const req = evs.find((e) => e.type === 'pyramid-order-requested');
  assert.ok(req, 'expected a pyramid-order-requested event');
  assert.equal(req.symbol, 'TEST1');
  assert.equal(req.direction, 'bullish');
  assert.ok(Math.abs(req.entryPrice - 105.2) < 1e-9); // original entry(103) + 1*distance(2.2)
  assert.ok(Math.abs(req.stopPrice - 103) < 1e-9); // add's own stop = its own entry - distance (numerically = original entry, but a fresh stop, not a breakeven move)
  assert.ok(Math.abs(req.targetPrice - 109.6) < 1e-9); // same target the original is aiming for
  assert.equal(engine.getPyramidPending('TEST1').status, 'requested');

  // The ORIGINAL position's own stop/target must be completely unaffected.
  const open = engine.getOpenPosition('TEST1');
  assert.ok(Math.abs(open.stopPrice - 100.8) < 1e-9);
  assert.ok(Math.abs(open.targetPrice - 109.6) < 1e-9);
});

test('LiveStrategyEngine (pyramid): only requests once per trade - a second candle past +1R does not re-fire', () => {
  const engine = engineWithPyramid();
  openBullishTest1(engine);
  engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104));
  assert.equal(engine.getPyramidPending('TEST1').status, 'requested');
  const evs = engine.ingestCandle('TEST1', c(5 * M15, 104, 106, 104, 105));
  assert.equal(evs.filter((e) => e.type === 'pyramid-order-requested').length, 0);
});

test('LiveStrategyEngine (pyramid): original resolving BEFORE the add-on order fills cancels the still-pending order', () => {
  const engine = engineWithPyramid();
  openBullishTest1(engine);
  engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104)); // requests the add-on
  engine.markPyramidOrderPlaced('TEST1', 'broker-order-42'); // execution layer confirms it reached the broker

  // A pullback all the way to the ORIGINAL's own stop (100.8) - the add-on never got filled.
  const evs = engine.ingestCandle('TEST1', c(5 * M15, 104, 104, 99, 100));
  const closed = evs.find((e) => e.type === 'closed');
  assert.equal(closed.outcome, 'loss');
  const cancel = evs.find((e) => e.type === 'pyramid-order-cancel-requested');
  assert.ok(cancel, 'expected the still-pending pyramid order to be cancelled');
  assert.equal(cancel.brokerOrderId, 'broker-order-42');
  assert.equal(engine.getPyramidPending('TEST1'), null);
});

test('LiveStrategyEngine (pyramid): once markPyramidOrderFilled() is called, the original resolving later does NOT request a cancel (it is now an independent broker position)', () => {
  const engine = engineWithPyramid();
  openBullishTest1(engine);
  engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104));
  engine.markPyramidOrderPlaced('TEST1', 'broker-order-42');

  const filled = engine.markPyramidOrderFilled('TEST1');
  assert.equal(filled.brokerOrderId, 'broker-order-42');
  assert.equal(engine.getPyramidPending('TEST1'), null);

  // Original later resolves (recovers to its own target) - no cancel event, nothing left to cancel.
  const evs = engine.ingestCandle('TEST1', c(5 * M15, 104, 110, 104, 109));
  const closed = evs.find((e) => e.type === 'closed');
  assert.equal(closed.outcome, 'win');
  assert.equal(evs.filter((e) => e.type === 'pyramid-order-cancel-requested').length, 0);
});

test('LiveStrategyEngine (pyramid): a bearish position computes the add-on entry/stop/target correctly (mirror image of the bullish fixture)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
    pyramidConfig: { enabled: true, addAtR: 1, symbols: ['TEST1'] },
  });
  // Exact mirror (price' = 200 - price, high/low swapped) of the bullish fixture above:
  // zone [97,99], entry 97 (zone.bottom), stop 99.2, distance 2.2, target 90.4.
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 100, 98, 99), c(2 * M15, 98, 97, 95, 96), c(3 * M15, 96, 98, 96, 97)]) {
    engine.ingestCandle('TEST1', cd);
  }
  const open = engine.getOpenPosition('TEST1');
  assert.ok(open, 'expected the mirrored fixture to validate a bearish position');
  assert.equal(open.direction, 'bearish');
  assert.ok(Math.abs(open.entryPrice - 97) < 1e-9);
  assert.ok(Math.abs(open.stopPrice - 99.2) < 1e-9);
  assert.ok(Math.abs(open.targetPrice - 90.4) < 1e-9);

  const evs = engine.ingestCandle('TEST1', c(4 * M15, 97, 97, 94.5, 95)); // low 94.5 <= 97 - 1*2.2 = 94.8
  const req = evs.find((e) => e.type === 'pyramid-order-requested');
  assert.ok(req, 'expected a pyramid-order-requested event');
  assert.ok(Math.abs(req.entryPrice - 94.8) < 1e-9); // 97 - 1*2.2
  assert.ok(Math.abs(req.stopPrice - 97) < 1e-9); // add's own stop = its own entry + distance (bearish), ABOVE its entry, not a breakeven move
  assert.ok(Math.abs(req.targetPrice - 90.4) < 1e-9); // same target as the original
});

test('getHistory() returns a copy of the retained candles, not a live reference to internal state', () => {
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail: permissiveGuardrail(),
  });

  assert.deepEqual(engine.getHistory('TEST1'), []);

  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101));

  const snapshot = engine.getHistory('TEST1');
  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot[0], c(0, 100, 101, 99, 100));

  snapshot.push(c(2 * M15, 999, 999, 999, 999)); // mutating the returned array must not affect the engine
  assert.equal(engine.getHistoryLength('TEST1'), 2);
});

test('getHistory() for an unknown symbol returns an empty array, not undefined', () => {
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail: permissiveGuardrail(),
  });
  assert.deepEqual(engine.getHistory('UNKNOWN'), []);
});
