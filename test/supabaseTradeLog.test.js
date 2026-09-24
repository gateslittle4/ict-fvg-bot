import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTradeLogClient, toTradeRow, logClosedTrade, fetchPerformanceBySymbol, fetchRecentTradeRows, enrichTradesWithRMultiple, enrichTradesWithSlippage } from '../src/dataSources/supabaseTradeLog.js';

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

test('toTradeRow: carries pnlUsd/balanceAfter through as pnl_usd/balance_after (Esdras: "calendrier... chiffre brut et %")', () => {
  const row = toTradeRow({
    symbol: 'US500', source: 'fvg', direction: 'bearish', outcome: 'loss', rMultiple: -1,
    entryPrice: 6850.5, entryTime: 1, exitTime: 2, pnlUsd: -49.5, balanceAfter: 9950.5,
  });
  assert.equal(row.pnl_usd, -49.5);
  assert.equal(row.balance_after, 9950.5);
});

test('toTradeRow: pnlUsd/balanceAfter default to null when omitted (a row logged before those columns existed)', () => {
  const row = toTradeRow({
    symbol: 'US500', source: 'fvg', direction: 'bearish', outcome: 'loss', rMultiple: -1,
    entryPrice: 6850.5, entryTime: 1, exitTime: 2,
  });
  assert.equal(row.pnl_usd, null);
  assert.equal(row.balance_after, null);
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

// BUG FOUND 2026-09-18 ("regarde le journal des trades"): this used to pass
// `rMultiple: row.r_multiple ?? 0` into summarizeTrades() - a row whose
// r_multiple is genuinely unknown (a real, reachable case - see
// toTradeRow/cTraderDataSource.js's _handleExecutionEvent, which logs
// `rMultiple: null` whenever riskAmount was 0) got silently counted as an
// invented 0R, diluting overall.avgR/expectancyR toward zero (the figure
// shown as "Espérance" on the journal page and as the dashboard hero
// banner's totalR) - a real inconsistency with journal.html's OWN per-trade
// list, which already excludes unknown-R trades from its own average.
test('fetchPerformanceBySymbol: a row with an unknown r_multiple (null) does not dilute overall.avgR/expectancyR', async () => {
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'loss', r_multiple: -1, exit_time: '2026-09-03T00:00:00Z' },
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: null, exit_time: '2026-09-02T00:00:00Z' }, // a real gap - riskAmount was 0 at close time
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, exit_time: '2026-09-01T00:00:00Z' },
      ],
      error: null,
    },
  });
  const { overall, equityCurve } = await fetchPerformanceBySymbol(client);
  // The bug: (5 + 0 + -1) / 3 = 1.333...R. The fix: (5 + -1) / 2 = 2R -
  // only the two trades with a REAL r_multiple count toward the average.
  assert.equal(overall.avgR, 2);
  assert.equal(overall.expectancyR, 2);
  assert.equal(overall.totalSignals, 3, 'still counted in the total - outcome is always known');
  // The unknown-R row is still a real equity-curve POINT (its own real
  // exit_time/entryTime/pnlUsd must still be there for the calendar/session
  // views) - it's a no-op step (cumulativeR unchanged from the point before
  // it), never an invented value.
  assert.equal(equityCurve.length, 3);
  assert.equal(equityCurve[1].cumulativeR, 5); // unchanged from equityCurve[0] - the unknown trade added nothing
});

// 2026-09-15 (Esdras: "stats par session") - a trade's ICT session
// (Asie/Londres/New York) is a property of when it was ENTERED, not when it
// closed, so equityCurve must carry entry_time alongside exit_time/cumulativeR.
test('fetchPerformanceBySymbol: equityCurve carries entryTime alongside time/cumulativeR, for session bucketing', async () => {
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, entry_time: '2026-09-01T08:30:00Z', exit_time: '2026-09-01T09:00:00Z' },
      ],
      error: null,
    },
  });
  const { equityCurve } = await fetchPerformanceBySymbol(client);
  assert.equal(equityCurve[0].entryTime, '2026-09-01T08:30:00Z');
  assert.equal(equityCurve[0].time, '2026-09-01T09:00:00Z');
});

// 2026-09-15 (Esdras: "calendrier des jours du mois... chiffre brut et %") -
// the calendar needs real $ figures, not just R-multiples.
test('fetchPerformanceBySymbol: equityCurve carries pnlUsd/balanceAfter when the DB has them', async () => {
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, entry_time: '2026-09-01T08:30:00Z', exit_time: '2026-09-01T09:00:00Z', pnl_usd: 247.5, balance_after: 10247.5 },
      ],
      error: null,
    },
  });
  const { equityCurve } = await fetchPerformanceBySymbol(client);
  assert.equal(equityCurve[0].pnlUsd, 247.5);
  assert.equal(equityCurve[0].balanceAfter, 10247.5);
});

test('fetchPerformanceBySymbol: equityCurve.pnlUsd/balanceAfter default to null on rows logged before those columns existed', async () => {
  const client = fakeClient({
    selectResult: {
      data: [
        { symbol: 'US500', source: 'fvg', outcome: 'win', r_multiple: 5, entry_time: '2026-09-01T08:30:00Z', exit_time: '2026-09-01T09:00:00Z' },
      ],
      error: null,
    },
  });
  const { equityCurve } = await fetchPerformanceBySymbol(client);
  assert.equal(equityCurve[0].pnlUsd, null);
  assert.equal(equityCurve[0].balanceAfter, null);
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

// 2026-09-15 (Esdras: "toute information nécessaire pour un vrai journal,
// le nombre de RRR etc") - cTrader's own deal history has no concept of
// "risk amount" once a position is closed, so the real per-trade journal
// (driven by that deal history, for its chart context) can only ever learn
// its R-multiple by joining against the durable journal, which computed it
// at close time. These tests cover that join in isolation.
test('enrichTradesWithRMultiple: matches a broker trade to its durable row by symbol + close exit time, attaches rMultiple', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000, pnl: 50 }];
  const durableRows = [{ symbol: 'US100', exitTime: 1000500, rMultiple: 2.3 }]; // 500ms apart - real processing latency
  const [enriched] = enrichTradesWithRMultiple(brokerTrades, durableRows);
  assert.equal(enriched.rMultiple, 2.3);
  assert.equal(enriched.symbol, 'US100'); // rest of the trade untouched
  assert.equal(enriched.pnl, 50);
});

test('enrichTradesWithRMultiple: carries the stop/target the bot set (for the journal chart), null when unmatched', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }, { symbol: 'GER40', exitTime: 1000000 }];
  const durableRows = [{ symbol: 'US100', exitTime: 1000200, rMultiple: -1, stopPrice: 30234.4, targetPrice: 30264.4 }];
  const [us, ger] = enrichTradesWithRMultiple(brokerTrades, durableRows);
  assert.equal(us.stopPrice, 30234.4); assert.equal(us.targetPrice, 30264.4);
  assert.equal(ger.stopPrice, null); assert.equal(ger.targetPrice, null);
});

test('enrichTradesWithRMultiple: a durable row on a DIFFERENT symbol never matches, even at the exact same time', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }];
  const durableRows = [{ symbol: 'XAUUSD', exitTime: 1000000, rMultiple: 3 }];
  const [enriched] = enrichTradesWithRMultiple(brokerTrades, durableRows);
  assert.equal(enriched.rMultiple, null);
});

test('enrichTradesWithRMultiple: outside the tolerance window, no match - rMultiple stays null rather than guessing', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }];
  const durableRows = [{ symbol: 'US100', exitTime: 1000000 + 60000, rMultiple: 3 }]; // 60s apart, default tolerance is 30s
  const [enriched] = enrichTradesWithRMultiple(brokerTrades, durableRows);
  assert.equal(enriched.rMultiple, null);
});

test('enrichTradesWithRMultiple: with several candidates on the same symbol, picks the CLOSEST one in time', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }];
  const durableRows = [
    { symbol: 'US100', exitTime: 1000000 - 20000, rMultiple: 1 }, // 20s before
    { symbol: 'US100', exitTime: 1000000 + 2000, rMultiple: 2.5 }, // 2s after - closest
    { symbol: 'US100', exitTime: 1000000 + 25000, rMultiple: 3 }, // 25s after
  ];
  const [enriched] = enrichTradesWithRMultiple(brokerTrades, durableRows);
  assert.equal(enriched.rMultiple, 2.5);
});

test('enrichTradesWithRMultiple: each durable row is used at most once - two broker trades never both claim the same durable row', () => {
  const brokerTrades = [
    { symbol: 'US100', exitTime: 1000000 },
    { symbol: 'US100', exitTime: 1000100 }, // very close to the trade above
  ];
  const durableRows = [{ symbol: 'US100', exitTime: 1000050, rMultiple: 4 }]; // only ONE durable row for TWO broker trades
  const enriched = enrichTradesWithRMultiple(brokerTrades, durableRows);
  const matched = enriched.filter((t) => t.rMultiple !== null);
  assert.equal(matched.length, 1, 'only one of the two broker trades should claim the single durable row');
});

test('enrichTradesWithRMultiple: an empty durable list leaves every trade with rMultiple: null, not a throw', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }];
  const enriched = enrichTradesWithRMultiple(brokerTrades, []);
  assert.equal(enriched[0].rMultiple, null);
});

// 2026-09-15 (Esdras: "preuve visuelle de conformité") - the compliance
// checklist's risk-check item needs the real $ pnl and balance, joined the
// same way as rMultiple already was.
test('enrichTradesWithRMultiple: also attaches pnlUsd/balanceAfter from the matched durable row', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }];
  const durableRows = [{ symbol: 'US100', exitTime: 1000500, rMultiple: 2.3, pnlUsd: 115, balanceAfter: 10115 }];
  const [enriched] = enrichTradesWithRMultiple(brokerTrades, durableRows);
  assert.equal(enriched.pnlUsd, 115);
  assert.equal(enriched.balanceAfter, 10115);
});

test('enrichTradesWithRMultiple: no match leaves pnlUsd/balanceAfter null, not undefined or a throw', () => {
  const brokerTrades = [{ symbol: 'US100', exitTime: 1000000 }];
  const enriched = enrichTradesWithRMultiple(brokerTrades, []);
  assert.equal(enriched[0].pnlUsd, null);
  assert.equal(enriched[0].balanceAfter, null);
});

test('fetchRecentTradeRows: maps pnl_usd/balance_after to pnlUsd/balanceAfter', async () => {
  const client = fakeClient({
    selectResult: {
      data: [{ symbol: 'US100', source: 'fvg', direction: 'bullish', outcome: 'win', r_multiple: 5, entry_price: 19500, entry_time: '2026-09-01T08:30:00Z', exit_time: '2026-09-01T09:00:00Z', pnl_usd: 247.5, balance_after: 10247.5 }],
      error: null,
    },
  });
  const [row] = await fetchRecentTradeRows(client);
  assert.equal(row.pnlUsd, 247.5);
  assert.equal(row.balanceAfter, 10247.5);
});

test('fetchRecentTradeRows: pnl_usd/balance_after default to null on rows logged before those columns existed', async () => {
  const client = fakeClient({
    selectResult: {
      data: [{ symbol: 'US100', source: 'fvg', direction: 'bullish', outcome: 'win', r_multiple: 5, entry_price: 19500, entry_time: '2026-09-01T08:30:00Z', exit_time: '2026-09-01T09:00:00Z' }],
      error: null,
    },
  });
  const [row] = await fetchRecentTradeRows(client);
  assert.equal(row.pnlUsd, null);
  assert.equal(row.balanceAfter, null);
});

// 2026-09-15 (Esdras: "qualité d'exécution") - same join shape as
// enrichTradesWithRMultiple, but comparing the durable journal's entryPrice
// (what the SIGNAL targeted) to the broker trade's own entryPrice (the REAL
// fill) to measure slippage. Positive slippage always means "cost" (a worse
// fill), negative always means "favorable" - regardless of direction.
test('enrichTradesWithSlippage: a bullish trade filled WORSE (higher) than the signal price is a positive (cost) slippage', () => {
  const brokerTrades = [{ symbol: 'US100', direction: 'bullish', entryPrice: 19510, exitTime: 1000000 }];
  const durableRows = [{ symbol: 'US100', entryPrice: 19500, exitTime: 1000500 }];
  const [enriched] = enrichTradesWithSlippage(brokerTrades, durableRows);
  assert.equal(enriched.signalEntryPrice, 19500);
  assert.equal(enriched.slippage, 10);
});

test('enrichTradesWithSlippage: a bullish trade filled BETTER (lower) than the signal price is a negative (favorable) slippage', () => {
  const brokerTrades = [{ symbol: 'US100', direction: 'bullish', entryPrice: 19490, exitTime: 1000000 }];
  const durableRows = [{ symbol: 'US100', entryPrice: 19500, exitTime: 1000500 }];
  const [enriched] = enrichTradesWithSlippage(brokerTrades, durableRows);
  assert.equal(enriched.slippage, -10);
});

test('enrichTradesWithSlippage: a bearish (sell) trade filled WORSE (lower) than the signal price is a positive (cost) slippage - sign flips vs bullish', () => {
  const brokerTrades = [{ symbol: 'XAUUSD', direction: 'bearish', entryPrice: 2495, exitTime: 1000000 }];
  const durableRows = [{ symbol: 'XAUUSD', entryPrice: 2500, exitTime: 1000500 }];
  const [enriched] = enrichTradesWithSlippage(brokerTrades, durableRows);
  assert.equal(enriched.slippage, 5); // sold 5 lower than intended = cost
});

test('enrichTradesWithSlippage: a bearish trade filled BETTER (higher) than the signal price is a negative (favorable) slippage', () => {
  const brokerTrades = [{ symbol: 'XAUUSD', direction: 'bearish', entryPrice: 2505, exitTime: 1000000 }];
  const durableRows = [{ symbol: 'XAUUSD', entryPrice: 2500, exitTime: 1000500 }];
  const [enriched] = enrichTradesWithSlippage(brokerTrades, durableRows);
  assert.equal(enriched.slippage, -5);
});

test('enrichTradesWithSlippage: a durable row on a different symbol never matches, slippage stays null', () => {
  const brokerTrades = [{ symbol: 'US100', direction: 'bullish', entryPrice: 19500, exitTime: 1000000 }];
  const durableRows = [{ symbol: 'XAUUSD', entryPrice: 2500, exitTime: 1000000 }];
  const [enriched] = enrichTradesWithSlippage(brokerTrades, durableRows);
  assert.equal(enriched.signalEntryPrice, null);
  assert.equal(enriched.slippage, null);
});

test('enrichTradesWithSlippage: outside the tolerance window, no match - slippage stays null rather than guessing', () => {
  const brokerTrades = [{ symbol: 'US100', direction: 'bullish', entryPrice: 19510, exitTime: 1000000 }];
  const durableRows = [{ symbol: 'US100', entryPrice: 19500, exitTime: 1000000 + 60000 }];
  const [enriched] = enrichTradesWithSlippage(brokerTrades, durableRows);
  assert.equal(enriched.slippage, null);
});

test('enrichTradesWithSlippage: each durable row is used at most once', () => {
  const brokerTrades = [
    { symbol: 'US100', direction: 'bullish', entryPrice: 19510, exitTime: 1000000 },
    { symbol: 'US100', direction: 'bullish', entryPrice: 19520, exitTime: 1000100 },
  ];
  const durableRows = [{ symbol: 'US100', entryPrice: 19500, exitTime: 1000050 }];
  const enriched = enrichTradesWithSlippage(brokerTrades, durableRows);
  const matched = enriched.filter((t) => t.slippage !== null);
  assert.equal(matched.length, 1, 'only one of the two broker trades should claim the single durable row');
});

test('enrichTradesWithSlippage: an empty durable list leaves every trade with slippage: null, not a throw', () => {
  const brokerTrades = [{ symbol: 'US100', direction: 'bullish', entryPrice: 19510, exitTime: 1000000 }];
  const enriched = enrichTradesWithSlippage(brokerTrades, []);
  assert.equal(enriched[0].slippage, null);
});
