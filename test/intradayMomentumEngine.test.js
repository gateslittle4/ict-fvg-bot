import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { IntradayMomentumEngine, TickBarBuilder, ORB_STRATEGY, NOISE_STRATEGY, nySessionPosition } from '../src/intradayMomentumEngine.js';
import { buildSessions, orbSetup, noiseTrades, MIN } from '../src/backtest/intradayMomentum.js';

// M1 réel du broker entre deux dates (ms UTC), en barres {time, open, high, low, close}.
function loadBars(symbol, from, to) {
  const txt = zlib.gunzipSync(fs.readFileSync(`data/real-m1-full/${symbol}.csv.gz`)).toString('utf8');
  const out = [];
  let pos = txt.indexOf('\n') + 1;
  while (pos < txt.length) {
    let end = txt.indexOf('\n', pos); if (end < 0) end = txt.length;
    const comma = txt.indexOf(',', pos);
    const t = Number(txt.slice(pos, comma));
    if (t >= to) break;
    if (t >= from) { const p = txt.slice(pos, end).split(','); out.push({ time: t, open: +p[1], high: +p[2], low: +p[3], close: +p[4] }); }
    pos = end + 1;
  }
  return out;
}
const toS = (bars) => ({ t: bars.map((b) => b.time), o: bars.map((b) => b.open), h: bars.map((b) => b.high), l: bars.map((b) => b.low), c: bars.map((b) => b.close), n: bars.length });
const noSpread = () => 0;

test('TickBarBuilder: a minute bar is released on the first tick of the next minute (or by flush), with bid OHLC', () => {
  const b = new TickBarBuilder();
  const t0 = Date.UTC(2026, 8, 24, 13, 30);
  assert.deepEqual(b.onTick('US100', t0 + 1000, 100), []);
  b.onTick('US100', t0 + 20000, 102); b.onTick('US100', t0 + 40000, 99); b.onTick('US100', t0 + 59000, 101);
  const out = b.onTick('US100', t0 + MIN + 500, 103);
  assert.deepEqual(out, [{ symbol: 'US100', bar: { time: t0, open: 100, high: 102, low: 99, close: 101 } }]);
  assert.deepEqual(b.flush(t0 + MIN + 30000), []);
  assert.deepEqual(b.flush(t0 + 2 * MIN), [{ symbol: 'US100', bar: { time: t0 + MIN, open: 103, high: 103, low: 103, close: 103 } }]);
});

test('nySessionPosition: 9:30 New York is minute 0 in winter and in summer (US daylight saving)', () => {
  assert.equal(nySessionPosition(Date.UTC(2026, 0, 12, 14, 30)).k, 0);
  assert.equal(nySessionPosition(Date.UTC(2026, 6, 13, 13, 30)).k, 0);
  assert.equal(nySessionPosition(Date.UTC(2026, 6, 13, 19, 59)).k, 389);
});

test('IntradayMomentumEngine A: synthetic up-opening - buy at the end of 9:34, stop at the 5-minute low, exit at 15:59', () => {
  const eng = new IntradayMomentumEngine({ orbSymbols: ['US100'], noiseSymbols: [] });
  const base = Date.UTC(2026, 0, 12, 14, 30); // 9:30 NY
  const events = [];
  for (let k = 0; k < 390; k++) {
    const p = 100 + Math.min(k, 4);
    events.push(...eng.ingestBar('US100', { time: base + k * MIN, open: p, high: p + 0.5, low: p - 0.5, close: p + 0.2 }));
  }
  const entry = events.find((e) => e.type === 'entry');
  assert.equal(entry.strategy, ORB_STRATEGY);
  assert.equal(entry.side, 'buy');
  assert.equal(entry.stopPrice, 99.5);
  assert.equal(entry.time, base + 4 * MIN);
  const exit = events.find((e) => e.type === 'exit');
  assert.equal(exit.reason, 'close');
  assert.equal(exit.time, base + 389 * MIN);
  assert.equal(events.length, 2);
});

test('IntradayMomentumEngine onClock: a virtual position still open after 16:00 NY is closed without any new bar', () => {
  const eng = new IntradayMomentumEngine({ orbSymbols: ['US100'], noiseSymbols: [] });
  const base = Date.UTC(2026, 0, 12, 14, 30);
  for (let k = 0; k < 10; k++) eng.ingestBar('US100', { time: base + k * MIN, open: 100 + k, high: 101 + k, low: 99 + k, close: 100.5 + k });
  assert.deepEqual(eng.onClock(base + 200 * MIN), []);
  const out = eng.onClock(base + 391 * MIN);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'exit');
  assert.deepEqual(eng.onClock(base + 392 * MIN), []);
});

test('IntradayMomentumEngine: fed minute by minute on REAL broker M1, A and B take exactly the study decisions (2024 H1)', () => {
  const from = Date.UTC(2024, 0, 2), warmEnd = Date.UTC(2024, 1, 1), to = Date.UTC(2024, 6, 1);
  for (const [symbol, strat] of [['US100', 'orb'], ['US500', 'noise']]) {
    const bars = loadBars(symbol, from, to);
    const eng = new IntradayMomentumEngine({ orbSymbols: strat === 'orb' ? [symbol] : [], noiseSymbols: strat === 'noise' ? [symbol] : [] });
    eng.addBars(symbol, bars.filter((b) => b.time < warmEnd));
    const events = [];
    for (const b of bars) if (b.time >= warmEnd) events.push(...eng.ingestBar(symbol, b));
    const days = buildSessions(toS(bars));
    const first = days.findIndex((d) => d.dayNum * 86400000 >= warmEnd);
    // A decision on the LAST bar of a session (early close, e.g. Memorial Day 2024-05-27) has no next quote to execute on: the study skips
    // it (no bar after the check), live the order would simply find the market closed - excluded from the comparison.
    const lastBar = new Set(buildSessions(toS(bars)).map((d) => d.t[d.t.length - 1]));
    const expected = [], got = events.filter((e) => e.type === 'entry' && !lastBar.has(e.time)).map((e) => `${new Date(e.time).toISOString().slice(0, 10)} ${e.side}${e.stopPrice != null ? ' ' + e.stopPrice : ''}`);
    for (let i = first; i < days.length; i++) {
      if (strat === 'orb') { const s = orbSetup(days[i]); if (s) expected.push(`${days[i].date} ${s.long ? 'buy' : 'sell'} ${s.long ? s.lo : s.hi}`); }
      else for (const t of noiseTrades(days, i, noSpread)) expected.push(`${days[i].date} ${t.dir}`);
    }
    assert.ok(expected.length > 50, `${symbol}: too few expected decisions (${expected.length})`);
    assert.deepEqual(got, expected, `${symbol} ${strat}: live decisions differ from the study`);
    if (strat === 'noise') {
      const expExits = days.slice(first).reduce((a, d, j) => a + noiseTrades(days, first + j, noSpread).length, 0);
      const lastBarEntries = events.filter((e) => e.type === 'entry' && lastBar.has(e.time)).length;
      assert.equal(events.filter((e) => e.type === 'exit').length, expExits + lastBarEntries, 'every B position is exited once (signal or 15:59)');
    }
  }
});
