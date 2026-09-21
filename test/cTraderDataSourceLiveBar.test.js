import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';

// 2026-09-21 fix: the first tick of a NEW bar first refreshes the previous bars from the broker, THEN evaluates signals.
// (The engine-side behaviour is covered by liveIngestion.test.js; this locks in the data source's sequencing.)
const trendbar = (minutes, low, open, high, close) => ({ utcTimestampInMinutes: minutes, low: low * 100000, deltaOpen: (open - low) * 100000, deltaHigh: (high - low) * 100000, deltaClose: (close - low) * 100000 });

function setup({ sendCommand, events = [], autoActive = true } = {}) {
  const calls = [];
  const engine = {
    isNewBarCalls: 0,
    newBar: true,
    isNewBar() { this.isNewBarCalls++; return this.newBar; },
    reconcileRecentCandles(symbol, finals, opts) { calls.push({ what: 'reconcile', finals, opts }); return []; },
    ingestCandle(symbol, candle) { calls.push({ what: 'ingest', candle }); this.newBar = false; return events; },
  };
  const account = {
    strategyEngine: engine,
    lastCandleBySymbol: new Map(),
    pushSignalEvents() {},
    isAutoExecuteActive: () => autoActive,
  };
  const connection = { sendCommand: sendCommand || (async (name) => { calls.push({ what: 'broker', name }); return { trendbar: [trendbar(27000000, 7600, 7601, 7610, 7605)] }; }) };
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: [] });
  ds.connection = connection; ds.accountId = 1;
  ds._notify = () => {};
  const executed = [];
  ds._handleAutoExecuteEntry = (sym, id, sig) => { executed.push(sig.id); };
  return { ds, calls, executed, engine };
}
const candle = { time: 1000, open: 1, high: 1, low: 1, close: 1 };

test('a new bar: the broker is asked for the previous bars, they are reconciled (newest included), and only then is the new bar ingested', async () => {
  const { ds, calls } = setup();
  await ds._ingestNewLiveBar('US500', 215, candle, candle);
  assert.deepEqual(calls.map((c) => c.what), ['broker', 'reconcile', 'ingest']);
  assert.deepEqual(calls[1].opts, { includeNewest: true });
  assert.equal(calls[1].finals.length, 1);
});

test('if the broker refresh fails, the new bar is STILL ingested (a refresh problem must never cost an entry)', async () => {
  const { ds, calls } = setup({ sendCommand: async () => { throw new Error('timeout'); } });
  await ds._ingestNewLiveBar('US500', 215, candle, candle);
  assert.deepEqual(calls.map((c) => c.what), ['ingest']);
});

test('a duplicate first tick of the same bar while the refresh runs is dropped: one ingestion only', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { ds, calls } = setup({ sendCommand: async () => { await gate; return { trendbar: [] }; } });
  const first = ds._ingestNewLiveBar('US500', 215, candle, candle);
  const second = ds._ingestNewLiveBar('US500', 215, candle, candle);
  release();
  await Promise.all([first, second]);
  assert.equal(calls.filter((c) => c.what === 'ingest').length, 1);
});

test('an actionable signal reaches auto-execute; a blocked one does not; auto-execute off means alert only', async () => {
  const sigs = [{ type: 'validated', id: 'ok', source: 'weeklysweep' }, { type: 'validated', id: 'blocked', source: 'fvg', blockedReason: 'netting' }];
  const on = setup({ events: sigs });
  await on.ds._ingestNewLiveBar('US500', 215, candle, candle);
  assert.deepEqual(on.executed, ['ok']);
  const off = setup({ events: sigs, autoActive: false });
  await off.ds._ingestNewLiveBar('US500', 215, candle, candle);
  assert.deepEqual(off.executed, []);
});

test('the bar-check statistics count real corrections (evidence of how far tick-tracked bars drift from the broker finals)', async () => {
  const { ds, engine } = setup();
  engine.reconcileRecentCandles = () => [{ time: 0, dOpen: 0, dHigh: 0.5, dLow: 0, dClose: 0.25 }];
  await ds._reconcileRecentBars('US500', 215);
  await ds._reconcileRecentBars('US500', 215);
  assert.deepEqual(ds._reconcileStats, { checks: 2, mismatches: 2 });
});
