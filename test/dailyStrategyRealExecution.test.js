import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { getDefaultSpec } from '../src/engines/lotCalculator.js';

// 2026-09-22, Esdras's explicit decision ("on le code") to execute RSI(2)/US500 for real, not just log it in mode alerte. This file covers the
// NEW real-money-affecting wiring specifically: entry via the existing _handleAutoExecuteEntry (reused, not duplicated), signal-based exit via a
// NEW ProtoOAClosePositionReq (never used anywhere else in this codebase before today), the shared guardrail check, and the mutual-exclusion
// with the intraday combo on the SAME symbol (US500 is already traded by fvg/divergence/silverbullet/weeklysweep) - two independent real
// positions on one instrument, in either direction, must never happen.

function makeAccount() {
  return {
    balance: 10000,
    strategyEngine: { riskPctPerTrade: 0.3, openPositions: new Map() },
    guardrail: new GuardrailEngine({}),
    lastCandleBySymbol: new Map(),
    setBalance() {},
    recordOrderOutcome() {},
    isAutoExecuteActive: () => true,
  };
}
function makeDs({ sendCommand } = {}) {
  const account = makeAccount();
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: ['US500'] });
  ds.symbolIdByName.set('US500', 215);
  ds.symbolNameById.set('215', 'US500');
  ds.connection = { sendCommand: sendCommand || (async () => ({})) };
  ds.accountId = 1;
  ds._notify = () => {};
  ds._specFor = () => ({ ...getDefaultSpec('US500'), lotSize: 100, digits: 2, volumeVerified: true });
  ds.lastSpreadBySymbol.set('US500', 0.25);
  return { ds, account };
}
const entryEvent = (over = {}) => ({ strategy: 'rsi2-daily', symbol: 'US500', event: 'entry', direction: 'bullish', price: 5700, stopPrice: 5670, targetPrice: null, rMultiple: null, barTime: 1000, detail: 'x', ...over });
const exitEvent = (detail, over = {}) => ({ strategy: 'rsi2-daily', symbol: 'US500', event: 'exit', direction: 'bullish', price: 5750, stopPrice: 5670, targetPrice: null, rMultiple: 1.2, barTime: 2000, detail, ...over });

test('entry event: submits a real MARKET buy via the existing _handleAutoExecuteEntry, with the daily engine\'s own stop, no target', async () => {
  const { ds } = makeDs();
  const calls = [];
  ds._handleAutoExecuteEntry = async (symbolName, symbolId, signal) => calls.push({ symbolName, symbolId, signal });
  await ds._executeDailyStrategySignal('US500', entryEvent());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].symbolName, 'US500');
  assert.equal(calls[0].symbolId, 215);
  assert.equal(calls[0].signal.source, 'rsi2-daily');
  assert.equal(calls[0].signal.suggestedSide, 'buy');
  assert.equal(calls[0].signal.entryPrice, 5700);
  assert.equal(calls[0].signal.stopPrice, 5670);
  assert.equal(calls[0].signal.targetPrice, null);
  assert.equal(calls[0].signal.distance, 30);
});

test('entry event: the shared guardrail can block it (same budget as the intraday combo) - no order attempted', async () => {
  const { ds, account } = makeDs();
  account.guardrail.canTakeNewTrade = () => false;
  let called = false;
  ds._handleAutoExecuteEntry = async () => { called = true; };
  await ds._executeDailyStrategySignal('US500', entryEvent());
  assert.equal(called, false);
});

test('exit event, reason "stop": never races the broker\'s own stop order with a proactive close, even if we still think a position is held', async () => {
  const { ds } = makeDs();
  ds.dailyPositionBySymbol.set('US500', { positionId: 777, volumeCents: 30000 });
  const sent = [];
  ds.connection.sendCommand = async (name, data) => { sent.push({ name, data }); return {}; };
  await ds._executeDailyStrategySignal('US500', exitEvent('stop'));
  assert.deepEqual(sent, []);
});

test('exit event, reason "sma5"/"timeout": sends a real ProtoOAClosePositionReq for exactly the tracked position/volume', async () => {
  for (const reason of ['sma5', 'timeout']) {
    const { ds } = makeDs();
    ds.dailyPositionBySymbol.set('US500', { positionId: 555, volumeCents: 30000 });
    const sent = [];
    ds.connection.sendCommand = async (name, data, cb) => { sent.push({ name, data }); if (cb) cb(null, {}); return {}; };
    await ds._executeDailyStrategySignal('US500', exitEvent(reason));
    assert.equal(sent.length, 1, reason);
    assert.equal(sent[0].name, 'ProtoOAClosePositionReq');
    assert.equal(sent[0].data.positionId, 555);
    assert.equal(sent[0].data.volume, 30000);
  }
});

test('exit event: no real position tracked (never filled, or the broker already closed it) - nothing sent', async () => {
  const { ds } = makeDs();
  const sent = [];
  ds.connection.sendCommand = async (name, data) => { sent.push({ name, data }); return {}; };
  await ds._executeDailyStrategySignal('US500', exitEvent('sma5'));
  assert.deepEqual(sent, []);
});

test('mutual exclusion: an intraday signal on US500 is skipped while the daily strategy holds a real position there', async () => {
  const { ds } = makeDs();
  ds.dailyPositionBySymbol.set('US500', { positionId: 1, volumeCents: 100 });
  let submitted = false;
  ds._submitOrder = async () => { submitted = true; return 'x'; };
  await ds._handleAutoExecuteEntry('US500', 215, { id: 'fvg-US500-1', source: 'fvg', suggestedSide: 'buy', entryPrice: 5700, stopPrice: 5670, targetPrice: 5790, distance: 30 });
  assert.equal(submitted, false, 'the intraday order must never be submitted while the daily position is open');
});

test('mutual exclusion: does NOT block the daily strategy\'s own entry against itself', async () => {
  const { ds } = makeDs();
  let submitted = false;
  ds._submitOrder = async () => { submitted = true; return 'x'; };
  ds._findRealOrderOrPositionForLabel = async () => null;
  await ds._handleAutoExecuteEntry('US500', 215, { id: 'rsi2-daily-US500-1', source: 'rsi2-daily', suggestedSide: 'buy', entryPrice: 5700, stopPrice: 5670, targetPrice: null, distance: 30 });
  assert.equal(submitted, true);
});

test('a confirmed real fill of an rsi2-daily order records the position for later signal-based closing', () => {
  const { ds } = makeDs();
  ds.pendingEntryOrderByOrderId.set('999', { symbolName: 'US500', source: 'rsi2-daily', signalId: 'rsi2-daily-US500-1', direction: 'bullish', entryPrice: 5700, riskAmount: 30, stopPrice: 5670, targetPrice: null });
  ds._handleExecutionEvent({ executionType: 'ORDER_FILLED', order: { orderId: '999' }, position: { positionId: 424242 }, deal: { executionPrice: 5700.2, filledVolume: '30000' } });
  assert.deepEqual(ds.dailyPositionBySymbol.get('US500'), { positionId: 424242, volumeCents: 30000 });
});

test('a real close of the tracked rsi2-daily position (however it happened) clears dailyPositionBySymbol', () => {
  const { ds, account } = makeDs();
  ds.dailyPositionBySymbol.set('US500', { positionId: 424242, volumeCents: 30000 });
  ds.openPositionInfoByPositionId.set('424242', { symbolName: 'US500', source: 'rsi2-daily', signalId: 'x', direction: 'bullish', entryPrice: 5700, riskAmount: 30, entryTime: Date.now() - 1000 });
  account.strategyEngine.clearBelievedPosition = () => {};
  ds._handleExecutionEvent({ executionType: 'ORDER_FILLED', deal: { positionId: '424242', symbolId: 215, closePositionDetail: { grossProfit: '120', balance: '1012000', moneyDigits: 2 } } });
  assert.equal(ds.dailyPositionBySymbol.has('US500'), false);
});

test('a close of some OTHER (non-rsi2-daily) position never touches dailyPositionBySymbol', () => {
  const { ds } = makeDs();
  ds.dailyPositionBySymbol.set('US500', { positionId: 424242, volumeCents: 30000 }); // an unrelated daily position, still open
  ds.openPositionInfoByPositionId.set('111', { symbolName: 'US500', source: 'fvg', signalId: 'y', direction: 'bullish', entryPrice: 5700, riskAmount: 30, entryTime: Date.now() - 1000 });
  ds.account.strategyEngine.clearBelievedPosition = () => {};
  ds._handleExecutionEvent({ executionType: 'ORDER_FILLED', deal: { positionId: '111', symbolId: 215, closePositionDetail: { grossProfit: '10', balance: '1001000', moneyDigits: 2 } } });
  assert.deepEqual(ds.dailyPositionBySymbol.get('US500'), { positionId: 424242, volumeCents: 30000 });
});
