import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTradeLogClient, toTradeRow, logClosedTrade, fetchPerformanceBySymbol } from '../src/dataSources/supabaseTradeLog.js';

const silentLog = { warn() {} };

// A minimal stand-in for supabase-js's chainable/thenable query builder -
// real network calls have no place in a unit test, and supabase-js's own
// client is a thin wrapper we don't need to re-test.
function fakeClient({ insertError = null, selectResult = { data: [], error: null } } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      assert.equal(table, 'bot_trade_events');
      return {
        insert: async (row) => {
          inserted.push(row);
          return { error: insertError };
        },
        select: () => {
          const filters = {};
          const builder = {
            filters,
            order: () => builder,
            gte: (col, val) => {
              filters.gte = { col, val };
              return builder;
            },
            then: (resolve, reject) => Promise.resolve(selectResult).then(resolve, reject),
          };
          return builder;
        },
      };
    },
  };
}

test('createTradeLogClient: returns null when not configured (persistence is opt-in)', () => {
  assert.equal(createTradeLogClient({ url: undefined, serviceKey: undefined }), null);
  assert.equal(createTradeLogClient({ url: 'https://x.supabase.co', serviceKey: undefined }), null);
  assert.equal(createTradeLogClient({ url: undefined, serviceKey: 'k' }), null);
});

test('createTradeLogClient: returns a real client when both url and key are given', () => {
  const client = createTradeLogClient({ url: 'https://x.supabase.co', serviceKey: 'k' });
  assert.ok(client);
  assert.equal(typeof client.from, 'function');
});

test('toTradeRow: maps a resolved-trade shape (same one recentPerformanceReport.js builds) to the DB row shape', () => {
  const row = toTradeRow({
    symbol: 'US500',
    source: 'fvg',
    direction: 'bearish',
    outcome: 'loss',
    rMultiple: -1,
    entryPrice: 6850.5,
    entryTime: 1767200000000,
    exitTime: 1767210000000,
  });
  assert.equal(row.symbol, 'US500');
  assert.equal(row.r_multiple, -1);
  assert.equal(row.entry_price, 6850.5);
  assert.equal(row.entry_time, new Date(1767200000000).toISOString());
  assert.equal(row.exit_time, new Date(1767210000000).toISOString());
});

test('toTradeRow: a timeout with no rMultiple becomes null, not undefined or NaN', () => {
  const row = toTradeRow({
    symbol: 'US100', source: 'divergence', direction: 'bullish', outcome: 'timeout', rMultiple: null,
    entryPrice: 19500, entryTime: 1, exitTime: 2,
  });
  assert.equal(row.r_multiple, null);
});

test('logClosedTrade: no-op when client is null (persistence disabled)', async () => {
  await logClosedTrade(null, { symbol: 'US100' }, { log: silentLog });
  // no throw is the assertion
});

test('logClosedTrade: inserts exactly one row shaped by toTradeRow', async () => {
  const client = fakeClient();
  await logClosedTrade(client, {
    symbol: 'XAUUSD', source: 'fvg', direction: 'bullish', outcome: 'win', rMultiple: 5,
    entryPrice: 2500, entryTime: 1, exitTime: 2,
  }, { log: silentLog });
  assert.equal(client.inserted.length, 1);
  assert.equal(client.inserted[0].symbol, 'XAUUSD');
  assert.equal(client.inserted[0].r_multiple, 5);
});

test('logClosedTrade: a DB error is swallowed and logged, never thrown (must not take down the live tick loop)', async () => {
  const warnings = [];
  const client = fakeClient({ insertError: { message: 'connection refused' } });
  await logClosedTrade(client, { symbol: 'US100', source: 'fvg', direction: 'bullish', outcome: 'loss', rMultiple: -1, entryPrice: 1, entryTime: 1, exitTime: 2 }, {
    log: { warn: (...a) => warnings.push(a.join(' ')) },
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /connection refused/);
});

test('logClosedTrade: a thrown network error is swallowed too', async () => {
  const warnings = [];
  const client = { from: () => ({ insert: async () => { throw new Error('ECONNRESET'); } }) };
  await logClosedTrade(client, { symbol: 'US100', source: 'fvg', direction: 'bullish', outcome: 'loss', rMultiple: -1, entryPrice: 1, entryTime: 1, exitTime: 2 }, {
    log: { warn: (...a) => warnings.push(a.join(' ')) },
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ECONNRESET/);
});

test('fetchPerformanceBySymbol: not configured (null client) returns an explicit reason, not a throw', async () => {
  const result = await fetchPerformanceBySymbol(null);
  assert.deepEqual(result.bySymbol, {});
  assert.deepEqual(result.bySource, {});
  assert.equal(result.overall, null);
  assert.deepEqual(result.equityCurve, []);
  assert.equal(result.reason, 'not configured');
});

test('fetchPerformanceBySymbol: aggregates wins/losses/timeouts and totalR per symbol', async () => {
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, exit_time: '2026-09-01T00:00:00Z' },
        { symbol: 'US500', source: 'fvg', outcome: 'loss', r_multiple: -1, exit_time: '2026-09-02T00:00:00Z' },
        { symbol: 'US500', source: 'divergence', outcome: 'loss', r_multiple: -1, exit_time: '2026-09-03T00:00:00Z' },
        { symbol: 'XAUUSD', source: 'fvg', outcome: 'timeout', r_multiple: null, exit_time: '2026-09-04T00:00:00Z' },
      ],
      error: null,
    },
  });
  const { bySymbol } = await fetchPerformanceBySymbol(client);
  assert.equal(bySymbol.US500.wins, 1);
  assert.equal(bySymbol.US500.losses, 2);
  assert.equal(bySymbol.US500.totalR, 3); // 5 - 1 - 1
  assert.equal(bySymbol.US500.winRatePct, Math.round((1 / 3) * 1000) / 10);
  assert.equal(bySymbol.XAUUSD.timeouts, 1);
  assert.equal(bySymbol.XAUUSD.winRatePct, null); // no decided trades yet
});

test('fetchPerformanceBySymbol: aggregates the same rows by strategy source, independent of symbol grouping', async () => {
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, exit_time: '2026-09-01T00:00:00Z' },
        { symbol: 'XAUUSD', source: 'fvg', outcome: 'loss', r_multiple: -1, exit_time: '2026-09-02T00:00:00Z' },
        { symbol: 'US500', source: 'divergence', outcome: 'win', r_multiple: 3, exit_time: '2026-09-03T00:00:00Z' },
      ],
      error: null,
    },
  });
  const { bySource } = await fetchPerformanceBySymbol(client);
  assert.equal(bySource.fvg.wins, 1);
  assert.equal(bySource.fvg.losses, 1);
  assert.equal(bySource.fvg.totalR, 4);
  assert.equal(bySource.divergence.wins, 1);
  assert.equal(bySource.divergence.totalR, 3);
});

test('fetchPerformanceBySymbol: overall/equityCurve reuse summarizeTrades() math in chronological (oldest-first) order', async () => {
  // Query itself returns most-recent-first (matches the real .order('exit_time', {ascending:false})
  // used everywhere else in this file) - the function must reverse this internally.
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'loss', r_multiple: -1, exit_time: '2026-09-03T00:00:00Z' },
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 3, exit_time: '2026-09-02T00:00:00Z' },
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, exit_time: '2026-09-01T00:00:00Z' },
      ],
      error: null,
    },
  });
  const { overall, equityCurve } = await fetchPerformanceBySymbol(client);
  assert.equal(overall.totalSignals, 3);
  assert.equal(overall.finalEquityR, 7); // 5 + 3 - 1
  assert.equal(equityCurve.length, 3);
  // oldest trade (exit_time 09-01, +5R) resolved first
  assert.equal(equityCurve[0].time, '2026-09-01T00:00:00Z');
  assert.equal(equityCurve[0].cumulativeR, 5);
  assert.equal(equityCurve[1].time, '2026-09-02T00:00:00Z');
  assert.equal(equityCurve[1].cumulativeR, 8);
  assert.equal(equityCurve[2].time, '2026-09-03T00:00:00Z');
  assert.equal(equityCurve[2].cumulativeR, 7);
});

test('fetchPerformanceBySymbol: a query error surfaces as a reason rather than throwing or silently returning empty', async () => {
  const client = fakeClient({ selectResult: { data: null, error: { message: 'relation does not exist' } } });
  const { bySymbol, bySource, overall, equityCurve, reason } = await fetchPerformanceBySymbol(client);
  assert.deepEqual(bySymbol, {});
  assert.deepEqual(bySource, {});
  assert.equal(overall, null);
  assert.deepEqual(equityCurve, []);
  assert.match(reason, /relation does not exist/);
});

test('fetchPerformanceBySymbol: passing days applies a gte filter on exit_time', async () => {
  const client = fakeClient({ selectResult: { data: [], error: null } });
  let capturedFilters;
  const originalFrom = client.from.bind(client);
  client.from = (table) => {
    const built = originalFrom(table);
    const originalSelect = built.select;
    built.select = (...args) => {
      const q = originalSelect(...args);
      capturedFilters = q.filters;
      return q;
    };
    return built;
  };
  await fetchPerformanceBySymbol(client, { days: 30 });
  assert.ok(capturedFilters.gte);
  assert.equal(capturedFilters.gte.col, 'exit_time');
});
