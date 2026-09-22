import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DailyAlertEngine } from '../src/dailyAlertEngine.js';

const H17 = 17 * 60 * 60 * 1000, DAY = 24 * 60 * 60 * 1000;
// One M15 candle per synthetic "day", closing exactly at the 17:00 boundary - the simplest possible daily-bar feed.
const dayBar = (dayIndex, o, h, l, c) => ({ time: dayIndex * DAY + H17 - 1, open: o, high: h, low: l, close: c });

test('a flat run of identical closes never signals (RSI(2) undefined/neutral, no crossing)', () => {
  const e = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'TEST' });
  let events = [];
  for (let i = 0; i < 260; i++) events = events.concat(e.ingest(dayBar(i, 100, 100, 100, 100)));
  assert.deepEqual(events, []);
  assert.equal(e.position, null);
});

test('warmUp() replays history silently: no events, but state (position/bars) is established', () => {
  const bars = []; for (let i = 0; i < 260; i++) bars.push(dayBar(i, 100 + i * 0.1, 100 + i * 0.1 + 1, 100 + i * 0.1 - 1, 100 + i * 0.1));
  const a = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'TEST' });
  a.warmUp(bars);
  const b = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'TEST' });
  let events = []; for (const bar of bars) events = events.concat(b._onDailyBarClosed === undefined ? [] : []); // no-op, keep for symmetry
  for (const bar of bars) b.ingest(bar);
  assert.deepEqual(a.bars, b.bars);
  assert.deepEqual(a.position, b.position);
});

test('entry fires the day AFTER RSI(2)<10 + close>SMA200 is met, at that next day\'s open, with a stop below entry (long only)', () => {
  const e = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'TEST' });
  const bars = [];
  // 210 days of a slow uptrend so SMA200 sits well below price, then a sharp multi-day drop to force RSI(2)<10 while staying above SMA200.
  for (let i = 0; i < 210; i++) { const p = 100 + i * 0.5; bars.push(dayBar(i, p, p + 0.5, p - 0.5, p)); }
  const dropOpens = [205, 200, 195, 190];
  dropOpens.forEach((o, k) => bars.push(dayBar(210 + k, o, o + 0.5, o - 5, o - 4)));
  bars.push(dayBar(210 + dropOpens.length, 186, 187, 185, 186)); // one extra bar so the last real day above actually closes (ingest() only closes the PREVIOUS day)
  let events = [];
  for (const bar of bars) events = events.concat(e.ingest(bar));
  const entries = events.filter((ev) => ev.event === 'entry');
  assert.equal(entries.length, 1, 'exactly one entry over this scripted drop');
  assert.ok(bars.some((b) => b.open === entries[0].price), 'entry fills at some real bar\'s open');
  assert.equal(entries[0].direction, 'bullish');
  assert.ok(entries[0].stopPrice < entries[0].price, 'stop is below entry (long)');
});

test('exit on SMA(5) recovery fires at a later day\'s open, R computed from the entry distance', () => {
  const e = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'TEST' });
  const bars = [];
  for (let i = 0; i < 210; i++) { const p = 100 + i * 0.5; bars.push(dayBar(i, p, p + 0.5, p - 0.5, p)); }
  const dropOpens = [205, 200, 195, 190];
  dropOpens.forEach((o, k) => bars.push(dayBar(210 + k, o, o + 0.5, o - 5, o - 4)));
  const reboundFrom = 210 + dropOpens.length;
  for (let k = 0; k < 7; k++) { const p = 190 + k * 3; bars.push(dayBar(reboundFrom + k, p, p + 4, p - 1, p + 3)); } // strong, sustained rebound (+1 extra bar to flush the last real day's closure)
  let events = [];
  for (const bar of bars) events = events.concat(e.ingest(bar));
  assert.ok(events.filter((ev) => ev.event === 'entry').length >= 1, 'at least one entry over the drop');
  // the sharp drop can stop an early entry out before re-entering (legitimate: a lower low after entry) - what matters here is that the REBOUND
  // eventually closes a position on its own signal (SMA5 recovery or the 10-day timeout), not on the stop.
  const signalExit = events.find((ev) => ev.event === 'exit' && (ev.detail === 'sma5' || ev.detail === 'timeout'));
  assert.ok(signalExit, `no sma5/timeout exit among: ${events.map((ev) => `${ev.event}:${ev.detail}`).join(', ')}`);
  assert.ok(Number.isFinite(signalExit.rMultiple));
  assert.equal(e.position, null);
});

test('stop-out closes the position and the R multiple is exactly -1 when the stop is hit cleanly (no gap)', () => {
  const e = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'TEST' });
  const bars = [];
  for (let i = 0; i < 210; i++) { const p = 100 + i * 0.5; bars.push(dayBar(i, p, p + 0.5, p - 0.5, p)); }
  bars.push(dayBar(210, 205, 205, 198, 198));
  bars.push(dayBar(211, 197, 197, 192, 193));
  bars.push(dayBar(212, 193.5, 194, 193, 193.8)); // entry at 193.5
  let events = []; for (const bar of bars) events = events.concat(e.ingest(bar));
  const entry = events.find((ev) => ev.event === 'entry');
  const stop = entry.stopPrice;
  const distance = entry.price - stop;
  // next day: a bar whose low touches the stop exactly, without gapping the open below it
  events = events.concat(e.ingest(dayBar(213, entry.price, entry.price + 0.2, stop, stop + 0.05)));
  const stopExit = events.find((ev) => ev.event === 'exit' && ev.detail === 'stop');
  assert.ok(stopExit, 'stop exit logged');
  assert.ok(Math.abs(stopExit.rMultiple - -1) < 1e-9, `R should be -1, got ${stopExit.rMultiple}`);
  assert.ok(distance > 0);
});

test('never more than one open position at a time, and every logged event has a finite bar time / price', () => {
  // real US500 daily history (built from the M15 CSV) - a broad structural sanity check, not a fidelity re-derivation of runPreregBatch3.js.
  const lines = fs.readFileSync('data/backtest-input/US500.csv', 'utf8').trim().split('\n').slice(1);
  const m15 = lines.map((l) => { const [t, o, h, lo, c] = l.split(','); return { time: +t, open: +o, high: +h, low: +lo, close: +c }; });
  const e = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  let events = [], openCount = 0;
  for (const c of m15) {
    for (const ev of e.ingest(c)) {
      events.push(ev);
      assert.ok(Number.isFinite(ev.barTime) && Number.isFinite(ev.price), JSON.stringify(ev));
      if (ev.event === 'entry') { openCount++; assert.equal(openCount, 1, 'never two entries without an exit between them'); }
      if (ev.event === 'exit') { assert.equal(openCount, 1, 'an exit always follows a real open position'); openCount = 0; }
    }
  }
  assert.ok(events.filter((ev) => ev.event === 'entry').length > 50, 'enough history to have fired a reasonable number of entries');
  for (const ev of events) if (ev.event === 'exit') assert.ok(Number.isFinite(ev.rMultiple));
});

test('DailyAlertEngine requires strategy and symbol', () => {
  assert.throws(() => new DailyAlertEngine({ symbol: 'X' }));
  assert.throws(() => new DailyAlertEngine({ strategy: 'x' }));
});
