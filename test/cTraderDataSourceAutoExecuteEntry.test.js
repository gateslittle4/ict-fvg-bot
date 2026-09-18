import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';

// Same deliberate exception as cTraderDataSourceOrderSubmission.test.js
// (2026-09-17, Esdras: "comment vérifie-t-on que ça marche à 100%") - this
// covers _handleAutoExecuteEntry itself, the ONE function every real
// auto-execute signal actually goes through (Divergence/FVG/NWOG/Judas
// Swing/Weekly Sweep/Breaker Block/Silver Bullet alike), not just the two
// lower-level pieces (_submitOrder, _findRealOrderOrPositionForLabel)
// cTraderDataSourceOrderSubmission.test.js already locks in.
function createMockConnection({ sendCommand } = {}) {
  const listeners = new Map();
  let nextUuid = 1;
  return {
    sendCommand: sendCommand || (async () => ({})),
    on(eventName, handler) {
      const uuid = nextUuid++;
      listeners.set(uuid, { eventName, handler });
      return uuid;
    },
    removeEventListener(uuid) {
      listeners.delete(uuid);
    },
    _emit(eventName, event) {
      for (const { eventName: en, handler } of listeners.values()) {
        if (en === eventName) handler(event);
      }
    },
  };
}

// Minimal fake AccountRuntime - only the properties/methods
// _handleAutoExecuteEntry actually touches. Spies (clearBelievedPositionCalls/
// recordOrderOutcomeCalls) let each test assert exactly what the engine was
// told, without needing a real LiveStrategyEngine or Supabase journal.
function createFakeAccount() {
  const clearBelievedPositionCalls = [];
  const recordOrderOutcomeCalls = [];
  return {
    balance: 10000,
    lastCandleBySymbol: new Map(),
    strategyEngine: {
      riskPctPerTrade: 0.5,
      clearBelievedPosition(symbol, signalId) {
        clearBelievedPositionCalls.push({ symbol, signalId });
      },
    },
    recordOrderOutcome(args) {
      recordOrderOutcomeCalls.push(args);
    },
    _clearBelievedPositionCalls: clearBelievedPositionCalls,
    _recordOrderOutcomeCalls: recordOrderOutcomeCalls,
  };
}

function makeDataSource(connection, account) {
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: [] });
  ds.connection = connection;
  ds.accountId = 12345;
  // _specFor() falls back to getDefaultSpec()'s placeholder (pointSize/
  // valuePerPointPerLot only, no lotSize/rawVolume) when the broker hasn't
  // answered yet - _submitOrder deliberately REFUSES to size an order from
  // that placeholder alone (see its own "refusing to submit... no
  // broker-confirmed lotSize" guard - correct, intentional behavior, not a
  // bug). A real boot populates this from the broker's own ProtoOASymbol via
  // _loadSymbolSpecs(); simulate that here with a minimal compatible spec.
  ds.brokerSymbolSpecByName.set('US100', {
    lotSize: 100000,
    pointSize: 1,
    valuePerPointPerLot: 1,
    minVolume: 0.1,
    volumeStep: 0.1,
    maxVolume: 50,
    verified: true,
  });
  return ds;
}

// Real values from today's actual Silver Bullet/Divergence incidents (MARKET
// orders, not FVG's LIMIT path) - entryPrice/stopPrice just need to be two
// distinct real-looking numbers for calculateLotSize to accept.
const SIGNAL = {
  id: 'silverbullet-US100-1789640100000',
  source: 'silverbullet',
  suggestedSide: 'buy',
  entryPrice: 29440.7,
  stopPrice: 29389.5,
  targetPrice: 29696.7,
};

test('_handleAutoExecuteEntry: push confirmation arrives -> tracked in pendingEntryOrderByOrderId, nothing else touched', async () => {
  const connection = createMockConnection();
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handleAutoExecuteEntry('US100', 213, SIGNAL);
  connection._emit('ProtoOAExecutionEvent', {
    descriptor: { order: { orderId: 50415794, tradeData: { symbolId: 213 } }, executionType: 'ORDER_ACCEPTED' },
  });
  await promise;

  assert.ok(ds.pendingEntryOrderByOrderId.has('50415794'), 'the confirmed order must be tracked for later fill/cancel handling'); // string key - see the map's own set() convention (2026-09-18 fix)
  const tracked = ds.pendingEntryOrderByOrderId.get('50415794');
  assert.equal(tracked.symbolName, 'US100');
  assert.equal(tracked.source, 'silverbullet');
  assert.equal(account._clearBelievedPositionCalls.length, 0);
  assert.equal(account._recordOrderOutcomeCalls.length, 0);
});

test('_handleAutoExecuteEntry: no confirmation, reconcile finds the order still pending -> adopted, belief kept (the "lost confirmation, real order" case)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = createMockConnection({
    sendCommand: async (name) => {
      if (name === 'ProtoOAReconcileReq') {
        return {
          order: [{ orderId: 777, tradeData: { label: 'auto-silverbullet-US100', symbolId: 213, openTimestamp: String(Date.now()) } }],
          position: [],
        };
      }
      return {}; // ProtoOANewOrderReq's real empty sync response
    },
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handleAutoExecuteEntry('US100', 213, SIGNAL);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000); // _waitForOrderIdBySymbol's own timeout - no push ever arrives
  await promise;

  assert.ok(ds.pendingEntryOrderByOrderId.has('777'), 'the reconciled real orderId must be adopted, not discarded'); // string key - see the map's own set() convention (2026-09-18 fix)
  assert.equal(account._clearBelievedPositionCalls.length, 0, 'a real working order must NOT clear the engine\'s belief');
});

test('_handleAutoExecuteEntry: no confirmation, reconcile finds an already-FILLED position -> the exact 2026-09-17 orphan case, now caught', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = createMockConnection({
    sendCommand: async (name) => {
      if (name === 'ProtoOAReconcileReq') {
        return {
          order: [],
          position: [{ positionId: 41661214, tradeData: { label: 'auto-silverbullet-US100', symbolId: 213, openTimestamp: String(Date.now()) } }],
        };
      }
      return {};
    },
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handleAutoExecuteEntry('US100', 213, SIGNAL);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000);
  await promise;

  assert.ok(ds.openPositionInfoByPositionId.has('41661214'), 'a real filled position found via reconcile must be tracked - this is the orphan-position bug the fix closes');
  assert.equal(account._clearBelievedPositionCalls.length, 0, 'a real position must NOT be treated as if nothing happened');
  assert.equal(account._recordOrderOutcomeCalls.length, 1);
  assert.deepEqual(account._recordOrderOutcomeCalls[0], {
    symbol: 'US100',
    source: 'silverbullet',
    signalId: SIGNAL.id,
    outcome: 'filled',
    executionType: 'RECONCILE_VERIFIED',
  });
});

test('_handleAutoExecuteEntry: no confirmation, reconcile finds genuinely nothing -> belief cleared, no orphan invented', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = createMockConnection({
    sendCommand: async (name) => (name === 'ProtoOAReconcileReq' ? { order: [], position: [] } : {}),
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handleAutoExecuteEntry('US100', 213, SIGNAL);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000);
  await promise;

  assert.equal(ds.pendingEntryOrderByOrderId.size, 0);
  assert.equal(ds.openPositionInfoByPositionId.size, 0);
  assert.equal(account._clearBelievedPositionCalls.length, 1);
  assert.deepEqual(account._clearBelievedPositionCalls[0], { symbol: 'US100', signalId: SIGNAL.id });
});
