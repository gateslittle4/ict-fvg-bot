import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRecentPerformanceReport } from '../src/backtest/recentPerformanceReport.js';

function loadCsv(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split('\n').slice(1);
  return lines.map((line) => {
    const [time, open, high, low, close] = line.split(',');
    return { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
  });
}

test('empty history for every symbol produces an empty, well-shaped report', async () => {
  const report = await buildRecentPerformanceReport({ US100: [], US500: [], XAUUSD: [] }, { days: 90 });
  assert.deepEqual(report.trades, []);
  assert.deepEqual(report.summary, {
    windowDays: 90,
    count: 0,
    wins: 0,
    losses: 0,
    timeouts: 0,
    winRatePct: null,
    totalR: 0,
  });
});

test('missing symbols in the input are treated as empty, not a crash', async () => {
  const report = await buildRecentPerformanceReport({}, { days: 90 });
  assert.equal(report.trades.length, 0);
});

test('against real historical data: every trade resolves to a valid outcome and the summary arithmetic is internally consistent', async () => {
  // 1800 candles (~19 days of M15) is enough to exercise real FVG/Divergence
  // detection without paying too much of the O(n^2) rebuild-and-replay cost
  // this engine has (see HANDOFF.md) - keep this small so the suite stays fast.
  const US100 = loadCsv('data/backtest-input/US100.csv').slice(0, 1800);
  const US500 = loadCsv('data/backtest-input/US500.csv').slice(0, 1800);
  const XAUUSD = loadCsv('data/backtest-input/XAUUSD.csv').slice(0, 1800);

  const report = await buildRecentPerformanceReport({ US100, US500, XAUUSD }, { days: 90 });

  for (const t of report.trades) {
    assert.ok(['win', 'loss', 'timeout'].includes(t.outcome));
    assert.ok(['fvg', 'divergence'].includes(t.source));
    assert.ok(t.exitTime > t.entryTime);
    if (t.outcome === 'win') assert.ok(t.rMultiple > 0);
    if (t.outcome === 'loss') assert.equal(t.rMultiple, -1);
    if (t.outcome === 'timeout') assert.equal(t.rMultiple, null);
  }

  const { summary } = report;
  assert.equal(summary.count, report.trades.length);
  assert.equal(summary.wins + summary.losses + summary.timeouts, summary.count);
  const expectedTotalR = Math.round(report.trades.reduce((s, t) => s + (t.rMultiple || 0), 0) * 100) / 100;
  assert.equal(summary.totalR, expectedTotalR);
  if (summary.wins + summary.losses > 0) {
    assert.equal(summary.winRatePct, (summary.wins / (summary.wins + summary.losses)) * 100);
  } else {
    assert.equal(summary.winRatePct, null);
  }
});

test('a position already open before the report window started is excluded rather than guessed', async () => {
  // Feed enough candles for the engine to plausibly open a position, wipe the
  // "opened" bookkeeping's visibility by asking for a window shorter than
  // any trade could realistically open+close within, and confirm nothing
  // fabricated leaks into the report (0 trades is an acceptable, honest
  // answer for too-short a window - not a crash or an invented entry).
  const US100 = loadCsv('data/backtest-input/US100.csv').slice(0, 2000);
  const report = await buildRecentPerformanceReport({ US100, US500: [], XAUUSD: [] }, { days: 0.001 });
  assert.equal(report.trades.length, 0);
});
