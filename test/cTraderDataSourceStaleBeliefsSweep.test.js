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

function createFakeAccount({ believedOpen = null, adoptReturns = undefined } = {}) {
  const clearBelievedPositionCalls = [];
  const adoptExternalPositionCalls = [];
  return {
    strategyEngine: {
      getOpenPosition(symbol) {
        return believedOpen && believedOpen.symbol === symbol ? believedOpen : null;
      },
      clearBelievedPosition(symbol, id) {
        clearBelievedPositionCalls.push({ symbol, id });
        return true;
      },
      adoptExternalPosition(symbol, real) {
        adoptExternalPositionCalls.push({ symbol, real });
        if (adoptReturns === undefined) return { source: 'adopted', id: `adopted:${real.positionId}` };
        return adoptReturns;
      },
    },
    _clearBelievedPositionCalls: clearBelievedPositionCalls,
    _adoptExternalPositionCalls: adoptExternalPositionCalls,
  };
}

function makeDataSource(connection, account) {
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: ['US100'] });
  ds.connection = connection;
  ds.accountId = 12345;
  ds.symbolIdByName.set('US100', 213);
  // Real boot populates BOTH directions from the SAME ProtoOASymbolsListReq
  // response (_loadSymbols) - computeRealOnlyPositionsToAdopt needs this
  // direction (id -> name), computeStaleBeliefsToClear the other.
  ds.symbolNameById.set('213', 'US100');
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
  // believedOpen matches this position (real production state: the belief
  // is set BEFORE openPositionInfoByPositionId, in the same signal-fill
  // flow - see liveStrategyEngine.js/cTraderDataSource.js - so a position
  // tracked in one is always tracked in the other too). Without this, the
  // 2026-09-18 adoption fix (see the dedicated tests further below) would
  // otherwise mistake this SAME position for a real-only/forgotten one and
  // overwrite this exact openPositionInfoByPositionId entry with adopted
  // (null) stop/target data, defeating the very fix this test locks in.
  const account = createFakeAccount({ believedOpen: { symbol: 'US100', id: 'US100-123' } });
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

// 2026-09-18, real bug found live (HANDOFF.md: "un redémarrage pendant
// qu'une position est ouverte fait perdre au bot sa propre trace du
// trade"): a real GER40 position (Silver Bullet) survived an unrelated
// deploy's restart with no belief left behind - reconcileAccount() already
// labels this 'real-only', but nothing acted on it until this fix. These
// tests lock in the ACTUAL wiring (not just the pure decision function,
// already tested in accountReconciliation.test.js): the real position gets
// adopted AND registered in openPositionInfoByPositionId so a later real
// close still writes a durable journal row.
test('_clearStaleBeliefsAgainstBroker: a real position with no belief is adopted, and openPositionInfoByPositionId is populated for the eventual real close', async () => {
  const connection = createMockConnection({
    sendCommand: async (name) =>
      name === 'ProtoOAReconcileReq'
        ? {
            position: [
              {
                positionId: '41685618',
                tradeData: { symbolId: 213, tradeSide: 'SELL', openTimestamp: 1789742701590 },
                price: 25330.75,
                stopLoss: 25367.95,
                takeProfit: 25219.15,
              },
            ],
            order: [],
          }
        : {},
  });
  const account = createFakeAccount();
  const ds = makeDataSource(connection, account);

  await ds._clearStaleBeliefsAgainstBroker(12345);

  assert.equal(account._adoptExternalPositionCalls.length, 1);
  assert.equal(account._adoptExternalPositionCalls[0].symbol, 'US100');
  assert.equal(account._adoptExternalPositionCalls[0].real.positionId, '41685618');
  assert.equal(account._adoptExternalPositionCalls[0].real.direction, 'bearish');

  const info = ds.openPositionInfoByPositionId.get('41685618');
  assert.ok(info, 'the adopted position must be registered for the real-close journal path');
  assert.equal(info.symbolName, 'US100');
  assert.equal(info.source, 'adopted');
  assert.equal(info.signalId, 'adopted:41685618');
  assert.equal(info.riskAmount, null, 'never fabricated');
  assert.equal(info.stopPrice, 25367.95);
  assert.equal(info.targetPrice, 25219.15);
});

test('_clearStaleBeliefsAgainstBroker: a position already believed open is never re-adopted', async () => {
  const connection = createMockConnection({
    sendCommand: async (name) =>
      name === 'ProtoOAReconcileReq'
        ? { position: [{ positionId: '1', tradeData: { symbolId: 213 }, price: 100, stopLoss: 90, takeProfit: 120 }], order: [] }
        : {},
  });
  const account = createFakeAccount({ believedOpen: { symbol: 'US100', id: 'fvg-123' } });
  const ds = makeDataSource(connection, account);

  await ds._clearStaleBeliefsAgainstBroker(12345);

  assert.equal(account._adoptExternalPositionCalls.length, 0);
  assert.equal(ds.openPositionInfoByPositionId.size, 0);
});

test('_clearStaleBeliefsAgainstBroker: adoptExternalPosition returning null (e.g. a race with a belief that just appeared) skips registering openPositionInfoByPositionId', async () => {
  const connection = createMockConnection({
    sendCommand: async (name) =>
      name === 'ProtoOAReconcileReq'
        ? { position: [{ positionId: '1', tradeData: { symbolId: 213 }, price: 100, stopLoss: 90, takeProfit: 120 }], order: [] }
        : {},
  });
  const account = createFakeAccount({ adoptReturns: null });
  const ds = makeDataSource(connection, account);

  await ds._clearStaleBeliefsAgainstBroker(12345);

  assert.equal(account._adoptExternalPositionCalls.length, 1, 'adoption was attempted');
  assert.equal(ds.openPositionInfoByPositionId.size, 0, 'nothing to register - the engine declined the adoption');
});

test('_closeRealPositionsAfterTimeout: the engine timing a position out closes the bot\'s own real position at market, nothing else', async () => {
  const sent = [];
  const connection = createMockConnection({
    sendCommand: async (name, data) => {
      sent.push({ name, data });
      if (name === 'ProtoOAReconcileReq') {
        return {
          position: [
            { positionId: '7', positionStatus: 'POSITION_STATUS_OPEN', tradeData: { symbolId: 213, volume: '169', label: 'auto-divergence-US100' } },
            { positionId: '8', positionStatus: 'POSITION_STATUS_OPEN', tradeData: { symbolId: 213, volume: '50', label: 'manual' } },
          ],
          order: [],
        };
      }
      return {};
    },
  });
  const ds = makeDataSource(connection, createFakeAccount());
  await ds._closeRealPositionsAfterTimeout('US100', 213, { type: 'closed', outcome: 'timeout', source: 'divergence', direction: 'bullish' });
  const closes = sent.filter((c) => c.name === 'ProtoOAClosePositionReq');
  assert.equal(closes.length, 1);
  assert.equal(closes[0].data.positionId, 7);
  assert.equal(closes[0].data.volume, 169);
});

test('_closeRealPositionsAfterTimeout: a broker failure is logged, never thrown (the broker stop/target still protects the position)', async () => {
  const connection = createMockConnection({ sendCommand: async () => { throw new Error('socket down'); } });
  const ds = makeDataSource(connection, createFakeAccount());
  await ds._closeRealPositionsAfterTimeout('US100', 213, { type: 'closed', outcome: 'timeout', source: 'divergence', direction: 'bullish' });
});
