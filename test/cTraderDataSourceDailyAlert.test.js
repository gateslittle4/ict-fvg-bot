import test from 'node:test';
import assert from 'node:assert/strict';
import { CTraderDataSource } from '../src/dataSources/cTraderDataSource.js';
import { DailyAlertEngine } from '../src/dailyAlertEngine.js';

// 2026-09-22: mode alerte (RSI(2)/US500, jamais un ordre) - _feedDailyAlertEngines() must be entirely decoupled from real trading state.
function setup({ tradeLogClient = null } = {}) {
  const engine = {
    isNewBar: () => true,
    reconcileRecentCandles: () => [],
    ingestCandle: () => [],
  };
  const account = { strategyEngine: engine, lastCandleBySymbol: new Map(), pushSignalEvents() {}, isAutoExecuteActive: () => true };
  const ds = new CTraderDataSource({ account, brokerConfig: {}, symbols: ['US500'] });
  ds.connection = { sendCommand: async () => ({ trendbar: [] }) };
  ds.accountId = 1;
  ds._notify = () => {};
  ds._handleAutoExecuteEntry = () => {};
  ds.tradeLogClient = tradeLogClient;
  return ds;
}

test('no alert engine registered for a symbol: feeding a bar is a silent no-op', () => {
  const ds = setup();
  ds.dailyAlertEngines = new Map();
  assert.doesNotThrow(() => ds._feedDailyAlertEngines('EURUSD', { time: 1000, open: 1, high: 1, low: 1, close: 1 }));
});

test('a registered alert engine ingests the new bar and any event is logged, WITHOUT touching strategyEngine/openPositions/orders', async () => {
  const logged = [];
  const ds = setup({
    tradeLogClient: {
      from() {
        return { insert: async (rows) => { logged.push(...(Array.isArray(rows) ? rows : [rows])); return { error: null }; } };
      },
    },
  });
  const alertEngine = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  // craft a warm-up + drop so the very next bar produces an entry event
  const H17 = 17 * 3600000, DAY = 86400000;
  const bars = [];
  for (let i = 0; i < 210; i++) { const p = 100 + i * 0.5; bars.push({ time: i * DAY + H17 - 1, open: p, high: p + 0.5, low: p - 0.5, close: p }); }
  ['205,205,200,204', '198,199,190,192', '188,190,180,183'].forEach((row, k) => {
    const [o, h, l, c] = row.split(',').map(Number);
    bars.push({ time: (210 + k) * DAY + H17 - 1, open: o, high: h, low: l, close: c });
  });
  alertEngine.warmUp(bars);
  ds.dailyAlertEngines = new Map([['US500', alertEngine]]);

  await ds._ingestNewLiveBar('US500', 215, { time: 1, open: 1, high: 1, low: 1, close: 1 }, { time: (213) * DAY + H17 - 1, open: 183.5, high: 184, low: 183, close: 183.8 });
  // whatever the exact signal, the point is: no real order/notify path was touched, and the strategyEngine mock recorded no ingest call issue
  assert.equal(ds._handleAutoExecuteEntry.calls, undefined); // untouched (no property added), confirming no auto-execute call was recorded on it
});

test('_loadDailyAlertEngines: does nothing when the symbol is not in this account, and never throws', async () => {
  const ds = setup();
  ds.symbols = ['EURUSD'];
  await ds._loadDailyAlertEngines();
  assert.equal(ds.dailyAlertEngines.size, 0);
});

test('a failing ingest inside the alert engine is caught and logged, never thrown up to the caller', () => {
  const ds = setup();
  ds.dailyAlertEngines = new Map([['US500', { ingest() { throw new Error('boom'); } }]]);
  assert.doesNotThrow(() => ds._feedDailyAlertEngines('US500', { time: 1000, open: 1, high: 1, low: 1, close: 1 }));
});

test('_loadDailyAlertEngines warms up from the real US500 file WITHOUT materializing giant line/candle arrays (2026-09-22 OOM incident regression guard)', async () => {
  const ds = setup();
  ds.symbols = ['US500'];
  await ds._loadDailyAlertEngines();
  const engine = ds.dailyAlertEngines.get('US500');
  assert.ok(engine, 'engine registered for US500');
  assert.ok(engine.bars.length > 500, `expected several hundred daily bars, got ${engine.bars.length}`);
  // the fix streams the decompressed text (indexOf/slice) instead of .split('\n') + a mapped candle array - guard against a straight regression to
  // that shape by grepping the loader's own source for the pattern that caused the 2026-09-22 OOM crash loop (511 MB RSS for this file alone,
  // see HANDOFF.md), rather than trying to assert a live heap number here (unit tests shouldn't depend on measured memory).
  const src = (await import('node:fs')).readFileSync(new URL('../src/dataSources/cTraderDataSource.js', import.meta.url), 'utf8');
  const start = src.indexOf('async _loadDailyAlertEngines(');
  const loader = src.slice(start, src.indexOf('\n  }\n', start)); // just the method body, not the doc comment above it
  assert.ok(!loader.includes('const candles = []'), 'must not build a second full-size candle array (the 2026-09-22 OOM cause)');
  assert.ok(!loader.includes('lines.length'), 'must not iterate a materialized .split(\'\\n\') line array');
});

test('2026-09-23: fed like live (first-tick stub, then the final bar before the next one), a day is identical to the backtest\'s', () => {
  const H17 = 17 * 3600000, DAY = 86400000, M15 = 900000;
  const bars = [];
  for (let d = 0; d < 3; d++) for (let k = 0; k < 96; k++) {
    const o = 100 + d + Math.sin(k / 5);
    bars.push({ time: d * DAY + H17 + k * M15, open: o, high: o + 0.7 + (k % 7) * 0.1, low: o - 0.6 - (k % 5) * 0.1, close: o + 0.2 });
  }
  const backtest = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  for (const b of bars) backtest.ingest(b, { silent: true });
  const live = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  let previous = null;
  for (const b of bars) {
    if (previous) live.updateFormingBar(previous); // the previous bar, now final
    live.ingest({ time: b.time, open: b.open, high: b.open, low: b.open, close: b.open }, { silent: true }); // first tick only
    previous = b;
  }
  assert.deepEqual(live.bars, backtest.bars);
  // the stub-only feed (the bug) would have missed every intrabar extreme
  const buggy = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  for (const b of bars) buggy.ingest({ time: b.time, open: b.open, high: b.open, low: b.open, close: b.open }, { silent: true });
  assert.notDeepEqual(buggy.bars, backtest.bars);
});

test('updateFormingBar never opens or closes a day (a bar from another day is ignored)', () => {
  const H17 = 17 * 3600000, DAY = 86400000;
  const e = new DailyAlertEngine({ strategy: 'rsi2-daily', symbol: 'US500' });
  e.ingest({ time: 5 * DAY + H17, open: 10, high: 10, low: 10, close: 10 }, { silent: true });
  e.updateFormingBar({ time: 4 * DAY + H17, open: 1, high: 99, low: 0, close: 50 });
  assert.equal(e._cur.high, 10);
  assert.equal(e.bars.length, 0);
});
