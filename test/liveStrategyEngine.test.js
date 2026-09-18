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

// 2026-09-14: real bug found live. cTraderDataSource.js's live tick handler
// feeds ingestCandle() a candle whose `.time` has been shifted -5h (the
// "fixed EST as UTC" convention _toEngineCandle applies so session/HTF
// logic matches backtest-validated behavior), while GuardrailEngine's OTHER
// real inputs (a live fill's recordTrade, the dashboard's getStatus() poll)
// use genuine, unshifted Date.now(). During the real-UTC window where the
// shift crosses a calendar-day boundary (~00:00-05:00 UTC daily), a live
// candle's guardrail check computed "yesterday" while every other call
// computed "today" - GuardrailEngine's _ensureDay() silently wipes
// `this.trades` on ANY dayKey mismatch, so this thrashed the daily
// trade count and cooldown-after-loss protection clean, confirmed live: a
// real loss's 30-minute cooldown vanished after ~3 minutes. Fixed with an
// explicit `guardrailNow` parameter threaded through ingestCandle -> each
// _detect*Signal -> each _process*/_blockReason, defaulting to `candle.time`
// (so warmUp()'s bulk replay and every OTHER existing test above/below stay
// byte-for-byte unaffected - only the live call site overrides it with
// real Date.now()).
test('LiveStrategyEngine: an explicit guardrailNow survives the live -5h candle-time shift (real fix)', () => {
  const REAL_NOW = Date.UTC(2026, 8, 14, 1, 30, 0); // 2026-09-14T01:30:00Z
  const FIVE_H = 5 * 3600 * 1000;
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, REAL_NOW);
  guardrail.recordTrade({ pnl: -10, time: REAL_NOW, balanceAfter: 9990, symbol: 'TEST1' }); // a real loss, real time -> 30-min cooldown starts (per-symbol since 2026-09-15 - see guardrailEngine.js)

  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });

  // Live candles arriving minutes later - each candle's OWN .time is
  // shifted -5h (matches _toEngineCandle), landing on the PREVIOUS
  // calendar day even though real time has barely moved - exactly the live
  // shape cTraderDataSource.js feeds in.
  const guardrailNow = REAL_NOW + 5 * 60 * 1000;
  const shiftedBase = guardrailNow - FIVE_H;
  for (const cd of [c(shiftedBase, 100, 101, 99, 100), c(shiftedBase + M15, 100, 102, 100, 101), c(shiftedBase + 2 * M15, 102, 105, 103, 104)]) {
    engine.ingestCandle('TEST1', cd, guardrailNow);
  }
  const evs = engine.ingestCandle('TEST1', c(shiftedBase + 3 * M15, 104, 104, 102, 103), guardrailNow);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].blockedReason, 'guardrail'); // cooldown still active - NOT wiped by the shifted candle.time
});

test('LiveStrategyEngine: WITHOUT guardrailNow, the shifted candle.time reproduces the bug (documents why the fix above is needed)', () => {
  const REAL_NOW = Date.UTC(2026, 8, 14, 1, 30, 0);
  const FIVE_H = 5 * 3600 * 1000;
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, REAL_NOW);
  guardrail.recordTrade({ pnl: -10, time: REAL_NOW, balanceAfter: 9990, symbol: 'TEST1' });

  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });

  const shiftedBase = REAL_NOW + 5 * 60 * 1000 - FIVE_H;
  for (const cd of [c(shiftedBase, 100, 101, 99, 100), c(shiftedBase + M15, 100, 102, 100, 101), c(shiftedBase + 2 * M15, 102, 105, 103, 104)]) {
    engine.ingestCandle('TEST1', cd); // no 3rd arg - old behavior, defaults to candle.time
  }
  const evs = engine.ingestCandle('TEST1', c(shiftedBase + 3 * M15, 104, 104, 102, 103));
  assert.equal(evs.length, 1);
  // The cooldown got silently wiped by the day-key mismatch - the position
  // opens as if the loss/cooldown never happened at all.
  assert.notEqual(evs[0].blockedReason, 'guardrail');
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

// 2026-09-14 (Esdras, monitoring overnight - real double-position bug,
// recurred twice live: 02:00 opposite-direction, 09:11 same-direction): a
// simulated stop/target hit (_resolveOpenPosition, from candle highs/lows)
// can land before the REAL broker-side close confirms. Live, that used to
// delete openPositions immediately on the simulated hit, so netting saw the
// symbol as free and let a second real position open on top of the first,
// still-open one. deferCloseToRealConfirmation fixes this for the live call
// site only (see liveStrategyEngine.js/cTraderDataSource.js for the full
// story) - these tests drive the FIRST position to actually hit its target
// (candle 4, high=110 >= the ~109.6 target), then a SECOND, independent gap
// forms and tries to validate a few candles later. The buffer candles
// (5-6) are deliberately flat/low enough that they don't accidentally form
// their OWN gap against candle 3's high(104) - verified empirically, not
// just by inspection, before committing to these exact numbers.
function firstPositionAndResolution(engine, opts) {
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd, cd.time, opts);
  }
  const firstOpen = engine.getOpenPosition('TEST1');
  // target ~= entry(103) + 3R(2.2) = 109.6 (fvg-edge stop, see the very first test in this file) - high=110 hits it.
  const resolvedEvs = engine.ingestCandle('TEST1', c(4 * M15, 103, 110, 103, 108), 4 * M15, opts);
  return { firstOpen, resolvedEvs };
}

function secondGapCandles() {
  return [
    c(5 * M15, 108, 108, 103, 105), // buffer - low<=104 keeps this from pairing into a spurious gap with candle 3
    c(6 * M15, 105, 106, 104, 105), // buffer
    c(7 * M15, 105, 107, 105, 106), // c1 of the second gap
    c(8 * M15, 106, 107, 105, 106.5), // c2
    c(9 * M15, 106.5, 109, 108, 108.5), // c3: c1.high(107) < c3.low(108) -> gap [107,108]
  ];
}
const SECOND_GAP_REENTRY = c(10 * M15, 108.5, 108.6, 106, 107); // low dips back into [107,108]

test('LiveStrategyEngine: deferCloseToRealConfirmation defaults to false (warm-up/backtest/every other caller unchanged) - a simulated target hit clears the belief immediately, netting does not block a new signal', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({ symbols: ['TEST1'], fvgConfig: { TEST1: BASELINE_FVG_CFG }, divergenceConfig: null, guardrail, riskPctPerTrade: 1 });
  const { firstOpen, resolvedEvs } = firstPositionAndResolution(engine);
  assert.ok(resolvedEvs.some((e) => e.type === 'closed' && e.outcome === 'win'));
  assert.equal(engine.getOpenPosition('TEST1'), null, 'belief cleared immediately - old/default behavior, unchanged');

  for (const cd of secondGapCandles()) engine.ingestCandle('TEST1', cd);
  const secondEvs = engine.ingestCandle('TEST1', SECOND_GAP_REENTRY);
  const secondValidated = secondEvs.find((e) => e.type === 'validated');
  assert.ok(secondValidated);
  assert.equal(secondValidated.blockedReason, null, 'nothing believed open anymore - free to trade');
  assert.notEqual(engine.getOpenPosition('TEST1').id, firstOpen.id);
});

test('LiveStrategyEngine: deferCloseToRealConfirmation=true (live) - a simulated target hit does NOT clear the belief, netting still blocks a new signal (the actual double-position fix)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({ symbols: ['TEST1'], fvgConfig: { TEST1: BASELINE_FVG_CFG }, divergenceConfig: null, guardrail, riskPctPerTrade: 1 });
  const opts = { deferCloseToRealConfirmation: true };
  const { firstOpen, resolvedEvs } = firstPositionAndResolution(engine, opts);
  assert.ok(resolvedEvs.some((e) => e.type === 'closed' && e.outcome === 'win'), 'still emits the informational closed event, same as before');
  // The bug this fixes: belief must still be there (not deleted) so netting stays blocked.
  assert.ok(engine.getOpenPosition('TEST1'), 'belief NOT cleared yet - waiting on the real broker close');
  assert.equal(engine.getOpenPosition('TEST1').id, firstOpen.id);
  assert.equal(engine.getOpenPosition('TEST1').awaitingRealClose, true);

  for (const cd of secondGapCandles()) engine.ingestCandle('TEST1', cd, cd.time, opts);
  const secondEvs = engine.ingestCandle('TEST1', SECOND_GAP_REENTRY, SECOND_GAP_REENTRY.time, opts);
  const secondValidated = secondEvs.find((e) => e.type === 'validated');
  assert.ok(secondValidated, 'expected the second gap to reach validated stage');
  assert.equal(secondValidated.blockedReason, 'netting', 'THE FIX: still netted - a second real position must not open on top of the first, unconfirmed-closed one');
  assert.equal(engine.getOpenPosition('TEST1').id, firstOpen.id, 'still the original belief, untouched');
});

test('LiveStrategyEngine: deferCloseToRealConfirmation=true - once the REAL close is confirmed (clearBelievedPosition), netting opens back up for a new signal', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({ symbols: ['TEST1'], fvgConfig: { TEST1: BASELINE_FVG_CFG }, divergenceConfig: null, guardrail, riskPctPerTrade: 1 });
  const opts = { deferCloseToRealConfirmation: true };
  const { firstOpen } = firstPositionAndResolution(engine, opts);

  // The REAL broker confirmation arrives (cTraderDataSource.js's _handleExecutionEvent) -
  // this is the only thing that should release the belief once deferred.
  const cleared = engine.clearBelievedPosition('TEST1', firstOpen.id);
  assert.equal(cleared, true);
  assert.equal(engine.getOpenPosition('TEST1'), null);

  for (const cd of secondGapCandles()) engine.ingestCandle('TEST1', cd, cd.time, opts);
  const secondEvs = engine.ingestCandle('TEST1', SECOND_GAP_REENTRY, SECOND_GAP_REENTRY.time, opts);
  const secondValidated = secondEvs.find((e) => e.type === 'validated');
  assert.ok(secondValidated);
  assert.equal(secondValidated.blockedReason, null, 'freed up the instant the real close confirmed - a new position can open');
  assert.notEqual(engine.getOpenPosition('TEST1').id, firstOpen.id);
});

test('LiveStrategyEngine: _maybeRequestPyramid does not fire on a position that just simulated-closed this same candle under deferCloseToRealConfirmation', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
    pyramidConfig: { enabled: true, addAtR: 1, symbols: ['TEST1'] },
  });
  for (const cd of [c(0, 100, 101, 99, 100), c(M15, 100, 102, 100, 101), c(2 * M15, 102, 105, 103, 104), c(3 * M15, 104, 104, 102, 103)]) {
    engine.ingestCandle('TEST1', cd, cd.time, { deferCloseToRealConfirmation: true });
  }
  // Same candle both crosses the addAtR pyramid trigger AND hits the target -
  // without the awaitingRealClose guard in _maybeRequestPyramid, this could
  // wrongly request a pyramid add-on on a position that just closed.
  const events = engine.ingestCandle('TEST1', c(4 * M15, 103, 110, 103, 108), 4 * M15, { deferCloseToRealConfirmation: true });
  assert.equal(events.some((e) => e.type === 'pyramid-order-requested'), false);
});

// Fixed-EST-as-UTC convention (nySession.js, also used by
// test/fvgMultiTouch.test.js): a Wednesday at 15:00 UTC is 10:00 NY (EST).
const SESSION_MULTI_TOUCH_CFG = {
  variant: 'baseline',
  stopMode: 'fvg-edge',
  rrMultiple: 3,
  structureEnabled: false,
  sessionEnabled: true,
  sessionWindow: { startHour: 10, endHour: 11 },
  liquiditySweepEnabled: false,
  multiTouch: true,
};
const INSIDE_SESSION = Date.parse('2026-01-07T10:00:00Z'); // +5h = 15:00Z = 10:00 EST
const OUTSIDE_SESSION = Date.parse('2026-01-07T08:00:00Z'); // +5h = 13:00Z = 08:00 EST

test('LiveStrategyEngine (FVG multi-contact): a touch that fails the session filter does NOT consume the zone - a LATER touch inside the window still validates', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: SESSION_MULTI_TOUCH_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101));
  engine.ingestCandle('TEST1', c(2 * M15, 102, 105, 103, 104)); // watching, bullish gap [101,103]

  // Touch #1, outside the session window - must be rejected, but the zone
  // must SURVIVE (this is the whole point of multi-contact: unlike the
  // production single-touch engine, a rejected touch is not fatal).
  const rejectedEvs = engine.ingestCandle('TEST1', c(OUTSIDE_SESSION, 104, 104, 102, 103));
  assert.equal(rejectedEvs.length, 0, 'a rejected touch emits nothing, matching fvgMultiTouch.test.js');
  assert.equal(engine.getOpenPosition('TEST1'), null, 'no position should have opened on the rejected touch');

  // Touch #2, inside the session window - the SAME zone (never destroyed) validates now.
  const validatedEvs = engine.ingestCandle('TEST1', c(INSIDE_SESSION + M15, 103, 104, 102, 103));
  const v = validatedEvs.find((e) => e.type === 'validated');
  assert.ok(v, 'expected the surviving zone to validate on the later, in-window touch');
  assert.equal(v.blockedReason, null);
  assert.equal(v.entryPrice, 103);
  const open = engine.getOpenPosition('TEST1');
  assert.ok(open, 'expected a position to have opened on the later touch');
});

test('LiveStrategyEngine (FVG, multiTouch NOT set): the SAME rejected-then-in-window sequence never validates - the production single-touch engine consumes the zone on the first (rejected) touch', () => {
  const guardrail = permissiveGuardrail();
  const singleTouchCfg = { ...SESSION_MULTI_TOUCH_CFG, multiTouch: false };
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: singleTouchCfg },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101));
  engine.ingestCandle('TEST1', c(2 * M15, 102, 105, 103, 104)); // watching, bullish gap [101,103]

  engine.ingestCandle('TEST1', c(OUTSIDE_SESSION, 104, 104, 102, 103)); // touch outside window - consumes the zone in single-touch mode
  const laterEvs = engine.ingestCandle('TEST1', c(INSIDE_SESSION + M15, 103, 104, 102, 103)); // same later touch as above
  assert.equal(laterEvs.find((e) => e.type === 'validated'), undefined, 'the zone is gone - single-touch never gets a second chance');
  assert.equal(engine.getOpenPosition('TEST1'), null);
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

// --- NWOG longOnlySymbols (2026-09-15, revised 2026-09-16) - Esdras's
// explicit call after seeing the long/short-direction-split check: the sell
// side of live NWOG/US100 carries ~0 net edge (-1.70R over 177 trades since
// 2019, essentially breakeven) while buy carries the entire result - "on
// active achète seulement". Was a single `longOnly` boolean applying to
// every NWOG symbol; became a per-symbol `longOnlySymbols` array once GER40
// was added as a second NWOG symbol with the OPPOSITE (bidirectional,
// validated 59/41 buy/sell) setting.

const NWOG_CFG_LONG_ONLY = { ...NWOG_CFG, longOnlySymbols: ['TEST1'] };

test('LiveStrategyEngine (NWOG longOnly): a bearish gap-fill candidate is blocked with "direction-filtered", never opens a real position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, nwogConfig: NWOG_CFG_LONG_ONLY, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100); // prevClose = 100
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5); // gapped UP -> bearish bet
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5);

  for (const candle of [c1, c2, c3]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'nwog');

  assert.equal(entryEvents.length, 1, 'still reported - informational, same convention as every other blockedReason');
  assert.equal(entryEvents[0].direction, 'bearish');
  assert.equal(entryEvents[0].blockedReason, 'direction-filtered');
  assert.equal(engine.getOpenPosition('TEST1'), null, 'no real position opened for the filtered-out sell side');
});

test('LiveStrategyEngine (NWOG longOnly): a bullish gap-fill candidate still fires and opens a real position normally', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, nwogConfig: NWOG_CFG_LONG_ONLY, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100); // prevClose = 100
  const c3 = c(c2.time + GAP_HOURS, 95, 95.5, 94, 94.5); // gapped DOWN -> bullish bet, stopReference = low = 94
  const c4 = c(c3.time + M15, 94.8, 95, 94.2, 94.5);

  for (const candle of [c1, c2, c3]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'nwog');

  assert.equal(entryEvents.length, 1);
  assert.equal(entryEvents[0].direction, 'bullish');
  assert.equal(entryEvents[0].suggestedSide, 'buy');
  assert.equal(entryEvents[0].blockedReason, null);
  assert.equal(engine.getOpenPosition('TEST1').source, 'nwog', 'the buy side is unaffected by longOnly and opens a real position as usual');
});

test('LiveStrategyEngine (NWOG longOnlySymbols): a bearish candidate on a symbol NOT listed stays bidirectional (unaffected by another symbol\'s long-only restriction)', () => {
  const guardrail = permissiveGuardrail();
  // Same config shape actually deployed in production: US100 long-only,
  // GER40 bidirectional, both sharing one nwogConfig object.
  const cfg = { ...NWOG_CFG, symbols: ['TEST1', 'TEST2'], longOnlySymbols: ['TEST1'] };
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1', 'TEST2'], fvgConfig: {}, divergenceConfig: null, nwogConfig: cfg, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100); // prevClose = 100
  const c3 = c(c2.time + GAP_HOURS, 105, 106, 104.5, 105.5); // gapped UP -> bearish bet
  const c4 = c(c3.time + M15, 105.2, 105.3, 104, 104.5);

  for (const candle of [c1, c2, c3]) engine.ingestCandle('TEST2', candle);
  const entryEvents = engine.ingestCandle('TEST2', c4).filter((e) => e.source === 'nwog');

  assert.equal(entryEvents.length, 1);
  assert.equal(entryEvents[0].direction, 'bearish');
  assert.equal(entryEvents[0].blockedReason, null, 'TEST2 is not in longOnlySymbols, so its sell side fires normally');
  assert.equal(engine.getOpenPosition('TEST2').source, 'nwog');
});

// --- Judas Swing (ICT London killzone, EURUSD - 2026-09, activated at the
// user's explicit request) - same openPositions/netting/auto-execute shared
// path as FVG/Divergence/NWOG above, no Judas-Swing-specific tracking.

const JUDAS_CFG = { symbols: ['TEST1'], rrMultiple: 3, maxHoldingM15Candles: 480 };
// January dates keep this simple: real NY time == the fixed-EST digits used
// project-wide for candle .time (no DST in effect) - same convention as
// test/judasSwing.test.js.
function judasTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}
function judasDay1Fixture() {
  return [
    c(judasTime(2024, 1, 15, 0, 0), 100, 101, 99, 100),
    c(judasTime(2024, 1, 15, 6, 0), 100, 110, 100, 108), // day high 110 -> PDH
    c(judasTime(2024, 1, 15, 12, 0), 108, 109, 90, 95), // day low 90 -> PDL
    c(judasTime(2024, 1, 15, 18, 0), 95, 100, 94, 99),
  ];
}

test('LiveStrategyEngine (Judas Swing): a PDH sweep+reclaim in the London killzone fires a "validated" signal one candle later, entry = candle.open, and opens a REAL position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, judasSwingConfig: JUDAS_CFG, guardrail, riskPctPerTrade: 1,
  });

  const day2Signal = c(judasTime(2024, 1, 16, 2, 30), 100, 112, 99, 108); // high 112 > PDH 110, close 108 < 110 -> bearish
  const day2Entry = c(judasTime(2024, 1, 16, 2, 45), 108, 109, 107, 108); // entry candle, open=108

  for (const candle of judasDay1Fixture()) engine.ingestCandle('TEST1', candle);
  const signalEvents = engine.ingestCandle('TEST1', day2Signal);
  assert.equal(signalEvents.filter((e) => e.source === 'judaswing').length, 0, 'the signal candle itself does not fire a signal - entry waits one more candle');

  const entryEvents = engine.ingestCandle('TEST1', day2Entry).filter((e) => e.source === 'judaswing');
  assert.equal(entryEvents.length, 1);
  const sig = entryEvents[0];
  assert.equal(sig.direction, 'bearish');
  assert.equal(sig.suggestedSide, 'sell'); // required by _handleAutoExecuteEntry's real order submission
  assert.equal(sig.entryPrice, 108);
  assert.equal(sig.stopPrice, 112); // the sweep's own extreme
  assert.ok(Math.abs(sig.distance - 4) < 1e-9);
  assert.ok(Math.abs(sig.targetPrice - 96) < 1e-9); // entry - 3R
  assert.equal(sig.blockedReason, null);
  assert.equal(engine.getOpenPosition('TEST1').source, 'judaswing', 'a clean Judas Swing signal now claims the REAL netting slot, same as FVG/Divergence/NWOG');
});

test('LiveStrategyEngine (Judas Swing): resolves to a WIN when the fixed 1:3 target is hit', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, judasSwingConfig: JUDAS_CFG, guardrail, riskPctPerTrade: 1,
  });
  const day2Signal = c(judasTime(2024, 1, 16, 2, 30), 100, 112, 99, 108);
  const day2Entry = c(judasTime(2024, 1, 16, 2, 45), 108, 109, 107, 108);
  const resolveCandle = c(judasTime(2024, 1, 16, 3, 0), 108, 108.5, 95, 96); // low 95 <= target 96 -> WIN

  for (const candle of [...judasDay1Fixture(), day2Signal, day2Entry]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', resolveCandle).filter((e) => e.type === 'closed' && e.source === 'judaswing');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'win');
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('LiveStrategyEngine (Judas Swing): resolves to a LOSS when the sweep extreme (stop) is retaken', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, judasSwingConfig: JUDAS_CFG, guardrail, riskPctPerTrade: 1,
  });
  const day2Signal = c(judasTime(2024, 1, 16, 2, 30), 100, 112, 99, 108);
  const day2Entry = c(judasTime(2024, 1, 16, 2, 45), 108, 109, 107, 108);
  const resolveCandle = c(judasTime(2024, 1, 16, 3, 0), 108, 113, 107, 110); // high 113 >= stop 112 -> LOSS

  for (const candle of [...judasDay1Fixture(), day2Signal, day2Entry]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', resolveCandle).filter((e) => e.type === 'closed' && e.source === 'judaswing');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'loss');
});

test('LiveStrategyEngine: netting blocks a Judas Swing signal on a symbol that already has an open FVG position (and vice versa - same shared slot)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, judasSwingConfig: JUDAS_CFG, guardrail, riskPctPerTrade: 1,
  });
  // stop/target set FAR outside the fixture's price range (90-112) so this
  // fake position doesn't accidentally resolve while day1/day2-signal candles
  // feed through _resolveOpenPosition - it must still be open at entry time.
  engine.openPositions.set('TEST1', {
    source: 'fvg', id: 'fake', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 50, targetPrice: 500, distance: 50, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const day2Signal = c(judasTime(2024, 1, 16, 2, 30), 100, 112, 99, 108);
  const day2Entry = c(judasTime(2024, 1, 16, 2, 45), 108, 109, 107, 108);
  for (const candle of [...judasDay1Fixture(), day2Signal]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', day2Entry).filter((e) => e.source === 'judaswing');

  assert.equal(entryEvents.length, 1, 'still reported - informational, matches how a blocked FVG/Divergence/NWOG signal is also still reported');
  assert.equal(entryEvents[0].blockedReason, 'netting');
  assert.equal(engine.getOpenPosition('TEST1').source, 'fvg', 'the pre-existing real position must remain untouched, no double-booking');
});

test('LiveStrategyEngine: netting blocks a second Judas Swing signal while an earlier Judas Swing position on the same symbol is still open', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, judasSwingConfig: JUDAS_CFG, guardrail, riskPctPerTrade: 1,
  });
  engine.openPositions.set('TEST1', {
    source: 'judaswing', id: 'fake-judaswing', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 50, targetPrice: 500, distance: 50, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const day2Signal = c(judasTime(2024, 1, 16, 2, 30), 100, 112, 99, 108);
  const day2Entry = c(judasTime(2024, 1, 16, 2, 45), 108, 109, 107, 108);
  for (const candle of [...judasDay1Fixture(), day2Signal]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', day2Entry).filter((e) => e.source === 'judaswing');

  assert.equal(entryEvents.length, 1);
  assert.equal(entryEvents[0].blockedReason, 'netting');
});

// --- Weekly Liquidity Sweep (PWH/PWL, GER40) - LIVE, auto-executed
// (2026-09-15, at Esdras's explicit "on va plus vite" request - straight to
// full auto-execute, no alert-only phase). Same week-boundary-gap detection
// mechanics as NWOG above (both use the same [20h,100h] gap window - see
// weeklyLiquiditySweep.js), same openPositions/netting/auto-execute path.

const WEEKLYSWEEP_CFG = { symbols: ['TEST1'], rrMultiple: 3, maxHoldingM15Candles: 480 };

test('LiveStrategyEngine (Weekly Sweep): a sweep+reclaim of the PREVIOUS WEEK high fires a "validated" signal one candle later, entry = candle.open, and opens a REAL position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, weeklySweepConfig: WEEKLYSWEEP_CFG, guardrail, riskPctPerTrade: 1,
  });

  // Week 1: high = 100.5 (from c1/c2). Week 2 opens after a weekend-sized
  // gap; c3 sweeps above week 1's high (100.5) intra-candle but CLOSES back
  // inside it -> bearish bet on a fade back down, stopReference = high.
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 100.2, 101, 100, 100.3); // sweeps 100.5, closes back inside -> bearish
  const c4 = c(c3.time + M15, 100.25, 100.3, 99.8, 100);

  engine.ingestCandle('TEST1', c1);
  engine.ingestCandle('TEST1', c2);
  const gapEvents = engine.ingestCandle('TEST1', c3);
  assert.equal(gapEvents.filter((e) => e.source === 'weeklysweep').length, 0, 'the sweep+reclaim candle itself does not fire a signal - entry waits one more candle');

  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'weeklysweep');
  assert.equal(entryEvents.length, 1);
  const sig = entryEvents[0];
  assert.equal(sig.direction, 'bearish');
  assert.equal(sig.suggestedSide, 'sell');
  assert.equal(sig.entryPrice, 100.25);
  assert.equal(sig.stopPrice, 101);
  assert.ok(Math.abs(sig.distance - 0.75) < 1e-9);
  assert.equal(sig.blockedReason, null);
  assert.equal(engine.getOpenPosition('TEST1').source, 'weeklysweep', 'a clean signal now claims the REAL netting slot, same as FVG/Divergence/NWOG/Judas Swing');
});

test('LiveStrategyEngine (Weekly Sweep): resolves to a WIN when the fixed 1:3 target is hit', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, weeklySweepConfig: WEEKLYSWEEP_CFG, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 100.2, 101, 100, 100.3);
  const c4 = c(c3.time + M15, 100.25, 100.3, 99.8, 100); // entry 100.25, stop 101, distance 0.75, target = 100.25 - 2.25 = 98.0
  const c5 = c(c4.time + M15, 99.9, 100, 97.8, 98); // low 97.8 <= target 98.0 -> WIN

  for (const candle of [c1, c2, c3, c4]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', c5).filter((e) => e.type === 'closed' && e.source === 'weeklysweep');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'win');
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('LiveStrategyEngine (Weekly Sweep): resolves to a LOSS when the stop is hit', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, weeklySweepConfig: WEEKLYSWEEP_CFG, guardrail, riskPctPerTrade: 1,
  });
  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 100.2, 101, 100, 100.3);
  const c4 = c(c3.time + M15, 100.25, 100.3, 99.8, 100); // stop 101
  const c5 = c(c4.time + M15, 100.3, 101.2, 100, 101); // high 101.2 >= stop 101 -> LOSS

  for (const candle of [c1, c2, c3, c4]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', c5).filter((e) => e.type === 'closed' && e.source === 'weeklysweep');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'loss');
});

test('LiveStrategyEngine: netting blocks a Weekly Sweep signal on a symbol that already has an open FVG position (and vice versa - same shared slot)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, weeklySweepConfig: WEEKLYSWEEP_CFG, guardrail, riskPctPerTrade: 1,
  });
  engine.openPositions.set('TEST1', {
    source: 'fvg', id: 'fake', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 50, targetPrice: 500, distance: 50, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const c1 = c(0, 100, 100.5, 99.5, 100);
  const c2 = c(M15, 100, 100.5, 99.5, 100);
  const c3 = c(c2.time + GAP_HOURS, 100.2, 101, 100, 100.3);
  const c4 = c(c3.time + M15, 100.25, 100.3, 99.8, 100);
  for (const candle of [c1, c2, c3]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', c4).filter((e) => e.source === 'weeklysweep');

  assert.equal(entryEvents.length, 1, 'still reported - informational, matches how a blocked FVG/Divergence/NWOG/Judas Swing signal is also still reported');
  assert.equal(entryEvents[0].blockedReason, 'netting');
  assert.equal(engine.getOpenPosition('TEST1').source, 'fvg', 'the pre-existing real position must remain untouched, no double-booking');
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

// 2026-09-15 (Esdras, after seeing the combined-portfolio numbers - see
// HANDOFF.md): pyramid legs that fire while their own symbol is in an
// active cooldown from a recent loss perform dramatically worse (4-12% win
// rate) than ones that don't (50-60%) - _maybeRequestPyramid now consults
// the guardrail like every other live source, instead of never checking it
// at all.
// The loss is recorded AFTER openBullishTest1() opens the FVG position, not
// before - recording it any earlier would ALSO block the FVG's own entry on
// candle 3 (it's gated by this same per-symbol cooldown too), which would
// silently prevent the position from ever opening at all rather than
// testing what this test actually wants to check (the already-open
// position's pyramid add-on being gated).

test('LiveStrategyEngine (pyramid): blocked while its own symbol is in an active cooldown from a recent loss', () => {
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, 0);
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: { TEST1: BASELINE_FVG_CFG }, divergenceConfig: null, guardrail, riskPctPerTrade: 1,
    pyramidConfig: { enabled: true, addAtR: 1, symbols: ['TEST1'] },
  });
  openBullishTest1(engine); // opens cleanly - no loss recorded yet
  guardrail.recordTrade({ pnl: -50, time: 3 * M15 + 5 * 60 * 1000, balanceAfter: 9950, symbol: 'TEST1' }); // a loss on TEST1 shortly after entry
  const guardrailNow = 4 * M15 + 5 * 60 * 1000; // ~20 min after the loss - still within the 30-min cooldown
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104), guardrailNow);
  assert.equal(evs.filter((e) => e.type === 'pyramid-order-requested').length, 0, 'no pyramid order requested while the symbol is cooling down');
  assert.equal(engine.getPyramidPending('TEST1'), null);
});

test('LiveStrategyEngine (pyramid): fires normally once its own symbol\'s cooldown has elapsed', () => {
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, 0);
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: { TEST1: BASELINE_FVG_CFG }, divergenceConfig: null, guardrail, riskPctPerTrade: 1,
    pyramidConfig: { enabled: true, addAtR: 1, symbols: ['TEST1'] },
  });
  openBullishTest1(engine);
  guardrail.recordTrade({ pnl: -50, time: 3 * M15 + 5 * 60 * 1000, balanceAfter: 9950, symbol: 'TEST1' });
  const guardrailNow = 3 * M15 + 36 * 60 * 1000; // 31 min after the loss - cooldown has cleared
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104), guardrailNow);
  assert.equal(evs.filter((e) => e.type === 'pyramid-order-requested').length, 1, 'requests normally once the cooldown has cleared');
});

test('LiveStrategyEngine (pyramid): a loss on a DIFFERENT symbol does not block this symbol\'s pyramid (per-symbol cooldown, not account-wide)', () => {
  const guardrail = new GuardrailEngine({ maxTradesPerDay: 100, cooldownMinutesAfterLoss: 30, dailyLossLimitPct: 100, dayBoundaryHourUTC: 0 });
  guardrail.setBalance(10000, 0);
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: { TEST1: BASELINE_FVG_CFG }, divergenceConfig: null, guardrail, riskPctPerTrade: 1,
    pyramidConfig: { enabled: true, addAtR: 1, symbols: ['TEST1'] },
  });
  openBullishTest1(engine);
  guardrail.recordTrade({ pnl: -50, time: 3 * M15 + 5 * 60 * 1000, balanceAfter: 9950, symbol: 'OTHERSYM' });
  const guardrailNow = 4 * M15 + 5 * 60 * 1000; // still well within OTHERSYM's cooldown, but that's a different symbol
  const evs = engine.ingestCandle('TEST1', c(4 * M15, 103, 105.3, 103, 104), guardrailNow);
  assert.equal(evs.filter((e) => e.type === 'pyramid-order-requested').length, 1, 'an unrelated symbol\'s loss must not silence this one\'s pyramid');
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

// Hardcoded rather than read from CONFIG.symbols: this comparison needs to
// stay pinned to the symbols these tests actually load real CSV fixtures
// for, independent of whatever CONFIG.symbols happens to list at any given
// time (it's grown several times already - XAUUSD, then EURUSD, then GER40 -
// and a mutable global here silently breaks this file every time, with a
// confusing "not iterable" error instead of a clear one).
const WARMUP_COMPARISON_SYMBOLS = ['US100', 'US500', 'XAUUSD', 'EURUSD', 'GER40'];

function newEngineForWarmupComparison() {
  const guardrail = permissiveGuardrail();
  return new LiveStrategyEngine({
    symbols: WARMUP_COMPARISON_SYMBOLS,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    nwogConfig: CONFIG.nwog, // exercise NWOG's bulk-vs-sequential equivalence too, not just FVG/Divergence/pyramid
    judasSwingConfig: CONFIG.judasSwing, // same, for Judas Swing/EURUSD
    // GER40 added 2026-09-17 specifically to exercise Weekly Sweep/Breaker
    // Block/Silver Bullet's bulk-vs-sequential equivalence too - the
    // pre-existing version of this test never touched these 3 (all either
    // GER40-scoped or GER40-included), so a bug unique to their bulk warm-up
    // path (as opposed to their live per-tick path, already covered by the
    // dedicated tests above) could have shipped silently. Uses CONFIG's
    // real production values directly, not a hand-picked subset.
    weeklySweepConfig: CONFIG.weeklySweep,
    breakerBlockConfig: CONFIG.breakerBlock,
    silverBulletConfig: CONFIG.silverBullet,
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
    EURUSD: loadCsv('data/backtest-input/EURUSD.csv').slice(0, N),
    GER40: loadCsv('data/backtest-input/GER40.csv').slice(0, N),
  };

  const sequential = newEngineForWarmupComparison();
  // Same per-symbol-sequential order production already uses (see
  // cTraderDataSource.js's _subscribeLiveCandles: one symbol's ENTIRE
  // warm-up window is replayed before moving to the next) - NOT interleaved
  // chronologically across symbols. warmUp() must reproduce this exact
  // ordering (including its pre-existing "first-processed leg of the
  // Divergence pair sees no partner history yet" quirk), not a supposedly
  // more correct chronologically-merged one.
  for (const symbol of WARMUP_COMPARISON_SYMBOLS) {
    for (const candle of candlesBySymbol[symbol]) {
      sequential.ingestCandle(symbol, candle);
    }
  }

  const bulk = newEngineForWarmupComparison();
  bulk.warmUp(candlesBySymbol);

  for (const symbol of WARMUP_COMPARISON_SYMBOLS) {
    assert.deepEqual(bulk.getHistory(symbol), sequential.getHistory(symbol), `history mismatch for ${symbol}`);
  }
  assert.deepEqual(bulk.openPositions, sequential.openPositions, 'openPositions mismatch');
  assert.deepEqual(bulk.pyramidPositions, sequential.pyramidPositions, 'pyramidPositions mismatch');
  assert.deepEqual(bulk.formationIndexBySymbol, sequential.formationIndexBySymbol, 'formationIndexBySymbol mismatch');

  // Sanity: this fixture must actually exercise real signal detection on
  // both paths, or the comparison above would be vacuous (two empty states
  // trivially match). At least one symbol must have formed FVG zones.
  const totalWatched = WARMUP_COMPARISON_SYMBOLS.reduce((sum, s) => sum + sequential.formationIndexBySymbol.get(s).size, 0);
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
    EURUSD: loadCsv('data/backtest-input/EURUSD.csv').slice(0, N),
    GER40: loadCsv('data/backtest-input/GER40.csv').slice(0, N),
  };
  const nextCandles = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(N, N + 50),
    US500: loadCsv('data/backtest-input/US500.csv').slice(N, N + 50),
    XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv').slice(N, N + 50),
    EURUSD: loadCsv('data/backtest-input/EURUSD.csv').slice(N, N + 50),
    GER40: loadCsv('data/backtest-input/GER40.csv').slice(N, N + 50),
  };

  const sequential = newEngineForWarmupComparison();
  for (const symbol of WARMUP_COMPARISON_SYMBOLS) {
    for (const candle of candlesBySymbol[symbol]) sequential.ingestCandle(symbol, candle);
  }
  const bulk = newEngineForWarmupComparison();
  bulk.warmUp(candlesBySymbol);

  for (const symbol of WARMUP_COMPARISON_SYMBOLS) {
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

test('clearBelievedPosition: removes the believed-open position when the id matches', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101));
  engine.ingestCandle('TEST1', c(2 * M15, 102, 105, 103, 104));
  engine.ingestCandle('TEST1', c(3 * M15, 104, 104, 102, 103));

  const open = engine.getOpenPosition('TEST1');
  assert.ok(open, 'expected a position to have opened');

  const cleared = engine.clearBelievedPosition('TEST1', open.id);
  assert.equal(cleared, true);
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('clearBelievedPosition: a stale/wrong id never clobbers the CURRENT believed position (e.g. a late confirmation for an already-superseded signal)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101));
  engine.ingestCandle('TEST1', c(2 * M15, 102, 105, 103, 104));
  engine.ingestCandle('TEST1', c(3 * M15, 104, 104, 102, 103));

  const open = engine.getOpenPosition('TEST1');
  assert.ok(open);

  const cleared = engine.clearBelievedPosition('TEST1', 'some-other-signal-id');
  assert.equal(cleared, false);
  assert.deepEqual(engine.getOpenPosition('TEST1'), open); // untouched
});

test('clearBelievedPosition: a symbol with nothing believed open is a safe no-op', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  assert.equal(engine.clearBelievedPosition('TEST1', 'anything'), false);
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

// --- Breaker Block (ICT failed Order Block, retested from the flipped
// side) - LIVE, auto-executed (2026-09-16, GER40 - rehabilitated with the
// real 0.5 spread and the same robustness checks that validated NWOG, see
// HANDOFF.md). Same openPositions/netting/auto-execute path as every other
// live source above. Fixture is the SAME shape as test/breakerBlock.test.js
// (a bullish BOS finds a bearish OB as its support zone [0.85, 1.02], price
// breaks THROUGH it downward, flips to a bearish breaker, then retests the
// breaker's mid (0.935) from below) but re-spaced for this engine's
// PRODUCTION-DEFAULT detection params (breakerBlock.test.js's own fixture
// uses a custom {lookback:2,...} - too tight a window for the real
// SWING_LOOKBACK=5 default this engine actually uses: the BOS candle's own
// huge high (2.2) would fall inside the swing-high-at-index-5 confirmation
// window with lookback 5, invalidating it as a swing point before the BOS
// could ever reference it. Re-verified directly against
// runBreakerBlockBacktest(candles, {}) - i.e. every default, no overrides -
// producing exactly one trade before writing this fixture into the test.

const BREAKER_CFG = { symbols: ['TEST1'], rrMultiple: 3, maxHoldingM15Candles: 480 };

function breakerFixtureCandles() {
  const candles = [];
  for (let i = 0; i <= 4; i++) candles.push(c(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(c(5000, 1, 2.0, 0.95, 1)); // swing high spike
  for (let i = 6; i <= 10; i++) candles.push(c(i * 1000, 1, 1.05, 0.95, 1)); // filler, keeps the lookback=5 confirmation window [0,10] clean
  candles.push(c(11000, 1.0, 1.02, 0.85, 0.9)); // bearish OB candle
  candles.push(c(12000, 1, 1.05, 0.95, 1.05)); // bullish filler, NOT the OB
  candles.push(c(13000, 1, 2.2, 0.95, 2.1)); // bullish BOS candle
  for (let i = 14; i <= 17; i++) candles.push(c(i * 1000, 1, 1.05, 0.95, 1));
  candles.push(c(18000, 1, 1.05, 0.5, 0.6)); // breaks through zoneLow (0.85)
  for (let i = 19; i <= 22; i++) candles.push(c(i * 1000, 0.6, 0.7, 0.55, 0.6));
  candles.push(c(23000, 0.6, 0.94, 0.55, 0.7)); // retests the mid (0.935) from below
  candles.push(c(24000, 0.93, 0.95, 0.9, 0.92)); // entry candle, open=0.93
  // Deliberately stops here (no resolution candle) - these tests only cover
  // entry/netting, same scope as the NWOG/Judas Swing/Weekly Sweep tests
  // above; exit behavior (stop/target/timeout) is already covered by
  // test/breakerBlock.test.js directly against runBreakerBlockBacktest().
  return candles;
}

test('LiveStrategyEngine (Breaker Block): the retest-confirmation candle emits an actionable "validated" signal and opens a real position, same fixture already proven against runBreakerBlockBacktest()', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, breakerBlockConfig: BREAKER_CFG, guardrail, riskPctPerTrade: 1,
  });
  const candles = breakerFixtureCandles();
  let entryEvents = [];
  for (const candle of candles) {
    entryEvents.push(...engine.ingestCandle('TEST1', candle).filter((e) => e.source === 'breakerblock'));
  }

  assert.equal(entryEvents.length, 1);
  const e = entryEvents[0];
  assert.equal(e.direction, 'bearish');
  assert.equal(e.suggestedSide, 'sell');
  assert.equal(e.entryPrice, 0.93);
  assert.equal(e.stopPrice, 1.02);
  assert.equal(e.blockedReason, null);

  const open = engine.getOpenPosition('TEST1');
  assert.ok(open, 'expected a real position to have opened');
  assert.equal(open.source, 'breakerblock');
  assert.equal(open.direction, 'bearish');
});

test('LiveStrategyEngine (Breaker Block): netting blocks the signal while an earlier position on the same symbol is still open', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, breakerBlockConfig: BREAKER_CFG, guardrail, riskPctPerTrade: 1,
  });
  // Price range scaled to THIS fixture (0.5-2.2), unlike the NWOG netting
  // test above (~100) - a stop/target sized for that other fixture's scale
  // would instantly trigger against these candles' own prices instead of
  // staying open throughout, as intended here.
  engine.openPositions.set('TEST1', {
    source: 'fvg', id: 'fake-open', direction: 'bullish', entryIndex: 0, entryTime: -1,
    entryPrice: 1, stopPrice: 0.1, targetPrice: 10, distance: 0.9, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const candles = breakerFixtureCandles();
  let entryEvents = [];
  for (const candle of candles) {
    entryEvents.push(...engine.ingestCandle('TEST1', candle).filter((e) => e.source === 'breakerblock'));
  }

  assert.equal(entryEvents.length, 1, 'still reported - informational, same convention as every other blockedReason');
  assert.equal(entryEvents[0].blockedReason, 'netting');
});

// --- Silver Bullet (ICT FVG formed inside the 10h-11h NY killzone AND
// agreeing with the active structure bias - 2026-09-17, US100/US500/GER40,
// LIVE auto-executed at the user's explicit request, see config.js's
// `silverBullet` comment and HANDOFF.md). Same openPositions/netting/
// auto-execute shared path as every other live source above. Fixture is
// the SAME shape (and same January-dates-avoid-DST convention) as
// test/silverBullet.test.js's own baseToFvg(): a swing high pivot at 110,
// confirmed, then a BOS candle closing above it (bullish structure bias),
// padded to 09:30 NY, then a 3-candle bullish FVG whose c3 lands at 10:00
// NY (inside the killzone) - re-verified directly against
// detectSilverBulletFvgs()/this engine's own _computeSilverBulletCandidates()
// before writing this fixture into the test.

const SILVERBULLET_CFG = { symbols: ['TEST1'], rrMultiple: 3, maxHoldingM15Candles: 480 };

function silverBulletBaseFixture() {
  let t = Date.UTC(2024, 0, 1, 0, 0);
  const candles = [];
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 110, 104, 106)); t += M15; // swing high = 110
  for (let i = 0; i < 5; i++) { candles.push(c(t, 100, 101, 99, 100)); t += M15; }
  for (let i = 0; i < 10; i++) { candles.push(c(t, 100, 100.2, 99.8, 100)); t += M15; }
  candles.push(c(t, 105, 112, 104, 111)); t += M15; // BOS: close 111 > 110 -> bullish structure bias
  for (let i = 0; i < 5; i++) { candles.push(c(t, 108, 108.2, 107.8, 108)); t += M15; }
  while (new Date(t).getUTCHours() < 9 || (new Date(t).getUTCHours() === 9 && new Date(t).getUTCMinutes() < 30)) {
    candles.push(c(t, 108, 108.2, 107.8, 108)); t += M15;
  }
  candles.push(c(t, 108, 108.5, 107.5, 108)); t += M15; // c1, high=108.5
  candles.push(c(t, 108, 109, 107, 108)); t += M15; // c2
  candles.push(c(t, 109, 110, 108.9, 109.5)); t += M15; // c3 (10:00 NY) -> bullish FVG [108.5, 108.9]
  return { candles, t };
}

test('LiveStrategyEngine (Silver Bullet): an FVG formed inside the killzone, agreeing with structure, fires a "validated" signal one candle after mitigation, entry = candle.open, and opens a REAL position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, silverBulletConfig: SILVERBULLET_CFG, guardrail, riskPctPerTrade: 1,
  });

  const { candles, t: t0 } = silverBulletBaseFixture();
  let t = t0;
  const mitigation = c(t, 109.3, 109.4, 108.7, 108.8); t += M15; // low 108.7 <= zone.top 108.9
  const entry = c(t, 109.5, 109.6, 109.4, 109.5); t += M15; // entry candle, open=109.5

  for (const candle of candles) engine.ingestCandle('TEST1', candle);
  const mitigationEvents = engine.ingestCandle('TEST1', mitigation);
  assert.equal(mitigationEvents.filter((e) => e.source === 'silverbullet').length, 0, 'the mitigation candle itself does not fire a signal - entry waits one more candle');

  const entryEvents = engine.ingestCandle('TEST1', entry).filter((e) => e.source === 'silverbullet');
  assert.equal(entryEvents.length, 1);
  const sig = entryEvents[0];
  assert.equal(sig.direction, 'bullish');
  assert.equal(sig.suggestedSide, 'buy');
  assert.equal(sig.entryPrice, 109.5);
  assert.ok(Math.abs(sig.stopPrice - 108.46) < 1e-9); // zone.bottom(108.5) - 10% of zone height(0.4) buffer
  assert.equal(sig.blockedReason, null);
  assert.equal(engine.getOpenPosition('TEST1').source, 'silverbullet', 'a clean Silver Bullet signal now claims the REAL netting slot, same as FVG/Divergence/NWOG/Judas Swing/Weekly Sweep/Breaker Block');
});

test('LiveStrategyEngine: netting blocks a Silver Bullet signal on a symbol that already has an open position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, silverBulletConfig: SILVERBULLET_CFG, guardrail, riskPctPerTrade: 1,
  });
  engine.openPositions.set('TEST1', {
    source: 'fvg', id: 'fake-open', direction: 'bearish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 200, targetPrice: 0, distance: 100, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const { candles, t: t0 } = silverBulletBaseFixture();
  let t = t0;
  const mitigation = c(t, 109.3, 109.4, 108.7, 108.8); t += M15;
  const entry = c(t, 109.5, 109.6, 109.4, 109.5); t += M15;

  for (const candle of candles) engine.ingestCandle('TEST1', candle);
  engine.ingestCandle('TEST1', mitigation);
  const entryEvents = engine.ingestCandle('TEST1', entry).filter((e) => e.source === 'silverbullet');

  assert.equal(entryEvents.length, 1, 'still reported - informational, same convention as every other blockedReason');
  assert.equal(entryEvents[0].blockedReason, 'netting');
});

// --- CBDR (Central Bank Dealer Range fade) - LIVE auto-execute (2026-09-18,
// US100 only) ---------------------------------------------------------------
// Same openPositions/netting/auto-execute path as every other live source
// above - no CBDR-specific position tracking. Fixture copied from
// test/cbdr.test.js's own cbdrFixture()/histDataTime() (the pure
// detectCbdrEvents()/runCbdrBacktest() unit tests) - January dates keep real
// NY time == the fixed-EST digits used project-wide for candle .time (no DST
// in effect), same convention as every other live-engine test in this file.

function histDataTime(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min, 0);
}

// CBDR (Jan 15 2024, 14:00-19:45 NY): range high=110, low=90, height=20.
// upper 2x projection = 110 + 2*20 = 150. lower 2x projection = 90 - 2*20 = 50.
function cbdrBaseFixture() {
  return [
    c(histDataTime(2024, 1, 15, 14, 0), 100, 101, 99, 100),
    c(histDataTime(2024, 1, 15, 15, 0), 100, 110, 100, 108), // range high 110
    c(histDataTime(2024, 1, 15, 16, 0), 108, 109, 90, 95), // range low 90
    c(histDataTime(2024, 1, 15, 19, 0), 95, 100, 94, 99),
  ];
}

const CBDR_CFG = { symbols: ['TEST1'], rrMultiple: 3, maxHoldingM15Candles: 480 };

test('LiveStrategyEngine (CBDR): an upside 2x-projection touch fires a "validated" fade signal one candle later, entry = candle.open, and opens a REAL position', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, cbdrConfig: CBDR_CFG, guardrail, riskPctPerTrade: 1,
  });

  const touch = c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101); // high 152 >= upper projection 150 -> bearish fade, stopReference = 152
  const entry = c(histDataTime(2024, 1, 15, 20, 15), 101, 101.5, 100, 100.5); // entry candle: entryPrice = open = 101

  for (const candle of cbdrBaseFixture()) engine.ingestCandle('TEST1', candle);
  const touchEvents = engine.ingestCandle('TEST1', touch);
  assert.equal(touchEvents.length, 0, 'the touch candle itself does not fire a signal - entry waits one more candle');

  const entryEvents = engine.ingestCandle('TEST1', entry).filter((e) => e.source === 'cbdr');
  assert.equal(entryEvents.length, 1);
  const sig = entryEvents[0];
  assert.equal(sig.direction, 'bearish');
  assert.equal(sig.suggestedSide, 'sell'); // required by _handleAutoExecuteEntry's real order submission
  assert.equal(sig.entryPrice, 101);
  assert.equal(sig.stopPrice, 152);
  assert.ok(Math.abs(sig.distance - 51) < 1e-9);
  assert.ok(Math.abs(sig.targetPrice - (-52)) < 1e-9); // entry - 3R
  assert.equal(sig.blockedReason, null);
  assert.equal(engine.getOpenPosition('TEST1').source, 'cbdr', 'a clean CBDR signal now claims the REAL netting slot, same as every other live source');
});

test('LiveStrategyEngine (CBDR): resolves to a WIN at the fixed 1:3 target', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, cbdrConfig: CBDR_CFG, guardrail, riskPctPerTrade: 1,
  });
  const touch = c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101);
  const entry = c(histDataTime(2024, 1, 15, 20, 15), 101, 101.5, 100, 100.5);
  const resolve = c(histDataTime(2024, 1, 15, 20, 30), 100.5, 101, -53, -52); // low <= target -52 -> WIN

  for (const candle of [...cbdrBaseFixture(), touch, entry]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', resolve).filter((e) => e.type === 'closed' && e.source === 'cbdr');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'win');
  assert.equal(engine.getOpenPosition('TEST1'), null);
});

test('LiveStrategyEngine (CBDR): resolves to a LOSS when the stop is hit', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, cbdrConfig: CBDR_CFG, guardrail, riskPctPerTrade: 1,
  });
  const touch = c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101);
  const entry = c(histDataTime(2024, 1, 15, 20, 15), 101, 101.5, 100, 100.5);
  const resolve = c(histDataTime(2024, 1, 15, 20, 30), 100.6, 153, 100, 101); // high >= stop 152 -> LOSS

  for (const candle of [...cbdrBaseFixture(), touch, entry]) engine.ingestCandle('TEST1', candle);
  const closeEvents = engine.ingestCandle('TEST1', resolve).filter((e) => e.type === 'closed' && e.source === 'cbdr');
  assert.equal(closeEvents.length, 1);
  assert.equal(closeEvents[0].outcome, 'loss');
});

test('LiveStrategyEngine: netting blocks a CBDR signal on a symbol that already has an open position (and vice versa - same shared slot)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, cbdrConfig: CBDR_CFG, guardrail, riskPctPerTrade: 1,
  });
  engine.openPositions.set('TEST1', {
    source: 'fvg', id: 'fake-open', direction: 'bearish', entryIndex: 0, entryTime: -1,
    entryPrice: 100, stopPrice: 200, targetPrice: 0, distance: 100, rrMultiple: 3,
    riskAmount: 100, maxHoldingCandles: 480,
  });

  const touch = c(histDataTime(2024, 1, 15, 20, 0), 100, 152, 99, 101);
  const entry = c(histDataTime(2024, 1, 15, 20, 15), 101, 101.5, 100, 100.5);

  for (const candle of [...cbdrBaseFixture(), touch]) engine.ingestCandle('TEST1', candle);
  const entryEvents = engine.ingestCandle('TEST1', entry).filter((e) => e.source === 'cbdr');

  assert.equal(entryEvents.length, 1, 'still reported - informational, same convention as every other blockedReason');
  assert.equal(entryEvents[0].blockedReason, 'netting');
});

// 2026-09-18, real bug found live (HANDOFF.md: "un redémarrage pendant
// qu'une position est ouverte fait perdre au bot sa propre trace du
// trade"): a real Silver Bullet GER40 position survived an unrelated
// deploy's restart, but openPositions (in-memory only) came back empty -
// netting had no way to know GER40 was occupied. adoptExternalPosition()
// is cTraderDataSource.js's _clearStaleBeliefsAgainstBroker's fix for
// this: re-register a real-only position (accountReconciliation.js's
// computeRealOnlyPositionsToAdopt decides WHICH ones qualify) back into
// tracking.
test('LiveStrategyEngine.adoptExternalPosition: registers a real position with no prior belief, source "adopted", entryIndex at the tail of history', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, guardrail, riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101)); // history now has 2 candles, tail index 1

  const belief = engine.adoptExternalPosition('TEST1', {
    positionId: '41685618', direction: 'bearish', entryPrice: 25330.75, stopPrice: 25367.95, targetPrice: 25219.15,
  });

  assert.ok(belief, 'expected the real-only position to be adopted');
  assert.equal(belief.source, 'adopted');
  assert.equal(belief.id, 'adopted:41685618');
  assert.equal(belief.entryIndex, 1, 'entryIndex is "now" (tail of history), not a guessed real entry point');
  assert.equal(belief.direction, 'bearish');
  assert.equal(belief.entryPrice, 25330.75);
  assert.equal(belief.stopPrice, 25367.95);
  assert.equal(belief.targetPrice, 25219.15);
  assert.equal(belief.riskAmount, null, 'unknowable after the fact - never fabricated');
  assert.deepEqual(engine.getOpenPosition('TEST1'), belief);
});

test('LiveStrategyEngine.adoptExternalPosition: never clobbers an existing belief on the same symbol', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, guardrail, riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  const existing = {
    source: 'fvg', id: 'fvg-real-open', direction: 'bullish', entryIndex: 0, entryTime: 0,
    entryPrice: 100, stopPrice: 90, targetPrice: 130, distance: 10, rrMultiple: 3,
    riskAmount: 50, maxHoldingCandles: 480,
  };
  engine.openPositions.set('TEST1', existing);

  const result = engine.adoptExternalPosition('TEST1', {
    positionId: '999', direction: 'bearish', entryPrice: 200, stopPrice: 210, targetPrice: 150,
  });

  assert.equal(result, null, 'a belief already exists - nothing to adopt');
  assert.equal(engine.getOpenPosition('TEST1'), existing, 'the real existing belief must survive untouched');
});

test('LiveStrategyEngine.adoptExternalPosition: a symbol this engine does not track at all is never adopted into', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'], fvgConfig: {}, divergenceConfig: null, guardrail, riskPctPerTrade: 1,
  });

  const result = engine.adoptExternalPosition('UNTRACKED', {
    positionId: '1', direction: 'bullish', entryPrice: 100, stopPrice: 90, targetPrice: 130,
  });

  assert.equal(result, null);
  assert.equal(engine.getOpenPosition('UNTRACKED'), null);
});

test('LiveStrategyEngine.adoptExternalPosition: once adopted, netting blocks a new real signal on the same symbol (the actual fix)', () => {
  const guardrail = permissiveGuardrail();
  const engine = new LiveStrategyEngine({
    symbols: ['TEST1'],
    fvgConfig: { TEST1: BASELINE_FVG_CFG },
    divergenceConfig: null,
    guardrail,
    riskPctPerTrade: 1,
  });
  engine.ingestCandle('TEST1', c(0, 100, 101, 99, 100));
  engine.ingestCandle('TEST1', c(M15, 100, 102, 100, 101));
  engine.adoptExternalPosition('TEST1', {
    positionId: '41685618', direction: 'bearish', entryPrice: 100, stopPrice: 110, targetPrice: 80,
  });

  // Same bullish-gap sequence as the very first test in this file, on top
  // of the adopted belief - without the fix, openPositions would be empty
  // and this would open a SECOND real position on the same symbol.
  engine.ingestCandle('TEST1', c(2 * M15, 102, 105, 103, 104));
  const validatedEvs = engine.ingestCandle('TEST1', c(3 * M15, 104, 104, 102, 103));
  const validated = validatedEvs.find((e) => e.type === 'validated');

  assert.ok(validated, 'expected the FVG signal to still be reported (informational)');
  assert.equal(validated.blockedReason, 'netting');
  assert.equal(engine.getOpenPosition('TEST1').source, 'adopted', 'the adopted position must remain the one tracked');
});
