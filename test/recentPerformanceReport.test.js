import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildRecentPerformanceReport } from '../src/backtest/recentPerformanceReport.js';
import { LiveStrategyEngine } from '../src/liveStrategyEngine.js';
import { GuardrailEngine } from '../src/engines/guardrailEngine.js';
import { CONFIG } from '../src/config.js';

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

// Regression guard for the 2026-09-09 production outage (see HANDOFF.md and
// recentPerformanceReport.js's own comment): this report used to call
// ingestCandle() once per candle - O(n^2), which pegged Render's 0.15 CPU
// indefinitely and took the whole service down. It was migrated to the
// single-pass warmUp({ onEvent }) path. The speedup only matters if the
// OUTPUT is unchanged, so this pins that explicitly rather than trusting it.
test('warmUp-based report is byte-identical to the old per-candle ingestCandle() replay it replaced', async () => {
  const N = 2000; // enough to produce real trades; small enough that the reference O(n^2) loop below still finishes fast
  const historyBySymbol = {
    US100: loadCsv('data/backtest-input/US100.csv').slice(0, N),
    US500: loadCsv('data/backtest-input/US500.csv').slice(0, N),
    XAUUSD: loadCsv('data/backtest-input/XAUUSD.csv').slice(0, N),
  };

  // Reference implementation: the exact loop this file used to run.
  const engine = new LiveStrategyEngine({
    symbols: CONFIG.symbols,
    fvgConfig: CONFIG.fvg.perSymbol,
    divergenceConfig: CONFIG.divergence,
    guardrail: new GuardrailEngine({}),
  });
  const windowMs = 90 * 24 * 60 * 60 * 1000;
  const openById = new Map();
  const referenceTrades = [];
  for (const symbol of CONFIG.symbols) {
    const all = historyBySymbol[symbol];
    const latestTime = all[all.length - 1].time;
    for (const candle of all.filter((c) => c.time >= latestTime - windowMs)) {
      for (const e of engine.ingestCandle(symbol, candle)) {
        if (e.type === 'validated' && !e.blockedReason) openById.set(e.id, e);
        if (e.type === 'closed') {
          const opened = openById.get(e.id);
          if (!opened) continue;
          openById.delete(e.id);
          referenceTrades.push({
            symbol,
            source: opened.source,
            direction: opened.direction,
            entryPrice: opened.entryPrice,
            entryTime: opened.validatedAt,
            exitTime: e.exitTime,
            outcome: e.outcome,
            rMultiple: e.outcome === 'win' ? opened.rrMultiple : e.outcome === 'loss' ? -1 : null,
          });
        }
      }
    }
  }
  referenceTrades.sort((a, b) => b.exitTime - a.exitTime);

  const report = await buildRecentPerformanceReport(historyBySymbol, { days: 90 });
  assert.ok(referenceTrades.length > 0, 'fixture must produce at least one trade, or this comparison is vacuous');
  assert.deepEqual(report.trades, referenceTrades);
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
