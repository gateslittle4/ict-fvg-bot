import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

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

// --- NWOG (New Week Opening Gap) - LIVE auto-execute (2026-09) -----------
// Started as an alert-only observation phase, then moved straight to full
// auto-execute at the user's explicit, eyes-open request (no time to trade
// manually - see HANDOFF.md). Shares the exact same openPositions/netting
// path as FVG/Divergence below - no NWOG-specific position tracking left.

const NWOG_CFG = { symbols: ['TEST1'], rrMultiple: 3, maxHoldingM15Candles: 480 };
const GAP_HOURS = 30 * HOUR; // within detectNwogEvents' [20h, 100h] window

test('LiveStrategyEngine (NWOG): a weekend-sized time gap fires a "validated" fill-bet signal one candle later, entry = candle.open, and opens a REAL position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: {},
    divergenceConfig: null,
    nwogConfig: NWOG_CFG,
    guardrail,
    riskPctPerTrade: 1,
  });

  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100); // prevClose = 100
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5); // gapped UP -> bet on fill DOWN (bearish), stopReference = high = 106
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5); // entry candle: entryPrice = open = 105.2

  engine.ingestCandle('TEST1', c1);
  engine.ingestCandle('TEST1', c2);
  const gapEvents = engine.ingestCandle('TEST1', c3);
  assert.equal(gapEvents.length, 0, 'the gap candle itself does not fire a signal - entry waits one more candle');

  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'nwog');
  assert.equal(entryEvents.length, 1);
  const sig = entryEvents[0];
  assert.equal(sig.direction, 'bearish');
  assert.equal(sig.suggestedSide, 'sell'); // required by _handleAutoExecuteEntry's real order submission
  assert.equal(sig.entryPrice, 105.2);
  assert.equal(sig.stopPrice, 106);
  assert.ok(Math.abs(sig.distance - 0.8) < 1e-9);
  assert.ok(Math.abs(sig.targetPrice - 102.8) < 1e-9); // entry - 3R
  assert.equal(sig.blockedReason, null);
  assert.equal(engine.getOpenPosition('TEST1').source, 'nwog', 'a clean NWOG signal now claims the REAL netting slot, same as FVG/Divergence');
});

test('LiveStrategyEngine (NWOG): resolves to a WIN when the fill target is hit', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, nwogConfig: NWOG_CFG, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5);
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5);
  const c5 = c(c4.time + M15, 104.5, 104.6, 102.5, 102.7); // low 102.5 <= target 102.8 -> WIN

  for (const candle of [c1, c2, c3, c4]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', c5).filter((e) => e.type === 'closed' && e.source === 'nwog');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'win');
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('LiveStrategyEngine (NWOG): resolves to a LOSS when the stop is hit', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, nwogConfig: NWOG_CFG, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5);
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5);
  const c5 = c(c4.time + M15, 105.3, 106.2, 105, 106); // high 106.2 >= stop 106 -> LOSS

  for (const candle of [c1, c2, c3, c4]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', c5).filter((e) => e.type === 'closed' && e.source === 'nwog');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'loss');
});

test('LiveStrategyEngine: netting blocks an NWOG signal on a symbol that already has an open FVG position (and vice versa - same shared slot)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, nwogConfig: NWOG_CFG, guardrail, riskPctPerTrade: 1,
  });
  // stop/target set FAR outside the c1-c4 price range (99.5-106) so this
  // fake position doesn't accidentally resolve while those candles feed
  // through _resolveOpenPosition - it must still be open when c4 arrives.
  engine.openPositions.set('TEST1', {
    source: 'fvg', id: 'fake', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 50, targetPrice: 500, distance: 50, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5);
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5);
  for (const candle of [c1, c2, c3]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'nwog');

  assert.equal(entryEvents.length, 1, 'still reported - informational, matches how a blocked FVG/Divergence signal is also still reported');
  assert.equal(entryEvents[0].blockedReason, 'netting');
  assert.equal(engine.getOpenPosition('TEST1').source, 'fvg', 'the pre-existing real position must remain untouched, no double-booking');
});

test('LiveStrategyEngine: netting blocks a second NWOG signal while an earlier NWOG position on the same symbol is still open', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, nwogConfig: NWOG_CFG, guardrail, riskPctPerTrade: 1,
  });
  // same "far outside the c1-c4 range" reasoning as the test above.
  engine.openPositions.set('TEST1', {
    source: 'nwog', id: 'fake-nwog', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 50, targetPrice: 500, distance: 50, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5);
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5);
  for (const candle of [c1, c2, c3]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'nwog');

  assert.equal(entryEvents.length, 1);
  assert.equal(entryEvents[0].blockedReason, 'netting');
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

// --- Bulk warm-up (2026-09) -------------------------------------------------
// Fixes the O(n^2) boot-time cost documented in HANDOFF.md ("découverte de
// performance", measured live at ~14 minutes to warm up 3 symbols): the old
// path replayed history via ingestCandle() once per historical candle, which
// rebuilds+replays the WHOLE retained history from scratch on every single
// call. warmUp() reconstructs the exact same end state in one pass per
// symbol instead. The test below is the single most important one in this
// file: it proves that claim empirically against real market data, not just
// by code inspection - any future change that breaks the equivalence
// between the fast bulk path and the slow-but-obviously-correct sequential
// path will fail this test.

function loadCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  return lines.map((line) => {
    const [time, open, high, low, close] = line.split(',');
    return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
}

function newEngineForWarmupComparison() {
  const guardrail = permissiveGuardrail();
  return new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog, // exercise NWOG's bulk-vs-sequential equivalence too, not just FVG/Divergence/pyramid
    guardrail,
    riskPctPerTrade: CONFIG.risk.riskPctPerTrade,
    pyramidConfig: { enabled: true, addAtR: 1, symbols: ['US100', 'US500'] }, // exercise _maybeRequestPyramid's bulk path too, not just the default-off case
  });
}

test('warmUp(): bulk single-pass reconstruction is IDENTICAL to sequential ingestCandle() replay, on real market data, using the real production config', () => {
  // 1500 candles/symbol (~15.6 days of M15) keeps this test fast (the
  // reference/sequential path below still pays the full O(n^2) cost this
  // whole change exists to avoid in production) while still exercising real
  // FVG watching/validated/expired events, Divergence entries, and (on
  // US100/US500) pyramid add-on requests - not a vacuous comparison of two
  // empty states.
  const N = 1500;
  const candlesBySymbol = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(0, N),
    US500: loadCsv('data/backtest-input/US500.csv').slice(0, N),
    XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv').slice(0, N),
  };

  const sequential = newEngineForWarmupComparison();
  // Same per-symbol-sequential order production already uses (see
  // cTraderDataSource.js's _subscribeLiveCandles: one symbol's ENTIRE
  // warm-up window is replayed before moving to the next) - NOT interleaved
  // chronologically across symbols. warmUp() must reproduce this exact
  // ordering (including its pre-existing "first-processed leg of the
  // Divergence pair sees no partner history yet" quirk), not a supposedly
  // more correct chronologically-merged one.
  for (const symbol of CONFIG.symbols) {
    for (const candle of candlesBySymbol[symbol]) {
      sequential.ingestCandle(symbol, candle);
    }
  }

  const bulk = newEngineForWarmupComparison();
  bulk.warmUp(candlesBySymbol);

  for (const symbol of CONFIG.symbols) {
    assert.deepEqual(bulk.getHistory(symbol), sequential.getHistory(symbol), `history mismatch for ${symbol}`);
  }
  assert.deepEqual(bulk.openPositions, sequential.openPositions, 'openPositions mismatch');
  assert.deepEqual(bulk.pyramidPositions, sequential.pyramidPositions, 'pyramidPositions mismatch');
  assert.deepEqual(bulk.formationIndexBySymbol, sequential.formationIndexBySymbol, 'formationIndexBySymbol mismatch');

  // Sanity: this fixture must actually exercise real signal detection on
  // both paths, or the comparison above would be vacuous (two empty states
  // trivially match). At least one symbol must have formed FVG zones.
  const totalWatched = CONFIG.symbols.reduce((sum, s) => sum + sequential.formationIndexBySymbol.get(s).size, 0);
  assert.ok(totalWatched > 0, 'expected at least one FVG zone to have formed in this fixture - comparison would be vacuous otherwise');
});

test('warmUp(): after reconstructing state, a NEW live candle produces the same next event as it would after the equivalent sequential replay', () => {
  // Equal internal state (proven above) should mean equal FUTURE behavior
  // too - the actual guarantee that matters for production, since warm-up
  // only exists to prepare the engine for what happens next.
  const N = 1500;
  const candlesBySymbol = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(0, N),
    US500: loadCsv('data/backtest-input/US500.csv').slice(0, N),
    XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv').slice(0, N),
  };
  const nextCandles = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(N, N + 50),
    US500: loadCsv('data/backtest-input/US500.csv').slice(N, N + 50),
    XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv').slice(N, N + 50),
  };

  const sequential = newEngineForWarmupComparison();
  for (const symbol of CONFIG.symbols) {
    for (const candle of candlesBySymbol[symbol]) sequential.ingestCandle(symbol, candle);
  }
  const bulk = newEngineForWarmupComparison();
  bulk.warmUp(candlesBySymbol);

  for (const symbol of CONFIG.symbols) {
    for (const candle of nextCandles[symbol]) {
      const seqEvs = sequential.ingestCandle(symbol, candle);
      const bulkEvs = bulk.ingestCandle(symbol, candle);
      assert.deepEqual(bulkEvs, seqEvs, `event mismatch for ${symbol} at candle.time=${candle.time}`);
    }
  }
});

test('warmUp(): a symbol with no candles in the input is left untouched, not a crash', () => {
  const engine = newEngineForWarmupComparison();
  engine.warmUp({ US100: loadCsv('data/backtest-input/US100.csv').slice(0, 10) }); // US500/XAUUSD omitted entirely
  assert.equal(engine.getHistoryLength('US500'), 0);
  assert.equal(engine.getHistoryLength('XAUUSD'), 0);
  assert.equal(engine.getHistoryLength('US100'), 10);
});

test('warmUp(): an empty candles array for a symbol is a no-op for that symbol', () => {
  const engine = newEngineForWarmupComparison();
  engine.warmUp({ US100: [], US500: loadCsv('data/backtest-input/US500.csv').slice(0, 5), XAUUSD: [] });
  assert.equal(engine.getHistoryLength('US100'), 0);
  assert.equal(engine.getHistoryLength('US500'), 5);
});
