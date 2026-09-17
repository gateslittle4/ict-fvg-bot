import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';

// Fifth file in this series (2026-09-17, Esdras: "on doit tous coder,
// continue de chercher des bugs"). Mirrors
// cTraderDataSourceAutoExecuteEntry.test.js but for the pyramid add-on's own
// entry point, _handlePyramidOrderRequested - the OTHER function every real
// signal-driven order submission goes through, fixed earlier today with the
// same reconcile-based verification as the entry path, but never
// regression-tested until now.
//
// Writing this test surfaced a THIRD real bug in the same family: the
// "reconcile finds an already-filled position" branch called
// markPyramidOrderFilled but never populated openPositionInfoByPositionId
// (fixed in the same commit as this test) - the exact gap just closed on
// the push-confirmed pyramid-fill path (_handleExecutionEvent), on the
// path that exists SPECIFICALLY for when a push confirmation is lost.
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

function createFakeAccount() {
  const markPyramidOrderPlacedCalls = [];
  const clearPyramidPendingCalls = [];
  return {
    balance: 10000,
    strategyEngine: {
      riskPctPerTrade: 0.5,
      markPyramidOrderPlaced(symbol, brokerOrderId) {
        markPyramidOrderPlacedCalls.push({ symbol, brokerOrderId });
      },
      markPyramidOrderFilled(symbol) {
        return { direction: 'bullish', entryPrice: 29500, stopPrice: 29450, targetPrice: 29650, riskAmount: 50 };
      },
      clearPyramidPending(symbol) {
        clearPyramidPendingCalls.push(symbol);
      },
    },
    _markPyramidOrderPlacedCalls: markPyramidOrderPlacedCalls,
    _clearPyramidPendingCalls: clearPyramidPendingCalls,
  };
}

function makeDataSource(connection, account) {
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: [] });
  ds.connection = connection;
  ds.accountId = 12345;
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

const PYRAMID_EVENT = { direction: 'bullish', entryPrice: 29500, stopPrice: 29450, targetPrice: 29650 };

test('_handlePyramidOrderRequested: push confirmation arrives -> markPyramidOrderPlaced + tracked by orderId', async () => {
  const connection = createMockConnection();
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handlePyramidOrderRequested('US100', 213, PYRAMID_EVENT);
  connection._emit('ProtoOAExecutionEvent', {
    descriptor: { order: { orderId: 6500, tradeData: { symbolId: 213 } }, executionType: 'ORDER_ACCEPTED' },
  });
  await promise;

  assert.deepEqual(account._markPyramidOrderPlacedCalls, [{ symbol: 'US100', brokerOrderId: 6500 }]);
  assert.equal(ds.pyramidOrderSymbolByOrderId.get(6500), 'US100');
});

test('_handlePyramidOrderRequested: no confirmation, reconcile finds the STOP order still pending -> adopted by real orderId', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = createMockConnection({
    sendCommand: async (name) => {
      if (name === 'ProtoOAReconcileReq') {
        return {
          order: [{ orderId: 6600, tradeData: { label: 'pyramid-add-US100', symbolId: 213, openTimestamp: String(Date.now()) } }],
          position: [],
        };
      }
      return {};
    },
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handlePyramidOrderRequested('US100', 213, PYRAMID_EVENT);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000);
  await promise;

  assert.deepEqual(account._markPyramidOrderPlacedCalls, [{ symbol: 'US100', brokerOrderId: 6600 }]);
  assert.equal(ds.pyramidOrderSymbolByOrderId.get(6600), 'US100');
});

test('_handlePyramidOrderRequested: no confirmation, reconcile finds the STOP already FILLED -> real bug found writing this test, now fixed: tracked in openPositionInfoByPositionId', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = createMockConnection({
    sendCommand: async (name) => {
      if (name === 'ProtoOAReconcileReq') {
        return {
          order: [],
          position: [{ positionId: 41900000, tradeData: { label: 'pyramid-add-US100', symbolId: 213, openTimestamp: String(Date.now()) } }],
        };
      }
      return {};
    },
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handlePyramidOrderRequested('US100', 213, PYRAMID_EVENT);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000);
  await promise;

  assert.equal(ds.pyramidPositionIdBySymbol.get('US100'), 41900000);
  const info = ds.openPositionInfoByPositionId.get('41900000');
  assert.ok(info, 'a real filled pyramid leg found via reconcile must be protected by the same stop-loss sweep/journal as any other position');
  assert.equal(info.source, 'pyramid');
  assert.equal(info.stopPrice, 29450);
  assert.equal(info.targetPrice, 29650);
});

test('_handlePyramidOrderRequested: no confirmation, reconcile finds genuinely nothing -> clearPyramidPending called, no phantom tracking', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = createMockConnection({
    sendCommand: async (name) => (name === 'ProtoOAReconcileReq' ? { order: [], position: [] } : {}),
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  const promise = ds._handlePyramidOrderRequested('US100', 213, PYRAMID_EVENT);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(3000);
  await promise;

  assert.deepEqual(account._clearPyramidPendingCalls, ['US100']);
  assert.equal(ds.openPositionInfoByPositionId.size, 0);
  assert.equal(ds.pyramidOrderSymbolByOrderId.size, 0);
});
