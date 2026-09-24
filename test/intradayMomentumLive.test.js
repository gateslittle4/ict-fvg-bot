import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { getDefaultSpec } from '../src/engines/lotCalculator.js';

// 2026-09-24: A (orb5, US100) and B (noise, US500) on the SAME account as the combo - the real-order wiring: sizing/protection sent to
// _handleAutoExecuteEntry, the shared guardrail, mutual exclusion both ways with the combo and RSI(2), exits closing only their own position,
// B's reversal waiting for its close, and managed positions never "adopted" into the combo engine by the 5-minute sweep.

function makeDs() {
  const account = {
    balance: 10000,
    strategyEngine: { riskPctPerTrade: 0.3, openPositions: new Map(), getOpenPosition: () => null, clearBelievedPosition() {}, adoptExternalPosition: () => null },
    guardrail: new GuardrailEngine({}),
    lastCandleBySymbol: new Map([['US100', { close: 20000 }], ['US500', { close: 5000 }]]),
    setBalance() {}, recordOrderOutcome() {}, isAutoExecuteActive: () => true,
  };
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: ['US100', 'US500'] });
  ds.symbolIdByName.set('US100', 101); ds.symbolIdByName.set('US500', 215);
  ds.symbolNameById.set('101', 'US100'); ds.symbolNameById.set('215', 'US500');
  ds.connection = { sendCommand: async () => ({}) };
  ds.accountId = 1;
  ds._notify = () => {};
  ds._specFor = (s) => ({ ...getDefaultSpec(s), lotSize: 100, digits: 2, volumeVerified: true });
  ds.lastSpreadBySymbol.set('US100', 0.6); ds.lastSpreadBySymbol.set('US500', 0.25);
  return { ds, account };
}
const orbEntry = (over = {}) => ({ type: 'entry', strategy: 'orb5', symbol: 'US100', side: 'buy', stopPrice: 19970, rangeHigh: 20010, rangeLow: 19970, time: 1, ...over });
const noiseEntry = (over = {}) => ({ type: 'entry', strategy: 'noise', symbol: 'US500', side: 'sell', vol14: 0.01, check: 29, time: 2, ...over });

test('A entry: stop at the 5-minute extreme, target 10R from the real fill (ask), exposure capped at 4x the balance', async () => {
  const { ds } = makeDs();
  const calls = [];
  ds._handleAutoExecuteEntry = async (sym, id, signal) => calls.push({ sym, id, signal });
  await ds._executeMomentumEvent(orbEntry());
  assert.equal(calls.length, 1);
  const s = calls[0].signal;
  assert.equal(calls[0].sym, 'US100'); assert.equal(calls[0].id, 101);
  assert.equal(s.source, 'orb5'); assert.equal(s.suggestedSide, 'buy');
  assert.equal(s.entryPrice, 20000); assert.equal(s.stopPrice, 19970);
  const fill = 20000.6, R = fill - 19970;
  assert.ok(Math.abs(s.targetPrice - (fill + 10 * R)) < 1e-9);
  assert.equal(s.maxLots, 4 * 10000 / 20000);
});

test('A entry: skipped when the stop is tighter than 3 spreads', async () => {
  const { ds } = makeDs();
  let called = false;
  ds._handleAutoExecuteEntry = async () => { called = true; };
  await ds._executeMomentumEvent(orbEntry({ stopPrice: 19999.5 }));
  assert.equal(called, false);
});

test('B entry: sized on one daily sigma, emergency broker stop at 3 sigma, no target', async () => {
  const { ds } = makeDs();
  const calls = [];
  ds._handleAutoExecuteEntry = async (sym, id, signal) => calls.push(signal);
  await ds._executeMomentumEvent(noiseEntry());
  const s = calls[0];
  assert.equal(s.source, 'noise'); assert.equal(s.suggestedSide, 'sell');
  assert.equal(s.sizingStopPrice, 5000 + 50); assert.equal(s.stopPrice, 5000 + 150); assert.equal(s.targetPrice, null);
});

test('entries are skipped when the combo holds the symbol, when the guardrail blocks, or when auto-execute is off', async () => {
  for (const setup of [
    ({ account }) => { account.strategyEngine.getOpenPosition = () => ({ id: 'x' }); },
    ({ account }) => { account.guardrail.canTakeNewTrade = () => false; },
    ({ account }) => { account.isAutoExecuteActive = () => false; },
  ]) {
    const env = makeDs(); setup(env);
    let called = false;
    env.ds._handleAutoExecuteEntry = async () => { called = true; };
    await env.ds._executeMomentumEvent(orbEntry());
    assert.equal(called, false);
  }
});

test('mutual exclusion both ways: a combo signal is skipped while A holds US100; RSI(2) cannot enter US500 while B holds it', async () => {
  const { ds } = makeDs();
  let submitted = 0;
  ds._submitOrder = async () => { submitted++; return 'x'; };
  ds._findRealOrderOrPositionForLabel = async () => null;
  ds.dailyPositionBySymbol.set('US100', { positionId: 1, volumeCents: 100, source: 'orb5' });
  await ds._handleAutoExecuteEntry('US100', 101, { id: 'silverbullet-US100-1', source: 'silverbullet', suggestedSide: 'buy', entryPrice: 20000, stopPrice: 19980, targetPrice: 20060, distance: 20 });
  ds.dailyPositionBySymbol.set('US500', { positionId: 2, volumeCents: 100, source: 'noise' });
  await ds._handleAutoExecuteEntry('US500', 215, { id: 'rsi2-daily-US500-1', source: 'rsi2-daily', suggestedSide: 'buy', entryPrice: 5000, stopPrice: 4970, targetPrice: null, distance: 30 });
  assert.equal(submitted, 0);
});

test('exit: closes exactly its own position; an RSI(2) exit never closes a B position on the same symbol', async () => {
  const { ds } = makeDs();
  const sent = [];
  ds.connection.sendCommand = async (name, data, cb) => { sent.push({ name, data }); if (cb) cb(null, {}); return {}; };
  ds.dailyPositionBySymbol.set('US500', { positionId: 55, volumeCents: 3000, source: 'noise' });
  await ds._executeDailyStrategySignal('US500', { strategy: 'rsi2-daily', symbol: 'US500', event: 'exit', direction: 'bullish', price: 5000, detail: 'sma5' });
  assert.deepEqual(sent, []);
  await ds._executeMomentumEvent({ type: 'exit', strategy: 'orb5', symbol: 'US500', side: 'buy', reason: 'close' });
  assert.deepEqual(sent, []);
  await ds._executeMomentumEvent({ type: 'exit', strategy: 'noise', symbol: 'US500', side: 'sell', reason: 'noise' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'ProtoOAClosePositionReq');
  assert.equal(sent[0].data.positionId, 55); assert.equal(sent[0].data.volume, 3000);
});

test('B reversal: the new entry waits for its own close to be confirmed, then is sent', async () => {
  const { ds } = makeDs();
  ds.connection.sendCommand = async (name, data, cb) => { if (cb) cb(null, {}); return {}; };
  ds.dailyPositionBySymbol.set('US500', { positionId: 77, volumeCents: 3000, source: 'noise' });
  ds.openPositionInfoByPositionId.set('77', { symbolName: 'US500', source: 'noise', signalId: 's', direction: 'bearish', entryPrice: 5000, riskAmount: 30, entryTime: Date.now() - 1000 });
  const entries = [];
  ds._handleAutoExecuteEntry = async (sym, id, signal) => entries.push(signal);
  await ds._executeMomentumEvent({ type: 'exit', strategy: 'noise', symbol: 'US500', side: 'sell', reason: 'noise' });
  await ds._executeMomentumEvent(noiseEntry({ side: 'buy' }));
  assert.equal(entries.length, 0, 'not sent while the old position is still open');
  // a winning close (a losing one starts the guardrail's 30-min pause on the symbol, which then blocks the re-entry - as in the FTMO simulation)
  ds._handleExecutionEvent({ executionType: 'ORDER_FILLED', deal: { positionId: '77', symbolId: 215, closePositionDetail: { grossProfit: '10', balance: '1001000', moneyDigits: 2 } } });
  await new Promise((r) => setImmediate(r));
  assert.equal(ds.dailyPositionBySymbol.has('US500'), false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].suggestedSide, 'buy');
});

test('a confirmed fill of an A order is tracked with its source', () => {
  const { ds } = makeDs();
  ds.pendingEntryOrderByOrderId.set('9', { symbolName: 'US100', source: 'orb5', signalId: 'orb5-US100-1', direction: 'bullish', entryPrice: 20000, riskAmount: 30, stopPrice: 19970, targetPrice: 20300 });
  ds._handleExecutionEvent({ executionType: 'ORDER_FILLED', order: { orderId: '9' }, position: { positionId: 4242 }, deal: { executionPrice: 20000.6, filledVolume: '150' } });
  assert.deepEqual((({ at, ...rest }) => rest)(ds.dailyPositionBySymbol.get('US100')), { positionId: 4242, volumeCents: 150, source: 'orb5' });
  assert.ok(ds.dailyPositionBySymbol.get('US100').at > 0, 'tracking time recorded');
});

test('the 5-minute sweep never adopts a managed (RSI(2)/A/B) real position into the combo engine', async () => {
  const { ds, account } = makeDs();
  ds.dailyPositionBySymbol.set('US500', { positionId: 88, volumeCents: 3000, source: 'noise' });
  const adopted = [];
  account.strategyEngine.adoptExternalPosition = (sym, real) => { adopted.push({ sym, real }); return { id: 'a' }; };
  ds.connection.sendCommand = async (name, data, cb) => {
    const res = name === 'ProtoOAReconcileReq'
      ? { position: [{ positionId: 88, positionStatus: 'POSITION_STATUS_OPEN', tradeData: { symbolId: 215, volume: 3000, tradeSide: 'SELL', openTimestamp: 1 }, price: 5000 }], order: [] }
      : {};
    if (cb) cb(null, res);
    return res;
  };
  await ds._clearStaleBeliefsAgainstBroker(1);
  assert.deepEqual(adopted, []);
});

test('strategy switches: a disabled strategy takes no new entry, but still closes its open position', async () => {
  const sw = await import('../src/strategySwitches.js');
  sw.resetStrategySwitchesForTests();
  const saved = [];
  const fakeClient = { from: () => ({ upsert: async (row) => { saved.push(row); return { error: null }; } }) };
  const res = await sw.setStrategySwitches(fakeClient, { orb5: false, bogus: true });
  assert.equal(res.ok, true); assert.equal(res.persisted, true);
  assert.deepEqual(res.switches, { orb5: false, noise: true });
  assert.equal(saved[0].key, 'strategy_switches');
  const { ds } = makeDs();
  let called = false;
  ds._handleAutoExecuteEntry = async () => { called = true; };
  await ds._executeMomentumEvent(orbEntry());
  assert.equal(called, false, 'A disabled: no entry');
  const sent = [];
  ds.connection.sendCommand = async (name, data, cb) => { sent.push(name); if (cb) cb(null, {}); return {}; };
  ds.dailyPositionBySymbol.set('US100', { positionId: 9, volumeCents: 100, source: 'orb5' });
  await ds._executeMomentumEvent({ type: 'exit', strategy: 'orb5', symbol: 'US100', side: 'buy', reason: 'close' });
  assert.deepEqual(sent, ['ProtoOAClosePositionReq'], 'A disabled: its open position is still closed at 15:59');
  const bad = await sw.setStrategySwitches(null, { orb5: 'no' });
  assert.equal(bad.ok, false);
  sw.resetStrategySwitchesForTests();
});

test('strategy switches: loaded from bot_settings at boot', async () => {
  const sw = await import('../src/strategySwitches.js');
  sw.resetStrategySwitchesForTests();
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { orb5: true, noise: false } }, error: null }) }) }) }) };
  assert.deepEqual(await sw.loadStrategySwitches(client), { orb5: true, noise: false });
  assert.equal(sw.isStrategyEnabled('noise'), false);
  sw.resetStrategySwitchesForTests();
});

test('2026-09-24: after a restart, the 5-min sweep restores a labelled A position (not adopted by the combo) so its 15:59 close is really sent', async () => {
  const { ds } = makeDs();
  const sent = [];
  ds.connection = { sendCommand: async (name, payload) => {
    sent.push({ name, payload });
    if (name === 'ProtoOAReconcileReq') return { position: [{ positionId: 777, positionStatus: 'POSITION_STATUS_OPEN', price: 20000, stopLoss: 19950, takeProfit: 20500, tradeData: { symbolId: 101, volume: 70, tradeSide: 'BUY', label: 'auto-orb5-US100', openTimestamp: 1 } }], order: [] };
    return {};
  } };
  let adopted = 0;
  ds.account.strategyEngine.adoptExternalPosition = () => { adopted++; return null; };
  assert.equal(ds.dailyPositionBySymbol.size, 0, 'fresh process: nothing tracked');
  await ds._clearStaleBeliefsAgainstBroker(1);
  const held = ds.dailyPositionBySymbol.get('US100');
  assert.equal(held.positionId, 777); assert.equal(held.volumeCents, 70); assert.equal(held.source, 'orb5');
  assert.equal(adopted, 0, 'never adopted into the combo engine');
  await ds._executeMomentumEvent({ type: 'exit', strategy: 'orb5', symbol: 'US100', side: 'buy', reason: 'close', time: 2 });
  const close = sent.find((c) => c.name === 'ProtoOAClosePositionReq');
  assert.ok(close, 'the 15:59 close is sent');
  assert.equal(close.payload.positionId, 777); assert.equal(close.payload.volume, 70);
});

test('2026-09-24: a tracked managed position that no longer exists at the broker (missed close confirmation) stops blocking the symbol', async () => {
  const { ds } = makeDs();
  ds.connection = { sendCommand: async (name) => (name === 'ProtoOAReconcileReq' ? { position: [], order: [] } : {}) };
  ds.dailyPositionBySymbol.set('US100', { positionId: 5, volumeCents: 70, source: 'orb5', at: Date.now() - 10 * 60000 });
  ds.dailyPositionBySymbol.set('US500', { positionId: 6, volumeCents: 70, source: 'noise', at: Date.now() - 1000 }); // just filled: kept
  await ds._clearStaleBeliefsAgainstBroker(1);
  assert.equal(ds.dailyPositionBySymbol.has('US100'), false);
  assert.equal(ds.dailyPositionBySymbol.has('US500'), true);
});
