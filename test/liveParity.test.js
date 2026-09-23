import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCandlesFromCsv } from '../src/backtest/csvLoader.js';
import { replaySignals, compareSignals } from '../src/backtest/liveParity.js';
import { CONFIG } from '../src/config.js';

const FIXTURE = new URL('./fixtures/us500-m15-2026-08-24_to_2026-09-21.csv', import.meta.url).pathname;
const T = (iso) => Date.parse(iso);

test('the replay finds the US500 Weekly Sweep of 2026-09-21 00:15 UTC on complete candles (clean signal)', () => {
  const candles = { US500: loadCandlesFromCsv(FIXTURE).candles };
  // Weekly Sweep US500 was live on 2026-09-21 (turned off 2026-09-23): replay with the config of that day.
  const config = { ...CONFIG, weeklySweep: { ...CONFIG.weeklySweep, symbols: ['US500'] } };
  const sigs = replaySignals(candles, { fromMs: T('2026-09-21T00:00:00Z'), toMs: T('2026-09-21T01:00:00Z'), config });
  const ws = sigs.find((s) => s.source === 'weeklysweep');
  assert.ok(ws);
  assert.equal(ws.timeMs, T('2026-09-21T00:15:00Z'));
  assert.equal(ws.side, 'sell');
  assert.equal(ws.symbol, 'US500');
});

const R = (o) => ({ timeMs: T('2026-09-18T14:45:00Z'), symbol: 'US100', source: 'silverbullet', side: 'sell', entry: 1, stop: 2, blocked: null, ...o });
const L = (o) => ({ timeMs: T('2026-09-18T14:45:01Z'), symbol: 'US100', source: 'silverbullet', side: 'sell', ...o });

test('compareSignals: a live signal within the tolerance matches; each live event is used once', () => {
  const r = compareSignals([R(), R({ timeMs: T('2026-09-18T15:00:00Z') })], [L()]);
  assert.equal(r.matched.length, 1);
  assert.equal(r.missingInLive.length, 1);
  assert.equal(r.missingInLive[0].timeMs, T('2026-09-18T15:00:00Z'));
  assert.equal(r.extraInLive.length, 0);
});

test('compareSignals: another pair, mechanism, side or time is NOT a match', () => {
  for (const other of [{ symbol: 'US500' }, { source: 'fvg' }, { side: 'buy' }, { timeMs: T('2026-09-18T14:50:00Z') }]) {
    const r = compareSignals([R()], [L(other)]);
    assert.equal(r.matched.length, 0, JSON.stringify(other));
    assert.equal(r.missingInLive.length, 1);
    assert.equal(r.extraInLive.length, 1);
  }
});

test('compareSignals: a signal blocked in the replay is not "missing", and a live one that the replay blocked says why', () => {
  const r = compareSignals([R({ blocked: 'netting' })], [L()]);
  assert.equal(r.missingInLive.length, 0);
  assert.equal(r.blockedInReplay.length, 1);
  assert.equal(r.extraInLive.length, 1);
  assert.equal(r.extraInLive[0].replayBlockedReason, 'netting');
});

test('compareSignals: nothing on either side is an empty, valid report', () => {
  const r = compareSignals([], []);
  assert.deepEqual([r.matched.length, r.missingInLive.length, r.extraInLive.length], [0, 0, 0]);
});
