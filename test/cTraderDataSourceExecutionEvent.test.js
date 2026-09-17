import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';

// Third and last file in this series (2026-09-17, Esdras: "quoi d'autre à
// faire pour réduire l'écart" -> "fais dans l'ordre que tu as recommandé").
// cTraderDataSourceOrderSubmission.test.js and
// cTraderDataSourceAutoExecuteEntry.test.js cover "did the order really reach
// the broker" - this file covers the OTHER half of the loop: when the
// broker's own confirmation DOES arrive normally (a real fill, cancel,
// reject, or close), does the engine's belief get updated correctly? A bug
// here would lose track of a position even on a perfectly healthy
// connection, a different failure mode from everything tested so far.
// _handleExecutionEvent is synchronous and touches no connection/timer at
// all, so unlike the other two files this needs no mock connection or fake
// timers - just a fake account/store and a raw event object.

function createFakeAccount() {
  const clearBelievedPositionCalls = [];
  const recordOrderOutcomeCalls = [];
  const setBalanceCalls = [];
  return {
    balance: 10000,
    label: 'test-account',
    lastCandleBySymbol: new Map(),
    strategyEngine: {
      riskPctPerTrade: 0.5,
      clearBelievedPosition(symbol, signalId) {
        clearBelievedPositionCalls.push({ symbol, signalId });
      },
      markPyramidOrderFilled(symbol) {
        return { direction: 'bullish', entryPrice: 100, stopPrice: 95, targetPrice: 115, riskAmount: 50 };
      },
    },
    // A real GuardrailEngine, not a fake - it's already independently unit
    // tested and has no network I/O, so using the real thing here is more
    // faithful than reimplementing its recordTrade/consumeTargetReachedEvent
    // bookkeeping a second time as a spy.
    guardrail: new GuardrailEngine({}),
    setBalance(v) {
      this.balance = v;
      setBalanceCalls.push(v);
    },
    recordOrderOutcome(args) {
      recordOrderOutcomeCalls.push(args);
    },
    _clearBelievedPositionCalls: clearBelievedPositionCalls,
    _recordOrderOutcomeCalls: recordOrderOutcomeCalls,
    _setBalanceCalls: setBalanceCalls,
  };
}

function makeDataSource(account) {
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: [] });
  ds.symbolNameById.set(213, 'US100');
  return ds;
}

test('_handleExecutionEvent: a real position CLOSE updates balance/guardrail, logs the outcome, and clears the belief', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);
  ds.openPositionInfoByPositionId.set('41661214', {
    symbolName: 'US100',
    source: 'silverbullet',
    signalId: 'silverbullet-US100-123',
    direction: 'bullish',
    entryPrice: 29440.7,
    riskAmount: 100,
    entryTime: Date.now() - 60000,
  });

  ds._handleExecutionEvent({
    executionType: 'ORDER_FILLED',
    deal: {
      positionId: '41661214',
      symbolId: 213,
      closePositionDetail: { grossProfit: '500', balance: '1050000', moneyDigits: 2 },
    },
  });

  assert.equal(account.balance, 10500, 'must adopt the broker\'s own resulting balance, not just accumulate pnl locally');
  assert.equal(account._setBalanceCalls.length, 1);
  assert.equal(!ds.openPositionInfoByPositionId.has('41661214'), true, 'a closed position must stop being tracked as open');
  assert.equal(account._clearBelievedPositionCalls.length, 1);
  assert.deepEqual(account._clearBelievedPositionCalls[0], { symbol: 'US100', signalId: 'silverbullet-US100-123' });
});

test('_handleExecutionEvent: a pyramid add-on order FILLING (opening, not closing) is tracked, not confused with a close', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);
  ds.pyramidOrderSymbolByOrderId.set(6001, 'US100');

  ds._handleExecutionEvent({
    executionType: 'ORDER_FILLED',
    order: { orderId: 6001 },
    position: { positionId: 41700000 },
  });

  assert.equal(ds.pyramidOrderSymbolByOrderId.has(6001), false, 'consumed once filled');
  assert.equal(ds.pyramidPositionIdBySymbol.get('US100'), 41700000, 'the resulting position must be tracked for its eventual close');
});

// BUG FOUND 2026-09-17 (execution-path audit): pyramidPositionIdBySymbol's
// match-on-close used a bare `===`, the only positionId/orderId comparison
// in this whole file not wrapped in Number(...) - everywhere else is,
// specifically because this broker is confirmed to sometimes serialize the
// same conceptual int64 field as a string and sometimes as a number
// depending on which message it came from (a STOP order's fill event vs a
// ProtoOAReconcileReq position). trackedId (set at pyramid-fill time, or via
// the reconcile-verified path) and the closing event's own positionId are
// never guaranteed to agree on that.
test('_handleExecutionEvent: a pyramid position CLOSE matches by numeric value, not strict type (string vs number positionId)', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);
  // Simulates the reconcile-verified pyramid-fill path, which reads
  // positionId straight off a ProtoOAReconcileReq response - a string on
  // this broker.
  ds.pyramidPositionIdBySymbol.set('US100', '41900001');

  ds._handleExecutionEvent({
    executionType: 'ORDER_FILLED',
    deal: {
      // The closing event's own positionId, here a NUMBER - deliberately the
      // opposite type from what's tracked above.
      positionId: 41900001,
      symbolId: 213,
      closePositionDetail: { grossProfit: '100', balance: '1010000', moneyDigits: 2 },
    },
  });

  assert.equal(ds.pyramidPositionIdBySymbol.has('US100'), false, 'must match and clean up despite the string/number type difference');
});

// BUG FOUND 2026-09-17 (execution-path audit, continuing "réduire l'écart"):
// a pyramid leg used to be tracked ONLY in pyramidPositionIdBySymbol (a
// close-time notification only) - never in openPositionInfoByPositionId,
// which is what BOTH the periodic missing-stop-loss resubmission sweep
// (computeMissingStopFixes' getTrackedStopPrice) and the durable Supabase
// journal (logClosedTrade) read from. A dropped stop-loss on a pyramid leg
// (the same failure mode as the real 2026-09-14 BTCUSD incident, just on a
// different code path) would have been silently unprotected forever.
test('_handleExecutionEvent: a pyramid add-on FILL is also tracked in openPositionInfoByPositionId (stop-loss safety net + durable journal, not just a notification)', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);
  ds.pyramidOrderSymbolByOrderId.set(6002, 'US100');

  ds._handleExecutionEvent({
    executionType: 'ORDER_FILLED',
    order: { orderId: 6002 },
    position: { positionId: 41700001 },
  });

  const info = ds.openPositionInfoByPositionId.get('41700001');
  assert.ok(info, 'a pyramid leg must be tracked exactly like a normal entry, or the missing-stop-loss sweep silently skips it');
  assert.equal(info.source, 'pyramid');
  assert.equal(info.stopPrice, 95);
  assert.equal(info.targetPrice, 115);
  assert.equal(info.riskAmount, 50);
});

test('_handleExecutionEvent: a pyramid leg CLOSING (now tracked) updates balance/guardrail and logs to the journal, same as any other position', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);
  ds.openPositionInfoByPositionId.set('41700001', {
    symbolName: 'US100',
    source: 'pyramid',
    signalId: null,
    direction: 'bullish',
    entryPrice: 100,
    riskAmount: 50,
    entryTime: Date.now() - 30000,
  });

  ds._handleExecutionEvent({
    executionType: 'ORDER_FILLED',
    deal: {
      positionId: '41700001',
      symbolId: 213,
      closePositionDetail: { grossProfit: '2000', balance: '1200000', moneyDigits: 2 },
    },
  });

  assert.equal(account.balance, 12000);
  assert.equal(ds.openPositionInfoByPositionId.has('41700001'), false, 'a closed pyramid leg must stop being tracked as open');
  // clearBelievedPosition(symbol, null) is called (same code path every
  // close goes through) but must be a safe no-op here - a pyramid leg was
  // never registered in openPositions under any id.
  assert.equal(account._clearBelievedPositionCalls.length, 1);
  assert.equal(account._clearBelievedPositionCalls[0].signalId, null);
});

test('_handleExecutionEvent: a tracked auto-execute entry order FILLS -> adopted into openPositionInfoByPositionId, outcome recorded', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);
  ds.pendingEntryOrderByOrderId.set(7001, {
    symbolName: 'US100',
    source: 'silverbullet',
    signalId: 'silverbullet-US100-456',
    direction: 'bullish',
    entryPrice: 29440.7,
    riskAmount: 100,
    stopPrice: 29389.5,
    targetPrice: 29696.7,
  });

  ds._handleExecutionEvent({
    executionType: 'ORDER_FILLED',
    order: { orderId: 7001 },
    deal: { positionId: 41800000 },
  });

  assert.equal(ds.pendingEntryOrderByOrderId.has(7001), false);
  assert.ok(ds.openPositionInfoByPositionId.has('41800000'), 'the real fill must be adopted so its eventual close writes a real journal row');
  assert.equal(account._recordOrderOutcomeCalls.length, 1);
  assert.equal(account._recordOrderOutcomeCalls[0].outcome, 'filled');
  assert.equal(account._recordOrderOutcomeCalls[0].signalId, 'silverbullet-US100-456');
});

for (const executionType of ['ORDER_CANCELLED', 'ORDER_EXPIRED', 'ORDER_REJECTED']) {
  test(`_handleExecutionEvent: a tracked auto-execute entry order ${executionType} -> belief cleared, marked unfilled, no phantom position`, () => {
    const account = createFakeAccount();
    const ds = makeDataSource(account);
    ds.pendingEntryOrderByOrderId.set(8001, {
      symbolName: 'US100',
      source: 'fvg',
      signalId: 'US100-789',
      direction: 'bullish',
      entryPrice: 29440.7,
      riskAmount: 100,
    });

    ds._handleExecutionEvent({ executionType, order: { orderId: 8001 } });

    assert.equal(ds.pendingEntryOrderByOrderId.has(8001), false);
    assert.equal(ds.openPositionInfoByPositionId.size, 0, 'an order that never filled must never create a phantom open position');
    assert.equal(account._recordOrderOutcomeCalls.length, 1);
    assert.equal(account._recordOrderOutcomeCalls[0].outcome, 'unfilled');
    assert.equal(account._clearBelievedPositionCalls.length, 1);
    assert.deepEqual(account._clearBelievedPositionCalls[0], { symbol: 'US100', signalId: 'US100-789' });
  });
}

test('_handleExecutionEvent: an event for an UNTRACKED orderId (not ours, e.g. a manual trade) is a safe no-op', () => {
  const account = createFakeAccount();
  const ds = makeDataSource(account);

  assert.doesNotThrow(() => {
    ds._handleExecutionEvent({ executionType: 'ORDER_FILLED', order: { orderId: 999999 }, deal: { positionId: 1 } });
  });
  assert.equal(ds.openPositionInfoByPositionId.size, 0);
  assert.equal(account._recordOrderOutcomeCalls.length, 0);
  assert.equal(account._clearBelievedPositionCalls.length, 0);
});
