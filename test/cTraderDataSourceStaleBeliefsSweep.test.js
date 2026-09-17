import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';

// Fourth file in this series (2026-09-17, Esdras: "on doit corriger 5 test
// ensemble minimum"). _clearStaleBeliefsAgainstBroker runs at boot AND every
// 5 minutes - it is the self-healing sweep that keeps a stuck belief or a
// dropped stop-loss from surviving unnoticed. Its two DECISIONS
// (computeStaleBeliefsToClear/computeMissingStopFixes) are already
// pure-function tested in accountReconciliation.test.js, but the actual
// live wiring around them - the ProtoOAReconcileReq call, and specifically
// the getTrackedStopPrice callback that maps openPositionInfoByPositionId's
// stored shape into what computeMissingStopFixes expects - never was. That
// callback is exactly where today's earlier "takeProfit always undefined"
// bug lived (see cTraderDataSource.js's own comment on it) - this locks
// that fix in.
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
  };
}

function createFakeAccount({ believedOpen = null } = {}) {
  const clearBelievedPositionCalls = [];
  return {
    strategyEngine: {
      getOpenPosition(symbol) {
        return believedOpen && believedOpen.symbol === symbol ? believedOpen : null;
      },
      clearBelievedPosition(symbol, id) {
        clearBelievedPositionCalls.push({ symbol, id });
        return true;
      },
    },
    _clearBelievedPositionCalls: clearBelievedPositionCalls,
  };
}

function makeDataSource(connection, account) {
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: ['US100'] });
  ds.connection = connection;
  ds.accountId = 12345;
  ds.symbolIdByName.set('US100', 213);
  return ds;
}

test('_clearStaleBeliefsAgainstBroker: a real position tracked here with a dropped stop-loss gets it resubmitted, WITH the real takeProfit (not undefined)', async () => {
  const amendCalls = [];
  const connection = createMockConnection({
    sendCommand: async (name, data) => {
      if (name === 'ProtoOAReconcileReq') {
        return {
          position: [{ positionId: '41800000', tradeData: { symbolId: 213, label: 'auto-fvg-US100' }, stopLoss: null }],
          order: [],
        };
      }
      if (name === 'ProtoOAAmendPositionSLTPReq') {
        amendCalls.push(data);
        return {};
      }
      return {};
    },
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);
  ds.openPositionInfoByPositionId.set('41800000', {
    symbolName: 'US100',
    source: 'fvg',
    signalId: 'US100-123',
    stopPrice: 29200.5,
    targetPrice: 29450.0, // stored as targetPrice, NOT takeProfit - this is exactly the field the earlier bug lost
  });

  await ds._clearStaleBeliefsAgainstBroker(12345);

  assert.equal(amendCalls.length, 1, 'a real position with a dropped stop-loss must get it resubmitted');
  assert.equal(amendCalls[0].positionId, 41800000);
  assert.equal(amendCalls[0].stopLoss, 29200.5);
  assert.equal(amendCalls[0].takeProfit, 29450.0, 'the real fix: takeProfit must come from the tracked entry, not be silently omitted as undefined');
});

test('_clearStaleBeliefsAgainstBroker: a position never seen by this process (no tracked entry) is left alone, never guessed', async () => {
  const amendCalls = [];
  const connection = createMockConnection({
    sendCommand: async (name, data) => {
      if (name === 'ProtoOAReconcileReq') {
        return { position: [{ positionId: '999999', tradeData: { symbolId: 213 }, stopLoss: null }], order: [] };
      }
      if (name === 'ProtoOAAmendPositionSLTPReq') amendCalls.push(data);
      return {};
    },
  });
  const ds = makeDataSource(connection, createFakeAccount());
  // openPositionInfoByPositionId deliberately left empty.

  await ds._clearStaleBeliefsAgainstBroker(12345);

  assert.equal(amendCalls.length, 0, 'never invent a stop-loss for a position this process has no record of');
});

test('_clearStaleBeliefsAgainstBroker: a purely historical believed-open position with nothing real at the broker is cleared', async () => {
  const connection = createMockConnection({
    sendCommand: async (name) => (name === 'ProtoOAReconcileReq' ? { position: [], order: [] } : {}),
  });
  const account = createFakeAccount({ believedOpen: { id: 'US100-999', symbol: 'US100' } });
  const ds = makeDataSource(connection, account);

  await ds._clearStaleBeliefsAgainstBroker(12345);

  assert.equal(account._clearBelievedPositionCalls.length, 1);
  assert.deepEqual(account._clearBelievedPositionCalls[0], { symbol: 'US100', id: 'US100-999' });
});

test('_clearStaleBeliefsAgainstBroker: a failed reconcile request is best-effort - never throws, boot must not be blocked', async () => {
  const connection = createMockConnection({
    sendCommand: async () => {
      throw new Error('connection down');
    },
  });
  const ds = makeDataSource(connection, createFakeAccount());

  await assert.doesNotReject(() => ds._clearStaleBeliefsAgainstBroker(12345));
});
