import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairDealsIntoTrades, summarizeTrades, parseSourceFromLabel } from '../src/dataSources/dealPairing.js';

function opening({ positionId, symbolId = 1, tradeSide = 'BUY', executionPrice = 100, executionTimestamp = 1000, orderId }) {
  return { positionId, symbolId, tradeSide, executionPrice, executionTimestamp, orderId, dealStatus: 'FILLED' };
}
function closing({ positionId, symbolId = 1, tradeSide = 'SELL', executionPrice = 110, executionTimestamp = 2000, grossProfit = 500 }) {
  return {
    positionId,
    symbolId,
    tradeSide,
    executionPrice,
    executionTimestamp,
    dealStatus: 'FILLED',
    closePositionDetail: { grossProfit },
  };
}

test('pairs a simple opening+closing deal into one closed trade', () => {
  const deals = [opening({ positionId: 1 }), closing({ positionId: 1 })];
  const trades = pairDealsIntoTrades(deals);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].direction, 'bullish');
  assert.equal(trades[0].entryPrice, 100);
  assert.equal(trades[0].exitPrice, 110);
  assert.equal(trades[0].pnl, 5); // 500 cents -> $5
});

test('a SELL opening produces a bearish trade', () => {
  const deals = [opening({ positionId: 1, tradeSide: 'SELL' }), closing({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals)[0].direction, 'bearish');
});

test('a position with only an opening deal (still open) is excluded', () => {
  const deals = [opening({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals).length, 0);
});

test('a position with only a closing deal (opening leg outside the fetch window) is excluded', () => {
  const deals = [closing({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals).length, 0);
});

test('multiple partial closing deals on the same position are summed into one journal entry', () => {
  const deals = [
    opening({ positionId: 1 }),
    closing({ positionId: 1, executionTimestamp: 1500, grossProfit: 200 }),
    closing({ positionId: 1, executionTimestamp: 2000, grossProfit: 300 }),
  ];
  const trades = pairDealsIntoTrades(deals);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].pnl, 5); // (200+300)/100
  assert.equal(trades[0].exitTime, 2000); // the LATEST partial close is used for exit price/time
});

test('rejected/missed deals are ignored', () => {
  const deals = [
    opening({ positionId: 1 }),
    { positionId: 1, dealStatus: 'REJECTED', closePositionDetail: { grossProfit: 999 } },
    closing({ positionId: 1 }),
  ];
  assert.equal(pairDealsIntoTrades(deals)[0].pnl, 5);
});

test('results are sorted newest-exit-first, across multiple positions', () => {
  const deals = [
    opening({ positionId: 1, executionTimestamp: 1000 }),
    closing({ positionId: 1, executionTimestamp: 2000 }),
    opening({ positionId: 2, executionTimestamp: 3000 }),
    closing({ positionId: 2, executionTimestamp: 4000 }),
  ];
  const trades = pairDealsIntoTrades(deals);
  assert.deepEqual(trades.map((t) => t.positionId), [2, 1]);
});

// 2026-09-13: real bug found live via the trade journal showing every trade
// as a "win" with a stuck "+0.00" net P&L and "Invalid Date" for
// entry/exit. Root cause: this broker serializes executionTimestamp and
// grossProfit as numeric STRINGS (confirmed via a raw ProtoOAExecutionEvent
// dump the same session), and `sum + (d.closePositionDetail.grossProfit ||
// 0)` used `+`, which string-concatenates instead of adding once
// grossProfit is a string - producing NaN once divided by 100, which
// JSON.stringify silently turns into `null` on the wire. `null >= 0` is
// TRUE in JS, so the dashboard's win-rate filter counted every trade as a
// win regardless of its real outcome, and summing `null` values always
// landed on exactly 0. entryTime/exitTime being raw strings also broke
// `new Date(...)` client-side. This test uses string fixtures (the real
// broker shape) instead of the plain-number fixtures every other test in
// this file uses, specifically to catch a regression of this exact bug.
test('pairDealsIntoTrades: handles this broker\'s REAL response shape - string executionTimestamp/grossProfit, not numbers', () => {
  const deals = [
    { positionId: 1, symbolId: 1, tradeSide: 'BUY', executionPrice: 100, executionTimestamp: '1000', dealStatus: 'FILLED' },
    {
      positionId: 1,
      symbolId: 1,
      tradeSide: 'SELL',
      executionPrice: 90,
      executionTimestamp: '2000',
      dealStatus: 'FILLED',
      closePositionDetail: { grossProfit: '-500' }, // a real LOSS, as a string - the exact shape that used to become a false "win"
    },
  ];
  const trades = pairDealsIntoTrades(deals);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].pnl, -5); // NOT null, NOT NaN, NOT a string - a real negative number
  assert.equal(typeof trades[0].pnl, 'number');
  assert.equal(trades[0].entryTime, 1000); // a real Number, not "1000" - new Date(1000) must be valid, new Date("1000") is NOT
  assert.equal(typeof trades[0].entryTime, 'number');
  assert.equal(trades[0].exitTime, 2000);
  assert.equal(typeof trades[0].exitTime, 'number');
});

test('empty/undefined input returns no trades', () => {
  assert.deepEqual(pairDealsIntoTrades([]), []);
  assert.deepEqual(pairDealsIntoTrades(undefined), []);
});

test('parseSourceFromLabel: recognizes each auto-executed source', () => {
  assert.equal(parseSourceFromLabel('auto-fvg-US100'), 'fvg');
  assert.equal(parseSourceFromLabel('auto-divergence-US500'), 'divergence');
  assert.equal(parseSourceFromLabel('auto-nwog-US100'), 'nwog');
  assert.equal(parseSourceFromLabel('auto-judaswing-EURUSD'), 'judaswing');
  assert.equal(parseSourceFromLabel('auto-weeklysweep-GER40'), 'weeklysweep');
  // 2026-09-16: added alongside the live Breaker Block mechanism - a real
  // gap found by inspection (the regex hadn't been updated when the source
  // was added), not a hypothetical - real broker orders were already being
  // labeled auto-breakerblock-GER40 but this parser didn't recognize it yet,
  // so those trades would have reconciled as source: null.
  assert.equal(parseSourceFromLabel('auto-breakerblock-GER40'), 'breakerblock');
  // 2026-09-18: same recurring failure mode as breakerblock above, found
  // AGAIN - CBDR went live on US100 today (liveStrategyEngine.js) but this
  // regex, and every downstream source-label site in the whole project,
  // was never updated. Real broker orders labeled auto-cbdr-US100 would
  // have reconciled as source: null exactly like breakerblock once did.
  assert.equal(parseSourceFromLabel('auto-cbdr-US100'), 'cbdr');
  assert.equal(parseSourceFromLabel('pyramid-add-US100'), 'pyramid');
});

test('parseSourceFromLabel: no label, empty label, or an unrecognized one all return null (never guessed)', () => {
  assert.equal(parseSourceFromLabel(undefined), null);
  assert.equal(parseSourceFromLabel(null), null);
  assert.equal(parseSourceFromLabel(''), null);
  assert.equal(parseSourceFromLabel('some manual comment'), null);
});

test('pairDealsIntoTrades: without an orderLabelsById map, source is null (never guessed)', () => {
  const deals = [opening({ positionId: 1, orderId: 42 }), closing({ positionId: 1 })];
  assert.equal(pairDealsIntoTrades(deals)[0].source, null);
});

test('pairDealsIntoTrades: looks up the OPENING deal\'s orderId in orderLabelsById to attach a source', () => {
  const deals = [opening({ positionId: 1, orderId: 42 }), closing({ positionId: 1 })];
  // String key - the real contract (see pairDealsIntoTrades' own JSDoc and
  // cTraderDataSource.js's getTradeHistory, which always builds this map
  // that way).
  const labels = new Map([['42', 'auto-divergence-US500']]);
  assert.equal(pairDealsIntoTrades(deals, labels)[0].source, 'divergence');
});

// BUG FOUND 2026-09-18 (execution-path audit continued, same class as the
// orderId map-key fix in cTraderDataSource.js): orderLabelsById is built from
// ProtoOAOrderListReq's response (getTradeHistory, cTraderDataSource.js) but
// looked up here with the OPENING DEAL's own orderId, which comes from a
// DIFFERENT message, ProtoOADealListReq. This broker is confirmed
// (repeatedly, this session) to serialize the same conceptual int64 field
// inconsistently as a string or a number depending on which message it came
// from - nothing here defended against that for orderId, unlike every other
// id comparison this session's audit already hardened (positionId, the two
// broker-confirmation maps). A silent mismatch here doesn't lose money, but
// it silently defeats the one thing this whole feature exists for
// ("aucun screenshot ne dit quelle stratégie a généré le trade") - AND
// degrades the compliance checklist for that trade (source: null -> cfg:
// null in _configForSource), which is a real, user-facing regression on a
// feature Esdras explicitly asked for.
test('pairDealsIntoTrades: matches the opening deal\'s orderId to orderLabelsById by numeric value, not strict type (string vs number orderId)', () => {
  // The deal's orderId as a NUMBER - this is the actual variable side: which
  // type ProtoOADealListReq happens to serialize orderId as is NOT under
  // this function's control. orderLabelsById itself is always String-keyed
  // by contract (its one real caller, cTraderDataSource.js, normalizes it) -
  // what this test locks in is that a deal orderId of a DIFFERENT type still
  // resolves correctly against that String-keyed map.
  const deals = [opening({ positionId: 1, orderId: 42 }), closing({ positionId: 1 })];
  const labels = new Map([['42', 'auto-divergence-US500']]);
  assert.equal(pairDealsIntoTrades(deals, labels)[0].source, 'divergence', 'must still attach the real source despite the string/number type difference');
});

test('pairDealsIntoTrades: an opening order missing from the label map (manual trade) gets source null', () => {
  const deals = [opening({ positionId: 1, orderId: 99 }), closing({ positionId: 1 })];
  const labels = new Map([['42', 'auto-fvg-US100']]); // a different order entirely, string-keyed per contract
  assert.equal(pairDealsIntoTrades(deals, labels)[0].source, null);
});

test('summarizeTrades: mix of wins and losses', () => {
  const summary = summarizeTrades([{ pnl: 10 }, { pnl: -5 }, { pnl: 3 }, { pnl: 0 }]);
  assert.equal(summary.count, 4);
  assert.equal(summary.wins, 3); // pnl >= 0 counts as a win, including breakeven
  assert.equal(summary.winRatePct, 75);
  assert.equal(summary.netPnl, 8);
});

test('summarizeTrades: no trades gives a null win rate, not NaN or a divide-by-zero', () => {
  const summary = summarizeTrades([]);
  assert.equal(summary.count, 0);
  assert.equal(summary.winRatePct, null);
  assert.equal(summary.netPnl, 0);
});

test('summarizeTrades: undefined input behaves like an empty list', () => {
  assert.deepEqual(summarizeTrades(undefined), { count: 0, wins: 0, winRatePct: null, netPnl: 0 });
});
